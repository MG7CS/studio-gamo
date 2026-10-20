/**
 * Gamo Live's payment settings in the admin (docs/LIVE_SCREENS.md C8, docs/LIVE_REQUIREMENTS.md §8 item 37): the
 * funds-flow default, the per-organization overrides, the Gamo fee (a change needs a reason and a confirm step that
 * shows the old and the new fee), door sales on or off platform-wide, and the history of these decisions. Also the
 * payments card of one organization's page. Every change is a domain call that records a decision with its reason.
 */
import { requireSameOrigin } from '@gamo/auth';
import type { GamoEnv } from '@gamo/config/env';
import {
  FUNDS_FLOW_DEFAULTS,
  MAX_FIXED_FEE_CENTS,
  MAX_PERCENT_FEE_BPS,
  PaidError,
  changeGamoFee,
  currentFeeSetting,
  feeHistory,
  formatCents,
  listAdminOrganizations,
  listPaymentDecisions,
  organizationPaymentsStatus,
  parseDollarsToCents,
  readOrganizationPayments,
  readPaymentSettings,
  setDoorSalesEnabled,
  setFundsFlowDefault,
  stripeModeOf,
  type FeeHistoryRow,
  type FundsFlow,
  type FundsFlowDefault,
  type PaidEnv,
  type PaymentDecisionRow,
  type PaymentSettings,
  type PaymentsStatus,
  type PaymentsUnavailableReason,
  type SqlDatabase,
} from '@gamo/domain';
import { asSqlDatabase } from '@gamo/domain/security';

export type SettingsOutcome =
  | { ok: true; location: string }
  | { ok: false; status: number; message: string; field?: 'reason' | 'fee_fixed' | 'fee_percent' };

const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};
const nowSeconds = () => Math.floor(Date.now() / 1000);
const paidEnv = (env: GamoEnv) => env as unknown as PaidEnv;

// ── Words ────────────────────────────────────────────────────────────────────────────────────────────────────

export const FUNDS_FLOW_LABELS: Record<FundsFlowDefault, string> = {
  not_chosen: 'Not chosen (card sales off)',
  organizer_account: 'Mode A: the organization’s own Stripe account',
  gamo_collects: 'Mode B: Gamo collects and pays out',
};

/** What each mode means, two plain sentences each, shown next to the choice. */
export const FUNDS_FLOW_EXPLAINED: Record<FundsFlowDefault, string> = {
  organizer_account:
    'Buyers pay the organization directly, on its own connected Stripe account. The organization is the seller and receives the money from Stripe.',
  gamo_collects:
    'Buyers pay Gamo Studios on behalf of the organization. Gamo holds the ticket money and pays it out to the organization after the event.',
  not_chosen:
    'No mode is chosen, so card sales stay off for every organization without its own override. Free registration, cash and comp tickets still work.',
};

export const NOT_READY_TEXT: Record<PaymentsUnavailableReason, string> = {
  mode_not_chosen: 'No funds-flow mode is chosen for it.',
  stripe_not_configured: 'Stripe is not configured here.',
  webhook_missing: 'The Stripe webhook secret is missing, so no payment could be confirmed.',
  connect_webhook_missing: 'The Stripe Connect webhook secret is missing (needed for Mode A).',
  account_missing: 'The organization has not connected a Stripe account yet.',
  account_not_ready: 'Its Stripe account is connected but cannot take payments or receive transfers yet.',
};

/** "2.5%" from 250 basis points. */
export function percentText(bps: number): string {
  const whole = Math.floor(bps / 100);
  const rest = bps % 100;
  return `${whole}${rest ? `.${String(rest).padStart(2, '0').replace(/0$/, '')}` : ''}%`;
}

/** "$0.50 + 2.5%", "$0.50", "2.5%" or "No fee". */
export function feeText(fee: { fixedCents: number; percentBps: number }): string {
  const parts = [
    fee.fixedCents > 0 ? formatCents(fee.fixedCents) : null,
    fee.percentBps > 0 ? percentText(fee.percentBps) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' + ') : 'No fee';
}

/** "2.5" or "2.5%" → 250 basis points; null for anything else (at most two decimals, never negative). */
export function parsePercentToBps(input: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?%?$/.exec(input.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

const SUBJECT_TEXT: Record<string, string> = {
  funds_flow_default: 'Funds-flow default',
  organization_override: 'Organization funds flow',
  door_sales: 'Door sales',
  fee: 'Gamo fee',
  payout: 'Payout',
};

function valueText(subject: string, value: string | null): string {
  if (value == null) return subject === 'organization_override' ? 'Platform default' : 'None';
  if (subject === 'funds_flow_default' || subject === 'organization_override')
    return FUNDS_FLOW_LABELS[value as FundsFlowDefault] ?? value;
  if (subject === 'door_sales') return value === 'on' ? 'On' : 'Off';
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (subject === 'fee')
      return feeText({ fixedCents: Number(parsed.fixedCents), percentBps: Number(parsed.percentBps) });
    if (subject === 'payout') {
      const amount = Number.isInteger(parsed.amountCents)
        ? `${formatCents(Number(parsed.amountCents))} `
        : '';
      return `${amount}${String(parsed.status ?? '')}`.trim();
    }
  } catch {
    return value;
  }
  return value;
}

export interface DecisionLine {
  id: string;
  subject: string;
  organizationName: string | null;
  change: string;
  reason: string;
  decidedAt: number;
}

/** A recorded payment decision in plain words: what changed, from what to what, and why. */
export function decisionLine(row: PaymentDecisionRow, names: ReadonlyMap<string, string>): DecisionLine {
  const from = valueText(row.subject, row.oldValue);
  const to = valueText(row.subject, row.newValue);
  return {
    id: row.id,
    subject: SUBJECT_TEXT[row.subject] ?? row.subject,
    organizationName: row.organizationId ? (names.get(row.organizationId) ?? null) : null,
    change: row.oldValue == null && row.subject === 'payout' ? to : `${from} → ${to}`,
    reason: row.reason,
    decidedAt: row.decidedAt,
  };
}

/** Whether payment actions can reach Stripe here, and what the screens say about test mode. */
export interface PaymentsConfig {
  /** Stripe (test keys) or the local stand-in is reachable. */
  configured: boolean;
  standin: boolean;
  /** Live keys are in use (only in production); payouts refuse to run then. */
  liveMode: boolean;
}

export function paymentsConfig(env: GamoEnv): PaymentsConfig {
  const mode = stripeModeOf(paidEnv(env));
  const key = typeof env.STRIPE_SECRET_KEY === 'string' ? env.STRIPE_SECRET_KEY.trim() : '';
  return {
    configured: mode !== 'none',
    standin: mode === 'standin',
    liveMode: mode === 'stripe' && /^(sk|rk)_live_/.test(key),
  };
}

// ── The settings screen ──────────────────────────────────────────────────────────────────────────────────────

export interface LiveSettingsView {
  settings: PaymentSettings;
  fee: { fixedCents: number; percentBps: number; effectiveAt: number };
  feeHistory: FeeHistoryRow[];
  overrides: Array<{ organizationId: string; name: string; flow: FundsFlow }>;
  decisions: DecisionLine[];
}

async function organizationNames(db: SqlDatabase): Promise<Map<string, string>> {
  return new Map((await listAdminOrganizations(db, { filter: 'all' })).map((o) => [o.id, o.name]));
}

/** Everything the Live settings screen shows, from real reads; null when Gamo Live's database cannot be read. */
export async function loadLiveSettings(env: GamoEnv, now = nowSeconds()): Promise<LiveSettingsView | null> {
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const [settings, fee, history, decisions, overrideDecisions, names] = await Promise.all([
      readPaymentSettings(db),
      currentFeeSetting(db, now),
      feeHistory(db),
      listPaymentDecisions(db, { limit: 100 }),
      listPaymentDecisions(db, { subject: 'organization_override', limit: 500 }),
      organizationNames(db),
    ]);
    // Every override was set through a recorded decision, so those organizations are the only candidates.
    const candidates = [
      ...new Set(overrideDecisions.map((d) => d.organizationId).filter(Boolean)),
    ] as string[];
    const overrides: LiveSettingsView['overrides'] = [];
    for (const id of candidates) {
      const payments = await readOrganizationPayments(db, id);
      if (payments?.fundsFlowOverride)
        overrides.push({ organizationId: id, name: names.get(id) ?? id, flow: payments.fundsFlowOverride });
    }
    overrides.sort((a, b) => a.name.localeCompare(b.name));
    return {
      settings,
      fee: { fixedCents: fee.fixedCents, percentBps: fee.percentBps, effectiveAt: fee.effectiveAt },
      feeHistory: history,
      overrides,
      decisions: decisions.map((d) => decisionLine(d, names)),
    };
  } catch (error) {
    console.error(`[admin] live settings unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

export type FeePreview =
  | { state: 'none' }
  | { state: 'error'; message: string; field: 'fee_fixed' | 'fee_percent' }
  | { state: 'same'; text: string }
  | {
      state: 'ready';
      fixedCents: number;
      percentBps: number;
      oldText: string;
      newText: string;
    };

/**
 * The fee change the admin is about to confirm, from the "Review the change" GET form (`fee_fixed` in dollars,
 * `fee_percent` in percent). The confirm step shows the old and new fee before anything is saved.
 */
export function feeChangePreview(
  params: URLSearchParams,
  current: { fixedCents: number; percentBps: number },
): FeePreview {
  if (!params.has('fee_fixed') && !params.has('fee_percent')) return { state: 'none' };
  const fixedRaw = (params.get('fee_fixed') ?? '').trim() || '0';
  const percentRaw = (params.get('fee_percent') ?? '').trim() || '0';
  const fixedCents = parseDollarsToCents(fixedRaw);
  if (fixedCents === null || fixedCents > MAX_FIXED_FEE_CENTS)
    return {
      state: 'error',
      message: `Enter the fixed part in dollars, from $0.00 to ${formatCents(MAX_FIXED_FEE_CENTS)}.`,
      field: 'fee_fixed',
    };
  const percentBps = parsePercentToBps(percentRaw);
  if (percentBps === null || percentBps > MAX_PERCENT_FEE_BPS)
    return {
      state: 'error',
      message: `Enter the percent part from 0 to ${percentText(MAX_PERCENT_FEE_BPS)}, with at most two decimals.`,
      field: 'fee_percent',
    };
  if (fixedCents === current.fixedCents && percentBps === current.percentBps)
    return { state: 'same', text: feeText(current) };
  return {
    state: 'ready',
    fixedCents,
    percentBps,
    oldText: feeText(current),
    newText: feeText({ fixedCents, percentBps }),
  };
}

const SETTINGS_DONE: Record<string, string> = {
  flow_default: 'Funds-flow default changed.',
  fee: 'Gamo fee changed. It applies to new orders; tickets already sold keep their fee.',
  door_on: 'Door sales are on platform-wide.',
  door_off: 'Door sales are off platform-wide.',
  same: 'Nothing changed: that was already the setting.',
};

export function settingsOutcomeFrom(url: URL): string | null {
  const done = url.searchParams.get('done');
  return done && Object.hasOwn(SETTINGS_DONE, done) ? SETTINGS_DONE[done] : null;
}

function settingsFailure(error: unknown): SettingsOutcome {
  if (error instanceof PaidError && error.code === 'invalid') {
    if (error.detail === 'reason')
      return {
        ok: false,
        status: 400,
        message: 'Add a reason (at most 500 characters). It is kept with the decision.',
        field: 'reason',
      };
    if (error.detail === 'fixed_cents')
      return {
        ok: false,
        status: 400,
        message: 'The fixed part of the fee is not valid.',
        field: 'fee_fixed',
      };
    if (error.detail === 'percent_bps')
      return {
        ok: false,
        status: 400,
        message: 'The percent part of the fee is not valid.',
        field: 'fee_percent',
      };
    if (error.detail === 'confirm')
      return { ok: false, status: 400, message: 'Confirm the fee change to save it.' };
    return { ok: false, status: 400, message: 'Choose one of the offered options.' };
  }
  console.error(`[admin] live settings change failed: ${error instanceof Error ? error.name : 'unknown'}`);
  return {
    ok: false,
    status: 500,
    message: 'Something went wrong. Nothing was changed. Try again in a moment.',
  };
}

/** POST /live-settings: the funds-flow default, the Gamo fee (confirmed) or the door-sales switch. */
export async function handleLiveSettingsForm(request: Request, env: GamoEnv): Promise<SettingsOutcome> {
  try {
    requireSameOrigin(request);
  } catch {
    return { ok: false, status: 403, message: 'That request came from another site and was refused.' };
  }
  const form = await request.formData();
  const action = text(form, 'action');
  const reason = text(form, 'reason');
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const now = nowSeconds();
    if (action === 'flow_default') {
      const value = text(form, 'funds_flow');
      if (!(FUNDS_FLOW_DEFAULTS as readonly string[]).includes(value))
        return { ok: false, status: 400, message: 'Choose one of the funds-flow options.' };
      const { changed } = await setFundsFlowDefault(db, { value: value as FundsFlowDefault, reason, now });
      return { ok: true, location: `/live-settings?done=${changed ? 'flow_default' : 'same'}#funds-flow` };
    }
    if (action === 'fee') {
      if (text(form, 'confirm') !== 'yes')
        return { ok: false, status: 400, message: 'Confirm the fee change to save it.' };
      const fixedCents = Number(text(form, 'fixed_cents'));
      const percentBps = Number(text(form, 'percent_bps'));
      const { changed } = await changeGamoFee(db, { fixedCents, percentBps, reason, confirmed: true, now });
      return { ok: true, location: `/live-settings?done=${changed ? 'fee' : 'same'}#fee` };
    }
    if (action === 'door_on' || action === 'door_off') {
      const { changed } = await setDoorSalesEnabled(db, { enabled: action === 'door_on', reason, now });
      return { ok: true, location: `/live-settings?done=${changed ? action : 'same'}#door-sales` };
    }
    return { ok: false, status: 400, message: 'The form was incomplete. Reload and try again.' };
  } catch (error) {
    return settingsFailure(error);
  }
}

// ── One organization's payments (its admin page) ──────────────────────────────────────────────────────────────

export interface OrganizationPaymentsView {
  status: PaymentsStatus;
  /** The platform default, for the "Platform default (…)" choice. */
  platformDefault: FundsFlowDefault;
  decisions: DecisionLine[];
}

export async function loadOrganizationPayments(
  env: GamoEnv,
  organizationId: string,
): Promise<OrganizationPaymentsView | null> {
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const [status, settings, decisions] = await Promise.all([
      organizationPaymentsStatus(db, paidEnv(env), organizationId),
      readPaymentSettings(db),
      listPaymentDecisions(db, { organizationId, limit: 50 }),
    ]);
    return {
      status,
      platformDefault: settings.fundsFlowDefault,
      decisions: decisions.map((d) => decisionLine(d, new Map())),
    };
  } catch (error) {
    console.error(
      `[admin] organization payments unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
    );
    return null;
  }
}

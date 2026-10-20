/**
 * Payment settings and organization onboarding for Gamo Live (docs/LIVE_REQUIREMENTS.md §8 items 29, 36 and 37,
 * docs/LIVE_PAYMENTS.md §1).
 *
 * - The admin's decisions: the funds-flow default, a per-organization override, the platform door-sales switch and the
 *   Gamo fee. Each change is one batch that also writes a `payment_decisions` row with the old and new value and a
 *   required reason. A fee change adds a new `fee_settings` row effective now; earlier rows are never edited, and
 *   orders keep the fee snapshot they were created with.
 * - Onboarding: the connected account for the organization's mode is created through the gateway (controller
 *   properties per mode, `stripe-http.ts`) and only its id and readiness flags are stored in `organization_payments`;
 *   an Account Link sends the owner to Stripe; readiness is refreshed from Stripe on return and on `account.updated`.
 * - Reading for the admin: organizations whose payments are not ready, the fee history and the decision log.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import {
  FUNDS_FLOW_DEFAULTS,
  FUNDS_FLOWS,
  PAID_ID_PREFIX,
  PaidError,
  type FundsFlow,
  type FundsFlowDefault,
  type PaidEnv,
  type PaymentDecisionSubject,
  type StripeEventHandler,
} from './paid-types.ts';
import { stripeGatewayFor } from './payments/index.ts';
import {
  accountReady,
  currentFeeSetting,
  effectiveFundsFlow,
  readOrganizationPayments,
  readPaymentSettings,
  stripeModeOf,
  webhookSecretsOf,
} from './payments/resolve.ts';
import { idempotencyKeys } from './payments/shared.ts';
import type {
  AccountReadiness,
  PaymentsUnavailableReason,
  StripeAccount,
  StripeGateway,
} from './payments/types.ts';

export const MAX_FIXED_FEE_CENTS = 10_000;
export const MAX_PERCENT_FEE_BPS = 2_000;

function cleanReason(reason: unknown): string {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 1 || text.length > 500) throw new PaidError('invalid', { detail: 'reason' });
  return text;
}

function decision(
  subject: PaymentDecisionSubject,
  input: {
    organizationId?: string | null;
    oldValue: string | null;
    newValue: string | null;
    reason: string;
    now: number;
  },
) {
  return {
    sql:
      'INSERT INTO payment_decisions (id, subject, organization_id, old_value, new_value, reason, decided_at) ' +
      'VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    params: [
      newPrefixedId(PAID_ID_PREFIX.paymentDecision),
      subject,
      input.organizationId ?? null,
      input.oldValue,
      input.newValue,
      input.reason,
      input.now,
    ],
  };
}

/** Builds the `payment_decisions` insert for another module (payouts) to put in its own batch. */
export const paymentDecisionStatement = decision;

// ── Admin decisions ────────────────────────────────────────────────────────────────────────────────────────────

/** The platform's funds-flow mode (`not_chosen` makes card sales unavailable everywhere without an override). */
export async function setFundsFlowDefault(
  db: SqlDatabase,
  input: { value: FundsFlowDefault; reason: string; now: number },
): Promise<{ changed: boolean }> {
  if (!(FUNDS_FLOW_DEFAULTS as readonly string[]).includes(input.value))
    throw new PaidError('invalid', { detail: 'value' });
  const reason = cleanReason(input.reason);
  const current = await readPaymentSettings(db);
  if (current.fundsFlowDefault === input.value) return { changed: false };
  await runBatch(db, [
    {
      sql: 'UPDATE payment_settings SET funds_flow_default = ?1, updated_at = ?2 WHERE id = 1',
      params: [input.value, input.now],
    },
    decision('funds_flow_default', {
      oldValue: current.fundsFlowDefault,
      newValue: input.value,
      reason,
      now: input.now,
    }),
  ]);
  return { changed: true };
}

/** One organization's mode; `null` returns it to the platform default. */
export async function setOrganizationFundsFlow(
  db: SqlDatabase,
  input: { organizationId: string; value: FundsFlow | null; reason: string; now: number },
): Promise<{ changed: boolean }> {
  if (input.value !== null && !(FUNDS_FLOWS as readonly string[]).includes(input.value))
    throw new PaidError('invalid', { detail: 'value' });
  const reason = cleanReason(input.reason);
  const [org] = await allRows(db, {
    sql: 'SELECT id FROM organizations WHERE id = ?1',
    params: [input.organizationId],
  });
  if (!org) throw new PaidError('not_found');
  const current = await readOrganizationPayments(db, input.organizationId);
  const old = current?.fundsFlowOverride ?? null;
  if (old === input.value) return { changed: false };
  await runBatch(db, [
    {
      sql:
        'INSERT INTO organization_payments (organization_id, funds_flow_override, updated_at) VALUES (?1, ?2, ?3) ' +
        'ON CONFLICT (organization_id) DO UPDATE SET funds_flow_override = excluded.funds_flow_override, updated_at = excluded.updated_at',
      params: [input.organizationId, input.value, input.now],
    },
    decision('organization_override', {
      organizationId: input.organizationId,
      oldValue: old,
      newValue: input.value,
      reason,
      now: input.now,
    }),
  ]);
  return { changed: true };
}

/** The platform-wide door-sales switch (cash, comp and card at the door). */
export async function setDoorSalesEnabled(
  db: SqlDatabase,
  input: { enabled: boolean; reason: string; now: number },
): Promise<{ changed: boolean }> {
  const reason = cleanReason(input.reason);
  const current = await readPaymentSettings(db);
  if (current.doorSalesEnabled === input.enabled) return { changed: false };
  await runBatch(db, [
    {
      sql: 'UPDATE payment_settings SET door_sales_enabled = ?1, updated_at = ?2 WHERE id = 1',
      params: [input.enabled ? 1 : 0, input.now],
    },
    decision('door_sales', {
      oldValue: current.doorSalesEnabled ? 'on' : 'off',
      newValue: input.enabled ? 'on' : 'off',
      reason,
      now: input.now,
    }),
  ]);
  return { changed: true };
}

/**
 * A new Gamo fee, effective now. `confirmed` must be true (the admin's confirm step, AGENTS.md: no fee change without
 * the owner's explicit approval). Adds a row; never edits an earlier one.
 */
export async function changeGamoFee(
  db: SqlDatabase,
  input: { fixedCents: number; percentBps: number; reason: string; confirmed: boolean; now: number },
): Promise<{ feeSettingId: string; changed: boolean }> {
  if (input.confirmed !== true) throw new PaidError('invalid', { detail: 'confirm' });
  if (!Number.isInteger(input.fixedCents) || input.fixedCents < 0 || input.fixedCents > MAX_FIXED_FEE_CENTS)
    throw new PaidError('invalid', { detail: 'fixed_cents' });
  if (!Number.isInteger(input.percentBps) || input.percentBps < 0 || input.percentBps > MAX_PERCENT_FEE_BPS)
    throw new PaidError('invalid', { detail: 'percent_bps' });
  const reason = cleanReason(input.reason);
  const current = await currentFeeSetting(db, input.now);
  if (current.fixedCents === input.fixedCents && current.percentBps === input.percentBps)
    return { feeSettingId: current.id, changed: false };
  const id = newPrefixedId(PAID_ID_PREFIX.fee);
  const show = (fixed: number, bps: number) => JSON.stringify({ fixedCents: fixed, percentBps: bps });
  await runBatch(db, [
    {
      sql:
        'INSERT INTO fee_settings (id, fixed_cents, percent_bps, currency, reason, effective_at, created_at) ' +
        "VALUES (?1, ?2, ?3, 'usd', ?4, ?5, ?5)",
      params: [id, input.fixedCents, input.percentBps, reason, input.now],
    },
    decision('fee', {
      oldValue: show(current.fixedCents, current.percentBps),
      newValue: show(input.fixedCents, input.percentBps),
      reason,
      now: input.now,
    }),
  ]);
  return { feeSettingId: id, changed: true };
}

export interface FeeHistoryRow {
  id: string;
  fixedCents: number;
  percentBps: number;
  reason: string;
  effectiveAt: number;
}

export async function feeHistory(db: SqlDatabase): Promise<FeeHistoryRow[]> {
  const rows = await allRows<{
    id: string;
    fixed_cents: number;
    percent_bps: number;
    reason: string;
    effective_at: number;
  }>(db, {
    sql:
      'SELECT id, fixed_cents, percent_bps, reason, effective_at FROM fee_settings ' +
      'ORDER BY effective_at DESC, created_at DESC, rowid DESC',
    params: [],
  });
  return rows.map((r) => ({
    id: r.id,
    fixedCents: r.fixed_cents,
    percentBps: r.percent_bps,
    reason: r.reason,
    effectiveAt: r.effective_at,
  }));
}

export interface PaymentDecisionRow {
  id: string;
  subject: PaymentDecisionSubject;
  organizationId: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  decidedAt: number;
}

export async function listPaymentDecisions(
  db: SqlDatabase,
  filter: { organizationId?: string; subject?: PaymentDecisionSubject; limit?: number } = {},
): Promise<PaymentDecisionRow[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql:
      'SELECT id, subject, organization_id, old_value, new_value, reason, decided_at FROM payment_decisions ' +
      'WHERE (?1 IS NULL OR organization_id = ?1) AND (?2 IS NULL OR subject = ?2) ' +
      'ORDER BY decided_at DESC, rowid DESC LIMIT ?3',
    params: [
      filter.organizationId ?? null,
      filter.subject ?? null,
      Math.min(Math.max(filter.limit ?? 100, 1), 500),
    ],
  });
  return rows.map((r) => ({
    id: String(r.id),
    subject: r.subject as PaymentDecisionSubject,
    organizationId: (r.organization_id as string | null) ?? null,
    oldValue: (r.old_value as string | null) ?? null,
    newValue: (r.new_value as string | null) ?? null,
    reason: String(r.reason),
    decidedAt: Number(r.decided_at),
  }));
}

// ── Onboarding and readiness ───────────────────────────────────────────────────────────────────────────────────

function gatewayOrThrow(db: SqlDatabase, env: PaidEnv, gateway: StripeGateway | undefined): StripeGateway {
  const g = gateway ?? stripeGatewayFor(db, env);
  if (!g) throw new PaidError('payments_unavailable', { detail: 'stripe_not_configured' });
  return g;
}

function readinessOf(flow: FundsFlow | null, account: StripeAccount): AccountReadiness {
  const flags = {
    connectedAccountId: account.id,
    chargesEnabled: account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    requirementsDue: Array.isArray(account.requirements?.currently_due)
      ? account.requirements.currently_due.length
      : 0,
  };
  const ready =
    flow === 'organizer_account'
      ? flags.chargesEnabled
      : flow === 'gamo_collects'
        ? flags.payoutsEnabled
        : false;
  return { ready, ...flags };
}

/** Writes an account's readiness flags to the organization that holds it. Returns how many rows changed. */
async function storeReadiness(
  db: SqlDatabase,
  account: StripeAccount,
  livemode: boolean,
  now: number,
): Promise<number> {
  const r = readinessOf(null, account);
  const rows = await allRows(db, {
    sql:
      'UPDATE organization_payments SET charges_enabled = ?1, payouts_enabled = ?2, details_submitted = ?3, ' +
      'requirements_due = ?4, livemode = ?5, checked_at = ?6, updated_at = ?6 WHERE connected_account_id = ?7 ' +
      'RETURNING organization_id',
    params: [
      r.chargesEnabled ? 1 : 0,
      r.payoutsEnabled ? 1 : 0,
      r.detailsSubmitted ? 1 : 0,
      r.requirementsDue,
      livemode ? 1 : 0,
      now,
      account.id,
    ],
  });
  return rows.length;
}

/**
 * Starts (or resumes) Stripe onboarding for an organization in its current mode: creates the connected account once
 * (idempotency key per organization and purpose) and returns a fresh single-use Account Link.
 */
export async function startOrganizationOnboarding(
  db: SqlDatabase,
  env: PaidEnv,
  input: {
    organizationId: string;
    refreshUrl: string;
    returnUrl: string;
    now: number;
    gateway?: StripeGateway;
  },
): Promise<{ url: string; expiresAt: number; connectedAccountId: string }> {
  const [org] = await allRows<{ id: string; name: string }>(db, {
    sql: 'SELECT id, name FROM organizations WHERE id = ?1',
    params: [input.organizationId],
  });
  if (!org) throw new PaidError('not_found');
  const [settings, current] = await Promise.all([
    readPaymentSettings(db),
    readOrganizationPayments(db, org.id),
  ]);
  const flow = effectiveFundsFlow(settings, current);
  if (!flow) throw new PaidError('mode_not_chosen');
  const gateway = gatewayOrThrow(db, env, input.gateway);
  let accountId = current?.connectedAccountId ?? null;
  if (!accountId) {
    const purpose = flow === 'organizer_account' ? 'direct_charges' : 'transfers_only';
    const account = await gateway.createAccount(
      // No email is sent: Stripe collects contact details itself during onboarding.
      { purpose, email: null, businessName: org.name, metadata: { organization_id: org.id } },
      { idempotencyKey: idempotencyKeys.account(org.id, purpose) },
    );
    const [stored] = await allRows<{ connected_account_id: string }>(db, {
      sql:
        'INSERT INTO organization_payments (organization_id, connected_account_id, livemode, checked_at, updated_at) ' +
        'VALUES (?1, ?2, ?3, ?4, ?4) ON CONFLICT (organization_id) DO UPDATE SET ' +
        'connected_account_id = COALESCE(organization_payments.connected_account_id, excluded.connected_account_id), ' +
        'livemode = excluded.livemode, updated_at = excluded.updated_at RETURNING connected_account_id',
      params: [org.id, account.id, gateway.livemode ? 1 : 0, input.now],
    });
    accountId = stored?.connected_account_id ?? account.id;
    await storeReadiness(db, account, gateway.livemode, input.now);
  }
  const link = await gateway.createAccountLink({
    account: accountId,
    refreshUrl: input.refreshUrl,
    returnUrl: input.returnUrl,
  });
  return { url: link.url, expiresAt: link.expires_at, connectedAccountId: accountId };
}

/** Reads the account from Stripe and stores its readiness (on return from onboarding and on the Payments page). */
export async function refreshOrganizationReadiness(
  db: SqlDatabase,
  env: PaidEnv,
  input: { organizationId: string; now: number; gateway?: StripeGateway },
): Promise<AccountReadiness> {
  const [settings, current] = await Promise.all([
    readPaymentSettings(db),
    readOrganizationPayments(db, input.organizationId),
  ]);
  const flow = effectiveFundsFlow(settings, current);
  if (!current?.connectedAccountId)
    return {
      ready: false,
      connectedAccountId: null,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: 0,
    };
  const gateway = gatewayOrThrow(db, env, input.gateway);
  const account = await gateway.retrieveAccount(current.connectedAccountId);
  await storeReadiness(db, account, gateway.livemode, input.now);
  return readinessOf(flow, account);
}

/** `account.updated` (Connect endpoint): refreshes the readiness flags of the organization holding that account. */
export const accountUpdated: StripeEventHandler = async (event, ctx) => {
  const object = event.data.object as Partial<StripeAccount> & { object?: unknown };
  if (object.object !== 'account' || typeof object.id !== 'string') return 'ignored';
  // The object is the connected account the event is about; anything else is not ours to apply.
  if (event.account && event.account !== object.id) return 'ignored';
  const changed = await storeReadiness(ctx.db, object as StripeAccount, event.livemode, ctx.now);
  return changed > 0 ? 'processed' : 'ignored';
};

// ── Organizations whose payments are not ready (admin) ─────────────────────────────────────────────────────────

export interface PaymentsNotReadyRow {
  organizationId: string;
  name: string;
  flow: FundsFlow | null;
  reason: PaymentsUnavailableReason;
  connectedAccountId: string | null;
  requirementsDue: number;
  checkedAt: number | null;
  /** Paid events not canceled (the reason the organization is listed when it has no payments row yet). */
  paidEvents: number;
}

/**
 * Active organizations that have a paid event or a payments row, and cannot take card payments now, with the reason
 * (the same rule as `organizationPaymentsStatus`, evaluated for all of them in one read).
 */
export async function organizationsWithPaymentsNotReady(
  db: SqlDatabase,
  env: PaidEnv,
): Promise<PaymentsNotReadyRow[]> {
  const settings = await readPaymentSettings(db);
  const stripeMode = stripeModeOf(env);
  const connectSecret = webhookSecretsOf(env, 'connect').length > 0;
  const platformSecret = webhookSecretsOf(env, 'platform').length > 0;
  const rows = await allRows<Record<string, unknown>>(db, {
    sql:
      'SELECT o.id, o.name, p.funds_flow_override, p.connected_account_id, p.charges_enabled, p.payouts_enabled, ' +
      'p.details_submitted, p.requirements_due, p.checked_at, ' +
      "(SELECT COUNT(*) FROM events e WHERE e.organization_id = o.id AND e.admission = 'paid_tickets' AND e.status <> 'canceled') AS paid_events " +
      'FROM organizations o LEFT JOIN organization_payments p ON p.organization_id = o.id ' +
      "WHERE o.status = 'active' AND (p.organization_id IS NOT NULL OR EXISTS (SELECT 1 FROM events e " +
      "WHERE e.organization_id = o.id AND e.admission = 'paid_tickets' AND e.status <> 'canceled')) ORDER BY o.name, o.id",
    params: [],
  });
  const out: PaymentsNotReadyRow[] = [];
  for (const r of rows) {
    const org = {
      organizationId: String(r.id),
      fundsFlowOverride: (r.funds_flow_override as FundsFlow | null) ?? null,
      connectedAccountId: (r.connected_account_id as string | null) ?? null,
      chargesEnabled: r.charges_enabled === 1,
      payoutsEnabled: r.payouts_enabled === 1,
      detailsSubmitted: r.details_submitted === 1,
      requirementsDue: Number(r.requirements_due ?? 0),
      checkedAt: (r.checked_at as number | null) ?? null,
    };
    const flow = effectiveFundsFlow(settings, org);
    let reason: PaymentsUnavailableReason | null = null;
    if (!flow) reason = 'mode_not_chosen';
    else if (stripeMode === 'none') reason = 'stripe_not_configured';
    else if (!platformSecret) reason = 'webhook_missing';
    else if (flow === 'organizer_account' && !connectSecret) reason = 'connect_webhook_missing';
    else if (!org.connectedAccountId) reason = 'account_missing';
    else if (!accountReady(flow, org)) reason = 'account_not_ready';
    if (!reason) continue;
    out.push({
      organizationId: org.organizationId,
      name: String(r.name),
      flow,
      reason,
      connectedAccountId: org.connectedAccountId,
      requirementsDue: org.requirementsDue,
      checkedAt: org.checkedAt,
      paidEvents: Number(r.paid_events ?? 0),
    });
  }
  return out;
}

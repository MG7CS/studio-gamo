/**
 * Which funds-flow mode applies to an organization, and whether card sales are available for it right now
 * (docs/LIVE_PAYMENTS.md §1). Read-only: changing the settings is `payment-settings.ts`.
 *
 * Fail closed: no chosen mode, no Stripe configuration, no Connect webhook secret (Mode A) or an account that is not
 * ready all make card sales unavailable, with the reason. Cash and comp door sales do not need any of it.
 */
import { allRows, type SqlDatabase } from '../../security/sql-database.ts';
import type { FeeSetting, FundsFlow, FundsFlowDefault, PaidEnv, Seller } from '../paid-types.ts';
import type { PaymentsUnavailableReason } from './types.ts';

export interface PaymentSettings {
  fundsFlowDefault: FundsFlowDefault;
  doorSalesEnabled: boolean;
}

export interface OrganizationPayments {
  organizationId: string;
  fundsFlowOverride: FundsFlow | null;
  connectedAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: number;
  checkedAt: number | null;
}

/** How Stripe is reached in this environment. */
export type StripeMode = 'stripe' | 'standin' | 'none';

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * `stripe` when a key is set (live keys only in production, test keys never in production), `standin` only with
 * ENVIRONMENT=local, ALLOW_STRIPE_STANDIN=true and no key, otherwise `none`.
 */
export function stripeModeOf(env: PaidEnv): StripeMode {
  const key = text(env.STRIPE_SECRET_KEY);
  const production = env.ENVIRONMENT === 'production';
  if (key) {
    const live = /^(sk|rk)_live_/.test(key);
    const test = /^(sk|rk)_test_/.test(key);
    if ((live && production) || (test && !production)) return 'stripe';
    return 'none';
  }
  if (env.ENVIRONMENT === 'local' && env.ALLOW_STRIPE_STANDIN === 'true') return 'standin';
  return 'none';
}

/** The platform webhook secrets: the configured one, or the stand-in's fixed local secret. */
export const STANDIN_WEBHOOK_SECRET = 'whsec_local_standin_not_a_secret';

export function webhookSecretsOf(env: PaidEnv, endpoint: 'platform' | 'connect'): string[] {
  const configured = text(
    endpoint === 'platform' ? env.STRIPE_WEBHOOK_SECRET : env.STRIPE_CONNECT_WEBHOOK_SECRET,
  );
  if (configured) return [configured];
  return stripeModeOf(env) === 'standin' ? [STANDIN_WEBHOOK_SECRET] : [];
}

export async function readPaymentSettings(db: SqlDatabase): Promise<PaymentSettings> {
  const [row] = await allRows<{ funds_flow_default: FundsFlowDefault; door_sales_enabled: number }>(db, {
    sql: 'SELECT funds_flow_default, door_sales_enabled FROM payment_settings WHERE id = 1',
    params: [],
  });
  return {
    fundsFlowDefault: row?.funds_flow_default ?? 'not_chosen',
    doorSalesEnabled: (row?.door_sales_enabled ?? 0) === 1,
  };
}

export async function readOrganizationPayments(
  db: SqlDatabase,
  organizationId: string,
): Promise<OrganizationPayments | null> {
  const [row] = await allRows<Record<string, unknown>>(db, {
    sql:
      'SELECT organization_id, funds_flow_override, connected_account_id, charges_enabled, payouts_enabled, ' +
      'details_submitted, requirements_due, checked_at FROM organization_payments WHERE organization_id = ?1',
    params: [organizationId],
  });
  if (!row) return null;
  return {
    organizationId: String(row.organization_id),
    fundsFlowOverride: (row.funds_flow_override as FundsFlow | null) ?? null,
    connectedAccountId: (row.connected_account_id as string | null) ?? null,
    chargesEnabled: row.charges_enabled === 1,
    payoutsEnabled: row.payouts_enabled === 1,
    detailsSubmitted: row.details_submitted === 1,
    requirementsDue: Number(row.requirements_due ?? 0),
    checkedAt: (row.checked_at as number | null) ?? null,
  };
}

/** The organization's override, else the platform default; null while the owner has not chosen. */
export function effectiveFundsFlow(
  settings: PaymentSettings,
  org: Pick<OrganizationPayments, 'fundsFlowOverride'> | null,
): FundsFlow | null {
  if (org?.fundsFlowOverride) return org.fundsFlowOverride;
  return settings.fundsFlowDefault === 'not_chosen' ? null : settings.fundsFlowDefault;
}

export const sellerOf = (flow: FundsFlow): Seller => (flow === 'organizer_account' ? 'organization' : 'gamo');

/** Mode A needs an account that can take charges; Mode B one that can receive transfers. */
export function accountReady(flow: FundsFlow, org: OrganizationPayments | null): boolean {
  if (!org?.connectedAccountId) return false;
  return flow === 'organizer_account' ? org.chargesEnabled : org.payoutsEnabled;
}

export interface PaymentsStatus {
  flow: FundsFlow | null;
  seller: Seller | null;
  stripeMode: StripeMode;
  /** Card sales (online, buyer's phone, reader) can run now. */
  cardSalesAvailable: boolean;
  /** Why not, when they cannot. */
  reason: PaymentsUnavailableReason | null;
  /** The platform switch for door sales (cash, comp and card). */
  doorSalesEnabled: boolean;
  org: OrganizationPayments | null;
  /** Stripe is in test mode (or the stand-in); shown as "Test mode" on payment screens. */
  testMode: boolean;
}

/** Everything a page or rule needs to know about an organization's payments, read once. */
export async function organizationPaymentsStatus(
  db: SqlDatabase,
  env: PaidEnv,
  organizationId: string,
): Promise<PaymentsStatus> {
  const [settings, org] = await Promise.all([
    readPaymentSettings(db),
    readOrganizationPayments(db, organizationId),
  ]);
  const flow = effectiveFundsFlow(settings, org);
  const stripeMode = stripeModeOf(env);
  let reason: PaymentsUnavailableReason | null = null;
  if (!flow) reason = 'mode_not_chosen';
  else if (stripeMode === 'none') reason = 'stripe_not_configured';
  // Without the platform webhook secret no payment could ever be confirmed: buyers would pay and get no tickets.
  else if (webhookSecretsOf(env, 'platform').length === 0) reason = 'webhook_missing';
  else if (flow === 'organizer_account' && webhookSecretsOf(env, 'connect').length === 0)
    reason = 'connect_webhook_missing';
  else if (!org?.connectedAccountId) reason = 'account_missing';
  else if (!accountReady(flow, org)) reason = 'account_not_ready';
  return {
    flow,
    seller: flow ? sellerOf(flow) : null,
    stripeMode,
    cardSalesAvailable: reason === null,
    reason,
    doorSalesEnabled: settings.doorSalesEnabled,
    org,
    testMode: stripeMode !== 'stripe' || !/^(sk|rk)_live_/.test(text(env.STRIPE_SECRET_KEY)),
  };
}

/** The Gamo fee in force at `now` (the newest setting whose `effective_at` has passed). */
export async function currentFeeSetting(db: SqlDatabase, now: number): Promise<FeeSetting> {
  const [row] = await allRows<{ id: string; fixed_cents: number; percent_bps: number; effective_at: number }>(
    db,
    {
      sql:
        'SELECT id, fixed_cents, percent_bps, effective_at FROM fee_settings WHERE effective_at <= ?1 ' +
        'ORDER BY effective_at DESC, created_at DESC LIMIT 1',
      params: [now],
    },
  );
  if (!row) return { id: 'fee_none', fixedCents: 0, percentBps: 0, effectiveAt: 0 };
  return {
    id: row.id,
    fixedCents: row.fixed_cents,
    percentBps: row.percent_bps,
    effectiveAt: row.effective_at,
  };
}

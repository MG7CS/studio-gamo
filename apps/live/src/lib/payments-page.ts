/**
 * The Organization area's Payments tab (docs/LIVE_SCREENS.md §I.3 O8; docs/LIVE_REQUIREMENTS.md §8.4 item 29), owners
 * only: the funds-flow mode in force and who the seller is, connecting or finishing the Stripe account, readiness in
 * plain words, and, when Gamo collects (Mode B), the payouts and a monthly statement from the ledger.
 */
import {
  PaidError,
  SecretNotConfiguredError,
  StripeApiError,
  listPayouts,
  organizationPaymentsStatus,
  organizationStatement,
  paymentsRuntime,
  refreshOrganizationReadiness,
  startOrganizationOnboarding,
  zonedLocalToEpochSeconds,
  type FundsFlow,
  type PaidEnv,
  type PaymentsStatus,
  type PaymentsUnavailableReason,
  type PayoutRow,
  type SqlDatabase,
  type Statement,
} from '@gamo/domain';

export const PAYMENTS_PATH = '/organizer/organization/payments';

/** How the money flows, in words, and who the seller on receipts is. Never described as escrow. */
export function modeWording(
  flow: FundsFlow | null,
  organizationName: string,
): { title: string; text: string; seller: string | null } {
  if (flow === 'organizer_account')
    return {
      title: 'Your own Stripe account',
      text: 'Buyers pay your organization directly through your connected Stripe account. Your organization is the seller and handles refunds and disputes there; Stripe pays out to your bank.',
      seller: organizationName,
    };
  if (flow === 'gamo_collects')
    return {
      title: 'Gamo collects for you',
      text: 'Buyers pay Gamo Studios on behalf of your organization. Gamo records what it holds for you and pays it to your payout account; Gamo handles refunds and disputes for these orders.',
      seller: `Gamo Studios on behalf of ${organizationName}`,
    };
  return {
    title: 'Not chosen yet',
    text: 'Gamo has not yet chosen how card payments flow for your organization, so card sales are not available. Cash and comp tickets at the door do not need it.',
    seller: null,
  };
}

/** Why card sales are unavailable, and what the owner can do about it. */
export function readinessWording(
  reason: PaymentsUnavailableReason | null,
  flow: FundsFlow | null,
  requirementsDue: number,
): { ready: boolean; text: string; canConnect: boolean } {
  switch (reason) {
    case null:
      return { ready: true, text: 'Ready: your organization can take card payments.', canConnect: false };
    case 'mode_not_chosen':
      return {
        ready: false,
        text: 'Waiting for Gamo to choose how payments flow. Nothing to do yet.',
        canConnect: false,
      };
    case 'stripe_not_configured':
    case 'webhook_missing':
    case 'connect_webhook_missing':
      return {
        ready: false,
        text: 'Card payments are not switched on for Gamo Live here yet. Nothing to do on your side.',
        canConnect: false,
      };
    case 'account_missing':
      return {
        ready: false,
        text:
          flow === 'gamo_collects'
            ? 'Add a payout account with Stripe so Gamo can pay your organization.'
            : 'Connect a Stripe account so your organization can take card payments.',
        canConnect: true,
      };
    case 'account_not_ready':
      return {
        ready: false,
        text:
          requirementsDue > 0
            ? `Stripe still needs ${requirementsDue} ${requirementsDue === 1 ? 'detail' : 'details'} from you. Continue with Stripe to finish.`
            : 'Stripe is still checking your account. Continue with Stripe if it asks for anything, or check again later.',
        canConnect: true,
      };
  }
}

export const PAYOUT_STATUS: Record<
  PayoutRow['status'],
  { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' | 'danger' }
> = {
  prepared: { label: 'Prepared', tone: 'info' },
  approved: { label: 'Approved', tone: 'info' },
  sent: { label: 'Sent', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  canceled: { label: 'Canceled', tone: 'neutral' },
};

/** A statement month from `?month=YYYY-MM` (default: the current month in `timeZone`), with its bounds. */
export function statementMonth(
  param: string | null,
  now: number,
  timeZone: string,
): { month: string; from: number; to: number; previous: string; next: string | null } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' })
    .format(new Date(now * 1000))
    .slice(0, 7);
  const month = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) && param <= today ? param : today;
  const [y, m] = month.split('-').map(Number);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  const start = (ym: string) => zonedLocalToEpochSeconds(`${ym}-01T00:00`, timeZone) ?? 0;
  return {
    month,
    from: start(month),
    to: start(shift(1)),
    previous: shift(-1),
    next: month < today ? shift(1) : null,
  };
}

export interface PaymentsPageView {
  status: PaymentsStatus;
  mode: ReturnType<typeof modeWording>;
  readiness: ReturnType<typeof readinessWording>;
  /** True with the local Stripe stand-in (the "Test mode" notice says so). */
  standin: boolean;
  /** Mode B only. */
  payouts: PayoutRow[] | null;
  statement: (Statement & { month: string; previous: string; next: string | null }) | null;
}

export async function paymentsPageView(
  db: SqlDatabase,
  env: PaidEnv,
  input: {
    organizationId: string;
    organizationName: string;
    month: string | null;
    timeZone: string;
    now: number;
  },
): Promise<PaymentsPageView> {
  const status = await organizationPaymentsStatus(db, env, input.organizationId);
  const modeB = status.flow === 'gamo_collects';
  const period = statementMonth(input.month, input.now, input.timeZone);
  const [payouts, statement] = await Promise.all([
    modeB ? listPayouts(db, { organizationId: input.organizationId }) : Promise.resolve(null),
    modeB
      ? organizationStatement(db, { organizationId: input.organizationId, from: period.from, to: period.to })
      : Promise.resolve(null),
  ]);
  return {
    status,
    mode: modeWording(status.flow, input.organizationName),
    readiness: readinessWording(status.reason, status.flow, status.org?.requirementsDue ?? 0),
    standin: paymentsRuntime(db, env).standin,
    payouts,
    statement: statement
      ? { ...statement, month: period.month, previous: period.previous, next: period.next }
      : null,
  };
}

export const PAYMENTS_FLASH: Record<string, string> = {
  checked: 'Checked with Stripe. The status below is current.',
  returned: 'Welcome back from Stripe. The status below is current.',
};

export type PaymentsActionResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'done'; flash: keyof typeof PAYMENTS_FLASH & string }
  | { kind: 'error'; notice: string };

const UNAVAILABLE = 'Stripe could not be reached just now. Nothing changed; please try again later.';

/**
 * `connect`: start or continue Stripe onboarding (a fresh single-use link). `check` (or returning from Stripe): read
 * the account and store its readiness. Owners only; the page checks the role before calling.
 */
export async function runPaymentsAction(input: {
  db: SqlDatabase;
  env: PaidEnv;
  organizationId: string;
  action: 'connect' | 'check' | 'returned';
  origin: string;
  now: number;
}): Promise<PaymentsActionResult> {
  const base = `${input.origin.replace(/\/+$/, '')}${PAYMENTS_PATH}`;
  const runtime = paymentsRuntime(input.db, input.env);
  try {
    if (input.action === 'connect') {
      const link = await startOrganizationOnboarding(input.db, input.env, {
        organizationId: input.organizationId,
        refreshUrl: `${base}?stripe=refresh`,
        returnUrl: `${base}?stripe=return`,
        now: input.now,
      });
      await runtime.flush();
      return { kind: 'redirect', url: link.url };
    }
    await refreshOrganizationReadiness(input.db, input.env, {
      organizationId: input.organizationId,
      now: input.now,
    });
    await runtime.flush();
    return { kind: 'done', flash: input.action === 'returned' ? 'returned' : 'checked' };
  } catch (error) {
    if (error instanceof PaidError && error.code === 'mode_not_chosen')
      return {
        kind: 'error',
        notice: 'Gamo has not chosen how payments flow yet, so there is nothing to connect.',
      };
    if (error instanceof PaidError && error.code === 'payments_unavailable')
      return { kind: 'error', notice: 'Card payments are not switched on for Gamo Live here yet.' };
    if (
      error instanceof PaidError ||
      error instanceof StripeApiError ||
      error instanceof SecretNotConfiguredError
    )
      return { kind: 'error', notice: UNAVAILABLE };
    throw error;
  }
}

/** The origin a redirect to Stripe goes to, for the page's `form-action` addition; null for a local address. */
export function redirectOrigin(url: string, ownOrigin: string): string | null {
  try {
    const target = new URL(url, ownOrigin);
    return target.origin !== new URL(ownOrigin).origin && target.protocol === 'https:' ? target.origin : null;
  } catch {
    return null;
  }
}

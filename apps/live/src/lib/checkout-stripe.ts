/**
 * Stripe's side of checkout (docs/LIVE_SCREENS.md §I.2 P9–P10): the two webhook endpoints, and the local Stripe
 * stand-in's "hosted" pages (Checkout and Connect onboarding), which exist only when the stand-in runs
 * (ENVIRONMENT=local, ALLOW_STRIPE_STANDIN=true, no Stripe key). The webhook's signature is the authority; there is no
 * same-origin check because Stripe calls it. Everything else is in `@gamo/domain` (webhooks.ts, payments/standin.ts).
 */
import {
  StripeApiError,
  paymentsRuntime,
  standinCheckoutView,
  standinCompleteCheckout,
  standinCompleteOnboarding,
  formatCents,
  type PaymentsRuntime,
  type SqlDatabase,
  type PaidEnv,
} from '@gamo/domain';
import type { LiveContext } from './registration';

// ── P9: webhooks ───────────────────────────────────────────────────────────────────────────────────────────────

const NO_STORE = { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' };

/** Any method but POST. */
export function webhookMethodNotAllowed(): Response {
  return new Response('Method not allowed', { status: 405, headers: { ...NO_STORE, Allow: 'POST' } });
}

/**
 * One webhook request: the raw body as bytes and the `Stripe-Signature` header go to the receiver, which verifies,
 * records once and processes; its status and body are the answer.
 */
export async function receiveWebhook(
  runtime: Pick<PaymentsRuntime, 'receive'>,
  request: Request,
  endpoint: 'platform' | 'connect',
): Promise<Response> {
  const body = new Uint8Array(await request.arrayBuffer());
  const result = await runtime.receive(body, request.headers.get('stripe-signature'), endpoint);
  return new Response(result.body, { status: result.status, headers: NO_STORE });
}

/** The webhook route: 503 when the database is not bound, never details. */
export async function handleWebhook(
  open: () => Promise<{ db: SqlDatabase; env: PaidEnv }>,
  request: Request,
  endpoint: 'platform' | 'connect',
): Promise<Response> {
  let live;
  try {
    live = await open();
  } catch {
    return new Response('Unavailable', { status: 503, headers: NO_STORE });
  }
  return receiveWebhook(paymentsRuntime(live.db, live.env), request, endpoint);
}

// ── P10: the local stand-in's hosted pages ─────────────────────────────────────────────────────────────────────

const SESSION_ID = /^cs_[A-Za-z0-9_]{1,100}$/;
const ACCOUNT_ID = /^acct_[A-Za-z0-9_]{1,100}$/;

export type StandinOutcome = 'paid' | 'declined' | 'canceled';
export const STANDIN_OUTCOMES: readonly StandinOutcome[] = ['paid', 'declined', 'canceled'];

export interface StandinCheckoutPage {
  id: string;
  open: boolean;
  statusText: string | null;
  lines: Array<{ label: string; amount: string }>;
  total: string;
  cancelUrl: string;
}

/** Only on this computer: anything else on the redirect is reduced to a path on this site. */
export function localRedirect(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return fallback;
    return `${u.pathname}${u.search}`;
  } catch {
    return fallback;
  }
}

/** The stand-in's Checkout page, or null (no stand-in here, or no such session). */
export async function openStandinCheckout(
  live: LiveContext,
  input: { sessionId: string; now: number },
): Promise<StandinCheckoutPage | null> {
  const runtime = paymentsRuntime(live.db, live.env);
  if (!runtime.standin || !SESSION_ID.test(input.sessionId)) return null;
  const view = await standinCheckoutView(live.db, live.env, input.sessionId, input.now);
  if (!view) return null;
  const open = view.status === 'open';
  return {
    id: view.id,
    open,
    statusText: open
      ? null
      : view.status === 'complete'
        ? 'This checkout is already finished.'
        : 'This checkout expired.',
    lines: view.lineItems.map((l) => ({
      label: l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name,
      amount: formatCents(l.unitAmountCents * l.quantity),
    })),
    total: formatCents(view.amountTotal),
    cancelUrl: localRedirect(view.cancelUrl, '/'),
  };
}

/**
 * The buyer's choice on the stand-in's Checkout page: the stand-in records it and queues its signed events, `flush`
 * delivers them to the webhook receiver now, then the browser goes on (success or cancel URL, or back here after a
 * decline). Null when there is no stand-in or no such session.
 */
export async function completeStandinCheckout(
  live: LiveContext,
  input: { sessionId: string; outcome: string; now: number },
): Promise<{ location: string; declined: boolean } | null> {
  const runtime = paymentsRuntime(live.db, live.env);
  if (!runtime.standin || !SESSION_ID.test(input.sessionId)) return null;
  const outcome = STANDIN_OUTCOMES.find((o) => o === input.outcome);
  if (!outcome) return null;
  let result;
  try {
    result = await standinCompleteCheckout(live.db, live.env, input.sessionId, outcome, input.now);
  } catch (error) {
    if (error instanceof StripeApiError && error.status === 404) return null;
    throw error;
  }
  await runtime.flush();
  const self = `/dev/stripe/checkout/${input.sessionId}`;
  return {
    location: localRedirect(result.redirectUrl, self),
    declined: result.outcome === 'declined',
  };
}

/** The stand-in's onboarding page, or null (no stand-in, or no such account). */
export async function openStandinOnboarding(
  live: LiveContext,
  input: { accountId: string },
): Promise<{ id: string; ready: boolean } | null> {
  const runtime = paymentsRuntime(live.db, live.env);
  const gateway = runtime.standin ? runtime.gateway() : null;
  if (!gateway || !ACCOUNT_ID.test(input.accountId)) return null;
  try {
    const account = await gateway.retrieveAccount(input.accountId);
    return { id: account.id, ready: Boolean(account.details_submitted) };
  } catch (error) {
    if (error instanceof StripeApiError && error.status === 404) return null;
    throw error;
  }
}

export const STANDIN_ONBOARDING_DONE = '/organizer/organization/payments';

/** "Finish onboarding": the account becomes ready, `account.updated` is delivered, the organizer goes back. */
export async function completeStandinOnboarding(
  live: LiveContext,
  input: { accountId: string; now: number },
): Promise<string | null> {
  const runtime = paymentsRuntime(live.db, live.env);
  if (!runtime.standin || !ACCOUNT_ID.test(input.accountId)) return null;
  let result;
  try {
    result = await standinCompleteOnboarding(live.db, live.env, input.accountId, input.now);
  } catch (error) {
    if (error instanceof StripeApiError && error.status === 404) return null;
    throw error;
  }
  await runtime.flush();
  return localRedirect(result.returnUrl, STANDIN_ONBOARDING_DONE);
}

/** Flash words on the stand-in's Checkout page. */
export const STANDIN_FLASH: Record<string, string> = {
  'standin-declined': 'The stand-in declined the card, as asked. Nothing was charged; you can try again.',
};

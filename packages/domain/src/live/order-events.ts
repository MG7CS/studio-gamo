/**
 * Stripe webhook handlers for orders (docs/LIVE_REQUIREMENTS.md §8.2 item 12, docs/LIVE_PAYMENTS.md §4). The webhook
 * route verifies the signature and records each event once (claim → process → mark); these handlers do the work and
 * are each idempotent and safe in any order of delivery:
 *
 * - `checkout.session.completed` (only when `payment_status = 'paid'`) and `checkout.session.async_payment_succeeded`
 *   → `markOrderPaid` (amount, currency, session and account checked there). `unfulfilled` (paid after the seats were
 *   lost) → refunded in full through the order's own routing and the buyer emailed; `mismatch` → recorded, no
 *   tickets, only the reason code logged. A session for an order that does not exist is `ignored`.
 * - `checkout.session.async_payment_failed`, `checkout.session.expired` → the order's seats are released.
 * - `payment_intent.succeeded` (card-present door orders only, matched by `payment_intent_id`) → paid and admitted;
 *   `payment_intent.payment_failed` → nothing (the order waits for another try on the reader).
 * - `refund.created`, `refund.updated`, `refund.failed`, `charge.refunded` → refund rows and the order's refunded
 *   amount (settled by the one shared statement in refunds.ts, so the two paths never double count). A refund made
 *   outside Gamo (the Stripe dashboard) gets its own row.
 * - `charge.dispute.*` → disputes.ts.
 *
 * An event about an order Gamo does not know yet (a refund or dispute before its payment) answers `retry`.
 */
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { handleDisputeClosed, handleDisputeOpenedOrUpdated } from './disputes.ts';
import { sendLiveEmail, type LiveEmail } from './mail.ts';
import { orderReceipt } from './order-links.ts';
import { resolvePaymentRoutingForOrder } from './order-routing.ts';
import { markOrderPaid as markOrderPaidImpl, releaseOrder as releaseOrderImpl } from './orders.ts';
import {
  PaidError,
  type HandlerResult,
  type MarkOrderPaid,
  type MarkPaidResult,
  type PaidEnv,
  type RefundStatus,
  type ReleaseOrder,
  type StripeEvent,
  type StripeEventHandler,
  type StripeEventHandlers,
  type WebhookContext,
} from './paid-types.ts';
import {
  doorTicketsEmail,
  orderConfirmationEmail,
  paymentNotFulfilledEmail,
  type PaidMailEvent,
} from './paid-mail.ts';
import type { PaymentRouting, StripeRefund } from './payments/types.ts';
import {
  completeRefundStatements,
  loadRefund,
  refundFromRow,
  refundOrderInFull,
  settleRefundedAmountStatement,
  stripeRefundStatements,
} from './refunds.ts';
import { newPrefixedId } from '../security/ids.ts';
import { loadPaidOrder, loadPaidOrderByPayment, orderTokenFor, type PaidOrder } from './tickets.ts';

/** What the handlers depend on (swapped in tests). */
export interface OrderEventDeps {
  markOrderPaid: MarkOrderPaid;
  releaseOrder: ReleaseOrder;
  /** The routing an existing order's refunds use (from its snapshot), or null when Stripe is not reachable. */
  routingForOrder: (db: SqlDatabase, env: PaidEnv, orderId: string) => Promise<PaymentRouting | null>;
  sendEmail: (env: PaidEnv, email: LiveEmail) => Promise<void>;
  /** The order page URL for a token, or null when the Live origin is not configured. */
  orderUrl: (env: PaidEnv, token: string) => string | null;
}

/** `PUBLIC_SITE_URL_LIVE` + `/orders/<token>`. */
export function liveOrderUrl(env: PaidEnv, token: string): string | null {
  const origin = (env as Record<string, unknown>).PUBLIC_SITE_URL_LIVE;
  if (typeof origin !== 'string' || !/^https?:\/\/[^/\s]+$/.test(origin.replace(/\/+$/, ''))) return null;
  return `${origin.replace(/\/+$/, '')}/orders/${encodeURIComponent(token)}`;
}

export const defaultOrderEventDeps: OrderEventDeps = {
  markOrderPaid: markOrderPaidImpl,
  releaseOrder: releaseOrderImpl,
  routingForOrder: async (db, env, orderId) => {
    const r = await resolvePaymentRoutingForOrder(db, env, orderId);
    return r.available ? r.routing : null;
  },
  sendEmail: (env, email) => sendLiveEmail(env, email),
  orderUrl: liveOrderUrl,
};

// ── Small readers of Stripe objects ────────────────────────────────────────────────────────────────────────────

const obj = (event: StripeEvent) => (event.data?.object ?? {}) as Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const idOf = (v: unknown): string | null =>
  text(v) ?? (v && typeof v === 'object' ? text((v as { id?: unknown }).id) : null);
const intOf = (v: unknown): number | null => (Number.isInteger(v) ? Number(v) : null);
const metadataOf = (o: Record<string, unknown>): Record<string, unknown> =>
  o.metadata && typeof o.metadata === 'object' ? (o.metadata as Record<string, unknown>) : {};

/** Mode A events carry the order's connected account; Mode B events (platform endpoint) carry none. */
const sameAccount = (event: StripeEvent, order: PaidOrder) =>
  (event.account ?? null) === order.stripeAccountId;

const mailEvent = (o: PaidOrder): PaidMailEvent => ({
  title: o.eventTitle,
  startsAt: o.startsAt,
  timezone: o.timezone,
  venueName: o.venueName,
  venueAddress: o.venueAddress,
  organizationName: o.organizationName,
});

/** Sends without failing the webhook: the payment is already recorded; a lost email is recoverable (find my tickets). */
async function trySend(deps: OrderEventDeps, env: PaidEnv, email: LiveEmail | null): Promise<void> {
  if (!email) return;
  try {
    await deps.sendEmail(env, email);
  } catch (error) {
    console.warn(`[live:webhook] email_failed ${(error as Error)?.name ?? 'error'}`);
  }
}

async function confirmationFor(db: SqlDatabase, env: PaidEnv, deps: OrderEventDeps, orderId: string) {
  const order = await loadPaidOrder(db, orderId);
  if (!order?.buyerEmail) return null;
  const token = await orderTokenFor(db, env, order.id);
  const url = token ? deps.orderUrl(env, token) : null;
  if (!url) {
    console.warn('[live:webhook] email_skipped PUBLIC_SITE_URL_LIVE');
    return null;
  }
  const receipt = await orderReceipt(db, order);
  const count = Number(
    (
      await allRows<{ n: number }>(db, {
        sql: 'SELECT COUNT(*) AS n FROM tickets WHERE order_id = ?1',
        params: [order.id],
      })
    )[0]?.n ?? 0,
  );
  const common = {
    to: order.buyerEmail,
    name: order.buyerName,
    event: mailEvent(order),
    reference: order.reference,
    seller: order.seller,
    lines: receipt.lines,
    totalCents: order.totalCents,
    ticketCount: count,
    orderUrl: url,
  };
  return order.channel === 'door'
    ? doorTicketsEmail(common)
    : orderConfirmationEmail({ ...common, entryNotes: order.policySnapshot?.entryNotes ?? null });
}

/** How long a payment whose session or PaymentIntent id is not stored yet is retried (Stripe retries with backoff). */
const REFERENCE_RETRY_SECONDS = 60 * 60;

/** After `markOrderPaid`: emails, the automatic full refund of an unfulfilled payment, or a logged mismatch. */
async function afterMarkPaid(
  ctx: WebhookContext,
  deps: OrderEventDeps,
  result: MarkPaidResult,
  event: StripeEvent,
): Promise<HandlerResult> {
  if (result.outcome === 'not_found') return 'ignored';
  if (result.outcome === 'mismatch') {
    console.warn(`[live:webhook] payment_mismatch ${result.reason}`);
    // A payment can arrive before the request that created its Checkout Session or PaymentIntent has stored the id:
    // retry for a short while so it is applied once the id is there, instead of dropping a captured payment.
    if (result.reason === 'reference' && ctx.now - event.created < REFERENCE_RETRY_SECONDS) return 'retry';
    return 'processed';
  }
  if (result.outcome === 'paid') {
    await trySend(deps, ctx.env, await confirmationFor(ctx.db, ctx.env, deps, result.orderId));
    return 'processed';
  }
  // `unfulfilled`, or a redelivery of one (`already_paid` with the order still `paid_unfulfilled`).
  const order = await loadPaidOrder(ctx.db, result.orderId);
  if (!order || order.status !== 'paid_unfulfilled') return 'processed';
  const routing = await deps.routingForOrder(ctx.db, ctx.env, order.id);
  try {
    await refundOrderInFull(ctx.db, ctx.env, {
      orderId: order.id,
      reason: 'unfulfilled',
      routing,
      now: ctx.now,
    });
  } catch (error) {
    if (error instanceof PaidError) {
      console.warn(`[live:webhook] unfulfilled_refund ${error.code}`);
      if (result.outcome === 'unfulfilled') await trySend(deps, ctx.env, unfulfilledEmail(order));
      return 'retry';
    }
    throw error;
  }
  if (result.outcome === 'unfulfilled') await trySend(deps, ctx.env, unfulfilledEmail(order));
  return 'processed';
}

function unfulfilledEmail(order: PaidOrder): LiveEmail | null {
  if (!order.buyerEmail) return null;
  return paymentNotFulfilledEmail({
    to: order.buyerEmail,
    name: order.buyerName,
    event: mailEvent(order),
    reference: order.reference,
    amountCents: order.totalCents,
  });
}

// ── Checkout and PaymentIntents ────────────────────────────────────────────────────────────────────────────────

function checkoutPaid(deps: OrderEventDeps): StripeEventHandler {
  return async (event, ctx) => {
    const s = obj(event);
    if (s.payment_status !== 'paid') return 'ignored';
    const orderId = text(metadataOf(s).order_id) ?? text(s.client_reference_id);
    if (!orderId) return 'ignored';
    const order = await loadPaidOrder(ctx.db, orderId);
    if (!order) return 'ignored';
    const result = await deps.markOrderPaid(ctx.db, ctx.env, {
      orderId,
      amountCents: intOf(s.amount_total) ?? -1,
      currency: text(s.currency) ?? '',
      providerRef: text(s.id),
      stripeAccountId: event.account ?? null,
      paymentIntentId: idOf(s.payment_intent),
      admit: order.channel === 'door',
      admittedBy: order.channel === 'door' ? 'door_phone' : null,
      now: ctx.now,
    });
    return afterMarkPaid(ctx, deps, result, event);
  };
}

function checkoutReleased(deps: OrderEventDeps, reason: 'expired' | 'failed'): StripeEventHandler {
  return async (event, ctx) => {
    const s = obj(event);
    const orderId = text(metadataOf(s).order_id) ?? text(s.client_reference_id);
    if (!orderId) return 'ignored';
    const order = await loadPaidOrder(ctx.db, orderId);
    if (!order) return 'ignored';
    if (!sameAccount(event, order)) {
      console.warn('[live:webhook] release_account_mismatch');
      return 'ignored';
    }
    // A session other than the order's current one (a replaced session) never releases the order.
    if (order.checkoutSessionId && text(s.id) && order.checkoutSessionId !== text(s.id)) return 'ignored';
    await deps.releaseOrder(ctx.db, { orderId, reason, now: ctx.now });
    return 'processed';
  };
}

function paymentIntentSucceeded(deps: OrderEventDeps): StripeEventHandler {
  return async (event, ctx) => {
    const pi = obj(event);
    const id = text(pi.id);
    if (!id) return 'ignored';
    const order = await loadPaidOrderByPayment(ctx.db, { paymentIntentId: id });
    // Online and phone orders are confirmed by their Checkout Session; only reader payments are handled here.
    if (!order || order.paymentMethod !== 'card_reader') return 'ignored';
    const result = await deps.markOrderPaid(ctx.db, ctx.env, {
      orderId: order.id,
      amountCents: intOf(pi.amount_received) ?? -1,
      currency: text(pi.currency) ?? '',
      providerRef: id,
      stripeAccountId: event.account ?? null,
      paymentIntentId: id,
      admit: true,
      admittedBy: 'card_reader',
      now: ctx.now,
    });
    return afterMarkPaid(ctx, deps, result, event);
  };
}

const paymentIntentFailed: StripeEventHandler = async (event, ctx) => {
  const id = text(obj(event).id);
  const order = id ? await loadPaidOrderByPayment(ctx.db, { paymentIntentId: id }) : null;
  // The order stays pending: staff can try the reader again; the hold expires on its own otherwise.
  return order ? 'processed' : 'ignored';
};

// ── Refunds ────────────────────────────────────────────────────────────────────────────────────────────────────

const STRIPE_REFUND_STATUSES = ['pending', 'requires_action', 'succeeded', 'failed', 'canceled'] as const;

function refundObject(o: Record<string, unknown>):
  | (Pick<StripeRefund, 'id' | 'status' | 'amount'> & {
      paymentIntentId: string | null;
      refundId: string | null;
      orderId: string | null;
    })
  | null {
  const id = text(o.id);
  const status = STRIPE_REFUND_STATUSES.find((s) => s === o.status);
  const amount = intOf(o.amount);
  if (!id || !status || amount == null) return null;
  const meta = metadataOf(o);
  return {
    id,
    status,
    amount,
    paymentIntentId: idOf(o.payment_intent),
    refundId: text(meta.refund_id),
    orderId: text(meta.order_id),
  };
}

const ourStatus = (s: string): RefundStatus =>
  s === 'succeeded' ? 'succeeded' : s === 'failed' ? 'failed' : s === 'canceled' ? 'canceled' : 'pending';

/** Applies one Stripe refund object to Gamo's records. */
async function applyRefundObject(
  ctx: WebhookContext,
  event: StripeEvent,
  r: NonNullable<ReturnType<typeof refundObject>>,
): Promise<HandlerResult> {
  const byStripe = (
    await allRows(ctx.db, { sql: 'SELECT * FROM refunds WHERE stripe_refund_id = ?1', params: [r.id] })
  )[0];
  let row = byStripe ? refundFromRow(byStripe) : r.refundId ? await loadRefund(ctx.db, r.refundId) : null;
  const order = row
    ? await loadPaidOrder(ctx.db, row.orderId)
    : await loadPaidOrderByPayment(ctx.db, { orderId: r.orderId, paymentIntentId: r.paymentIntentId });
  // Only a refund that names a Gamo order or refund may be early (its payment not recorded yet): retry those. Refunds of
  // other payments on the same Stripe account (an organization's own sales in Mode A) are none of Gamo's business.
  if (!order) return r.orderId || r.refundId ? 'retry' : 'ignored';
  // Its payment is not recorded yet (the payment's webhook is still to come): wait for it.
  if (order.status === 'pending') return 'retry';
  if (!sameAccount(event, order) || (row && row.orderId !== order.id)) {
    console.warn('[live:webhook] refund_account_mismatch');
    return 'ignored';
  }
  if (!row) {
    // A refund Gamo has reserved but not yet linked to Stripe: let the refund path store its id first.
    const unlinked = await allRows(ctx.db, {
      sql: `SELECT 1 AS ok FROM refunds WHERE order_id = ?1 AND method = 'stripe' AND status = 'pending' AND stripe_refund_id IS NULL`,
      params: [order.id],
    });
    if (unlinked.length) return 'retry';
    // Made outside Gamo (the Stripe dashboard): recorded so the order and the ledger match Stripe.
    await runBatch(ctx.db, [
      {
        sql: `INSERT INTO refunds (id, order_id, ticket_ids, amount_cents, currency, method, requested_by, reason, status,
                                   stripe_refund_id, created_at, updated_at)
              VALUES (?1, ?2, '[]', ?3, ?4, 'stripe', ?5, 'stripe_dashboard', 'pending', ?6, ?7, ?7)
              ON CONFLICT (stripe_refund_id) DO NOTHING`,
        params: [
          newPrefixedId('rfd'),
          order.id,
          Math.max(0, r.amount),
          order.currency,
          order.seller === 'gamo' ? 'admin' : 'organizer',
          r.id,
          ctx.now,
        ],
      },
    ]);
    const created = (
      await allRows(ctx.db, { sql: 'SELECT * FROM refunds WHERE stripe_refund_id = ?1', params: [r.id] })
    )[0];
    if (!created) return 'retry';
    row = refundFromRow(created);
  }
  if (row.status === 'succeeded' || row.status === 'failed' || row.status === 'canceled') return 'processed';
  const status = ourStatus(r.status);
  await runBatch(
    ctx.db,
    status === 'succeeded' && row.status === 'requested'
      ? completeRefundStatements(row, order, ctx.now)
      : stripeRefundStatements(row, order, { id: r.id, status: r.status }, ctx.now),
  );
  return 'processed';
}

const refundEvent: StripeEventHandler = async (event, ctx) => {
  const r = refundObject(obj(event));
  if (!r) return 'ignored';
  return applyRefundObject(ctx, event, event.type === 'refund.failed' ? { ...r, status: 'failed' } : r);
};

/** `charge.refunded`: the charge's refunds, then the order's refunded amount from Stripe's own total. */
const chargeRefunded: StripeEventHandler = async (event, ctx) => {
  const c = obj(event);
  const pi = idOf(c.payment_intent);
  const order = await loadPaidOrderByPayment(ctx.db, {
    orderId: text(metadataOf(c).order_id),
    paymentIntentId: pi,
  });
  if (!order) return text(metadataOf(c).order_id) ? 'retry' : 'ignored';
  if (order.status === 'pending') return 'retry';
  if (!sameAccount(event, order)) {
    console.warn('[live:webhook] refund_account_mismatch');
    return 'ignored';
  }
  const list = (c.refunds as { data?: unknown } | undefined)?.data;
  if (Array.isArray(list))
    for (const item of list) {
      const r = refundObject((item ?? {}) as Record<string, unknown>);
      if (!r) continue;
      const result = await applyRefundObject(ctx, event, { ...r, orderId: r.orderId ?? order.id });
      if (result === 'retry') return 'retry';
    }
  const stripeRefunded = intOf(c.amount_refunded) ?? 0;
  await runBatch(ctx.db, [
    settleRefundedAmountStatement(order.id, stripeRefunded, ctx.now),
    // Refunded in full outside Gamo: the remaining unscanned tickets stop working too.
    {
      sql: `UPDATE tickets SET status = 'refunded', updated_at = ?2
             WHERE order_id = ?1 AND status = 'valid' AND checked_in_at IS NULL
               AND EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND total_cents > 0 AND amount_refunded_cents >= total_cents)`,
      params: [order.id, ctx.now],
    },
  ]);
  return 'processed';
};

// ── The map ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every order-side handler, with its dependencies (tests pass fakes). */
export function createOrderEventHandlers(deps: OrderEventDeps = defaultOrderEventDeps): StripeEventHandlers {
  return {
    'checkout.session.completed': checkoutPaid(deps),
    'checkout.session.async_payment_succeeded': checkoutPaid(deps),
    'checkout.session.async_payment_failed': checkoutReleased(deps, 'failed'),
    'checkout.session.expired': checkoutReleased(deps, 'expired'),
    'payment_intent.succeeded': paymentIntentSucceeded(deps),
    'payment_intent.payment_failed': paymentIntentFailed,
    'charge.refunded': chargeRefunded,
    'refund.created': refundEvent,
    'refund.updated': refundEvent,
    'refund.failed': refundEvent,
    'charge.dispute.created': handleDisputeOpenedOrUpdated,
    'charge.dispute.updated': handleDisputeOpenedOrUpdated,
    'charge.dispute.closed': handleDisputeClosed,
  };
}

export const orderEventHandlers: StripeEventHandlers = createOrderEventHandlers();

export const handleCheckoutSessionCompleted: StripeEventHandler = checkoutPaid(defaultOrderEventDeps);
export const handleCheckoutAsyncPaymentSucceeded: StripeEventHandler = handleCheckoutSessionCompleted;
export const handleCheckoutAsyncPaymentFailed: StripeEventHandler = checkoutReleased(
  defaultOrderEventDeps,
  'failed',
);
export const handleCheckoutSessionExpired: StripeEventHandler = checkoutReleased(
  defaultOrderEventDeps,
  'expired',
);
export const handlePaymentIntentSucceeded: StripeEventHandler = paymentIntentSucceeded(defaultOrderEventDeps);
export const handlePaymentIntentFailed = paymentIntentFailed;
export const handleChargeRefunded = chargeRefunded;
export const handleRefundEvent = refundEvent;
export { handleDisputeClosed, handleDisputeOpenedOrUpdated };

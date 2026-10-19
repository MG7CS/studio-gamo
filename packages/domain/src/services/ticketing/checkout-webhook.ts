/**
 * Stripe webhook (design §5.2): signature → test mode only → claim → typed dispatch → mark.
 *
 *   claim: INSERT stripe_webhook_events (status 'processing'); an existing `processed`/`ignored` row
 *   answers 200 (duplicate); a `processing` row younger than 5 minutes answers 409 so Stripe retries
 *   later (never 200 for work that might still fail); `failed` or stale `processing` rows are reclaimed.
 *
 *   checkout.session.completed / async_payment_succeeded → payment_status must be 'paid', amount and
 *     currency must equal the order, metadata.orderId must match the session → issue tickets (one
 *     batch, re-holding if the hold expired). Stock gone → `paid_unfulfillable` + automatic test refund
 *     (or staff alert when the refund fails). Amount mismatch → `paid_unfulfillable`, refund, alert.
 *   checkout.session.expired → holds released, order expired, waitlist told.
 *   charge.refunded → refunded total reconciled (only ever up).
 *   refund.updated → refund record status.
 *   charge.dispute.created → order disputed, unscanned tickets voided, staff alerted.
 *   anything else → recorded `ignored`, 200 (no retry storms).
 *   failure → `failed` + 500 so Stripe retries.
 */
import { verifyStripeWebhookSignature, type StripeWebhookEvent } from '@studio-gamo/integrations/stripe';
import { runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import { isLocalEnvironment, localDevelopmentSecret } from '../../security/env-secret.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { releaseOrderHoldsStatement, transitionOrderStatement } from '../../ticketing/sql.ts';
import { issueOrderTickets } from './issuance.ts';
import { refundUnfulfilledPayment, settleOrderRefundStatement } from './refunds.ts';
import { notifyWaitlist } from './checkout-waitlist.ts';
import { sendStaffAlertEmail, sendTicketEmail } from './email.ts';
import { TicketingError, loadOrder, loadOrderBy, type OrderRow, type TicketingEnv } from './orders-shared.ts';

const PROCESSING_LEASE_SECONDS = 5 * 60;
/** A refund/dispute for a payment we cannot match yet is retried for this long (Stripe redelivers ~3 days). */
const UNMATCHED_RETRY_WINDOW_SECONDS = 72 * 60 * 60;

export interface WebhookResponse {
  status: number;
  body: Record<string, unknown>;
}

/** STRIPE_WEBHOOK_SECRET; local without one → a fixed development secret (the local mock signs with it). */
export function stripeWebhookSecret(env: TicketingEnv): string | null {
  const v = env.STRIPE_WEBHOOK_SECRET;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return isLocalEnvironment(env) ? localDevelopmentSecret('STRIPE_WEBHOOK_SECRET') : null;
}

/** Signs a payload the way Stripe does (`t=<ts>,v1=<hex HMAC>`); used by the local mock and tests. */
export async function signStripePayload(secret: string, body: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)),
  );
  return `t=${timestamp},v1=${Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

async function claim(
  db: SqlDatabase,
  event: StripeWebhookEvent,
  now: number,
): Promise<'claimed' | 'duplicate' | 'in_progress'> {
  const row = await db
    .prepare(
      "INSERT INTO stripe_webhook_events (id, event_type, processed_at, status) VALUES (?1, ?2, ?3, 'processing') ON CONFLICT(id) DO UPDATE SET status = 'processing', processed_at = ?3, error_message = NULL WHERE stripe_webhook_events.status = 'failed' OR (stripe_webhook_events.status = 'processing' AND stripe_webhook_events.processed_at <= ?4) RETURNING id",
    )
    .bind(event.id, event.type, now, now - PROCESSING_LEASE_SECONDS)
    .first();
  if (row) return 'claimed';
  const existing = (await db
    .prepare('SELECT status FROM stripe_webhook_events WHERE id = ?1')
    .bind(event.id)
    .first()) as {
    status: string;
  } | null;
  return existing?.status === 'processing' ? 'in_progress' : 'duplicate';
}

async function mark(
  db: SqlDatabase,
  id: string,
  status: 'processed' | 'ignored' | 'failed',
  now: number,
  error?: string,
) {
  await db
    .prepare(
      'UPDATE stripe_webhook_events SET status = ?2, processed_at = ?3, error_message = ?4 WHERE id = ?1',
    )
    .bind(id, status, now, error ? error.slice(0, 120) : null)
    .run();
}

interface SessionObject {
  id?: string;
  object?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
}

export interface WebhookContext {
  now: number;
  origin: string;
  fetchImpl?: typeof fetch;
}

async function unfulfillable(
  db: SqlDatabase,
  env: TicketingEnv,
  order: OrderRow,
  session: SessionObject,
  why: string,
  ctx: WebhookContext,
): Promise<Record<string, unknown>> {
  await runBatch(db, [
    transitionOrderStatement({
      orderId: order.id,
      from: ['pending_payment', 'expired', 'cancelled'],
      to: 'paid_unfulfillable',
      now: ctx.now,
      set: { paymentStatus: 'paid', stripePaymentIntentId: session.payment_intent ?? undefined },
    }),
    releaseOrderHoldsStatement({ orderId: order.id, now: ctx.now, status: 'released' }),
  ]);
  const refunded = await refundUnfulfilledPayment(db, env, {
    order,
    amountCents: Number(session.amount_total ?? order.total_cents),
    paymentIntentId: session.payment_intent ?? null,
    reason: why,
    now: ctx.now,
    fetchImpl: ctx.fetchImpl,
  });
  await sendStaffAlertEmail(db, env, {
    key: `unfulfillable:${order.id}`,
    subject: refunded
      ? 'Payment refunded automatically (could not issue tickets)'
      : 'Payment needs a manual refund',
    lines: [
      `Order ${order.order_reference ?? order.id}`,
      `Reason: ${why}`,
      refunded
        ? 'A full test-mode refund was issued.'
        : 'The automatic refund failed: refund it from the Stripe dashboard (test mode).',
    ],
    now: ctx.now,
  }).catch(() => undefined);
  return { orderId: order.id, outcome: 'paid_unfulfillable', refunded };
}

async function onSessionPaid(
  db: SqlDatabase,
  env: TicketingEnv,
  session: SessionObject,
  ctx: WebhookContext,
) {
  if (session.payment_status !== 'paid') return { outcome: 'awaiting_payment' };
  const orderId = session.metadata?.orderId ?? session.client_reference_id ?? '';
  const order = orderId ? await loadOrder(db, orderId) : null;
  if (!order || (order.stripe_checkout_session_id && order.stripe_checkout_session_id !== session.id))
    return { outcome: 'unknown_order' };
  if (
    Number(session.amount_total) !== Number(order.total_cents) ||
    String(session.currency ?? '').toLowerCase() !== order.currency
  )
    return unfulfillable(db, env, order, session, 'amount_or_currency_mismatch', ctx);
  const paymentId = `pay_${session.id}`;
  const outcome = await issueOrderTickets(db, env, {
    orderId: order.id,
    from: ['pending_payment', 'expired'],
    to: 'paid',
    set: { paymentStatus: 'paid', stripePaymentIntentId: session.payment_intent ?? undefined },
    extra: [
      {
        sql: "INSERT INTO payment_records (id, session_id, payment_intent_id, amount_cents, currency, status, source_type, source_id, customer_email, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'succeeded', 'event_ticket', ?6, NULL, ?7) ON CONFLICT(id) DO NOTHING",
        params: [
          paymentId,
          session.id ?? null,
          session.payment_intent ?? null,
          Number(session.amount_total),
          order.currency,
          order.id,
          ctx.now,
        ],
      },
    ],
    now: ctx.now,
  });
  if (!outcome.ok) {
    if (outcome.reason === 'unfulfillable')
      return unfulfillable(db, env, order, session, outcome.code ?? 'sold_out', ctx);
    const fresh = await loadOrder(db, order.id);
    if (fresh && ['cancelled', 'paid_unfulfillable'].includes(fresh.status))
      return unfulfillable(db, env, fresh, session, `order_${fresh.status}`, ctx);
    return { orderId: order.id, outcome: 'already_handled' };
  }
  if (outcome.issued > 0)
    await sendTicketEmail(db, env, { orderId: order.id, origin: ctx.origin, now: ctx.now }).catch(() =>
      console.error('[ticketing] ticket email failed'),
    );
  return {
    orderId: order.id,
    outcome: outcome.alreadyIssued ? 'already_issued' : 'issued',
    ticketsIssued: outcome.issued,
  };
}

async function onSessionExpired(
  db: SqlDatabase,
  env: TicketingEnv,
  session: SessionObject,
  ctx: WebhookContext,
) {
  const order = session.id ? await loadOrderBy(db, 'stripe_checkout_session_id', session.id) : null;
  if (!order) return { outcome: 'unknown_order' };
  const [released] = await runBatch(db, [
    releaseOrderHoldsStatement({ orderId: order.id, now: ctx.now, status: 'released' }),
    transitionOrderStatement({ orderId: order.id, from: ['pending_payment'], to: 'expired', now: ctx.now }),
  ]);
  if (released.length)
    await notifyWaitlist(db, env, { eventId: order.event_id, now: ctx.now, origin: ctx.origin }).catch(
      () => undefined,
    );
  return { orderId: order.id, outcome: 'released', holdsReleased: released.length };
}

async function onChargeRefunded(
  db: SqlDatabase,
  object: { payment_intent?: string | null; amount_refunded?: number },
  ctx: WebhookContext,
) {
  const order = object.payment_intent
    ? await loadOrderBy(db, 'stripe_payment_intent_id', object.payment_intent)
    : null;
  if (typeof object.amount_refunded !== 'number') return { outcome: 'ignored' };
  // Not matched yet (Stripe can deliver this before checkout.session.completed): ask for a redelivery.
  if (!order) return { outcome: 'unmatched', retry: true };
  await runBatch(db, [
    settleOrderRefundStatement({
      orderId: order.id,
      now: ctx.now,
      stripeAmountCents: Math.max(0, Math.floor(object.amount_refunded)),
    }),
  ]);
  return { orderId: order.id, outcome: 'reconciled' };
}

async function onRefundUpdated(
  db: SqlDatabase,
  object: { id?: string; status?: string },
  ctx: WebhookContext,
) {
  if (!object.id) return { outcome: 'ignored' };
  const status =
    object.status === 'succeeded'
      ? 'processed'
      : object.status === 'failed' || object.status === 'canceled'
        ? 'rejected'
        : null;
  if (!status) return { outcome: 'ignored' };
  await db
    .prepare(
      'UPDATE refund_records SET status = ?2, processed_at = coalesce(processed_at, ?3) WHERE stripe_refund_id = ?1',
    )
    .bind(object.id, status, ctx.now)
    .run();
  return { outcome: 'refund_status' };
}

async function onDispute(
  db: SqlDatabase,
  env: TicketingEnv,
  object: { payment_intent?: string | null },
  ctx: WebhookContext,
) {
  const order = object.payment_intent
    ? await loadOrderBy(db, 'stripe_payment_intent_id', object.payment_intent)
    : null;
  if (!order) return { outcome: 'unmatched', retry: true };
  const [, voided] = await runBatch(db, [
    transitionOrderStatement({
      orderId: order.id,
      from: ['paid', 'confirmed', 'partially_refunded'],
      to: 'disputed',
      now: ctx.now,
      set: { disputedAt: ctx.now },
    }),
    {
      sql: "UPDATE tickets SET status = 'voided', voided_at = ?2, void_reason = 'dispute', updated_at = ?2 WHERE order_id = ?1 AND status = 'valid' AND NOT EXISTS (SELECT 1 FROM ticket_presence p WHERE p.ticket_id = tickets.id AND p.entry_count > 0) RETURNING id",
      params: [order.id, ctx.now],
    },
  ]);
  await sendStaffAlertEmail(db, env, {
    key: `dispute:${order.id}`,
    subject: 'Payment disputed — unscanned tickets voided',
    lines: [
      `Order ${order.order_reference ?? order.id}`,
      `${voided.length} unscanned ticket(s) were voided.`,
      'Tell the organizer and answer the dispute in the Stripe dashboard (test mode).',
    ],
    now: ctx.now,
  }).catch(() => undefined);
  return { orderId: order.id, outcome: 'disputed', ticketsVoided: voided.length };
}

/**
 * The whole webhook. `rawBody` must be the exact bytes Stripe signed. Returns the HTTP status and body.
 * Without a webhook secret outside local → 503 (fail closed).
 */
export async function handleStripeWebhook(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { rawBody: string; signature: string | null; ctx: WebhookContext },
): Promise<WebhookResponse> {
  const secret = stripeWebhookSecret(env);
  if (!secret) {
    console.error('[ticketing] STRIPE_WEBHOOK_SECRET is not configured');
    return { status: 503, body: { error: 'Webhook processing is not configured.' } };
  }
  const verified = await verifyStripeWebhookSignature(input.rawBody, input.signature, secret);
  if (!verified.valid || !verified.event)
    return { status: 400, body: { error: 'Invalid webhook signature.' } };
  const event = verified.event;
  if (event.livemode !== false) return { status: 400, body: { error: 'Only sandbox events are accepted.' } };
  if (
    typeof event.id !== 'string' ||
    !/^evt_[A-Za-z0-9_]+$/.test(event.id) ||
    typeof event.type !== 'string' ||
    !event.data ||
    typeof event.data.object !== 'object'
  )
    return { status: 400, body: { error: 'Invalid sandbox webhook payload.' } };

  const state = await claim(db, event, input.ctx.now);
  if (state === 'duplicate')
    return { status: 200, body: { received: true, eventId: event.id, deduplicated: true } };
  if (state === 'in_progress')
    return { status: 409, body: { error: 'This event is being processed. Retry later.' } };

  try {
    const object = event.data.object as Record<string, unknown>;
    let result: Record<string, unknown>;
    let ignored = false;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        result = await onSessionPaid(db, env, object as SessionObject, input.ctx);
        break;
      case 'checkout.session.expired':
        result = await onSessionExpired(db, env, object as SessionObject, input.ctx);
        break;
      case 'charge.refunded':
        result = await onChargeRefunded(
          db,
          object as { payment_intent?: string | null; amount_refunded?: number },
          input.ctx,
        );
        break;
      case 'refund.updated':
        result = await onRefundUpdated(db, object as { id?: string; status?: string }, input.ctx);
        break;
      case 'charge.dispute.created':
        result = await onDispute(db, env, object as { payment_intent?: string | null }, input.ctx);
        break;
      default:
        ignored = true;
        result = { outcome: 'ignored' };
    }
    if (
      result.retry === true &&
      input.ctx.now - Number(event.created ?? input.ctx.now) < UNMATCHED_RETRY_WINDOW_SECONDS
    ) {
      // Retryable: Stripe redelivers for up to three days; the failed claim is taken again each time.
      await mark(db, event.id, 'failed', input.ctx.now, 'unmatched');
      return { status: 409, body: { error: 'This event does not match an order yet. Retry later.' } };
    }
    await mark(db, event.id, ignored ? 'ignored' : 'processed', input.ctx.now);
    return { status: 200, body: { received: true, eventId: event.id, type: event.type, ...result } };
  } catch (err) {
    const code = err instanceof TicketingError ? err.code : 'internal_error';
    console.error(`[ticketing] webhook ${event.type} failed: ${code}`);
    await mark(db, event.id, 'failed', input.ctx.now, code).catch(() => undefined);
    return { status: 500, body: { error: 'Webhook processing failed.' } };
  }
}

/** Builds a signed `checkout.session.completed` for the local mock checkout page (ENVIRONMENT=local only). */
export async function localMockPaymentWebhook(
  env: TicketingEnv,
  order: OrderRow,
  now: number,
  type: 'checkout.session.completed' | 'checkout.session.expired' = 'checkout.session.completed',
): Promise<{ rawBody: string; signature: string }> {
  if (!isLocalEnvironment(env)) throw new TicketingError('NOT_FOUND', 'Not found.');
  const secret = stripeWebhookSecret(env)!;
  const rawBody = JSON.stringify({
    id: newPrefixedId('evt').replace('evt_', 'evt_local_'),
    object: 'event',
    type,
    created: now,
    livemode: false,
    data: {
      object: {
        id: order.stripe_checkout_session_id,
        object: 'checkout.session',
        payment_status: type === 'checkout.session.completed' ? 'paid' : 'unpaid',
        amount_total: Number(order.total_cents),
        currency: order.currency,
        payment_intent: `pi_test_local_${order.id.slice(4)}`,
        client_reference_id: order.id,
        metadata: { orderId: order.id },
      },
    },
  });
  return { rawBody, signature: await signStripePayload(secret, rawBody, Math.floor(Date.now() / 1000)) };
}

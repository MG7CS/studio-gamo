/**
 * Refunds and ticket cancellation (design §5.2 "Refunds"): per ticket, cumulative, only the chosen
 * tickets change. CLEANUP_LOG D-175:
 *
 *   1. ONE batch: the `refund_records` row (amount computed in SQL from the tickets this batch will change,
 *      capped by what is not yet refunded) → the conditional ticket updates (`refunded` for paid, `voided`
 *      for free; of two concurrent refunds of one ticket only one finds it changeable) → derived refunded
 *      quantities → the audit row. A crash cannot leave tickets refunded without a record.
 *   2. The Stripe test refund with idempotency key `refund_<recordId>` (paid only; local: simulated).
 *   3. ONE batch: record `processed` first, then `amount_refunded_cents = MIN(total, MAX(current, sum of
 *      processed records, Stripe's figure))` — the `charge.refunded` webhook uses the same statement, so the
 *      two paths can never add up to a double count.
 * A record left `approved` (Stripe failed) is found by `retryPendingRefunds` and repeated with the same key.
 * Eligible tickets: valid ones, and (paid orders only) tickets voided because the event was cancelled —
 * never dispute-voided ones.
 */
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../../security/sql-database.ts';
import { newPrefixedId, randomBase32 } from '../../security/index.ts';
import { createStripeTestClient } from '@studio-gamo/integrations/stripe';
import { paidCheckoutMode } from './checkout.ts';
import { notifyWaitlist } from './checkout-waitlist.ts';
import { sendRefundNoticeEmail, sendStaffAlertEmail } from './email.ts';
import {
  TicketingError,
  loadEvent,
  loadOrder,
  loadOrderTickets,
  type OrderRow,
  type TicketingEnv,
} from './orders-shared.ts';

const FULFILLED = ['paid', 'confirmed', 'partially_refunded', 'disputed'];

/** Stripe test refund, or a simulated one in local mock mode. Throws PAYMENT_FAILED / UNAVAILABLE. */
export async function stripeTestRefund(
  env: TicketingEnv,
  input: {
    paymentIntentId: string | null;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
    fetchImpl?: typeof fetch;
  },
): Promise<{ id: string; mocked: boolean }> {
  const mode = paidCheckoutMode(env);
  if (!mode.open)
    throw new TicketingError('UNAVAILABLE', 'Card refunds are not available here. No money was moved.');
  if (mode.mock) return { id: `re_test_local_${randomBase32(20)}`, mocked: true };
  if (!input.paymentIntentId)
    throw new TicketingError('PAYMENT_FAILED', 'This order has no card payment to refund.');
  try {
    const refund = await createStripeTestClient({
      secretKey: mode.secretKey,
      fetchImpl: input.fetchImpl,
    }).createRefund({
      paymentIntentId: input.paymentIntentId,
      amountMinorUnits: input.amountCents,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    return { id: refund.id, mocked: false };
  } catch {
    console.error('[ticketing] stripe refund failed');
    throw new TicketingError(
      'PAYMENT_FAILED',
      "The card refund didn't go through yet. Try again from the order page in a few minutes.",
    );
  }
}

export interface RefundResult {
  refundId: string | null;
  ticketIds: string[];
  amountCents: number;
  status: 'processed' | 'cancelled_free' | 'refund_pending' | 'nothing_to_do';
}

/** New refunded amount: the order's own figure, processed records and Stripe's figure — never more than the total. */
const NEW_REFUNDED =
  "min(total_cents, max(amount_refunded_cents, coalesce((SELECT sum(r.amount_cents) FROM refund_records r WHERE r.order_id = ticket_orders.id AND r.status = 'processed'), 0), coalesce(?3, 0)))";

/**
 * Sets the order's refunded total (see the header). `stripeAmountCents` is the figure from a `charge.refunded`
 * webhook, or null. Disputed / unfulfillable / cancelled / expired orders keep their status.
 */
export function settleOrderRefundStatement(input: {
  orderId: string;
  now: number;
  stripeAmountCents?: number | null;
}): SqlStatementSpec {
  return {
    sql: `UPDATE ticket_orders SET
        status = CASE WHEN status IN ('disputed', 'paid_unfulfillable', 'cancelled', 'expired', 'pending_payment', 'pending_verification') THEN status
          WHEN total_cents > 0 AND ${NEW_REFUNDED} >= total_cents THEN 'refunded'
          WHEN ${NEW_REFUNDED} > 0 THEN 'partially_refunded' ELSE status END,
        amount_refunded_cents = ${NEW_REFUNDED}, updated_at = ?2
      WHERE id = ?1 RETURNING amount_refunded_cents, total_cents, status`,
    params: [input.orderId, input.now, input.stripeAmountCents ?? null],
  };
}

const PAID_ELIGIBLE =
  "(t.status = 'valid' OR (t.status = 'voided' AND t.void_reason = 'event_cancelled' AND t.refunded_at IS NULL))";

async function finishRefund(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { order: OrderRow; recordId: string; amountCents: number; now: number; fetchImpl?: typeof fetch },
): Promise<'processed' | 'refund_pending'> {
  let stripeId: string;
  try {
    stripeId = (
      await stripeTestRefund(env, {
        paymentIntentId: input.order.stripe_payment_intent_id,
        amountCents: input.amountCents,
        idempotencyKey: `refund_${input.recordId}`,
        metadata: { orderId: input.order.id, refundRecordId: input.recordId },
        fetchImpl: input.fetchImpl,
      })
    ).id;
  } catch (err) {
    await sendStaffAlertEmail(db, env, {
      key: `refund_failed:${input.recordId}`,
      subject: 'Refund pending — card refund failed',
      lines: [
        `Order ${input.order.order_reference ?? input.order.id}`,
        `Refund record ${input.recordId}`,
        'Retry it from the organizer order page.',
      ],
      now: input.now,
    }).catch(() => undefined);
    if (err instanceof TicketingError && err.code === 'UNAVAILABLE') throw err;
    return 'refund_pending';
  }
  await runBatch(db, [
    {
      sql: "UPDATE refund_records SET status = 'processed', stripe_refund_id = ?2, processed_at = ?3 WHERE id = ?1 AND status = 'approved'",
      params: [input.recordId, stripeId, input.now],
    },
    settleOrderRefundStatement({ orderId: input.order.id, now: input.now }),
  ]);
  return 'processed';
}

/**
 * Refunds (paid) or cancels (free) the chosen tickets of an order; all eligible tickets when none are given.
 * The caller has checked the organizer's `approve_refunds` permission.
 */
export async function refundTickets(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    orderId: string;
    ticketIds?: string[];
    reason: string;
    actorUserId: string | null;
    actorLabel?: string;
    now: number;
    origin: string;
    notify?: boolean;
    fetchImpl?: typeof fetch;
  },
): Promise<RefundResult> {
  const reason = String(input.reason ?? '').trim();
  if (reason.length < 3 || reason.length > 500)
    throw new TicketingError('VALIDATION', 'Give a short reason for the refund (3 to 500 characters).', {
      fields: [{ field: 'reason', message: 'Give a short reason (3 to 500 characters).' }],
    });
  const order = await loadOrder(db, input.orderId);
  if (!order) throw new TicketingError('NOT_FOUND', 'Order not found.');
  if (!FULFILLED.includes(order.status))
    throw new TicketingError('CONFLICT', 'Only orders with issued tickets can be refunded or cancelled.');
  const tickets = await loadOrderTickets(db, order.id);
  const chosen = input.ticketIds?.length ? tickets.filter((t) => input.ticketIds!.includes(t.id)) : tickets;
  if (input.ticketIds?.length && chosen.length !== new Set(input.ticketIds).size)
    throw new TicketingError(
      'VALIDATION',
      'Some of those tickets are not part of this order. Reload the page.',
    );
  const paid = Number(order.total_cents) > 0;
  const eligible = chosen.filter(
    (t) =>
      t.status === 'valid' ||
      (paid && t.status === 'voided' && t.void_reason === 'event_cancelled' && t.refunded_at === null),
  );
  if (eligible.length === 0)
    return { refundId: null, ticketIds: [], amountCents: 0, status: 'nothing_to_do' };

  const recordId = newPrefixedId('rfd');
  const ids = eligible.map((t) => t.id);
  const inList = ids.map((_, i) => `?${7 + i}`).join(', ');
  const eligibleSql = paid ? PAID_ELIGIBLE : "t.status = 'valid'";
  const amount =
    "max(0, min(x.s, o.total_cents - coalesce((SELECT sum(r.amount_cents) FROM refund_records r WHERE r.order_id = o.id AND r.status IN ('approved', 'processed')), 0)))";
  const specs: SqlStatementSpec[] = [
    {
      sql: `INSERT INTO refund_records (id, order_id, event_id, requested_by_email, approved_by_user_id, amount_cents, reason, status, created_at)
        SELECT ?1, o.id, o.event_id, ?3, ?4, CASE WHEN o.total_cents > 0 THEN ${amount} ELSE 0 END, ?5,
          CASE WHEN o.total_cents > 0 AND ${amount} > 0 THEN 'approved' ELSE 'processed' END, ?6
        FROM ticket_orders o,
          (SELECT count(*) AS c, coalesce(sum(oi.unit_price_cents), 0) AS s FROM tickets t JOIN order_items oi ON oi.id = t.order_item_id
            WHERE t.order_id = ?2 AND t.id IN (${inList}) AND ${eligibleSql}) x
        WHERE o.id = ?2 AND x.c > 0`,
      params: [
        recordId,
        order.id,
        input.actorLabel ?? 'organizer',
        input.actorUserId,
        reason.slice(0, 500),
        input.now,
        ...ids,
      ],
    },
    ...ids.map((id): SqlStatementSpec =>
      paid
        ? {
            sql: "UPDATE tickets SET status = 'refunded', refunded_at = ?2, updated_at = ?2 WHERE id = ?1 AND (status = 'valid' OR (status = 'voided' AND void_reason = 'event_cancelled' AND refunded_at IS NULL)) RETURNING id",
            params: [id, input.now],
          }
        : {
            sql: "UPDATE tickets SET status = 'voided', voided_at = ?2, void_reason = 'organizer', updated_at = ?2 WHERE id = ?1 AND status = 'valid' RETURNING id",
            params: [id, input.now],
          },
    ),
    {
      sql: "UPDATE order_items SET refunded_quantity = min(quantity, max(refunded_quantity, (SELECT count(*) FROM tickets t WHERE t.order_item_id = order_items.id AND (t.status = 'refunded' OR (t.status = 'voided' AND t.void_reason IN ('organizer', 'event_cancelled')))))), updated_at = ?2 WHERE order_id = ?1",
      params: [order.id, input.now],
    },
    {
      sql: "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at) SELECT ?1, ?2, ?3, 'order', ?4, ?5, ?6 WHERE EXISTS (SELECT 1 FROM refund_records WHERE id = ?7)",
      params: [
        newPrefixedId('aud'),
        input.actorUserId,
        paid ? 'ticket.refund' : 'ticket.cancel',
        order.id,
        JSON.stringify({ refundRecordId: recordId, tickets: ids, reason: reason.slice(0, 200) }),
        input.now,
        recordId,
      ],
    },
  ];
  if (!paid)
    specs.push({
      sql: "UPDATE ticket_orders SET status = 'cancelled', cancelled_at = ?2, updated_at = ?2 WHERE id = ?1 AND total_cents = 0 AND status IN ('confirmed', 'paid') AND NOT EXISTS (SELECT 1 FROM tickets WHERE order_id = ?1 AND status = 'valid') AND EXISTS (SELECT 1 FROM refund_records WHERE id = ?3)",
      params: [order.id, input.now, recordId],
    });
  const results = await runBatch(db, specs);
  const changed = ids.filter((_, i) => results[1 + i].length > 0);
  const record = (
    await allRows<{ amount_cents: number; status: string }>(db, {
      sql: 'SELECT amount_cents, status FROM refund_records WHERE id = ?1',
      params: [recordId],
    })
  )[0];
  if (!record || changed.length === 0)
    return { refundId: null, ticketIds: [], amountCents: 0, status: 'nothing_to_do' };
  const recorded = Number(record.amount_cents);
  const event = await loadEvent(db, order.event_id);
  let status: RefundResult['status'] = paid ? 'processed' : 'cancelled_free';
  if (record.status === 'approved')
    status = await finishRefund(db, env, {
      order,
      recordId,
      amountCents: recorded,
      now: input.now,
      fetchImpl: input.fetchImpl,
    });
  if (input.notify !== false && event)
    await sendRefundNoticeEmail(db, env, {
      order,
      eventTitle: event.title,
      ticketCount: changed.length,
      amountCents: paid ? recorded : 0,
      refundId: recordId,
      now: input.now,
    }).catch(() => undefined);
  await notifyWaitlist(db, env, { eventId: order.event_id, now: input.now, origin: input.origin }).catch(
    () => undefined,
  );
  return { refundId: recordId, ticketIds: changed, amountCents: recorded, status };
}

/** Retries one refund whose card refund failed (record still `approved`), with the same idempotency key. */
export async function retryRefund(
  db: SqlDatabase,
  env: TicketingEnv,
  input: { refundRecordId: string; now: number; fetchImpl?: typeof fetch },
): Promise<'processed' | 'refund_pending' | 'nothing_to_do'> {
  const rows = await allRows<{ id: string; order_id: string; amount_cents: number; status: string }>(db, {
    sql: 'SELECT id, order_id, amount_cents, status FROM refund_records WHERE id = ?1',
    params: [input.refundRecordId],
  });
  const record = rows[0];
  if (!record || record.status !== 'approved') return 'nothing_to_do';
  const order = await loadOrder(db, record.order_id);
  if (!order) return 'nothing_to_do';
  return finishRefund(db, env, {
    order,
    recordId: record.id,
    amountCents: Number(record.amount_cents),
    now: input.now,
    fetchImpl: input.fetchImpl,
  });
}

/**
 * Finds `approved` refund records (optionally of one order or event) and repeats them with their original
 * idempotency keys. Records younger than `minAgeSeconds` (default 60) are skipped so a live request that is
 * still talking to Stripe is not raced.
 */
export async function retryPendingRefunds(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    orderId?: string;
    eventId?: string;
    now: number;
    minAgeSeconds?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<{ processed: number; pending: number }> {
  const rows = await allRows<{ id: string }>(db, {
    sql: "SELECT id FROM refund_records WHERE status = 'approved' AND created_at <= ?1 AND (?2 IS NULL OR order_id = ?2) AND (?3 IS NULL OR event_id = ?3) ORDER BY created_at LIMIT 50",
    params: [input.now - (input.minAgeSeconds ?? 60), input.orderId ?? null, input.eventId ?? null],
  });
  let processed = 0;
  let pending = 0;
  for (const r of rows) {
    const result = await retryRefund(db, env, {
      refundRecordId: r.id,
      now: input.now,
      fetchImpl: input.fetchImpl,
    }).catch(() => 'refund_pending' as const);
    if (result === 'processed') processed++;
    else if (result === 'refund_pending') pending++;
  }
  return { processed, pending };
}

/**
 * Full refund of a payment that issued no tickets (paid after the hold expired and stock was gone, or an
 * amount mismatch). Records the refund and returns false when the card refund failed (staff alerted).
 */
export async function refundUnfulfilledPayment(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    order: OrderRow;
    amountCents: number;
    paymentIntentId: string | null;
    reason: string;
    now: number;
    fetchImpl?: typeof fetch;
  },
): Promise<boolean> {
  const recordId = `rfd_auto_${input.order.id}`;
  await db
    .prepare(
      "INSERT INTO refund_records (id, order_id, event_id, requested_by_email, approved_by_user_id, amount_cents, reason, status, created_at) VALUES (?1, ?2, ?3, 'system', NULL, ?4, ?5, 'approved', ?6) ON CONFLICT(id) DO NOTHING",
    )
    .bind(recordId, input.order.id, input.order.event_id, input.amountCents, input.reason, input.now)
    .run();
  try {
    const refund = await stripeTestRefund(env, {
      paymentIntentId: input.paymentIntentId,
      amountCents: input.amountCents,
      idempotencyKey: `refund_${recordId}`,
      metadata: { orderId: input.order.id, refundRecordId: recordId },
      fetchImpl: input.fetchImpl,
    });
    await db
      .prepare(
        "UPDATE refund_records SET status = 'processed', stripe_refund_id = ?2, processed_at = ?3 WHERE id = ?1 AND status = 'approved'",
      )
      .bind(recordId, refund.id, input.now)
      .run();
    return true;
  } catch {
    return false;
  }
}

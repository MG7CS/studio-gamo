/**
 * Refunds and ticket cancellation (design §5.2 "Refunds"): per ticket, cumulative, only the chosen
 * tickets change. Sequence (no ticket is ever both valid and refunded, no money moves twice):
 *
 *   1. one batch marks exactly the chosen tickets `refunded` (paid) or `voided` (free); each statement is
 *      conditional, so of two concurrent refunds of one ticket only one sees it change; the trigger gives
 *      the seats back once;
 *   2. a `refund_records` row (status `approved`) for the amount of the tickets that really changed;
 *   3. the Stripe test refund with idempotency key `refund_<recordId>` (paid only; local: simulated);
 *   4. one batch adds the amount to the order (trigger: never above the total), the refunded quantity to
 *      each item, and marks the record `processed`.
 * If step 3 fails, the record stays `approved` and `retryRefund` repeats it with the same key.
 */
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../../security/sql-database.ts';
import { newPrefixedId, randomBase32 } from '../../security/index.ts';
import {
  addItemRefundedQuantityStatement,
  addOrderRefundStatement,
  refundTicketStatement,
  transitionOrderStatement,
  voidTicketStatement,
} from '../../ticketing/sql.ts';
import { createStripeTestClient } from '@studio-gamo/integrations/stripe';
import { paidCheckoutMode } from './checkout.ts';
import { notifyWaitlist } from './checkout-waitlist.ts';
import { sendRefundNoticeEmail, sendStaffAlertEmail } from './email.ts';
import {
  TicketingError,
  auditLogStatement,
  loadEvent,
  loadOrder,
  loadOrderItems,
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

async function finishRefund(
  db: SqlDatabase,
  env: TicketingEnv,
  input: {
    order: OrderRow;
    recordId: string;
    amountCents: number;
    itemCounts: Map<string, number>;
    now: number;
    fetchImpl?: typeof fetch;
  },
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
  const specs: SqlStatementSpec[] = [];
  for (const [itemId, n] of input.itemCounts)
    specs.push(addItemRefundedQuantityStatement({ orderItemId: itemId, quantity: n, now: input.now }));
  if (input.amountCents > 0)
    specs.push(
      addOrderRefundStatement({ orderId: input.order.id, amountCents: input.amountCents, now: input.now }),
    );
  specs.push({
    sql: "UPDATE refund_records SET status = 'processed', stripe_refund_id = ?2, processed_at = ?3 WHERE id = ?1 AND status = 'approved'",
    params: [input.recordId, stripeId, input.now],
  });
  await runBatch(db, specs);
  return 'processed';
}

/**
 * Refunds (paid) or cancels (free) the chosen tickets of an order; all valid tickets when none are given.
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
    (t) => t.status === 'valid' || (paid && t.status === 'voided' && t.refunded_at === null),
  );
  if (eligible.length === 0)
    return { refundId: null, ticketIds: [], amountCents: 0, status: 'nothing_to_do' };

  // 1. Tickets first (conditional, one batch).
  const results = await runBatch(
    db,
    eligible.map((t) =>
      paid
        ? refundTicketStatement({ ticketId: t.id, now: input.now })
        : voidTicketStatement({ ticketId: t.id, reason: 'organizer', now: input.now }),
    ),
  );
  const changed = eligible.filter((_, i) => results[i].length > 0);
  if (changed.length === 0) return { refundId: null, ticketIds: [], amountCents: 0, status: 'nothing_to_do' };
  const items = await loadOrderItems(db, order.id);
  const itemCounts = new Map<string, number>();
  let amount = 0;
  for (const t of changed) {
    const item = items.find((i) => i.id === t.order_item_id);
    if (!item) continue;
    itemCounts.set(item.id, (itemCounts.get(item.id) ?? 0) + 1);
    amount += Number(item.unit_price_cents);
  }
  amount = Math.min(amount, Number(order.total_cents) - Number(order.amount_refunded_cents));
  const event = await loadEvent(db, order.event_id);

  // 2. The record (and audit) for exactly what changed.
  const recordId = newPrefixedId('rfd');
  await runBatch(db, [
    {
      sql: 'INSERT INTO refund_records (id, order_id, event_id, requested_by_email, approved_by_user_id, amount_cents, reason, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
      params: [
        recordId,
        order.id,
        order.event_id,
        input.actorLabel ?? 'organizer',
        input.actorUserId,
        amount,
        reason.slice(0, 500),
        paid && amount > 0 ? 'approved' : 'processed',
        input.now,
      ],
    },
    auditLogStatement({
      actorUserId: input.actorUserId,
      action: paid ? 'ticket.refund' : 'ticket.cancel',
      entityType: 'order',
      entityId: order.id,
      payload: {
        refundRecordId: recordId,
        tickets: changed.map((t) => t.id),
        amountCents: amount,
        reason: reason.slice(0, 200),
      },
      now: input.now,
    }),
  ]);

  let status: RefundResult['status'] = 'cancelled_free';
  if (paid && amount > 0) {
    status = await finishRefund(db, env, {
      order,
      recordId,
      amountCents: amount,
      itemCounts,
      now: input.now,
      fetchImpl: input.fetchImpl,
    });
  } else {
    const specs: SqlStatementSpec[] = [...itemCounts].map(([itemId, n]) =>
      addItemRefundedQuantityStatement({ orderItemId: itemId, quantity: n, now: input.now }),
    );
    await runBatch(db, specs);
  }
  // A free order with no valid ticket left is cancelled.
  if (!paid) {
    const left = (await loadOrderTickets(db, order.id)).filter((t) => t.status === 'valid').length;
    if (left === 0)
      await runBatch(db, [
        transitionOrderStatement({
          orderId: order.id,
          from: ['confirmed'],
          to: 'cancelled',
          now: input.now,
          set: { cancelledAt: input.now },
        }),
      ]);
  }
  if (input.notify !== false && event)
    await sendRefundNoticeEmail(db, env, {
      order,
      eventTitle: event.title,
      ticketCount: changed.length,
      amountCents: paid ? amount : 0,
      refundId: recordId,
      now: input.now,
    }).catch(() => undefined);
  await notifyWaitlist(db, env, { eventId: order.event_id, now: input.now, origin: input.origin }).catch(
    () => undefined,
  );
  return { refundId: recordId, ticketIds: changed.map((t) => t.id), amountCents: amount, status };
}

/** Retries a refund whose card refund failed (record still `approved`), with the same idempotency key. */
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
  // Item quantities were already counted from the refunded tickets; recompute them from the audit payload.
  const audit = await allRows<{ payload_json: string }>(db, {
    sql: "SELECT payload_json FROM audit_logs WHERE entity_type = 'order' AND entity_id = ?1 AND action = 'ticket.refund' ORDER BY created_at DESC",
    params: [order.id],
  });
  const tickets = await loadOrderTickets(db, order.id);
  const ids = new Set<string>();
  for (const a of audit) {
    try {
      const p = JSON.parse(a.payload_json) as { refundRecordId?: string; tickets?: string[] };
      if (p.refundRecordId === record.id) for (const t of p.tickets ?? []) ids.add(t);
    } catch {
      // ignore malformed audit payloads
    }
  }
  const itemCounts = new Map<string, number>();
  for (const t of tickets)
    if (ids.has(t.id) && t.order_item_id)
      itemCounts.set(t.order_item_id, (itemCounts.get(t.order_item_id) ?? 0) + 1);
  return finishRefund(db, env, {
    order,
    recordId: record.id,
    amountCents: Number(record.amount_cents),
    itemCounts,
    now: input.now,
    fetchImpl: input.fetchImpl,
  });
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

/**
 * Card disputes (chargebacks) on paid orders (docs/LIVE_REQUIREMENTS.md §8.2 item 12, docs/LIVE_PAYMENTS.md §4–§6):
 * `charge.dispute.created`, `charge.dispute.updated` and `charge.dispute.closed`. A dispute row per Stripe dispute;
 * while one is open with money withdrawn the order is marked `disputed`, its unscanned valid tickets are voided and
 * the ledger records the money taken back (`dispute`); a dispute won gives the money back (`dispute_reversal`) and the
 * voided tickets become valid again. Inquiries (`warning_*` statuses) take no money and void nothing.
 *
 * Handlers are idempotent and tolerate any order of delivery: a dispute for an order not known yet answers `retry`;
 * a late `created` after `closed` does not reopen anything.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import { ledgerForDispute } from './ledger.ts';
import {
  DISPUTE_OUTCOMES,
  type DisputeOutcome,
  type HandlerResult,
  type StripeEvent,
  type WebhookContext,
} from './paid-types.ts';
import { loadPaidOrderByPayment, type PaidOrder } from './tickets.ts';

interface StripeDispute {
  id: string;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  paymentIntentId: string | null;
}

function disputeOf(event: StripeEvent): StripeDispute | null {
  const o = event.data?.object ?? {};
  if (typeof o.id !== 'string' || !o.id) return null;
  const pi = o.payment_intent;
  return {
    id: o.id,
    amount: Number.isInteger(o.amount) ? Number(o.amount) : 0,
    currency: typeof o.currency === 'string' ? o.currency : 'usd',
    reason: typeof o.reason === 'string' ? o.reason.slice(0, 100) : null,
    status: typeof o.status === 'string' ? o.status.slice(0, 40) : 'unknown',
    paymentIntentId:
      typeof pi === 'string'
        ? pi
        : pi && typeof (pi as { id?: unknown }).id === 'string'
          ? String((pi as { id: string }).id)
          : null,
  };
}

/** An inquiry or early warning: no money has been withdrawn. */
const isInquiry = (status: string) => status.startsWith('warning_');

interface DisputeRow {
  id: string;
  closed_at: number | null;
}

async function disputeRow(db: SqlDatabase, stripeDisputeId: string): Promise<DisputeRow | null> {
  return (
    (
      await allRows<DisputeRow>(db, {
        sql: 'SELECT id, closed_at FROM disputes WHERE stripe_dispute_id = ?1',
        params: [stripeDisputeId],
      })
    )[0] ?? null
  );
}

function upsertDispute(orderId: string, d: StripeDispute, now: number, closed: boolean): SqlStatementSpec {
  const outcome = (DISPUTE_OUTCOMES as readonly string[]).includes(d.status)
    ? (d.status as DisputeOutcome)
    : null;
  return {
    sql: `INSERT INTO disputes (id, order_id, stripe_dispute_id, amount_cents, currency, reason, status, outcome, created_at, closed_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?9)
          ON CONFLICT (stripe_dispute_id) DO UPDATE SET
            status = excluded.status, amount_cents = excluded.amount_cents, reason = COALESCE(excluded.reason, disputes.reason),
            outcome = COALESCE(excluded.outcome, disputes.outcome), closed_at = COALESCE(disputes.closed_at, excluded.closed_at),
            updated_at = excluded.updated_at
          WHERE disputes.closed_at IS NULL`,
    params: [
      newPrefixedId('dsp'),
      orderId,
      d.id,
      Math.max(0, d.amount),
      d.currency,
      d.reason,
      d.status,
      closed ? outcome : null,
      now,
      closed ? now : null,
    ],
  };
}

const ledgerBase = (order: PaidOrder, disputeId: string, d: StripeDispute, now: number) => ({
  disputeId,
  orderId: order.id,
  organizationId: order.organizationId,
  eventId: order.eventId,
  fundsFlow: order.fundsFlow,
  amountCents: Math.max(0, d.amount),
  currency: d.currency,
  occurredAt: now,
});

/** The order flag follows whether any dispute with money withdrawn is still open. */
function syncDisputedFlag(orderId: string, now: number): SqlStatementSpec {
  return {
    sql: `UPDATE orders SET disputed = CASE WHEN EXISTS (SELECT 1 FROM disputes WHERE order_id = ?1 AND closed_at IS NULL
                                               AND status NOT LIKE 'warning\\_%' ESCAPE '\\') THEN 1 ELSE 0 END,
                 updated_at = ?2
           WHERE id = ?1`,
    params: [orderId, now],
  };
}

async function findOrder(db: SqlDatabase, event: StripeEvent, d: StripeDispute) {
  if (!d.paymentIntentId) return null;
  const order = await loadPaidOrderByPayment(db, { paymentIntentId: d.paymentIntentId });
  // Mode A disputes arrive on the Connect endpoint with the order's account; Mode B on the platform without one.
  if (order && (event.account ?? null) !== order.stripeAccountId) return 'mismatch' as const;
  return order;
}

/** `charge.dispute.created` and `charge.dispute.updated`. */
export async function handleDisputeOpenedOrUpdated(
  event: StripeEvent,
  ctx: WebhookContext,
): Promise<HandlerResult> {
  const d = disputeOf(event);
  if (!d) return 'ignored';
  const order = await findOrder(ctx.db, event, d);
  if (order === 'mismatch') {
    console.warn('[live:webhook] dispute_account_mismatch');
    return 'ignored';
  }
  // Disputes come days after a payment, so an unknown one is not Gamo's (an organization's other sales in Mode A).
  if (!order) return 'ignored';
  await runBatch(ctx.db, [upsertDispute(order.id, d, ctx.now, false)]);
  const row = await disputeRow(ctx.db, d.id);
  if (!row || row.closed_at != null) return 'processed';
  const statements: SqlStatementSpec[] = [];
  if (!isInquiry(d.status)) {
    statements.push({
      sql: `UPDATE tickets SET status = 'voided', updated_at = ?2
             WHERE order_id = ?1 AND status = 'valid' AND checked_in_at IS NULL`,
      params: [order.id, ctx.now],
    });
    statements.push(...ledgerForDispute({ ...ledgerBase(order, row.id, d, ctx.now), phase: 'opened' }));
  }
  statements.push(syncDisputedFlag(order.id, ctx.now));
  await runBatch(ctx.db, statements);
  return 'processed';
}

/** `charge.dispute.closed`: won → money back and tickets valid again; lost or inquiry closed → recorded. */
export async function handleDisputeClosed(event: StripeEvent, ctx: WebhookContext): Promise<HandlerResult> {
  const d = disputeOf(event);
  if (!d) return 'ignored';
  const order = await findOrder(ctx.db, event, d);
  if (order === 'mismatch') {
    console.warn('[live:webhook] dispute_account_mismatch');
    return 'ignored';
  }
  // Disputes come days after a payment, so an unknown one is not Gamo's (an organization's other sales in Mode A).
  if (!order) return 'ignored';
  const before = await disputeRow(ctx.db, d.id);
  if (before?.closed_at != null) return 'processed';
  await runBatch(ctx.db, [upsertDispute(order.id, d, ctx.now, true)]);
  const row = await disputeRow(ctx.db, d.id);
  if (!row) return 'retry';
  const statements: SqlStatementSpec[] = [syncDisputedFlag(order.id, ctx.now)];
  if (d.status === 'won') {
    const opened = await allRows(ctx.db, {
      sql: 'SELECT 1 AS ok FROM ledger_entries WHERE source_key = ?1',
      params: [`dispute:${row.id}:opened`],
    });
    if (opened.length)
      statements.push(...ledgerForDispute({ ...ledgerBase(order, row.id, d, ctx.now), phase: 'won' }));
    // Tickets voided by the dispute come back, unless another dispute is still open or the order is no longer paid.
    statements.push({
      sql: `UPDATE tickets SET status = 'valid', updated_at = ?2
             WHERE order_id = ?1 AND status = 'voided'
               AND EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND disputed = 0 AND status IN ('paid', 'partially_refunded'))`,
      params: [order.id, ctx.now],
    });
  }
  await runBatch(ctx.db, statements);
  return 'processed';
}

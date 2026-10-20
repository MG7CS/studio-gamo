/**
 * Refunds for paid orders (docs/LIVE_REQUIREMENTS.md §8.2 items 16–17 and 12's automatic refund, §8.3 item 25,
 * §8.6 item 36; docs/LIVE_PAYMENTS.md §5):
 *
 * - The amount is always computed here from the order's snapshot (never from a form): the chosen tickets' unit price
 *   less their share of the line discount, plus their Gamo fee when the buyer paid it; the gift only with the whole
 *   order or when the organizer chooses; never above what remains (total − refunded − refunds in flight).
 * - A buyer asks within the policy that applies to the order (`policyForOrder`: the snapshot, or the current policy
 *   when better for the buyer); the organizer approves or declines, or refunds directly; in Mode B (Gamo is the
 *   seller) the admin can refund too. Canceling an event or a payment that could not be fulfilled refunds in full.
 * - One batch per refund reserves it: the refund row with the server amount and the chosen tickets flipped
 *   `valid → refunded` conditionally (a ticket already checked in or refunded cannot be refunded again; a refund
 *   racing a check-in or another refund: exactly one wins, the other batch rolls back). When the money has moved
 *   (Stripe `succeeded`, cash, or nothing to pay back) the ledger rows are written and the order's refunded amount is
 *   settled with ONE shared statement (`settleRefundedAmountStatement`), also used by the `charge.refunded` webhook,
 *   so the two paths never double count.
 * - Stripe refunds use the order's own routing (`order-routing.ts`) and the idempotency key `refund_<refund id>`.
 *
 * Refunded seats are not put back on sale (proposal: the organizer can raise capacity); this keeps a failed refund
 * able to give its tickets back without fighting inventory limits.
 */
import { newPrefixedId } from '../security/ids.ts';
import { hashPii } from '../security/pii-hash.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { checkRateLimits, rateLimitBucket } from '../security/rate-limit.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import { ledgerForRefund } from './ledger.ts';
import {
  PaidError,
  STRIPE_METHODS,
  type PaidEnv,
  type RefundMethod,
  type RefundRequester,
  type RefundStatus,
} from './paid-types.ts';
import { StripeApiError, type PaymentRouting, type StripeRefund } from './payments/types.ts';
import {
  assertInBatch,
  isBatchAssertion,
  loadOrderTickets,
  loadPaidOrder,
  policyForOrder,
  refundDeadline,
  type OrderTicket,
  type PaidOrder,
} from './tickets.ts';

export const REFUND_REASON_MAX = 500;
export const CASH_REFUND_REASON_MAX = 200;

/** Who is refunding. Organizers act for their organization; the admin only where Gamo is the seller. */
export type RefundActor =
  { kind: 'organizer'; organizationId: string } | { kind: 'admin' } | { kind: 'system' };

export interface RefundRow {
  id: string;
  orderId: string;
  ticketIds: string[];
  amountCents: number;
  giftCents: number;
  feeCents: number;
  currency: string;
  method: RefundMethod;
  requestedBy: RefundRequester;
  reason: string | null;
  status: RefundStatus;
  stripeRefundId: string | null;
  cashSessionId: string | null;
  decidedNote: string | null;
  createdAt: number;
}

function parseIds(json: unknown): string[] {
  if (typeof json !== 'string') return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function refundFromRow(r: Record<string, unknown>): RefundRow {
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    ticketIds: parseIds(r.ticket_ids),
    amountCents: Number(r.amount_cents),
    giftCents: Number(r.gift_cents),
    feeCents: Number(r.fee_cents),
    currency: String(r.currency ?? 'usd'),
    method: r.method as RefundMethod,
    requestedBy: r.requested_by as RefundRequester,
    reason: r.reason == null ? null : String(r.reason),
    status: r.status as RefundStatus,
    stripeRefundId: r.stripe_refund_id == null ? null : String(r.stripe_refund_id),
    cashSessionId: r.cash_session_id == null ? null : String(r.cash_session_id),
    decidedNote: r.decided_note == null ? null : String(r.decided_note),
    createdAt: Number(r.created_at),
  };
}

export async function loadRefund(db: SqlDatabase, refundId: string): Promise<RefundRow | null> {
  const row = (await allRows(db, { sql: 'SELECT * FROM refunds WHERE id = ?1', params: [refundId] }))[0];
  return row ? refundFromRow(row) : null;
}

export async function listOrderRefunds(db: SqlDatabase, orderId: string): Promise<RefundRow[]> {
  const rows = await allRows(db, {
    sql: 'SELECT * FROM refunds WHERE order_id = ?1 ORDER BY created_at, rowid',
    params: [orderId],
  });
  return rows.map(refundFromRow);
}

// ── Amounts ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A line's discount or fee spread over its tickets: the first `remainder` seats carry one cent more. */
function shareOf(totalCents: number, quantity: number, seq: number): number {
  const q = Math.max(1, quantity);
  const base = Math.floor(totalCents / q);
  return base + (seq <= totalCents - base * q ? 1 : 0);
}

/** What one ticket brings back: its price less its discount share (+ its fee when the buyer paid it), and its fee. */
export function ticketRefundShare(
  t: Pick<OrderTicket, 'unitPriceCents' | 'itemQuantity' | 'itemDiscountCents' | 'itemFeeCents' | 'seq'>,
  feePayer: PaidOrder['feePayer'],
): { amountCents: number; feeCents: number } {
  const discount = shareOf(t.itemDiscountCents, t.itemQuantity, t.seq);
  const fee = shareOf(t.itemFeeCents, t.itemQuantity, t.seq);
  return { amountCents: t.unitPriceCents - discount + (feePayer === 'buyer' ? fee : 0), feeCents: fee };
}

export interface RefundAmount {
  amountCents: number;
  giftCents: number;
  /** The Gamo fee part given back (passed-on fee returned, or an absorbed fee reversed). */
  feeCents: number;
  ticketIds: string[];
}

interface MoneyState {
  /** What has been paid back already. */
  refundedCents: number;
  /** Refunds reserved but not completed (status `pending`). */
  inFlightCents: number;
  /** Gift already given back or on its way. */
  giftOutCents: number;
}

async function moneyState(db: SqlDatabase, order: PaidOrder): Promise<MoneyState> {
  const row = (
    await allRows<{ pending: number; gift: number }>(db, {
      sql: `SELECT COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_cents ELSE 0 END), 0) AS pending,
                   COALESCE(SUM(CASE WHEN status IN ('pending', 'succeeded') THEN gift_cents ELSE 0 END), 0) AS gift
              FROM refunds WHERE order_id = ?1`,
      params: [order.id],
    })
  )[0];
  return {
    refundedCents: order.amountRefundedCents,
    inFlightCents: Number(row?.pending ?? 0),
    giftOutCents: Number(row?.gift ?? 0),
  };
}

/**
 * The refundable amount for the chosen tickets of an order (pure). `includeGift`: `true` (the organizer chooses),
 * `false`, or `'whole_order'` (only when the chosen tickets are every ticket still valid). Never more than remains.
 */
export function refundableAmount(
  order: Pick<PaidOrder, 'feePayer' | 'giftCents' | 'totalCents'>,
  tickets: readonly OrderTicket[],
  chosenIds: readonly string[],
  includeGift: boolean | 'whole_order',
  state: MoneyState,
): RefundAmount {
  const chosen = new Set(chosenIds);
  let amount = 0;
  let fee = 0;
  for (const t of tickets) {
    if (!chosen.has(t.id)) continue;
    const share = ticketRefundShare(t, order.feePayer);
    amount += share.amountCents;
    fee += share.feeCents;
  }
  const whole = tickets.filter((t) => t.status === 'valid').every((t) => chosen.has(t.id));
  const giftWanted = includeGift === true || (includeGift === 'whole_order' && whole);
  let gift = giftWanted ? Math.max(0, order.giftCents - state.giftOutCents) : 0;
  const remaining = Math.max(0, order.totalCents - state.refundedCents - state.inFlightCents);
  amount = Math.min(amount + gift, remaining);
  gift = Math.min(gift, amount);
  fee = Math.max(0, Math.min(fee, amount - gift));
  return { amountCents: amount, giftCents: gift, feeCents: fee, ticketIds: [...chosen] };
}

// ── Statements ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The ONE statement that settles an order's refunded amount and status, used by every refund path and by the
 * `charge.refunded` webhook: `min(total, max(current, sum of succeeded refunds, Stripe's amount_refunded))`. Taking
 * the maximum (not a sum) means the same money seen twice is counted once.
 */
export function settleRefundedAmountStatement(
  orderId: string,
  stripeAmountRefundedCents: number,
  now: number,
): SqlStatementSpec {
  const amount = `MIN(total_cents, MAX(amount_refunded_cents,
      COALESCE((SELECT SUM(amount_cents) FROM refunds WHERE order_id = ?1 AND status = 'succeeded'), 0), ?2))`;
  return {
    sql: `UPDATE orders SET
            amount_refunded_cents = ${amount},
            status = CASE
              WHEN status NOT IN ('paid', 'partially_refunded', 'refunded') THEN status
              WHEN total_cents > 0 AND ${amount} >= total_cents THEN 'refunded'
              WHEN ${amount} > 0 THEN 'partially_refunded'
              WHEN total_cents = 0 AND NOT EXISTS (SELECT 1 FROM tickets WHERE order_id = ?1 AND status = 'valid')
                   AND EXISTS (SELECT 1 FROM refunds WHERE order_id = ?1 AND status = 'succeeded') THEN 'refunded'
              ELSE status END,
            updated_at = ?3
          WHERE id = ?1`,
    params: [orderId, Math.max(0, Math.trunc(stripeAmountRefundedCents)), now],
  };
}

const placeholders = (from: number, n: number) =>
  Array.from({ length: n }, (_, i) => `?${from + i}`).join(', ');

/** Aborts the batch unless every chosen ticket is still valid (and, unless `allowCheckedIn`, not checked in). */
function ticketsStillRefundable(
  orderId: string,
  ticketIds: readonly string[],
  allowCheckedIn: boolean,
  /** A buyer's request: the tickets must still be the buyer's (not passed on to someone else meanwhile). */
  untransferred = false,
) {
  return assertInBatch(
    `(SELECT COUNT(*) FROM tickets WHERE order_id = ?1 AND status = 'valid'
        ${allowCheckedIn ? '' : 'AND checked_in_at IS NULL'} ${untransferred ? 'AND transfer_count = 0' : ''} AND id IN (${placeholders(2, ticketIds.length)})) = ${ticketIds.length}`,
    [orderId, ...ticketIds],
    'tickets_not_refundable',
  );
}

function flipTickets(orderId: string, ticketIds: readonly string[], now: number): SqlStatementSpec {
  return {
    sql: `UPDATE tickets SET status = 'refunded', updated_at = ?2
           WHERE order_id = ?1 AND status = 'valid' AND id IN (${placeholders(3, ticketIds.length)})`,
    params: [orderId, now, ...ticketIds],
  };
}

/** Marks a reserved refund succeeded, writes its ledger rows and settles the order (no-ops when already done). */
export function completeRefundStatements(
  refund: Pick<
    RefundRow,
    'id' | 'orderId' | 'amountCents' | 'giftCents' | 'feeCents' | 'method' | 'currency'
  >,
  order: Pick<
    PaidOrder,
    'id' | 'organizationId' | 'eventId' | 'fundsFlow' | 'feePayer' | 'status' | 'isPreview'
  >,
  now: number,
  stripeAmountRefundedCents = 0,
): SqlStatementSpec[] {
  // A preview or a payment that never became a sale wrote no sale rows, so its refund writes none either.
  const recordedSale = !order.isPreview && order.status !== 'paid_unfulfilled';
  const out: SqlStatementSpec[] = [
    {
      sql: `UPDATE refunds SET status = 'succeeded', completed_at = ?2, updated_at = ?2
             WHERE id = ?1 AND status IN ('pending', 'requested')`,
      params: [refund.id, now],
    },
  ];
  if (refund.amountCents > 0 && refund.method !== 'none' && recordedSale)
    out.push(
      ...ledgerForRefund({
        refundId: refund.id,
        orderId: order.id,
        organizationId: order.organizationId,
        eventId: order.eventId,
        fundsFlow: order.fundsFlow,
        method: refund.method === 'cash' ? 'cash' : 'stripe',
        amountCents: refund.amountCents,
        giftCents: refund.giftCents,
        feeCents: refund.feeCents,
        feeAbsorbed: order.feePayer === 'organizer',
        currency: refund.currency,
        occurredAt: now,
      }),
    );
  out.push(settleRefundedAmountStatement(order.id, stripeAmountRefundedCents, now));
  return out;
}

/** A refund that will not happen: its tickets are valid again (only while it was still in flight). */
export function failRefundStatements(
  refundId: string,
  now: number,
  status: 'failed' | 'canceled' = 'failed',
) {
  return [
    {
      sql: `UPDATE tickets SET status = 'valid', updated_at = ?2
             WHERE status = 'refunded'
               AND id IN (SELECT value FROM json_each((SELECT ticket_ids FROM refunds WHERE id = ?1 AND status = 'pending')))
               AND order_id = (SELECT order_id FROM refunds WHERE id = ?1)`,
      params: [refundId, now],
    },
    {
      sql: `UPDATE refunds SET status = ?3, updated_at = ?2, completed_at = ?2 WHERE id = ?1 AND status = 'pending'`,
      params: [refundId, now, status],
    },
  ] satisfies SqlStatementSpec[];
}

/** Insert a refund row only while the order still has `amount` left once refunds in flight are counted. */
function insertRefundStatement(r: {
  id: string;
  orderId: string;
  amount: RefundAmount;
  method: RefundMethod;
  requestedBy: RefundRequester;
  reason: string | null;
  status: RefundStatus;
  cashSessionId?: string | null;
  now: number;
  /** Refuse when another refund with this requester and reason is in flight or done (one full refund per cause). */
  uniqueCause?: boolean;
}): SqlStatementSpec {
  return {
    sql: `INSERT INTO refunds (id, order_id, ticket_ids, amount_cents, gift_cents, fee_cents, currency, method,
                               requested_by, reason, status, cash_session_id, created_at, updated_at, completed_at)
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, r.currency, ?7, ?8, ?9, ?10, ?11, ?12, ?12, CASE WHEN ?10 = 'succeeded' THEN ?12 END
            FROM orders r
           WHERE r.id = ?2
             AND ?4 <= r.total_cents - r.amount_refunded_cents
                      - COALESCE((SELECT SUM(amount_cents) FROM refunds WHERE order_id = ?2 AND status = 'pending'), 0)
             AND (?13 = 0 OR NOT EXISTS (SELECT 1 FROM refunds WHERE order_id = ?2 AND requested_by = ?8
                                           AND reason IS ?9 AND status IN ('pending', 'succeeded')))`,
    params: [
      r.id,
      r.orderId,
      JSON.stringify(r.amount.ticketIds),
      r.amount.amountCents,
      r.amount.giftCents,
      r.amount.feeCents,
      r.method,
      r.requestedBy,
      r.reason,
      r.status,
      r.cashSessionId ?? null,
      r.now,
      r.uniqueCause ? 1 : 0,
    ],
  };
}

const changedOne = (label: string) => assertInBatch('changes() = 1', [], label);

async function runRefundBatch(db: SqlDatabase, statements: SqlStatementSpec[]): Promise<void> {
  try {
    await runBatch(db, statements);
  } catch (error) {
    if (isBatchAssertion(error)) throw new PaidError('already_done', { detail: 'refund_conflict' });
    throw error;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────────────────

const REFUNDABLE_ORDER = new Set(['paid', 'partially_refunded']);

function assertActor(actor: RefundActor, order: PaidOrder): void {
  if (actor.kind === 'organizer' && actor.organizationId !== order.organizationId)
    throw new PaidError('forbidden');
  if (actor.kind === 'admin' && order.seller !== 'gamo')
    throw new PaidError('forbidden', { detail: 'not_gamo_seller' });
}

const requesterOf = (actor: RefundActor): RefundRequester =>
  actor.kind === 'admin' ? 'admin' : actor.kind === 'system' ? 'system' : 'organizer';

function cleanReason(reason: unknown, max = REFUND_REASON_MAX): string | null {
  const text = String(reason ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, max) : null;
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map(String))];
}

/** Ticket ids already in a refund that is asked for or in flight. */
async function ticketsInOpenRefunds(db: SqlDatabase, orderId: string): Promise<Set<string>> {
  const rows = await allRows<{ value: string }>(db, {
    sql: `SELECT j.value FROM refunds r, json_each(r.ticket_ids) j
           WHERE r.order_id = ?1 AND r.status IN ('requested', 'pending')`,
    params: [orderId],
  });
  return new Set(rows.map((r) => String(r.value)));
}

export interface OrganizationOwner {
  email: string;
  name: string;
}

/** The organization's owners (for refund-request emails). */
export async function organizationOwners(
  db: SqlDatabase,
  organizationId: string,
): Promise<OrganizationOwner[]> {
  const rows = await allRows<{ email: string; display_name: string | null }>(db, {
    sql: `SELECT z.email, z.display_name FROM memberships m JOIN organizers z ON z.id = m.organizer_id
           WHERE m.organization_id = ?1 AND m.role = 'owner' ORDER BY z.email`,
    params: [organizationId],
  });
  return rows.filter((r) => r.email).map((r) => ({ email: r.email, name: r.display_name ?? '' }));
}

// ── What the buyer may do ──────────────────────────────────────────────────────────────────────────────────────

export type RefundBlockReason =
  | 'policy_none'
  | 'deadline_passed'
  | 'not_card_payment'
  | 'order_status'
  | 'disputed'
  | 'nothing_refundable'
  | 'preview';

export interface BuyerRefundOptions {
  allowed: boolean;
  reason: RefundBlockReason | null;
  /** Until when a request is accepted (null when the policy allows none). */
  deadline: number | null;
  /** Tickets the buyer may ask a refund for: valid, not checked in, not transferred, not already asked for. */
  ticketIds: string[];
}

/** Whether and for which tickets the buyer may ask a refund now (pure, given the policy that applies). */
export function buyerRefundOptions(
  order: PaidOrder,
  tickets: readonly OrderTicket[],
  policy: Parameters<typeof refundDeadline>[0],
  openTicketIds: ReadonlySet<string>,
  now: number,
): BuyerRefundOptions {
  const deadline = refundDeadline(policy, order.startsAt);
  const ticketIds = tickets
    .filter(
      (t) =>
        t.status === 'valid' && t.checkedInAt == null && t.transferCount === 0 && !openTicketIds.has(t.id),
    )
    .map((t) => t.id);
  const block = (reason: RefundBlockReason): BuyerRefundOptions => ({
    allowed: false,
    reason,
    deadline,
    ticketIds,
  });
  if (order.isPreview) return block('preview');
  if (!REFUNDABLE_ORDER.has(order.status)) return block('order_status');
  if (order.disputed) return block('disputed');
  if (!STRIPE_METHODS.includes(order.paymentMethod)) return block('not_card_payment');
  if (deadline == null) return block('policy_none');
  if (now >= deadline) return block('deadline_passed');
  if (ticketIds.length === 0) return block('nothing_refundable');
  return { allowed: true, reason: null, deadline, ticketIds };
}

// ── Buyer request, organizer decision ──────────────────────────────────────────────────────────────────────────

export interface RefundRequested {
  refundId: string;
  amountCents: number;
  order: PaidOrder;
  owners: OrganizationOwner[];
}

/**
 * A buyer asks for a refund of some of their tickets (from the order page, whose link the caller verified). Within
 * the policy only; the amount is computed here; the organizer then approves or declines. Returns the owners to tell.
 */
export async function requestRefund(
  db: SqlDatabase,
  env: PaidEnv,
  input: { orderId: string; ticketIds: readonly string[]; reason?: string | null; now: number },
): Promise<RefundRequested> {
  const ids = uniqueIds(input.ticketIds);
  if (ids.length === 0 || ids.length > 50) throw new PaidError('invalid', { detail: 'ticketIds' });
  const order = await loadPaidOrder(db, input.orderId);
  if (!order) throw new PaidError('not_found');
  const limit = await checkRateLimits(
    db,
    [
      {
        bucket: rateLimitBucket(
          'live.refund-request',
          'key',
          await hashPii(
            `order:${order.id}`,
            resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET'),
          ),
        ),
        limit: 5,
        windowSeconds: 3600,
      },
    ],
    input.now,
  );
  if (!limit.allowed) throw new PaidError('rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
  const tickets = await loadOrderTickets(db, order.id);
  const policy = await policyForOrder(db, order);
  const open = await ticketsInOpenRefunds(db, order.id);
  const options = buyerRefundOptions(order, tickets, policy, open, input.now);
  if (!options.allowed) {
    if (options.reason === 'policy_none' || options.reason === 'deadline_passed')
      throw new PaidError('policy_forbids', { detail: options.reason });
    if (options.reason === 'nothing_refundable') throw new PaidError('already_done');
    throw new PaidError('invalid', { detail: options.reason ?? 'refund' });
  }
  const allowed = new Set(options.ticketIds);
  if (!ids.every((id) => allowed.has(id))) throw new PaidError('invalid', { detail: 'ticketIds' });
  const amount = refundableAmount(order, tickets, ids, 'whole_order', await moneyState(db, order));
  if (amount.amountCents <= 0) throw new PaidError('already_done');
  const refundId = newPrefixedId('rfd');
  await runRefundBatch(db, [
    // Two requests racing for one ticket: the second finds it in the first one's open request.
    assertInBatch(
      `NOT EXISTS (SELECT 1 FROM refunds r, json_each(r.ticket_ids) j
                    WHERE r.order_id = ?1 AND r.status IN ('requested', 'pending') AND j.value IN (${placeholders(2, ids.length)}))`,
      [order.id, ...ids],
      'already_requested',
    ),
    // A transfer racing this request: whichever writes first wins (the transfer refuses tickets with an open request).
    ticketsStillRefundable(order.id, ids, false, true),
    insertRefundStatement({
      id: refundId,
      orderId: order.id,
      amount,
      method: 'stripe',
      requestedBy: 'buyer',
      reason: cleanReason(input.reason),
      status: 'requested',
      now: input.now,
    }),
    changedOne('refund_not_inserted'),
  ]);
  return {
    refundId,
    amountCents: amount.amountCents,
    order,
    owners: await organizationOwners(db, order.organizationId),
  };
}

export interface RefundDecision {
  refundId: string;
  status: RefundStatus;
  amountCents: number;
  order: PaidOrder;
}

/** The organizer (or, where Gamo is the seller, the admin) declines a buyer's request, with an optional note. */
export async function declineRefund(
  db: SqlDatabase,
  input: { refundId: string; actor: RefundActor; note?: string | null; now: number },
): Promise<RefundDecision> {
  const refund = await loadRefund(db, input.refundId);
  if (!refund) throw new PaidError('not_found');
  const order = await loadPaidOrder(db, refund.orderId);
  if (!order) throw new PaidError('not_found');
  assertActor(input.actor, order);
  if (refund.status !== 'requested') throw new PaidError('already_done');
  const rows = await runBatch(db, [
    {
      sql: `UPDATE refunds SET status = 'declined', decided_note = ?2, decided_at = ?3, updated_at = ?3
             WHERE id = ?1 AND status = 'requested' RETURNING id`,
      params: [refund.id, cleanReason(input.note), input.now],
    },
  ]);
  if (rows[0].length === 0) throw new PaidError('already_done');
  return { refundId: refund.id, status: 'declined', amountCents: refund.amountCents, order };
}

/**
 * Approves a buyer's request: the amount is computed again (never above what remains), the tickets are taken in
 * one batch, then the money is returned through the order's own routing.
 */
export async function approveRefund(
  db: SqlDatabase,
  env: PaidEnv,
  input: {
    refundId: string;
    actor: RefundActor;
    routing: PaymentRouting | null;
    note?: string | null;
    now: number;
  },
): Promise<RefundDecision> {
  const refund = await loadRefund(db, input.refundId);
  if (!refund) throw new PaidError('not_found');
  const order = await loadPaidOrder(db, refund.orderId);
  if (!order) throw new PaidError('not_found');
  assertActor(input.actor, order);
  if (refund.status !== 'requested') throw new PaidError('already_done');
  if (!REFUNDABLE_ORDER.has(order.status)) throw new PaidError('invalid', { detail: 'order_status' });
  if (order.disputed) throw new PaidError('invalid', { detail: 'disputed' });
  const tickets = await loadOrderTickets(db, order.id);
  const amount = refundableAmount(
    order,
    tickets,
    refund.ticketIds,
    refund.giftCents > 0,
    await moneyState(db, order),
  );
  if (amount.amountCents > 0 && !input.routing) throw new PaidError('payments_unavailable');
  await runRefundBatch(db, [
    {
      sql: `UPDATE refunds SET status = 'pending', amount_cents = ?2, gift_cents = ?3, fee_cents = ?4,
                   decided_note = ?5, decided_at = ?6, updated_at = ?6
             WHERE id = ?1 AND status = 'requested'
               AND ?2 <= (SELECT total_cents - amount_refunded_cents FROM orders WHERE id = ?7)
                         - COALESCE((SELECT SUM(amount_cents) FROM refunds WHERE order_id = ?7 AND status = 'pending'), 0)`,
      params: [
        refund.id,
        amount.amountCents,
        amount.giftCents,
        amount.feeCents,
        cleanReason(input.note),
        input.now,
        order.id,
      ],
    },
    changedOne('refund_not_approvable'),
    ...(refund.ticketIds.length
      ? [
          ticketsStillRefundable(order.id, refund.ticketIds, false, refund.requestedBy === 'buyer'),
          flipTickets(order.id, refund.ticketIds, input.now),
        ]
      : []),
  ]);
  return finishReserved(db, env, refund.id, order, input.routing, input.now);
}

// ── Direct refunds (organizer, admin) ──────────────────────────────────────────────────────────────────────────

/**
 * The organizer refunds directly (the whole order or chosen tickets, with the gift when they choose); the admin may
 * do the same for orders where Gamo is the seller. Cash orders are refunded at the door (`recordCashRefund`).
 */
export async function refundDirect(
  db: SqlDatabase,
  env: PaidEnv,
  input: {
    orderId: string;
    /** Tickets to refund; `'all'` = every ticket still valid (and not checked in, unless `includeCheckedIn`). */
    ticketIds: readonly string[] | 'all';
    includeGift: boolean;
    /** Door callers: a valid ticket is refundable even when already checked in (door sales admit at once). */
    includeCheckedIn?: boolean;
    actor: RefundActor;
    reason?: string | null;
    routing: PaymentRouting | null;
    now: number;
  },
): Promise<RefundDecision> {
  const order = await loadPaidOrder(db, input.orderId);
  if (!order) throw new PaidError('not_found');
  assertActor(input.actor, order);
  if (!REFUNDABLE_ORDER.has(order.status)) throw new PaidError('invalid', { detail: 'order_status' });
  if (order.disputed) throw new PaidError('invalid', { detail: 'disputed' });
  if (order.paymentMethod === 'cash') throw new PaidError('invalid', { detail: 'cash_refund_at_door' });
  const tickets = await loadOrderTickets(db, order.id);
  const open = await ticketsInOpenRefunds(db, order.id);
  const withCheckedIn = input.includeCheckedIn === true;
  const refundable = tickets.filter(
    (t) => t.status === 'valid' && (withCheckedIn || t.checkedInAt == null) && !open.has(t.id),
  );
  const ids = input.ticketIds === 'all' ? refundable.map((t) => t.id) : uniqueIds(input.ticketIds);
  const allowed = new Set(refundable.map((t) => t.id));
  if (!ids.every((id) => allowed.has(id))) throw new PaidError('invalid', { detail: 'ticketIds' });
  if (ids.length === 0 && !input.includeGift) throw new PaidError('invalid', { detail: 'ticketIds' });
  const amount = refundableAmount(order, tickets, ids, input.includeGift, await moneyState(db, order));
  if (amount.amountCents <= 0 && ids.length === 0) throw new PaidError('already_done');
  const stripe = amount.amountCents > 0 && STRIPE_METHODS.includes(order.paymentMethod);
  if (stripe && !input.routing) throw new PaidError('payments_unavailable');
  const refundId = newPrefixedId('rfd');
  await runRefundBatch(db, [
    insertRefundStatement({
      id: refundId,
      orderId: order.id,
      amount,
      method: stripe ? 'stripe' : 'none',
      requestedBy: requesterOf(input.actor),
      reason: cleanReason(input.reason),
      status: 'pending',
      now: input.now,
    }),
    changedOne('refund_not_inserted'),
    ...(ids.length
      ? [ticketsStillRefundable(order.id, ids, withCheckedIn), flipTickets(order.id, ids, input.now)]
      : []),
  ]);
  return finishReserved(db, env, refundId, order, input.routing, input.now);
}

/** After the reserve batch: nothing to pay back → done now; otherwise through Stripe. */
async function finishReserved(
  db: SqlDatabase,
  env: PaidEnv,
  refundId: string,
  order: PaidOrder,
  routing: PaymentRouting | null,
  now: number,
): Promise<RefundDecision> {
  const refund = await loadRefund(db, refundId);
  if (!refund) throw new PaidError('not_found');
  if (refund.amountCents === 0 || refund.method === 'none') {
    await runBatch(db, completeRefundStatements({ ...refund, method: 'none' }, order, now));
    return { refundId, status: 'succeeded', amountCents: refund.amountCents, order };
  }
  if (!routing) throw new PaidError('payments_unavailable');
  const status = await executeStripeRefund(db, env, { refundId, routing, now });
  return { refundId, status, amountCents: refund.amountCents, order };
}

// ── Stripe ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Applies what Stripe says about a refund of ours (from the API answer or a webhook). Idempotent. */
export function stripeRefundStatements(
  refund: RefundRow,
  order: PaidOrder,
  stripe: Pick<StripeRefund, 'id' | 'status'>,
  now: number,
): SqlStatementSpec[] {
  const out: SqlStatementSpec[] = [
    {
      sql: 'UPDATE refunds SET stripe_refund_id = ?2, updated_at = ?3 WHERE id = ?1 AND stripe_refund_id IS NULL',
      params: [refund.id, stripe.id, now],
    },
  ];
  if (stripe.status === 'succeeded') out.push(...completeRefundStatements(refund, order, now));
  else if (stripe.status === 'failed' || stripe.status === 'canceled')
    out.push(...failRefundStatements(refund.id, now, stripe.status));
  return out;
}

/**
 * Sends a reserved (`pending`) refund to Stripe through the order's routing, with the idempotency key
 * `refund_<refund id>` (set by the routing from `refundId`), so a retry never refunds twice. Mode A gives the Gamo
 * fee part back with it (`refundFee`). A definite refusal fails the refund and gives its tickets back; a network
 * error or a 5xx leaves it pending for a retry.
 */
export async function executeStripeRefund(
  db: SqlDatabase,
  env: PaidEnv,
  input: { refundId: string; routing: PaymentRouting; now: number },
): Promise<RefundStatus> {
  void env;
  const refund = await loadRefund(db, input.refundId);
  if (!refund) throw new PaidError('not_found');
  if (refund.status === 'succeeded') return 'succeeded';
  if (refund.status !== 'pending' || refund.method !== 'stripe') throw new PaidError('already_done');
  const order = await loadPaidOrder(db, refund.orderId);
  if (!order) throw new PaidError('not_found');
  if (input.routing.flow !== order.fundsFlow || input.routing.chargeAccountId !== order.stripeAccountId)
    throw new PaidError('invalid', { detail: 'routing_mismatch' });
  if (!order.paymentIntentId) throw new PaidError('stripe_error', { detail: 'no_payment_intent' });
  let result: StripeRefund;
  try {
    result = await input.routing.refund({
      refundId: refund.id,
      orderId: order.id,
      paymentIntentId: order.paymentIntentId,
      amountCents: refund.amountCents,
      refundFee: input.routing.flow === 'organizer_account' && refund.feeCents > 0,
    });
  } catch (error) {
    if (error instanceof StripeApiError && error.definite) {
      await runBatch(db, failRefundStatements(refund.id, input.now));
      throw new PaidError('stripe_error', { detail: error.stripeCode ?? 'refused' });
    }
    throw new PaidError('stripe_error', { detail: 'retry' });
  }
  await runBatch(db, stripeRefundStatements(refund, order, result, input.now));
  const after = await loadRefund(db, refund.id);
  return after?.status ?? 'pending';
}

// ── Full refunds ───────────────────────────────────────────────────────────────────────────────────────────────

export type FullRefundReason = 'event_canceled' | 'unfulfilled' | 'organizer';

export type FullRefundResult =
  | { outcome: 'refunded' | 'pending'; refundId: string; amountCents: number; order: PaidOrder }
  /** Nothing left to give back (already refunded, or never paid). */
  | { outcome: 'nothing'; order: PaidOrder | null }
  /** A cash order: the money is given back in person (the door's cash refund). */
  | { outcome: 'cash_manual'; order: PaidOrder }
  /** A dispute is open: Stripe settles it, a refund is not possible. */
  | { outcome: 'disputed'; order: PaidOrder };

/**
 * Refunds what remains of an order in full: every valid ticket (checked in or not) and the gift. Used when an event
 * or date is canceled, when a payment arrived after its seats were lost (`unfulfilled`), and by the organizer.
 * Safe to call twice (a webhook delivered twice): the second call resumes or finds nothing left.
 */
export async function refundOrderInFull(
  db: SqlDatabase,
  env: PaidEnv,
  input: { orderId: string; reason: FullRefundReason; routing: PaymentRouting | null; now: number },
): Promise<FullRefundResult> {
  const order = await loadPaidOrder(db, input.orderId);
  if (!order) return { outcome: 'nothing', order: null };
  if (!['paid', 'partially_refunded', 'paid_unfulfilled'].includes(order.status))
    return { outcome: 'nothing', order };
  const requestedBy: RefundRequester = input.reason === 'organizer' ? 'organizer' : 'system';
  const existing = (await listOrderRefunds(db, order.id)).find(
    (r) => r.requestedBy === requestedBy && r.reason === input.reason && r.status === 'pending',
  );
  if (existing) {
    if (existing.method !== 'stripe') return { outcome: 'nothing', order };
    if (!input.routing) throw new PaidError('payments_unavailable');
    const status = await executeStripeRefund(db, env, {
      refundId: existing.id,
      routing: input.routing,
      now: input.now,
    });
    return {
      outcome: status === 'succeeded' ? 'refunded' : 'pending',
      refundId: existing.id,
      amountCents: existing.amountCents,
      order,
    };
  }
  if (order.disputed) return { outcome: 'disputed', order };
  if (order.paymentMethod === 'cash' && order.totalCents > order.amountRefundedCents)
    return { outcome: 'cash_manual', order };
  const tickets = await loadOrderTickets(db, order.id);
  const valid = tickets.filter((t) => t.status === 'valid').map((t) => t.id);
  const state = await moneyState(db, order);
  const remaining = order.totalCents - state.refundedCents - state.inFlightCents;
  if (remaining <= 0 && valid.length === 0) return { outcome: 'nothing', order };
  const shares = refundableAmount(order, tickets, valid, true, state);
  const amount: RefundAmount = { ...shares, amountCents: Math.max(0, remaining) };
  amount.giftCents = Math.min(amount.giftCents, amount.amountCents);
  amount.feeCents = Math.max(0, Math.min(amount.feeCents, amount.amountCents - amount.giftCents));
  const stripe = amount.amountCents > 0 && STRIPE_METHODS.includes(order.paymentMethod);
  if (stripe && !input.routing) throw new PaidError('payments_unavailable');
  const refundId = newPrefixedId('rfd');
  try {
    await runBatch(db, [
      insertRefundStatement({
        id: refundId,
        orderId: order.id,
        amount,
        method: stripe ? 'stripe' : 'none',
        requestedBy,
        reason: input.reason,
        status: 'pending',
        now: input.now,
        uniqueCause: true,
      }),
      changedOne('refund_not_inserted'),
      ...(valid.length
        ? [ticketsStillRefundable(order.id, valid, true), flipTickets(order.id, valid, input.now)]
        : []),
      // Requests still waiting for a decision are overtaken by the full refund.
      {
        sql: `UPDATE refunds SET status = 'canceled', decided_at = ?2, updated_at = ?2
               WHERE order_id = ?1 AND status = 'requested'`,
        params: [order.id, input.now],
      },
    ]);
  } catch (error) {
    if (!isBatchAssertion(error)) throw error;
    // Someone else got there first (a second delivery, a racing refund or check-in): resume or report.
    const again = (await listOrderRefunds(db, order.id)).find(
      (r) =>
        r.requestedBy === requestedBy &&
        r.reason === input.reason &&
        (r.status === 'pending' || r.status === 'succeeded'),
    );
    if (!again) throw new PaidError('stale');
    if (again.status === 'succeeded')
      return { outcome: 'refunded', refundId: again.id, amountCents: again.amountCents, order };
    return refundOrderInFull(db, env, input);
  }
  const result = await finishReserved(db, env, refundId, order, input.routing, input.now);
  return {
    outcome: result.status === 'succeeded' ? 'refunded' : 'pending',
    refundId,
    amountCents: result.amountCents,
    order,
  };
}

/** Orders of an event (or one date) that hold money to give back when it is canceled. */
export async function ordersToRefund(
  db: SqlDatabase,
  input: { eventId: string; occurrenceId?: string | null },
): Promise<
  Array<{ orderId: string; paymentMethod: string; buyerName: string | null; buyerEmail: string | null }>
> {
  const rows = await allRows<{
    id: string;
    payment_method: string;
    buyer_name: string | null;
    buyer_email: string | null;
  }>(db, {
    sql: `SELECT id, payment_method, buyer_name, buyer_email FROM orders
             WHERE event_id = ?1 AND (?2 IS NULL OR occurrence_id = ?2)
               AND status IN ('paid', 'partially_refunded', 'paid_unfulfilled')
             ORDER BY created_at, id`,
    params: [input.eventId, input.occurrenceId ?? null],
  });
  return rows.map((r) => ({
    orderId: r.id,
    paymentMethod: r.payment_method,
    buyerName: r.buyer_name,
    buyerEmail: r.buyer_email,
  }));
}

// ── Cash refunds at the door ───────────────────────────────────────────────────────────────────────────────────

/**
 * A cash refund at the door (docs/LIVE_REQUIREMENTS.md §8.3 items 24–25): returns the statements for the door
 * module's batch (the refund row, method cash, already succeeded; the tickets refunded; the cash ledger row; the
 * order settled). The door module adds its `cash_movements` row (kind `refund`, this refund id and amount, the
 * reason) in the same batch. The batch rolls back if a ticket was checked in or refunded meanwhile.
 */
export async function recordCashRefund(
  db: SqlDatabase,
  input: {
    orderId: string;
    ticketIds: readonly string[];
    cashSessionId: string;
    reason: string;
    includeGift?: boolean;
    /** Door callers: a valid ticket is refundable even when already checked in (door sales admit at once). */
    includeCheckedIn?: boolean;
    now: number;
  },
): Promise<{ refundId: string; amountCents: number; statements: SqlStatementSpec[] }> {
  const reason = cleanReason(input.reason, CASH_REFUND_REASON_MAX);
  if (!reason) throw new PaidError('invalid', { detail: 'reason' });
  const order = await loadPaidOrder(db, input.orderId);
  if (!order) throw new PaidError('not_found');
  if (order.paymentMethod !== 'cash') throw new PaidError('invalid', { detail: 'not_cash' });
  if (!REFUNDABLE_ORDER.has(order.status)) throw new PaidError('invalid', { detail: 'order_status' });
  const ids = uniqueIds(input.ticketIds);
  const tickets = await loadOrderTickets(db, order.id);
  const withCheckedIn = input.includeCheckedIn === true;
  const allowed = new Set(
    tickets.filter((t) => t.status === 'valid' && (withCheckedIn || t.checkedInAt == null)).map((t) => t.id),
  );
  if (ids.length === 0 || !ids.every((id) => allowed.has(id)))
    throw new PaidError('invalid', { detail: 'ticketIds' });
  const amount = refundableAmount(
    order,
    tickets,
    ids,
    input.includeGift ?? 'whole_order',
    await moneyState(db, order),
  );
  const refundId = newPrefixedId('rfd');
  const refund = {
    id: refundId,
    orderId: order.id,
    amountCents: amount.amountCents,
    giftCents: amount.giftCents,
    feeCents: amount.feeCents,
    method: 'cash' as const,
    currency: order.currency,
  };
  const statements: SqlStatementSpec[] = [
    insertRefundStatement({
      id: refundId,
      orderId: order.id,
      amount,
      method: 'cash',
      requestedBy: 'organizer',
      reason,
      status: 'pending',
      cashSessionId: input.cashSessionId,
      now: input.now,
    }),
    changedOne('refund_not_inserted'),
    assertInBatch(
      `EXISTS (SELECT 1 FROM cash_sessions WHERE id = ?1 AND status = 'open' AND occurrence_id = ?2)`,
      [input.cashSessionId, order.occurrenceId],
      'cash_session_closed',
    ),
    ticketsStillRefundable(order.id, ids, withCheckedIn),
    flipTickets(order.id, ids, input.now),
    ...completeRefundStatements(refund, order, input.now),
  ];
  return { refundId, amountCents: amount.amountCents, statements };
}

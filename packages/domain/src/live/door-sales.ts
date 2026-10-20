/**
 * Selling at the door (docs/LIVE_REQUIREMENTS.md §8.3 items 20–26, docs/LIVE_PAYMENTS.md §7).
 *
 * Four ways to sell, all as door orders (`channel = 'door'`) through `reserveOrder` / `markOrderPaid`:
 * - **cash**: the actor's open drawer; cash received ≥ total; the order is paid and the people admitted in one batch
 *   with the drawer's sale row (received and change).
 * - **buyer's phone**: a short-lived order and Checkout Session whose URL the screen shows as a QR; the webhook pays it;
 *   staff may cancel (the session is expired and the seats freed).
 * - **card reader**: a card-present PaymentIntent sent to a paired Stripe Terminal reader of the event's organization,
 *   on the account charges go to; `payment_intent.succeeded` pays it; staff may cancel.
 * - **comp**: price 0 with a reason, only with the comp permission.
 * Door sales admit at once (tickets created checked in). They need the event's door switch and the platform switch;
 * card methods also need card sales to be available (enforced by `reserveOrder`).
 *
 * Also: staff links for an event (expiry from the event's last date), door refunds, and door-day totals whose every
 * number is the length of a list with the same filter. Pages call one function here and render the result.
 */
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import {
  cashMovementStatement,
  findOpenCashSession,
  loadDoorOccurrence,
  type DoorOccurrence,
} from './cash-sessions.ts';
import { COMP_REASON_MAX, markOrderPaid, releaseOrder, reserveOrder } from './orders.ts';
import { recordCashRefund, refundDirect, type RefundDecision } from './refunds.ts';
import { isBatchAssertion } from './tickets.ts';
import {
  CHECKOUT_SESSION_SECONDS,
  CURRENCY,
  PAID_ID_PREFIX,
  PaidError,
  type MarkPaidResult,
  type OrderChannel,
  type PaidEnv,
  type PaymentMethod,
  type ReserveOrderLine,
  type ReservedOrder,
} from './paid-types.ts';
import { StripeApiError, type CheckoutLineItem, type PaymentRouting } from './payments/types.ts';
import { getReader, readerStripeError } from './readers.ts';
import { newPrefixedId } from '../security/ids.ts';
import {
  actorRef,
  createStaffLink,
  requirePermission,
  requireScope,
  type CreatedStaffLink,
  type StaffActor,
} from './staff-links.ts';

// ── Context ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DoorContext extends DoorOccurrence {
  eventTitle: string;
  eventDoorSales: boolean;
  platformDoorSales: boolean;
}

async function loadDoorContext(db: SqlDatabase, occurrenceId: string): Promise<DoorContext | null> {
  const occ = await loadDoorOccurrence(db, occurrenceId);
  if (!occ) return null;
  const [r] = await allRows<{ title: string; event_door: number | null; platform_door: number | null }>(db, {
    sql: `SELECT e.title, t.door_sales_enabled AS event_door,
                 (SELECT door_sales_enabled FROM payment_settings WHERE id = 1) AS platform_door
            FROM events e LEFT JOIN event_ticketing t ON t.event_id = e.id
           WHERE e.id = ?1`,
    params: [occ.eventId],
  });
  return {
    ...occ,
    eventTitle: r?.title ?? '',
    eventDoorSales: r?.event_door === 1,
    platformDoorSales: r?.platform_door === 1,
  };
}

/** Loads the date and checks the actor may sell on it with this permission. */
async function sellingContext(
  db: SqlDatabase,
  actor: StaffActor,
  occurrenceId: string,
  permission: 'sell' | 'comp',
): Promise<DoorContext> {
  requirePermission(actor, 'sell');
  if (permission === 'comp') requirePermission(actor, 'comp');
  const ctx = await loadDoorContext(db, occurrenceId);
  if (!ctx) throw new PaidError('not_found');
  requireScope(actor, { organizationId: ctx.organizationId, scopeId: ctx.eventId });
  if (ctx.admission !== 'paid_tickets') throw new PaidError('not_on_sale', { detail: 'not_paid_event' });
  if (!ctx.eventDoorSales || !ctx.platformDoorSales)
    throw new PaidError('not_on_sale', { detail: 'door_sales_off' });
  if (ctx.occurrenceStatus !== 'scheduled' || ctx.eventStatus !== 'published')
    throw new PaidError('not_on_sale', { detail: 'date' });
  return ctx;
}

/** Whether door selling is switched on for this date (both the event's and the platform's switch). */
export async function doorSalesOpen(db: SqlDatabase, occurrenceId: string): Promise<boolean> {
  const ctx = await loadDoorContext(db, occurrenceId);
  return !!ctx && ctx.admission === 'paid_tickets' && ctx.eventDoorSales && ctx.platformDoorSales;
}

// ── Staff links for an event ───────────────────────────────────────────────────────────────────────────────────

/**
 * Creates a staff link for an event of this organization (the caller has checked the organizer's membership). It
 * expires 12 hours after the event's last date ends.
 */
export async function createEventStaffLink(
  db: SqlDatabase,
  env: PaidEnv,
  input: {
    organizationId: string;
    eventId: string;
    label: string;
    permissions: readonly string[];
    createdBy: string;
    now: number;
  },
): Promise<CreatedStaffLink> {
  const [r] = await allRows<{ last_end: number | null }>(db, {
    sql: `SELECT MAX(COALESCE(o.ends_at, o.starts_at)) AS last_end
            FROM events e JOIN event_occurrences o ON o.event_id = e.id
           WHERE e.id = ?1 AND e.organization_id = ?2 AND o.status = 'scheduled'`,
    params: [input.eventId, input.organizationId],
  });
  if (!r || r.last_end == null) throw new PaidError('not_found');
  return createStaffLink(db, env, {
    organizationId: input.organizationId,
    scopeId: input.eventId,
    scopeEndsAt: r.last_end,
    label: input.label,
    permissions: input.permissions,
    createdBy: input.createdBy,
    now: input.now,
  });
}

// ── Common sale input ──────────────────────────────────────────────────────────────────────────────────────────

export interface DoorSaleInput {
  actor: StaffActor;
  occurrenceId: string;
  lines: readonly ReserveOrderLine[];
  buyerName?: string | null;
  /** Optional: the tickets are also emailed here (the people are admitted either way). */
  buyerEmail?: string | null;
  attendeeNames?: readonly string[] | null;
  now: number;
}

export interface DoorSaleDone {
  orderId: string;
  reference: string;
  totalCents: number;
  ticketIds: string[];
  /** Admitted at once: one per ticket. */
  admittedCount: number;
  /** Send the tickets to this address (the caller sends the email). */
  emailTicketsTo: string | null;
}

async function reserveDoor(
  db: SqlDatabase,
  env: PaidEnv,
  ctx: DoorContext,
  input: DoorSaleInput,
  method: PaymentMethod,
  extra: { compReason?: string | null; cashSessionId?: string | null; readerId?: string | null } = {},
): Promise<ReservedOrder> {
  return reserveOrder(db, env, {
    eventId: ctx.eventId,
    occurrenceId: input.occurrenceId,
    channel: 'door',
    paymentMethod: method,
    lines: input.lines,
    buyerName: input.buyerName ?? null,
    buyerEmail: input.buyerEmail ?? null,
    attendeeNames: input.attendeeNames ?? null,
    compReason: extra.compReason ?? null,
    staffLinkId: input.actor.kind === 'staff' ? input.actor.staffLinkId : null,
    cashSessionId: extra.cashSessionId ?? null,
    readerId: extra.readerId ?? null,
    now: input.now,
  });
}

function paidOrThrow(result: MarkPaidResult): { orderId: string; ticketIds: string[] } {
  if (result.outcome === 'paid') return { orderId: result.orderId, ticketIds: result.ticketIds };
  if (result.outcome === 'not_found') throw new PaidError('not_found');
  if (result.outcome === 'already_paid') throw new PaidError('already_done');
  if (result.outcome === 'unfulfilled') throw new PaidError('sold_out');
  throw new PaidError('stale', { detail: result.reason });
}

async function releaseQuietly(db: SqlDatabase, orderId: string, reason: 'canceled' | 'failed', now: number) {
  await releaseOrder(db, { orderId, reason, now });
}

// ── Cash ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CashSaleDone extends DoorSaleDone {
  receivedCents: number;
  changeDueCents: number;
  cashSessionId: string;
}

/** A cash sale into the actor's open drawer. The people are admitted at once. */
export async function sellForCash(
  db: SqlDatabase,
  env: PaidEnv,
  input: DoorSaleInput & { receivedCents: number },
): Promise<CashSaleDone> {
  const ctx = await sellingContext(db, input.actor, input.occurrenceId, 'sell');
  if (!Number.isInteger(input.receivedCents) || input.receivedCents < 0)
    throw new PaidError('invalid', { detail: 'received' });
  const session = await findOpenCashSession(db, { occurrenceId: input.occurrenceId, actor: input.actor });
  if (!session) throw new PaidError('session_closed', { detail: 'no_open_session' });

  const reserved = await reserveDoor(db, env, ctx, input, 'cash', { cashSessionId: session.id });
  const total = reserved.priced.totalCents;
  if (input.receivedCents < total) {
    await releaseQuietly(db, reserved.orderId, 'canceled', input.now);
    throw new PaidError('invalid', { detail: 'received' });
  }
  const change = input.receivedCents - total;
  let result: MarkPaidResult;
  try {
    result = await markOrderPaid(db, env, {
      orderId: reserved.orderId,
      amountCents: total,
      currency: CURRENCY,
      providerRef: null,
      stripeAccountId: reserved.stripeAccountId,
      admit: true,
      admittedBy: actorRef(input.actor),
      extraStatements:
        total > 0
          ? [
              cashMovementStatement({
                sessionId: session.id,
                kind: 'sale',
                orderId: reserved.orderId,
                amountCents: total,
                receivedCents: input.receivedCents,
                changeCents: change,
                now: input.now,
              }),
            ]
          : [],
      now: input.now,
    });
  } catch (error) {
    // Nothing was paid (the batch rolled back): free the seats. A drawer closed meanwhile is the usual cause.
    await releaseQuietly(db, reserved.orderId, 'failed', input.now);
    const still = await findOpenCashSession(db, { occurrenceId: input.occurrenceId, actor: input.actor });
    if (still?.id !== session.id) throw new PaidError('session_closed');
    throw error;
  }
  const paid = paidOrThrow(result);
  return {
    orderId: paid.orderId,
    reference: reserved.reference,
    totalCents: total,
    ticketIds: paid.ticketIds,
    admittedCount: paid.ticketIds.length,
    emailTicketsTo: input.buyerEmail?.trim() || null,
    receivedCents: input.receivedCents,
    changeDueCents: change,
    cashSessionId: session.id,
  };
}

// ── Comp ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Free tickets with a reason, only with the comp permission. The people are admitted at once. */
export async function sellComp(
  db: SqlDatabase,
  env: PaidEnv,
  input: DoorSaleInput & { reason: string },
): Promise<DoorSaleDone> {
  const ctx = await sellingContext(db, input.actor, input.occurrenceId, 'comp');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length < 1 || reason.length > COMP_REASON_MAX)
    throw new PaidError('invalid', { detail: 'reason' });
  const reserved = await reserveDoor(db, env, ctx, input, 'comp', { compReason: reason });
  if (reserved.priced.totalCents !== 0) {
    await releaseQuietly(db, reserved.orderId, 'failed', input.now);
    throw new PaidError('invalid', { detail: 'comp_total' });
  }
  let result: MarkPaidResult;
  try {
    result = await markOrderPaid(db, env, {
      orderId: reserved.orderId,
      amountCents: 0,
      currency: CURRENCY,
      providerRef: null,
      stripeAccountId: reserved.stripeAccountId,
      admit: true,
      admittedBy: actorRef(input.actor),
      now: input.now,
    });
  } catch (error) {
    await releaseQuietly(db, reserved.orderId, 'failed', input.now);
    throw error;
  }
  const paid = paidOrThrow(result);
  return {
    orderId: paid.orderId,
    reference: reserved.reference,
    totalCents: 0,
    ticketIds: paid.ticketIds,
    admittedCount: paid.ticketIds.length,
    emailTicketsTo: input.buyerEmail?.trim() || null,
  };
}

// ── Buyer's phone ──────────────────────────────────────────────────────────────────────────────────────────────

/** Checkout line items that add up to the order total (door orders carry no discount code). */
export function checkoutLinesOf(reserved: ReservedOrder): CheckoutLineItem[] {
  const p = reserved.priced;
  if (p.discountCents !== 0) throw new PaidError('invalid', { detail: 'discount' });
  const lines: CheckoutLineItem[] = p.lines.map((l) => ({
    name: l.name,
    unitAmountCents: l.unitPriceCents,
    quantity: l.quantity,
  }));
  if (p.feePayer === 'buyer' && p.feeCents > 0)
    lines.push({ name: 'Gamo service fee', unitAmountCents: p.feeCents, quantity: 1 });
  if (p.giftCents > 0) lines.push({ name: 'Gift', unitAmountCents: p.giftCents, quantity: 1 });
  const sum = lines.reduce((s, l) => s + l.unitAmountCents * l.quantity, 0);
  if (sum !== p.totalCents) throw new PaidError('invalid', { detail: 'lines' });
  return lines;
}

export interface PhoneSaleStarted {
  orderId: string;
  reference: string;
  totalCents: number;
  /** Show as a large QR code. */
  checkoutUrl: string;
  /** The order's hold ends then (the screen stops waiting). */
  expiresAt: number;
}

/** Reserves the seats and opens a Checkout Session for the buyer to pay on their phone. */
export async function startPhoneSale(
  db: SqlDatabase,
  env: PaidEnv,
  input: DoorSaleInput & { routing: PaymentRouting; successUrl: string; cancelUrl: string },
): Promise<PhoneSaleStarted> {
  const ctx = await sellingContext(db, input.actor, input.occurrenceId, 'sell');
  const reserved = await reserveDoor(db, env, ctx, input, 'phone_qr');
  if (reserved.stripeAccountId !== input.routing.chargeAccountId || reserved.priced.totalCents <= 0) {
    await releaseQuietly(db, reserved.orderId, 'failed', input.now);
    throw new PaidError('stale', { detail: reserved.priced.totalCents <= 0 ? 'total' : 'account' });
  }
  let session;
  try {
    session = await input.routing.createCheckout({
      orderId: reserved.orderId,
      orderReference: reserved.reference,
      eventTitle: ctx.eventTitle,
      lines: checkoutLinesOf(reserved),
      customerEmail: input.buyerEmail?.trim() || null,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      expiresAt: input.now + CHECKOUT_SESSION_SECONDS,
      gamoFeeCents: reserved.priced.feeCents,
    });
  } catch (error) {
    // A definite refusal frees the seats; a network error or 5xx leaves the hold to expire on its own.
    if (error instanceof PaidError || (error instanceof StripeApiError && error.definite))
      await releaseQuietly(db, reserved.orderId, 'failed', input.now);
    throw error instanceof PaidError ? error : readerStripeError(error);
  }
  if (!session.url) {
    await releaseQuietly(db, reserved.orderId, 'failed', input.now);
    throw new PaidError('stripe_error', { detail: 'no_url' });
  }
  await runBatch(db, [
    {
      sql: `UPDATE orders SET checkout_session_id = ?2, updated_at = ?3 WHERE id = ?1 AND status = 'pending'`,
      params: [reserved.orderId, session.id, input.now],
    },
    {
      sql: `INSERT INTO payments (id, order_id, kind, provider_ref, stripe_account_id, amount_cents, currency, status, created_at, updated_at)
            VALUES (?1, ?2, 'checkout_session', ?3, ?4, ?5, ?6, 'pending', ?7, ?7)`,
      params: [
        newPrefixedId(PAID_ID_PREFIX.payment),
        reserved.orderId,
        session.id,
        input.routing.chargeAccountId,
        reserved.priced.totalCents,
        CURRENCY,
        input.now,
      ],
    },
  ]);
  return {
    orderId: reserved.orderId,
    reference: reserved.reference,
    totalCents: reserved.priced.totalCents,
    checkoutUrl: session.url,
    expiresAt: reserved.holdExpiresAt ?? input.now + CHECKOUT_SESSION_SECONDS,
  };
}

// ── Card reader ────────────────────────────────────────────────────────────────────────────────────────────────

export interface ReaderSaleStarted {
  orderId: string;
  reference: string;
  totalCents: number;
  readerId: string;
  readerLabel: string;
  paymentIntentId: string;
}

/** The reader is free when it has no action, or its action's order is no longer waiting. */
const READER_FREE = `(action_status <> 'in_progress' OR action_order_id IS NULL
                      OR action_order_id NOT IN (SELECT id FROM orders WHERE status = 'pending'))`;

/** Sends a card-present payment to a reader of the event's organization. The webhook completes the order. */
export async function startReaderSale(
  db: SqlDatabase,
  env: PaidEnv,
  input: DoorSaleInput & { readerId: string; routing: PaymentRouting },
): Promise<ReaderSaleStarted> {
  const ctx = await sellingContext(db, input.actor, input.occurrenceId, 'sell');
  const reader = await getReader(db, ctx.organizationId, input.readerId);
  if (!reader || reader.removedAt !== null)
    throw new PaidError('reader_unavailable', { detail: 'not_found' });
  if (reader.eventId !== null && reader.eventId !== ctx.eventId)
    throw new PaidError('reader_unavailable', { detail: 'other_event' });
  if (reader.stripeAccountId !== input.routing.chargeAccountId)
    throw new PaidError('reader_unavailable', { detail: 'account' });

  const reserved = await reserveDoor(db, env, ctx, input, 'card_reader', { readerId: reader.id });
  const total = reserved.priced.totalCents;
  if (reserved.stripeAccountId !== input.routing.chargeAccountId || total <= 0) {
    await releaseQuietly(db, reserved.orderId, 'failed', input.now);
    throw new PaidError('stale', { detail: total <= 0 ? 'total' : 'account' });
  }
  // Claim the reader for this order (one sale at a time per reader).
  const [claimed] = await runBatch(db, [
    {
      sql: `UPDATE readers SET action_status = 'in_progress', action_order_id = ?2, action_failure = NULL
             WHERE id = ?1 AND removed_at IS NULL AND ${READER_FREE} RETURNING id`,
      params: [reader.id, reserved.orderId],
    },
  ]);
  if (claimed.length === 0) {
    await releaseQuietly(db, reserved.orderId, 'canceled', input.now);
    throw new PaidError('reader_unavailable', { detail: 'busy' });
  }
  const freeReader = (failure: string | null) =>
    runBatch(db, [
      {
        sql: `UPDATE readers SET action_status = ?3, action_failure = ?4, action_order_id = NULL
               WHERE id = ?1 AND action_order_id = ?2`,
        params: [reader.id, reserved.orderId, failure ? 'failed' : 'idle', failure],
      },
    ]);

  let pi;
  try {
    pi = await input.routing.createCardPresentPayment({
      orderId: reserved.orderId,
      orderReference: reserved.reference,
      amountCents: total,
      gamoFeeCents: reserved.priced.feeCents,
      description: `${ctx.eventTitle} ${reserved.reference}`.slice(0, 200),
    });
  } catch (error) {
    if (error instanceof StripeApiError && error.definite) {
      await releaseQuietly(db, reserved.orderId, 'failed', input.now);
      await freeReader(error.stripeCode ?? 'stripe_error');
    }
    throw readerStripeError(error);
  }
  await runBatch(db, [
    {
      sql: `UPDATE orders SET payment_intent_id = ?2, reader_id = ?3, updated_at = ?4 WHERE id = ?1 AND status = 'pending'`,
      params: [reserved.orderId, pi.id, reader.id, input.now],
    },
    {
      sql: `INSERT INTO payments (id, order_id, kind, provider_ref, stripe_account_id, reader_id, amount_cents, currency, status, created_at, updated_at)
            VALUES (?1, ?2, 'card_present', ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?8)`,
      params: [
        newPrefixedId(PAID_ID_PREFIX.payment),
        reserved.orderId,
        pi.id,
        input.routing.chargeAccountId,
        reader.id,
        total,
        CURRENCY,
        input.now,
      ],
    },
  ]);
  try {
    await input.routing.gateway.processPaymentIntentOnReader(reader.stripeReaderId, pi.id, {
      account: input.routing.chargeAccountId,
    });
  } catch (error) {
    // The reader refused (offline, busy…): cancel the PaymentIntent and free the seats and the reader.
    if (error instanceof StripeApiError && error.definite) {
      await input.routing.gateway
        .cancelPaymentIntent(pi.id, { account: input.routing.chargeAccountId })
        .catch(() => undefined);
      await runBatch(db, [
        {
          sql: `UPDATE payments SET status = 'canceled', failure_code = ?2, updated_at = ?3 WHERE provider_ref = ?1`,
          params: [pi.id, error.stripeCode ?? 'reader_error', input.now],
        },
      ]);
      await releaseQuietly(db, reserved.orderId, 'failed', input.now);
      await freeReader(error.stripeCode ?? 'reader_error');
      throw new PaidError('reader_unavailable', { detail: error.stripeCode ?? 'reader_error' });
    }
    throw readerStripeError(error);
  }
  return {
    orderId: reserved.orderId,
    reference: reserved.reference,
    totalCents: total,
    readerId: reader.id,
    readerLabel: reader.label,
    paymentIntentId: pi.id,
  };
}

// ── Waiting sales: status, cancel, simulated tap ───────────────────────────────────────────────────────────────

interface DoorOrderRow {
  id: string;
  reference: string;
  event_id: string;
  occurrence_id: string;
  organization_id: string;
  channel: OrderChannel;
  payment_method: PaymentMethod;
  status: string;
  total_cents: number;
  hold_expires_at: number | null;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  stripe_account_id: string | null;
  reader_id: string | null;
  staff_link_id: string | null;
  cash_session_id: string | null;
}

async function loadDoorOrder(db: SqlDatabase, actor: StaffActor, orderId: string): Promise<DoorOrderRow> {
  const [o] = await allRows<DoorOrderRow>(db, {
    sql: `SELECT id, reference, event_id, occurrence_id, organization_id, channel, payment_method, status, total_cents,
                 hold_expires_at, checkout_session_id, payment_intent_id, stripe_account_id, reader_id, staff_link_id,
                 cash_session_id
            FROM orders WHERE id = ?1`,
    params: [orderId],
  });
  if (!o || o.channel !== 'door') throw new PaidError('not_found');
  try {
    requireScope(actor, { organizationId: o.organization_id, scopeId: o.event_id });
  } catch {
    throw new PaidError('not_found');
  }
  return o;
}

export type DoorSaleState = 'pending' | 'paid' | 'expired' | 'canceled' | 'failed' | 'unfulfilled';

export interface DoorSaleStatus {
  orderId: string;
  reference: string;
  method: PaymentMethod;
  state: DoorSaleState;
  totalCents: number;
  /** Tickets checked in for this order. */
  admittedCount: number;
  /** Card reader sales: the reader's action and failure. */
  reader: { label: string; actionStatus: string; failure: string | null } | null;
}

/** What the door screen shows while it waits for a phone or reader payment (polled). */
export async function doorSaleStatus(
  db: SqlDatabase,
  input: { orderId: string; actor: StaffActor; now: number },
): Promise<DoorSaleStatus> {
  const o = await loadDoorOrder(db, input.actor, input.orderId);
  const [{ admitted }] = await allRows<{ admitted: number }>(db, {
    sql: `SELECT COUNT(*) AS admitted FROM tickets WHERE order_id = ?1 AND status = 'valid' AND checked_in_at IS NOT NULL`,
    params: [o.id],
  });
  let state: DoorSaleState;
  if (o.status === 'paid' || o.status === 'partially_refunded' || o.status === 'refunded') state = 'paid';
  else if (o.status === 'paid_unfulfilled') state = 'unfulfilled';
  else if (o.status === 'pending')
    state = o.hold_expires_at != null && o.hold_expires_at <= input.now ? 'expired' : 'pending';
  else if (o.status === 'expired') state = 'expired';
  else state = o.status === 'canceled' || o.status === 'voided' ? 'canceled' : 'failed';
  let reader: DoorSaleStatus['reader'] = null;
  if (o.payment_method === 'card_reader' && o.reader_id) {
    const r = await getReader(db, o.organization_id, o.reader_id);
    if (r)
      reader = {
        label: r.label,
        actionStatus: r.actionOrderId === o.id ? r.actionStatus : 'idle',
        failure: r.actionOrderId === o.id ? r.actionFailure : null,
      };
  }
  return {
    orderId: o.id,
    reference: o.reference,
    method: o.payment_method,
    state,
    totalCents: o.total_cents,
    admittedCount: Number(admitted),
    reader,
  };
}

function requireWaiting(o: DoorOrderRow, method: PaymentMethod): void {
  if (o.payment_method !== method) throw new PaidError('invalid', { detail: 'method' });
  if (o.status !== 'pending') throw new PaidError('already_done', { detail: o.status });
}

/** Cancels a buyer's-phone sale that is still waiting: the Checkout Session is expired and the seats freed. */
export async function cancelPhoneSale(
  db: SqlDatabase,
  input: { orderId: string; actor: StaffActor; routing: PaymentRouting; now: number },
): Promise<{ released: boolean }> {
  requirePermission(input.actor, 'sell');
  const o = await loadDoorOrder(db, input.actor, input.orderId);
  requireWaiting(o, 'phone_qr');
  if (o.checkout_session_id) {
    try {
      await input.routing.expireCheckout(o.checkout_session_id);
    } catch (error) {
      // Stripe refuses when the session is no longer open (already expired or completed); the webhook then decides.
      if (!(error instanceof StripeApiError && error.status >= 400 && error.status < 500))
        throw readerStripeError(error);
    }
  }
  const released = await releaseOrder(db, { orderId: o.id, reason: 'canceled', now: input.now });
  if (released.released)
    await runBatch(db, [
      {
        sql: `UPDATE payments SET status = 'canceled', updated_at = ?2 WHERE order_id = ?1 AND status = 'pending'`,
        params: [o.id, input.now],
      },
    ]);
  return released;
}

/** Cancels a card-reader sale that is still waiting: the reader's action and the PaymentIntent, then the seats. */
export async function cancelReaderSale(
  db: SqlDatabase,
  input: { orderId: string; actor: StaffActor; routing: PaymentRouting; now: number },
): Promise<{ released: boolean }> {
  requirePermission(input.actor, 'sell');
  const o = await loadDoorOrder(db, input.actor, input.orderId);
  requireWaiting(o, 'card_reader');
  const account = o.stripe_account_id;
  const reader = o.reader_id ? await getReader(db, o.organization_id, o.reader_id) : null;
  if (reader) {
    try {
      await input.routing.gateway.cancelReaderAction(reader.stripeReaderId, { account });
    } catch (error) {
      // No action to cancel any more is fine; anything else (mid-authorization, network) stops here.
      if (!(error instanceof StripeApiError && error.definite)) throw readerStripeError(error);
    }
  }
  if (o.payment_intent_id) {
    try {
      await input.routing.gateway.cancelPaymentIntent(o.payment_intent_id, { account });
    } catch (error) {
      if (error instanceof StripeApiError && error.definite) {
        const pi = await input.routing.gateway
          .retrievePaymentIntent(o.payment_intent_id, { account })
          .catch(() => null);
        if (pi?.status === 'succeeded' || pi?.status === 'processing')
          throw new PaidError('already_done', { detail: 'paid' });
        if (pi?.status !== 'canceled') throw readerStripeError(error);
      } else throw readerStripeError(error);
    }
  }
  const released = await releaseOrder(db, { orderId: o.id, reason: 'canceled', now: input.now });
  await runBatch(db, [
    {
      sql: `UPDATE payments SET status = 'canceled', updated_at = ?2 WHERE order_id = ?1 AND status = 'pending'`,
      params: [o.id, input.now],
    },
    {
      sql: `UPDATE readers SET action_status = 'idle', action_order_id = NULL, action_failure = NULL
             WHERE action_order_id = ?1`,
      params: [o.id],
    },
  ]);
  return released;
}

/** Cancels whichever waiting sale this is (phone or reader). */
export async function cancelWaitingSale(
  db: SqlDatabase,
  input: { orderId: string; actor: StaffActor; routing: PaymentRouting; now: number },
): Promise<{ released: boolean }> {
  const o = await loadDoorOrder(db, input.actor, input.orderId);
  return o.payment_method === 'card_reader' ? cancelReaderSale(db, input) : cancelPhoneSale(db, input);
}

/** Test mode and the stand-in only: the simulated reader "taps" a test card. Refused in live mode. */
export async function simulateReaderTap(
  db: SqlDatabase,
  input: { orderId: string; actor: StaffActor; routing: PaymentRouting },
): Promise<void> {
  if (input.routing.gateway.livemode) throw new PaidError('forbidden', { detail: 'livemode' });
  requirePermission(input.actor, 'sell');
  const o = await loadDoorOrder(db, input.actor, input.orderId);
  requireWaiting(o, 'card_reader');
  const reader = o.reader_id ? await getReader(db, o.organization_id, o.reader_id) : null;
  if (!reader || reader.actionOrderId !== o.id)
    throw new PaidError('reader_unavailable', { detail: 'not_waiting' });
  try {
    await input.routing.gateway.presentPaymentMethod(reader.stripeReaderId, { account: o.stripe_account_id });
  } catch (error) {
    throw readerStripeError(error);
  }
}

// ── Door refunds ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A cash refund at the door, paid out of the actor's open drawer on the order's date, with a reason. The refund
 * (from `recordCashRefund`) and the drawer's refund row are one batch, so the drawer's expected amount goes down
 * exactly when the refund is recorded, and a closed drawer refuses it.
 */
export async function doorCashRefund(
  db: SqlDatabase,
  input: {
    actor: StaffActor;
    orderId: string;
    ticketIds: readonly string[];
    reason: string;
    includeGift?: boolean;
    now: number;
  },
): Promise<{ refundId: string; amountCents: number; cashSessionId: string }> {
  requirePermission(input.actor, 'sell');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) throw new PaidError('invalid', { detail: 'reason' });
  const o = await loadDoorOrder(db, input.actor, input.orderId);
  if (o.payment_method !== 'cash') throw new PaidError('invalid', { detail: 'not_cash' });
  const session = await findOpenCashSession(db, { occurrenceId: o.occurrence_id, actor: input.actor });
  if (!session) throw new PaidError('session_closed', { detail: 'no_open_session' });
  // Door staff refund cash only from the drawer that took it; an organizer may refund any cash sale of the event
  // from their own drawer. Otherwise a second link could take money out of its drawer for someone else's sale.
  if (input.actor.kind === 'staff' && o.cash_session_id !== session.id)
    throw new PaidError('forbidden', { detail: 'other_drawer' });
  const refund = await recordCashRefund(db, {
    orderId: o.id,
    ticketIds: input.ticketIds,
    cashSessionId: session.id,
    reason,
    includeGift: input.includeGift,
    // People bought at the door are admitted at once; refunding them at the door must still work.
    includeCheckedIn: true,
    now: input.now,
  });
  try {
    await runBatch(db, [
      ...refund.statements,
      ...(refund.amountCents > 0
        ? [
            cashMovementStatement({
              sessionId: session.id,
              kind: 'refund',
              orderId: o.id,
              refundId: refund.refundId,
              amountCents: refund.amountCents,
              reason,
              now: input.now,
            }),
          ]
        : []),
    ]);
  } catch (error) {
    const still = await findOpenCashSession(db, { occurrenceId: o.occurrence_id, actor: input.actor });
    if (still?.id !== session.id) throw new PaidError('session_closed');
    if (isBatchAssertion(error) || /constraint/i.test(String((error as Error)?.message)))
      throw new PaidError('stale', { detail: 'tickets' });
    throw error;
  }
  return { refundId: refund.refundId, amountCents: refund.amountCents, cashSessionId: session.id };
}

/**
 * A card or buyer's-phone door sale refunded through Stripe (`refundDirect`): this only checks the door actor may do
 * it (sell permission, the order's event) and acts for the organization.
 */
export async function doorCardRefund(
  db: SqlDatabase,
  env: PaidEnv,
  input: {
    actor: StaffActor;
    orderId: string;
    ticketIds: readonly string[] | 'all';
    includeGift: boolean;
    reason?: string | null;
    routing: PaymentRouting | null;
    now: number;
  },
): Promise<RefundDecision> {
  requirePermission(input.actor, 'sell');
  const o = await loadDoorOrder(db, input.actor, input.orderId);
  if (o.payment_method !== 'phone_qr' && o.payment_method !== 'card_reader')
    throw new PaidError('invalid', { detail: 'not_card' });
  // Door staff refund only the card sales made through their own link; organizers refund any door sale.
  if (input.actor.kind === 'staff' && o.staff_link_id !== input.actor.staffLinkId)
    throw new PaidError('forbidden', { detail: 'other_link' });
  return refundDirect(db, env, {
    orderId: o.id,
    ticketIds: input.ticketIds,
    includeGift: input.includeGift,
    actor: { kind: 'organizer', organizationId: o.organization_id },
    reason: input.reason ?? null,
    routing: input.routing,
    includeCheckedIn: true,
    now: input.now,
  });
}

// ── Door-day totals ────────────────────────────────────────────────────────────────────────────────────────────

/** A filter on a date's valid tickets; each door-day number is the length of the list with its filter. */
export interface DoorTicketFilter {
  channel?: OrderChannel;
  method?: PaymentMethod;
  arrival?: 'checked_in' | 'to_arrive';
}

export const DOOR_TOTAL_FILTERS = {
  soldOnline: { channel: 'online' },
  doorCash: { channel: 'door', method: 'cash' },
  doorPhone: { channel: 'door', method: 'phone_qr' },
  doorReader: { channel: 'door', method: 'card_reader' },
  doorComp: { channel: 'door', method: 'comp' },
  checkedIn: { arrival: 'checked_in' },
  toArrive: { arrival: 'to_arrive' },
} as const satisfies Record<string, DoorTicketFilter>;

export type DoorTotalKey = keyof typeof DOOR_TOTAL_FILTERS;
export type DoorTotals = Record<DoorTotalKey, number>;

const CHANNELS: readonly string[] = ['online', 'door'];
const METHODS: readonly string[] = ['card_online', 'phone_qr', 'card_reader', 'cash', 'comp', 'free'];

/** The query string for a filter (`channel=door&method=cash`), so a number links to its list. */
export function doorFilterQuery(filter: DoorTicketFilter): string {
  const p = new URLSearchParams();
  if (filter.channel) p.set('channel', filter.channel);
  if (filter.method) p.set('method', filter.method);
  if (filter.arrival) p.set('arrival', filter.arrival);
  return p.toString();
}

/** Reads a filter back from a query string; unknown values are dropped. */
export function parseDoorFilter(params: URLSearchParams): DoorTicketFilter {
  const filter: DoorTicketFilter = {};
  const channel = params.get('channel');
  const method = params.get('method');
  const arrival = params.get('arrival');
  if (channel && CHANNELS.includes(channel)) filter.channel = channel as OrderChannel;
  if (method && METHODS.includes(method)) filter.method = method as PaymentMethod;
  if (arrival === 'checked_in' || arrival === 'to_arrive') filter.arrival = arrival;
  return filter;
}

/** The one WHERE clause both the lists and the counts use. ?1 = occurrence id. */
function doorTicketWhere(filter: DoorTicketFilter): { sql: string; params: string[] } {
  const parts = [`t.occurrence_id = ?1`, `t.status = 'valid'`, `o.is_preview = 0`];
  const params: string[] = [];
  if (filter.channel) {
    params.push(filter.channel);
    parts.push(`o.channel = ?${params.length + 1}`);
  }
  if (filter.method) {
    params.push(filter.method);
    parts.push(`o.payment_method = ?${params.length + 1}`);
  }
  if (filter.arrival === 'checked_in') parts.push('t.checked_in_at IS NOT NULL');
  if (filter.arrival === 'to_arrive') parts.push('t.checked_in_at IS NULL');
  return { sql: parts.join(' AND '), params };
}

export interface DoorTicketRow {
  ticketId: string;
  orderId: string;
  reference: string;
  ticketType: string;
  holderName: string | null;
  channel: OrderChannel;
  method: PaymentMethod;
  checkedInAt: number | null;
  paidAt: number | null;
}

/** The tickets behind a door-day number (organization-scoped). */
export async function listDoorTickets(
  db: SqlDatabase,
  input: { organizationId: string; occurrenceId: string; filter: DoorTicketFilter },
): Promise<DoorTicketRow[]> {
  const where = doorTicketWhere(input.filter);
  const orgParam = `?${where.params.length + 2}`;
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT t.id, t.order_id, o.reference, tt.name AS type_name, t.holder_name, o.channel, o.payment_method,
                 t.checked_in_at, o.paid_at
            FROM tickets t JOIN orders o ON o.id = t.order_id JOIN ticket_types tt ON tt.id = t.ticket_type_id
           WHERE ${where.sql} AND o.organization_id = ${orgParam}
           ORDER BY o.paid_at DESC, t.order_id, t.seq`,
    params: [input.occurrenceId, ...where.params, input.organizationId],
  });
  return rows.map((r) => ({
    ticketId: String(r.id),
    orderId: String(r.order_id),
    reference: String(r.reference),
    ticketType: String(r.type_name),
    holderName: (r.holder_name as string | null) ?? null,
    channel: r.channel as OrderChannel,
    method: r.payment_method as PaymentMethod,
    checkedInAt: r.checked_in_at == null ? null : Number(r.checked_in_at),
    paidAt: r.paid_at == null ? null : Number(r.paid_at),
  }));
}

/** Door-day totals for one date: sold online, sold at the door by method, checked in, still to arrive (tickets). */
export async function doorTotals(
  db: SqlDatabase,
  input: { organizationId: string; occurrenceId: string },
): Promise<DoorTotals> {
  const keys = Object.keys(DOOR_TOTAL_FILTERS) as DoorTotalKey[];
  const results = await runBatch(
    db,
    keys.map((key) => {
      const where = doorTicketWhere(DOOR_TOTAL_FILTERS[key]);
      return {
        sql: `SELECT COUNT(*) AS n FROM tickets t JOIN orders o ON o.id = t.order_id
               WHERE ${where.sql} AND o.organization_id = ?${where.params.length + 2}`,
        params: [input.occurrenceId, ...where.params, input.organizationId],
      };
    }),
  );
  const totals = {} as DoorTotals;
  keys.forEach((key, i) => {
    totals[key] = Number((results[i][0] as { n?: number } | undefined)?.n ?? 0);
  });
  return totals;
}

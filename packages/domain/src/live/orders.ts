/**
 * Paid orders for Gamo Live (docs/LIVE_REQUIREMENTS.md §8.1 items 3 and 8, §8.2 items 11–13, §8.4 item 27;
 * docs/LIVE_PAYMENTS.md §3–4; docs/LIVE_DATA_MODEL.md §8 "Rules the database enforces").
 *
 * - **A pending order is the hold.** `reserveOrder` validates everything on the server, prices the order from the
 *   database (never from a form), snapshots the policies, the fee and the funds-flow mode, and reserves in one D1 batch:
 *   it releases this date's expired holds, adds each line to `ticket_inventory` (`online_taken` or `door_taken`) and
 *   the people to `occurrence_inventory`, takes the code use and inserts the order and its items. Any inventory `CHECK`
 *   failure rolls the whole batch back (`sold_out`), so a multi-line order is all or nothing.
 * - **Paid only once.** `markOrderPaid` checks amount, currency, the paying object and the account, then turns
 *   `pending` into `paid` with the tickets, the payment row and the ledger in one batch. A payment that arrives after
 *   the hold was released takes the seats again in the same batch; when they are gone the order becomes
 *   `paid_unfulfilled` (the caller refunds it in full and emails the buyer).
 * - `releaseOrder` / `releaseExpiredOrders` give the seats and the code use back.
 * - Comp tickets (`issueCompOrder`), the organizer's order lists, counts, detail and CSV, and voiding a preview order.
 */
import { encodeBase32 } from '../security/base32.ts';
import { randomBytes } from '../security/crypto.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { newOrderReference, newPrefixedId, newTicketId } from '../security/ids.ts';
import { hashEmail, isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import {
  allRows,
  runBatch,
  type SqlDatabase,
  type SqlParam,
  type SqlStatementSpec,
} from '../security/sql-database.ts';
import { codeUnlocks, discountOf, findUsableCode, type EventCode } from './codes.ts';
import { checkInWindow, csvCell } from './events.ts';
import { policySnapshotOf, readEventTicketing, type EventTicketing } from './event-ticketing.ts';
import { feeSnapshotOf, priceOrder } from './fees.ts';
import { GIFT_MAX_CENTS, GIFT_MIN_CENTS } from './gifts.ts';
import { ledgerForPaidOrder } from './ledger.ts';
import { isCents } from './money.ts';
import { currentFeeSetting, organizationPaymentsStatus, sellerOf, stripeModeOf } from './payments/resolve.ts';
import { unitPricesForEvent } from './pricing.ts';
import {
  DOOR_PHONE_HOLD_SECONDS,
  ORDER_CHANNELS,
  ORDER_HOLD_SECONDS,
  ORDER_STATUSES,
  PAID_ID_PREFIX,
  PAYMENT_METHODS,
  PaidError,
  STRIPE_METHODS,
  type FeePayer,
  type FundsFlow,
  type MarkOrderPaid,
  type MarkPaidResult,
  type OrderChannel,
  type OrderStatus,
  type PaidEnv,
  type PaymentKind,
  type PaymentMethod,
  type PaymentStatus,
  type PriceLineInput,
  type PricedOrder,
  type ReleaseOrder,
  type ReleaseReason,
  type ReserveOrder,
  type ReserveOrderInput,
  type ReservedOrder,
  type Seller,
} from './paid-types.ts';

export const BUYER_NAME_MAX = 100;
export const COMP_REASON_MAX = 200;
/** Methods each channel may use (the `orders` CHECK allows only card_online, comp and free online). */
export const CHANNEL_METHODS: Record<OrderChannel, readonly PaymentMethod[]> = {
  online: ['card_online', 'comp', 'free'],
  door: ['phone_qr', 'card_reader', 'cash', 'comp', 'free'],
};
/** Order statuses whose seats are taken and whose tickets exist (or existed). */
const PAID_STATUSES: readonly OrderStatus[] = ['paid', 'paid_unfulfilled', 'refunded', 'partially_refunded'];
/** Statuses an order is in after its hold was released. */
const RELEASED_STATUSES: readonly OrderStatus[] = ['expired', 'canceled', 'voided'];

const isStripe = (m: PaymentMethod) => STRIPE_METHODS.includes(m);
const inList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

/** True when a D1 / SQLite error is a failed `CHECK` constraint. */
export function isCheckFailure(error: unknown): boolean {
  return /CHECK constraint failed/i.test(String((error as Error)?.message ?? error));
}
const isForeignKeyFailure = (error: unknown) =>
  /FOREIGN KEY constraint failed/i.test(String((error as Error)?.message));
const isUniqueFailure = (error: unknown) =>
  /UNIQUE constraint failed/i.test(String((error as Error)?.message));

// ── Releasing holds ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Statements that give back the seats, people and code uses of every order matching `pred` (SQL over alias `o` of
 * `orders`, using `?1`…`?k` from `params`), mark their pending payments and set the orders to `to`. The orders update
 * comes last because the earlier statements find the orders through `pred`.
 */
export function releaseStatements(
  pred: string,
  params: readonly SqlParam[],
  to: OrderStatus,
  paymentStatus: PaymentStatus,
  now: number,
): SqlStatementSpec[] {
  const k = params.length;
  const p = [...params];
  const items = (channel: OrderChannel) =>
    `COALESCE((SELECT SUM(i.quantity) FROM order_items i JOIN orders o ON o.id = i.order_id
                WHERE i.ticket_type_id = ticket_inventory.ticket_type_id
                  AND o.occurrence_id = ticket_inventory.occurrence_id AND o.channel = '${channel}' AND (${pred})), 0)`;
  const out: SqlStatementSpec[] = [
    {
      sql: `UPDATE ticket_inventory
               SET online_taken = online_taken - ${items('online')}, door_taken = door_taken - ${items('door')}
             WHERE EXISTS (SELECT 1 FROM order_items i JOIN orders o ON o.id = i.order_id
                            WHERE i.ticket_type_id = ticket_inventory.ticket_type_id
                              AND o.occurrence_id = ticket_inventory.occurrence_id AND (${pred}))`,
      params: p,
    },
    {
      sql: `UPDATE occurrence_inventory
               SET people_taken = people_taken - COALESCE((SELECT SUM(i.quantity * i.people_per_ticket)
                     FROM order_items i JOIN orders o ON o.id = i.order_id
                    WHERE o.occurrence_id = occurrence_inventory.occurrence_id AND (${pred})), 0)
             WHERE occurrence_id IN (SELECT o.occurrence_id FROM orders o WHERE ${pred})`,
      params: p,
    },
    {
      sql: `UPDATE event_codes
               SET uses = MAX(0, uses - (SELECT COUNT(*) FROM orders o WHERE o.code_id = event_codes.id AND (${pred})))
             WHERE id IN (SELECT o.code_id FROM orders o WHERE o.code_id IS NOT NULL AND (${pred}))`,
      params: p,
    },
    {
      sql: `UPDATE payments SET status = ?${k + 1}, updated_at = ?${k + 2}
             WHERE status = 'pending' AND order_id IN (SELECT o.id FROM orders o WHERE ${pred})`,
      params: [...p, paymentStatus, now],
    },
  ];
  if (to === 'voided')
    out.push({
      sql: `UPDATE tickets SET status = 'voided', updated_at = ?${k + 1}
             WHERE status = 'valid' AND order_id IN (SELECT o.id FROM orders o WHERE ${pred})`,
      params: [...p, now],
    });
  out.push({
    sql: `UPDATE orders SET status = ?${k + 1}, hold_expires_at = NULL, canceled_at = ?${k + 2}, updated_at = ?${k + 2}
           WHERE id IN (SELECT o.id FROM orders o WHERE ${pred}) RETURNING id`,
    params: [...p, to, now],
  });
  return out;
}

/** Pending orders whose hold has passed (cash, comp and free orders left pending count from their creation). */
function expiredPredicate(now: number, occurrenceId: string | null): { pred: string; params: SqlParam[] } {
  const base =
    "o.status = 'pending' AND ((o.hold_expires_at IS NOT NULL AND o.hold_expires_at <= ?1) " +
    'OR (o.hold_expires_at IS NULL AND o.created_at <= ?2))';
  return occurrenceId
    ? { pred: `${base} AND o.occurrence_id = ?3`, params: [now, now - ORDER_HOLD_SECONDS, occurrenceId] }
    : { pred: base, params: [now, now - ORDER_HOLD_SECONDS] };
}

/** Releases every expired pending order (all dates). Safe to run at any time, for example from a scheduled job. */
export async function releaseExpiredOrders(db: SqlDatabase, now: number): Promise<{ released: number }> {
  const { pred, params } = expiredPredicate(now, null);
  const results = await runBatch(db, releaseStatements(pred, params, 'expired', 'expired', now));
  return { released: results[results.length - 1].length };
}

const RELEASE_TARGET: Record<ReleaseReason, { order: OrderStatus; payment: PaymentStatus }> = {
  expired: { order: 'expired', payment: 'expired' },
  canceled: { order: 'canceled', payment: 'canceled' },
  failed: { order: 'canceled', payment: 'failed' },
  voided: { order: 'voided', payment: 'canceled' },
};

/**
 * Releases one order's hold: a pending order becomes expired or canceled (`failed` also cancels it), and a preview
 * order (pending or paid) can be voided. Returns `released: false` when the order was not in a releasable state.
 */
export const releaseOrder: ReleaseOrder = async (db, input) => {
  const target = RELEASE_TARGET[input.reason];
  if (!target) throw new PaidError('invalid', { detail: 'reason' });
  const pred =
    input.reason === 'voided'
      ? "o.id = ?1 AND (o.status = 'pending' OR (o.status = 'paid' AND o.is_preview = 1))"
      : "o.id = ?1 AND o.status = 'pending'";
  const results = await runBatch(
    db,
    releaseStatements(pred, [input.orderId], target.order, target.payment, input.now),
  );
  return { released: results[results.length - 1].length > 0 };
};

// ── Reserving ──────────────────────────────────────────────────────────────────────────────────────────────────

interface OccurrenceContext {
  event_id: string;
  organization_id: string;
  event_status: string;
  admission: string;
  title: string;
  timezone: string;
  checkin_opens_hours: number;
  starts_at: number;
  occurrence_status: string;
  checkin_opened_at: number | null;
  org_status: string;
}

async function loadOccurrenceContext(
  db: SqlDatabase,
  eventId: string,
  occurrenceId: string,
): Promise<OccurrenceContext | null> {
  const [row] = await allRows<OccurrenceContext>(db, {
    sql: `SELECT e.id AS event_id, e.organization_id, e.status AS event_status, e.admission, e.title, e.timezone,
                 e.checkin_opens_hours, o.starts_at, o.status AS occurrence_status, o.checkin_opened_at,
                 g.status AS org_status
            FROM event_occurrences o JOIN events e ON e.id = o.event_id JOIN organizations g ON g.id = e.organization_id
           WHERE o.id = ?1 AND e.id = ?2`,
    params: [occurrenceId, eventId],
  });
  return row ?? null;
}

interface TicketTypeRow {
  id: string;
  name: string;
  price_cents: number;
  people_per_ticket: number;
  per_order_limit: number;
  sales_start_at: number | null;
  sales_end_at: number | null;
  status: 'on_sale' | 'hidden' | 'ended';
}

/** Merges repeated ticket types and checks quantities. */
export function normalizeLines(
  lines: ReserveOrderInput['lines'],
): Array<{ ticketTypeId: string; quantity: number }> {
  const merged = new Map<string, number>();
  for (const line of lines ?? []) {
    const id = String(line?.ticketTypeId ?? '');
    const q = line?.quantity;
    if (!id || !Number.isInteger(q) || q < 0 || q > 50)
      throw new PaidError('invalid', { detail: 'quantity' });
    if (q > 0) merged.set(id, (merged.get(id) ?? 0) + q);
  }
  if (merged.size === 0) throw new PaidError('invalid', { detail: 'lines' });
  return [...merged].map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
}

/** Name and email of the buyer, checked; the email lower-cased. */
function buyerOf(input: ReserveOrderInput, required: boolean): { name: string | null; email: string | null } {
  const name = String(input.buyerName ?? '').trim() || null;
  const rawEmail = String(input.buyerEmail ?? '').trim();
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (name && name.length > BUYER_NAME_MAX) throw new PaidError('invalid', { detail: 'name' });
  if (email && !isPlausibleEmail(email)) throw new PaidError('invalid', { detail: 'email' });
  if (required && !name) throw new PaidError('invalid', { detail: 'name' });
  if (required && !email) throw new PaidError('invalid', { detail: 'email' });
  return { name, email };
}

export interface OrderPlan {
  ctx: OccurrenceContext;
  ticketing: EventTicketing;
  lines: Array<PriceLineInput & { quantity: number }>;
  code: EventCode | null;
  priced: PricedOrder;
  fundsFlow: FundsFlow | null;
  seller: Seller;
  stripeAccountId: string | null;
  livemode: boolean;
  feeSnapshotJson: string;
}

/**
 * Every check and the server-side price of an order, without writing anything (used by `reserveOrder` and the
 * checkout quote). Throws `PaidError`.
 */
export async function planOrder(
  db: SqlDatabase,
  env: PaidEnv,
  input: ReserveOrderInput,
  opts: { quoteOnly?: boolean } = {},
): Promise<OrderPlan> {
  const channel = input.channel;
  const method = input.paymentMethod;
  if (!ORDER_CHANNELS.includes(channel)) throw new PaidError('invalid', { detail: 'channel' });
  if (!PAYMENT_METHODS.includes(method) || !CHANNEL_METHODS[channel].includes(method))
    throw new PaidError('invalid', { detail: 'payment_method' });
  const lines = normalizeLines(input.lines);
  const now = input.now;
  const comp = method === 'comp';
  const preview = input.isPreview === true;
  // A preview is a test of the buyer journey: never with live Stripe keys, where it would charge a real card.
  if (preview && stripeModeOf(env) === 'stripe' && env.ENVIRONMENT === 'production')
    throw new PaidError('forbidden', { detail: 'preview_live' });
  /** Rules a buyer meets online (hidden types, sales windows, names); the organizer's comps skip them. */
  const buyerFacing = channel === 'online' && !comp;

  const ctx = await loadOccurrenceContext(db, input.eventId, input.occurrenceId);
  if (!ctx) throw new PaidError('not_found');
  const visible =
    ctx.event_status === 'published' || (preview && !['canceled', 'rejected'].includes(ctx.event_status));
  if (!visible || ctx.org_status !== 'active') throw new PaidError('not_found');
  if (ctx.admission !== 'paid_tickets') throw new PaidError('not_on_sale', { detail: 'admission' });
  if (ctx.occurrence_status !== 'scheduled') throw new PaidError('not_on_sale', { detail: 'date_canceled' });
  const future = ctx.starts_at > now;
  const doorOpen =
    channel === 'door' &&
    checkInWindow(
      { startsAt: ctx.starts_at, opensHours: ctx.checkin_opens_hours, openedAt: ctx.checkin_opened_at },
      now,
    ).open;
  if (!future && !doorOpen) throw new PaidError('closed_past');

  const ticketing = await readEventTicketing(db, ctx.event_id);
  if (!ticketing) throw new PaidError('not_on_sale', { detail: 'no_settings' });
  const payments = await organizationPaymentsStatus(db, env, ctx.organization_id);
  if (channel === 'door' && (!ticketing.doorSalesEnabled || !payments.doorSalesEnabled))
    throw new PaidError('not_on_sale', { detail: 'door_sales_off' });

  const typeIds = lines.map((l) => l.ticketTypeId);
  const types = await allRows<TicketTypeRow>(db, {
    sql: `SELECT id, name, price_cents, people_per_ticket, per_order_limit, sales_start_at, sales_end_at, status
            FROM ticket_types WHERE event_id = ?1 AND id IN (${typeIds.map((_, i) => `?${i + 2}`).join(', ')})`,
    params: [ctx.event_id, ...typeIds],
  });
  const typeById = new Map(types.map((t) => [t.id, t]));
  if (types.length !== lines.length) throw new PaidError('invalid', { detail: 'ticket_type' });

  const code = comp ? null : await findUsableCode(db, ctx.event_id, input.code, now);
  let total = 0;
  for (const line of lines) {
    const t = typeById.get(line.ticketTypeId)!;
    if (t.status === 'ended') throw new PaidError('not_on_sale', { detail: 'ended' });
    if (buyerFacing && t.status === 'hidden' && !codeUnlocks(code, t.id))
      throw new PaidError('not_on_sale', { detail: 'hidden' });
    if (buyerFacing && t.sales_start_at != null && now < t.sales_start_at)
      throw new PaidError('not_on_sale', { detail: 'sales_not_started' });
    if (buyerFacing && t.sales_end_at != null && now >= t.sales_end_at)
      throw new PaidError('not_on_sale', { detail: 'sales_ended' });
    if (line.quantity > t.per_order_limit) throw new PaidError('limit_exceeded', { detail: t.id });
    total += line.quantity;
  }
  if (total > ticketing.maxTicketsPerOrder) throw new PaidError('limit_exceeded', { detail: 'order' });

  if (comp) {
    const reason = String(input.compReason ?? '').trim();
    if (!reason || reason.length > COMP_REASON_MAX) throw new PaidError('invalid', { detail: 'comp_reason' });
  }
  // A quote for the first checkout step has no buyer yet; everything else is checked the same way.
  const askBuyer = buyerFacing && !opts.quoteOnly;
  buyerOf(input, askBuyer);
  if (askBuyer && ticketing.namesRequired) {
    const names = (input.attendeeNames ?? []).map((n) => String(n ?? '').trim());
    if (names.length !== total || names.some((n) => !n || n.length > BUYER_NAME_MAX))
      throw new PaidError('invalid', { detail: 'attendee_names' });
  }
  const gift = input.giftCents ?? 0;
  if (!isCents(gift, 0, GIFT_MAX_CENTS) || (gift > 0 && gift < GIFT_MIN_CENTS))
    throw new PaidError('invalid', { detail: 'gift' });
  if (gift > 0 && (comp || !ticketing.giftsEnabled)) throw new PaidError('invalid', { detail: 'gift' });

  const prices = comp ? null : await unitPricesForEvent(db, ctx.event_id, now);
  const priceLines = lines.map((l) => {
    const t = typeById.get(l.ticketTypeId)!;
    return {
      ticketTypeId: t.id,
      name: t.name,
      unitPriceCents: comp ? 0 : (prices!.get(t.id) ?? t.price_cents),
      quantity: l.quantity,
      peoplePerTicket: t.people_per_ticket,
    };
  });
  const fee = feeSnapshotOf(await currentFeeSetting(db, now), ticketing.feePayer);
  const priced = priceOrder({
    lines: priceLines,
    discount: discountOf(code),
    fee,
    giftCents: gift,
    chargeFee: isStripe(method),
  });
  if (method === 'free' && priced.totalCents !== 0) throw new PaidError('invalid', { detail: 'not_free' });
  if (isStripe(method) && priced.totalCents === 0) throw new PaidError('invalid', { detail: 'free_order' });

  // Card sales need the funds-flow mode and a ready account (checked after pricing, so a free order is told so).
  let fundsFlow: FundsFlow | null = null;
  let seller: Seller = 'organization';
  let stripeAccountId: string | null = null;
  let livemode = false;
  if (isStripe(method)) {
    if (!payments.cardSalesAvailable || !payments.flow)
      throw new PaidError('payments_unavailable', { detail: payments.reason ?? 'stripe_not_configured' });
    fundsFlow = payments.flow;
    seller = sellerOf(fundsFlow);
    stripeAccountId = fundsFlow === 'organizer_account' ? (payments.org?.connectedAccountId ?? null) : null;
    livemode = !payments.testMode;
  }
  return {
    ctx,
    ticketing,
    lines: priceLines,
    code,
    priced,
    fundsFlow,
    seller,
    stripeAccountId,
    livemode,
    feeSnapshotJson: JSON.stringify(fee),
  };
}

function holdFor(method: PaymentMethod, now: number): number | null {
  if (method === 'phone_qr') return now + DOOR_PHONE_HOLD_SECONDS;
  if (isStripe(method)) return now + ORDER_HOLD_SECONDS;
  return null;
}

/** Reserves the seats and creates the pending order (see the file comment). Throws `PaidError`. */
export const reserveOrder: ReserveOrder = async (db, env, input) => {
  const plan = await planOrder(db, env, input);
  const { ctx, priced } = plan;
  const now = input.now;
  const { name, email } = buyerOf(input, false);
  const emailHash = email
    ? await hashEmail(email, resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET'))
    : null;
  const holdExpiresAt = holdFor(input.paymentMethod, now);
  const counter = input.channel === 'online' ? 'online_taken' : 'door_taken';
  const people = priced.lines.reduce((sum, l) => sum + l.quantity * l.peoplePerTicket, 0);
  const comp = input.paymentMethod === 'comp';
  // Validated by planOrder when the event requires names; kept only for issuing the tickets.
  const givenNames = (input.attendeeNames ?? []).map((n) => String(n ?? '').trim()).filter(Boolean);
  const attendeeNames = givenNames.length ? JSON.stringify(givenNames) : null;

  for (let attempt = 0; ; attempt += 1) {
    const orderId = newPrefixedId(PAID_ID_PREFIX.order);
    const reference = newOrderReference('GL');
    const expired = expiredPredicate(now, input.occurrenceId);
    const typeParams = priced.lines.map((l) => l.ticketTypeId);
    const statements: SqlStatementSpec[] = [
      ...releaseStatements(expired.pred, expired.params, 'expired', 'expired', now),
      ...priced.lines.map((l) => ({
        sql: `UPDATE ticket_inventory SET ${counter} = ${counter} + ?3 WHERE ticket_type_id = ?1 AND occurrence_id = ?2`,
        params: [l.ticketTypeId, input.occurrenceId, l.quantity],
      })),
      {
        sql: 'UPDATE occurrence_inventory SET people_taken = people_taken + ?2 WHERE occurrence_id = ?1',
        params: [input.occurrenceId, people],
      },
      ...(plan.code
        ? [
            {
              sql: 'UPDATE event_codes SET uses = uses + 1 WHERE id = ?1',
              params: [plan.code.id] as SqlParam[],
            },
          ]
        : []),
      // The order exists only when every inventory row exists; otherwise the item inserts fail their foreign key
      // and the whole batch rolls back.
      {
        sql: `INSERT INTO orders (id, reference, event_id, occurrence_id, organization_id, channel, payment_method,
                status, is_preview, funds_flow, seller, stripe_account_id, livemode, buyer_name, buyer_email, email_hash,
                currency, subtotal_cents, discount_cents, fee_cents, fee_payer, gift_cents, total_cents, code_id,
                policy_snapshot, fee_snapshot, terms_version, comp_reason, hold_expires_at, staff_link_id,
                cash_session_id, reader_id, created_at, updated_at)
              SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19,
                     ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?32
               WHERE EXISTS (SELECT 1 FROM occurrence_inventory WHERE occurrence_id = ?4)
                 AND (SELECT COUNT(*) FROM ticket_inventory WHERE occurrence_id = ?4
                       AND ticket_type_id IN (${typeParams.map((_, i) => `?${33 + i}`).join(', ')})) = ${typeParams.length}`,
        params: [
          orderId,
          reference,
          ctx.event_id,
          input.occurrenceId,
          ctx.organization_id,
          input.channel,
          input.paymentMethod,
          input.isPreview ? 1 : 0,
          plan.fundsFlow,
          plan.seller,
          plan.stripeAccountId,
          plan.livemode ? 1 : 0,
          name,
          email,
          emailHash,
          priced.currency,
          priced.subtotalCents,
          priced.discountCents,
          priced.feeCents,
          priced.feePayer,
          priced.giftCents,
          priced.totalCents,
          plan.code?.id ?? null,
          JSON.stringify(policySnapshotOf(plan.ticketing)),
          plan.feeSnapshotJson,
          input.termsVersion ?? null,
          comp ? String(input.compReason).trim() : null,
          holdExpiresAt,
          input.staffLinkId ?? null,
          input.cashSessionId ?? null,
          input.readerId ?? null,
          now,
          ...typeParams,
        ],
      },
      ...(attendeeNames
        ? [{ sql: 'UPDATE orders SET attendee_names = ?2 WHERE id = ?1', params: [orderId, attendeeNames] }]
        : []),
      ...priced.lines.map((l) => ({
        sql: `INSERT INTO order_items (id, order_id, ticket_type_id, name, unit_price_cents, quantity, people_per_ticket,
                discount_cents, fee_cents, line_total_cents) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
        params: [
          newPrefixedId(PAID_ID_PREFIX.orderItem),
          orderId,
          l.ticketTypeId,
          l.name,
          l.unitPriceCents,
          l.quantity,
          l.peoplePerTicket,
          l.discountCents,
          l.feeCents,
          l.lineTotalCents,
        ],
      })),
    ];
    try {
      await runBatch(db, statements);
    } catch (error) {
      if (isCheckFailure(error)) {
        if (plan.code) {
          const [c] = await allRows<{ uses: number; max_uses: number | null }>(db, {
            sql: 'SELECT uses, max_uses FROM event_codes WHERE id = ?1',
            params: [plan.code.id],
          });
          if (c && c.max_uses != null && c.uses >= c.max_uses)
            throw new PaidError('code_used_up', { detail: 'code' });
        }
        throw new PaidError('sold_out');
      }
      if (isForeignKeyFailure(error)) throw new PaidError('not_on_sale', { detail: 'inventory_missing' });
      if (isUniqueFailure(error) && attempt < 2) continue; // reference collision: try a new one
      throw error;
    }
    return {
      orderId,
      reference,
      organizationId: ctx.organization_id,
      status: 'pending',
      priced,
      fundsFlow: plan.fundsFlow,
      seller: plan.seller,
      stripeAccountId: plan.stripeAccountId,
      holdExpiresAt,
    } satisfies ReservedOrder;
  }
};

// ── Paid ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface OrderRow {
  id: string;
  event_id: string;
  occurrence_id: string;
  organization_id: string;
  channel: OrderChannel;
  payment_method: PaymentMethod;
  status: OrderStatus;
  is_preview: number;
  funds_flow: FundsFlow | null;
  stripe_account_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  email_hash: string | null;
  /** JSON array of attendee names in ticket order, when the event requires names. */
  attendee_names?: string | null;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  fee_payer: FeePayer;
  gift_cents: number;
  total_cents: number;
  code_id: string | null;
  checkout_session_id: string | null;
  payment_intent_id: string | null;
  event_status: string;
  occurrence_status: string;
}

interface ItemRow {
  id: string;
  ticket_type_id: string;
  quantity: number;
  people_per_ticket: number;
}

/** 16 random bytes in Crockford base 32: the per-ticket salt of the QR credential. */
export const newCredentialSalt = () => encodeBase32(randomBytes(16));

const TICKETS_PER_STATEMENT = 20;

/** Ticket inserts for every seat of a paid order, conditional on the order being `paid` at that point. */
function ticketInserts(
  order: OrderRow,
  items: readonly ItemRow[],
  opts: { admit: boolean; admittedBy: string | null; now: number },
): { statements: SqlStatementSpec[]; ticketIds: string[] } {
  const statements: SqlStatementSpec[] = [];
  const ticketIds: string[] = [];
  // Attendee names (when the event required them) go to the tickets in order; otherwise the buyer's name.
  let names: string[] = [];
  try {
    const parsed: unknown = order.attendee_names ? JSON.parse(order.attendee_names) : [];
    if (Array.isArray(parsed)) names = parsed.map((n) => String(n));
  } catch {
    names = [];
  }
  let seatIndex = 0;
  for (const item of items) {
    const seats = Array.from({ length: item.quantity }, (_, i) => ({ id: newTicketId(), seq: i + 1 }));
    for (let start = 0; start < seats.length; start += TICKETS_PER_STATEMENT) {
      const chunk = seats.slice(start, start + TICKETS_PER_STATEMENT);
      const shared: SqlParam[] = [
        order.id,
        item.id,
        order.event_id,
        order.occurrence_id,
        item.ticket_type_id,
        order.buyer_email,
        order.email_hash,
        opts.admit ? opts.now : null,
        opts.admit ? opts.admittedBy : null,
        opts.now,
      ];
      const values: string[] = [];
      const params: SqlParam[] = [...shared];
      for (const seat of chunk) {
        const n = params.length;
        values.push(`(?${n + 1}, ?${n + 2}, ?${n + 3}, ?${n + 4})`);
        params.push(seat.id, seat.seq, newCredentialSalt(), names[seatIndex] || order.buyer_name);
        seatIndex += 1;
        ticketIds.push(seat.id);
      }
      statements.push({
        sql: `INSERT INTO tickets (id, seq, credential_salt, order_id, order_item_id, event_id, occurrence_id,
                ticket_type_id, holder_name, holder_email, email_hash, checked_in_at, checked_in_by, credential_version,
                status, created_at, updated_at)
              SELECT v.column1, v.column2, v.column3, ?1, ?2, ?3, ?4, ?5, v.column4, ?6, ?7, ?8, ?9, 1, 'valid', ?10, ?10
                FROM (VALUES ${values.join(', ')}) AS v
               WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?1 AND status = 'paid')`,
        params,
      });
    }
  }
  return { statements, ticketIds };
}

const PAYMENT_KIND_OF: Partial<Record<PaymentMethod, PaymentKind>> = { cash: 'cash', comp: 'comp' };

function paymentStatements(order: OrderRow, input: Parameters<MarkOrderPaid>[2]): SqlStatementSpec[] {
  const kind = PAYMENT_KIND_OF[order.payment_method];
  if (kind)
    return [
      {
        sql: `INSERT INTO payments (id, order_id, kind, amount_cents, currency, status, created_at, updated_at)
              SELECT ?1, ?2, ?3, ?4, ?5, 'succeeded', ?6, ?6
               WHERE NOT EXISTS (SELECT 1 FROM payments WHERE order_id = ?2 AND kind = ?3)`,
        params: [
          newPrefixedId(PAID_ID_PREFIX.payment),
          order.id,
          kind,
          order.total_cents,
          order.currency,
          input.now,
        ],
      },
    ];
  if (!isStripe(order.payment_method)) return [];
  return [
    {
      sql: `UPDATE payments SET status = 'succeeded', updated_at = ?4
             WHERE order_id = ?1 AND (provider_ref = ?2 OR provider_ref = ?3)`,
      params: [order.id, input.providerRef, input.paymentIntentId ?? input.providerRef, input.now],
    },
  ];
}

function ledgerStatements(order: OrderRow, now: number): SqlStatementSpec[] {
  return ledgerForPaidOrder({
    orderId: order.id,
    organizationId: order.organization_id,
    eventId: order.event_id,
    fundsFlow: order.funds_flow,
    paymentMethod: order.payment_method,
    isPreview: order.is_preview === 1,
    subtotalCents: order.subtotal_cents,
    discountCents: order.discount_cents,
    feeCents: order.fee_cents,
    feePayer: order.fee_payer,
    giftCents: order.gift_cents,
    currency: order.currency,
    occurredAt: now,
  });
}

async function loadOrder(db: SqlDatabase, orderId: string): Promise<OrderRow | null> {
  const [row] = await allRows<OrderRow>(db, {
    sql: `SELECT o.id, o.event_id, o.occurrence_id, o.organization_id, o.channel, o.payment_method, o.status, o.is_preview,
                 o.funds_flow, o.stripe_account_id, o.buyer_name, o.buyer_email, o.email_hash, o.currency,
                 o.subtotal_cents, o.discount_cents, o.fee_cents, o.fee_payer, o.gift_cents, o.total_cents, o.code_id,
                 o.checkout_session_id, o.payment_intent_id, o.attendee_names, e.status AS event_status,
                 oc.status AS occurrence_status
            FROM orders o JOIN events e ON e.id = o.event_id JOIN event_occurrences oc ON oc.id = o.occurrence_id
           WHERE o.id = ?1`,
    params: [orderId],
  });
  return row ?? null;
}

async function referenceMatches(
  db: SqlDatabase,
  order: OrderRow,
  providerRef: string | null,
): Promise<boolean> {
  if (!isStripe(order.payment_method)) return providerRef === null;
  if (!providerRef) return false;
  if (providerRef === order.checkout_session_id || providerRef === order.payment_intent_id) return true;
  const rows = await allRows(db, {
    sql: 'SELECT 1 AS ok FROM payments WHERE order_id = ?1 AND provider_ref = ?2',
    params: [order.id, providerRef],
  });
  return rows.length > 0;
}

/**
 * Marks an order paid after the money arrived (the verified webhook, a cash sale, a comp). See the file comment.
 * Never issues tickets on a mismatch.
 */
export const markOrderPaid: MarkOrderPaid = async (db, _env, input) => {
  const order = await loadOrder(db, input.orderId);
  if (!order) return { outcome: 'not_found' };
  if (PAID_STATUSES.includes(order.status)) return { outcome: 'already_paid', orderId: order.id };
  if (String(input.currency ?? '').toLowerCase() !== order.currency)
    return { outcome: 'mismatch', orderId: order.id, reason: 'currency' };
  if (input.amountCents !== order.total_cents)
    return { outcome: 'mismatch', orderId: order.id, reason: 'amount' };
  if ((input.stripeAccountId ?? null) !== (order.stripe_account_id ?? null))
    return { outcome: 'mismatch', orderId: order.id, reason: 'account' };
  if (!(await referenceMatches(db, order, input.providerRef)))
    return { outcome: 'mismatch', orderId: order.id, reason: 'reference' };

  const items = await allRows<ItemRow>(db, {
    sql: 'SELECT id, ticket_type_id, quantity, people_per_ticket FROM order_items WHERE order_id = ?1 ORDER BY rowid',
    params: [order.id],
  });
  const now = input.now;
  const pi = input.paymentIntentId ?? null;
  const extras = [...(input.extraStatements ?? [])];
  const canceledEvent = order.event_status === 'canceled' || order.occurrence_status === 'canceled';

  if (order.status === 'pending' && !canceledEvent) {
    const tickets = ticketInserts(order, items, {
      admit: input.admit === true,
      admittedBy: input.admittedBy ?? null,
      now,
    });
    try {
      await runBatch(db, [
        {
          sql: `UPDATE orders SET status = 'paid', paid_at = ?2, hold_expires_at = NULL,
                  payment_intent_id = COALESCE(payment_intent_id, ?3), updated_at = ?2
                 WHERE id = ?1 AND status = 'pending'`,
          params: [order.id, now, pi],
        },
        guardPaid(order.id),
        ...tickets.statements,
        ...paymentStatements(order, input),
        ...ledgerStatements(order, now),
        ...extras,
      ]);
      return { outcome: 'paid', orderId: order.id, ticketIds: tickets.ticketIds };
    } catch (error) {
      // Lost a race: a racing call issued the tickets (UNIQUE (order_item_id, seq)), or the hold was released in
      // between (the guard failed). Decide again from the order's new state.
      if (!isUniqueFailure(error) && !isCheckFailure(error)) throw error;
    }
    const again = await loadOrder(db, order.id);
    if (again && RELEASED_STATUSES.includes(again.status)) return payReleased(db, again, items, input);
    if (again && PAID_STATUSES.includes(again.status)) return { outcome: 'already_paid', orderId: order.id };
    throw new PaidError('stale', { detail: 'order_state' });
  }
  if (order.status === 'pending') {
    // The event or date was canceled while the payment was in flight: free the seats, take the money, refund it.
    const released = releaseStatements(
      "o.id = ?1 AND o.status = 'pending'",
      [order.id],
      'canceled',
      'canceled',
      now,
    );
    await runBatch(db, [...released, ...unfulfilledStatements(order, input)]);
    return { outcome: 'unfulfilled', orderId: order.id };
  }
  if (RELEASED_STATUSES.includes(order.status)) return payReleased(db, order, items, input);
  return { outcome: 'not_found' };
};

/**
 * A statement that fails the batch (an `orders` CHECK) unless the order is `paid` at that point, so nothing after it
 * (tickets, payment rows, cash movements) runs for an order this call did not just mark paid.
 */
function guardPaid(orderId: string): SqlStatementSpec {
  return { sql: "UPDATE orders SET total_cents = -1 WHERE id = ?1 AND status <> 'paid'", params: [orderId] };
}

/** Records the money of a paid order that cannot get its seats: paid (ledger written), then `paid_unfulfilled`. */
function unfulfilledStatements(order: OrderRow, input: Parameters<MarkOrderPaid>[2]): SqlStatementSpec[] {
  const now = input.now;
  return [
    {
      sql: `UPDATE orders SET status = 'paid', paid_at = ?2, hold_expires_at = NULL,
              payment_intent_id = COALESCE(payment_intent_id, ?3), updated_at = ?2
             WHERE id = ?1 AND status IN (${inList(RELEASED_STATUSES)})`,
      params: [order.id, now, input.paymentIntentId ?? null],
    },
    guardPaid(order.id),
    ...ledgerStatements(order, now),
    {
      sql: "UPDATE orders SET status = 'paid_unfulfilled', updated_at = ?2 WHERE id = ?1 AND status = 'paid'",
      params: [order.id, now],
    },
    ...paymentStatements(order, input),
    ...(input.extraStatements ?? []),
  ];
}

/** A payment for an order whose hold was released: take the seats again, or record it as unfulfilled. */
async function payReleased(
  db: SqlDatabase,
  order: OrderRow,
  items: readonly ItemRow[],
  input: Parameters<MarkOrderPaid>[2],
): Promise<MarkPaidResult> {
  const now = input.now;
  if (order.event_status !== 'canceled' && order.occurrence_status !== 'canceled') {
    const counter = order.channel === 'online' ? 'online_taken' : 'door_taken';
    const people = items.reduce((sum, i) => sum + i.quantity * i.people_per_ticket, 0);
    const tickets = ticketInserts(order, items, {
      admit: input.admit === true,
      admittedBy: input.admittedBy ?? null,
      now,
    });
    try {
      await runBatch(db, [
        ...items.map((i) => ({
          sql: `UPDATE ticket_inventory SET ${counter} = ${counter} + ?3 WHERE ticket_type_id = ?1 AND occurrence_id = ?2`,
          params: [i.ticket_type_id, order.occurrence_id, i.quantity],
        })),
        {
          sql: 'UPDATE occurrence_inventory SET people_taken = people_taken + ?2 WHERE occurrence_id = ?1',
          params: [order.occurrence_id, people],
        },
        // The code use is counted again when there is room; a paid order is never refused over its code.
        ...(order.code_id
          ? [
              {
                sql: 'UPDATE event_codes SET uses = uses + 1 WHERE id = ?1 AND (max_uses IS NULL OR uses < max_uses)',
                params: [order.code_id] as SqlParam[],
              },
            ]
          : []),
        {
          sql: `UPDATE orders SET status = 'paid', paid_at = ?2, hold_expires_at = NULL, canceled_at = NULL,
                  payment_intent_id = COALESCE(payment_intent_id, ?3), updated_at = ?2
                 WHERE id = ?1 AND status IN (${inList(RELEASED_STATUSES)})`,
          params: [order.id, now, input.paymentIntentId ?? null],
        },
        guardPaid(order.id),
        ...tickets.statements,
        ...paymentStatements(order, input),
        ...ledgerStatements(order, now),
        ...(input.extraStatements ?? []),
      ]);
      return { outcome: 'paid', orderId: order.id, ticketIds: tickets.ticketIds };
    } catch (error) {
      if (isUniqueFailure(error)) return { outcome: 'already_paid', orderId: order.id };
      if (!isCheckFailure(error)) throw error;
      // The seats are gone (an inventory CHECK), or the order changed in between (the guard): see below.
    }
  }
  try {
    await runBatch(db, unfulfilledStatements(order, input));
    return { outcome: 'unfulfilled', orderId: order.id };
  } catch (error) {
    if (!isCheckFailure(error)) throw error;
  }
  const after = await loadOrder(db, order.id);
  if (after && PAID_STATUSES.includes(after.status)) return { outcome: 'already_paid', orderId: order.id };
  throw new PaidError('stale', { detail: 'order_state' });
}

// ── Comp tickets ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Issues comp tickets on this organization's event (organizer-issued, price 0, reason required, no fee, paid at
 * once). Door comps use `reserveOrder` with the door channel and the staff link's permission.
 */
export async function issueCompOrder(
  db: SqlDatabase,
  env: PaidEnv,
  input: {
    organizationId: string;
    eventId: string;
    occurrenceId: string;
    lines: ReserveOrderInput['lines'];
    compReason: string;
    buyerName?: string | null;
    buyerEmail?: string | null;
    now: number;
  },
): Promise<{ orderId: string; reference: string; ticketIds: string[] }> {
  const [owned] = await allRows(db, {
    sql: 'SELECT 1 AS ok FROM events WHERE id = ?1 AND organization_id = ?2',
    params: [input.eventId, input.organizationId],
  });
  if (!owned) throw new PaidError('not_found');
  const reserved = await reserveOrder(db, env, {
    eventId: input.eventId,
    occurrenceId: input.occurrenceId,
    channel: 'online',
    paymentMethod: 'comp',
    lines: input.lines,
    compReason: input.compReason,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    now: input.now,
  });
  const paid = await markOrderPaid(db, env, {
    orderId: reserved.orderId,
    amountCents: 0,
    currency: reserved.priced.currency,
    providerRef: null,
    stripeAccountId: null,
    now: input.now,
  });
  if (paid.outcome !== 'paid') throw new PaidError('stale', { detail: paid.outcome });
  return { orderId: reserved.orderId, reference: reserved.reference, ticketIds: paid.ticketIds };
}

// ── Organizer reads ────────────────────────────────────────────────────────────────────────────────────────────

export interface OrderListFilter {
  /** Name, email or reference. */
  q?: string | null;
  status?: OrderStatus | null;
  ticketTypeId?: string | null;
  channel?: OrderChannel | null;
  method?: PaymentMethod | null;
  /** Only orders with a buyer's refund request still waiting for a decision. */
  refundRequested?: boolean;
  /** Preview orders are excluded unless asked for. */
  includePreview?: boolean;
  limit?: number;
}

export const ORDER_LIST_LIMIT = 500;

/** The WHERE clause shared by the list, the counts and the CSV (so a count always equals its list). */
function orderWhere(
  organizationId: string,
  eventId: string,
  f: OrderListFilter,
): { where: string; params: SqlParam[] } {
  const params: SqlParam[] = [eventId, organizationId];
  const parts = ['o.event_id = ?1', 'o.organization_id = ?2'];
  const add = (sql: (n: number) => string, value: SqlParam) => {
    params.push(value);
    parts.push(sql(params.length));
  };
  if (!f.includePreview) parts.push('o.is_preview = 0');
  if (f.status) {
    if (!ORDER_STATUSES.includes(f.status)) throw new PaidError('invalid', { detail: 'status' });
    add((n) => `o.status = ?${n}`, f.status);
  }
  if (f.channel) {
    if (!ORDER_CHANNELS.includes(f.channel)) throw new PaidError('invalid', { detail: 'channel' });
    add((n) => `o.channel = ?${n}`, f.channel);
  }
  if (f.method) {
    if (!PAYMENT_METHODS.includes(f.method)) throw new PaidError('invalid', { detail: 'method' });
    add((n) => `o.payment_method = ?${n}`, f.method);
  }
  if (f.refundRequested)
    parts.push("EXISTS (SELECT 1 FROM refunds rf WHERE rf.order_id = o.id AND rf.status = 'requested')");
  if (f.ticketTypeId)
    add(
      (n) => `EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.ticket_type_id = ?${n})`,
      f.ticketTypeId,
    );
  const q = String(f.q ?? '').trim();
  if (q) {
    const like = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const ref = q.toUpperCase().replace(/\s+/g, '');
    params.push(like, `%${ref.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const a = params.length - 1;
    parts.push(
      `(lower(COALESCE(o.buyer_name, '')) LIKE ?${a} ESCAPE '\\' OR COALESCE(o.buyer_email, '') LIKE ?${a} ESCAPE '\\' ` +
        `OR o.reference LIKE ?${a + 1} ESCAPE '\\' OR replace(o.reference, '-', '') LIKE ?${a + 1} ESCAPE '\\')`,
    );
  }
  return { where: parts.join(' AND '), params };
}

export interface OrganizerOrderRow {
  id: string;
  reference: string;
  occurrenceId: string;
  startsAt: number;
  status: OrderStatus;
  channel: OrderChannel;
  paymentMethod: PaymentMethod;
  isPreview: boolean;
  disputed: boolean;
  buyerName: string | null;
  buyerEmail: string | null;
  tickets: number;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  feePayer: FeePayer;
  giftCents: number;
  totalCents: number;
  amountRefundedCents: number;
  currency: string;
  createdAt: number;
  paidAt: number | null;
}

const ORDER_LIST_SELECT = `SELECT o.id, o.reference, o.occurrence_id, oc.starts_at, o.status, o.channel, o.payment_method,
       o.is_preview, o.disputed, o.buyer_name, o.buyer_email,
       (SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS tickets,
       o.subtotal_cents, o.discount_cents, o.fee_cents, o.fee_payer, o.gift_cents, o.total_cents,
       o.amount_refunded_cents, o.currency, o.created_at, o.paid_at
  FROM orders o JOIN event_occurrences oc ON oc.id = o.occurrence_id`;

function toOrderRow(r: Record<string, unknown>): OrganizerOrderRow {
  return {
    id: String(r.id),
    reference: String(r.reference),
    occurrenceId: String(r.occurrence_id),
    startsAt: Number(r.starts_at),
    status: r.status as OrderStatus,
    channel: r.channel as OrderChannel,
    paymentMethod: r.payment_method as PaymentMethod,
    isPreview: r.is_preview === 1,
    disputed: r.disputed === 1,
    buyerName: (r.buyer_name as string | null) ?? null,
    buyerEmail: (r.buyer_email as string | null) ?? null,
    tickets: Number(r.tickets),
    subtotalCents: Number(r.subtotal_cents),
    discountCents: Number(r.discount_cents),
    feeCents: Number(r.fee_cents),
    feePayer: r.fee_payer as FeePayer,
    giftCents: Number(r.gift_cents),
    totalCents: Number(r.total_cents),
    amountRefundedCents: Number(r.amount_refunded_cents),
    currency: String(r.currency),
    createdAt: Number(r.created_at),
    paidAt: r.paid_at == null ? null : Number(r.paid_at),
  };
}

/** Orders of this organization's event, newest first, with the filters applied. */
export async function listEventOrders(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
  filter: OrderListFilter = {},
): Promise<OrganizerOrderRow[]> {
  const { where, params } = orderWhere(organizationId, eventId, filter);
  const limit = Math.min(Math.max(1, Math.floor(filter.limit ?? ORDER_LIST_LIMIT)), ORDER_LIST_LIMIT);
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `${ORDER_LIST_SELECT} WHERE ${where} ORDER BY o.created_at DESC, o.id LIMIT ${limit}`,
    params,
  });
  return rows.map(toOrderRow);
}

export interface OrderCounts {
  /** Orders matching the base filter. */
  all: number;
  byStatus: Partial<Record<OrderStatus, number>>;
  byChannel: Partial<Record<OrderChannel, number>>;
  byMethod: Partial<Record<PaymentMethod, number>>;
  byTicketType: Record<string, number>;
  /** Orders with a refund request waiting for a decision (the `refundRequested` filter). */
  refundRequested: number;
}

/**
 * Counts for the order list's chips and summary cards. Each count equals the length of `listEventOrders` with the base
 * filter plus that one value (status, channel, method or ticket type).
 */
export async function orderCounts(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
  base: Omit<OrderListFilter, 'limit'> = {},
): Promise<OrderCounts> {
  const groups = async (column: string, filter: OrderListFilter) => {
    const { where, params } = orderWhere(organizationId, eventId, filter);
    const rows = await allRows<{ k: string; n: number }>(db, {
      sql: `SELECT ${column} AS k, COUNT(*) AS n FROM orders o WHERE ${where} GROUP BY ${column}`,
      params,
    });
    return Object.fromEntries(rows.map((r) => [r.k, Number(r.n)]));
  };
  const typeCounts = async () => {
    const { where, params } = orderWhere(organizationId, eventId, { ...base, ticketTypeId: null });
    const rows = await allRows<{ k: string; n: number }>(db, {
      sql: `SELECT i.ticket_type_id AS k, COUNT(DISTINCT o.id) AS n
              FROM orders o JOIN order_items i ON i.order_id = o.id WHERE ${where} GROUP BY i.ticket_type_id`,
      params,
    });
    return Object.fromEntries(rows.map((r) => [r.k, Number(r.n)]));
  };
  const countOf = async (filter: OrderListFilter) => {
    const { where, params } = orderWhere(organizationId, eventId, filter);
    const [row] = await allRows<{ n: number }>(db, {
      sql: `SELECT COUNT(*) AS n FROM orders o WHERE ${where}`,
      params,
    });
    return Number(row?.n ?? 0);
  };
  const [byStatus, byChannel, byMethod, byTicketType, all, refundRequested] = await Promise.all([
    groups('o.status', { ...base, status: null }),
    groups('o.channel', { ...base, channel: null }),
    groups('o.payment_method', { ...base, method: null }),
    typeCounts(),
    (async () => {
      const { where, params } = orderWhere(organizationId, eventId, base);
      const [row] = await allRows<{ n: number }>(db, {
        sql: `SELECT COUNT(*) AS n FROM orders o WHERE ${where}`,
        params,
      });
      return Number(row?.n ?? 0);
    })(),
    countOf({ ...base, refundRequested: true }),
  ]);
  return { all, byStatus, byChannel, byMethod, byTicketType, refundRequested };
}

export interface OrderDetail {
  order: OrganizerOrderRow & {
    eventId: string;
    organizationId: string;
    fundsFlow: FundsFlow | null;
    seller: Seller;
    codeId: string | null;
    code: string | null;
    compReason: string | null;
    holdExpiresAt: number | null;
    canceledAt: number | null;
    policySnapshot: string;
    feeSnapshot: string;
  };
  items: Array<{
    id: string;
    ticketTypeId: string;
    name: string;
    unitPriceCents: number;
    quantity: number;
    peoplePerTicket: number;
    discountCents: number;
    feeCents: number;
    lineTotalCents: number;
  }>;
  tickets: Array<{
    id: string;
    orderItemId: string;
    seq: number;
    ticketTypeId: string;
    holderName: string | null;
    holderEmail: string | null;
    status: string;
    checkedInAt: number | null;
    transferCount: number;
  }>;
  payments: Array<{
    id: string;
    kind: PaymentKind;
    status: PaymentStatus;
    amountCents: number;
    createdAt: number;
  }>;
  refunds: Array<{
    id: string;
    amountCents: number;
    method: string;
    requestedBy: string;
    reason: string | null;
    status: string;
    createdAt: number;
    completedAt: number | null;
  }>;
  transfers: Array<{
    id: string;
    ticketId: string;
    fromName: string | null;
    toName: string | null;
    createdAt: number;
  }>;
}

/** One order of this organization with its lines, tickets, payments, refunds and transfer history. */
export async function getOrderDetail(
  db: SqlDatabase,
  organizationId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  const [row] = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.reference, o.occurrence_id, oc.starts_at, o.status, o.channel, o.payment_method, o.is_preview,
                 o.disputed, o.buyer_name, o.buyer_email,
                 (SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS tickets,
                 o.subtotal_cents, o.discount_cents, o.fee_cents, o.fee_payer, o.gift_cents, o.total_cents,
                 o.amount_refunded_cents, o.currency, o.created_at, o.paid_at, o.event_id, o.organization_id, o.funds_flow,
                 o.seller, o.code_id, o.comp_reason, o.hold_expires_at, o.canceled_at, o.policy_snapshot, o.fee_snapshot,
                 (SELECT code FROM event_codes c WHERE c.id = o.code_id) AS code
            FROM orders o JOIN event_occurrences oc ON oc.id = o.occurrence_id
           WHERE o.id = ?1 AND o.organization_id = ?2`,
    params: [orderId, organizationId],
  });
  if (!row) return null;
  const [items, tickets, payments, refunds, transfers] = await Promise.all([
    allRows<Record<string, unknown>>(db, {
      sql: `SELECT id, ticket_type_id, name, unit_price_cents, quantity, people_per_ticket, discount_cents, fee_cents,
                   line_total_cents FROM order_items WHERE order_id = ?1 ORDER BY rowid`,
      params: [orderId],
    }),
    allRows<Record<string, unknown>>(db, {
      sql: `SELECT t.id, t.order_item_id, t.seq, t.ticket_type_id, t.holder_name, t.holder_email, t.status,
                   t.checked_in_at, t.transfer_count
              FROM tickets t JOIN order_items i ON i.id = t.order_item_id
             WHERE t.order_id = ?1 ORDER BY i.rowid, t.seq`,
      params: [orderId],
    }),
    allRows<Record<string, unknown>>(db, {
      sql: 'SELECT id, kind, status, amount_cents, created_at FROM payments WHERE order_id = ?1 ORDER BY created_at, id',
      params: [orderId],
    }),
    allRows<Record<string, unknown>>(db, {
      sql: `SELECT id, amount_cents, method, requested_by, reason, status, created_at, completed_at
              FROM refunds WHERE order_id = ?1 ORDER BY created_at, id`,
      params: [orderId],
    }),
    allRows<Record<string, unknown>>(db, {
      sql: `SELECT r.id, r.ticket_id, r.from_name, r.to_name, r.created_at
              FROM ticket_transfers r JOIN tickets t ON t.id = r.ticket_id WHERE t.order_id = ?1 ORDER BY r.created_at, r.id`,
      params: [orderId],
    }),
  ]);
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    order: {
      ...toOrderRow(row),
      eventId: String(row.event_id),
      organizationId: String(row.organization_id),
      fundsFlow: (row.funds_flow as FundsFlow | null) ?? null,
      seller: row.seller as Seller,
      codeId: str(row.code_id),
      code: str(row.code),
      compReason: str(row.comp_reason),
      holdExpiresAt: row.hold_expires_at == null ? null : Number(row.hold_expires_at),
      canceledAt: row.canceled_at == null ? null : Number(row.canceled_at),
      policySnapshot: String(row.policy_snapshot),
      feeSnapshot: String(row.fee_snapshot),
    },
    items: items.map((i) => ({
      id: String(i.id),
      ticketTypeId: String(i.ticket_type_id),
      name: String(i.name),
      unitPriceCents: Number(i.unit_price_cents),
      quantity: Number(i.quantity),
      peoplePerTicket: Number(i.people_per_ticket),
      discountCents: Number(i.discount_cents),
      feeCents: Number(i.fee_cents),
      lineTotalCents: Number(i.line_total_cents),
    })),
    tickets: tickets.map((t) => ({
      id: String(t.id),
      orderItemId: String(t.order_item_id),
      seq: Number(t.seq),
      ticketTypeId: String(t.ticket_type_id),
      holderName: str(t.holder_name),
      holderEmail: str(t.holder_email),
      status: String(t.status),
      checkedInAt: t.checked_in_at == null ? null : Number(t.checked_in_at),
      transferCount: Number(t.transfer_count),
    })),
    payments: payments.map((p) => ({
      id: String(p.id),
      kind: p.kind as PaymentKind,
      status: p.status as PaymentStatus,
      amountCents: Number(p.amount_cents),
      createdAt: Number(p.created_at),
    })),
    refunds: refunds.map((r) => ({
      id: String(r.id),
      amountCents: Number(r.amount_cents),
      method: String(r.method),
      requestedBy: String(r.requested_by),
      reason: str(r.reason),
      status: String(r.status),
      createdAt: Number(r.created_at),
      completedAt: r.completed_at == null ? null : Number(r.completed_at),
    })),
    transfers: transfers.map((t) => ({
      id: String(t.id),
      ticketId: String(t.ticket_id),
      fromName: str(t.from_name),
      toName: str(t.to_name),
      createdAt: Number(t.created_at),
    })),
  };
}

function localDateTime(epoch: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epoch * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/** "12.50" from 1250 (a plain number column for spreadsheets). */
const dollars = (cents: number) =>
  `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

/** CSV of the organizer's orders, with formula-injection protection (`csvCell`). Times in the event's zone. */
export function ordersCsv(rows: readonly OrganizerOrderRow[], timeZone: string): string {
  const header = [
    'Reference',
    'Date',
    'Status',
    'Channel',
    'Payment',
    'Name',
    'Email',
    'Tickets',
    'Subtotal',
    'Discount',
    'Gamo fee',
    'Fee paid by',
    'Gift',
    'Total',
    'Refunded',
    'Ordered',
    'Paid',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows)
    lines.push(
      [
        r.reference,
        localDateTime(r.startsAt, timeZone),
        r.status,
        r.channel,
        r.paymentMethod,
        r.buyerName,
        r.buyerEmail,
        r.tickets,
        dollars(r.subtotalCents),
        dollars(r.discountCents),
        dollars(r.feeCents),
        r.feePayer,
        dollars(r.giftCents),
        dollars(r.totalCents),
        dollars(r.amountRefundedCents),
        localDateTime(r.createdAt, timeZone),
        r.paidAt == null ? '' : localDateTime(r.paidAt, timeZone),
      ]
        .map((v) => csvCell(v))
        .join(','),
    );
  return `${lines.join('\r\n')}\r\n`;
}

/** Voids one of this organization's preview orders (pending or paid): seats freed, tickets voided. */
export async function voidPreviewOrder(
  db: SqlDatabase,
  input: {
    organizationId: string;
    orderId: string;
    now: number;
    /** Expires the preview's open Checkout Session first, so it cannot be paid after the order is gone. */
    expireCheckout?: (sessionId: string) => Promise<void>;
  },
): Promise<void> {
  const [row] = await allRows<{ is_preview: number; status: string; checkout_session_id: string | null }>(
    db,
    {
      sql: 'SELECT is_preview, status, checkout_session_id FROM orders WHERE id = ?1 AND organization_id = ?2',
      params: [input.orderId, input.organizationId],
    },
  );
  if (!row) throw new PaidError('not_found');
  if (row.is_preview !== 1) throw new PaidError('forbidden', { detail: 'not_preview' });
  if (row.status === 'pending' && row.checkout_session_id) {
    if (!input.expireCheckout) throw new PaidError('payments_unavailable', { detail: 'checkout_open' });
    await input.expireCheckout(row.checkout_session_id);
  }
  const { released } = await releaseOrder(db, { orderId: input.orderId, reason: 'voided', now: input.now });
  if (!released) throw new PaidError('already_done');
  // A voided preview leaves nothing behind (it wrote no ledger rows), so it never pins the draft's dates.
  await runBatch(db, [
    {
      sql: "DELETE FROM orders WHERE id = ?1 AND organization_id = ?2 AND is_preview = 1 AND status = 'voided'",
      params: [input.orderId, input.organizationId],
    },
  ]);
}

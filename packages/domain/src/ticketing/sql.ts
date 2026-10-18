/**
 * The SQL statements that move inventory and admit people (design T-01, §5.2, §5.3), as typed
 * builders returning `{ sql, params }`. Run them with `runBatch(db, specs)` / `allRows(db, spec)`
 * from `@gamo/domain/security` on the raw D1 binding (`env.DB` or a Drizzle database's `$client`).
 *
 * The counters are never read-then-written: the 0013 triggers move `reserved_count`/`sold_count`
 * in the same statement as the hold/ticket state change, and abort the statement (and its batch)
 * with a named error when a category or section would oversell. Map errors with `ticketingErrorCode`.
 *
 * All times are epoch seconds. Money is integer minor units.
 */
import type { SqlParam, SqlStatementSpec } from '../security/sql-database.ts';
import type {
  OrderKind,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  VoidReason,
} from '../types/enums.ts';
import { CHECKOUT_EXPIRY_GRACE_SECONDS } from '../types/policy.ts';

const spec = (sql: string, params: SqlParam[]): SqlStatementSpec => ({ sql, params });
const bool = (v: boolean | undefined) => (v ? 1 : 0);

// ---------------------------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------------------------

/** Named errors raised by the 0013 triggers (plus unique-index conflicts the builders rely on). */
export const TICKETING_ERROR_CODES = [
  'SOLD_OUT',
  'SECTION_SOLD_OUT',
  'EVENT_NOT_ON_SALE',
  'CATEGORY_NOT_ON_SALE',
  'SECTION_NOT_ON_SALE',
  'SEAT_INVALID',
  'SEAT_TAKEN',
  'HOLD_INVALID',
  'HOLD_ORDER_ITEM_MISMATCH',
  'HOLD_EXCEEDS_ITEM',
  'HOLD_TRANSITION_INVALID',
  'ORDER_INVALID',
  'ORDER_ITEM_INVALID',
  'ORDER_ITEM_IMMUTABLE',
  'REFUND_EXCEEDS_TOTAL',
  'TICKET_INVALID',
  'TICKET_ISSUE_INVALID',
  'TICKET_ORDER_ITEM_MISMATCH',
  'TICKET_NOT_SOLD',
  'TICKET_TERMINAL',
  'TICKET_IMMUTABLE',
  'TIER_INVALID',
  'SECTION_INVALID',
  'EXTERNAL_EVENT_NO_TIERS',
  'EXTERNAL_EVENT_NO_HOLDS',
  'EXTERNAL_EVENT_NO_ORDERS',
  'EXTERNAL_EVENT_NO_TICKETS',
  'EXTERNAL_EVENT_NO_SECTIONS',
  'DUPLICATE_ORDER',
  'DUPLICATE_ORDER_REFERENCE',
  'SEAT_ALREADY_HELD',
] as const;
export type TicketingErrorCode = (typeof TICKETING_ERROR_CODES)[number];

const UNIQUE_MAP: Array<[RegExp, TicketingErrorCode]> = [
  [/ticket_orders\.idempotency_key/, 'DUPLICATE_ORDER'],
  [/ticket_orders\.order_reference|ticket_orders\.order_number/, 'DUPLICATE_ORDER_REFERENCE'],
  [/ticket_holds\.event_id, ticket_holds\.seat_id/, 'SEAT_ALREADY_HELD'],
  [/tickets\.event_id, tickets\.seat_id/, 'SEAT_TAKEN'],
];

/**
 * Maps a D1/SQLite error to a ticketing code, or null when it is something else (rethrow it).
 * Longest code first, so `SECTION_SOLD_OUT` is not reported as `SOLD_OUT`.
 */
export function ticketingErrorCode(error: unknown): TicketingErrorCode | null {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  if (/UNIQUE constraint failed/i.test(message)) {
    for (const [pattern, code] of UNIQUE_MAP) if (pattern.test(message)) return code;
    return null;
  }
  const codes = [...TICKETING_ERROR_CODES].sort((a, b) => b.length - a.length);
  for (const code of codes) if (new RegExp(`\\b${code}\\b`).test(message)) return code;
  return null;
}

/** Codes that mean "not enough inventory" (answer 409 with remaining counts). */
export const SOLD_OUT_CODES: readonly TicketingErrorCode[] = [
  'SOLD_OUT',
  'SECTION_SOLD_OUT',
  'SEAT_TAKEN',
  'SEAT_ALREADY_HELD',
];

// ---------------------------------------------------------------------------------------------
// Orders, items and holds (Agent B)
// ---------------------------------------------------------------------------------------------

export interface NewOrderInput {
  id: string;
  /** `newOrderReference()`; also written to the legacy NOT NULL `order_number`. */
  reference: string;
  eventId: string;
  customerProfileId: string | null;
  purchaserUserId?: string | null;
  purchaserName: string;
  /** Normalised (`normalizeEmail`). */
  purchaserEmail: string;
  kind: OrderKind;
  status: Extract<OrderStatus, 'pending_verification' | 'pending_payment' | 'paid' | 'confirmed'>;
  source?: OrderSource;
  currency?: string;
  processingFeeCents?: number;
  platformAdminAllocationCents?: number;
  taxCents?: number;
  idempotencyKey: string;
  holdExpiresAt: number;
  policySnapshotJson: string;
  verificationRequired?: boolean;
  paymentStatus?: PaymentStatus | null;
  paymentMethod?: PaymentMethod | null;
  now: number;
}

/**
 * INSERT the order with zero totals; `finalizeOrderTotalsStatement` (last in the hold batch) fills
 * quantity, subtotal and total from the inserted items, so the database is the price authority.
 * A reused idempotency key fails with `DUPLICATE_ORDER` → load and return the existing order.
 */
export function insertOrderStatement(o: NewOrderInput): SqlStatementSpec {
  return spec(
    'INSERT INTO ticket_orders (id, order_number, order_reference, event_id, customer_profile_id, purchaser_user_id, purchaser_name, purchaser_email, quantity, order_kind, subtotal_cents, processing_fee_cents, platform_admin_allocation_cents, tax_cents, total_cents, organizer_proceeds_cents, currency, idempotency_key, status, hold_expires_at, policy_snapshot_json, source, verification_required, payment_status, payment_method, amount_refunded_cents, created_at, updated_at) VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, 0, ?9, ?10, ?11, 0, 0, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, 0, ?21, ?21)',
    [
      o.id,
      o.reference,
      o.eventId,
      o.customerProfileId,
      o.purchaserUserId ?? null,
      o.purchaserName,
      o.purchaserEmail,
      o.kind,
      o.processingFeeCents ?? 0,
      o.platformAdminAllocationCents ?? 0,
      o.taxCents ?? 0,
      o.currency ?? 'usd',
      o.idempotencyKey,
      o.status,
      o.holdExpiresAt,
      o.policySnapshotJson,
      o.source ?? 'online',
      bool(o.verificationRequired),
      o.paymentStatus ?? null,
      o.paymentMethod ?? null,
      o.now,
    ],
  );
}

export interface NewOrderItemInput {
  id: string;
  orderId: string;
  eventId: string;
  categoryId: string;
  sectionId?: string | null;
  seatId?: string | null;
  quantity: number;
  /**
   * Omit to use the database price at this instant: the section price, else the category price.
   * Pass a value only for organizer-issued comps/door prices that differ (e.g. 0).
   */
  unitPriceCents?: number;
  now: number;
}

/** INSERT an order item; `seats_per_ticket` and `currency` are copied from the category, the price from the section/category. */
export function insertOrderItemStatement(i: NewOrderItemInput): SqlStatementSpec {
  const price =
    i.unitPriceCents === undefined
      ? 'coalesce((SELECT s.price_cents FROM venue_sections s WHERE s.id = ?5), (SELECT t.price_cents FROM ticket_tiers t WHERE t.id = ?4))'
      : '?8';
  return spec(
    `INSERT INTO order_items (id, order_id, event_id, tier_id, section_id, seat_id, quantity, seats_per_ticket, unit_price_cents, subtotal_cents, currency, refunded_quantity, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, (SELECT t.seats_per_ticket FROM ticket_tiers t WHERE t.id = ?4), ${price}, ?7 * ${price}, (SELECT t.currency FROM ticket_tiers t WHERE t.id = ?4), 0, ?9, ?9)`,
    [
      i.id,
      i.orderId,
      i.eventId,
      i.categoryId,
      i.sectionId ?? null,
      i.seatId ?? null,
      i.quantity,
      i.unitPriceCents ?? null,
      i.now,
    ],
  );
}

export interface NewHoldInput {
  id: string;
  orderId: string;
  orderItemId: string;
  eventId: string;
  categoryId: string;
  sectionId?: string | null;
  seatId?: string | null;
  customerProfileId?: string | null;
  purchaserEmail: string;
  quantity: number;
  /** Unique; default in `buildHoldBatch`: `<order idempotency key>#<item index>`. */
  idempotencyKey: string;
  expiresAt: number;
  now: number;
}

/** INSERT a held hold. The 0013 triggers validate it and reserve `quantity × seats_per_ticket` units (or abort SOLD_OUT). */
export function insertHoldStatement(h: NewHoldInput): SqlStatementSpec {
  return spec(
    "INSERT INTO ticket_holds (id, event_id, tier_id, purchaser_email, quantity, idempotency_key, status, expires_at, created_at, order_id, order_item_id, section_id, seat_id, customer_profile_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'held', ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
    [
      h.id,
      h.eventId,
      h.categoryId,
      h.purchaserEmail,
      h.quantity,
      h.idempotencyKey,
      h.expiresAt,
      h.now,
      h.orderId,
      h.orderItemId,
      h.sectionId ?? null,
      h.seatId ?? null,
      h.customerProfileId ?? null,
    ],
  );
}

/** Recomputes the order's quantity, subtotal and total from its items (total = subtotal + fees + tax). */
export function finalizeOrderTotalsStatement(orderId: string, now: number): SqlStatementSpec {
  return spec(
    'UPDATE ticket_orders SET quantity = (SELECT coalesce(sum(quantity), 0) FROM order_items WHERE order_id = ?1), subtotal_cents = (SELECT coalesce(sum(subtotal_cents), 0) FROM order_items WHERE order_id = ?1), total_cents = (SELECT coalesce(sum(subtotal_cents), 0) FROM order_items WHERE order_id = ?1) + processing_fee_cents + platform_admin_allocation_cents + tax_cents, updated_at = ?2 WHERE id = ?1 RETURNING quantity, subtotal_cents, total_cents, currency',
    [orderId, now],
  );
}

export interface HoldBatchItem {
  item: Omit<NewOrderItemInput, 'orderId' | 'eventId' | 'now'>;
  /** Hold id (`newPrefixedId('hold')`). */
  holdId: string;
}

/**
 * The checkout/RSVP reservation as one batch: order → (item → hold)* → totals.
 * Either everything commits or nothing does: any overflow aborts with `SOLD_OUT`/`SECTION_SOLD_OUT`,
 * a reused idempotency key with `DUPLICATE_ORDER`. The last statement returns the order totals.
 */
export function buildHoldBatch(input: { order: NewOrderInput; items: HoldBatchItem[] }): SqlStatementSpec[] {
  const { order } = input;
  if (input.items.length === 0) throw new RangeError('buildHoldBatch: at least one item');
  const specs: SqlStatementSpec[] = [insertOrderStatement(order)];
  input.items.forEach(({ item, holdId }, index) => {
    specs.push(
      insertOrderItemStatement({ ...item, orderId: order.id, eventId: order.eventId, now: order.now }),
    );
    specs.push(
      insertHoldStatement({
        id: holdId,
        orderId: order.id,
        orderItemId: item.id,
        eventId: order.eventId,
        categoryId: item.categoryId,
        sectionId: item.sectionId ?? null,
        seatId: item.seatId ?? null,
        customerProfileId: order.customerProfileId,
        purchaserEmail: order.purchaserEmail,
        quantity: item.quantity,
        idempotencyKey: `${order.idempotencyKey}#${index}`,
        expiresAt: order.holdExpiresAt,
        now: order.now,
      }),
    );
  });
  specs.push(finalizeOrderTotalsStatement(order.id, order.now));
  return specs;
}

/**
 * Expires held holds past `expires_at` (for one event, or everywhere when `eventId` is omitted,
 * at most `limit` per call). A paid hold whose Stripe session is still open (+5 min grace) is kept.
 * Triggers give the units back. Returns `{ id, order_id }` per expired hold.
 */
export function releaseExpiredHoldsStatement(input: {
  now: number;
  eventId?: string;
  limit?: number;
  checkoutGraceSeconds?: number;
}): SqlStatementSpec {
  return spec(
    "UPDATE ticket_holds SET status = 'expired', released_at = ?1 WHERE id IN (SELECT h.id FROM ticket_holds h WHERE h.status = 'held' AND h.order_item_id IS NOT NULL AND h.expires_at <= ?1 AND (?2 IS NULL OR h.event_id = ?2) AND NOT EXISTS (SELECT 1 FROM ticket_orders o WHERE o.id = h.order_id AND o.stripe_checkout_expires_at IS NOT NULL AND o.stripe_checkout_expires_at + ?3 > ?1) LIMIT ?4) AND status = 'held' RETURNING id, order_id",
    [
      input.now,
      input.eventId ?? null,
      input.checkoutGraceSeconds ?? CHECKOUT_EXPIRY_GRACE_SECONDS,
      input.limit ?? 500,
    ],
  );
}

/** Releases (cancel / Stripe session expired) or expires every held hold of an order. */
export function releaseOrderHoldsStatement(input: {
  orderId: string;
  now: number;
  status?: 'released' | 'expired';
}): SqlStatementSpec {
  return spec(
    "UPDATE ticket_holds SET status = ?3, released_at = ?2 WHERE order_id = ?1 AND status = 'held' AND order_item_id IS NOT NULL RETURNING id",
    [input.orderId, input.now, input.status ?? 'released'],
  );
}

/** Converts every held hold of an order to sold (triggers move units to `sold_count`). Run before issuing tickets. */
export function convertOrderHoldsStatement(input: { orderId: string; now: number }): SqlStatementSpec {
  return spec(
    "UPDATE ticket_holds SET status = 'converted' WHERE order_id = ?1 AND status = 'held' AND order_item_id IS NOT NULL RETURNING id, order_item_id, quantity",
    [input.orderId],
  );
}

/** Marks orders whose holds are all gone as expired (no held hold left and hold time passed). */
export function expireStaleOrdersStatement(input: { now: number; eventId?: string }): SqlStatementSpec {
  return spec(
    "UPDATE ticket_orders SET status = 'expired', updated_at = ?1 WHERE status IN ('pending_payment', 'pending_verification') AND hold_expires_at IS NOT NULL AND hold_expires_at <= ?1 AND (?2 IS NULL OR event_id = ?2) AND NOT EXISTS (SELECT 1 FROM ticket_holds h WHERE h.order_id = ticket_orders.id AND h.status = 'held') RETURNING id",
    [input.now, input.eventId ?? null],
  );
}

/** Optional columns a status transition may set. */
export interface OrderTransitionSet {
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  stripeCheckoutSessionId?: string;
  stripeCheckoutExpiresAt?: number;
  stripePaymentIntentId?: string;
  confirmedAt?: number;
  emailVerifiedAt?: number;
  cancelledAt?: number;
  disputedAt?: number;
}

const TRANSITION_COLUMNS: Record<keyof OrderTransitionSet, string> = {
  paymentStatus: 'payment_status',
  paymentMethod: 'payment_method',
  stripeCheckoutSessionId: 'stripe_checkout_session_id',
  stripeCheckoutExpiresAt: 'stripe_checkout_expires_at',
  stripePaymentIntentId: 'stripe_payment_intent_id',
  confirmedAt: 'confirmed_at',
  emailVerifiedAt: 'email_verified_at',
  cancelledAt: 'cancelled_at',
  disputedAt: 'disputed_at',
};

/**
 * Conditional order transition: `UPDATE … SET status = to WHERE id = ? AND status IN (from…)`.
 * Returns the row only when the transition happened (0 rows = someone else moved it first).
 */
export function transitionOrderStatement(input: {
  orderId: string;
  from: readonly OrderStatus[];
  to: OrderStatus;
  now: number;
  set?: OrderTransitionSet;
}): SqlStatementSpec {
  if (input.from.length === 0) throw new RangeError('transitionOrderStatement: from must not be empty');
  const params: SqlParam[] = [input.orderId, input.to, input.now];
  const sets = ['status = ?2', 'updated_at = ?3'];
  for (const [key, value] of Object.entries(input.set ?? {}) as Array<[keyof OrderTransitionSet, unknown]>) {
    if (value === undefined) continue;
    params.push(value as SqlParam);
    sets.push(`${TRANSITION_COLUMNS[key]} = ?${params.length}`);
  }
  const fromStart = params.length + 1;
  params.push(...input.from);
  const placeholders = input.from.map((_, i) => `?${fromStart + i}`).join(', ');
  return spec(
    `UPDATE ticket_orders SET ${sets.join(', ')} WHERE id = ?1 AND status IN (${placeholders}) RETURNING id, status`,
    params,
  );
}

/** Adds a refund to the order's running total (trigger: never above `total_cents`, never decreasing). */
export function addOrderRefundStatement(input: {
  orderId: string;
  amountCents: number;
  now: number;
}): SqlStatementSpec {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1)
    throw new RangeError('addOrderRefundStatement: amount');
  return spec(
    "UPDATE ticket_orders SET amount_refunded_cents = amount_refunded_cents + ?2, status = CASE WHEN amount_refunded_cents + ?2 >= total_cents THEN 'refunded' ELSE 'partially_refunded' END, updated_at = ?3 WHERE id = ?1 RETURNING amount_refunded_cents, total_cents, status",
    [input.orderId, input.amountCents, input.now],
  );
}

/** Sets the order's refunded total to Stripe's figure (reconciliation; only ever increases). */
export function reconcileOrderRefundStatement(input: {
  orderId: string;
  amountRefundedCents: number;
  now: number;
}): SqlStatementSpec {
  return spec(
    "UPDATE ticket_orders SET amount_refunded_cents = ?2, status = CASE WHEN ?2 >= total_cents THEN 'refunded' WHEN ?2 > 0 THEN 'partially_refunded' ELSE status END, updated_at = ?3 WHERE id = ?1 AND amount_refunded_cents < ?2 RETURNING amount_refunded_cents, total_cents, status",
    [input.orderId, input.amountRefundedCents, input.now],
  );
}

export function addItemRefundedQuantityStatement(input: {
  orderItemId: string;
  quantity: number;
  now: number;
}): SqlStatementSpec {
  return spec(
    'UPDATE order_items SET refunded_quantity = refunded_quantity + ?2, updated_at = ?3 WHERE id = ?1 RETURNING refunded_quantity, quantity',
    [input.orderItemId, input.quantity, input.now],
  );
}

// ---------------------------------------------------------------------------------------------
// Tickets (Agent B)
// ---------------------------------------------------------------------------------------------

export interface NewTicketInput {
  /** `newTicketId()`. */
  id: string;
  orderId: string;
  orderItemId: string;
  eventId: string;
  categoryId: string;
  sectionId?: string | null;
  seatId?: string | null;
  customerProfileId?: string | null;
  holderName: string;
  holderEmail: string;
  /** 1…item quantity. */
  seq: number;
  qrKeyId: string;
  qrSalt: string;
  /** `macDigest(mac)` from `signTicketQr`. */
  qrSignatureHash: string;
  zoneCode?: string | null;
  gateLabel?: string | null;
  now: number;
}

/**
 * Issues one ticket idempotently: a second insert for the same (order item, seq) is ignored, so a
 * replayed webhook or double confirmation never issues twice. Returns `id` only when inserted.
 * Allowed only after the item's hold is converted (trigger `TICKET_NOT_SOLD`).
 */
export function insertTicketStatement(t: NewTicketInput): SqlStatementSpec {
  return spec(
    "INSERT INTO tickets (id, order_id, event_id, tier_id, registration_id, holder_name, holder_email, qr_token, qr_signature_hash, status, created_at, order_item_id, section_id, seat_id, customer_profile_id, version, qr_salt, qr_key_id, seq, zone_code, gate_label, transfer_count, issued_at, updated_at, released_on_void) VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, 'tkm_' || lower(hex(randomblob(16))), ?7, 'valid', ?8, ?9, ?10, ?11, ?12, 1, ?13, ?14, ?15, ?16, ?17, 0, ?8, ?8, 0) ON CONFLICT(order_item_id, seq) WHERE order_item_id IS NOT NULL DO NOTHING RETURNING id",
    [
      t.id,
      t.orderId,
      t.eventId,
      t.categoryId,
      t.holderName,
      t.holderEmail,
      t.qrSignatureHash,
      t.now,
      t.orderItemId,
      t.sectionId ?? null,
      t.seatId ?? null,
      t.customerProfileId ?? null,
      t.qrSalt,
      t.qrKeyId,
      t.seq,
      t.zoneCode ?? null,
      t.gateLabel ?? null,
    ],
  );
}

/** Voids one valid ticket (trigger releases its units once). Returns `id` only when it changed. */
export function voidTicketStatement(input: {
  ticketId: string;
  reason: VoidReason;
  now: number;
}): SqlStatementSpec {
  return spec(
    "UPDATE tickets SET status = 'voided', voided_at = ?3, void_reason = ?2, updated_at = ?3 WHERE id = ?1 AND status = 'valid' RETURNING id",
    [input.ticketId, input.reason, input.now],
  );
}

/** Voids every valid ticket of an order (cancel, dispute). */
export function voidOrderTicketsStatement(input: {
  orderId: string;
  reason: VoidReason;
  now: number;
}): SqlStatementSpec {
  return spec(
    "UPDATE tickets SET status = 'voided', voided_at = ?3, void_reason = ?2, updated_at = ?3 WHERE order_id = ?1 AND status = 'valid' RETURNING id",
    [input.orderId, input.reason, input.now],
  );
}

/** Voids every valid ticket of an event (event cancelled). */
export function voidEventTicketsStatement(input: { eventId: string; now: number }): SqlStatementSpec {
  return spec(
    "UPDATE tickets SET status = 'voided', voided_at = ?2, void_reason = 'event_cancelled', updated_at = ?2 WHERE event_id = ?1 AND status = 'valid' AND order_item_id IS NOT NULL RETURNING id",
    [input.eventId, input.now],
  );
}

/** Marks a ticket refunded (from valid or voided; units are released at most once in total). */
export function refundTicketStatement(input: { ticketId: string; now: number }): SqlStatementSpec {
  return spec(
    "UPDATE tickets SET status = 'refunded', refunded_at = ?2, updated_at = ?2 WHERE id = ?1 AND status IN ('valid', 'voided') RETURNING id",
    [input.ticketId, input.now],
  );
}

/**
 * Transfer or reissue: version + 1 (every old QR image dies), optionally a new holder and salt.
 * Conditional on the version the caller saw, so two concurrent transfers cannot both succeed.
 */
export function bumpTicketVersionStatement(input: {
  ticketId: string;
  expectedVersion: number;
  qrSalt: string;
  qrKeyId: string;
  qrSignatureHash: string;
  now: number;
  transfer?: {
    holderName: string;
    holderEmail: string;
    customerProfileId: string | null;
    previousEmail: string;
  };
}): SqlStatementSpec {
  const t = input.transfer;
  return spec(
    "UPDATE tickets SET version = version + 1, qr_salt = ?3, qr_key_id = ?4, qr_signature_hash = ?5, updated_at = ?6, holder_name = coalesce(?7, holder_name), holder_email = coalesce(?8, holder_email), customer_profile_id = CASE WHEN ?11 = 1 THEN ?9 ELSE customer_profile_id END, transferred_from_ticket_email = coalesce(?10, transferred_from_ticket_email), transfer_count = transfer_count + ?11 WHERE id = ?1 AND version = ?2 AND status = 'valid' RETURNING id, version, transfer_count",
    [
      input.ticketId,
      input.expectedVersion,
      input.qrSalt,
      input.qrKeyId,
      input.qrSignatureHash,
      input.now,
      t?.holderName ?? null,
      t?.holderEmail ?? null,
      t?.customerProfileId ?? null,
      t?.previousEmail ?? null,
      t ? 1 : 0,
    ],
  );
}

// ---------------------------------------------------------------------------------------------
// Scanning (Agent C)
// ---------------------------------------------------------------------------------------------

export interface ScanContext {
  /** Pre-generated scan event id (`newPrefixedId('scan')`). */
  scanEventId: string;
  /** The event the scanner is working (wrong-event tickets are reported, never admitted). */
  eventId: string;
  /** From the parsed QR (`parseTicketQr`), after the MAC was verified. */
  ticketId: string;
  ticketVersion: number;
  /** Venue-local date `YYYY-MM-DD`. */
  dayKey: string;
  gate?: string | null;
  scannerSessionId?: string | null;
  scannerDeviceId?: string | null;
  scannedByUserId?: string | null;
  /** Device-generated id; the same id twice from one scanner session is recorded once. */
  clientScanId?: string | null;
  deviceScannedAt?: number | null;
  offline?: boolean;
  /** Server receipt time. */
  now: number;
}

/**
 * The one admission statement (§5.3): insert presence `inside`, or flip `outside → inside` while
 * `entry_count < maxEntries`; only for a VALID ticket of this event at this version.
 * Returns a row (`entry_count`, `first_entry_at`) only when this call admitted.
 * Two scanners racing on one ticket/day get exactly one row between them.
 * `override` drops the entry limit (a supervisor with a reason) but never admits someone already inside.
 */
export function admitPresenceStatement(
  ctx: ScanContext,
  maxEntries: number | null,
  override = false,
): SqlStatementSpec {
  return spec(
    "INSERT INTO ticket_presence (ticket_id, day_key, event_id, state, entry_count, exit_count, first_entry_at, last_scan_at, last_gate, last_scan_event_id) SELECT t.id, ?2, t.event_id, 'inside', 1, 0, ?3, ?3, ?4, ?5 FROM tickets t WHERE t.id = ?1 AND t.event_id = ?6 AND t.status = 'valid' AND t.version = ?7 ON CONFLICT(ticket_id, day_key) DO UPDATE SET state = 'inside', entry_count = ticket_presence.entry_count + 1, last_scan_at = excluded.last_scan_at, last_gate = excluded.last_gate, last_scan_event_id = excluded.last_scan_event_id WHERE ticket_presence.state = 'outside' AND (?8 = 1 OR ?9 IS NULL OR ticket_presence.entry_count < ?9) RETURNING entry_count, first_entry_at",
    [
      ctx.ticketId,
      ctx.dayKey,
      ctx.now,
      ctx.gate ?? null,
      ctx.scanEventId,
      ctx.eventId,
      ctx.ticketVersion,
      override ? 1 : 0,
      maxEntries,
    ],
  );
}

/** Flips `inside → outside` for a valid ticket. Returns `exit_count` only when this call recorded the exit. */
export function exitPresenceStatement(ctx: ScanContext): SqlStatementSpec {
  return spec(
    "UPDATE ticket_presence SET state = 'outside', exit_count = exit_count + 1, last_scan_at = ?3, last_gate = ?4, last_scan_event_id = ?5 WHERE ticket_id = ?1 AND day_key = ?2 AND state = 'inside' AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = ?1 AND t.event_id = ?6 AND t.status = 'valid' AND t.version = ?7) RETURNING exit_count",
    [ctx.ticketId, ctx.dayKey, ctx.now, ctx.gate ?? null, ctx.scanEventId, ctx.eventId, ctx.ticketVersion],
  );
}

/**
 * Records the scan with its outcome computed in SQL from the state the preceding statement left:
 * admitted/exited when presence points at this scan id, otherwise not_found, wrong_event, voided,
 * refunded, stale_version, already_inside, already_used / reentry_denied (in) or not_inside (out).
 * A repeated (scanner session, client scan id) inserts nothing and returns no row.
 * Offline scans that lost to an earlier admission are flagged `duplicate_offline`.
 */
export function insertScanEventStatement(
  ctx: ScanContext,
  direction: 'in' | 'out',
  options: { maxEntries?: number | null; override?: { reason: string } } = {},
): SqlStatementSpec {
  const success = direction === 'out' ? 'exited' : options.override ? 'override_admitted' : 'admitted';
  const otherwise =
    direction === 'out'
      ? "'not_inside'"
      : "CASE WHEN p.state = 'inside' THEN 'already_inside' WHEN ?17 = 1 THEN 'already_used' ELSE 'reentry_denied' END";
  return spec(
    `INSERT INTO ticket_scan_events (id, event_id, ticket_id, ticket_version, scanner_session_id, scanner_device_id, scanned_by_user_id, direction, gate, result, override_reason, client_scan_id, device_scanned_at, received_at, offline, conflict, day_key) SELECT ?1, ?2, t.id, ?4, ?5, ?6, ?7, ?8, ?9, CASE WHEN p.last_scan_event_id = ?1 THEN ?10 WHEN t.id IS NULL THEN 'not_found' WHEN t.event_id != ?2 THEN 'wrong_event' WHEN t.status = 'voided' THEN 'voided' WHEN t.status = 'refunded' THEN 'refunded' WHEN t.version != ?4 THEN 'stale_version' ELSE ${otherwise} END, ?11, ?12, ?13, ?14, ?15, CASE WHEN ?15 = 1 AND p.ticket_id IS NOT NULL AND p.last_scan_event_id IS NOT ?1 AND ?8 = 'in' THEN 'duplicate_offline' ELSE 'none' END, ?16 FROM (SELECT 1) AS one LEFT JOIN tickets t ON t.id = ?3 LEFT JOIN ticket_presence p ON p.ticket_id = ?3 AND p.day_key = ?16 WHERE true ON CONFLICT(scanner_session_id, client_scan_id) WHERE scanner_session_id IS NOT NULL AND client_scan_id IS NOT NULL DO NOTHING RETURNING id, result, conflict`,
    [
      ctx.scanEventId,
      ctx.eventId,
      ctx.ticketId,
      ctx.ticketVersion,
      ctx.scannerSessionId ?? null,
      ctx.scannerDeviceId ?? null,
      ctx.scannedByUserId ?? null,
      direction,
      ctx.gate ?? null,
      success,
      options.override?.reason ?? null,
      ctx.clientScanId ?? null,
      ctx.deviceScannedAt ?? null,
      ctx.now,
      bool(ctx.offline),
      ctx.dayKey,
      // ?17 is referenced only by the scan-in outcome; SQLite rejects unused trailing parameters.
      ...(direction === 'in' ? [options.maxEntries === 1 ? 1 : 0] : []),
    ],
  );
}

/**
 * Scan in, as one batch: [admit, record]. The second statement's row is the answer
 * (`{ id, result, conflict }`); no row means this client scan id was already recorded — look it up
 * by (scanner_session_id, client_scan_id) and return the stored result.
 */
export function buildScanInBatch(
  ctx: ScanContext,
  maxEntries: number | null,
  override?: { reason: string },
): SqlStatementSpec[] {
  if (override && !override.reason.trim())
    throw new RangeError('buildScanInBatch: an override needs a reason');
  return [
    admitPresenceStatement(ctx, maxEntries, Boolean(override)),
    insertScanEventStatement(ctx, 'in', { maxEntries, override }),
  ];
}

/** Scan out, as one batch: [exit, record]. */
export function buildScanOutBatch(ctx: ScanContext): SqlStatementSpec[] {
  return [exitPresenceStatement(ctx), insertScanEventStatement(ctx, 'out')];
}

/**
 * Records a scan that was decided before touching presence (bad signature, unknown key, not open yet,
 * event cancelled, wrong zone): no presence change, same dedupe by client scan id.
 */
export function insertRejectedScanStatement(
  ctx: Omit<ScanContext, 'ticketId' | 'ticketVersion'> & {
    ticketId?: string | null;
    ticketVersion?: number | null;
  },
  direction: 'in' | 'out',
  result: 'invalid' | 'not_found' | 'not_open_yet' | 'event_cancelled' | 'wrong_zone' | 'wrong_event',
): SqlStatementSpec {
  return spec(
    "INSERT INTO ticket_scan_events (id, event_id, ticket_id, ticket_version, scanner_session_id, scanner_device_id, scanned_by_user_id, direction, gate, result, client_scan_id, device_scanned_at, received_at, offline, conflict, day_key) SELECT ?1, ?2, (SELECT id FROM tickets WHERE id = ?3), ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'none', ?15 WHERE true ON CONFLICT(scanner_session_id, client_scan_id) WHERE scanner_session_id IS NOT NULL AND client_scan_id IS NOT NULL DO NOTHING RETURNING id, result",
    [
      ctx.scanEventId,
      ctx.eventId,
      ctx.ticketId ?? null,
      ctx.ticketVersion ?? null,
      ctx.scannerSessionId ?? null,
      ctx.scannerDeviceId ?? null,
      ctx.scannedByUserId ?? null,
      direction,
      ctx.gate ?? null,
      result,
      ctx.clientScanId ?? null,
      ctx.deviceScannedAt ?? null,
      ctx.now,
      bool(ctx.offline),
      ctx.dayKey,
    ],
  );
}

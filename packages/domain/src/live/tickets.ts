/**
 * Paid tickets after payment (docs/LIVE_REQUIREMENTS.md §8.2 items 13–15, §8.3 item 21; docs/LIVE_PAYMENTS.md §4–§5):
 *
 * - **Order and ticket links**: signed, expiring values keyed with `LIVE_TICKET_SECRET` (`order-link:` and
 *   `ticket-link:` labels). A buyer reaches the order page with an order link; a person a ticket was transferred to
 *   reaches that one ticket with a ticket link naming the credential version, so a later transfer ends it. Links expire
 *   30 days after the event's last date. Nothing is stored.
 * - **Credentials**: `GT1.<ticket id body>.<version>.<mac>`, mac = the first 16 bytes (Crockford base32) of
 *   HMAC-SHA256(LIVE_TICKET_SECRET, `ticket:<id>|<version>|<salt>`). A transfer or reissue bumps the version and the
 *   salt, so every older image stops working; an older version of a valid ticket scans as "replaced" without holder
 *   data.
 * - **Check-in**: first scan wins (one conditional UPDATE on `checked_in_at IS NULL AND status = 'valid' AND
 *   credential_version = ?`). `checkInAny` routes a `GT1.` code here and anything else to free registrations.
 *
 * Shared order loading and the policy that applies to an order (snapshot, or the current policy when better for the
 * buyer) live here too, for the refund, transfer and order-page modules.
 */
import { decodeBase32, encodeBase32 } from '../security/base32.ts';
import { constantTimeEqual, hmacSha256, hmacSha256Hex } from '../security/crypto.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { qrPartToTicketId, ticketIdToQrPart } from '../security/ids.ts';
import { allRows, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import {
  effectivePolicy,
  parsePolicySnapshot,
  policySnapshotOf,
  readEventTicketing,
} from './event-ticketing.ts';
import { checkInWindow, type CheckInOccurrence } from './events.ts';
import {
  PAID_TICKET_QR_PREFIX,
  type FeePayer,
  type FundsFlow,
  type OrderChannel,
  type OrderStatus,
  type PaidEnv,
  type PaymentMethod,
  type PolicySnapshot,
  type Seller,
  type TicketStatus,
} from './paid-types.ts';
import { checkIn, normalizeCheckinCode, type CheckInResult } from './registration.ts';

const ticketSecret = (env: PaidEnv) => resolveEnvSecret(env as Record<string, unknown>, 'LIVE_TICKET_SECRET');

// ── Order and ticket links ─────────────────────────────────────────────────────────────────────────────────────

/** Order and ticket links keep working this long after the event's last date. */
export const ORDER_LINK_GRACE_SECONDS = 30 * 24 * 60 * 60;

const ORDER_ID = /^ord_[0-9a-z]{26}$/;
const ORDER_TOKEN = /^(ord_[0-9a-z]{26})\.(\d{1,12})\.([0-9a-f]{32})$/;
const TICKET_TOKEN = /^(tkt_[0-9a-z]{26})\.v(\d{1,6})\.(\d{1,12})\.([0-9a-f]{32})$/;

async function linkMac(env: PaidEnv, message: string): Promise<string> {
  return (await hmacSha256Hex(ticketSecret(env), message)).slice(0, 32);
}

/** Order-link value: `<order id>.<expiry>.<mac>`. */
export async function signOrderToken(env: PaidEnv, orderId: string, expiresAt: number): Promise<string> {
  if (!ORDER_ID.test(orderId) || !Number.isInteger(expiresAt) || expiresAt < 0)
    throw new RangeError('signOrderToken: bad order id or expiry');
  return `${orderId}.${expiresAt}.${await linkMac(env, `order-link:${orderId}:${expiresAt}`)}`;
}

/** The order id inside a valid, unexpired order link, else null (forged, altered or expired). */
export async function verifyOrderToken(env: PaidEnv, token: string, now: number): Promise<string | null> {
  const m = ORDER_TOKEN.exec(String(token ?? '').trim());
  if (!m || Number(m[2]) <= now) return null;
  const expected = await linkMac(env, `order-link:${m[1]}:${m[2]}`);
  return constantTimeEqual(expected, m[3]) ? m[1] : null;
}

/** Ticket-link value for a transferred ticket's holder: `<ticket id>.v<version>.<expiry>.<mac>`. */
export async function signTicketToken(
  env: PaidEnv,
  ticketId: string,
  version: number,
  expiresAt: number,
): Promise<string> {
  if (!/^tkt_[0-9a-z]{26}$/.test(ticketId) || !Number.isInteger(version) || version < 1)
    throw new RangeError('signTicketToken: bad ticket id or version');
  const mac = await linkMac(env, `ticket-link:${ticketId}:${version}:${expiresAt}`);
  return `${ticketId}.v${version}.${expiresAt}.${mac}`;
}

/** The ticket id and version inside a valid, unexpired ticket link, else null. The caller compares the version. */
export async function verifyTicketToken(
  env: PaidEnv,
  token: string,
  now: number,
): Promise<{ ticketId: string; version: number } | null> {
  const m = TICKET_TOKEN.exec(String(token ?? '').trim());
  if (!m || Number(m[3]) <= now) return null;
  const expected = await linkMac(env, `ticket-link:${m[1]}:${m[2]}:${m[3]}`);
  return constantTimeEqual(expected, m[4]) ? { ticketId: m[1], version: Number(m[2]) } : null;
}

export type VerifiedLink =
  { kind: 'order'; orderId: string } | { kind: 'ticket'; ticketId: string; version: number };

/** One route (`/orders/[token]`) serves both kinds of link. */
export async function verifyOrderLink(
  env: PaidEnv,
  token: string,
  now: number,
): Promise<VerifiedLink | null> {
  const t = String(token ?? '');
  if (t.startsWith('ord_')) {
    const orderId = await verifyOrderToken(env, t, now);
    return orderId ? { kind: 'order', orderId } : null;
  }
  if (t.startsWith('tkt_')) {
    const v = await verifyTicketToken(env, t, now);
    return v ? { kind: 'ticket', ...v } : null;
  }
  return null;
}

/** When an order's links expire: 30 days after the end of the event's last date. Null when the order is unknown. */
export async function orderLinkExpiresAt(db: SqlDatabase, orderId: string): Promise<number | null> {
  const row = (
    await allRows<{ last: number | null }>(db, {
      sql: `SELECT MAX(COALESCE(o.ends_at, o.starts_at)) AS last
              FROM orders r JOIN event_occurrences o ON o.event_id = r.event_id
             WHERE r.id = ?1`,
      params: [orderId],
    })
  )[0];
  return row?.last == null ? null : Number(row.last) + ORDER_LINK_GRACE_SECONDS;
}

/** A fresh order-link token, or null when the order does not exist. */
export async function orderTokenFor(db: SqlDatabase, env: PaidEnv, orderId: string): Promise<string | null> {
  const expiresAt = await orderLinkExpiresAt(db, orderId);
  return expiresAt == null ? null : signOrderToken(env, orderId, expiresAt);
}

/** A fresh ticket-link token for the ticket's current version, or null when the ticket does not exist. */
export async function ticketTokenFor(
  db: SqlDatabase,
  env: PaidEnv,
  ticketId: string,
): Promise<string | null> {
  const row = (
    await allRows<{ order_id: string; credential_version: number }>(db, {
      sql: 'SELECT order_id, credential_version FROM tickets WHERE id = ?1',
      params: [ticketId],
    })
  )[0];
  if (!row) return null;
  const expiresAt = await orderLinkExpiresAt(db, row.order_id);
  return expiresAt == null ? null : signTicketToken(env, ticketId, Number(row.credential_version), expiresAt);
}

// ── Credentials ────────────────────────────────────────────────────────────────────────────────────────────────

export interface CredentialTicket {
  id: string;
  credentialVersion: number;
  credentialSalt: string;
}

async function credentialMac(env: PaidEnv, t: CredentialTicket): Promise<string> {
  const mac = await hmacSha256(
    ticketSecret(env),
    `ticket:${t.id}|${t.credentialVersion}|${t.credentialSalt}`,
  );
  return encodeBase32(mac.slice(0, 16));
}

/** The QR payload of a ticket's current version: `GT1.<ticket id body>.<version>.<mac>`. */
export async function ticketCredential(env: PaidEnv, ticket: CredentialTicket): Promise<string> {
  const body = ticketIdToQrPart(ticket.id);
  if (!body) throw new RangeError('ticketCredential: not a ticket id');
  return `${PAID_TICKET_QR_PREFIX}.${body}.${ticket.credentialVersion}.${await credentialMac(env, ticket)}`;
}

export interface ParsedCredential {
  ticketId: string;
  version: number;
  mac: string;
}

/** True when a scanned or typed code is a paid ticket credential (starts with `GT1`). */
export function isTicketCredential(code: unknown): boolean {
  return /^GT1[.:-]/.test(
    String(code ?? '')
      .toUpperCase()
      .replace(/\s+/g, ''),
  );
}

/**
 * Reads a credential, tolerant of case, spaces and the look-alikes Crockford base 32 does not use (O read as 0, I
 * and L as 1). Null when it is not a well-formed `GT1` credential.
 */
export function parseTicketCredential(code: unknown): ParsedCredential | null {
  const compact = String(code ?? '')
    .toUpperCase()
    .replace(/\s+/g, '');
  const m = /^GT1[.:-]([0-9A-Z]{26})[.:-](\d{1,6})[.:-]([0-9A-Z]{26})$/.exec(compact);
  if (!m) return null;
  const fix = (s: string) => s.replace(/O/g, '0').replace(/[IL]/g, '1');
  const body = fix(m[1]);
  const mac = fix(m[3]);
  const ticketId = qrPartToTicketId(body);
  const version = Number(m[2]);
  if (!ticketId || version < 1 || !decodeBase32(mac, 16)) return null;
  return { ticketId, version, mac };
}

/** "Maria G." from "Maria Gonzalez"; the first name alone when there is one word; null when empty. */
export function holderDisplayName(name: string | null | undefined): string | null {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

// ── Shared order loading and policy ────────────────────────────────────────────────────────────────────────────

export interface PaidOrder {
  id: string;
  reference: string;
  eventId: string;
  occurrenceId: string;
  organizationId: string;
  organizationName: string;
  channel: OrderChannel;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  disputed: boolean;
  isPreview: boolean;
  fundsFlow: FundsFlow | null;
  seller: Seller;
  stripeAccountId: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  currency: string;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  feePayer: FeePayer;
  giftCents: number;
  totalCents: number;
  amountRefundedCents: number;
  policySnapshot: PolicySnapshot | null;
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
  createdAt: number;
  paidAt: number | null;
  eventTitle: string;
  eventSlug: string;
  eventStatus: string;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: number;
  endsAt: number | null;
  occurrenceStatus: string;
}

const ORDER_SELECT = `SELECT r.*, g.name AS organization_name, e.title AS event_title, e.slug AS event_slug,
       e.status AS event_status, e.timezone, e.venue_name, e.venue_address,
       o.starts_at, o.ends_at, o.status AS occurrence_status
  FROM orders r
  JOIN events e ON e.id = r.event_id
  JOIN event_occurrences o ON o.id = r.occurrence_id
  JOIN organizations g ON g.id = r.organization_id`;

const str = (v: unknown) => (v == null ? null : String(v));

export function paidOrderFromRow(r: Record<string, unknown>): PaidOrder {
  return {
    id: String(r.id),
    reference: String(r.reference),
    eventId: String(r.event_id),
    occurrenceId: String(r.occurrence_id),
    organizationId: String(r.organization_id),
    organizationName: String(r.organization_name ?? ''),
    channel: r.channel as OrderChannel,
    paymentMethod: r.payment_method as PaymentMethod,
    status: r.status as OrderStatus,
    disputed: Number(r.disputed) === 1,
    isPreview: Number(r.is_preview) === 1,
    fundsFlow: (r.funds_flow ?? null) as FundsFlow | null,
    seller: r.seller as Seller,
    stripeAccountId: str(r.stripe_account_id),
    buyerName: str(r.buyer_name),
    buyerEmail: str(r.buyer_email),
    currency: String(r.currency ?? 'usd'),
    subtotalCents: Number(r.subtotal_cents),
    discountCents: Number(r.discount_cents),
    feeCents: Number(r.fee_cents),
    feePayer: r.fee_payer as FeePayer,
    giftCents: Number(r.gift_cents),
    totalCents: Number(r.total_cents),
    amountRefundedCents: Number(r.amount_refunded_cents),
    policySnapshot: parsePolicySnapshot(r.policy_snapshot),
    paymentIntentId: str(r.payment_intent_id),
    checkoutSessionId: str(r.checkout_session_id),
    createdAt: Number(r.created_at),
    paidAt: r.paid_at == null ? null : Number(r.paid_at),
    eventTitle: String(r.event_title ?? ''),
    eventSlug: String(r.event_slug ?? ''),
    eventStatus: String(r.event_status ?? ''),
    timezone: String(r.timezone ?? 'UTC'),
    venueName: str(r.venue_name),
    venueAddress: str(r.venue_address),
    startsAt: Number(r.starts_at),
    endsAt: r.ends_at == null ? null : Number(r.ends_at),
    occurrenceStatus: String(r.occurrence_status ?? ''),
  };
}

export async function loadPaidOrder(db: SqlDatabase, orderId: string): Promise<PaidOrder | null> {
  const row = (await allRows(db, { sql: `${ORDER_SELECT} WHERE r.id = ?1`, params: [orderId] }))[0];
  return row ? paidOrderFromRow(row) : null;
}

/** The order whose PaymentIntent (or Checkout Session) this is. */
export async function loadPaidOrderByPayment(
  db: SqlDatabase,
  ref: { paymentIntentId?: string | null; checkoutSessionId?: string | null; orderId?: string | null },
): Promise<PaidOrder | null> {
  if (ref.orderId) {
    const byId = await loadPaidOrder(db, ref.orderId);
    if (byId) return byId;
  }
  if (ref.paymentIntentId) {
    const row = (
      await allRows(db, {
        sql: `${ORDER_SELECT} WHERE r.payment_intent_id = ?1`,
        params: [ref.paymentIntentId],
      })
    )[0];
    if (row) return paidOrderFromRow(row);
  }
  if (ref.checkoutSessionId) {
    const row = (
      await allRows(db, {
        sql: `${ORDER_SELECT} WHERE r.checkout_session_id = ?1`,
        params: [ref.checkoutSessionId],
      })
    )[0];
    if (row) return paidOrderFromRow(row);
  }
  return null;
}

/** Statuses of an order that has (or had) tickets. */
export const ORDER_HAS_TICKETS: readonly OrderStatus[] = ['paid', 'partially_refunded', 'refunded'];

/**
 * The policy that applies to an order now: its snapshot, or for each of refunds, transfers and re-entry the event's
 * current policy where that is better for the buyer. Without a snapshot (should not happen) nothing is allowed.
 */
export async function policyForOrder(db: SqlDatabase, order: PaidOrder): Promise<PolicySnapshot> {
  const snapshot: PolicySnapshot = order.policySnapshot ?? {
    v: 1,
    refundPolicy: 'none',
    refundHours: null,
    transfersAllowed: false,
    transferCutoffHours: 0,
    reentryAllowed: false,
    entryNotes: null,
    namesRequired: false,
  };
  const current = await readEventTicketing(db, order.eventId);
  return current ? effectivePolicy(snapshot, policySnapshotOf(current)) : snapshot;
}

/** Until when a buyer may ask for a refund (epoch seconds, exclusive), or null when the policy allows none. */
export function refundDeadline(policy: PolicySnapshot, startsAt: number): number | null {
  if (policy.refundPolicy === 'until_start') return startsAt;
  if (policy.refundPolicy === 'until_hours_before') return startsAt - (policy.refundHours ?? 168) * 3600;
  return null;
}

/** Until when a ticket may be transferred (exclusive), or null when transfers are not allowed. */
export function transferDeadline(policy: PolicySnapshot, startsAt: number): number | null {
  return policy.transfersAllowed ? startsAt - policy.transferCutoffHours * 3600 : null;
}

export interface OrderTicket {
  id: string;
  orderId: string;
  orderItemId: string;
  seq: number;
  occurrenceId: string;
  ticketTypeId: string;
  typeName: string;
  people: number;
  unitPriceCents: number;
  itemQuantity: number;
  itemDiscountCents: number;
  itemFeeCents: number;
  holderName: string | null;
  holderEmail: string | null;
  status: TicketStatus;
  credentialVersion: number;
  credentialSalt: string;
  checkedInAt: number | null;
  transferCount: number;
}

export function orderTicketFromRow(r: Record<string, unknown>): OrderTicket {
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    orderItemId: String(r.order_item_id),
    seq: Number(r.seq),
    occurrenceId: String(r.occurrence_id),
    ticketTypeId: String(r.ticket_type_id),
    typeName: String(r.type_name),
    people: Number(r.people_per_ticket),
    unitPriceCents: Number(r.unit_price_cents),
    itemQuantity: Number(r.quantity),
    itemDiscountCents: Number(r.item_discount_cents),
    itemFeeCents: Number(r.item_fee_cents),
    holderName: str(r.holder_name),
    holderEmail: str(r.holder_email),
    status: r.status as TicketStatus,
    credentialVersion: Number(r.credential_version),
    credentialSalt: String(r.credential_salt),
    checkedInAt: r.checked_in_at == null ? null : Number(r.checked_in_at),
    transferCount: Number(r.transfer_count),
  };
}

const TICKET_SELECT = `SELECT t.*, i.name AS type_name, i.people_per_ticket, i.unit_price_cents, i.quantity,
       i.discount_cents AS item_discount_cents, i.fee_cents AS item_fee_cents
  FROM tickets t JOIN order_items i ON i.id = t.order_item_id`;

/** Every ticket of an order, in the order's line and seat order. */
export async function loadOrderTickets(db: SqlDatabase, orderId: string): Promise<OrderTicket[]> {
  const rows = await allRows(db, {
    sql: `${TICKET_SELECT} WHERE t.order_id = ?1 ORDER BY i.rowid, t.seq`,
    params: [orderId],
  });
  return rows.map(orderTicketFromRow);
}

export async function loadTicket(db: SqlDatabase, ticketId: string): Promise<OrderTicket | null> {
  const row = (await allRows(db, { sql: `${TICKET_SELECT} WHERE t.id = ?1`, params: [ticketId] }))[0];
  return row ? orderTicketFromRow(row) : null;
}

/**
 * A statement that aborts its batch (rolling everything back) unless `condition` holds at that point of the batch.
 * `json()` of a non-JSON string raises an error; the CASE is evaluated per row, so it only fires when false.
 */
export function assertInBatch(
  condition: string,
  params: SqlStatementSpec['params'],
  label: string,
): SqlStatementSpec {
  if (!/^[a-z_]+$/.test(label)) throw new RangeError('assertInBatch: label');
  return {
    sql: `SELECT json(CASE WHEN (${condition}) THEN '1' ELSE 'gamo_assert_${label}' END) AS ok`,
    params,
  };
}

/** True when an error came from `assertInBatch`. */
export function isBatchAssertion(error: unknown): boolean {
  return /malformed JSON/i.test(String((error as Error)?.message ?? error));
}

// ── Check-in ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The date being checked in (from `getCheckInOccurrence`), for the time window. */
export type CheckInDate = Pick<CheckInOccurrence, 'startsAt' | 'opensHours' | 'openedAt'>;

export interface AdmittedTicket {
  ticketId: string;
  /** First name and last initial, or null when the ticket has no name. */
  holder: string | null;
  ticketType: string;
  people: number;
}

export type TicketCheckInResult =
  | ({ outcome: 'admitted' } & AdmittedTicket)
  | ({ outcome: 'already_admitted'; checkedInAt: number } & AdmittedTicket)
  | { outcome: 'refunded' | 'voided' | 'canceled' }
  /** An older image of a ticket that was transferred or reissued: never shows holder data. */
  | { outcome: 'replaced' }
  /** A real ticket of this event for another date. */
  | { outcome: 'wrong_date'; ticketStartsAt: number }
  | { outcome: 'outside_window' }
  | { outcome: 'not_found' };

interface ScanRow {
  id: string;
  event_id: string;
  occurrence_id: string;
  status: TicketStatus;
  credential_version: number;
  credential_salt: string;
  checked_in_at: number | null;
  holder_name: string | null;
  buyer_name: string | null;
  type_name: string;
  people_per_ticket: number;
  ticket_starts_at: number;
  occ_status: string;
  event_status: string;
  order_status: string;
}

async function scanRow(db: SqlDatabase, ticketId: string): Promise<ScanRow | null> {
  return (
    (
      await allRows<ScanRow>(db, {
        sql: `SELECT t.id, t.event_id, t.occurrence_id, t.status, t.credential_version, t.credential_salt, t.checked_in_at,
                     t.holder_name, r.buyer_name, i.name AS type_name, i.people_per_ticket,
                     o.starts_at AS ticket_starts_at, o.status AS occ_status, e.status AS event_status, r.status AS order_status
                FROM tickets t
                JOIN orders r ON r.id = t.order_id
                JOIN order_items i ON i.id = t.order_item_id
                JOIN event_occurrences o ON o.id = t.occurrence_id
                JOIN events e ON e.id = t.event_id
               WHERE t.id = ?1`,
        params: [ticketId],
      })
    )[0] ?? null
  );
}

const admittedOf = (r: ScanRow): AdmittedTicket => ({
  ticketId: r.id,
  holder: holderDisplayName(r.holder_name ?? r.buyer_name),
  ticketType: r.type_name,
  people: Number(r.people_per_ticket),
});

function statusOutcome(status: TicketStatus): TicketCheckInResult {
  if (status === 'refunded') return { outcome: 'refunded' };
  if (status === 'voided') return { outcome: 'voided' };
  return { outcome: 'canceled' };
}

/**
 * Checks a paid ticket in at a date's door. `by` is who scanned (staff link or organizer id). When `occurrence` is
 * given, its check-in window applies. Only a genuine current-version ticket of this date that is still valid is
 * admitted, and only once: two staff scanning the same ticket get one `admitted` and one `already_admitted`.
 */
export async function checkInTicket(
  db: SqlDatabase,
  env: PaidEnv,
  input: { occurrenceId: string; code: string; by: string | null; now: number; occurrence?: CheckInDate },
): Promise<TicketCheckInResult> {
  const parsed = parseTicketCredential(input.code);
  if (!parsed) return { outcome: 'not_found' };
  const row = await scanRow(db, parsed.ticketId);
  if (!row) return { outcome: 'not_found' };
  const sameEvent = (
    await allRows<{ ok: number }>(db, {
      sql: 'SELECT 1 AS ok FROM event_occurrences WHERE id = ?1 AND event_id = ?2',
      params: [input.occurrenceId, row.event_id],
    })
  )[0];
  if (!sameEvent) return { outcome: 'not_found' };
  if (parsed.version > row.credential_version) return { outcome: 'not_found' };
  if (parsed.version < row.credential_version)
    return row.status === 'valid' ? { outcome: 'replaced' } : statusOutcome(row.status);
  const expected = await credentialMac(env, {
    id: row.id,
    credentialVersion: row.credential_version,
    credentialSalt: row.credential_salt,
  });
  if (!constantTimeEqual(expected, parsed.mac)) return { outcome: 'not_found' };
  if (row.occurrence_id !== input.occurrenceId)
    return { outcome: 'wrong_date', ticketStartsAt: Number(row.ticket_starts_at) };
  if (row.status !== 'valid') return statusOutcome(row.status);
  if (row.occ_status === 'canceled' || row.event_status === 'canceled') return { outcome: 'canceled' };
  if (input.occurrence && !checkInWindow(input.occurrence, input.now).open)
    return { outcome: 'outside_window' };

  const won = await allRows<{ id: string }>(db, {
    sql: `UPDATE tickets SET checked_in_at = ?3, checked_in_by = ?4, updated_at = ?3
           WHERE id = ?1 AND credential_version = ?2 AND status = 'valid' AND checked_in_at IS NULL
             AND occurrence_id = ?5
             AND EXISTS (SELECT 1 FROM event_occurrences WHERE id = ?5 AND status = 'scheduled')
       RETURNING id`,
    params: [row.id, parsed.version, input.now, input.by, input.occurrenceId],
  });
  if (won[0]) return { outcome: 'admitted', ...admittedOf(row) };
  const after = await scanRow(db, row.id);
  if (!after) return { outcome: 'not_found' };
  if (after.credential_version !== parsed.version)
    return after.status === 'valid' ? { outcome: 'replaced' } : statusOutcome(after.status);
  if (after.status !== 'valid') return statusOutcome(after.status);
  if (after.checked_in_at != null)
    return { outcome: 'already_admitted', checkedInAt: Number(after.checked_in_at), ...admittedOf(after) };
  return { outcome: 'canceled' };
}

export type DoorCheckInResult =
  { kind: 'ticket'; result: TicketCheckInResult } | { kind: 'registration'; result: CheckInResult };

/**
 * The door screen's one entry point: a `GT1.` code is a paid ticket, anything else a free registration's check-in
 * code. The registration path applies the same window when `occurrence` is given.
 */
export async function checkInAny(
  db: SqlDatabase,
  env: PaidEnv,
  input: { occurrenceId: string; code: string; by: string | null; now: number; occurrence?: CheckInDate },
): Promise<DoorCheckInResult> {
  if (isTicketCredential(input.code)) return { kind: 'ticket', result: await checkInTicket(db, env, input) };
  if (input.occurrence && !checkInWindow(input.occurrence, input.now).open)
    return { kind: 'registration', result: { ok: false, reason: 'outside_window' } };
  const code = normalizeCheckinCode(input.code);
  return {
    kind: 'registration',
    result: await checkIn(db, { occurrenceId: input.occurrenceId, code, now: input.now }),
  };
}

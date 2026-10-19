/**
 * Shared pieces of the Gamo Live ticketing services (design §5): the error type every service throws,
 * environment helpers (fail closed outside `ENVIRONMENT=local`), and typed loaders for events,
 * categories, sections, orders, items and tickets on the raw D1 binding.
 *
 * All times are epoch seconds; money is integer cents. Services never read-then-write inventory:
 * the 0013 triggers own the counters (see `packages/domain/src/ticketing/sql.ts`).
 */
import { asSqlDatabase, allRows, type SqlDatabase } from '../../security/sql-database.ts';
import { localDevelopmentSecret, isLocalEnvironment, resolveEnvSecret } from '../../security/env-secret.ts';
import { SecretNotConfiguredError, sha256Hex } from '../../security/crypto.ts';
import { qrKeyringFromEnv, type QrKeyring } from '../../security/ticket-qr.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { eventPolicyFromRow, type EventPolicy, type EventPolicyRow } from '../../types/policy.ts';
import type { AccessAction, AccessActorType } from '../../types/enums.ts';

/** The bindings and variables the ticketing services read. Structural so tests can pass a plain object. */
export type TicketingEnv = { ENVIRONMENT?: unknown; DB?: unknown } & Record<string, unknown>;

export type TicketingErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'SOLD_OUT'
  | 'NOT_ON_SALE'
  | 'CLOSED'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'RATE_LIMITED'
  | 'INVALID_CODE'
  | 'EXPIRED'
  | 'UNAVAILABLE'
  | 'PAYMENT_FAILED';

const STATUS: Record<TicketingErrorCode, number> = {
  VALIDATION: 400,
  INVALID_CODE: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SOLD_OUT: 409,
  NOT_ON_SALE: 409,
  CLOSED: 409,
  CONFLICT: 409,
  EXPIRED: 410,
  RATE_LIMITED: 429,
  PAYMENT_FAILED: 502,
  UNAVAILABLE: 503,
};

export interface FieldError {
  /** Form field name (and element id) the message belongs to. */
  field: string;
  /** Sentence that says what to do next. */
  message: string;
}

/**
 * Expected failure. `message` is safe to show and always tells the person what to do next;
 * `details` carries field errors or remaining counts for 409 SOLD_OUT.
 */
export class TicketingError extends Error {
  readonly status: number;
  constructor(
    readonly code: TicketingErrorCode,
    message: string,
    readonly details?: { fields?: FieldError[]; remaining?: RemainingCount[]; retryAfterSeconds?: number },
  ) {
    super(message);
    this.name = 'TicketingError';
    this.status = STATUS[code];
  }
}

export interface RemainingCount {
  categoryId: string;
  sectionId: string | null;
  name: string;
  /** Tickets still available (units ÷ seats per ticket). */
  remaining: number;
}

export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** The D1 binding, or 503. */
export function ticketingDb(env: TicketingEnv): SqlDatabase {
  try {
    return asSqlDatabase(env.DB);
  } catch {
    console.error('[ticketing] DB binding unavailable');
    throw new TicketingError('UNAVAILABLE', 'Tickets are temporarily unavailable. Please try again shortly.');
  }
}

/** HMAC secret by name; outside local a missing one is 503 (name-only log). */
export function requireTicketingSecret(env: TicketingEnv, name: string): string {
  try {
    return resolveEnvSecret(env, name);
  } catch (err) {
    if (err instanceof SecretNotConfiguredError) {
      console.error(`[ticketing] ${name} is not configured`);
      throw new TicketingError(
        'UNAVAILABLE',
        'Tickets are temporarily unavailable. Please try again shortly.',
      );
    }
    throw err;
  }
}

/**
 * The QR keyring (`TICKET_QR_SECRET_GL1`, …). In local without a key, a fixed development key for GL1;
 * elsewhere a missing GL1 key means tickets cannot be issued (503).
 */
export function ticketQrKeyring(env: TicketingEnv): QrKeyring {
  const ring = qrKeyringFromEnv(env);
  if (!ring.GL1) {
    if (!isLocalEnvironment(env)) {
      console.error('[ticketing] TICKET_QR_SECRET_GL1 is not configured');
      throw new TicketingError(
        'UNAVAILABLE',
        'Tickets are temporarily unavailable. Please try again shortly.',
      );
    }
    ring.GL1 = localDevelopmentSecret('TICKET_QR_SECRET_GL1');
  }
  return ring;
}

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

export interface EventRow {
  id: string;
  organizer_id: string;
  title: string;
  slug: string;
  category: string;
  tagline: string | null;
  description: string;
  venue_name: string;
  address: string | null;
  city: string;
  state: string;
  starts_at: number;
  ends_at: number | null;
  timezone: string;
  admission_type: string;
  status: string;
  listing_type: string;
  external_only: number;
  cancelled_at: number | null;
  rescheduled_from_starts_at: number | null;
  first_event_review: number;
  start_date_local: string | null;
  start_time_local: string | null;
  venue_id: string | null;
}

export interface CategoryRow {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  capacity: number;
  reserved_count: number;
  sold_count: number;
  note: string | null;
  kind: string;
  description: string | null;
  per_order_limit: number | null;
  min_age: number | null;
  max_age: number | null;
  seats_per_ticket: number;
  zone_codes_json: string | null;
  valid_days_json: string | null;
  sales_start_at: number | null;
  sales_end_at: number | null;
  requires_companion_of: string | null;
  currency: string;
  sort_order: number;
  status: string;
}

export interface SectionRow {
  id: string;
  event_id: string;
  tier_id: string;
  code: string;
  name: string;
  price_cents: number | null;
  capacity: number;
  reserved_count: number;
  sold_count: number;
  zone_code: string | null;
  gate_label: string | null;
  accessible: number;
  sort_order: number;
  status: string;
}

export interface OrderRow {
  id: string;
  order_reference: string | null;
  order_number: string;
  event_id: string;
  customer_profile_id: string | null;
  purchaser_name: string;
  purchaser_email: string;
  quantity: number;
  order_kind: string;
  subtotal_cents: number;
  total_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  idempotency_key: string;
  status: string;
  confirmed_at: number | null;
  created_at: number;
  hold_expires_at: number | null;
  stripe_checkout_expires_at: number | null;
  amount_refunded_cents: number;
  payment_status: string | null;
  payment_method: string | null;
  disputed_at: number | null;
  cancelled_at: number | null;
  policy_snapshot_json: string | null;
  attendees_json: string | null;
  source: string;
  verification_required: number;
  email_verified_at: number | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  event_id: string;
  tier_id: string;
  section_id: string | null;
  quantity: number;
  seats_per_ticket: number;
  unit_price_cents: number;
  subtotal_cents: number;
  currency: string;
  refunded_quantity: number;
}

export interface TicketRow {
  id: string;
  order_id: string;
  event_id: string;
  tier_id: string | null;
  holder_name: string;
  holder_email: string;
  status: string;
  order_item_id: string | null;
  section_id: string | null;
  customer_profile_id: string | null;
  version: number;
  qr_salt: string | null;
  qr_key_id: string | null;
  seq: number | null;
  zone_code: string | null;
  gate_label: string | null;
  transferred_from_ticket_email: string | null;
  transfer_count: number;
  voided_at: number | null;
  void_reason: string | null;
  refunded_at: number | null;
  issued_at: number | null;
  qr_token: string;
  registration_id: string | null;
}

const EVENT_COLUMNS =
  'id, organizer_id, title, slug, category, tagline, description, venue_name, address, city, state, starts_at, ends_at, timezone, admission_type, status, listing_type, external_only, cancelled_at, rescheduled_from_starts_at, first_event_review, start_date_local, start_time_local, venue_id';
const ORDER_COLUMNS =
  'id, order_reference, order_number, event_id, customer_profile_id, purchaser_name, purchaser_email, quantity, order_kind, subtotal_cents, total_cents, currency, stripe_checkout_session_id, stripe_payment_intent_id, idempotency_key, status, confirmed_at, created_at, hold_expires_at, stripe_checkout_expires_at, amount_refunded_cents, payment_status, payment_method, disputed_at, cancelled_at, policy_snapshot_json, attendees_json, source, verification_required, email_verified_at';
export const TICKET_COLUMNS =
  'id, order_id, event_id, tier_id, holder_name, holder_email, status, order_item_id, section_id, customer_profile_id, version, qr_salt, qr_key_id, seq, zone_code, gate_label, transferred_from_ticket_email, transfer_count, voided_at, void_reason, refunded_at, issued_at, qr_token, registration_id';

async function first<T>(db: SqlDatabase, sql: string, ...params: Array<string | number | null>) {
  return ((await db
    .prepare(sql)
    .bind(...params)
    .first()) ?? null) as T | null;
}

export async function loadEvent(db: SqlDatabase, idOrSlug: string): Promise<EventRow | null> {
  return first<EventRow>(
    db,
    `SELECT ${EVENT_COLUMNS} FROM events WHERE id = ?1 OR slug = ?1 LIMIT 1`,
    String(idOrSlug ?? ''),
  );
}

export async function loadCategories(db: SqlDatabase, eventId: string): Promise<CategoryRow[]> {
  return allRows<CategoryRow>(db, {
    sql: 'SELECT id, event_id, name, price_cents, capacity, reserved_count, sold_count, note, kind, description, per_order_limit, min_age, max_age, seats_per_ticket, zone_codes_json, valid_days_json, sales_start_at, sales_end_at, requires_companion_of, currency, sort_order, status FROM ticket_tiers WHERE event_id = ?1 ORDER BY sort_order, id',
    params: [eventId],
  });
}

export async function loadSections(db: SqlDatabase, eventId: string): Promise<SectionRow[]> {
  return allRows<SectionRow>(db, {
    sql: 'SELECT id, event_id, tier_id, code, name, price_cents, capacity, reserved_count, sold_count, zone_code, gate_label, accessible, sort_order, status FROM venue_sections WHERE event_id = ?1 ORDER BY sort_order, code',
    params: [eventId],
  });
}

export async function loadPolicy(db: SqlDatabase, eventId: string): Promise<EventPolicy> {
  const row = await first<EventPolicyRow>(db, 'SELECT * FROM event_policies WHERE event_id = ?1', eventId);
  return eventPolicyFromRow(row);
}

export async function loadOrder(db: SqlDatabase, orderId: string): Promise<OrderRow | null> {
  return first<OrderRow>(
    db,
    `SELECT ${ORDER_COLUMNS} FROM ticket_orders WHERE id = ?1`,
    String(orderId ?? ''),
  );
}

export async function loadOrderBy(
  db: SqlDatabase,
  column: 'idempotency_key' | 'stripe_checkout_session_id' | 'stripe_payment_intent_id' | 'order_reference',
  value: string,
): Promise<OrderRow | null> {
  return first<OrderRow>(
    db,
    `SELECT ${ORDER_COLUMNS} FROM ticket_orders WHERE ${column} = ?1 LIMIT 1`,
    value,
  );
}

export async function loadOrderItems(db: SqlDatabase, orderId: string): Promise<OrderItemRow[]> {
  return allRows<OrderItemRow>(db, {
    sql: 'SELECT id, order_id, event_id, tier_id, section_id, quantity, seats_per_ticket, unit_price_cents, subtotal_cents, currency, refunded_quantity FROM order_items WHERE order_id = ?1 ORDER BY created_at, id',
    params: [orderId],
  });
}

export async function loadOrderTickets(db: SqlDatabase, orderId: string): Promise<TicketRow[]> {
  return allRows<TicketRow>(db, {
    sql: `SELECT ${TICKET_COLUMNS} FROM tickets WHERE order_id = ?1 ORDER BY order_item_id, seq, id`,
    params: [orderId],
  });
}

export async function loadTicket(db: SqlDatabase, ticketId: string): Promise<TicketRow | null> {
  return first<TicketRow>(db, `SELECT ${TICKET_COLUMNS} FROM tickets WHERE id = ?1`, String(ticketId ?? ''));
}

// ---------------------------------------------------------------------------------------------
// Policy snapshot and attendee names
// ---------------------------------------------------------------------------------------------

/**
 * The policy a buyer bought under (`ticket_orders.policy_snapshot_json`), or the defaults.
 */
export function orderPolicy(order: Pick<OrderRow, 'policy_snapshot_json'>): EventPolicy {
  try {
    const raw = JSON.parse(order.policy_snapshot_json ?? 'null') as Record<string, unknown> | null;
    if (raw && typeof raw === 'object') {
      return eventPolicyFromRow({
        reentry_allowed: raw.reentryAllowed ? 1 : 0,
        reentry_limit: (raw.reentryLimit as number | null) ?? null,
        refund_policy: raw.refundPolicy as string,
        transfer_allowed: raw.transferAllowed ? 1 : 0,
        transfer_cutoff_hours: raw.transferCutoffHours as number,
        max_transfers_per_ticket: raw.maxTransfersPerTicket as number,
        attendee_names_required: raw.attendeeNamesRequired ? 1 : 0,
        max_tickets_per_order: raw.maxTicketsPerOrder as number,
        door_sales_enabled: raw.doorSalesEnabled ? 1 : 0,
        door_sales_methods_json: JSON.stringify(raw.doorSalesMethods ?? []),
        age_policy: raw.agePolicy as string,
        min_age: (raw.minAge as number | null) ?? null,
        scan_opens_minutes_before: raw.scanOpensMinutesBefore as number,
      });
    }
  } catch {
    // fall through to defaults
  }
  return eventPolicyFromRow(null);
}

/** Holder names per ticket in item order (`ticket_orders.attendees_json`, migration 0016). */
export function orderAttendeeNames(order: Pick<OrderRow, 'attendees_json'>): string[] {
  try {
    const raw = JSON.parse(order.attendees_json ?? 'null') as unknown;
    return Array.isArray(raw) ? raw.map((n) => String(n ?? '')) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------
// Lifecycle and misc helpers
// ---------------------------------------------------------------------------------------------

/** Online sales and RSVPs close at the event start (UI and API agree, design §7). */
export function salesClosed(event: Pick<EventRow, 'starts_at'>, now: number): boolean {
  return now >= Number(event.starts_at);
}

export function isEventCancelled(event: Pick<EventRow, 'cancelled_at' | 'status'>): boolean {
  return event.cancelled_at !== null && event.cancelled_at !== undefined
    ? true
    : event.status === 'canceled' || event.status === 'cancelled';
}

/** True for Gamo-ticketed events (not external listings). */
export function isTicketedEvent(event: Pick<EventRow, 'listing_type' | 'external_only' | 'admission_type'>) {
  return (
    event.listing_type !== 'external_discovery' &&
    !Number(event.external_only) &&
    (event.admission_type === 'free' || event.admission_type === 'paid')
  );
}

/** "j•••@example.org": enough for the owner to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [local, domain] = String(email ?? '').split('@');
  if (!domain) return '•••';
  return `${local.slice(0, 1)}•••@${domain}`;
}

/** "Maria G." — holder first name + last initial (scanner and shared views). */
export function shortHolderName(name: string): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'Guest';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}.`;
}

/** Statement that appends one `ticket_access_log` row (no PII; actor ids and hashed IP only). */
export function accessLogStatement(input: {
  eventId?: string | null;
  ticketId?: string | null;
  orderId?: string | null;
  actorType: AccessActorType;
  actorId?: string | null;
  action: AccessAction;
  ipHash?: string | null;
  now: number;
}) {
  return {
    sql: 'INSERT INTO ticket_access_log (id, event_id, ticket_id, order_id, actor_type, actor_id, action, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
    params: [
      newPrefixedId('tal'),
      input.eventId ?? null,
      input.ticketId ?? null,
      input.orderId ?? null,
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.ipHash ?? null,
      input.now,
    ],
  };
}

/** Statement that appends an `audit_logs` row (organizer/staff actions with their reason). */
export function auditLogStatement(input: {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  now: number;
}) {
  return {
    sql: 'INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    params: [
      newPrefixedId('aud'),
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      input.payload ? JSON.stringify(input.payload) : null,
      input.now,
    ],
  };
}

/** A short, non-reversible label for logs and rate-limit keys (never log the raw id with PII). */
export async function keyHash(value: string): Promise<string> {
  return (await sha256Hex(`ticketing|${value}`)).slice(0, 32);
}

/** True for addresses that can receive mail (door sales may have none). */
export function isDeliverableEmail(email: string | null | undefined): email is string {
  return typeof email === 'string' && /@/.test(email) && !/\.invalid$/i.test(email.trim());
}

/** Case-insensitive, trimmed comparison of an email and its confirmation. */
export function emailsEqual(a: string, b: string): boolean {
  return (
    String(a ?? '')
      .trim()
      .toLowerCase() ===
    String(b ?? '')
      .trim()
      .toLowerCase()
  );
}

/** Origin for links in emails: the request origin, else `PUBLIC_SITE_URL_LIVE`. */
export function liveOrigin(env: TicketingEnv, requestOrigin?: string | null): string {
  if (requestOrigin) return requestOrigin.replace(/\/+$/, '');
  const configured = env.PUBLIC_SITE_URL_LIVE;
  return typeof configured === 'string' && configured
    ? configured.replace(/\/+$/, '')
    : 'https://live.gamostudio.org';
}

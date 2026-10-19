/**
 * Order placement for Gamo Live (design §4.2, §5.2): one form for free RSVPs and paid checkout.
 *
 *   Turnstile + rate limits (route, via guardPublicForm) → validate (policy bounds, per-order limit,
 *   categories on sale, sales windows, companion rules, attendee names, terms) → release expired holds
 *   for the event → customer profile → ONE hold batch (order + items + holds; triggers reserve or abort
 *   SOLD_OUT) → terms/marketing consent → free: verification email (code + link) / paid: Stripe
 *   Checkout Session (test only) with `expires_at` ≥ the hold.
 *
 * The same idempotency key (a UUID rendered into the form) returns the same order — a double click never
 * holds twice. Free and paid answers are identical whether or not the address already has tickets.
 */
import { runBatch, allRows, type SqlDatabase } from '../../security/sql-database.ts';
import { newOrderReference, newPrefixedId } from '../../security/ids.ts';
import { signValue, verifySignedValue } from '../../security/signed-value.ts';
import { hmacSha256, constantTimeEqual, sha256Hex } from '../../security/crypto.ts';
import { isPlausibleEmail, normalizeEmail } from '../../security/pii-hash.ts';
import { isLocalEnvironment } from '../../security/env-secret.ts';
import { randomBase32 } from '../../security/base32.ts';
import { issueCustomerLink, openCustomerLink, upsertCustomerProfile } from '../customers.ts';
import { recordMarketingConsent, recordTermsAcceptance } from '../../terms/acceptance.ts';
import { getTermsDocument } from '../../terms/registry.ts';
import { formatScope, orderLinkExpiresAt } from '../../security/link-tokens.ts';
import type { PublicFormBody } from '../../api/public-form-guard.ts';
import {
  buildHoldBatch,
  expireStaleOrdersStatement,
  releaseExpiredHoldsStatement,
  SOLD_OUT_CODES,
  ticketingErrorCode,
  transitionOrderStatement,
  type HoldBatchItem,
} from '../../ticketing/sql.ts';
import { HOLD_DURATION_SECONDS, policySnapshotJson, type EventPolicy } from '../../types/policy.ts';
import { StripeApiError, createStripeTestClient, isRealTestKey } from '@studio-gamo/integrations/stripe';
import { sendOrderVerificationEmail, sendTicketLimitEmail } from './email.ts';
import { notifyWaitlist } from './checkout-waitlist.ts';
import {
  TicketingError,
  isEventCancelled,
  isTicketedEvent,
  loadCategories,
  loadEvent,
  loadOrder,
  loadOrderBy,
  loadOrderItems,
  loadPolicy,
  loadSections,
  requireTicketingSecret,
  salesClosed,
  emailsEqual,
  type CategoryRow,
  type EventRow,
  type FieldError,
  type OrderItemRow,
  type OrderRow,
  type RemainingCount,
  type SectionRow,
  type TicketingEnv,
} from './orders-shared.ts';

/** Terms a ticket buyer must accept (drafts until legal review). */
export const TICKET_TERMS_SLUGS = ['ticket-terms', 'privacy-policy'] as const;
/** Per event and email: valid + held tickets may not exceed this multiple of the per-order limit. */
export const PER_EVENT_EMAIL_CAP_MULTIPLE = 3;
/** Wrong codes allowed per order (then the buyer must use the emailed link or start again). */
export const VERIFICATION_CODE_ATTEMPTS = 5;
const CONFIRM_PURPOSE = 'order-confirm';

// ---------------------------------------------------------------------------------------------
// Sale context
// ---------------------------------------------------------------------------------------------

export interface SaleContext {
  event: EventRow;
  categories: CategoryRow[];
  sections: SectionRow[];
  policy: EventPolicy;
}

export type SaleState = 'on_sale' | 'cancelled' | 'closed' | 'not_on_sale';

export async function loadSaleContext(db: SqlDatabase, eventIdOrSlug: string): Promise<SaleContext | null> {
  const event = await loadEvent(db, eventIdOrSlug);
  if (!event || event.status === 'draft' || event.status === 'pending_review' || event.status === 'rejected')
    return null;
  if (!isTicketedEvent(event)) return null;
  const [categories, sections, policy] = await Promise.all([
    loadCategories(db, event.id),
    loadSections(db, event.id),
    loadPolicy(db, event.id),
  ]);
  return { event, categories, sections, policy };
}

export function saleState(ctx: SaleContext, now: number): SaleState {
  if (isEventCancelled(ctx.event)) return 'cancelled';
  if (ctx.event.status !== 'approved') return 'not_on_sale';
  if (salesClosed(ctx.event, now)) return 'closed';
  return 'on_sale';
}

/** Is a category buyable right now (status + sales window)? Returns the reason when not. */
export function categoryAvailability(
  c: CategoryRow,
  now: number,
): { ok: true } | { ok: false; reason: 'hidden' | 'closed' | 'sold_out' | 'not_started' | 'ended' } {
  if (c.status === 'hidden') return { ok: false, reason: 'hidden' };
  if (c.status === 'closed') return { ok: false, reason: 'closed' };
  if (c.status === 'sold_out') return { ok: false, reason: 'sold_out' };
  if (c.sales_start_at !== null && now < Number(c.sales_start_at))
    return { ok: false, reason: 'not_started' };
  if (c.sales_end_at !== null && now >= Number(c.sales_end_at)) return { ok: false, reason: 'ended' };
  return { ok: true };
}

/** Tickets left in a category (or section): units ÷ seats per ticket. */
export function ticketsLeft(c: CategoryRow, s?: SectionRow | null): number {
  const seats = Math.max(1, Number(c.seats_per_ticket));
  const catLeft = Math.floor((Number(c.capacity) - Number(c.reserved_count)) / seats);
  if (!s) return Math.max(0, catLeft);
  const secLeft = Math.floor((Number(s.capacity) - Number(s.reserved_count)) / seats);
  return Math.max(0, Math.min(catLeft, secLeft));
}

export function unitPrice(c: CategoryRow, s?: SectionRow | null): number {
  return s && s.price_cents !== null ? Number(s.price_cents) : Number(c.price_cents);
}

export async function remainingCounts(db: SqlDatabase, eventId: string): Promise<RemainingCount[]> {
  const [categories, sections] = await Promise.all([loadCategories(db, eventId), loadSections(db, eventId)]);
  const out: RemainingCount[] = [];
  for (const c of categories) {
    if (c.status === 'hidden') continue;
    const own = sections.filter((s) => s.tier_id === c.id && s.status === 'active');
    if (own.length === 0)
      out.push({ categoryId: c.id, sectionId: null, name: c.name, remaining: ticketsLeft(c) });
    for (const s of own)
      out.push({
        categoryId: c.id,
        sectionId: s.id,
        name: `${c.name} — ${s.name}`,
        remaining: ticketsLeft(c, s),
      });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Request parsing and validation
// ---------------------------------------------------------------------------------------------

export interface OrderRequestItem {
  categoryId: string;
  sectionId: string | null;
  quantity: number;
}

export interface OrderRequest {
  eventId: string;
  items: OrderRequestItem[];
  purchaserName: string;
  email: string;
  emailConfirm: string;
  /** One per ticket in item order (only when the event requires names). */
  attendeeNames: string[];
  termsAccepted: boolean;
  /** The documents and versions the page showed (`terms_slug` / `terms_version`). */
  termsDocuments: Array<{ slug: string; version: string }>;
  marketingOptIn: boolean;
  idempotencyKey: string;
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const IDEMPOTENCY = /^[A-Za-z0-9_-]{16,100}$/;

/** Form field name for a quantity: `qty.<categoryId>` or `qty.<categoryId>.<sectionId>`. */
export function quantityFieldName(categoryId: string, sectionId?: string | null): string {
  return sectionId ? `qty.${categoryId}.${sectionId}` : `qty.${categoryId}`;
}

/** Reads the order form (form-encoded or JSON). Never throws; validation happens in `validateOrderRequest`. */
export function parseOrderRequest(eventId: string, body: PublicFormBody): OrderRequest {
  const items: OrderRequestItem[] = [];
  const json = body.json;
  if (json && Array.isArray(json.items)) {
    for (const raw of json.items.slice(0, 50) as Array<Record<string, unknown>>) {
      if (!raw || typeof raw !== 'object') continue;
      items.push({
        categoryId: String(raw.categoryId ?? ''),
        sectionId: raw.sectionId ? String(raw.sectionId) : null,
        quantity: Number(raw.quantity),
      });
    }
  } else if (body.form) {
    for (const [key, value] of body.form.entries()) {
      if (!key.startsWith('qty.') || typeof value !== 'string' || value.trim() === '') continue;
      const [, categoryId, sectionId] = key.split('.');
      const q = Number(value);
      if (q === 0) continue;
      items.push({ categoryId: categoryId ?? '', sectionId: sectionId || null, quantity: q });
    }
  }
  const names =
    json && Array.isArray(json.attendeeNames)
      ? (json.attendeeNames as unknown[]).map(String)
      : body.getAll('attendee_name');
  const termsSlugs =
    json && Array.isArray(json.termsDocuments)
      ? (json.termsDocuments as Array<{ slug?: unknown }>).map((d) => String(d?.slug ?? ''))
      : body.getAll('terms_slug');
  const termsVersions =
    json && Array.isArray(json.termsDocuments)
      ? (json.termsDocuments as Array<{ version?: unknown }>).map((d) => String(d?.version ?? ''))
      : body.getAll('terms_version');
  const truthy = (v: string | null) => v === 'yes' || v === 'true' || v === 'on' || v === '1';
  return {
    eventId,
    items,
    purchaserName: (body.get('purchaserName') ?? body.get('name') ?? '').replace(/\s+/g, ' ').trim(),
    email: (body.get('email') ?? '').trim(),
    emailConfirm: (body.get('emailConfirm') ?? body.get('email_confirm') ?? '').trim(),
    attendeeNames: names.slice(0, 40).map((n) => n.replace(/\s+/g, ' ').trim()),
    termsAccepted: truthy(body.get('termsAccepted') ?? body.get('terms_accept')),
    termsDocuments: termsSlugs.map((slug, i) => ({ slug, version: termsVersions[i] ?? '' })),
    marketingOptIn: truthy(body.get('marketingOptIn') ?? body.get('marketing_opt_in')),
    idempotencyKey: (body.get('idempotencyKey') ?? body.get('idempotency_key') ?? '').trim(),
  };
}

export interface ValidatedLine {
  category: CategoryRow;
  section: SectionRow | null;
  quantity: number;
  unitPriceCents: number;
}

export interface ValidatedOrder {
  lines: ValidatedLine[];
  totalTickets: number;
  totalCents: number;
  email: string;
  holderNames: string[];
}

/** Every rule a buyer can break, as field errors that say what to do (design §5.4, §7). */
export function validateOrderRequest(ctx: SaleContext, req: OrderRequest, now: number): ValidatedOrder {
  const errors: FieldError[] = [];
  const state = saleState(ctx, now);
  if (state === 'cancelled')
    throw new TicketingError('CLOSED', 'This event has been cancelled, so tickets are no longer available.');
  if (state === 'closed')
    throw new TicketingError(
      'CLOSED',
      'This event has already started, so registration and ticket sales are closed.',
    );
  if (state !== 'on_sale') throw new TicketingError('NOT_ON_SALE', 'Tickets for this event are not on sale.');

  if (!IDEMPOTENCY.test(req.idempotencyKey))
    errors.push({ field: 'form', message: 'Please reload the page and send the form again.' });
  if (req.purchaserName.length < 2 || req.purchaserName.length > 120)
    errors.push({ field: 'purchaserName', message: 'Enter your full name (2 to 120 characters).' });
  const email = normalizeEmail(req.email);
  if (!isPlausibleEmail(email))
    errors.push({ field: 'email', message: 'Enter a valid email address, like name@example.org.' });
  else if (!emailsEqual(req.email, req.emailConfirm))
    errors.push({
      field: 'emailConfirm',
      message: 'The two email addresses are different. Type the same address in both boxes.',
    });

  const lines: ValidatedLine[] = [];
  const seen = new Set<string>();
  for (const item of req.items) {
    const key = `${item.categoryId}|${item.sectionId ?? ''}`;
    if (!ID.test(item.categoryId) || (item.sectionId !== null && !ID.test(item.sectionId)) || seen.has(key)) {
      errors.push({ field: 'tickets', message: 'Please reload the page and choose your tickets again.' });
      continue;
    }
    seen.add(key);
    const category = ctx.categories.find((c) => c.id === item.categoryId);
    const field = quantityFieldName(item.categoryId, item.sectionId);
    if (!category) {
      errors.push({
        field: 'tickets',
        message: 'One of the ticket types is no longer offered. Please reload the page.',
      });
      continue;
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 0) {
      errors.push({ field, message: `${category.name}: enter a whole number of tickets.` });
      continue;
    }
    if (item.quantity === 0) continue;
    const availability = categoryAvailability(category, now);
    if (!availability.ok) {
      const why =
        availability.reason === 'not_started'
          ? 'is not on sale yet'
          : availability.reason === 'ended'
            ? 'is no longer on sale'
            : availability.reason === 'sold_out'
              ? 'is sold out'
              : 'is not available';
      errors.push({ field, message: `${category.name} ${why}. Choose another ticket type.` });
      continue;
    }
    const ownSections = ctx.sections.filter((s) => s.tier_id === category.id && s.status === 'active');
    let section: SectionRow | null = null;
    if (item.sectionId) {
      section = ownSections.find((s) => s.id === item.sectionId) ?? null;
      if (!section) {
        errors.push({
          field,
          message: `${category.name}: that section is not available. Choose another section.`,
        });
        continue;
      }
    } else if (ownSections.length > 0) {
      errors.push({ field, message: `${category.name}: choose a section.` });
      continue;
    }
    const limit = category.per_order_limit ?? ctx.policy.maxTicketsPerOrder;
    if (item.quantity > limit) {
      errors.push({ field, message: `${category.name}: you can choose up to ${limit} per order.` });
      continue;
    }
    lines.push({ category, section, quantity: item.quantity, unitPriceCents: unitPrice(category, section) });
  }
  const totalTickets = lines.reduce((n, l) => n + l.quantity, 0);
  if (lines.length === 0 && !errors.some((e) => e.field.startsWith('qty.') || e.field === 'tickets'))
    errors.push({ field: 'tickets', message: 'Choose at least one ticket.' });
  if (totalTickets > ctx.policy.maxTicketsPerOrder)
    errors.push({
      field: 'tickets',
      message: `You can choose up to ${ctx.policy.maxTicketsPerOrder} tickets in one order. Lower a quantity, or place a second order.`,
    });

  // Companion tickets come with an accessible ticket (1:1 with the category they depend on).
  for (const line of lines) {
    const of = line.category.requires_companion_of;
    if (!of) continue;
    const base = lines.filter((l) => l.category.id === of).reduce((n, l) => n + l.quantity, 0);
    const companions = lines
      .filter((l) => l.category.requires_companion_of === of)
      .reduce((n, l) => n + l.quantity, 0);
    if (companions > base) {
      const baseName = ctx.categories.find((c) => c.id === of)?.name ?? 'the accessible ticket';
      errors.push({
        field: quantityFieldName(line.category.id, line.section?.id),
        message: `${line.category.name}: each companion ticket needs one ${baseName} ticket in the same order.`,
      });
      break;
    }
  }

  let holderNames: string[] = [];
  if (ctx.policy.attendeeNamesRequired && totalTickets > 0) {
    const names = req.attendeeNames.slice(0, totalTickets);
    if (names.length < totalTickets || names.some((n) => n.length < 2 || n.length > 120))
      errors.push({
        field: 'attendee_name',
        message: `Enter the name of each attendee (${totalTickets} ${totalTickets === 1 ? 'name' : 'names'}).`,
      });
    else if (new Set(names.map((n) => n.toLowerCase())).size !== names.length)
      errors.push({ field: 'attendee_name', message: 'Each ticket needs a different attendee name.' });
    holderNames = names;
  }

  if (!req.termsAccepted)
    errors.push({
      field: 'terms_accept',
      message: 'Please agree to the Ticket Terms and Privacy Policy to continue.',
    });
  else {
    const shown = new Map(req.termsDocuments.map((d) => [d.slug, d.version]));
    const stale = TICKET_TERMS_SLUGS.some((slug) => shown.get(slug) !== getTermsDocument(slug)?.version);
    if (stale)
      errors.push({
        field: 'terms_accept',
        message: 'The terms have changed since this page was opened. Please reload the page and try again.',
      });
  }

  if (errors.length) throw new TicketingError('VALIDATION', errors[0].message, { fields: errors });
  return {
    lines,
    totalTickets,
    totalCents: lines.reduce((n, l) => n + l.quantity * l.unitPriceCents, 0),
    email,
    holderNames,
  };
}

// ---------------------------------------------------------------------------------------------
// Verification code and confirm token (free orders)
// ---------------------------------------------------------------------------------------------

/** The 6-digit code for an order: HMAC(CUSTOMER_LINK_SECRET, order id), never stored. */
export async function orderVerificationCode(env: TicketingEnv, orderId: string): Promise<string> {
  const secret = requireTicketingSecret(env, 'CUSTOMER_LINK_SECRET');
  const mac = await hmacSha256(secret, `order-code|${orderId}`);
  const n = ((mac[0] << 24) | (mac[1] << 16) | (mac[2] << 8) | mac[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, '0');
}

export async function codeMatches(env: TicketingEnv, orderId: string, code: string): Promise<boolean> {
  const clean = String(code ?? '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  return constantTimeEqual(clean, await orderVerificationCode(env, orderId));
}

/** Signed, expiring reference to the order for the code page (not a credential: the code is). */
export async function confirmTokenFor(
  env: TicketingEnv,
  orderId: string,
  expiresAt: number,
): Promise<string> {
  return signValue({
    value: orderId,
    expiresAt,
    secret: requireTicketingSecret(env, 'CUSTOMER_LINK_SECRET'),
    purpose: CONFIRM_PURPOSE,
    secretName: 'CUSTOMER_LINK_SECRET',
  });
}

export async function readConfirmToken(
  env: TicketingEnv,
  token: string,
  now: number,
): Promise<string | null> {
  const v = await verifySignedValue({
    signed: token,
    now,
    secret: requireTicketingSecret(env, 'CUSTOMER_LINK_SECRET'),
    purpose: CONFIRM_PURPOSE,
  });
  return v?.value ?? null;
}

// ---------------------------------------------------------------------------------------------
// Paid checkout gate (design T-05)
// ---------------------------------------------------------------------------------------------

export type PaidCheckoutMode =
  | { open: true; mock: false; secretKey: string }
  | { open: true; mock: true }
  | { open: false; reason: 'production' | 'environment' | 'disabled' | 'no_test_key' };

/**
 * 503 unless ENVIRONMENT ∈ {local, preview} AND STRIPE_TEST_CHECKOUT=true AND a test key. Production is
 * closed in code whatever the configuration. Local without a key → the local mock Stripe (test only).
 */
export function paidCheckoutMode(env: TicketingEnv): PaidCheckoutMode {
  const environment = env.ENVIRONMENT;
  if (environment === 'production') return { open: false, reason: 'production' };
  if (environment !== 'local' && environment !== 'preview') return { open: false, reason: 'environment' };
  if (env.STRIPE_TEST_CHECKOUT !== 'true') return { open: false, reason: 'disabled' };
  const key = typeof env.STRIPE_SECRET_KEY === 'string' ? env.STRIPE_SECRET_KEY : undefined;
  if (isRealTestKey(key)) return { open: true, mock: false, secretKey: key };
  const keyText = String(env.STRIPE_SECRET_KEY ?? '');
  if (environment === 'local' && (!keyText || keyText.startsWith('mock_'))) return { open: true, mock: true };
  return { open: false, reason: 'no_test_key' };
}

export const PAID_CHECKOUT_UNAVAILABLE =
  'Paid ticket checkout is not available yet. No payment has been taken. Please check back later.';

// ---------------------------------------------------------------------------------------------
// Placing an order
// ---------------------------------------------------------------------------------------------

export type PlaceOrderResult =
  | {
      type: 'verify';
      /** For `/tickets/confirm?t=…`. Identical shape whether or not an order was created. */
      confirmToken: string;
      expiresAt: number;
    }
  | {
      type: 'checkout';
      orderId: string;
      orderReference: string;
      checkoutUrl: string;
      mock: boolean;
      holdExpiresAt: number;
      /** Customer cookie for the order (so the success page can show it). */
      cookie: string | null;
    };

export interface PlaceOrderInput {
  request: OrderRequest;
  /** `free` refuses orders with a total above zero (`/api/events/{id}/register`). */
  allow: 'free' | 'any';
  ipHash: string | null;
  origin: string;
  https: boolean;
  now: number;
  fetchImpl?: typeof fetch;
  /** Wait between attempts while another request creates the same Stripe session (default 250 ms; tests use less). */
  retryDelayMs?: number;
}

/**
 * Per event and email cap, enforced INSIDE the hold batch (CLEANUP_LOG D-174): a last statement that fails the
 * whole batch with "malformed JSON" when valid tickets + held tickets of this customer exceed the cap.
 * The new order's own holds are already inserted when it runs, so parallel orders cannot all pass a stale read.
 */
export const EMAIL_CAP_ERROR = /malformed JSON/i;
function emailCapGuardStatement(eventId: string, canonicalEmail: string, cap: number) {
  const canon = canonSql('o.purchaser_email');
  return {
    sql: `SELECT CASE WHEN ((SELECT count(*) FROM tickets t JOIN ticket_orders o ON o.id = t.order_id WHERE t.event_id = ?1 AND t.status = 'valid' AND ${canon} = ?2) + (SELECT coalesce(sum(h.quantity), 0) FROM ticket_holds h JOIN ticket_orders o ON o.id = h.order_id WHERE h.event_id = ?1 AND h.status = 'held' AND ${canon} = ?2)) > ?3 THEN json_extract('{', '$') ELSE 0 END`,
    params: [eventId, canonicalEmail, cap],
  };
}

/**
 * Gmail ignores dots and "+tags" in the local part: for the per-event cap only, `a.b+x@gmail.com` and
 * `ab@googlemail.com` count as one address (CLEANUP_LOG D-174). Everything else is compared as typed.
 */
export function canonicalEmailForCap(email: string): string {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  const domain = e.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return e;
  return `${e.slice(0, at).split('+')[0].replaceAll('.', '')}@gmail.com`;
}

/** The same canonicalisation in SQL for a column holding a normalised email. */
function canonSql(col: string): string {
  const local = `substr(${col}, 1, instr(${col}, '@') - 1)`;
  const bare = `CASE WHEN instr(${local}, '+') > 0 THEN substr(${local}, 1, instr(${local}, '+') - 1) ELSE ${local} END`;
  return `CASE WHEN substr(${col}, instr(${col}, '@') + 1) IN ('gmail.com', 'googlemail.com') THEN replace(${bare}, '.', '') || '@gmail.com' ELSE ${col} END`;
}

/** Unverified free holds are short and capped (CLEANUP_LOG D-173): they extend only while the buyer enters the code. */
export const UNVERIFIED_HOLD_SECONDS = 10 * 60;
export const UNVERIFIED_PER_EVENT_SHARE = 0.25;
export const UNVERIFIED_PER_EVENT_MIN = 10;
export const UNVERIFIED_ERROR = /integer overflow/i;

function unverifiedGuardStatements(
  eventId: string,
  ipHash: string | null,
  perIpCap: number,
  perEventCap: number,
) {
  const unverified =
    "SELECT coalesce(sum(h.quantity), 0) FROM ticket_holds h JOIN ticket_orders o ON o.id = h.order_id WHERE h.event_id = ?1 AND h.status = 'held' AND o.status = 'pending_verification'";
  const boom = 'abs(-9223372036854775808)';
  return [
    {
      sql: `SELECT CASE WHEN ?2 IS NOT NULL AND (${unverified} AND json_extract(o.policy_snapshot_json, '$.ipHash') = ?2) > ?3 THEN ${boom} ELSE 0 END`,
      params: [eventId, ipHash, perIpCap],
    },
    {
      sql: `SELECT CASE WHEN (${unverified}) > ?2 THEN ${boom} ELSE 0 END`,
      params: [eventId, perEventCap],
    },
  ];
}

/** Extends the short hold of a free order while its buyer is entering the code (bounded by the 5-guess limit). */
export async function extendUnverifiedHold(db: SqlDatabase, orderId: string, now: number): Promise<void> {
  const until = now + HOLD_DURATION_SECONDS;
  await runBatch(db, [
    {
      sql: "UPDATE ticket_holds SET expires_at = ?2 WHERE order_id = ?1 AND status = 'held' AND expires_at < ?2 AND EXISTS (SELECT 1 FROM ticket_orders o WHERE o.id = ?1 AND o.status = 'pending_verification')",
      params: [orderId, until],
    },
    {
      sql: "UPDATE ticket_orders SET hold_expires_at = ?2, updated_at = ?3 WHERE id = ?1 AND status = 'pending_verification' AND coalesce(hold_expires_at, 0) < ?2",
      params: [orderId, until, now],
    },
  ]);
}

/** What the buyer asked for, hashed: a replay of the same idempotency key must carry the same request. */
async function requestHash(eventId: string, v: ValidatedOrder, request: OrderRequest): Promise<string> {
  return sha256Hex(
    JSON.stringify({
      e: eventId,
      i: v.lines.map((l) => `${l.category.id}|${l.section?.id ?? ''}|${l.quantity}`).sort(),
      n: request.purchaserName,
      m: v.email,
      a: v.holderNames.map((x) => x.toLowerCase()),
    }),
  );
}

function storedRequestHash(order: Pick<OrderRow, 'policy_snapshot_json'>): string | null {
  try {
    const raw = JSON.parse(order.policy_snapshot_json ?? 'null') as { reqHash?: unknown } | null;
    return typeof raw?.reqHash === 'string' ? raw.reqHash : null;
  } catch {
    return null;
  }
}

async function emailAlreadySent(db: SqlDatabase, key: string): Promise<boolean> {
  const rows = await allRows<{ status: string }>(db, {
    sql: 'SELECT status FROM email_log WHERE idempotency_key = ?1',
    params: [key],
  });
  return ['sent', 'delivered', 'delivery_delayed'].includes(rows[0]?.status ?? '');
}

/**
 * Everything after the order batch, written so a replay (same idempotency key after a crash or double
 * submit) finishes what is missing and sends nothing twice: consent first, terms acceptance last (it is
 * the "done" marker), the verification email only if it was not sent.
 */
async function completeOrderSteps(
  db: SqlDatabase,
  env: TicketingEnv,
  input: PlaceOrderInput,
  order: OrderRow,
  event: EventRow,
): Promise<void> {
  const request = input.request;
  const profileId = order.customer_profile_id;
  const termsDone = await allRows(db, {
    sql: 'SELECT 1 FROM terms_acceptances WHERE context = ?1 LIMIT 1',
    params: [`order:${order.id}`],
  });
  if (termsDone.length === 0) {
    if (request.marketingOptIn)
      await recordMarketingConsent(db, {
        email: order.purchaser_email,
        product: 'live',
        granted: true,
        source: 'live.order',
        ipHash: input.ipHash,
        now: input.now,
      });
    await recordTermsAcceptance(db, {
      documents: request.termsDocuments.filter((d) =>
        (TICKET_TERMS_SLUGS as readonly string[]).includes(d.slug),
      ),
      subject: { customerProfileId: profileId, email: order.purchaser_email },
      context: `order:${order.id}`,
      ipHash: input.ipHash,
      now: input.now,
    });
  }
  if (order.order_kind === 'free' || Number(order.total_cents) === 0) {
    if (profileId && !(await emailAlreadySent(db, `order_verification:${order.id}`))) {
      const holdExpiresAt = Number(order.created_at) + HOLD_DURATION_SECONDS;
      const link = await issueCustomerLink(db, env, {
        customerProfileId: profileId,
        scope: formatScope('order', order.id),
        purpose: 'verification',
        expiresAt: holdExpiresAt,
        now: input.now,
        ipHash: input.ipHash,
        openPath: '/link',
      });
      await sendOrderVerificationEmail(db, env, {
        order,
        event,
        code: await orderVerificationCode(env, order.id),
        confirmUrl: `${input.origin}${link.path}`,
        now: input.now,
      });
    }
  }
}

/** Expires stale holds for the event (triggers give the units back) and tells the waitlist. */
export async function sweepEventHolds(
  db: SqlDatabase,
  env: TicketingEnv,
  eventId: string,
  now: number,
  origin: string,
): Promise<number> {
  const [released] = await runBatch(db, [
    releaseExpiredHoldsStatement({ now, eventId }),
    expireStaleOrdersStatement({ now, eventId }),
  ]);
  if (released.length > 0) await notifyWaitlist(db, env, { eventId, now, origin }).catch(() => undefined);
  return released.length;
}

function soldOut(remaining: RemainingCount[]): TicketingError {
  return new TicketingError(
    'SOLD_OUT',
    'Not enough tickets are left for your choice. Lower the quantity or choose another ticket type — or join the waitlist.',
    { remaining },
  );
}

async function resultForExistingOrder(
  db: SqlDatabase,
  env: TicketingEnv,
  order: OrderRow,
  input: PlaceOrderInput,
  hash: string,
): Promise<PlaceOrderResult> {
  if (order.event_id !== input.request.eventId || !emailsEqual(order.purchaser_email, input.request.email))
    throw new TicketingError('CONFLICT', 'Please reload the page and send the form again.');
  const stored = storedRequestHash(order);
  if (stored && stored !== hash)
    throw new TicketingError(
      'CONFLICT',
      'This form was already sent with different choices. Reload the page and choose your tickets again.',
    );
  const event = await loadEvent(db, order.event_id);
  if (!event) throw new TicketingError('NOT_FOUND', 'This event is no longer available.');
  if (order.order_kind === 'free' || Number(order.total_cents) === 0) {
    if (order.status === 'pending_verification') await completeOrderSteps(db, env, input, order, event);
    return {
      type: 'verify',
      confirmToken: await confirmTokenFor(
        env,
        order.id,
        Number(order.created_at) + HOLD_DURATION_SECONDS + 60,
      ),
      expiresAt: Number(order.created_at) + HOLD_DURATION_SECONDS,
    };
  }
  if (order.status !== 'pending_payment')
    throw new TicketingError(
      'CONFLICT',
      'This order was already completed. Check your email for your tickets.',
    );
  await completeOrderSteps(db, env, input, order, event);
  return startCheckoutSession(db, env, order, event, input);
}

/**
 * Places an order from a validated form. Throws `TicketingError` (VALIDATION, SOLD_OUT, CLOSED,
 * NOT_ON_SALE, UNAVAILABLE, PAYMENT_FAILED) — every message says what to do next.
 */
export async function placeOrder(
  db: SqlDatabase,
  env: TicketingEnv,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const { now } = input;
  const ctx = await loadSaleContext(db, input.request.eventId);
  if (!ctx)
    throw new TicketingError('NOT_FOUND', 'This event is not available. Browse other events on Gamo Live.');
  const request = { ...input.request, eventId: ctx.event.id };
  const v = validateOrderRequest(ctx, request, now);
  if (input.allow === 'free' && v.totalCents > 0)
    throw new TicketingError(
      'VALIDATION',
      'These tickets need payment. Use the ticket page to pay for them.',
      {
        fields: [{ field: 'tickets', message: 'These tickets need payment.' }],
      },
    );
  const paid = v.totalCents > 0;
  const mode = paid ? paidCheckoutMode(env) : null;
  if (mode && !mode.open) {
    console.warn(`[ticketing] paid checkout closed: ${mode.reason}`);
    throw new TicketingError('UNAVAILABLE', PAID_CHECKOUT_UNAVAILABLE);
  }
  // Links and codes need the link secret: fail closed (503) before any inventory is held.
  requireTicketingSecret(env, 'CUSTOMER_LINK_SECRET');

  const hash = await requestHash(ctx.event.id, v, request);
  const existing = await loadOrderBy(db, 'idempotency_key', request.idempotencyKey);
  if (existing) return resultForExistingOrder(db, env, existing, { ...input, request }, hash);

  await sweepEventHolds(db, env, ctx.event.id, now, input.origin);

  const profile = await upsertCustomerProfile(db, { email: v.email, now });
  if (profile.erasedAt !== null)
    throw new TicketingError('VALIDATION', 'We cannot use this email address. Please use another address.', {
      fields: [{ field: 'email', message: 'Please use another email address.' }],
    });

  const cap = ctx.policy.maxTicketsPerOrder * PER_EVENT_EMAIL_CAP_MULTIPLE;

  // Free orders hold seats for only 10 minutes until the email is confirmed (extended while the code is entered).
  const holdExpiresAt = now + (paid ? HOLD_DURATION_SECONDS : UNVERIFIED_HOLD_SECONDS);
  const totalUnits = ctx.categories.reduce((n, c) => n + Number(c.capacity), 0);
  const perEventUnverifiedCap = Math.max(
    Math.ceil(totalUnits * UNVERIFIED_PER_EVENT_SHARE),
    UNVERIFIED_PER_EVENT_MIN,
  );
  const items: HoldBatchItem[] = v.lines.map((l) => ({
    item: {
      id: newPrefixedId('oit'),
      categoryId: l.category.id,
      sectionId: l.section?.id ?? null,
      quantity: l.quantity,
    },
    holdId: newPrefixedId('hold'),
  }));
  const snapshot = JSON.stringify({
    ...(JSON.parse(policySnapshotJson(ctx.policy)) as object),
    reqHash: hash,
    ipHash: input.ipHash ?? null,
  });
  let orderId = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    orderId = newPrefixedId('ord');
    const reference = newOrderReference();
    try {
      await runBatch(db, [
        ...buildHoldBatch({
          order: {
            id: orderId,
            reference,
            eventId: ctx.event.id,
            customerProfileId: profile.id,
            purchaserName: request.purchaserName,
            purchaserEmail: v.email,
            kind: paid ? 'paid' : 'free',
            status: paid ? 'pending_payment' : 'pending_verification',
            idempotencyKey: request.idempotencyKey,
            holdExpiresAt,
            policySnapshotJson: snapshot,
            verificationRequired: !paid,
            paymentStatus: paid ? 'unpaid' : 'no_payment_required',
            paymentMethod: paid ? 'stripe_checkout' : 'none',
            now,
          },
          items,
        }),
        ...(v.holderNames.length
          ? [
              {
                sql: 'UPDATE ticket_orders SET attendees_json = ?2 WHERE id = ?1',
                params: [orderId, JSON.stringify(v.holderNames)],
              },
            ]
          : []),
        emailCapGuardStatement(ctx.event.id, canonicalEmailForCap(v.email), cap),
        ...(paid
          ? []
          : unverifiedGuardStatements(
              ctx.event.id,
              input.ipHash ?? null,
              ctx.policy.maxTicketsPerOrder * 2,
              perEventUnverifiedCap,
            )),
      ]);
      break;
    } catch (err) {
      const code = ticketingErrorCode(err);
      if (code === 'DUPLICATE_ORDER_REFERENCE' && attempt < 2) continue;
      if (code === 'DUPLICATE_ORDER') {
        const raced = await loadOrderBy(db, 'idempotency_key', request.idempotencyKey);
        if (raced) return resultForExistingOrder(db, env, raced, { ...input, request }, hash);
      }
      if (UNVERIFIED_ERROR.test(String((err as { message?: unknown })?.message ?? err)))
        throw new TicketingError(
          'RATE_LIMITED',
          'Too many tickets are waiting for email confirmation right now. Confirm the email you already received, or try again in about 10 minutes.',
          { retryAfterSeconds: UNVERIFIED_HOLD_SECONDS },
        );
      if (EMAIL_CAP_ERROR.test(String((err as { message?: unknown })?.message ?? err))) {
        // Per event and email cap: answer exactly as for a new order (no enumeration) and email the address.
        const attemptId = newPrefixedId('ord');
        await sendTicketLimitEmail(db, env, {
          to: v.email,
          event: ctx.event,
          attemptId,
          origin: input.origin,
          now,
        });
        return {
          type: 'verify',
          confirmToken: await confirmTokenFor(env, attemptId, now + HOLD_DURATION_SECONDS + 60),
          expiresAt: now + HOLD_DURATION_SECONDS,
        };
      }
      if (code && SOLD_OUT_CODES.includes(code)) throw soldOut(await remainingCounts(db, ctx.event.id));
      if (code === 'EVENT_NOT_ON_SALE' || code === 'CATEGORY_NOT_ON_SALE' || code === 'SECTION_NOT_ON_SALE')
        throw new TicketingError(
          'NOT_ON_SALE',
          'One of these tickets just went off sale. Reload the page and choose again.',
        );
      throw err;
    }
  }

  const order = (await loadOrder(db, orderId))!;
  await completeOrderSteps(db, env, { ...input, request }, order, ctx.event);
  if (!paid)
    return {
      type: 'verify',
      confirmToken: await confirmTokenFor(env, orderId, now + HOLD_DURATION_SECONDS + 60),
      expiresAt: now + HOLD_DURATION_SECONDS,
    };
  return startCheckoutSession(db, env, order, ctx.event, { ...input, request });
}

/** Stripe Checkout `expires_at`: the hold, but never under Stripe's 30-minute minimum (+1 min margin). */
export function checkoutExpiresAt(holdExpiresAt: number, now: number): number {
  return Math.max(holdExpiresAt, now + 31 * 60);
}

async function lineItemsFor(db: SqlDatabase, event: EventRow, items: OrderItemRow[]) {
  const [categories, sections] = await Promise.all([
    loadCategories(db, event.id),
    loadSections(db, event.id),
  ]);
  return items.map((i) => {
    const c = categories.find((x) => x.id === i.tier_id);
    const s = sections.find((x) => x.id === i.section_id);
    return {
      name: [event.title, c?.name, s ? `Section ${s.name}` : null].filter(Boolean).join(' — '),
      unitAmount: Number(i.unit_price_cents),
      quantity: Number(i.quantity),
    };
  });
}

/**
 * Gives the held tickets back and cancels the order, but ONLY while no Stripe session was ever attached
 * (a live checkout URL may have been handed out otherwise).
 */
async function cancelUnstartedOrder(db: SqlDatabase, orderId: string, now: number): Promise<void> {
  await runBatch(db, [
    {
      sql: "UPDATE ticket_holds SET status = 'released', released_at = ?2 WHERE order_id = ?1 AND status = 'held' AND order_item_id IS NOT NULL AND EXISTS (SELECT 1 FROM ticket_orders o WHERE o.id = ?1 AND o.status = 'pending_payment' AND o.stripe_checkout_session_id IS NULL)",
      params: [orderId, now],
    },
    {
      sql: "UPDATE ticket_orders SET status = 'cancelled', cancelled_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'pending_payment' AND stripe_checkout_session_id IS NULL",
      params: [orderId, now],
    },
  ]);
}

/** Creates (or, for the same order, re-creates idempotently) the Checkout Session and the customer cookie. */
async function startCheckoutSession(
  db: SqlDatabase,
  env: TicketingEnv,
  order: OrderRow,
  event: EventRow,
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const mode = paidCheckoutMode(env);
  if (!mode.open) throw new TicketingError('UNAVAILABLE', PAID_CHECKOUT_UNAVAILABLE);
  const now = input.now;
  const items = await loadOrderItems(db, order.id);
  const holdExpiresAt = Number(order.hold_expires_at ?? now + HOLD_DURATION_SECONDS);
  const expiresAt = checkoutExpiresAt(holdExpiresAt, Number(order.created_at));
  const successUrl = `${input.origin}/tickets/orders/${order.id}?checkout=success`;
  const cancelUrl = `${input.origin}/tickets/orders/${order.id}?checkout=cancelled`;
  let session: { id: string; url: string; expiresAt: number } | null = null;
  if (mode.mock) {
    if (!isLocalEnvironment(env)) throw new TicketingError('UNAVAILABLE', PAID_CHECKOUT_UNAVAILABLE);
    const id = order.stripe_checkout_session_id ?? `cs_test_local_${randomBase32(24)}`;
    session = { id, url: `${input.origin}/local-test/stripe-checkout/${id}`, expiresAt };
  } else {
    const client = createStripeTestClient({ secretKey: mode.secretKey, fetchImpl: input.fetchImpl });
    const lineItems = await lineItemsFor(db, event, items);
    // A double submit reaches Stripe twice with the same key: the second gets 409 idempotency_key_in_use
    // until the first finishes, then Stripe replays the first answer. Wait for that instead of failing.
    for (let attempt = 0; attempt < 6 && !session; attempt++) {
      try {
        session = await client.createTicketCheckoutSession({
          lineItems,
          currency: order.currency || 'usd',
          customerEmail: order.purchaser_email,
          successUrl,
          cancelUrl,
          expiresAt,
          clientReferenceId: order.id,
          metadata: { orderId: order.id, orderReference: order.order_reference ?? '', eventId: event.id },
          idempotencyKey: `checkout_${order.id}`,
        });
      } catch (err) {
        if (err instanceof StripeApiError && err.status === 409) {
          await new Promise((r) => setTimeout(r, (input.retryDelayMs ?? 250) * (attempt + 1)));
          continue;
        }
        if (err instanceof StripeApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          // Stripe definitely refused: give the inventory back, only if no session was ever attached.
          console.error(`[ticketing] checkout session refused (${err.code ?? err.status})`);
          await cancelUnstartedOrder(db, order.id, now);
          throw new TicketingError(
            'PAYMENT_FAILED',
            "We couldn't start the payment. No money was taken. Please try again.",
          );
        }
        // Network error, timeout, 5xx, 429: Stripe may or may not have created the session. Never cancel here —
        // the hold expires on its own and a retry with the same key replays the session.
        console.error('[ticketing] checkout session failed (will retry with the same key)');
        throw new TicketingError(
          'PAYMENT_FAILED',
          "We couldn't reach the payment page just now. No money was taken. Please try again in a moment — your tickets stay held for a few minutes.",
        );
      }
    }
    if (!session)
      throw new TicketingError(
        'UNAVAILABLE',
        'Your payment page is still being prepared. Please reload in a few seconds — your tickets stay held.',
      );
  }
  await runBatch(db, [
    transitionOrderStatement({
      orderId: order.id,
      from: ['pending_payment'],
      to: 'pending_payment',
      now,
      set: { stripeCheckoutSessionId: session.id, stripeCheckoutExpiresAt: session.expiresAt },
    }),
    {
      sql: "UPDATE ticket_holds SET stripe_checkout_session_id = ?2 WHERE order_id = ?1 AND status = 'held'",
      params: [order.id, session.id],
    },
  ]);
  let cookie: string | null = null;
  if (order.customer_profile_id) {
    const link = await issueCustomerLink(db, env, {
      customerProfileId: order.customer_profile_id,
      scope: formatScope('order', order.id),
      purpose: 'order',
      expiresAt: orderLinkExpiresAt(
        { startsAt: Number(event.starts_at), endsAt: event.ends_at === null ? null : Number(event.ends_at) },
        now,
      ),
      now,
      ipHash: input.ipHash,
    });
    const opened = await openCustomerLink(db, env, {
      token: link.token,
      now,
      https: input.https,
      markEmailVerified: false,
    });
    cookie = opened.ok ? opened.cookie : null;
  }
  return {
    type: 'checkout',
    orderId: order.id,
    orderReference: order.order_reference ?? order.order_number,
    checkoutUrl: session.url,
    mock: mode.mock,
    holdExpiresAt,
    cookie,
  };
}

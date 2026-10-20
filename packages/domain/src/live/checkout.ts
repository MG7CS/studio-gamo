/**
 * Online checkout for paid events (docs/LIVE_REQUIREMENTS.md §8.2 items 9–11, docs/LIVE_PAYMENTS.md §3).
 *
 * Three server-rendered steps that each check their own fields: selection (date, types and quantities, a code),
 * details (name, email and its confirmation with a typo hint that is never applied, attendee names when required, the
 * optional gift) and review (every line from a server-side quote). On Pay, `startOnlineCheckout` reserves the order
 * (orders.ts) and creates the Stripe Checkout Session through `PaymentRouting`; the session total always equals the
 * order total. A definite Stripe refusal releases the order at once; any other failure leaves the hold to expire.
 */
import { resolveEnvSecret } from '../security/env-secret.ts';
import { hashEmail, normalizeEmail, isPlausibleEmail } from '../security/pii-hash.ts';
import { checkRateLimits, rateLimitBucket } from '../security/rate-limit.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { emailTypoHint } from './email-typo.ts';
import { readGiftChoice } from './gifts.ts';
import { BUYER_NAME_MAX, markOrderPaid, planOrder, releaseOrder, reserveOrder } from './orders.ts';
import {
  CHECKOUT_SESSION_SECONDS,
  PAID_ID_PREFIX,
  PaidError,
  type PaidEnv,
  type PricedOrder,
  type ReserveOrderInput,
  type Seller,
} from './paid-types.ts';
import { StripeApiError, type CheckoutLineItem, type PaymentRouting } from './payments/types.ts';
import { newPrefixedId } from '../security/ids.ts';
import { ORDER_LINK_GRACE_SECONDS, signOrderToken } from './tickets.ts';
import type { EventTicketing } from './event-ticketing.ts';

/** How long the order link in the success URL works after the event's date (find-my-tickets covers the rest). */

// ── Step 1: selection ──────────────────────────────────────────────────────────────────────────────────────────

export interface SelectionStep {
  occurrenceId: string;
  lines: Array<{ ticketTypeId: string; quantity: number }>;
  code: string | null;
}

/**
 * Reads the selection form: `occurrence`, `code` and one `qty:<ticket type id>` field per type. Quantities must be
 * whole numbers 0–50; at least one above 0. Throws `PaidError('invalid', { detail })`.
 */
export function parseSelectionForm(entries: Iterable<[string, unknown]>): SelectionStep {
  let occurrenceId = '';
  let code: string | null = null;
  const lines: SelectionStep['lines'] = [];
  for (const [key, raw] of entries) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (key === 'occurrence') occurrenceId = value;
    else if (key === 'code') code = value || null;
    else if (key.startsWith('qty:')) {
      const ticketTypeId = key.slice(4);
      if (!/^tty_[0-9a-z_]{1,60}$/.test(ticketTypeId))
        throw new PaidError('invalid', { detail: 'ticket_type' });
      const quantity = value === '' ? 0 : /^\d{1,2}$/.test(value) ? Number(value) : NaN;
      if (!Number.isInteger(quantity) || quantity > 50)
        throw new PaidError('invalid', { detail: 'quantity' });
      if (quantity > 0) lines.push({ ticketTypeId, quantity });
    }
  }
  if (!occurrenceId) throw new PaidError('invalid', { detail: 'occurrence' });
  if (lines.length === 0) throw new PaidError('invalid', { detail: 'lines' });
  return { occurrenceId, lines, code };
}

// ── Step 2: details ────────────────────────────────────────────────────────────────────────────────────────────

export interface DetailsForm {
  name: unknown;
  email: unknown;
  confirmEmail: unknown;
  attendeeNames?: readonly unknown[];
  giftChoice?: unknown;
  giftCustom?: unknown;
}

export interface DetailsStep {
  buyerName: string;
  buyerEmail: string;
  attendeeNames: string[] | null;
  giftCents: number;
}

export type DetailsResult =
  | { ok: true; value: DetailsStep; emailHint: string | null }
  | { ok: false; errors: Record<string, string>; emailHint: string | null };

/** Checks the details step and returns every field error at once. The email hint is only a suggestion. */
export function validateDetailsStep(
  form: DetailsForm,
  ctx: {
    ticketing: Pick<EventTicketing, 'namesRequired' | 'giftsEnabled' | 'giftPresets'>;
    ticketCount: number;
  },
): DetailsResult {
  const errors: Record<string, string> = {};
  const name = String(form.name ?? '').trim();
  if (!name) errors.name = 'required';
  else if (name.length > BUYER_NAME_MAX) errors.name = 'too_long';
  const email = normalizeEmail(String(form.email ?? ''));
  const confirm = normalizeEmail(String(form.confirmEmail ?? ''));
  if (!email) errors.email = 'required';
  else if (!isPlausibleEmail(email)) errors.email = 'invalid';
  else if (confirm !== email) errors.confirmEmail = 'mismatch';
  const emailHint = email && isPlausibleEmail(email) ? emailTypoHint(email) : null;

  let attendeeNames: string[] | null = null;
  if (ctx.ticketing.namesRequired) {
    attendeeNames = Array.from({ length: ctx.ticketCount }, (_, i) =>
      String(form.attendeeNames?.[i] ?? '').trim(),
    );
    attendeeNames.forEach((n, i) => {
      if (!n) errors[`attendee_${i}`] = 'required';
      else if (n.length > BUYER_NAME_MAX) errors[`attendee_${i}`] = 'too_long';
    });
  }
  let giftCents = 0;
  try {
    giftCents = readGiftChoice({
      enabled: ctx.ticketing.giftsEnabled,
      presets: ctx.ticketing.giftPresets,
      choice: form.giftChoice,
      custom: form.giftCustom,
    });
  } catch {
    errors.gift = 'invalid';
  }
  if (Object.keys(errors).length) return { ok: false, errors, emailHint };
  return { ok: true, value: { buyerName: name, buyerEmail: email, attendeeNames, giftCents }, emailHint };
}

// ── Step 3: review (quote) ─────────────────────────────────────────────────────────────────────────────────────

export interface ReviewLine {
  kind: 'ticket' | 'discount' | 'fee' | 'gift';
  label: string;
  quantity: number | null;
  /** Signed: discounts are negative. */
  amountCents: number;
}

export interface Quote {
  priced: PricedOrder;
  lines: ReviewLine[];
  seller: Seller;
  /** The organization selling (the app resolves its payment routing with this). */
  organizationId: string;
  organizationName: string;
  /** "Grace Church" (Mode A, cash) or "Gamo Studios on behalf of Grace Church" (Mode B). */
  sellerLabel: string;
  code: string | null;
}

/** The lines the review step and the receipt show: tickets, discount, Gamo fee when passed on, gift. */
export function reviewLines(priced: PricedOrder, organizationName: string): ReviewLine[] {
  const out: ReviewLine[] = priced.lines.map((l) => ({
    kind: 'ticket',
    label: l.name,
    quantity: l.quantity,
    amountCents: l.unitPriceCents * l.quantity,
  }));
  if (priced.discountCents > 0)
    out.push({ kind: 'discount', label: 'Discount', quantity: null, amountCents: -priced.discountCents });
  if (priced.feePayer === 'buyer' && priced.feeCents > 0)
    out.push({ kind: 'fee', label: 'Gamo service fee', quantity: null, amountCents: priced.feeCents });
  if (priced.giftCents > 0)
    out.push({
      kind: 'gift',
      label: `Gift to ${organizationName}`,
      quantity: null,
      amountCents: priced.giftCents,
    });
  return out;
}

export const sellerLabelOf = (seller: Seller, organizationName: string) =>
  seller === 'gamo' ? `Gamo Studios on behalf of ${organizationName}` : organizationName;

async function organizationNameOf(db: SqlDatabase, organizationId: string): Promise<string> {
  const [row] = await allRows<{ name: string }>(db, {
    sql: 'SELECT name FROM organizations WHERE id = ?1',
    params: [organizationId],
  });
  return row?.name ?? '';
}

/**
 * Prices an online order exactly as `reserveOrder` will, without writing anything. With `quoteOnly`, buyer details
 * are not required yet (step 1). Throws `PaidError` for anything that would be refused.
 */
export async function quoteOrder(
  db: SqlDatabase,
  env: PaidEnv,
  input: Omit<ReserveOrderInput, 'channel' | 'paymentMethod'>,
  opts: { quoteOnly?: boolean } = {},
): Promise<Quote> {
  let plan;
  try {
    plan = await planOrder(db, env, { ...input, channel: 'online', paymentMethod: 'card_online' }, opts);
  } catch (error) {
    if (!(error instanceof PaidError && error.detail === 'free_order')) throw error;
    plan = await planOrder(db, env, { ...input, channel: 'online', paymentMethod: 'free' }, opts);
  }
  const organizationName = await organizationNameOf(db, plan.ctx.organization_id);
  return {
    priced: plan.priced,
    lines: reviewLines(plan.priced, organizationName),
    seller: plan.seller,
    organizationId: plan.ctx.organization_id,
    organizationName,
    sellerLabel: sellerLabelOf(plan.seller, organizationName),
    code: plan.code?.code ?? null,
  };
}

// ── Pay ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The Checkout line items for an order. One line per ticket type at the discounted unit amount when the discount
 * divides evenly over the quantity, otherwise the line's whole amount as one item; a "Gamo service fee" line when it is
 * passed on; a "Gift to <organization>" line. Lines of 0 are left out. Their sum always equals the order total.
 */
export function checkoutLineItems(priced: PricedOrder, organizationName: string): CheckoutLineItem[] {
  const items: CheckoutLineItem[] = [];
  for (const l of priced.lines) {
    const amount = l.unitPriceCents * l.quantity - l.discountCents;
    if (amount <= 0) continue;
    if (l.discountCents % l.quantity === 0)
      items.push({ name: l.name, unitAmountCents: amount / l.quantity, quantity: l.quantity });
    else items.push({ name: `${l.name} × ${l.quantity}`, unitAmountCents: amount, quantity: 1 });
  }
  if (priced.feePayer === 'buyer' && priced.feeCents > 0)
    items.push({ name: 'Gamo service fee', unitAmountCents: priced.feeCents, quantity: 1 });
  if (priced.giftCents > 0)
    items.push({ name: `Gift to ${organizationName}`, unitAmountCents: priced.giftCents, quantity: 1 });
  const sum = items.reduce((s, i) => s + i.unitAmountCents * i.quantity, 0);
  if (sum !== priced.totalCents) throw new PaidError('invalid', { detail: 'checkout_total' });
  return items;
}

export interface StartCheckoutInput {
  /** The buyer's validated choices; channel and method are set here. */
  input: Omit<ReserveOrderInput, 'channel' | 'paymentMethod'>;
  routing: PaymentRouting;
  /** The Live origin, from `packages/config` (never from the request). */
  origin: string;
  eventTitle: string;
  /** Keyed hash of the buyer's IP address (rate limits); absent in tests and when the platform gives none. */
  ipHash?: string | null;
  now: number;
}

/** Holding seats is limited per IP address and per email, so a script cannot hold an event's seats for nobody. */
export const CHECKOUT_RATE_LIMITS = { perIpPerTenMinutes: 20, perEmailPerHour: 10 } as const;

export type StartCheckoutResult =
  /** Redirect the buyer (303) to Stripe Checkout. */
  | { kind: 'redirect'; url: string; orderId: string; reference: string }
  /** The order cost nothing: it is paid already; show the order page. */
  | { kind: 'free'; orderId: string; reference: string; orderToken: string };

/** Reserves the order and starts Stripe Checkout (see the file comment). */
export async function startOnlineCheckout(
  db: SqlDatabase,
  env: PaidEnv,
  args: StartCheckoutInput,
  deps: { signToken?: (env: PaidEnv, orderId: string, expiresAt: number) => Promise<string> } = {},
): Promise<StartCheckoutResult> {
  const sign = deps.signToken ?? signOrderToken;
  const now = args.now;
  const email = normalizeEmail(String(args.input.buyerEmail ?? ''));
  const emailHash = email
    ? await hashEmail(email, resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET'))
    : null;
  const limit = await checkRateLimits(
    db,
    [
      ...(args.ipHash
        ? [
            {
              bucket: rateLimitBucket('live.checkout', 'ip', args.ipHash),
              limit: CHECKOUT_RATE_LIMITS.perIpPerTenMinutes,
              windowSeconds: 600,
            },
          ]
        : []),
      ...(emailHash
        ? [
            {
              bucket: rateLimitBucket('live.checkout', 'email', emailHash),
              limit: CHECKOUT_RATE_LIMITS.perEmailPerHour,
              windowSeconds: 3600,
            },
          ]
        : []),
    ],
    now,
  );
  if (!limit.allowed) throw new PaidError('rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
  const [event] = await allRows<{ slug: string; starts_at: number; organization_id: string }>(db, {
    sql: `SELECT e.slug, o.starts_at, e.organization_id FROM events e JOIN event_occurrences o ON o.event_id = e.id
           WHERE e.id = ?1 AND o.id = ?2`,
    params: [args.input.eventId, args.input.occurrenceId],
  });
  if (!event) throw new PaidError('not_found');
  const linkExpiresAt = event.starts_at + ORDER_LINK_GRACE_SECONDS;
  const base = { ...args.input, channel: 'online' as const, now };

  let reserved;
  try {
    reserved = await reserveOrder(db, env, { ...base, paymentMethod: 'card_online' });
  } catch (error) {
    if (!(error instanceof PaidError && error.detail === 'free_order')) throw error;
    const free = await reserveOrder(db, env, { ...base, paymentMethod: 'free' });
    const paid = await markOrderPaid(db, env, {
      orderId: free.orderId,
      amountCents: 0,
      currency: free.priced.currency,
      providerRef: null,
      stripeAccountId: null,
      now,
    });
    if (paid.outcome !== 'paid') throw new PaidError('stale', { detail: paid.outcome });
    return {
      kind: 'free',
      orderId: free.orderId,
      reference: free.reference,
      orderToken: await sign(env, free.orderId, linkExpiresAt),
    };
  }

  const routing = args.routing;
  if (routing.flow !== reserved.fundsFlow || (routing.chargeAccountId ?? null) !== reserved.stripeAccountId) {
    await releaseOrder(db, { orderId: reserved.orderId, reason: 'failed', now });
    throw new PaidError('payments_unavailable', { detail: 'routing_mismatch' });
  }
  const organizationName = await organizationNameOf(db, reserved.organizationId);
  const origin = args.origin.replace(/\/+$/, '');
  const expiresAt = now + CHECKOUT_SESSION_SECONDS;
  let session;
  try {
    const lines = checkoutLineItems(reserved.priced, organizationName);
    session = await routing.createCheckout({
      orderId: reserved.orderId,
      orderReference: reserved.reference,
      eventTitle: args.eventTitle,
      lines,
      customerEmail: args.input.buyerEmail ? normalizeEmail(String(args.input.buyerEmail)) : null,
      successUrl: `${origin}/orders/return/${await sign(env, reserved.orderId, linkExpiresAt)}`,
      cancelUrl: `${origin}/events/${encodeURIComponent(event.slug)}/tickets`,
      expiresAt,
      gamoFeeCents: reserved.priced.feeCents,
    });
  } catch (error) {
    if ((error instanceof StripeApiError && error.definite) || error instanceof PaidError) {
      await releaseOrder(db, { orderId: reserved.orderId, reason: 'failed', now });
      throw new PaidError('stripe_error', {
        detail: error instanceof StripeApiError ? (error.stripeCode ?? 'refused') : error.detail,
      });
    }
    throw error; // Network error, 5xx, 429: the hold expires on its own.
  }
  if (!session.url) {
    await releaseOrder(db, { orderId: reserved.orderId, reason: 'failed', now });
    throw new PaidError('stripe_error', { detail: 'no_url' });
  }
  await runBatch(db, [
    {
      sql: "UPDATE orders SET checkout_session_id = ?2, updated_at = ?3 WHERE id = ?1 AND status = 'pending'",
      params: [reserved.orderId, session.id, now],
    },
    {
      sql: `INSERT INTO payments (id, order_id, kind, provider_ref, stripe_account_id, amount_cents, currency, status,
              created_at, updated_at)
            VALUES (?1, ?2, 'checkout_session', ?3, ?4, ?5, ?6, 'pending', ?7, ?7)
            ON CONFLICT (provider_ref) DO NOTHING`,
      params: [
        newPrefixedId(PAID_ID_PREFIX.payment),
        reserved.orderId,
        session.id,
        reserved.stripeAccountId,
        reserved.priced.totalCents,
        reserved.priced.currency,
        now,
      ],
    },
  ]);
  return { kind: 'redirect', url: session.url, orderId: reserved.orderId, reference: reserved.reference };
}

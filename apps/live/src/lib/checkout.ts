/**
 * Online checkout for a paid event (docs/LIVE_SCREENS.md §I.2 P1–P3, docs/LIVE_REQUIREMENTS.md §8.2 items 9–11, 19).
 *
 * Three split-screen steps, each its own server-rendered page that calls one function here: choose tickets (date,
 * quantities, a code), your details (name, email twice with a typo hint that is never applied, attendee names when
 * the event asks, the optional gift), and review (every line from the server's quote, the seller, the policies, the
 * terms consent) with Pay. The answers travel between steps in a short-lived HttpOnly cookie (never in a URL) and are
 * re-checked on every step: prices always come from `quoteOrder` on the server, never from the form or the cookie.
 *
 * The rules themselves live in `@gamo/domain` (checkout.ts, orders.ts); this file only orchestrates and words them.
 */
import {
  EmailUnavailableError,
  PaidError,
  SecretNotConfiguredError,
  StripeApiError,
  TERMS_REGISTRY,
  availabilityFor,
  codeUnlocks,
  findUsableCode,
  formatCents,
  formatLocalEventSchedule,
  listEventTicketTypes,
  loadOrderTickets,
  loadPaidOrder,
  nextPriceChangeAt,
  orderConfirmationEmail,
  orderReceipt,
  orderTokenFor,
  parseSelectionForm,
  paymentsRuntime,
  priceNow,
  quoteOrder,
  readEventTicketing,
  releaseOrder,
  sendLiveEmail,
  startOnlineCheckout,
  stripeModeOf,
  validateDetailsStep,
  verifyOrderToken,
  type DetailsStep,
  type EventCode,
  type EventTicketing,
  type LiveEmail,
  type LiveEventDetail,
  eventCardSalesAvailable,
  type PaidEnv,
  type PaidErrorCode,
  type PaymentRouting,
  type PolicySnapshot,
  type Quote,
  type SqlDatabase,
  type TicketType,
} from '@gamo/domain';
import type { LiveContext } from './registration';

export type Tone = 'info' | 'success' | 'warning' | 'danger';
export interface Message {
  tone: Tone;
  text: string;
}

/** The checkout's step labels, shown by StepProgress. */
export const CHECKOUT_STEPS = ['Tickets', 'Your details', 'Review and pay'] as const;

// ── Words ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a buyer reads for each domain error. Nothing internal is named. */
export const PAID_MESSAGES: Record<PaidErrorCode, string> = {
  invalid: 'Please check what you entered.',
  not_found: 'This event is not selling tickets here.',
  forbidden: 'This is not allowed.',
  not_on_sale: 'Some of these tickets are not on sale right now. Please choose again.',
  sold_out: 'Some of the tickets you chose sold out a moment ago. Please choose again.',
  limit_exceeded: 'That is more tickets than one order allows.',
  closed_past: 'This date has already started, so tickets are no longer sold online.',
  code_invalid: 'That code is not valid for this event.',
  code_used_up: 'That code has already been used as many times as it allows.',
  payments_unavailable:
    'Card payments for this event are not available right now. Nothing was charged. Please try again later.',
  mode_not_chosen:
    'Card payments for this event are not available right now. Nothing was charged. Please try again later.',
  account_not_ready:
    'Card payments for this event are not available right now. Nothing was charged. Please try again later.',
  not_verified:
    'Card payments for this event are not available right now. Nothing was charged. Please try again later.',
  terms_not_accepted:
    'Card payments for this event are not available right now. Nothing was charged. Please try again later.',
  policy_forbids: 'The event’s policy does not allow this.',
  already_done: 'This was already done.',
  stale: 'Something changed a moment ago. Please check and try again.',
  rate_limited: 'Too many tries. Please wait a little while and try again.',
  locked: 'Too many tries. Please wait a little while and try again.',
  expired: 'This link has expired.',
  wrong_pin: 'Please check what you entered.',
  session_closed: 'This is no longer open.',
  reader_unavailable: 'Card payments are not available right now.',
  stripe_error: 'The payment page could not be opened. Nothing was charged. Please try again.',
};

const UNAVAILABLE_CODES: ReadonlySet<PaidErrorCode> = new Set([
  'payments_unavailable',
  'mode_not_chosen',
  'account_not_ready',
  'not_verified',
  'terms_not_accepted',
]);

/** True when the error means card payments cannot be taken right now (the page answers 503). */
export function isPaymentsUnavailable(error: unknown): boolean {
  return (
    error instanceof SecretNotConfiguredError ||
    (error instanceof PaidError && UNAVAILABLE_CODES.has(error.code))
  );
}

/** One-time notices after a redirect (flash keys → words). */
export const CHECKOUT_FLASH: Record<string, string> = {
  'checkout-sold-out': PAID_MESSAGES.sold_out,
  'checkout-not-on-sale': PAID_MESSAGES.not_on_sale,
  'checkout-limit': 'That is more tickets than one order allows. Please choose again.',
  'checkout-code': 'The code you entered can no longer be used. Please check it and choose again.',
  'checkout-closed': PAID_MESSAGES.closed_past,
  'checkout-expired': 'Your choices were not kept, so please choose your tickets again.',
  'checkout-not-paid':
    'Your payment did not go through, so nothing was charged and your tickets were not reserved. You can try again.',
  'checkout-details': 'Please check your details.',
};

/** The flash key for an error that sends the buyer back to step 1. */
export function backToTicketsKey(error: PaidError): string {
  if (error.code === 'sold_out') return 'checkout-sold-out';
  if (error.code === 'limit_exceeded') return 'checkout-limit';
  if (error.code === 'code_invalid' || error.code === 'code_used_up') return 'checkout-code';
  if (error.code === 'closed_past') return 'checkout-closed';
  return 'checkout-not-on-sale';
}

/** "Test mode" on every payment screen while Stripe runs with test keys or the local stand-in. */
export function paymentTestMode(env: PaidEnv): { show: boolean; standin: boolean } {
  const mode = stripeModeOf(env);
  const key = typeof env.STRIPE_SECRET_KEY === 'string' ? env.STRIPE_SECRET_KEY.trim() : '';
  return {
    show: mode === 'standin' || (mode === 'stripe' && !/^(sk|rk)_live_/.test(key)),
    standin: mode === 'standin',
  };
}

/** The policies of an order or an event in plain words (review step and order page). */
export function policyWords(
  p: Pick<
    PolicySnapshot,
    | 'refundPolicy'
    | 'refundHours'
    | 'transfersAllowed'
    | 'transferCutoffHours'
    | 'reentryAllowed'
    | 'entryNotes'
  >,
): { refund: string; transfer: string; reentry: string; entryNotes: string | null } {
  const refund =
    p.refundPolicy === 'none'
      ? 'No refunds.'
      : p.refundPolicy === 'until_start'
        ? 'Refunds can be requested any time before the start.'
        : `Refunds can be requested until ${p.refundHours ?? 0} hours before the start.`;
  const transfer = !p.transfersAllowed
    ? 'Tickets cannot be passed on to someone else.'
    : p.transferCutoffHours > 0
      ? `Tickets can be passed on to someone else, free, until ${p.transferCutoffHours} hours before the start.`
      : 'Tickets can be passed on to someone else, free, until the start.';
  return {
    refund,
    transfer,
    reentry: p.reentryAllowed ? 'Re-entry is allowed.' : 'No re-entry once you leave.',
    entryNotes: p.entryNotes?.trim() || null,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ── State carried between the steps ────────────────────────────────────────────────────────────────────────────

export const CHECKOUT_COOKIE = 'gamo_checkout';
/** The answers are kept an hour; prices and seats are checked again on every step anyway. */
export const CHECKOUT_COOKIE_MAX_AGE = 60 * 60;
/** Browsers keep cookies up to about 4 KB; stay well under. */
export const CHECKOUT_COOKIE_MAX_LENGTH = 3800;

export interface CheckoutState {
  v: 1;
  eventId: string;
  occurrenceId: string;
  lines: Array<{ ticketTypeId: string; quantity: number }>;
  code: string | null;
  details: DetailsStep | null;
  /** The signed order link of a checkout started and not finished (released when the buyer chooses again). */
  pendingToken: string | null;
}

/** The subset of Astro's cookie jar used here. */
export interface CookieJar {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options: { path: string; httpOnly: boolean; sameSite: 'lax'; secure: boolean; maxAge: number },
  ): void;
  delete(name: string, options: { path: string }): void;
}

const TYPE_ID = /^tty_[0-9a-z_]{1,60}$/;
const OCCURRENCE_ID = /^occ_[0-9a-z_]{1,60}$/;
const ORDER_TOKEN = /^ord_[0-9a-z]{26}\.\d{1,12}\.[0-9a-f]{32}$/;

function toBase64Url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

export function encodeCheckoutState(state: CheckoutState): string {
  return toBase64Url(JSON.stringify(state));
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function readDetails(v: unknown): DetailsStep | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  if (!isText(d.buyerName, 100) || !isText(d.buyerEmail, 254) || !isInt(d.giftCents, 0, 1_000_000))
    return null;
  let names: string[] | null = null;
  if (d.attendeeNames != null) {
    if (!Array.isArray(d.attendeeNames) || d.attendeeNames.length > 50) return null;
    if (!d.attendeeNames.every((n) => isText(n, 100))) return null;
    names = d.attendeeNames as string[];
  }
  return { buyerName: d.buyerName, buyerEmail: d.buyerEmail, attendeeNames: names, giftCents: d.giftCents };
}

/**
 * Reads the carried answers for this event. Anything malformed, or for another event, is ignored (null): the cookie
 * is the buyer's own and is re-checked on every step, so a bad one only means starting again.
 */
export function decodeCheckoutState(raw: string | null | undefined, eventId: string): CheckoutState | null {
  if (!raw || raw.length > CHECKOUT_COOKIE_MAX_LENGTH) return null;
  const json = fromBase64Url(raw);
  if (!json) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object' || v.v !== 1 || v.eventId !== eventId) return null;
  if (typeof v.occurrenceId !== 'string' || !OCCURRENCE_ID.test(v.occurrenceId)) return null;
  if (!Array.isArray(v.lines) || v.lines.length > 50) return null;
  const lines: CheckoutState['lines'] = [];
  for (const l of v.lines as Array<Record<string, unknown>>) {
    if (!l || typeof l.ticketTypeId !== 'string' || !TYPE_ID.test(l.ticketTypeId)) return null;
    if (!isInt(l.quantity, 1, 50)) return null;
    lines.push({ ticketTypeId: l.ticketTypeId, quantity: l.quantity });
  }
  const code = v.code == null ? null : isText(v.code, 64) ? v.code : undefined;
  if (code === undefined) return null;
  const details = v.details == null ? null : readDetails(v.details);
  if (v.details != null && !details) return null;
  const pendingToken =
    typeof v.pendingToken === 'string' && ORDER_TOKEN.test(v.pendingToken) ? v.pendingToken : null;
  return { v: 1, eventId, occurrenceId: v.occurrenceId, lines, code, details, pendingToken };
}

export function readCheckoutState(cookies: CookieJar, eventId: string): CheckoutState | null {
  return decodeCheckoutState(cookies.get(CHECKOUT_COOKIE)?.value, eventId);
}

/** Stores the answers; false when they are too long to carry (the page then asks for shorter names). */
export function writeCheckoutState(cookies: CookieJar, state: CheckoutState, secure: boolean): boolean {
  const value = encodeCheckoutState(state);
  if (value.length > CHECKOUT_COOKIE_MAX_LENGTH) return false;
  cookies.set(CHECKOUT_COOKIE, value, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: CHECKOUT_COOKIE_MAX_AGE,
  });
  return true;
}

export function clearCheckoutState(cookies: CookieJar): void {
  cookies.delete(CHECKOUT_COOKIE, { path: '/' });
}

// ── The event ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface CheckoutEvent {
  id: string;
  slug: string;
  title: string;
  timezone: string;
  organizerName: string;
  organizerVerified: boolean;
  venueLabel: string;
  refundLine: string | null;
  sellerLine: string | null;
  canceled: boolean;
  /** Dates that can still be bought for (not canceled, not started), soonest first. */
  dates: Array<{ id: string; label: string; startsAt: number }>;
}

const dateLabel = (timezone: string, startsAt: Date) =>
  formatLocalEventSchedule(null, null, timezone, startsAt).fullLabel;

/** A published paid event by slug, or null (not found, or not sold with Gamo tickets). */
export async function loadCheckoutEvent(
  live: LiveContext,
  slug: string,
  now: number,
): Promise<{ event: CheckoutEvent; detail: LiveEventDetail } | null> {
  const detail = await live.catalog.getEvent(slug);
  if (!detail || detail.admission !== 'paid_tickets') return null;
  return {
    detail,
    event: {
      id: detail.id,
      slug: detail.slug,
      title: detail.title,
      timezone: detail.timezone,
      organizerName: detail.organizerName,
      organizerVerified: detail.organizerVerified,
      venueLabel: [detail.venueName, detail.address, `${detail.city}, ${detail.state}`]
        .filter(Boolean)
        .join(', '),
      refundLine: detail.paidTickets?.refundLine ?? null,
      sellerLine: detail.paidTickets?.sellerLine ?? null,
      canceled: detail.status === 'canceled',
      dates: detail.occurrences
        .filter((o) => !o.canceled && o.startsAt.getTime() / 1000 > now)
        .map((o) => ({
          id: o.id,
          label: dateLabel(detail.timezone, o.startsAt),
          startsAt: Math.floor(o.startsAt.getTime() / 1000),
        })),
    },
  };
}

export function whenOf(event: CheckoutEvent, occurrenceId: string): string {
  return event.dates.find((d) => d.id === occurrenceId)?.label ?? '';
}

// ── Step 1: tickets ────────────────────────────────────────────────────────────────────────────────────────────

export type TypeState = 'on_sale' | 'sold_out' | 'not_open' | 'ended';

export interface TicketTypeOption {
  id: string;
  name: string;
  description: string | null;
  priceLabel: string;
  /** "Until Nov 1" when an early price ends; null otherwise. */
  priceNote: string | null;
  people: number;
  state: TypeState;
  /** "Sold out", "On sale from …", "Not on sale" (null while on sale). */
  stateText: string | null;
  /** "Only 3 left" when few remain (a real count), else null. */
  leftText: string | null;
  /** Highest quantity the buyer may choose now (0 when not on sale). */
  max: number;
  quantity: number;
  error?: string;
}

export interface SelectionView {
  event: CheckoutEvent;
  occurrenceId: string;
  whenLabel: string;
  types: TicketTypeOption[];
  code: string;
  codeNote: string | null;
  maxPerOrder: number;
  /** Why nothing can be bought now (canceled, no upcoming dates, no tickets set up), or null. */
  closed: string | null;
  errors: Record<string, string>;
  notice: Message | null;
  status: number;
}

const shortDate = (timezone: string, at: number) =>
  new Date(at * 1000).toLocaleString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

function codeNoteOf(code: EventCode, types: readonly TicketType[]): string {
  const names = (ids: readonly string[] | null) =>
    ids == null
      ? 'every ticket'
      : types
          .filter((t) => ids.includes(t.id))
          .map((t) => t.name)
          .join(', ') || 'some tickets';
  if (code.kind === 'access') return `Code ${code.code} unlocks: ${names(code.ticketTypeIds)}.`;
  const off =
    code.discountKind === 'percent'
      ? `${code.percentOff ?? 0}% off`
      : `${formatCents(code.amountOffCents ?? 0)} off`;
  return `Code ${code.code}: ${off} ${names(code.ticketTypeIds)}. You will see it at review.`;
}

/** Few enough left to say so (a real count from the inventory). */
const FEW_LEFT = 10;

async function buildSelection(
  live: LiveContext,
  event: CheckoutEvent,
  ticketing: EventTicketing | null,
  input: {
    occurrenceId: string;
    code: string | null;
    quantities: ReadonlyMap<string, number>;
    errors?: Record<string, string>;
    notice?: Message | null;
    status?: number;
    now: number;
  },
): Promise<SelectionView> {
  const { now } = input;
  const errors = { ...(input.errors ?? {}) };
  const base: SelectionView = {
    event,
    occurrenceId: input.occurrenceId,
    whenLabel: whenOf(event, input.occurrenceId),
    types: [],
    code: input.code ?? '',
    codeNote: null,
    maxPerOrder: ticketing?.maxTicketsPerOrder ?? 0,
    closed: null,
    errors,
    notice: input.notice ?? null,
    status: input.status ?? 200,
  };
  if (event.canceled) return { ...base, closed: 'This event was canceled. Tickets are not sold.' };
  if (event.dates.length === 0)
    return { ...base, closed: 'This event has no upcoming dates, so tickets are no longer sold online.' };
  if (!ticketing) return { ...base, closed: 'Tickets for this event are not on sale yet.' };

  const [types, availability] = await Promise.all([
    listEventTicketTypes(live.db, event.id),
    availabilityFor(live.db, event.id, input.occurrenceId, now),
  ]);
  let code: EventCode | null = null;
  if (input.code) {
    try {
      code = await findUsableCode(live.db, event.id, input.code, now);
    } catch (error) {
      if (!(error instanceof PaidError)) throw error;
      errors.code ??= PAID_MESSAGES[error.code];
    }
  }
  const left = new Map(availability.map((a) => [a.ticketTypeId, a]));
  const options: TicketTypeOption[] = [];
  for (const t of types) {
    if (t.status === 'hidden' && !codeUnlocks(code, t.id)) continue;
    const a = left.get(t.id);
    const price = priceNow(t, now);
    const change = nextPriceChangeAt(t.deadlines, now);
    let state: TypeState = 'on_sale';
    let stateText: string | null = null;
    if (t.status === 'ended' || (t.salesEndAt != null && now >= t.salesEndAt)) {
      state = 'ended';
      stateText = 'Not on sale';
    } else if (t.salesStartAt != null && now < t.salesStartAt) {
      state = 'not_open';
      stateText = `On sale from ${shortDate(event.timezone, t.salesStartAt)}`;
    } else if (!a || a.soldOut) {
      state = 'sold_out';
      stateText = 'Sold out';
    }
    const online = a?.online ?? 0;
    const max =
      state === 'on_sale'
        ? Math.max(0, Math.min(t.perOrderLimit, ticketing.maxTicketsPerOrder, a?.online ?? Infinity))
        : 0;
    options.push({
      id: t.id,
      name: t.name,
      description: t.description,
      priceLabel: formatCents(price),
      priceNote:
        change != null && price !== t.priceCents ? `Until ${shortDate(event.timezone, change)}` : null,
      people: t.peoplePerTicket,
      state,
      stateText,
      leftText: state === 'on_sale' && a?.online != null && online <= FEW_LEFT ? `Only ${online} left` : null,
      max,
      quantity: Math.min(input.quantities.get(t.id) ?? 0, max),
      error: errors[`qty:${t.id}`],
    });
  }
  return {
    ...base,
    types: options,
    codeNote: code ? codeNoteOf(code, types) : null,
    closed: options.length === 0 ? 'Tickets for this event are not on sale yet.' : null,
  };
}

function chooseDate(event: CheckoutEvent, ...wanted: Array<string | null | undefined>): string {
  for (const id of wanted) if (id && event.dates.some((d) => d.id === id)) return id;
  return event.dates[0]?.id ?? '';
}

const quantitiesOf = (lines: CheckoutState['lines'] | undefined) =>
  new Map((lines ?? []).map((l) => [l.ticketTypeId, l.quantity]));

/** Reads `qty:<type>` fields leniently (for re-showing the form; the strict check is `parseSelectionForm`). */
export function readQuantities(form: FormData): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('qty:') || typeof value !== 'string') continue;
    const id = key.slice(4);
    const n = Number(value.trim());
    if (TYPE_ID.test(id) && Number.isInteger(n) && n > 0 && n <= 50) out.set(id, n);
  }
  return out;
}

export type StepOutcome<V> =
  { kind: 'not_found' } | { kind: 'redirect'; location: string; flash?: string } | { kind: 'view'; view: V };

/** Step 1 (GET): the event's dates and ticket types for the chosen date, with the earlier answers. */
export async function openSelection(
  live: LiveContext,
  input: { slug: string; date: string | null; cookies: CookieJar; flash: string | null; now: number },
): Promise<StepOutcome<SelectionView>> {
  const loaded = await loadCheckoutEvent(live, input.slug, input.now);
  if (!loaded) return { kind: 'not_found' };
  const { event } = loaded;
  const state = readCheckoutState(input.cookies, event.id);
  const occurrenceId = chooseDate(event, input.date, state?.occurrenceId, loaded.detail.occurrenceId);
  const sameDate = state?.occurrenceId === occurrenceId;
  const ticketing = await readEventTicketing(live.db, event.id);
  let notice: Message | null = input.flash ? { tone: 'warning', text: input.flash } : null;
  if (!notice && state?.pendingToken)
    notice = {
      tone: 'info',
      text: 'Your earlier payment was not finished, so nothing was charged. Choose your tickets to try again.',
    };
  // Say so before the buyer chooses, not only at the last step, when card payments are off for this organizer.
  if (!notice && !(await eventCardSalesAvailable(live.db, live.env as PaidEnv, event.id)))
    notice = { tone: 'warning', text: PAID_MESSAGES.payments_unavailable };
  return {
    kind: 'view',
    view: await buildSelection(live, event, ticketing, {
      occurrenceId,
      code: state?.code ?? null,
      quantities: sameDate ? quantitiesOf(state?.lines) : new Map(),
      notice,
      now: input.now,
    }),
  };
}

/** Releases a checkout the buyer started and did not finish (their seats come back before they choose again). */
export async function releasePendingCheckout(
  live: LiveContext,
  token: string | null,
  now: number,
): Promise<boolean> {
  if (!token) return false;
  const orderId = await verifyOrderToken(live.env, token, now);
  const order = orderId ? await loadPaidOrder(live.db, orderId) : null;
  if (!order || order.status !== 'pending' || order.channel !== 'online' || !order.checkoutSessionId)
    return false;
  const runtime = paymentsRuntime(live.db, live.env);
  const resolved = await runtime.routingForOrder(order.id);
  if (!resolved.available) return false;
  try {
    await resolved.routing.expireCheckout(order.checkoutSessionId);
  } catch (error) {
    // Already paid or expired at Stripe (the webhook decides), or Stripe unreachable (the hold runs out on its own).
    if (error instanceof StripeApiError) return false;
    throw error;
  }
  const { released } = await releaseOrder(live.db, { orderId: order.id, reason: 'canceled', now });
  await runtime.flush();
  return released;
}

const SELECTION_FIELD_ERRORS: Record<string, string> = {
  lines: 'Choose at least one ticket.',
  quantity: 'Quantities are whole numbers from 0 to 50.',
  occurrence: 'Choose a date.',
  ticket_type: 'One of these tickets is no longer offered. Please choose again.',
};

/**
 * Step 1 (POST): `action=apply` checks a code and shows what it unlocks or takes off; `action=remove_code` drops it;
 * otherwise Next: the selection is checked against what is left, priced on the server (`quoteOrder`) and carried to
 * step 2. Every problem comes back as form state.
 */
export async function submitSelection(
  live: LiveContext,
  input: { slug: string; form: FormData; cookies: CookieJar; secure: boolean; now: number },
): Promise<StepOutcome<SelectionView>> {
  const { form, now } = input;
  const loaded = await loadCheckoutEvent(live, input.slug, now);
  if (!loaded) return { kind: 'not_found' };
  const { event } = loaded;
  const state = readCheckoutState(input.cookies, event.id);
  const ticketing = await readEventTicketing(live.db, event.id);
  const action = String(form.get('action') ?? 'next');
  const occurrenceId = chooseDate(event, String(form.get('occurrence') ?? ''), state?.occurrenceId);
  const typedCode = String(form.get('code') ?? '').trim() || null;
  const quantities = readQuantities(form);
  const show = (
    extra: {
      errors?: Record<string, string>;
      notice?: Message | null;
      status?: number;
      code?: string | null;
    } = {},
  ) =>
    buildSelection(live, event, ticketing, {
      occurrenceId,
      code: extra.code === undefined ? typedCode : extra.code,
      quantities,
      errors: extra.errors,
      notice: extra.notice,
      status: extra.status,
      now,
    }).then((view) => ({ kind: 'view', view }) as const);
  const keep = (patch: Partial<CheckoutState>): CheckoutState => ({
    v: 1,
    eventId: event.id,
    occurrenceId,
    lines: [...quantities].map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
    code: typedCode,
    details: state?.details ?? null,
    pendingToken: state?.pendingToken ?? null,
    ...patch,
  });
  const here = `/events/${encodeURIComponent(event.slug)}/tickets?date=${encodeURIComponent(occurrenceId)}`;

  if (action === 'remove_code') {
    writeCheckoutState(input.cookies, keep({ code: null }), input.secure);
    return { kind: 'redirect', location: here };
  }
  // Apply is the form's first button, so Enter in a quantity field lands here: with no code typed, it means Next.
  if (action === 'apply' && typedCode) {
    try {
      await findUsableCode(live.db, event.id, typedCode, now);
    } catch (error) {
      if (!(error instanceof PaidError)) throw error;
      return show({ errors: { code: PAID_MESSAGES[error.code] } });
    }
    writeCheckoutState(input.cookies, keep({}), input.secure);
    return { kind: 'redirect', location: here };
  }

  let selection;
  try {
    selection = parseSelectionForm(form.entries());
  } catch (error) {
    if (!(error instanceof PaidError)) throw error;
    return show({
      errors: { lines: SELECTION_FIELD_ERRORS[error.detail ?? ''] ?? PAID_MESSAGES[error.code] },
    });
  }
  if (!event.dates.some((d) => d.id === selection.occurrenceId))
    return show({ errors: { lines: SELECTION_FIELD_ERRORS.occurrence } });

  // The buyer's own unfinished checkout must not hold the seats they are choosing again.
  await releasePendingCheckout(live, state?.pendingToken ?? null, now);

  // What is left right now (the reservation checks again, atomically, at Pay).
  const view = await buildSelection(live, event, ticketing, {
    occurrenceId: selection.occurrenceId,
    code: selection.code,
    quantities,
    now,
  });
  const errors: Record<string, string> = { ...view.errors };
  for (const line of selection.lines) {
    const option = view.types.find((t) => t.id === line.ticketTypeId);
    if (!option) errors.lines = SELECTION_FIELD_ERRORS.ticket_type;
    else if (option.state !== 'on_sale') errors[`qty:${option.id}`] = `${option.name}: ${option.stateText}.`;
    else if (line.quantity > option.max)
      errors[`qty:${option.id}`] =
        option.max === 0
          ? `${option.name}: sold out.`
          : `${option.name}: at most ${option.max} in this order.`;
  }
  if (Object.keys(errors).length) return show({ errors, code: selection.code });

  try {
    const quote = await quoteOrder(
      live.db,
      live.env,
      {
        eventId: event.id,
        occurrenceId: selection.occurrenceId,
        lines: selection.lines,
        code: selection.code,
        now,
      },
      { quoteOnly: true },
    );
    const saved = writeCheckoutState(
      input.cookies,
      keep({
        occurrenceId: selection.occurrenceId,
        lines: selection.lines,
        code: quote.code,
        pendingToken: null,
      }),
      input.secure,
    );
    if (!saved) return show({ errors: { lines: 'Please choose fewer tickets.' } });
  } catch (error) {
    if (isPaymentsUnavailable(error))
      return show({ notice: { tone: 'danger', text: PAID_MESSAGES.payments_unavailable }, status: 503 });
    if (!(error instanceof PaidError)) throw error;
    if (error.code === 'code_invalid' || error.code === 'code_used_up')
      return show({ errors: { code: PAID_MESSAGES[error.code] } });
    if (error.code === 'limit_exceeded') {
      const option = view.types.find((t) => t.id === error.detail);
      return show({
        errors: option
          ? { [`qty:${option.id}`]: `${option.name}: at most ${option.max} in this order.` }
          : { lines: `One order holds at most ${view.maxPerOrder} tickets.` },
      });
    }
    return show({ notice: { tone: 'danger', text: PAID_MESSAGES[error.code] } });
  }
  return { kind: 'redirect', location: `/events/${encodeURIComponent(event.slug)}/tickets/details` };
}

// ── Step 2: your details ───────────────────────────────────────────────────────────────────────────────────────

export interface DetailsValues {
  name: string;
  email: string;
  confirmEmail: string;
  attendeeNames: string[];
  gift: string;
  giftCustom: string;
}

export interface DetailsView {
  event: CheckoutEvent;
  whenLabel: string;
  /** "3 tickets · $60.00 before any gift". */
  summary: string;
  ticketCount: number;
  namesRequired: boolean;
  gift: { enabled: boolean; organizationName: string; presets: Array<{ value: string; label: string }> };
  values: DetailsValues;
  errors: Record<string, string>;
  /** "Did you mean …?" (never applied); `hintFor` is the address it was shown for. */
  emailHint: string | null;
  hintFor: string;
  notice: Message | null;
  status: number;
}

const DETAILS_ERRORS: Record<string, Record<string, string>> = {
  name: { required: 'Enter your name.', too_long: 'Your name is too long (at most 100 characters).' },
  email: { required: 'Enter your email address.', invalid: 'Enter a valid email address.' },
  confirmEmail: { mismatch: 'The two email addresses do not match.' },
  gift: {
    invalid: 'Choose a gift amount, or No gift. A custom gift is between $1.00 and $10,000.00.',
  },
};

/** Words for one `validateDetailsStep` error. */
export function detailsErrorText(field: string, code: string): string {
  if (field.startsWith('attendee_')) {
    const n = Number(field.slice(9)) + 1;
    return code === 'too_long' ? `Name for ticket ${n} is too long.` : `Enter the name for ticket ${n}.`;
  }
  return DETAILS_ERRORS[field]?.[code] ?? 'Please check this.';
}

/** The order the errors are listed in (the page's top summary follows the form). */
export function orderedDetailsErrors(
  errors: Record<string, string>,
): Array<{ field: string; message: string }> {
  const rank = (f: string) =>
    f === 'name'
      ? 0
      : f === 'email'
        ? 1
        : f === 'confirmEmail'
          ? 2
          : f.startsWith('attendee_')
            ? 3 + Number(f.slice(9)) / 100
            : 9;
  return Object.entries(errors)
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([field, message]) => ({ field: field === 'gift' ? 'gift-none' : field, message }));
}

async function quoteSelection(live: LiveContext, state: CheckoutState, now: number): Promise<Quote> {
  return quoteOrder(
    live.db,
    live.env,
    { eventId: state.eventId, occurrenceId: state.occurrenceId, lines: state.lines, code: state.code, now },
    { quoteOnly: true },
  );
}

function ticketsOf(state: CheckoutState): number {
  return state.lines.reduce((s, l) => s + l.quantity, 0);
}

function valuesFrom(state: CheckoutState): DetailsValues {
  const d = state.details;
  return {
    name: d?.buyerName ?? '',
    email: d?.buyerEmail ?? '',
    confirmEmail: d?.buyerEmail ?? '',
    attendeeNames: d?.attendeeNames ?? [],
    gift: d && d.giftCents > 0 ? 'custom' : 'none',
    giftCustom: d && d.giftCents > 0 ? (d.giftCents / 100).toFixed(2) : '',
  };
}

async function detailsContext(
  live: LiveContext,
  slug: string,
  cookies: CookieJar,
  now: number,
): Promise<
  | { kind: 'not_found' }
  | { kind: 'redirect'; location: string; flash?: string }
  | { kind: 'ready'; event: CheckoutEvent; state: CheckoutState; ticketing: EventTicketing; quote: Quote }
> {
  const loaded = await loadCheckoutEvent(live, slug, now);
  if (!loaded) return { kind: 'not_found' };
  const { event } = loaded;
  const first = `/events/${encodeURIComponent(event.slug)}/tickets`;
  const state = readCheckoutState(cookies, event.id);
  if (!state || state.lines.length === 0)
    return { kind: 'redirect', location: first, flash: 'checkout-expired' };
  const ticketing = await readEventTicketing(live.db, event.id);
  if (!ticketing) return { kind: 'redirect', location: first, flash: 'checkout-not-on-sale' };
  try {
    const quote = await quoteSelection(live, state, now);
    return { kind: 'ready', event, state, ticketing, quote };
  } catch (error) {
    if (isPaymentsUnavailable(error)) throw error;
    if (!(error instanceof PaidError)) throw error;
    return { kind: 'redirect', location: first, flash: backToTicketsKey(error) };
  }
}

function giftOptions(ticketing: EventTicketing) {
  return ticketing.giftPresets.map((cents) => ({ value: String(cents), label: formatCents(cents) }));
}

function detailsView(
  ctx: { event: CheckoutEvent; state: CheckoutState; ticketing: EventTicketing; quote: Quote },
  extra: Partial<DetailsView> & { values: DetailsValues },
): DetailsView {
  const count = ticketsOf(ctx.state);
  const beforeGift = ctx.quote.priced.totalCents - ctx.quote.priced.giftCents;
  return {
    event: ctx.event,
    whenLabel: whenOf(ctx.event, ctx.state.occurrenceId),
    summary: `${plural(count, 'ticket')} · ${formatCents(beforeGift)}${ctx.ticketing.giftsEnabled ? ' before any gift' : ''}`,
    ticketCount: count,
    namesRequired: ctx.ticketing.namesRequired,
    gift: {
      enabled: ctx.ticketing.giftsEnabled,
      organizationName: ctx.quote.organizationName,
      presets: giftOptions(ctx.ticketing),
    },
    errors: {},
    emailHint: null,
    hintFor: '',
    notice: null,
    status: 200,
    ...extra,
    values: {
      ...extra.values,
      attendeeNames: ctx.ticketing.namesRequired
        ? Array.from({ length: count }, (_, i) => extra.values.attendeeNames[i] ?? '')
        : [],
    },
  };
}

/** Step 2 (GET). Without carried answers for this event, back to step 1. */
export async function openDetails(
  live: LiveContext,
  input: { slug: string; cookies: CookieJar; flash: string | null; now: number },
): Promise<StepOutcome<DetailsView>> {
  const ctx = await detailsContext(live, input.slug, input.cookies, input.now);
  if (ctx.kind !== 'ready') return ctx;
  const values = valuesFrom(ctx.state);
  if (ctx.state.details && ctx.state.details.giftCents > 0) {
    const preset = ctx.ticketing.giftPresets.find((p) => p === ctx.state.details?.giftCents);
    if (preset) Object.assign(values, { gift: String(preset), giftCustom: '' });
  }
  return {
    kind: 'view',
    view: detailsView(ctx, {
      values,
      notice: input.flash ? { tone: 'warning', text: input.flash } : null,
    }),
  };
}

/** Step 2 (POST): every field checked at once; the email hint stops the first Next once, then is left to the buyer. */
export async function submitDetails(
  live: LiveContext,
  input: { slug: string; form: FormData; cookies: CookieJar; secure: boolean; now: number },
): Promise<StepOutcome<DetailsView>> {
  const { form } = input;
  const ctx = await detailsContext(live, input.slug, input.cookies, input.now);
  if (ctx.kind !== 'ready') return ctx;
  const count = ticketsOf(ctx.state);
  const values: DetailsValues = {
    name: String(form.get('name') ?? ''),
    email: String(form.get('email') ?? ''),
    confirmEmail: String(form.get('confirmEmail') ?? ''),
    attendeeNames: Array.from({ length: count }, (_, i) => String(form.get(`attendee_${i}`) ?? '')),
    gift: String(form.get('gift') ?? 'none'),
    giftCustom: String(form.get('giftCustom') ?? ''),
  };
  const checked = validateDetailsStep(
    {
      name: values.name,
      email: values.email,
      confirmEmail: values.confirmEmail,
      attendeeNames: values.attendeeNames,
      giftChoice: values.gift,
      giftCustom: values.giftCustom,
    },
    { ticketing: ctx.ticketing, ticketCount: count },
  );
  const hintFor = values.email.trim().toLowerCase();
  if (!checked.ok) {
    const errors = Object.fromEntries(
      Object.entries(checked.errors).map(([field, code]) => [field, detailsErrorText(field, code)]),
    );
    return {
      kind: 'view',
      view: detailsView(ctx, { values, errors, emailHint: checked.emailHint, hintFor, status: 422 }),
    };
  }
  // A possible typo stops Next once, so the buyer can look; pressing Next again keeps the address as typed.
  if (checked.emailHint && String(form.get('hintFor') ?? '') !== hintFor)
    return { kind: 'view', view: detailsView(ctx, { values, emailHint: checked.emailHint, hintFor }) };
  const saved = writeCheckoutState(input.cookies, { ...ctx.state, details: checked.value }, input.secure);
  if (!saved)
    return {
      kind: 'view',
      view: detailsView(ctx, {
        values,
        notice: {
          tone: 'danger',
          text: 'These names are too long to carry to the next step. Please shorten them.',
        },
        status: 422,
      }),
    };
  return { kind: 'redirect', location: `/events/${encodeURIComponent(ctx.event.slug)}/tickets/review` };
}

// ── Step 3: review and pay ─────────────────────────────────────────────────────────────────────────────────────

export interface MoneyLine {
  label: string;
  amount: string;
  note?: string;
}

export interface ReviewView {
  event: CheckoutEvent;
  whenLabel: string;
  buyer: { name: string; email: string };
  ticketCount: number;
  lines: MoneyLine[];
  total: { label: string; amount: string };
  free: boolean;
  seller: string;
  policy: ReturnType<typeof policyWords>;
  error: string | null;
  notice: Message | null;
  status: number;
}

/** The review lines, formatted (tickets, discount, Gamo fee when passed on, gift with who receives it). */
export function reviewMoneyLines(quote: Quote): MoneyLine[] {
  return quote.lines.map((l) => ({
    label: l.quantity != null ? `${l.label} × ${l.quantity}` : l.label,
    amount: formatCents(l.amountCents),
    note:
      l.kind === 'gift'
        ? `Goes to ${quote.organizationName}. Gamo makes no tax claim about it.`
        : l.kind === 'fee'
          ? 'Gamo Studios’ service fee.'
          : undefined,
  }));
}

async function reviewContext(live: LiveContext, slug: string, cookies: CookieJar, now: number) {
  const loaded = await loadCheckoutEvent(live, slug, now);
  if (!loaded) return { kind: 'not_found' } as const;
  const { event } = loaded;
  const first = `/events/${encodeURIComponent(event.slug)}/tickets`;
  const state = readCheckoutState(cookies, event.id);
  if (!state || state.lines.length === 0)
    return { kind: 'redirect', location: first, flash: 'checkout-expired' } as const;
  if (!state.details)
    return { kind: 'redirect', location: `${first}/details`, flash: 'checkout-details' } as const;
  const ticketing = await readEventTicketing(live.db, event.id);
  if (!ticketing) return { kind: 'redirect', location: first, flash: 'checkout-not-on-sale' } as const;
  const input = {
    eventId: event.id,
    occurrenceId: state.occurrenceId,
    lines: state.lines,
    code: state.code,
    buyerName: state.details.buyerName,
    buyerEmail: state.details.buyerEmail,
    attendeeNames: state.details.attendeeNames,
    giftCents: state.details.giftCents,
    termsVersion: TERMS_REGISTRY['ticket-terms'].version,
    now,
  };
  try {
    const quote = await quoteOrder(live.db, live.env, input);
    return { kind: 'ready', event, state, ticketing, quote, input } as const;
  } catch (error) {
    if (isPaymentsUnavailable(error) || !(error instanceof PaidError)) throw error;
    // Buyer details that no longer pass (for example names now required) go back to step 2; the rest to step 1.
    if (error.code === 'invalid' && ['name', 'email', 'attendee_names', 'gift'].includes(error.detail ?? ''))
      return { kind: 'redirect', location: `${first}/details`, flash: 'checkout-details' } as const;
    return { kind: 'redirect', location: first, flash: backToTicketsKey(error) } as const;
  }
}

type ReadyReview = Extract<Awaited<ReturnType<typeof reviewContext>>, { kind: 'ready' }>;

function reviewView(ctx: ReadyReview, extra: Partial<ReviewView> = {}): ReviewView {
  const { quote, state, ticketing } = ctx;
  return {
    event: ctx.event,
    whenLabel: whenOf(ctx.event, state.occurrenceId),
    buyer: { name: state.details!.buyerName, email: state.details!.buyerEmail },
    ticketCount: ticketsOf(state),
    lines: reviewMoneyLines(quote),
    total: { label: 'Total', amount: formatCents(quote.priced.totalCents) },
    free: quote.priced.totalCents === 0,
    seller: quote.sellerLabel,
    policy: policyWords({ ...ticketing }),
    error: null,
    notice: null,
    status: 200,
    ...extra,
  };
}

/** Step 3 (GET): the full total with every line, before the payment step. */
export async function openReview(
  live: LiveContext,
  input: { slug: string; cookies: CookieJar; now: number },
): Promise<StepOutcome<ReviewView>> {
  const ctx = await reviewContext(live, input.slug, input.cookies, input.now);
  if (ctx.kind !== 'ready') return ctx;
  return { kind: 'view', view: reviewView(ctx) };
}

/** Used for a free order when card payments are not set up: never called (a free order never goes to Stripe). */
const NO_CARD_ROUTING: PaymentRouting = {
  flow: 'gamo_collects',
  seller: 'gamo',
  chargeAccountId: null,
  gateway: null as unknown as PaymentRouting['gateway'],
  createCheckout: () => Promise.reject(new PaidError('payments_unavailable')),
  expireCheckout: () => Promise.reject(new PaidError('payments_unavailable')),
  createCardPresentPayment: () => Promise.reject(new PaidError('payments_unavailable')),
  refund: () => Promise.reject(new PaidError('payments_unavailable')),
};

/**
 * Who sells this event's tickets (needed to route the payment). `quoteOrder` is asked to return it as
 * `organizationId`; until it does, card payments answer "unavailable" (never a guess).
 */
export function organizationIdOf(quote: Quote): string | null {
  return quote.organizationId || null;
}

export interface PayDeps {
  sendEmail?: (env: PaidEnv, email: LiveEmail) => Promise<void>;
  /** The payment routing for the quoted order (swapped in tests); defaults to the request's payments runtime. */
  routingFor?: (quote: Quote) => Promise<PaymentRouting | null>;
  flush?: () => Promise<void>;
}

/** The confirmation email of an order that cost nothing (paid at once, so no webhook sends it). */
export async function freeOrderEmail(
  db: SqlDatabase,
  orderId: string,
  orderUrl: string,
): Promise<LiveEmail | null> {
  const order = await loadPaidOrder(db, orderId);
  if (!order?.buyerEmail) return null;
  const [receipt, tickets] = await Promise.all([orderReceipt(db, order), loadOrderTickets(db, order.id)]);
  return orderConfirmationEmail({
    to: order.buyerEmail,
    name: order.buyerName,
    event: {
      title: order.eventTitle,
      startsAt: order.startsAt,
      timezone: order.timezone,
      venueName: order.venueName,
      venueAddress: order.venueAddress,
      organizationName: order.organizationName,
    },
    reference: order.reference,
    seller: order.seller,
    lines: receipt.lines,
    totalCents: order.totalCents,
    ticketCount: tickets.length,
    orderUrl,
    entryNotes: order.policySnapshot?.entryNotes ?? null,
  });
}

/**
 * Step 3 (POST) Pay: the terms consent, then the order is reserved and Stripe Checkout started (`startOnlineCheckout`);
 * the buyer is sent there (303). A free order is paid at once and opens its order page. Seats lost since step 1 send
 * the buyer back there with a notice; card payments that are unavailable answer 503 with plain words.
 */
export async function payReview(
  live: LiveContext,
  input: {
    slug: string;
    form: FormData;
    cookies: CookieJar;
    secure: boolean;
    origin: string;
    /** Keyed hash of the buyer's IP address (`requesterHash`), for the rate limits on holding seats. */
    ipHash?: string | null;
    now: number;
  },
  deps: PayDeps = {},
): Promise<StepOutcome<ReviewView>> {
  const { now } = input;
  const ctx = await reviewContext(live, input.slug, input.cookies, now);
  if (ctx.kind !== 'ready') return ctx;
  if (input.form.get('terms') !== 'yes')
    return {
      kind: 'view',
      view: reviewView(ctx, { error: 'Please agree to the ticket terms to continue.', status: 422 }),
    };
  const runtime = paymentsRuntime(live.db, live.env);
  const flush = deps.flush ?? (() => runtime.flush());
  const unavailable = () => ({
    kind: 'view' as const,
    view: reviewView(ctx, {
      notice: { tone: 'danger', text: PAID_MESSAGES.payments_unavailable },
      status: 503,
    }),
  });

  await releasePendingCheckout(live, ctx.state.pendingToken, now);
  const routingFor =
    deps.routingFor ??
    (async (quote: Quote) => {
      const organizationId = organizationIdOf(quote);
      if (!organizationId) return null;
      const resolved = await runtime.routingForOrganization(organizationId);
      return resolved.available ? resolved.routing : null;
    });
  const routing = await routingFor(ctx.quote);
  if (!routing && ctx.quote.priced.totalCents > 0) return unavailable();

  let result;
  try {
    result = await startOnlineCheckout(live.db, live.env, {
      input: ctx.input,
      routing: routing ?? NO_CARD_ROUTING,
      origin: input.origin,
      eventTitle: ctx.event.title,
      ipHash: input.ipHash ?? null,
      now,
    });
  } catch (error) {
    if (isPaymentsUnavailable(error)) return unavailable();
    if (!(error instanceof PaidError)) throw error;
    if (error.code === 'stripe_error')
      return {
        kind: 'view',
        view: reviewView(ctx, { notice: { tone: 'danger', text: PAID_MESSAGES.stripe_error }, status: 502 }),
      };
    if (error.code === 'rate_limited')
      return {
        kind: 'view',
        view: reviewView(ctx, { notice: { tone: 'danger', text: PAID_MESSAGES.rate_limited }, status: 429 }),
      };
    if (error.code === 'invalid' && ['name', 'email', 'attendee_names', 'gift'].includes(error.detail ?? ''))
      return {
        kind: 'redirect',
        location: `/events/${encodeURIComponent(ctx.event.slug)}/tickets/details`,
        flash: 'checkout-details',
      };
    return {
      kind: 'redirect',
      location: `/events/${encodeURIComponent(ctx.event.slug)}/tickets`,
      flash: backToTicketsKey(error),
    };
  }

  if (result.kind === 'free') {
    clearCheckoutState(input.cookies);
    const url = `${input.origin.replace(/\/+$/, '')}/orders/${result.orderToken}`;
    const email = await freeOrderEmail(live.db, result.orderId, url);
    if (email) {
      try {
        await (deps.sendEmail ?? sendLiveEmail)(live.env, email);
      } catch (error) {
        if (!(error instanceof EmailUnavailableError)) console.warn('[live:checkout] email_failed');
      }
    }
    return { kind: 'redirect', location: `/orders/${result.orderToken}?new=1` };
  }
  writeCheckoutState(
    input.cookies,
    { ...ctx.state, pendingToken: await orderTokenFor(live.db, live.env, result.orderId) },
    input.secure,
  );
  await flush();
  return { kind: 'redirect', location: result.url };
}

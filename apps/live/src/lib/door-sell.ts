/**
 * Sell mode of the door screen (docs/LIVE_REQUIREMENTS.md §8.3 items 22–25, docs/LIVE_PAYMENTS.md §7): the ticket
 * selection kept in the address (`sel=<type id>:<quantity>,…`), the server's door quote, and one handler per way to
 * pay (cash, buyer's phone, card reader, comp), the cash drawer, door refunds and emailing the tickets after a sale.
 * Every price comes from the server; the only amounts read from a form are the cash received, the float and the cash
 * counted. Pages call `runDoorAction` (door-actions.ts), which calls these.
 */
import {
  PaidError,
  closeCashSession,
  doorCardRefund,
  doorCashRefund,
  doorSaleStatus,
  doorTicketsEmail,
  findOpenCashSession,
  liveOrderUrl,
  loadOrderTickets,
  loadPaidOrder,
  openCashSession,
  orderReceipt,
  orderTokenFor,
  planOrder,
  reviewLines,
  sellComp,
  sellForCash,
  sendLiveEmail,
  simulateReaderTap,
  startPhoneSale,
  startReaderSale,
  cancelWaitingSale,
  formatCents,
  parseDollarsToCents,
  type LiveEmail,
  type PaidEnv,
  type PaymentMethod,
  type PaymentRouting,
  type PaymentsRuntime,
  type ReserveOrderLine,
  type SqlDatabase,
} from '@gamo/domain';
import { isPlausibleEmail, normalizeEmail } from '@gamo/domain/security';
import type { DoorAccess } from './door-access';

/** What door actions need for one request. Tests pass a fake runtime and email sender. */
export interface DoorDeps {
  db: SqlDatabase;
  env: PaidEnv;
  runtime: Pick<
    PaymentsRuntime,
    'routingForOrganization' | 'routingForOrder' | 'gateway' | 'flush' | 'standin'
  >;
  /** This site's origin (`https://live.gamostudio.org`), for Checkout return links and order links. */
  origin: string;
  sendEmail?: (email: LiveEmail) => Promise<void>;
}

// ── Selection in the address ───────────────────────────────────────────────────────────────────────────────────

/** The most of one type a single door sale may hold (the server also applies the type's own limit). */
export const DOOR_MAX_PER_TYPE = 50;
const TYPE_ID = /^tty_[0-9a-z_]{1,60}$/;

export type Selection = Map<string, number>;

/** Reads `sel=<type id>:<quantity>,…`; unknown shapes are dropped, quantities are whole numbers 1–50. */
export function parseSelection(value: string | null | undefined): Selection {
  const out: Selection = new Map();
  for (const part of String(value ?? '')
    .split(',')
    .slice(0, 20)) {
    const [id, raw] = part.split(':');
    if (!id || !TYPE_ID.test(id) || !/^\d{1,2}$/.test(raw ?? '')) continue;
    const qty = Math.min(DOOR_MAX_PER_TYPE, Number(raw));
    if (qty > 0) out.set(id, qty);
  }
  return out;
}

export function serializeSelection(selection: Selection): string {
  return [...selection.entries()]
    .filter(([, q]) => q > 0)
    .map(([id, q]) => `${id}:${q}`)
    .join(',');
}

/** The selection with one type changed by `delta` (never below 0 or above 50). */
export function stepSelection(selection: Selection, typeId: string, delta: number): Selection {
  const next = new Map(selection);
  const qty = Math.max(0, Math.min(DOOR_MAX_PER_TYPE, (next.get(typeId) ?? 0) + delta));
  if (qty > 0) next.set(typeId, qty);
  else next.delete(typeId);
  return next;
}

export function selectionLines(selection: Selection): ReserveOrderLine[] {
  return [...selection.entries()].map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
}

// ── Door quote ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface DoorQuote {
  lines: Array<{ label: string; amount: string }>;
  totalCents: number;
  /** What a card or phone payment costs when it differs (the Gamo fee applies to card sales only). */
  cardTotalCents: number | null;
}

/** Prices a door sale exactly as the sale will (cash: no Gamo fee), without writing anything. */
export async function doorQuote(
  db: SqlDatabase,
  env: PaidEnv,
  access: DoorAccess,
  selection: Selection,
  now: number,
): Promise<DoorQuote> {
  const base = {
    eventId: access.occurrence.eventId,
    occurrenceId: access.occurrence.occurrenceId,
    channel: 'door' as const,
    lines: selectionLines(selection),
    now,
  };
  const cash = await planOrder(db, env, { ...base, paymentMethod: 'cash' }, { quoteOnly: true });
  let cardTotalCents: number | null = null;
  try {
    const card = await planOrder(db, env, { ...base, paymentMethod: 'phone_qr' }, { quoteOnly: true });
    if (card.priced.totalCents !== cash.priced.totalCents) cardTotalCents = card.priced.totalCents;
  } catch (error) {
    if (!(error instanceof PaidError)) throw error;
  }
  return {
    lines: reviewLines(cash.priced, '').map((l) => ({
      label: l.quantity ? `${l.label} × ${l.quantity}` : l.label,
      amount: formatCents(l.amountCents),
    })),
    totalCents: cash.priced.totalCents,
    cardTotalCents,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────────────────────

/** An optional email typed at the door: null when empty; throws `invalid.email` when it does not look right. */
export function optionalEmail(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const email = normalizeEmail(raw);
  if (email.length > 254 || !isPlausibleEmail(email)) throw new PaidError('invalid', { detail: 'email' });
  return email;
}

function amountOf(value: unknown, field: string): number {
  const cents = parseDollarsToCents(value);
  if (cents === null) throw new PaidError('invalid', { detail: field });
  return cents;
}

async function routingForOrganization(deps: DoorDeps, organizationId: string): Promise<PaymentRouting> {
  const resolved = await deps.runtime.routingForOrganization(organizationId);
  if (!resolved.available) throw new PaidError('payments_unavailable', { detail: resolved.reason });
  return resolved.routing;
}

async function routingForOrder(deps: DoorDeps, orderId: string): Promise<PaymentRouting> {
  const resolved = await deps.runtime.routingForOrder(orderId);
  if (!resolved.available) throw new PaidError('payments_unavailable', { detail: resolved.reason });
  return resolved.routing;
}

function requireSelection(selection: Selection): ReserveOrderLine[] {
  const lines = selectionLines(selection);
  if (lines.length === 0) throw new PaidError('invalid', { detail: 'lines' });
  return lines;
}

/** Sends the door tickets email for a paid door order of this door. Returns false when it could not be sent. */
export async function emailDoorTickets(
  deps: DoorDeps,
  access: DoorAccess,
  input: { orderId: string; to: string; now: number },
): Promise<boolean> {
  const status = await doorSaleStatus(deps.db, {
    orderId: input.orderId,
    actor: access.actor,
    now: input.now,
  });
  if (status.state !== 'paid') throw new PaidError('invalid', { detail: 'order_status' });
  const order = await loadPaidOrder(deps.db, input.orderId);
  if (!order) throw new PaidError('not_found');
  const token = await orderTokenFor(deps.db, deps.env, order.id);
  if (!token) return false;
  const orderUrl =
    liveOrderUrl(deps.env, token) ?? `${deps.origin.replace(/\/+$/, '')}/orders/${encodeURIComponent(token)}`;
  const receipt = await orderReceipt(deps.db, order);
  const tickets = await loadOrderTickets(deps.db, order.id);
  const email = doorTicketsEmail({
    to: input.to,
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
  });
  const send = deps.sendEmail ?? ((e: LiveEmail) => sendLiveEmail(deps.env, e));
  try {
    await send(email);
    return true;
  } catch {
    console.warn('[live:door] email_failed door_tickets');
    return false;
  }
}

// ── Sales ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SaleResult {
  orderId: string;
  /** Set when the tickets were (or could not be) emailed right away. */
  emailed: boolean | null;
}

/** Cash sale into the actor's open drawer; the people are admitted at once. */
export async function doorSellCash(
  deps: DoorDeps,
  access: DoorAccess,
  input: { selection: Selection; received: unknown; email: unknown; now: number },
): Promise<SaleResult> {
  const lines = requireSelection(input.selection);
  const receivedCents = amountOf(input.received, 'received');
  const email = optionalEmail(input.email);
  const sale = await sellForCash(deps.db, deps.env, {
    actor: access.actor,
    occurrenceId: access.occurrence.occurrenceId,
    lines,
    receivedCents,
    buyerEmail: email,
    now: input.now,
  });
  const emailed = sale.emailTicketsTo
    ? await emailDoorTickets(deps, access, { orderId: sale.orderId, to: sale.emailTicketsTo, now: input.now })
    : null;
  return { orderId: sale.orderId, emailed };
}

/** Free tickets with a reason (comp permission); the people are admitted at once. */
export async function doorSellComp(
  deps: DoorDeps,
  access: DoorAccess,
  input: { selection: Selection; reason: unknown; email: unknown; now: number },
): Promise<SaleResult> {
  const lines = requireSelection(input.selection);
  const reason = typeof input.reason === 'string' ? input.reason : '';
  if (!reason.trim()) throw new PaidError('invalid', { detail: 'comp_reason' });
  const email = optionalEmail(input.email);
  const sale = await sellComp(deps.db, deps.env, {
    actor: access.actor,
    occurrenceId: access.occurrence.occurrenceId,
    lines,
    reason,
    buyerEmail: email,
    now: input.now,
  });
  const emailed = sale.emailTicketsTo
    ? await emailDoorTickets(deps, access, { orderId: sale.orderId, to: sale.emailTicketsTo, now: input.now })
    : null;
  return { orderId: sale.orderId, emailed };
}

/**
 * Buyer's phone: a short-lived order and Checkout Session; the screen shows its URL as a QR and refreshes until the
 * webhook confirms. The tickets are emailed by the webhook when an email was given.
 */
export async function doorSellPhone(
  deps: DoorDeps,
  access: DoorAccess,
  input: { selection: Selection; email: unknown; eventSlug: string; now: number },
): Promise<SaleResult> {
  const lines = requireSelection(input.selection);
  const email = optionalEmail(input.email);
  const routing = await routingForOrganization(deps, access.actor.organizationId);
  const eventUrl = `${deps.origin.replace(/\/+$/, '')}/events/${encodeURIComponent(input.eventSlug)}`;
  try {
    const sale = await startPhoneSale(deps.db, deps.env, {
      actor: access.actor,
      occurrenceId: access.occurrence.occurrenceId,
      lines,
      buyerEmail: email,
      routing,
      successUrl: eventUrl,
      cancelUrl: eventUrl,
      now: input.now,
    });
    return { orderId: sale.orderId, emailed: null };
  } finally {
    await deps.runtime.flush();
  }
}

/** Card reader: a card-present payment sent to one of the organization's paired readers. */
export async function doorSellReader(
  deps: DoorDeps,
  access: DoorAccess,
  input: { selection: Selection; readerId: unknown; email: unknown; now: number },
): Promise<SaleResult> {
  const lines = requireSelection(input.selection);
  const readerId = typeof input.readerId === 'string' ? input.readerId : '';
  if (!readerId) throw new PaidError('reader_unavailable', { detail: 'not_found' });
  const email = optionalEmail(input.email);
  const routing = await routingForOrganization(deps, access.actor.organizationId);
  try {
    const sale = await startReaderSale(deps.db, deps.env, {
      actor: access.actor,
      occurrenceId: access.occurrence.occurrenceId,
      lines,
      buyerEmail: email,
      readerId,
      routing,
      now: input.now,
    });
    return { orderId: sale.orderId, emailed: null };
  } finally {
    await deps.runtime.flush();
  }
}

/** Cancels a phone or reader sale that is still waiting (the seats are freed). True when it was released. */
export async function doorCancelSale(
  deps: DoorDeps,
  access: DoorAccess,
  input: { orderId: string; now: number },
): Promise<boolean> {
  await doorSaleStatus(deps.db, { orderId: input.orderId, actor: access.actor, now: input.now });
  const routing = await routingForOrder(deps, input.orderId);
  try {
    const result = await cancelWaitingSale(deps.db, {
      orderId: input.orderId,
      actor: access.actor,
      routing,
      now: input.now,
    });
    return result.released;
  } finally {
    await deps.runtime.flush();
  }
}

/** Test mode and the stand-in: the reader "taps" a test card. */
export async function doorSimulateTap(
  deps: DoorDeps,
  access: DoorAccess,
  input: { orderId: string; now: number },
): Promise<void> {
  await doorSaleStatus(deps.db, { orderId: input.orderId, actor: access.actor, now: input.now });
  const routing = await routingForOrder(deps, input.orderId);
  try {
    await simulateReaderTap(deps.db, { orderId: input.orderId, actor: access.actor, routing });
  } finally {
    await deps.runtime.flush();
  }
}

// ── Refunds ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Refunds a whole door sale: cash from the actor's open drawer (with the reason, lowering the drawer's expected
 * amount), card and phone sales through Stripe on the order's own routing. Returns the flash key.
 */
export async function doorRefund(
  deps: DoorDeps,
  access: DoorAccess,
  input: { orderId: string; reason: unknown; now: number },
): Promise<string> {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) throw new PaidError('invalid', { detail: 'reason' });
  const status = await doorSaleStatus(deps.db, {
    orderId: input.orderId,
    actor: access.actor,
    now: input.now,
  });
  if (status.state !== 'paid') throw new PaidError('invalid', { detail: 'order_status' });
  if (status.method === 'cash') {
    const tickets = await loadOrderTickets(deps.db, input.orderId);
    const ticketIds = tickets.filter((t) => t.status === 'valid').map((t) => t.id);
    await doorCashRefund(deps.db, {
      actor: access.actor,
      orderId: input.orderId,
      ticketIds,
      reason,
      includeGift: true,
      now: input.now,
    });
    return 'door-ok-refunded';
  }
  if (status.method !== 'phone_qr' && status.method !== 'card_reader')
    throw new PaidError('invalid', { detail: 'not_card' });
  const routing = await routingForOrder(deps, input.orderId);
  try {
    const decision = await doorCardRefund(deps.db, deps.env, {
      actor: access.actor,
      orderId: input.orderId,
      ticketIds: 'all',
      includeGift: true,
      reason,
      routing,
      now: input.now,
    });
    return decision.status === 'succeeded' ? 'door-ok-refunded' : 'door-ok-refund-pending';
  } finally {
    await deps.runtime.flush();
  }
}

// ── Cash drawer ────────────────────────────────────────────────────────────────────────────────────────────────

export async function doorOpenDrawer(
  deps: DoorDeps,
  access: DoorAccess,
  input: { float: unknown; now: number },
): Promise<string> {
  const floatCents = amountOf(input.float, 'float');
  const session = await openCashSession(deps.db, {
    occurrenceId: access.occurrence.occurrenceId,
    actor: access.actor,
    floatCents,
    now: input.now,
  });
  return session.id;
}

/** Closes the actor's open drawer with the counted cash. Returns the closed drawer's id (its summary is shown). */
export async function doorCloseDrawer(
  deps: DoorDeps,
  access: DoorAccess,
  input: { counted: unknown; note: unknown; now: number },
): Promise<string> {
  const countedCents = amountOf(input.counted, 'counted');
  const open = await findOpenCashSession(deps.db, {
    occurrenceId: access.occurrence.occurrenceId,
    actor: access.actor,
  });
  if (!open) throw new PaidError('session_closed', { detail: 'no_open_session' });
  const closed = await closeCashSession(deps.db, {
    sessionId: open.id,
    actor: access.actor,
    countedCents,
    note: typeof input.note === 'string' ? input.note : null,
    now: input.now,
  });
  return closed.id;
}

/** Plain words for a payment method on the door screen. */
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  phone_qr: 'Buyer’s phone',
  card_reader: 'Card reader',
  comp: 'Comp',
  card_online: 'Online',
  free: 'Free',
};

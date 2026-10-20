/**
 * What the order page (`/orders/[token]`, docs/LIVE_SCREENS.md §I.2 P5) shows (docs/LIVE_REQUIREMENTS.md §8.2 items
 * 13, 15, 16, 18, 19): the receipt with every line (tickets, discount, Gamo fee when passed on, gift to the
 * organization, total, refunded), the seller (the organization in Mode A; "Gamo Studios on behalf of <organization>"
 * in Mode B), the policies that apply, one card per ticket with its QR credential (valid tickets only), and what the
 * buyer may do now (transfer a ticket, request a refund) with the reason when not. The same route serves a ticket
 * link (a transferred ticket's holder sees only that ticket). The page verifies the token through `orderLinkView`.
 */
import { allRows, type SqlDatabase } from '../security/sql-database.ts';
import type { PaidEnv, PolicySnapshot, TicketStatus } from './paid-types.ts';
import { sellerText, type ReceiptLine } from './paid-mail.ts';
import { buyerRefundOptions, listOrderRefunds, type BuyerRefundOptions } from './refunds.ts';
import {
  loadOrderTickets,
  loadPaidOrder,
  loadTicket,
  policyForOrder,
  refundDeadline,
  ticketCredential,
  transferDeadline,
  verifyOrderLink,
  type OrderTicket,
  type PaidOrder,
} from './tickets.ts';
import { ticketHasOpenRefund, transferOption, type TransferOption } from './transfers.ts';

export interface Receipt {
  lines: ReceiptLine[];
  totalCents: number;
  refundedCents: number;
  currency: string;
}

/** Receipt lines from the order's own copied prices (never re-read from the event). */
export async function orderReceipt(db: SqlDatabase, order: PaidOrder): Promise<Receipt> {
  const items = await allRows<{ name: string; unit_price_cents: number; quantity: number }>(db, {
    sql: 'SELECT name, unit_price_cents, quantity FROM order_items WHERE order_id = ?1 ORDER BY rowid',
    params: [order.id],
  });
  const lines: ReceiptLine[] = items.map((i) => ({
    label: `${i.name} × ${i.quantity}`,
    amountCents: Number(i.unit_price_cents) * Number(i.quantity),
  }));
  if (order.discountCents > 0) lines.push({ label: 'Discount', amountCents: -order.discountCents });
  if (order.feePayer === 'buyer' && order.feeCents > 0)
    lines.push({ label: 'Gamo service fee', amountCents: order.feeCents });
  if (order.giftCents > 0)
    lines.push({ label: `Gift to ${order.organizationName}`, amountCents: order.giftCents });
  return {
    lines,
    totalCents: order.totalCents,
    refundedCents: order.amountRefundedCents,
    currency: order.currency,
  };
}

export interface TicketCard {
  id: string;
  seq: number;
  typeName: string;
  people: number;
  holderName: string | null;
  status: TicketStatus;
  checkedInAt: number | null;
  /** Passed on to someone else: the buyer no longer sees its QR. */
  transferred: boolean;
  /** The QR payload; only for a valid ticket that the viewer holds. */
  credential: string | null;
  transfer: TransferOption;
}

export interface OrderEventInfo {
  id: string;
  title: string;
  slug: string;
  startsAt: number;
  endsAt: number | null;
  timezone: string;
  venueName: string | null;
  venueAddress: string | null;
  organizationName: string;
  canceled: boolean;
}

export type OrderPageState =
  /** Waiting for the payment webhook (the return page refreshes). */
  | 'pending'
  | 'active'
  /** Paid after its seats were lost: refunded in full, no tickets. */
  | 'unfulfilled'
  | 'refunded'
  /** Never paid (canceled, expired) or voided. */
  | 'closed';

export interface OrderPageView {
  state: OrderPageState;
  orderId: string;
  reference: string;
  buyerName: string | null;
  createdAt: number;
  paidAt: number | null;
  seller: string;
  event: OrderEventInfo;
  receipt: Receipt;
  policy: PolicySnapshot;
  refundDeadline: number | null;
  transferDeadline: number | null;
  tickets: TicketCard[];
  refund: BuyerRefundOptions;
  refunds: Array<{ id: string; amountCents: number; status: string; createdAt: number; note: string | null }>;
}

function eventInfo(order: PaidOrder): OrderEventInfo {
  return {
    id: order.eventId,
    title: order.eventTitle,
    slug: order.eventSlug,
    startsAt: order.startsAt,
    endsAt: order.endsAt,
    timezone: order.timezone,
    venueName: order.venueName,
    venueAddress: order.venueAddress,
    organizationName: order.organizationName,
    canceled: order.eventStatus === 'canceled' || order.occurrenceStatus === 'canceled',
  };
}

function stateOf(order: PaidOrder): OrderPageState {
  if (order.status === 'pending') return 'pending';
  if (order.status === 'paid_unfulfilled') return 'unfulfilled';
  if (order.status === 'refunded') return 'refunded';
  if (order.status === 'paid' || order.status === 'partially_refunded') return 'active';
  return 'closed';
}

async function ticketCard(
  db: SqlDatabase,
  env: PaidEnv,
  order: PaidOrder,
  t: OrderTicket,
  policy: PolicySnapshot,
  access: 'order' | 'ticket',
  now: number,
): Promise<TicketCard> {
  const transferred = access === 'order' && t.transferCount > 0;
  const showsQr =
    t.status === 'valid' &&
    !transferred &&
    (order.status === 'paid' || order.status === 'partially_refunded');
  return {
    id: t.id,
    seq: t.seq,
    typeName: t.typeName,
    people: t.people,
    holderName: t.holderName,
    status: t.status,
    checkedInAt: t.checkedInAt,
    transferred,
    credential: showsQr ? await ticketCredential(env, t) : null,
    transfer: transferOption(order, t, policy, access, await ticketHasOpenRefund(db, order.id, t.id), now),
  };
}

/** The buyer's order page. Null when the order does not exist. */
export async function orderPageView(
  db: SqlDatabase,
  env: PaidEnv,
  orderId: string,
  now: number,
): Promise<OrderPageView | null> {
  const order = await loadPaidOrder(db, orderId);
  if (!order) return null;
  const [tickets, policy, refunds, receipt] = await Promise.all([
    loadOrderTickets(db, order.id),
    policyForOrder(db, order),
    listOrderRefunds(db, order.id),
    orderReceipt(db, order),
  ]);
  const open = new Set(
    refunds.filter((r) => r.status === 'requested' || r.status === 'pending').flatMap((r) => r.ticketIds),
  );
  const cards: TicketCard[] = [];
  for (const t of tickets) cards.push(await ticketCard(db, env, order, t, policy, 'order', now));
  return {
    state: stateOf(order),
    orderId: order.id,
    reference: order.reference,
    buyerName: order.buyerName,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    seller: sellerText(order.seller, order.organizationName),
    event: eventInfo(order),
    receipt,
    policy,
    refundDeadline: refundDeadline(policy, order.startsAt),
    transferDeadline: transferDeadline(policy, order.startsAt),
    tickets: cards,
    refund: buyerRefundOptions(order, tickets, policy, open, now),
    refunds: refunds
      .filter((r) => r.requestedBy === 'buyer' || r.status === 'succeeded' || r.status === 'pending')
      .map((r) => ({
        id: r.id,
        amountCents: r.amountCents,
        status: r.status,
        createdAt: r.createdAt,
        note: r.decidedNote,
      })),
  };
}

export type TicketPageView =
  | {
      state: 'active';
      ticket: TicketCard;
      event: OrderEventInfo;
      seller: string;
      policy: PolicySnapshot;
      transferDeadline: number | null;
    }
  /** The ticket was passed on again or reissued: this link no longer shows it (no holder data). */
  | { state: 'replaced' };

/** A transferred ticket's holder's page. Null when the ticket does not exist. */
export async function ticketPageView(
  db: SqlDatabase,
  env: PaidEnv,
  ticketId: string,
  version: number,
  now: number,
): Promise<TicketPageView | null> {
  const ticket = await loadTicket(db, ticketId);
  if (!ticket) return null;
  if (ticket.credentialVersion !== version) return { state: 'replaced' };
  const order = await loadPaidOrder(db, ticket.orderId);
  if (!order) return null;
  const policy = await policyForOrder(db, order);
  return {
    state: 'active',
    ticket: await ticketCard(db, env, order, ticket, policy, 'ticket', now),
    event: eventInfo(order),
    seller: sellerText(order.seller, order.organizationName),
    policy,
    transferDeadline: transferDeadline(policy, order.startsAt),
  };
}

export type OrderLinkView =
  | { kind: 'order'; orderId: string; view: OrderPageView }
  | { kind: 'ticket'; ticketId: string; version: number; view: TicketPageView }
  /** Forged, altered, expired, or pointing at nothing: the page answers 410 and offers "find my tickets". */
  | { kind: 'invalid' };

/** The one call the `/orders/[token]` page makes. */
export async function orderLinkView(
  db: SqlDatabase,
  env: PaidEnv,
  token: string,
  now: number,
): Promise<OrderLinkView> {
  const link = await verifyOrderLink(env, token, now);
  if (!link) return { kind: 'invalid' };
  if (link.kind === 'order') {
    const view = await orderPageView(db, env, link.orderId, now);
    return view ? { kind: 'order', orderId: link.orderId, view } : { kind: 'invalid' };
  }
  const view = await ticketPageView(db, env, link.ticketId, link.version, now);
  return view
    ? { kind: 'ticket', ticketId: link.ticketId, version: link.version, view }
    : { kind: 'invalid' };
}

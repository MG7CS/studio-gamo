/**
 * Customer-facing order and ticket views (design §4.2 "Manage / recover"): what a customer session may
 * see, and the view models of the confirmation, manage and ticket pages.
 *
 * Access: a session belongs to one customer profile and carries a scope (`customer:all`, `order:<id>`,
 * `ticket:<id>`). A ticket is shown with its QR only to its current holder: after a transfer, the
 * purchaser's order link still lists it, but as "transferred to j•••@…" without a code.
 */
import { allRows, runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import { parseScope, scopeCovers } from '../../security/link-tokens.ts';
import type { CustomerSession } from '../customers.ts';
import { categoryBadge } from './render-model.ts';
import { formatEventDateTime } from './events-time.ts';
import { orderEmailStatus } from './email.ts';
import {
  accessLogStatement,
  isEventCancelled,
  loadEvent,
  loadOrder,
  loadOrderItems,
  loadOrderTickets,
  loadTicket,
  maskEmail,
  orderPolicy,
  type EventRow,
  type OrderRow,
  type TicketRow,
} from './orders-shared.ts';
import type { AccessAction } from '../../types/enums.ts';

/** A customer session plus its profile email (needed for pre-0013 RSVPs, which have no profile id). */
export interface CustomerIdentity extends CustomerSession {
  email: string;
}

export async function customerIdentity(
  db: SqlDatabase,
  session: CustomerSession | null,
): Promise<CustomerIdentity | null> {
  if (!session) return null;
  const row = (await db
    .prepare('SELECT email_normalized FROM customer_profiles WHERE id = ?1 AND erased_at IS NULL')
    .bind(session.customerProfileId)
    .first()) as { email_normalized: string } | null;
  return row ? { ...session, email: row.email_normalized } : null;
}

/** Legacy free RSVP (pre-0013): no profile id; visible to a `customer:all` session of the same email. */
function legacyMatch(identity: CustomerIdentity, profileId: string | null, email: string): boolean {
  return (
    profileId === null && identity.scope === 'customer:all' && email.trim().toLowerCase() === identity.email
  );
}

export function sessionCoversOrder(
  identity: CustomerIdentity | null,
  order: Pick<OrderRow, 'id' | 'customer_profile_id' | 'purchaser_email'>,
): boolean {
  if (!identity) return false;
  if (legacyMatch(identity, order.customer_profile_id, order.purchaser_email)) return true;
  return (
    order.customer_profile_id === identity.customerProfileId &&
    scopeCovers(identity.scope, { kind: 'order', id: order.id })
  );
}

/** May this session see this ticket's QR (and download/transfer it)? Only its current holder. */
export function sessionHoldsTicket(
  identity: CustomerIdentity | null,
  ticket: Pick<TicketRow, 'id' | 'order_id' | 'customer_profile_id' | 'holder_email'>,
): boolean {
  if (!identity) return false;
  if (legacyMatch(identity, ticket.customer_profile_id, ticket.holder_email)) return true;
  if (ticket.customer_profile_id !== identity.customerProfileId) return false;
  return scopeCovers(identity.scope, { kind: 'ticket', id: ticket.id, orderId: ticket.order_id });
}

export type TicketViewState = 'valid' | 'transferred_away' | 'voided' | 'refunded';

export interface TicketView {
  id: string;
  holderName: string;
  categoryName: string;
  categoryBadge: string | null;
  sectionName: string | null;
  gateLabel: string | null;
  state: TicketViewState;
  /** "transferred to j•••@example.org" for a ticket that left this customer. */
  transferredTo: string | null;
  canTransfer: boolean;
  transferBlockedReason: string | null;
  version: number;
}

export interface OrderView {
  order: OrderRow;
  event: EventRow;
  when: string;
  reference: string;
  /** Overall page state. */
  state:
    | 'pending_verification'
    | 'pending_payment'
    | 'issuing'
    | 'issued'
    | 'expired'
    | 'cancelled'
    | 'refunded'
    | 'unfulfillable'
    | 'disputed';
  tickets: TicketView[];
  lines: Array<{ name: string; quantity: number; unitPriceCents: number; subtotalCents: number }>;
  emailStatus: string | null;
  eventCancelled: boolean;
  /** Reschedule or venue change after this order: the buyer may cancel/refund their own tickets. */
  changeRefundOpen: boolean;
}

function transferCheck(
  ticket: TicketRow,
  order: OrderRow,
  event: EventRow,
  now: number,
  scannedToday: boolean,
): string | null {
  const policy = orderPolicy(order);
  if (ticket.status !== 'valid') return 'This ticket is no longer valid.';
  if (isEventCancelled(event)) return 'This event has been cancelled.';
  if (!policy.transferAllowed) return 'The organizer does not allow transfers for this event.';
  if (now >= Number(event.starts_at) - policy.transferCutoffHours * 3600)
    return policy.transferCutoffHours > 0
      ? `Transfers closed ${policy.transferCutoffHours} hours before the start.`
      : 'Transfers close when the event starts.';
  if (Number(ticket.transfer_count) >= policy.maxTransfersPerTicket)
    return `This ticket has already been transferred ${ticket.transfer_count} times (the most allowed).`;
  if (scannedToday) return 'This ticket was already scanned in today.';
  return null;
}

/** Order page view for a session that covers the order (throws nothing; null when not visible). */
export async function getOrderView(
  db: SqlDatabase,
  input: { orderId: string; session: CustomerIdentity | null; now: number },
): Promise<OrderView | null> {
  const order = await loadOrder(db, input.orderId);
  if (!order) return null;
  const tickets = await loadOrderTickets(db, order.id);
  const ownsOrder = sessionCoversOrder(input.session, order);
  const holdsAny = tickets.some((t) => sessionHoldsTicket(input.session, t));
  if (!ownsOrder && !holdsAny) return null;
  const event = await loadEvent(db, order.event_id);
  if (!event) return null;
  const [items, categories, sections, emailStatus, changes, presence] = await Promise.all([
    loadOrderItems(db, order.id),
    allRows<{ id: string; name: string; kind: string; max_age: number | null; seats_per_ticket: number }>(
      db,
      {
        sql: 'SELECT id, name, kind, max_age, seats_per_ticket FROM ticket_tiers WHERE event_id = ?1',
        params: [event.id],
      },
    ),
    allRows<{ id: string; name: string }>(db, {
      sql: 'SELECT id, name FROM venue_sections WHERE event_id = ?1',
      params: [event.id],
    }),
    orderEmailStatus(db, order.id),
    allRows<{ n: number }>(db, {
      sql: "SELECT count(*) AS n FROM event_changes WHERE event_id = ?1 AND kind IN ('rescheduled', 'venue_changed') AND created_at > ?2",
      params: [event.id, order.created_at],
    }),
    allRows<{ ticket_id: string; day_key: string; entry_count: number }>(db, {
      sql: 'SELECT p.ticket_id, p.day_key, p.entry_count FROM ticket_presence p JOIN tickets t ON t.id = p.ticket_id WHERE t.order_id = ?1',
      params: [order.id],
    }),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: event.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(input.now * 1000));
  const visible = tickets.filter((t) => ownsOrder || sessionHoldsTicket(input.session, t));
  const ticketViews: TicketView[] = visible.map((t) => {
    const c = categories.find((x) => x.id === t.tier_id);
    const mine = sessionHoldsTicket(input.session, t);
    const state: TicketViewState =
      t.status === 'refunded'
        ? 'refunded'
        : t.status === 'voided'
          ? 'voided'
          : mine
            ? 'valid'
            : 'transferred_away';
    const scannedToday = presence.some(
      (p) => p.ticket_id === t.id && p.day_key === today && Number(p.entry_count) > 0,
    );
    const blocked = mine
      ? transferCheck(t, order, event, input.now, scannedToday)
      : 'This ticket is held by someone else now.';
    return {
      id: t.id,
      holderName: t.holder_name,
      categoryName: c?.name ?? 'General admission',
      categoryBadge: c
        ? categoryBadge({ kind: c.kind, max_age: c.max_age, seats_per_ticket: Number(c.seats_per_ticket) })
        : null,
      sectionName: sections.find((s) => s.id === t.section_id)?.name ?? null,
      gateLabel: t.gate_label,
      state,
      transferredTo: state === 'transferred_away' ? maskEmail(t.holder_email) : null,
      canTransfer: mine && blocked === null,
      transferBlockedReason: mine ? blocked : null,
      version: Number(t.version),
    };
  });
  let state: OrderView['state'];
  switch (order.status) {
    case 'pending_verification':
      state = 'pending_verification';
      break;
    case 'pending_payment':
      state = 'pending_payment';
      break;
    case 'paid':
    case 'confirmed':
    case 'partially_refunded':
      state = tickets.length ? 'issued' : 'issuing';
      break;
    case 'refunded':
      state = 'refunded';
      break;
    case 'expired':
      state = 'expired';
      break;
    case 'paid_unfulfillable':
      state = 'unfulfillable';
      break;
    case 'disputed':
      state = 'disputed';
      break;
    default:
      state = 'cancelled';
  }
  return {
    order,
    event,
    when: formatEventDateTime(Number(event.starts_at), event.timezone),
    reference: order.order_reference ?? order.order_number,
    state,
    tickets: ticketViews,
    lines: items.map((i) => {
      const c = categories.find((x) => x.id === i.tier_id);
      const s = sections.find((x) => x.id === i.section_id);
      return {
        name: [c?.name ?? 'Ticket', s ? `Section ${s.name}` : null].filter(Boolean).join(' — '),
        quantity: Number(i.quantity),
        unitPriceCents: Number(i.unit_price_cents),
        subtotalCents: Number(i.subtotal_cents),
      };
    }),
    emailStatus: emailStatus?.status ?? null,
    eventCancelled: isEventCancelled(event),
    changeRefundOpen:
      ownsOrder &&
      Number(changes[0]?.n ?? 0) > 0 &&
      input.now < Number(event.starts_at) &&
      orderPolicy(order).refundPolicy !== 'none',
  };
}

export interface CustomerOrderSummary {
  orderId: string;
  reference: string;
  eventTitle: string;
  when: string;
  startsAt: number;
  status: string;
  ticketCount: number;
}

/** Orders visible to the session: bought by this customer, or holding a ticket transferred to them. */
export async function listCustomerOrders(
  db: SqlDatabase,
  session: CustomerIdentity,
): Promise<CustomerOrderSummary[]> {
  const scope = parseScope(session.scope);
  if (!scope) return [];
  const rows = await allRows<{
    id: string;
    reference: string | null;
    number: string;
    title: string;
    starts_at: number;
    timezone: string;
    status: string;
    tickets: number;
  }>(db, {
    sql: `SELECT o.id, o.order_reference AS reference, o.order_number AS number, e.title, e.starts_at, e.timezone, o.status,
            (SELECT count(*) FROM tickets t WHERE t.order_id = o.id AND (o.customer_profile_id = ?1 OR t.customer_profile_id = ?1 OR o.customer_profile_id IS NULL)) AS tickets
          FROM ticket_orders o JOIN events e ON e.id = o.event_id
          WHERE (o.customer_profile_id = ?1 OR EXISTS (SELECT 1 FROM tickets t WHERE t.order_id = o.id AND t.customer_profile_id = ?1)
                 OR (?2 = 1 AND o.customer_profile_id IS NULL AND lower(o.purchaser_email) = ?3))
            AND o.status NOT IN ('pending_payment', 'expired')
          ORDER BY e.starts_at DESC LIMIT 100`,
    params: [session.customerProfileId, session.scope === 'customer:all' ? 1 : 0, session.email],
  });
  const visible = rows.filter((r) => {
    if (scope.kind === 'customer') return true;
    if (scope.kind === 'order') return r.id === scope.id;
    return false;
  });
  if (scope.kind === 'ticket') {
    const t = await loadTicket(db, scope.id);
    if (t && t.customer_profile_id === session.customerProfileId) {
      const r = rows.find((x) => x.id === t.order_id);
      if (r) visible.push(r);
    }
  }
  return visible.map((r) => ({
    orderId: r.id,
    reference: r.reference ?? r.number,
    eventTitle: r.title,
    when: formatEventDateTime(Number(r.starts_at), r.timezone),
    startsAt: Number(r.starts_at),
    status: r.status,
    ticketCount: Number(r.tickets),
  }));
}

/** The tickets this session may download (current holder, valid or not). */
export async function downloadableTickets(
  db: SqlDatabase,
  input: { session: CustomerIdentity | null; ticketId?: string; orderId?: string },
): Promise<TicketRow[]> {
  if (!input.session) return [];
  if (input.ticketId) {
    const t = await loadTicket(db, input.ticketId);
    return t && sessionHoldsTicket(input.session, t) ? [t] : [];
  }
  if (input.orderId)
    return (await loadOrderTickets(db, input.orderId)).filter((t) => sessionHoldsTicket(input.session, t));
  return [];
}

/** Records views and downloads in `ticket_access_log`. */
export async function logTicketAccess(
  db: SqlDatabase,
  input: {
    tickets: Array<Pick<TicketRow, 'id' | 'order_id' | 'event_id'>>;
    action: AccessAction;
    actorId: string;
    ipHash?: string | null;
    now: number;
  },
): Promise<void> {
  if (!input.tickets.length) return;
  await runBatch(
    db,
    input.tickets.slice(0, 50).map((t) =>
      accessLogStatement({
        eventId: t.event_id,
        ticketId: t.id,
        orderId: t.order_id,
        actorType: 'customer',
        actorId: input.actorId,
        action: input.action,
        ipHash: input.ipHash,
        now: input.now,
      }),
    ),
  );
}

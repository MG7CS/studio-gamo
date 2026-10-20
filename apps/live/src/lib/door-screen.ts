/**
 * Everything the door screen draws for one request (docs/LIVE_SCREENS.md §I.3 O7, DESIGN.md "The door screen"), read
 * from the database for this actor and date: the mode (Check in / Sell), the live counts and door-day totals, the
 * check-in window, the sell card (ticket types with what the door can still sell, the selection in the address, the
 * server's quote, the payment choice), the cash drawer, the waiting or finished sale, and the recent door sales that
 * may be refunded. The page only renders this.
 */
import {
  DOOR_TOTAL_FILTERS,
  PaidError,
  availabilityFor,
  checkInWindow,
  doorFilterQuery,
  doorSaleStatus,
  doorSalesOpen,
  doorSummary,
  doorTotals,
  findOpenCashSession,
  formatCents,
  getCashSession,
  getOrganizerEvent,
  hasPermission,
  listCashMovements,
  listDoorTickets,
  listReaders,
  listTicketTypes,
  loadPaidOrder,
  mayUseCashSession,
  priceNow,
  qrSvg,
  type CashSession,
  type DoorSaleState,
  type DoorTotalKey,
  type PaymentMethod,
} from '@gamo/domain';
import type { DoorAccess } from './door-access';
import { checkInAvailable, doorCounts, type DoorCounts } from './door-checkin';
import { doorErrorMessage, isDoorError } from './door-messages';
import {
  METHOD_LABEL,
  doorQuote,
  parseSelection,
  serializeSelection,
  stepSelection,
  type DoorDeps,
  type DoorQuote,
  type Selection,
} from './door-sell';
import { whenLabel } from './organizer-format';

export type DoorMode = 'checkin' | 'sell';
export type PayChoice = 'cash' | 'phone' | 'reader' | 'comp';
const PAY_CHOICES: readonly PayChoice[] = ['cash', 'phone', 'reader', 'comp'];

/** How often a waiting sale's screen reloads itself (the `Refresh` response header). */
export const WAITING_REFRESH_SECONDS = 4;

export interface DoorTypeRow {
  id: string;
  name: string;
  price: string;
  /** What the door can still sell; null = no limit. */
  left: number | null;
  quantity: number;
  plusHref: string | null;
  minusHref: string | null;
}

export interface DoorSellView {
  /** Why selling is not possible here, or null. */
  closedReason: string | null;
  types: DoorTypeRow[];
  /** The selection as the hidden `sel` field of the payment forms. */
  sel: string;
  quote: DoorQuote | null;
  quoteError: string | null;
  pay: PayChoice | null;
  payHrefs: Record<PayChoice, string>;
  clearHref: string;
  canComp: boolean;
  cardAvailable: boolean;
  readers: Array<{ id: string; label: string }>;
  drawer: CashSession | null;
}

export interface DoorSaleView {
  orderId: string;
  reference: string;
  method: PaymentMethod;
  methodLabel: string;
  state: DoorSaleState;
  total: string;
  admitted: number;
  /** Cash sales: what the buyer handed over and the change due. */
  received: string | null;
  changeDue: string | null;
  /** Buyer's phone while waiting: the Checkout link as an inline SVG QR. */
  qr: string | null;
  qrUnavailable: boolean;
  reader: { label: string; status: string; failure: string | null } | null;
  canCancel: boolean;
  canSimulate: boolean;
}

export interface RecentDoorSale {
  orderId: string;
  reference: string;
  methodLabel: string;
  method: PaymentMethod;
  tickets: number;
  total: string;
}

export interface DoorTotalStat {
  key: DoorTotalKey;
  label: string;
  value: number;
  /** The list behind the number (organizers only). */
  href: string | null;
}

export interface DoorScreenView {
  mode: DoorMode;
  modeHrefs: { checkin: string | null; sell: string | null };
  eventTitle: string;
  eventSlug: string;
  dateLabel: string;
  paid: boolean;
  checkIn: {
    available: boolean;
    allowed: boolean;
    window: { title: string; description: string; canOpen: boolean; canClose: boolean };
  };
  counts: DoorCounts;
  countsHref: string | null;
  totals: DoorTotalStat[];
  sell: DoorSellView | null;
  sale: DoorSaleView | null;
  closedDrawer: CashSession | null;
  recentSales: RecentDoorSale[];
  testMode: { show: boolean; standin: boolean };
  /** Set the `Refresh` header to this while a sale is waiting. */
  refreshSeconds: number | null;
}

const TOTAL_LABELS: Record<DoorTotalKey, string> = {
  soldOnline: 'Sold online',
  doorCash: 'Door: cash',
  doorPhone: 'Door: buyer’s phone',
  doorReader: 'Door: card reader',
  doorComp: 'Door: comp',
  checkedIn: 'Checked in',
  toArrive: 'Still to arrive',
};

function hrefWith(base: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** The address of the sell card with this selection and payment choice. */
export function sellHref(base: string, sel: Selection | string, pay?: PayChoice | null): string {
  const s = typeof sel === 'string' ? sel : serializeSelection(sel);
  return hrefWith(base, { mode: 'sell', sel: s || null, pay: pay ?? null });
}

/** The list of tickets behind a door-day number (organizers only). */
export function doorListHref(occurrenceId: string, key: DoorTotalKey): string {
  return `/organizer/door/${encodeURIComponent(occurrenceId)}/list?${doorFilterQuery(DOOR_TOTAL_FILTERS[key])}`;
}

async function sellView(
  deps: DoorDeps,
  access: DoorAccess,
  params: URLSearchParams,
  now: number,
): Promise<DoorSellView> {
  const { db } = deps;
  const { occurrence, actor, basePath } = access;
  const orgId = actor.organizationId;
  const open =
    access.door.occurrenceStatus === 'scheduled' &&
    access.door.eventStatus === 'published' &&
    (await doorSalesOpen(db, occurrence.occurrenceId));
  const [types, availability] = await Promise.all([
    listTicketTypes(db, orgId, occurrence.eventId),
    availabilityFor(db, occurrence.eventId, occurrence.occurrenceId, now),
  ]);
  const sellable = types.filter((t) => t.status !== 'ended');
  const leftById = new Map(availability.map((a) => [a.ticketTypeId, a.door]));
  const wanted = parseSelection(params.get('sel'));
  const selection: Selection = new Map();
  for (const t of sellable) {
    const left = leftById.get(t.id) ?? 0;
    const q = Math.min(wanted.get(t.id) ?? 0, t.perOrderLimit, left ?? Number.POSITIVE_INFINITY);
    if (q > 0) selection.set(t.id, q);
  }
  const pay = PAY_CHOICES.find((p) => p === params.get('pay')) ?? null;
  const rows: DoorTypeRow[] = sellable.map((t) => {
    const qty = selection.get(t.id) ?? 0;
    const left = leftById.get(t.id) ?? 0;
    const max = Math.min(t.perOrderLimit, left ?? Number.POSITIVE_INFINITY);
    return {
      id: t.id,
      name: t.name,
      price: formatCents(priceNow(t, now)),
      left,
      quantity: qty,
      plusHref: open && qty < max ? sellHref(basePath, stepSelection(selection, t.id, 1), pay) : null,
      minusHref: open && qty > 0 ? sellHref(basePath, stepSelection(selection, t.id, -1), pay) : null,
    };
  });
  let quote: DoorQuote | null = null;
  let quoteError: string | null = null;
  if (open && selection.size > 0) {
    try {
      quote = await doorQuote(db, deps.env, access, selection, now);
    } catch (error) {
      if (!isDoorError(error)) throw error;
      quoteError = doorErrorMessage(error);
    }
  }
  const resolved = open ? await deps.runtime.routingForOrganization(orgId) : null;
  const cardAvailable = !!resolved?.available;
  const readers =
    cardAvailable && resolved?.available
      ? (await listReaders(db, { organizationId: orgId, eventId: occurrence.eventId }))
          .filter((r) => r.status === 'online' && r.stripeAccountId === resolved.routing.chargeAccountId)
          .map((r) => ({ id: r.id, label: r.label }))
      : [];
  const drawer = await findOpenCashSession(db, { occurrenceId: occurrence.occurrenceId, actor });
  const sel = serializeSelection(selection);
  return {
    closedReason: open
      ? null
      : access.door.occurrenceStatus !== 'scheduled'
        ? 'This date was canceled, so nothing can be sold.'
        : 'Door sales are switched off for this event. An organizer can turn them on in the event’s settings.',
    types: rows,
    sel,
    quote,
    quoteError,
    pay,
    payHrefs: {
      cash: sellHref(basePath, sel, 'cash'),
      phone: sellHref(basePath, sel, 'phone'),
      reader: sellHref(basePath, sel, 'reader'),
      comp: sellHref(basePath, sel, 'comp'),
    },
    clearHref: sellHref(basePath, ''),
    canComp: hasPermission(actor, 'comp'),
    cardAvailable,
    readers,
    drawer,
  };
}

async function saleView(
  deps: DoorDeps,
  access: DoorAccess,
  orderId: string,
  now: number,
): Promise<DoorSaleView | null> {
  let status;
  try {
    status = await doorSaleStatus(deps.db, { orderId, actor: access.actor, now });
  } catch (error) {
    if (error instanceof PaidError) return null;
    throw error;
  }
  let received: string | null = null;
  let changeDue: string | null = null;
  if (status.method === 'cash') {
    const order = await loadPaidOrder(deps.db, orderId);
    const drawer = await findOpenCashSession(deps.db, {
      occurrenceId: order?.occurrenceId ?? access.occurrence.occurrenceId,
      actor: access.actor,
    });
    const row = drawer
      ? (await listCashMovements(deps.db, drawer.id)).find((m) => m.orderId === orderId && m.kind === 'sale')
      : undefined;
    if (row?.receivedCents != null) received = formatCents(row.receivedCents);
    if (row?.changeCents != null) changeDue = formatCents(row.changeCents);
  }
  const waiting = status.state === 'pending';
  let qr: string | null = null;
  let qrUnavailable = false;
  let livemode = true;
  if (waiting && (status.method === 'phone_qr' || status.method === 'card_reader')) {
    const resolved = await deps.runtime.routingForOrder(orderId);
    if (resolved.available) {
      livemode = resolved.routing.gateway.livemode;
      if (status.method === 'phone_qr') {
        const order = await loadPaidOrder(deps.db, orderId);
        try {
          const session = order?.checkoutSessionId
            ? await resolved.routing.gateway.retrieveCheckoutSession(order.checkoutSessionId, {
                account: order.stripeAccountId,
              })
            : null;
          // Stripe gives a full address; the local stand-in gives a path on this site, which a phone could not open.
          if (session?.url && session.status === 'open') qr = qrSvg(new URL(session.url, deps.origin).href);
          else qrUnavailable = true;
        } catch {
          qrUnavailable = true;
        }
      }
    } else qrUnavailable = status.method === 'phone_qr';
  }
  const canSell = hasPermission(access.actor, 'sell');
  return {
    orderId: status.orderId,
    reference: status.reference,
    method: status.method,
    methodLabel: METHOD_LABEL[status.method],
    state: status.state,
    total: formatCents(status.totalCents),
    admitted: status.admittedCount,
    received,
    changeDue,
    qr,
    qrUnavailable,
    reader: status.reader
      ? { label: status.reader.label, status: status.reader.actionStatus, failure: status.reader.failure }
      : null,
    canCancel: waiting && canSell && (status.method === 'phone_qr' || status.method === 'card_reader'),
    canSimulate: waiting && canSell && status.method === 'card_reader' && !livemode,
  };
}

async function recentSales(deps: DoorDeps, access: DoorAccess, now: number): Promise<RecentDoorSale[]> {
  const tickets = await listDoorTickets(deps.db, {
    organizationId: access.actor.organizationId,
    occurrenceId: access.occurrence.occurrenceId,
    filter: { channel: 'door' },
  });
  const byOrder = new Map<string, { reference: string; method: PaymentMethod; count: number }>();
  for (const t of tickets) {
    if (t.method === 'comp' || t.method === 'free') continue;
    const row = byOrder.get(t.orderId) ?? { reference: t.reference, method: t.method, count: 0 };
    row.count += 1;
    byOrder.set(t.orderId, row);
  }
  const out: RecentDoorSale[] = [];
  for (const [orderId, row] of [...byOrder.entries()].slice(0, 8)) {
    const status = await doorSaleStatus(deps.db, { orderId, actor: access.actor, now });
    if (status.state !== 'paid') continue;
    out.push({
      orderId,
      reference: row.reference,
      method: row.method,
      methodLabel: METHOD_LABEL[row.method],
      tickets: row.count,
      total: formatCents(status.totalCents),
    });
  }
  return out;
}

async function closedDrawerView(
  deps: DoorDeps,
  access: DoorAccess,
  id: string | null,
): Promise<CashSession | null> {
  if (!id) return null;
  const session = await getCashSession(deps.db, id);
  if (!session || session.status !== 'closed' || session.occurrenceId !== access.occurrence.occurrenceId)
    return null;
  return mayUseCashSession(access.actor, session, access.actor.organizationId) ? session : null;
}

/** Loads the door screen for this actor, date and address. */
export async function loadDoorScreen(
  deps: DoorDeps,
  access: DoorAccess,
  input: { params: URLSearchParams; now: number },
): Promise<DoorScreenView> {
  const { db } = deps;
  const { occurrence, actor, basePath, door } = access;
  const now = input.now;
  const paid = door.admission === 'paid_tickets';
  const allowedCheckIn = hasPermission(actor, 'check_in');
  const allowedSell = paid && hasPermission(actor, 'sell');
  const wanted = input.params.get('mode');
  const mode: DoorMode =
    (wanted === 'sell' && allowedSell) || (!allowedCheckIn && allowedSell) ? 'sell' : 'checkin';

  const event = await getOrganizerEvent(db, actor.organizationId, occurrence.eventId, now);
  const windowText = doorSummary(
    checkInWindow(occurrence, now),
    occurrence.opensHours,
    (at) => whenLabel(at, occurrence.timezone),
    now,
  );
  const counts = await doorCounts(db, access);
  const totals: DoorTotalStat[] = [];
  if (paid) {
    const t = await doorTotals(db, {
      organizationId: actor.organizationId,
      occurrenceId: occurrence.occurrenceId,
    });
    for (const key of Object.keys(TOTAL_LABELS) as DoorTotalKey[])
      totals.push({
        key,
        label: TOTAL_LABELS[key],
        value: t[key],
        href: access.organizer ? doorListHref(occurrence.occurrenceId, key) : null,
      });
  }
  const saleId = input.params.get('sale');
  const sale = mode === 'sell' && saleId ? await saleView(deps, access, saleId, now) : null;
  const sell = mode === 'sell' ? await sellView(deps, access, input.params, now) : null;
  const gateway = mode === 'sell' ? deps.runtime.gateway() : null;
  return {
    mode,
    modeHrefs: {
      checkin: allowedCheckIn ? hrefWith(basePath, { mode: 'checkin' }) : null,
      sell: allowedSell ? hrefWith(basePath, { mode: 'sell' }) : null,
    },
    eventTitle: occurrence.eventTitle,
    eventSlug: event?.slug ?? '',
    dateLabel: whenLabel(occurrence.startsAt, occurrence.timezone),
    paid,
    checkIn: { available: checkInAvailable(access), allowed: allowedCheckIn, window: windowText },
    counts,
    countsHref: access.organizer
      ? paid
        ? doorListHref(occurrence.occurrenceId, 'checkedIn')
        : `/organizer/events/${encodeURIComponent(occurrence.eventId)}/registrations`
      : null,
    totals,
    sell,
    sale,
    closedDrawer: mode === 'sell' ? await closedDrawerView(deps, access, input.params.get('drawer')) : null,
    recentSales: mode === 'sell' && allowedSell ? await recentSales(deps, access, now) : [],
    testMode: { show: !!gateway && !gateway.livemode, standin: deps.runtime.standin },
    refreshSeconds: sale?.state === 'pending' ? WAITING_REFRESH_SECONDS : null,
  };
}

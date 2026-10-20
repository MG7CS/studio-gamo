/**
 * The Orders tab of a paid event (docs/LIVE_SCREENS.md §I.3 O3, O4; docs/LIVE_REQUIREMENTS.md §8.4 item 27): the list
 * with its search and filters (every chip count equals the list it opens), one order's detail (lines, tickets,
 * payments, refunds and requests, transfer history) and what an organizer does with it (refund the whole order or
 * chosen tickets, approve or decline a request, resend the confirmation). Refunds go through `@gamo/domain`'s refunds
 * functions with the order's own payment routing; nothing here decides an amount.
 */
import {
  ORDER_CHANNELS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PaidError,
  SecretNotConfiguredError,
  StripeApiError,
  approveRefund,
  declineRefund,
  doorTicketsEmail,
  getOrderDetail,
  listEventOrders,
  listOrderRefunds,
  loadOrderTickets,
  loadPaidOrder,
  orderConfirmationEmail,
  orderCounts,
  orderReceipt,
  orderTokenFor,
  ordersCsv,
  paymentsRuntime,
  refundDirect,
  refundDeclinedEmail,
  refundIssuedEmail,
  refundableAmount,
  sendLiveEmail,
  ticketRefundShare,
  type OrderChannel,
  type OrderCounts,
  type OrderDetail,
  type OrderListFilter,
  type OrderStatus,
  type OrganizerOrderRow,
  type PaidEnv,
  type PaidOrder,
  type PaymentMethod,
  type RefundRow,
  type SqlDatabase,
  type TicketType,
} from '@gamo/domain';

// ── Words ────────────────────────────────────────────────────────────────────────────────────────────────────────

export const ORDER_STATUS_LABELS: Record<
  OrderStatus,
  { label: string; tone: 'success' | 'info' | 'warning' | 'neutral' | 'danger' }
> = {
  pending: { label: 'Waiting for payment', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  paid_unfulfilled: { label: 'Paid, not issued (refunding)', tone: 'danger' },
  canceled: { label: 'Canceled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'info' },
  partially_refunded: { label: 'Partly refunded', tone: 'info' },
  voided: { label: 'Voided', tone: 'neutral' },
};

export const CHANNEL_LABELS: Record<OrderChannel, string> = { online: 'Online', door: 'At the door' };

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  card_online: 'Card online',
  phone_qr: 'Buyer’s phone',
  card_reader: 'Card reader',
  cash: 'Cash',
  comp: 'Comp',
  free: 'Free',
};

// ── The list ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface OrdersQuery {
  q: string;
  status: OrderStatus | null;
  ticketTypeId: string | null;
  channel: OrderChannel | null;
  method: PaymentMethod | null;
  /** Only orders with a refund request waiting for a decision. */
  refundRequested?: boolean;
}

/** Reads the list's filters from the address; unknown values are dropped. */
export function parseOrdersQuery(params: URLSearchParams, typeIds: readonly string[]): OrdersQuery {
  const pick = <T extends string>(name: string, allowed: readonly T[]) => {
    const v = params.get(name);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  };
  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    status: pick('status', ORDER_STATUSES),
    ticketTypeId: pick('type', typeIds),
    channel: pick('channel', ORDER_CHANNELS),
    method: pick('method', PAYMENT_METHODS),
    refundRequested: params.get('refund') === 'requested',
  };
}

export const filterOf = (q: OrdersQuery): OrderListFilter => ({
  q: q.q || null,
  status: q.status,
  ticketTypeId: q.ticketTypeId,
  channel: q.channel,
  method: q.method,
  refundRequested: q.refundRequested === true,
});

/** The address of the list with `change` applied to the current filters. */
export function ordersHref(
  eventId: string,
  q: OrdersQuery,
  change: Partial<Record<Exclude<keyof OrdersQuery, 'refundRequested'>, string | null>> & {
    refundRequested?: boolean;
  },
) {
  const next = { ...q, ...change };
  const p = new URLSearchParams();
  if (next.q) p.set('q', next.q);
  if (next.status) p.set('status', next.status);
  if (next.ticketTypeId) p.set('type', next.ticketTypeId);
  if (next.channel) p.set('channel', next.channel);
  if (next.method) p.set('method', next.method);
  if (next.refundRequested) p.set('refund', 'requested');
  const query = p.toString();
  return `/organizer/events/${encodeURIComponent(eventId)}/orders${query ? `?${query}` : ''}`;
}

export interface ChipGroup {
  label: string;
  items: Array<{ label: string; href: string; active: boolean; count?: number }>;
}

const sum = (counts: Partial<Record<string, number>>) =>
  Object.values(counts).reduce((a: number, n) => a + (n ?? 0), 0);

/**
 * The filter rows of the toolbar. Each chip's count is the length of the list it opens (the current filters with that
 * one value); "All" in a row that partitions the orders (status, channel, method) is the sum of the row. Values with no
 * orders are not offered unless chosen.
 */
export function orderChipGroups(
  eventId: string,
  q: OrdersQuery,
  counts: OrderCounts,
  types: ReadonlyArray<Pick<TicketType, 'id' | 'name'>>,
): ChipGroup[] {
  const row = <K extends 'status' | 'channel' | 'method'>(
    label: string,
    key: K,
    values: readonly string[],
    labels: Record<string, string>,
    byValue: Partial<Record<string, number>>,
  ): ChipGroup => ({
    label,
    items: [
      {
        label: 'All',
        href: ordersHref(eventId, q, { [key]: null }),
        active: q[key] == null,
        count: sum(byValue),
      },
      ...values
        .filter((v) => (byValue[v] ?? 0) > 0 || q[key] === v)
        .map((v) => ({
          label: labels[v],
          href: ordersHref(eventId, q, { [key]: v }),
          active: q[key] === v,
          count: byValue[v] ?? 0,
        })),
    ],
  });
  const statusLabels = Object.fromEntries(ORDER_STATUSES.map((s) => [s, ORDER_STATUS_LABELS[s].label]));
  const groups = [
    row('Status', 'status', ORDER_STATUSES, statusLabels, counts.byStatus),
    {
      label: 'Ticket type',
      items: [
        {
          label: 'All types',
          href: ordersHref(eventId, q, { ticketTypeId: null }),
          active: q.ticketTypeId == null,
        },
        ...types
          .filter((t) => (counts.byTicketType[t.id] ?? 0) > 0 || q.ticketTypeId === t.id)
          .map((t) => ({
            label: t.name,
            href: ordersHref(eventId, q, { ticketTypeId: t.id }),
            active: q.ticketTypeId === t.id,
            count: counts.byTicketType[t.id] ?? 0,
          })),
      ],
    },
    row('Channel', 'channel', ORDER_CHANNELS, CHANNEL_LABELS, counts.byChannel),
    row('Payment', 'method', PAYMENT_METHODS, METHOD_LABELS, counts.byMethod),
  ];
  // A row with only "All" says nothing.
  return groups.filter((g) => g.items.length > 1);
}

export interface OrdersSummaryCard {
  label: string;
  value: number;
  href: string;
  opens: string;
}

/** The summary cards above the list (no filters): each number equals the list its link opens. */
export function ordersSummary(eventId: string, all: OrderCounts): OrdersSummaryCard[] {
  const none: OrdersQuery = { q: '', status: null, ticketTypeId: null, channel: null, method: null };
  return [
    { label: 'Orders', value: sum(all.byStatus), href: ordersHref(eventId, none, {}), opens: 'every order' },
    {
      label: 'Paid',
      value: all.byStatus.paid ?? 0,
      href: ordersHref(eventId, none, { status: 'paid' }),
      opens: 'the paid orders',
    },
    {
      label: 'Refunded',
      value: all.byStatus.refunded ?? 0,
      href: ordersHref(eventId, none, { status: 'refunded' }),
      opens: 'the refunded orders',
    },
    {
      label: 'Refund requests',
      value: all.refundRequested,
      href: ordersHref(eventId, none, { refundRequested: true }),
      opens: 'the orders with a refund request to decide',
    },
    {
      label: 'Sold at the door',
      value: all.byChannel.door ?? 0,
      href: ordersHref(eventId, none, { channel: 'door' }),
      opens: 'the orders sold at the door',
    },
  ];
}

export interface OrdersPageView {
  query: OrdersQuery;
  rows: OrganizerOrderRow[];
  groups: ChipGroup[];
  summary: OrdersSummaryCard[];
  filtered: boolean;
  csvHref: string;
}

export async function ordersPageView(
  db: SqlDatabase,
  input: {
    organizationId: string;
    eventId: string;
    types: ReadonlyArray<Pick<TicketType, 'id' | 'name'>>;
    params: URLSearchParams;
  },
): Promise<OrdersPageView> {
  const query = parseOrdersQuery(
    input.params,
    input.types.map((t) => t.id),
  );
  const filter = filterOf(query);
  const [rows, counts, all] = await Promise.all([
    listEventOrders(db, input.organizationId, input.eventId, filter),
    orderCounts(db, input.organizationId, input.eventId, filter),
    orderCounts(db, input.organizationId, input.eventId),
  ]);
  const listHref = ordersHref(input.eventId, query, {});
  const search = listHref.includes('?') ? listHref.slice(listHref.indexOf('?')) : '';
  return {
    query,
    rows,
    groups: orderChipGroups(input.eventId, query, counts, input.types),
    summary: ordersSummary(input.eventId, all),
    filtered: Boolean(query.q || query.status || query.ticketTypeId || query.channel || query.method),
    csvHref: `/organizer/events/${encodeURIComponent(input.eventId)}/orders.csv${search}`,
  };
}

/** The CSV download of the filtered list: private, never cached, an attachment. */
export async function ordersCsvResponse(
  db: SqlDatabase,
  input: {
    organizationId: string;
    eventId: string;
    slug: string;
    timeZone: string;
    types: ReadonlyArray<Pick<TicketType, 'id'>>;
    params: URLSearchParams;
  },
): Promise<Response> {
  const query = parseOrdersQuery(
    input.params,
    input.types.map((t) => t.id),
  );
  const rows = await listEventOrders(db, input.organizationId, input.eventId, filterOf(query));
  const name = input.slug.replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'event';
  return new Response(ordersCsv(rows, input.timeZone), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="orders-${name}.csv"`,
      'cache-control': 'private, no-store',
    },
  });
}

// ── One order ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface OrderDetailView {
  detail: OrderDetail;
  order: PaidOrder;
  /** Every line of what the buyer paid, formatted later by the page. */
  receipt: Awaited<ReturnType<typeof orderReceipt>>;
  /** Requests from the buyer waiting for a decision. */
  requests: RefundRow[];
  /** What refunding everything still refundable gives back (cents), and the tickets it covers. */
  whole: { amountCents: number; ticketIds: string[] };
  /** Tickets that can be refunded one by one, with what each gives back. */
  refundableTickets: Array<{ id: string; label: string; amountCents: number }>;
  typeNames: Record<string, string>;
  /** A cash order is refunded at the door's cash drawer, not here. */
  cash: boolean;
}

/** One order of this organization's event, with what may be refunded now. Null when it is not theirs. */
export async function orderDetailView(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; orderId: string },
): Promise<OrderDetailView | null> {
  const detail = await getOrderDetail(db, input.organizationId, input.orderId);
  if (!detail || detail.order.eventId !== input.eventId) return null;
  const order = await loadPaidOrder(db, input.orderId);
  if (!order) return null;
  const [receipt, tickets, refunds] = await Promise.all([
    orderReceipt(db, order),
    loadOrderTickets(db, order.id),
    listOrderRefunds(db, order.id),
  ]);
  const state = {
    refundedCents: order.amountRefundedCents,
    inFlightCents: refunds.filter((r) => r.status === 'pending').reduce((a, r) => a + r.amountCents, 0),
    giftOutCents: refunds
      .filter((r) => r.status === 'pending' || r.status === 'succeeded')
      .reduce((a, r) => a + r.giftCents, 0),
  };
  const open = new Set(
    refunds.filter((r) => r.status === 'requested' || r.status === 'pending').flatMap((r) => r.ticketIds),
  );
  const refundable = tickets.filter((t) => t.status === 'valid' && t.checkedInAt == null && !open.has(t.id));
  const ids = refundable.map((t) => t.id);
  const whole = refundableAmount(order, tickets, ids, true, state);
  const refundableOrder =
    ['paid', 'partially_refunded'].includes(order.status) && !order.disputed && !order.isPreview;
  return {
    detail,
    order,
    receipt,
    requests: refunds.filter((r) => r.status === 'requested'),
    whole: refundableOrder
      ? { amountCents: whole.amountCents, ticketIds: ids }
      : { amountCents: 0, ticketIds: [] },
    refundableTickets: refundableOrder
      ? refundable.map((t) => ({
          id: t.id,
          label: `${t.typeName} · ticket ${t.seq}${t.holderName ? ` · ${t.holderName}` : ''}`,
          amountCents: ticketRefundShare(t, order.feePayer).amountCents,
        }))
      : [],
    typeNames: Object.fromEntries(tickets.map((t) => [t.ticketTypeId, t.typeName])),
    cash: order.paymentMethod === 'cash',
  };
}

// ── Emails ───────────────────────────────────────────────────────────────────────────────────────────────────────

const mailEvent = (o: PaidOrder) => ({
  title: o.eventTitle,
  startsAt: o.startsAt,
  timezone: o.timezone,
  venueName: o.venueName,
  venueAddress: o.venueAddress,
  organizationName: o.organizationName,
});

async function orderUrl(
  db: SqlDatabase,
  env: PaidEnv,
  orderId: string,
  origin: string,
): Promise<string | null> {
  const token = await orderTokenFor(db, env, orderId);
  return token ? `${origin.replace(/\/+$/, '')}/orders/${encodeURIComponent(token)}` : null;
}

/**
 * Emails the buyer their confirmation again (the order page link, every receipt line, the seller). Returns false when
 * there is no email address or the email could not be sent; the order itself never changes.
 */
export async function sendOrderConfirmation(
  db: SqlDatabase,
  env: PaidEnv,
  input: { organizationId: string; orderId: string; origin: string },
): Promise<boolean> {
  const order = await loadPaidOrder(db, input.orderId);
  if (!order || order.organizationId !== input.organizationId || !order.buyerEmail) return false;
  const url = await orderUrl(db, env, order.id, input.origin);
  if (!url) return false;
  const [receipt, tickets] = await Promise.all([orderReceipt(db, order), loadOrderTickets(db, order.id)]);
  const common = {
    to: order.buyerEmail,
    name: order.buyerName,
    event: mailEvent(order),
    reference: order.reference,
    seller: order.seller,
    lines: receipt.lines,
    totalCents: order.totalCents,
    ticketCount: tickets.filter((t) => t.status === 'valid').length,
    orderUrl: url,
  };
  try {
    await sendLiveEmail(
      env as never,
      order.channel === 'door'
        ? doorTicketsEmail(common)
        : orderConfirmationEmail({ ...common, entryNotes: order.policySnapshot?.entryNotes ?? null }),
    );
    return true;
  } catch {
    return false;
  }
}

async function tryEmail(env: PaidEnv, email: Parameters<typeof sendLiveEmail>[1] | null): Promise<boolean> {
  if (!email) return false;
  try {
    await sendLiveEmail(env as never, email);
    return true;
  } catch {
    return false;
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────────

export const ORDER_FLASH: Record<string, string> = {
  refunded: 'Refund issued. The buyer was emailed and the refunded tickets no longer work.',
  'refunded-not-emailed': 'Refund issued, but the email to the buyer could not be sent.',
  'refund-pending': 'Refund sent to the payment processor. It shows here as done once it is confirmed.',
  'refund-no-money': 'The tickets are canceled. Nothing was charged for them, so no money goes back.',
  approved: 'Request approved and refunded. The buyer was emailed.',
  'approved-not-emailed': 'Request approved and refunded, but the email to the buyer could not be sent.',
  'approved-pending':
    'Request approved. The refund shows here as done once the payment processor confirms it.',
  declined: 'Request declined. The buyer was emailed and their tickets still work.',
  'declined-not-emailed': 'Request declined, but the email to the buyer could not be sent.',
  resent: 'Confirmation sent to the buyer again.',
};

export type OrderActionResult = { kind: 'done'; flash: string } | { kind: 'error'; notice: string };

const ORDER_ERRORS: Record<string, string> = {
  payments_unavailable:
    'Card refunds are unavailable right now because payments are not set up here. Nothing was refunded.',
  stripe_error:
    'The payment processor did not accept the refund. Nothing was refunded; please try again later.',
  already_done: 'That was already done. The page shows the current state.',
  stale: 'Something changed at the same time. Please look again and retry.',
  forbidden: 'That is not possible for this order.',
  not_found: 'That is not part of this order any more.',
};

const INVALID_DETAILS: Record<string, string> = {
  cash_refund_at_door:
    'This order was paid in cash, so it is refunded in person at the door: open the door screen’s cash drawer, where the refund reduces what the drawer should hold.',
  order_status: 'This order cannot be refunded in its current state.',
  disputed:
    'The buyer opened a dispute with their bank, so the payment processor settles it; a refund is not possible.',
  ticketIds: 'Choose at least one ticket that can still be refunded.',
};

export function orderErrorText(error: PaidError): string {
  if (error.code === 'invalid') return INVALID_DETAILS[error.detail ?? ''] ?? 'Please check what you chose.';
  return ORDER_ERRORS[error.code] ?? 'That could not be done. Please try again.';
}

/** Refund, approve, decline or resend on one order. Touching Stripe ends with `flush()` before the redirect. */
export async function runOrderAction(input: {
  db: SqlDatabase;
  env: PaidEnv;
  organizationId: string;
  orderId: string;
  form: FormData;
  origin: string;
  now: number;
}): Promise<OrderActionResult> {
  const { db, env, organizationId, orderId, form, now } = input;
  const action = String(form.get('action') ?? '');
  const actor = { kind: 'organizer' as const, organizationId };
  const runtime = paymentsRuntime(db, env);
  try {
    if (action === 'resend') {
      const sent = await sendOrderConfirmation(db, env, { organizationId, orderId, origin: input.origin });
      return sent
        ? { kind: 'done', flash: 'resent' }
        : {
            kind: 'error',
            notice: 'The confirmation could not be sent (no email address, or email is unavailable).',
          };
    }
    if (action === 'refund' || action === 'approve') {
      const resolved = await runtime.routingForOrder(orderId);
      const routing = resolved.available ? resolved.routing : null;
      const decision =
        action === 'approve'
          ? await approveRefund(db, env, {
              refundId: String(form.get('refund') ?? ''),
              actor,
              routing,
              note: String(form.get('note') ?? ''),
              now,
            })
          : await refundDirect(db, env, {
              orderId,
              ticketIds: form.get('scope') === 'chosen' ? form.getAll('ticket').map(String) : 'all',
              includeGift: form.get('scope') !== 'chosen' || form.get('gift') === 'yes',
              actor,
              reason: String(form.get('reason') ?? ''),
              routing,
              now,
            });
      if (decision.order.organizationId !== organizationId) throw new PaidError('forbidden');
      await runtime.flush();
      const approve = action === 'approve';
      const prefix = approve ? 'approved' : 'refunded';
      if (decision.amountCents === 0)
        return { kind: 'done', flash: approve ? 'approved' : 'refund-no-money' };
      if (decision.status !== 'succeeded')
        return { kind: 'done', flash: approve ? 'approved-pending' : 'refund-pending' };
      const order = decision.order;
      const tickets = (await loadOrderTickets(db, order.id)).filter((t) => t.status === 'refunded').length;
      const emailed = await tryEmail(
        env,
        order.buyerEmail
          ? refundIssuedEmail({
              to: order.buyerEmail,
              name: order.buyerName,
              event: mailEvent(order),
              reference: order.reference,
              amountCents: decision.amountCents,
              ticketCount: tickets,
              orderUrl: await orderUrl(db, env, order.id, input.origin),
            })
          : null,
      );
      return { kind: 'done', flash: emailed ? prefix : `${prefix}-not-emailed` };
    }
    if (action === 'decline') {
      const note = String(form.get('note') ?? '').trim();
      const decision = await declineRefund(db, {
        refundId: String(form.get('refund') ?? ''),
        actor,
        note,
        now,
      });
      const order = decision.order;
      const emailed = await tryEmail(
        env,
        order.buyerEmail
          ? refundDeclinedEmail({
              to: order.buyerEmail,
              name: order.buyerName,
              event: mailEvent(order),
              reference: order.reference,
              note: note || null,
              orderUrl: await orderUrl(db, env, order.id, input.origin),
            })
          : null,
      );
      return { kind: 'done', flash: emailed ? 'declined' : 'declined-not-emailed' };
    }
    return { kind: 'error', notice: 'That could not be done. Please try again.' };
  } catch (error) {
    await runtime.flush().catch(() => {});
    if (error instanceof PaidError) return { kind: 'error', notice: orderErrorText(error) };
    if (error instanceof SecretNotConfiguredError || error instanceof StripeApiError)
      return { kind: 'error', notice: ORDER_ERRORS.payments_unavailable };
    throw error;
  }
}

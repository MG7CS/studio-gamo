/**
 * The admin's Payments tab for Gamo Live (docs/LIVE_SCREENS.md C6 and C7, docs/LIVE_REQUIREMENTS.md §8 item 36):
 * orders across organizations, refund requests where Gamo is the seller (Mode B), open disputes, organizations whose
 * payments are not ready, Mode B balances and payouts, and one order's detail with a refund for orders Gamo sold.
 *
 * Every number is the length of the list it opens. Refunds use the order's own routing
 * (`paymentsRuntime(db, env).routingForOrder`) and `flush()` before redirecting. A payout is sent only through the
 * confirm step (`confirm=yes`), only in Stripe test mode, and the domain refuses live mode on its own.
 */
import { requireSameOrigin } from '@gamo/auth';
import type { GamoEnv } from '@gamo/config/env';
import {
  ORDER_STATUSES,
  PaidError,
  approveAndSendPayout,
  approveRefund,
  cancelPayout,
  declineRefund,
  getOrderDetail,
  listGamoRefundRequests,
  listOpenDisputes,
  listOrderRefunds,
  listPayouts,
  loadPaidOrder,
  loadRefund,
  modeBBalances,
  orderReceipt,
  orderTokenFor,
  organizationsWithPaymentsNotReady,
  parseDollarsToCents,
  payoutAvailability,
  paymentsRuntime,
  preparePayout,
  refundDirect,
  refundDeclinedEmail,
  refundIssuedEmail,
  sendLiveEmail,
  type AdminDisputeRow,
  type AdminRefundRequestRow,
  type ModeBBalance,
  type OrderDetail,
  type OrderStatus,
  type PaidEnv,
  type PaidOrder,
  type PaymentsNotReadyRow,
  type PayoutAvailability,
  type PayoutRow,
  type Receipt,
  searchAdminOrders,
  ADMIN_ORDER_LIMIT,
  type AdminOrderFilter,
  type AdminOrderRow,
  type SqlDatabase,
} from '@gamo/domain';
import { asSqlDatabase } from '@gamo/domain/security';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

export type PaymentsOutcome = { ok: true; location: string } | { ok: false; status: number; message: string };

const fail = (status: number, message: string): PaymentsOutcome => ({ ok: false, status, message });
const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};
const nowSeconds = () => Math.floor(Date.now() / 1000);
const paidEnv = (env: GamoEnv) => env as unknown as PaidEnv;

// ── Tabs ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const PAYMENTS_TABS = [
  { key: 'orders', label: 'Orders' },
  { key: 'refunds', label: 'Refund requests' },
  { key: 'disputes', label: 'Disputes' },
  { key: 'not_ready', label: 'Not ready' },
  { key: 'balances', label: 'Balances and payouts' },
] as const;

export type PaymentsTab = (typeof PAYMENTS_TABS)[number]['key'];

export function paymentsTabFrom(url: URL): PaymentsTab {
  const tab = url.searchParams.get('tab');
  return PAYMENTS_TABS.some((t) => t.key === tab) ? (tab as PaymentsTab) : 'orders';
}

// ── Orders across organizations ──────────────────────────────────────────────────────────────────────────────

/** The order filters of the Orders tab; each is a plain GET parameter. */

export { searchAdminOrders, ADMIN_ORDER_LIMIT, type AdminOrderFilter, type AdminOrderRow };

export const ORDER_STATUS_FILTERS: Array<{ value: AdminOrderFilter['status']; label: string }> = [
  { value: null, label: 'All' },
  { value: 'paid', label: 'Paid' },
  { value: 'partially_refunded', label: 'Partly refunded' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'pending', label: 'Waiting for payment' },
  { value: 'canceled', label: 'Canceled' },
];

export const SELLER_FILTERS: Array<{ value: AdminOrderFilter['seller']; label: string }> = [
  { value: null, label: 'Every seller' },
  { value: 'gamo', label: 'Gamo sold (Mode B)' },
  { value: 'organization', label: 'Organization sold (Mode A)' },
];

export function orderFilterFrom(url: URL): AdminOrderFilter {
  const status = url.searchParams.get('status');
  const seller = url.searchParams.get('seller');
  return {
    q: (url.searchParams.get('q') ?? '').trim().slice(0, 100),
    status:
      status === 'disputed' || (ORDER_STATUSES as readonly string[]).includes(status ?? '')
        ? (status as AdminOrderFilter['status'])
        : null,
    seller: seller === 'gamo' || seller === 'organization' ? seller : null,
  };
}

/** The Orders tab's URL for a filter (search, status and seller kept together). */
export function ordersHref(filter: Partial<AdminOrderFilter>): string {
  const q = new URLSearchParams({ tab: 'orders' });
  if (filter.q) q.set('q', filter.q);
  if (filter.status) q.set('status', filter.status);
  if (filter.seller) q.set('seller', filter.seller);
  return `/payments?${q}`;
}

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  paid_unfulfilled: 'Paid, not fulfilled (refund on its way)',
  canceled: 'Canceled',
  expired: 'Expired',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
  voided: 'Voided',
};

export const METHOD_TEXT: Record<string, string> = {
  card_online: 'Card online',
  phone_qr: 'Buyer’s phone at the door',
  card_reader: 'Card reader',
  cash: 'Cash',
  comp: 'Comp',
  free: 'Free',
};

// ── The tab page ─────────────────────────────────────────────────────────────────────────────────────────────

export interface BalanceRow extends ModeBBalance {
  availability: PayoutAvailability;
}

export interface PaymentsView {
  refunds: AdminRefundRequestRow[];
  disputes: AdminDisputeRow[];
  notReady: PaymentsNotReadyRow[];
  balances: BalanceRow[];
  payouts: Array<PayoutRow & { organizationName: string }>;
  /** Only read on the Orders tab. */
  orders: AdminOrderRow[] | null;
}

/** The sub-tab chips' counts: each is the length of the list it opens (orders are a search, not a queue). */
export function paymentsTabCounts(view: PaymentsView): Record<PaymentsTab, number | null> {
  return {
    orders: null,
    refunds: view.refunds.length,
    disputes: view.disputes.length,
    not_ready: view.notReady.length,
    balances: view.balances.length,
  };
}

/** Every list of the Payments tab (their lengths are the chips' counts); null when Live's database cannot be read. */
export async function loadPaymentsView(
  env: GamoEnv,
  input: { tab: PaymentsTab; filter: AdminOrderFilter },
  now = nowSeconds(),
): Promise<PaymentsView | null> {
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const [refunds, disputes, notReady, balances, payouts, orders] = await Promise.all([
      listGamoRefundRequests(db),
      listOpenDisputes(db),
      organizationsWithPaymentsNotReady(db, paidEnv(env)),
      modeBBalances(db),
      listPayouts(db),
      input.tab === 'orders' ? searchAdminOrders(db, input.filter) : Promise.resolve(null),
    ]);
    const withAvailability: BalanceRow[] = [];
    for (const b of balances)
      withAvailability.push({
        ...b,
        availability: await payoutAvailability(db, { organizationId: b.organizationId, now }),
      });
    const names = new Map(balances.map((b) => [b.organizationId, b.name]));
    return {
      refunds,
      disputes,
      notReady,
      balances: withAvailability,
      payouts: payouts.map((p) => ({
        ...p,
        organizationName: names.get(p.organizationId) ?? p.organizationId,
      })),
      orders,
    };
  } catch (error) {
    console.error(`[admin] payments unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

// ── Messages ─────────────────────────────────────────────────────────────────────────────────────────────────

const PAYMENTS_DONE: Record<string, string> = {
  refund_approved: 'Refund approved. The money goes back to the buyer’s card.',
  refund_pending: 'Refund approved and sent to Stripe. It shows as done once Stripe confirms.',
  refund_declined: 'Refund request declined. The buyer’s tickets still work.',
  refunded: 'Refund issued. The money goes back to the buyer’s card.',
  refund_sent: 'Refund sent to Stripe. It shows as done once Stripe confirms.',
  payout_prepared: 'Payout prepared. Nothing is sent until you send it.',
  payout_canceled: 'Payout canceled. Nothing was sent.',
  payout_sent: 'Payout sent in Stripe test mode.',
};

export function paymentsOutcomeFrom(url: URL): string | null {
  const done = url.searchParams.get('done');
  if (!done || !Object.hasOwn(PAYMENTS_DONE, done)) return null;
  const buyer = url.searchParams.get('buyer');
  const extra =
    buyer === 'yes'
      ? ' The buyer was emailed.'
      : buyer === 'no'
        ? ' The buyer was not emailed (email is unavailable right now); tell them directly.'
        : '';
  return `${PAYMENTS_DONE[done]}${extra}`;
}

const NOT_CONFIGURED = 'Payments are not configured here, so nothing was sent to Stripe.';

export function paymentsFailure(error: unknown): PaymentsOutcome {
  if (error instanceof PaidError) {
    switch (error.code) {
      case 'payments_unavailable':
        return fail(503, NOT_CONFIGURED);
      case 'not_found':
        return fail(404, 'That no longer exists.');
      case 'already_done':
        return fail(409, 'That was already decided or refunded. Reload to see the latest.');
      case 'stale':
        return fail(409, 'Someone else changed this first. Reload to see where it stands.');
      case 'account_not_ready':
        return fail(409, 'The organization’s payout account cannot receive transfers yet. Nothing was sent.');
      case 'limit_exceeded':
        return fail(
          409,
          error.detail === 'nothing_available'
            ? 'Nothing is available to pay out yet: money is paid out only for events whose dates have all passed.'
            : 'That is more than is available to pay out now.',
        );
      case 'forbidden':
        if (error.detail === 'live_mode')
          return fail(
            403,
            'Payouts run only in Stripe test mode until the owner approves production. Nothing was sent.',
          );
        if (error.detail === 'not_gamo_seller')
          return fail(
            403,
            'The organization sold this order (Mode A), so only the organization can refund it.',
          );
        return fail(403, 'That is not allowed.');
      case 'stripe_error':
        return fail(
          502,
          error.detail === 'retry'
            ? 'Stripe could not be reached. Nothing is lost; try again in a moment.'
            : 'Stripe refused it. Nothing more was sent; check the Stripe dashboard.',
        );
      case 'invalid': {
        const words: Record<string, string> = {
          reason: 'Add a reason (at most 500 characters). It is kept with the decision.',
          amount: 'Enter the payout amount in dollars, or leave it empty to pay out everything available.',
          order_status: 'This order cannot be refunded in its current state.',
          disputed: 'This order is disputed. It cannot be refunded while the dispute is open.',
          cash_refund_at_door: 'Cash orders are refunded at the door, not here.',
          ticketIds: 'Choose the tickets to refund.',
          note: 'The note is too long (at most 500 characters).',
        };
        return fail(
          400,
          words[error.detail ?? ''] ?? 'Something in the form was not valid. Check it and try again.',
        );
      }
      default:
        break;
    }
  }
  console.error(`[admin] payments action failed: ${error instanceof Error ? error.name : 'unknown'}`);
  return fail(500, 'Something went wrong. Try again in a moment.');
}

// ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────

async function readForm(request: Request): Promise<FormData | PaymentsOutcome> {
  try {
    requireSameOrigin(request);
  } catch {
    return fail(403, 'That request came from another site and was refused.');
  }
  return request.formData();
}

/** Emails the buyer that a refund is on its way. `none` when the order has no email. */
/** Tells the buyer Gamo Studios (the seller in Mode B) declined their refund request, with Gamo's note. */
export async function emailRefundDeclined(
  db: SqlDatabase,
  env: GamoEnv,
  order: PaidOrder,
  note: string | null,
): Promise<'yes' | 'no' | 'none'> {
  if (!order.buyerEmail) return 'none';
  let orderUrl: string | null = null;
  try {
    const token = await orderTokenFor(db, paidEnv(env), order.id);
    orderUrl = token ? siteUrl('live', `/orders/${encodeURIComponent(token)}`) : null;
  } catch {
    // No ticket secret here: the email goes without the order link.
  }
  try {
    await sendLiveEmail(
      env,
      refundDeclinedEmail({
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
        note,
        orderUrl,
        decidedBy: 'gamo',
      }),
    );
    return 'yes';
  } catch {
    console.error('[admin] refund email not sent: email_unavailable');
    return 'no';
  }
}

export async function emailRefundIssued(
  db: SqlDatabase,
  env: GamoEnv,
  order: PaidOrder,
  refund: { amountCents: number; ticketCount: number },
): Promise<'yes' | 'no' | 'none'> {
  if (!order.buyerEmail) return 'none';
  let orderUrl: string | null = null;
  try {
    const token = await orderTokenFor(db, paidEnv(env), order.id);
    orderUrl = token ? siteUrl('live', `/orders/${encodeURIComponent(token)}`) : null;
  } catch {
    // No ticket secret here: the email goes without the order link.
  }
  try {
    await sendLiveEmail(
      env,
      refundIssuedEmail({
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
        amountCents: refund.amountCents,
        ticketCount: refund.ticketCount,
        orderUrl,
      }),
    );
    return 'yes';
  } catch {
    console.error('[admin] refund email not sent: email_unavailable');
    return 'no';
  }
}

/**
 * POST /payments: approve or decline a refund request (Gamo is the seller), prepare or cancel a payout, or send one
 * (only with `confirm=yes` from the confirm step; test mode only).
 */
export async function handlePaymentsForm(request: Request, env: GamoEnv): Promise<PaymentsOutcome> {
  const form = await readForm(request);
  if (!(form instanceof FormData)) return form;
  const action = text(form, 'action');
  const note = text(form, 'notes').trim() || null;
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const now = nowSeconds();
    if (action === 'approve_refund' || action === 'decline_refund') {
      const refund = await loadRefund(db, text(form, 'refund_id'));
      if (!refund) return fail(404, 'That refund request no longer exists.');
      if (action === 'decline_refund') {
        await declineRefund(db, { refundId: refund.id, actor: { kind: 'admin' }, note, now });
        const order = await loadPaidOrder(db, refund.orderId);
        const buyer = order ? await emailRefundDeclined(db, env, order, note) : 'none';
        return { ok: true, location: `/payments?tab=refunds&done=refund_declined&buyer=${buyer}` };
      }
      const runtime = paymentsRuntime(db, paidEnv(env));
      const route = await runtime.routingForOrder(refund.orderId);
      const result = await approveRefund(db, paidEnv(env), {
        refundId: refund.id,
        actor: { kind: 'admin' },
        routing: route.available ? route.routing : null,
        note,
        now,
      });
      await runtime.flush();
      const buyer =
        result.status === 'failed'
          ? 'none'
          : await emailRefundIssued(db, env, result.order, {
              amountCents: result.amountCents,
              ticketCount: refund.ticketIds.length,
            });
      const done = result.status === 'succeeded' ? 'refund_approved' : 'refund_pending';
      return { ok: true, location: `/payments?tab=refunds&done=${done}&buyer=${buyer}` };
    }
    if (action === 'prepare_payout') {
      const raw = text(form, 'amount').trim();
      const amountCents = raw ? parseDollarsToCents(raw) : undefined;
      if (amountCents === null)
        return fail(
          400,
          'Enter the payout amount in dollars, or leave it empty to pay out everything available.',
        );
      await preparePayout(db, {
        organizationId: text(form, 'organization_id'),
        amountCents,
        reason: text(form, 'reason'),
        now,
      });
      return { ok: true, location: '/payments?tab=balances&done=payout_prepared' };
    }
    if (action === 'cancel_payout') {
      await cancelPayout(db, { payoutId: text(form, 'payout_id'), reason: text(form, 'reason'), now });
      return { ok: true, location: '/payments?tab=balances&done=payout_canceled' };
    }
    if (action === 'send_payout') {
      // The confirm step is the owner's approval; without it nothing is sent.
      if (text(form, 'confirm') !== 'yes')
        return fail(400, 'Open “Send payout…” and confirm to send it. Nothing was sent.');
      const runtime = paymentsRuntime(db, paidEnv(env));
      const gateway = runtime.gateway();
      if (!gateway) return fail(503, NOT_CONFIGURED);
      await approveAndSendPayout(db, paidEnv(env), {
        payoutId: text(form, 'payout_id'),
        ownerApproved: true,
        now,
        gateway,
      });
      await runtime.flush();
      return { ok: true, location: '/payments?tab=balances&done=payout_sent' };
    }
    return fail(400, 'The form was incomplete. Reload and try again.');
  } catch (error) {
    return paymentsFailure(error);
  }
}

// ── One order ────────────────────────────────────────────────────────────────────────────────────────────────

export interface AdminOrderView {
  order: PaidOrder;
  detail: OrderDetail;
  receipt: Receipt;
  /** Gamo sold it (Mode B) and it can be refunded now. */
  canRefund: boolean;
  /** Why not, in plain words, when Gamo cannot refund it. */
  refundNote: string | null;
  /** Tickets that can be refunded (valid, not checked in, not in an open refund). */
  refundableTickets: Array<{ id: string; label: string }>;
}

/** C7: one order across organizations; null when it does not exist (or is a preview). */
export async function loadAdminOrder(db: SqlDatabase, orderId: string): Promise<AdminOrderView | null> {
  const order = await loadPaidOrder(db, orderId);
  if (!order || order.isPreview) return null;
  const [detail, receipt, refunds] = await Promise.all([
    getOrderDetail(db, order.organizationId, order.id),
    orderReceipt(db, order),
    listOrderRefunds(db, order.id),
  ]);
  if (!detail) return null;
  const open = new Set(
    refunds.filter((r) => r.status === 'requested' || r.status === 'pending').flatMap((r) => r.ticketIds),
  );
  const names = new Map(detail.items.map((i) => [i.ticketTypeId, i.name]));
  const refundableTickets = detail.tickets
    .filter((t) => t.status === 'valid' && t.checkedInAt == null && !open.has(t.id))
    .map((t) => ({
      id: t.id,
      label: `${names.get(t.ticketTypeId) ?? 'Ticket'} ${t.seq}${t.holderName ? ` · ${t.holderName}` : ''}`,
    }));
  let refundNote: string | null = null;
  if (order.seller !== 'gamo')
    refundNote = 'The organization sold this order (Mode A), so only the organization can refund it.';
  else if (order.disputed)
    refundNote = 'This order is disputed. It cannot be refunded while the dispute is open.';
  else if (order.paymentMethod === 'cash') refundNote = 'Cash orders are refunded at the door.';
  else if (order.status !== 'paid' && order.status !== 'partially_refunded')
    refundNote = 'This order cannot be refunded in its current state.';
  else if (refundableTickets.length === 0 && order.giftCents === 0)
    refundNote = 'Every ticket is already refunded, checked in or in an open refund.';
  return { order, detail, receipt, canRefund: refundNote === null, refundNote, refundableTickets };
}

/** The order page's read: `not_found` for an unknown or preview order, null when the database cannot be read. */
export async function loadAdminOrderPage(
  env: Pick<GamoEnv, 'LIVE_DB'>,
  orderId: string,
): Promise<AdminOrderView | 'not_found' | null> {
  try {
    return (await loadAdminOrder(asSqlDatabase(env.LIVE_DB), orderId)) ?? 'not_found';
  } catch (error) {
    console.error(`[admin] order unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

/** POST /payments/orders/<id>: Gamo refunds an order it sold (whole order or chosen tickets, gift optional). */
export async function handleAdminOrderForm(
  request: Request,
  env: GamoEnv,
  orderId: string,
): Promise<PaymentsOutcome> {
  const form = await readForm(request);
  if (!(form instanceof FormData)) return form;
  if (text(form, 'action') !== 'refund') return fail(400, 'The form was incomplete. Reload and try again.');
  const chosen = form.getAll('ticket_id').filter((v): v is string => typeof v === 'string' && v !== '');
  const whole = text(form, 'scope') === 'all';
  try {
    const db = asSqlDatabase(env.LIVE_DB);
    const runtime = paymentsRuntime(db, paidEnv(env));
    const route = await runtime.routingForOrder(orderId);
    const result = await refundDirect(db, paidEnv(env), {
      orderId,
      ticketIds: whole ? 'all' : chosen,
      includeGift: whole || text(form, 'include_gift') === 'yes',
      actor: { kind: 'admin' },
      reason: text(form, 'reason').trim() || null,
      routing: route.available ? route.routing : null,
      now: nowSeconds(),
    });
    await runtime.flush();
    const refund = await loadRefund(db, result.refundId);
    const buyer =
      result.status === 'failed'
        ? 'none'
        : await emailRefundIssued(db, env, result.order, {
            amountCents: result.amountCents,
            ticketCount: refund?.ticketIds.length ?? 0,
          });
    const done = result.status === 'succeeded' ? 'refunded' : 'refund_sent';
    return {
      ok: true,
      location: `/payments/orders/${encodeURIComponent(orderId)}?done=${done}&buyer=${buyer}`,
    };
  } catch (error) {
    return paymentsFailure(error);
  }
}

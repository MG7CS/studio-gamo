/**
 * After checkout (docs/LIVE_SCREENS.md §I.2 P4–P7, docs/LIVE_REQUIREMENTS.md §8.2 items 13–16, 18): the return page
 * while the payment is confirmed, the order page reached by its signed link (receipt, seller, policies, one card per
 * ticket with its QR, calendar file, maps), the ticket page of a transferred ticket's holder (same route), passing a
 * ticket on, asking for a refund, and "find my tickets". The pages call one function each; the rules are in
 * `@gamo/domain` (order-links.ts, transfers.ts, refunds.ts, find-tickets.ts). Links that are forged answer 404; links
 * that were valid and ran out answer 410 with a way to get a fresh one.
 */
import {
  EmailUnavailableError,
  PaidError,
  buildEventIcs,
  findMyTickets,
  formatCents,
  listOrderRefunds,
  loadOrderTickets,
  loadPaidOrder,
  mapsSearchUrl,
  orderLinkView,
  organizationOwners,
  qrSvg,
  refundRequestedEmail,
  refundableAmount,
  requestRefund,
  requesterHash,
  sendLiveEmail,
  ticketRefundShare,
  transferTicket,
  verifyOrderLink,
  whenLabel,
  type LiveEmail,
  type OrderEventInfo,
  type OrderPageView,
  type PaidEnv,
  type RefundBlockReason,
  type TicketCard,
  type TicketPageView,
  type TransferBlockReason,
} from '@gamo/domain';
import { isPlausibleEmail, normalizeEmail } from '@gamo/domain/security';
import {
  PAID_MESSAGES,
  clearCheckoutState,
  policyWords,
  type CookieJar,
  type Message,
  type MoneyLine,
} from './checkout';
import type { LiveContext } from './registration';

type SendEmail = (env: PaidEnv, email: LiveEmail) => Promise<void>;

/** Sends without undoing anything: false when the email could not go out (the page says so). */
async function trySend(send: SendEmail | undefined, env: PaidEnv, email: LiveEmail): Promise<boolean> {
  try {
    await (send ?? sendLiveEmail)(env, email);
    return true;
  } catch (error) {
    console.warn(`[live:orders] email_failed ${(error as Error)?.name ?? 'error'}`);
    return false;
  }
}

const shortDate = (timezone: string, at: number) =>
  new Date(at * 1000).toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** One-time notices on the order page after an action. */
export const ORDER_FLASH: Record<string, string> = {
  'ticket-transferred':
    'The ticket was passed on. Its old QR code no longer works, and both of you were emailed.',
  'ticket-transferred-no-email':
    'The ticket was passed on and its old QR code no longer works, but the email could not be sent. Please tell the new holder yourself.',
  'refund-requested':
    'Your refund request was sent to the organizer. You will get an email when they decide.',
  'refund-requested-no-email':
    'Your refund request was saved. The organizer will see it in their orders; their email could not be sent.',
};

export const FIND_FLASH: Record<string, string> = {
  'find-tickets-sent':
    'If that address has tickets, we sent it an email with the links. It can take a few minutes to arrive.',
};

// ── Links ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type LinkCheck = { kind: 'not_found' } | { kind: 'expired' };

/** A link whose signature is wrong is a 404; a real link that ran out (or no longer points anywhere) is a 410. */
async function checkLink(env: PaidEnv, token: string): Promise<LinkCheck | null> {
  // `now = 0` checks only the signature, so an old link can be told apart from a forged one.
  return (await verifyOrderLink(env, token, 0)) ? null : { kind: 'not_found' };
}

// ── P4: back from Stripe ───────────────────────────────────────────────────────────────────────────────────────

export type ReturnOutcome =
  | LinkCheck
  | { kind: 'waiting'; eventTitle: string; reference: string }
  | { kind: 'redirect'; location: string; flash?: string };

/**
 * While the payment webhook has not confirmed the order the page waits ("issuing your tickets", it refreshes); then
 * the order page. An order that was never paid (declined, expired) goes back to the event's tickets with a notice.
 */
export async function openReturn(
  live: LiveContext,
  input: { token: string; cookies: CookieJar; now: number },
): Promise<ReturnOutcome> {
  const forged = await checkLink(live.env, input.token);
  if (forged) return forged;
  const link = await orderLinkView(live.db, live.env, input.token, input.now);
  if (link.kind === 'invalid') return { kind: 'expired' };
  if (link.kind !== 'order') return { kind: 'redirect', location: `/orders/${input.token}` };
  const view = link.view;
  if (view.state === 'pending')
    return { kind: 'waiting', eventTitle: view.event.title, reference: view.reference };
  if (view.state === 'closed')
    return {
      kind: 'redirect',
      location: `/events/${encodeURIComponent(view.event.slug)}/tickets`,
      flash: 'checkout-not-paid',
    };
  clearCheckoutState(input.cookies);
  return { kind: 'redirect', location: `/orders/${input.token}?new=1` };
}

// ── P5: the order page and the holder's ticket page ────────────────────────────────────────────────────────────

export interface TicketModel {
  id: string;
  title: string;
  people: number;
  holder: string | null;
  status: { tone: 'neutral' | 'success' | 'warning' | 'danger'; label: string };
  /** Inline SVG of the QR code, or null when this ticket shows none. */
  qr: string | null;
  note: string | null;
  transfer: { allowed: boolean; href: string | null; reason: string | null };
}

export interface EventModel {
  title: string;
  slug: string;
  whenLabel: string;
  venueLabel: string;
  canceled: boolean;
}

export interface OrderModel {
  kind: 'order';
  token: string;
  state: OrderPageView['state'];
  reference: string;
  buyerName: string | null;
  seller: string;
  event: EventModel;
  receipt: { lines: MoneyLine[]; total: { label: string; amount: string } };
  policy: ReturnType<typeof policyWords>;
  tickets: TicketModel[];
  refund: { allowed: boolean; reason: string | null; href: string | null };
  refunds: Array<{ id: string; amount: string; status: string; date: string }>;
  calendarHref: string | null;
  mapsUrl: string | null;
  notice: Message | null;
}

export interface HolderModel {
  kind: 'ticket';
  token: string;
  state: TicketPageView['state'];
  event: EventModel | null;
  seller: string | null;
  policy: ReturnType<typeof policyWords> | null;
  ticket: TicketModel | null;
  calendarHref: string | null;
  mapsUrl: string | null;
}

export type OrderLinkOutcome = LinkCheck | OrderModel | HolderModel;

const TRANSFER_REASONS: Record<TransferBlockReason, string | null> = {
  not_allowed: 'This event does not allow passing tickets on.',
  cutoff_passed: 'Passing tickets on has closed for this event.',
  checked_in: 'Already scanned at the door.',
  not_valid: null,
  already_transferred: null,
  refund_open: 'A refund is being asked for this ticket.',
  order_status: null,
  disputed: 'This order has a payment question open with the bank.',
};

const REFUND_REASONS: Record<RefundBlockReason, string | null> = {
  policy_none: 'This event does not offer refunds.',
  deadline_passed: 'Refund requests have closed for this event.',
  not_card_payment: 'This order was not paid online, so please ask the organizer.',
  order_status: null,
  disputed: 'This order has a payment question open with the bank.',
  nothing_refundable: 'There is nothing left to refund on this order.',
  preview: 'Preview orders are not refunded.',
};

const REFUND_STATUS: Record<string, string> = {
  requested: 'Requested, waiting for the organizer',
  declined: 'Declined',
  pending: 'On its way',
  succeeded: 'Refunded',
  failed: 'Could not be completed; the organizer was told',
  canceled: 'Withdrawn',
};

function eventModel(e: OrderEventInfo): EventModel {
  return {
    title: e.title,
    slug: e.slug,
    whenLabel: whenLabel(e.startsAt, e.timezone),
    venueLabel: [e.venueName, e.venueAddress].filter(Boolean).join(', '),
    canceled: e.canceled,
  };
}

function statusOf(t: TicketCard): TicketModel['status'] {
  if (t.transferred) return { tone: 'neutral', label: 'Passed on' };
  if (t.status === 'refunded') return { tone: 'neutral', label: 'Refunded' };
  if (t.status === 'voided') return { tone: 'neutral', label: 'Voided' };
  if (t.status === 'canceled') return { tone: 'danger', label: 'Canceled' };
  if (t.checkedInAt != null) return { tone: 'success', label: 'Checked in' };
  return { tone: 'success', label: 'Valid' };
}

function ticketModel(t: TicketCard, transferHref: string, timezone: string): TicketModel {
  const note = t.transferred
    ? `Passed on to ${t.holderName ?? 'someone else'}. This page no longer shows its QR code.`
    : t.checkedInAt != null
      ? `Scanned ${shortDate(timezone, t.checkedInAt)}.`
      : null;
  return {
    id: t.id,
    title: `${t.typeName} · Ticket ${t.seq}`,
    people: t.people,
    holder: t.holderName,
    status: statusOf(t),
    qr: t.credential ? qrSvg(t.credential) : null,
    note,
    transfer: {
      allowed: t.transfer.allowed,
      href: t.transfer.allowed ? transferHref : null,
      reason: t.transfer.reason ? TRANSFER_REASONS[t.transfer.reason] : null,
    },
  };
}

const stateNotice: Record<OrderPageView['state'], Message | null> = {
  pending: {
    tone: 'info',
    text: 'We are still waiting for the payment to be confirmed. Reload in a moment.',
  },
  active: null,
  unfulfilled: {
    tone: 'warning',
    text: 'Your payment arrived after the last seats were taken, so no tickets were issued. A full refund is on its way to your card.',
  },
  refunded: { tone: 'info', text: 'This order was refunded. Its tickets no longer work.' },
  closed: { tone: 'info', text: 'This order was not completed, so nothing was charged.' },
};

function showsEventLinks(state: string, canceled: boolean) {
  return state === 'active' && !canceled;
}

/** The order page or the holder's ticket page for a signed link. */
export async function openOrderLink(
  live: LiveContext,
  input: { token: string; now: number },
): Promise<OrderLinkOutcome> {
  const { token, now } = input;
  const forged = await checkLink(live.env, token);
  if (forged) return forged;
  const link = await orderLinkView(live.db, live.env, token, now);
  if (link.kind === 'invalid') return { kind: 'expired' };
  const base = `/orders/${token}`;
  if (link.kind === 'ticket') {
    const v = link.view;
    if (v.state === 'replaced')
      return {
        kind: 'ticket',
        token,
        state: 'replaced',
        event: null,
        seller: null,
        policy: null,
        ticket: null,
        calendarHref: null,
        mapsUrl: null,
      };
    const event = eventModel(v.event);
    const open = showsEventLinks('active', v.event.canceled) && v.ticket.status === 'valid';
    return {
      kind: 'ticket',
      token,
      state: 'active',
      event,
      seller: v.seller,
      policy: policyWords(v.policy),
      ticket: ticketModel(v.ticket, `${base}/transfer/${v.ticket.id}`, v.event.timezone),
      calendarHref: open ? `${base}/calendar.ics` : null,
      mapsUrl: open && event.venueLabel ? mapsSearchUrl([v.event.venueName, v.event.venueAddress]) : null,
    };
  }
  const v = link.view;
  const event = eventModel(v.event);
  const open = showsEventLinks(v.state, v.event.canceled);
  return {
    kind: 'order',
    token,
    state: v.state,
    reference: v.reference,
    buyerName: v.buyerName,
    seller: v.seller,
    event,
    receipt: {
      lines: [
        ...v.receipt.lines.map((l) => ({ label: l.label, amount: formatCents(l.amountCents) })),
        ...(v.receipt.refundedCents > 0
          ? [{ label: 'Refunded', amount: formatCents(-v.receipt.refundedCents) }]
          : []),
      ],
      total: {
        label: v.state === 'pending' || v.state === 'closed' ? 'Total' : 'Total paid',
        amount: formatCents(v.receipt.totalCents),
      },
    },
    policy: policyWords(v.policy),
    tickets: v.tickets.map((t) => ticketModel(t, `${base}/transfer/${t.id}`, v.event.timezone)),
    refund: {
      allowed: v.refund.allowed,
      reason: v.refund.reason ? REFUND_REASONS[v.refund.reason] : null,
      href: v.refund.allowed ? `${base}/refund` : null,
    },
    refunds: v.refunds.map((r) => ({
      id: r.id,
      amount: formatCents(r.amountCents),
      status: REFUND_STATUS[r.status] ?? r.status,
      date: shortDate(v.event.timezone, r.createdAt),
    })),
    calendarHref: open ? `${base}/calendar.ics` : null,
    mapsUrl: open && event.venueLabel ? mapsSearchUrl([v.event.venueName, v.event.venueAddress]) : null,
    notice: v.event.canceled
      ? {
          tone: 'warning',
          text: 'This event was canceled. Paid orders are refunded in full; you will get an email.',
        }
      : stateNotice[v.state],
  };
}

/** The calendar file for a valid order or ticket link (only while its tickets are good and the event is on). */
export async function orderCalendar(
  live: LiveContext,
  input: { token: string; origin: string; now: number },
): Promise<string | null> {
  if (!(await verifyOrderLink(live.env, input.token, input.now))) return null;
  const link = await orderLinkView(live.db, live.env, input.token, input.now);
  let info: OrderEventInfo | null = null;
  let uid = '';
  if (link.kind === 'order' && link.view.state === 'active') {
    info = link.view.event;
    uid = link.orderId;
  } else if (link.kind === 'ticket' && link.view.state === 'active' && link.view.ticket.status === 'valid') {
    info = link.view.event;
    uid = link.ticketId;
  }
  if (!info || info.canceled) return null;
  const origin = input.origin.replace(/\/+$/, '');
  const eventUrl = `${origin}/events/${encodeURIComponent(info.slug)}`;
  return buildEventIcs({
    uid: `${uid}@${new URL(origin).host}`,
    title: info.title,
    startsAt: new Date(info.startsAt * 1000),
    endsAt: info.endsAt == null ? null : new Date(info.endsAt * 1000),
    location: [info.venueName, info.venueAddress].filter(Boolean).join(', '),
    description: `Hosted by ${info.organizationName}. Event page: ${eventUrl}`,
    url: eventUrl,
    now: new Date(input.now * 1000),
  });
}

// ── P6: pass a ticket on ───────────────────────────────────────────────────────────────────────────────────────

export interface TransferValues {
  toName: string;
  toEmail: string;
  confirmEmail: string;
}

export interface TransferView {
  token: string;
  backHref: string;
  event: EventModel;
  ticket: TicketModel;
  deadlineLabel: string | null;
  phase: 'form' | 'confirm';
  values: TransferValues;
  errors: Partial<Record<keyof TransferValues, string>>;
  notice: Message | null;
  status: number;
}

export type TransferOutcome =
  LinkCheck | { kind: 'redirect'; location: string; flash?: string } | { kind: 'view'; view: TransferView };

const EMPTY_TRANSFER: TransferValues = { toName: '', toEmail: '', confirmEmail: '' };

async function transferContext(live: LiveContext, token: string, ticketId: string, now: number) {
  const opened = await openOrderLink(live, { token, now });
  if (opened.kind === 'not_found' || opened.kind === 'expired') return opened;
  const ticket = opened.kind === 'order' ? opened.tickets.find((t) => t.id === ticketId) : opened.ticket;
  if (!ticket || ticket.id !== ticketId || !opened.event) return { kind: 'not_found' } as const;
  const link = await orderLinkView(live.db, live.env, token, now);
  let deadline: number | null = null;
  let timezone = 'UTC';
  let access: { kind: 'order'; orderId: string } | { kind: 'ticket'; version: number } | null = null;
  if (link.kind === 'order') {
    deadline = link.view.transferDeadline;
    timezone = link.view.event.timezone;
    access = { kind: 'order', orderId: link.orderId };
  } else if (link.kind === 'ticket' && link.view.state === 'active') {
    deadline = link.view.transferDeadline;
    timezone = link.view.event.timezone;
    access = { kind: 'ticket', version: link.version };
  }
  if (!access) return { kind: 'not_found' } as const;
  return {
    kind: 'ready',
    event: opened.event,
    ticket,
    access,
    deadlineLabel: deadline == null ? null : shortDate(timezone, deadline),
  } as const;
}

function transferView(
  token: string,
  ctx: { event: EventModel; ticket: TicketModel; deadlineLabel: string | null },
  extra: Partial<TransferView> = {},
): TransferView {
  return {
    token,
    backHref: `/orders/${token}`,
    event: ctx.event,
    ticket: ctx.ticket,
    deadlineLabel: ctx.deadlineLabel,
    phase: 'form',
    values: EMPTY_TRANSFER,
    errors: {},
    notice: ctx.ticket.transfer.allowed
      ? null
      : { tone: 'info', text: ctx.ticket.transfer.reason ?? 'This ticket cannot be passed on now.' },
    status: 200,
    ...extra,
  };
}

/** P6 (GET): the form, or why this ticket cannot be passed on. */
export async function openTransfer(
  live: LiveContext,
  input: { token: string; ticketId: string; now: number },
): Promise<TransferOutcome> {
  const ctx = await transferContext(live, input.token, input.ticketId, input.now);
  if (ctx.kind !== 'ready') return ctx;
  return { kind: 'view', view: transferView(input.token, ctx) };
}

/** The transfer form's own checks (the domain checks them again when it transfers). */
export function checkTransferValues(values: TransferValues): Partial<Record<keyof TransferValues, string>> {
  const errors: Partial<Record<keyof TransferValues, string>> = {};
  const name = values.toName.replace(/\s+/g, ' ').trim();
  const email = normalizeEmail(values.toEmail);
  if (!name) errors.toName = 'Enter the new holder’s name.';
  else if (name.length > 100) errors.toName = 'The name is too long (at most 100 characters).';
  if (!email) errors.toEmail = 'Enter the new holder’s email address.';
  else if (!isPlausibleEmail(email)) errors.toEmail = 'Enter a valid email address.';
  else if (normalizeEmail(values.confirmEmail) !== email)
    errors.confirmEmail = 'The two email addresses do not match.';
  return errors;
}

const TRANSFER_FIELD_ERRORS: Record<string, [keyof TransferValues, string]> = {
  toName: ['toName', 'Enter the new holder’s name (at most 100 characters).'],
  toEmail: ['toEmail', 'Enter a valid email address.'],
  confirmEmail: ['confirmEmail', 'The two email addresses do not match.'],
  same_email: ['toEmail', 'That is the address the ticket is already with. Enter the new holder’s address.'],
};

/**
 * P6 (POST): `action=review` checks the fields and shows the confirm step; `action=edit` goes back to the form;
 * `action=confirm` passes the ticket on (`transferTicket`), emails both people and returns to the order page.
 */
export async function submitTransfer(
  live: LiveContext,
  input: { token: string; ticketId: string; form: FormData; origin: string; now: number },
  deps: { sendEmail?: SendEmail } = {},
): Promise<TransferOutcome> {
  const { token, form, now } = input;
  const ctx = await transferContext(live, token, input.ticketId, now);
  if (ctx.kind !== 'ready') return ctx;
  const values: TransferValues = {
    toName: String(form.get('toName') ?? ''),
    toEmail: String(form.get('toEmail') ?? ''),
    confirmEmail: String(form.get('confirmEmail') ?? ''),
  };
  const action = String(form.get('action') ?? 'review');
  const view = (extra: Partial<TransferView>) => ({
    kind: 'view' as const,
    view: transferView(token, ctx, { values, ...extra }),
  });
  if (!ctx.ticket.transfer.allowed) return view({ status: 409 });
  if (action === 'edit') return view({});
  const errors = checkTransferValues(values);
  if (Object.keys(errors).length) return view({ errors, status: 422 });
  if (action !== 'confirm') return view({ phase: 'confirm' });

  const origin = input.origin.replace(/\/+$/, '');
  try {
    const result = await transferTicket(live.db, live.env, {
      ticketId: ctx.ticket.id,
      access: ctx.access,
      toName: values.toName,
      toEmail: values.toEmail,
      confirmEmail: values.confirmEmail,
      now,
      ticketUrl: (t) => `${origin}/orders/${t}`,
    });
    let sent = true;
    for (const email of result.emails) sent = (await trySend(deps.sendEmail, live.env, email)) && sent;
    return {
      kind: 'redirect',
      location: `/orders/${token}`,
      flash: sent ? 'ticket-transferred' : 'ticket-transferred-no-email',
    };
  } catch (error) {
    if (!(error instanceof PaidError)) throw error;
    if (error.code === 'not_found') return { kind: 'not_found' };
    const field = error.code === 'invalid' ? TRANSFER_FIELD_ERRORS[error.detail ?? ''] : undefined;
    if (field) return view({ errors: { [field[0]]: field[1] }, status: 422 });
    const reason =
      error.code === 'invalid' || error.code === 'policy_forbids'
        ? (TRANSFER_REASONS[error.detail as TransferBlockReason] ?? 'This ticket cannot be passed on now.')
        : error.code === 'stale'
          ? 'This ticket changed a moment ago (it may have been scanned or passed on). Please go back and check.'
          : PAID_MESSAGES[error.code];
    return view({ notice: { tone: 'danger', text: reason }, status: 409 });
  }
}

// ── Refund request ─────────────────────────────────────────────────────────────────────────────────────────────

export interface RefundTicketOption {
  id: string;
  title: string;
  holder: string | null;
  /** What this ticket brings back (its price less its discount share, plus its fee when the buyer paid it). */
  amount: string;
  checked: boolean;
}

export interface RefundView {
  token: string;
  backHref: string;
  event: EventModel;
  reference: string;
  policy: ReturnType<typeof policyWords>;
  deadlineLabel: string | null;
  options: RefundTicketOption[];
  phase: 'choose' | 'confirm';
  /** The amount computed on the server for the chosen tickets (confirm step). */
  amount: string | null;
  giftNote: string | null;
  reason: string;
  error: string | null;
  notice: Message | null;
  status: number;
}

export type RefundOutcome =
  LinkCheck | { kind: 'redirect'; location: string; flash?: string } | { kind: 'view'; view: RefundView };

async function refundContext(live: LiveContext, token: string, now: number) {
  const forged = await checkLink(live.env, token);
  if (forged) return forged;
  const link = await orderLinkView(live.db, live.env, token, now);
  if (link.kind === 'invalid') return { kind: 'expired' } as const;
  if (link.kind !== 'order') return { kind: 'not_found' } as const;
  const v = link.view;
  if (!v.refund.allowed) return { kind: 'redirect', location: `/orders/${token}` } as const;
  const [order, tickets, refunds] = await Promise.all([
    loadPaidOrder(live.db, link.orderId),
    loadOrderTickets(live.db, link.orderId),
    listOrderRefunds(live.db, link.orderId),
  ]);
  if (!order) return { kind: 'expired' } as const;
  const money = {
    refundedCents: order.amountRefundedCents,
    inFlightCents: refunds.filter((r) => r.status === 'pending').reduce((s, r) => s + r.amountCents, 0),
    giftOutCents: refunds
      .filter((r) => r.status === 'pending' || r.status === 'succeeded')
      .reduce((s, r) => s + r.giftCents, 0),
  };
  const eligible = new Set(v.refund.ticketIds);
  return {
    kind: 'ready',
    view: v,
    orderId: link.orderId,
    order,
    tickets,
    eligible,
    preview: (ids: readonly string[]) => refundableAmount(order, tickets, ids, 'whole_order', money),
  } as const;
}

type ReadyRefund = Extract<Awaited<ReturnType<typeof refundContext>>, { kind: 'ready' }>;

function refundView(
  token: string,
  ctx: ReadyRefund,
  chosen: ReadonlySet<string>,
  extra: Partial<RefundView> = {},
): RefundView {
  const v = ctx.view;
  return {
    token,
    backHref: `/orders/${token}`,
    event: eventModel(v.event),
    reference: v.reference,
    policy: policyWords(v.policy),
    deadlineLabel: v.refund.deadline == null ? null : shortDate(v.event.timezone, v.refund.deadline),
    options: ctx.tickets
      .filter((t) => ctx.eligible.has(t.id))
      .map((t) => ({
        id: t.id,
        title: `${t.typeName} · Ticket ${t.seq}`,
        holder: t.holderName,
        amount: formatCents(ticketRefundShare(t, ctx.order.feePayer).amountCents),
        checked: chosen.has(t.id),
      })),
    phase: 'choose',
    amount: null,
    giftNote: null,
    reason: '',
    error: null,
    notice: null,
    status: 200,
    ...extra,
  };
}

/** The refund page (GET): the tickets that may be refunded now, each with what it brings back. */
export async function openRefund(
  live: LiveContext,
  input: { token: string; now: number },
): Promise<RefundOutcome> {
  const ctx = await refundContext(live, input.token, input.now);
  if (ctx.kind !== 'ready') return ctx;
  return { kind: 'view', view: refundView(input.token, ctx, ctx.eligible) };
}

const REFUND_REASON_MAX = 500;

/**
 * The refund page (POST): `action=review` shows the server's amount for the chosen tickets; `action=edit` goes back;
 * `action=confirm` asks for the refund (`requestRefund`) and emails the organization's owners.
 */
export async function submitRefund(
  live: LiveContext,
  input: { token: string; form: FormData; origin: string; now: number },
  deps: { sendEmail?: SendEmail } = {},
): Promise<RefundOutcome> {
  const { token, form, now } = input;
  const ctx = await refundContext(live, token, now);
  if (ctx.kind !== 'ready') return ctx;
  const ids = [...new Set(form.getAll('ticket').map(String))].filter((id) => ctx.eligible.has(id));
  const chosen = new Set(ids);
  const reason = String(form.get('reason') ?? '').slice(0, REFUND_REASON_MAX);
  const action = String(form.get('action') ?? 'review');
  const view = (extra: Partial<RefundView>) => ({
    kind: 'view' as const,
    view: refundView(token, ctx, chosen, { reason, ...extra }),
  });
  if (action === 'edit') return view({});
  if (ids.length === 0) return view({ error: 'Choose at least one ticket.', status: 422 });
  if (action !== 'confirm') {
    const amount = ctx.preview(ids);
    return view({
      phase: 'confirm',
      amount: formatCents(amount.amountCents),
      giftNote:
        amount.giftCents > 0
          ? `This includes your gift of ${formatCents(amount.giftCents)} to ${ctx.view.event.organizationName}.`
          : null,
    });
  }
  let requested;
  try {
    requested = await requestRefund(live.db, live.env, {
      orderId: ctx.orderId,
      ticketIds: ids,
      reason: reason.trim() || null,
      now,
    });
  } catch (error) {
    if (!(error instanceof PaidError)) throw error;
    const text =
      error.code === 'policy_forbids'
        ? (REFUND_REASONS[error.detail as RefundBlockReason] ?? PAID_MESSAGES.policy_forbids)
        : error.code === 'already_done'
          ? 'A refund for these tickets was already asked for.'
          : error.code === 'invalid'
            ? 'These tickets cannot be refunded now. Please go back and check.'
            : PAID_MESSAGES[error.code];
    return view({ notice: { tone: 'danger', text }, status: 409 });
  }
  const origin = input.origin.replace(/\/+$/, '');
  const order = requested.order;
  const owners = await organizationOwners(live.db, order.organizationId);
  let sent = owners.length > 0;
  for (const owner of owners)
    sent =
      (await trySend(
        deps.sendEmail,
        live.env,
        refundRequestedEmail({
          to: owner.email,
          ownerName: owner.name || null,
          event: {
            title: order.eventTitle,
            startsAt: order.startsAt,
            timezone: order.timezone,
            venueName: order.venueName,
            venueAddress: order.venueAddress,
            organizationName: order.organizationName,
          },
          reference: order.reference,
          amountCents: requested.amountCents,
          ticketCount: ids.length,
          reason: reason.trim() || null,
          reviewUrl: `${origin}/organizer/events/${order.eventId}/orders/${order.id}`,
        }),
      )) && sent;
  return {
    kind: 'redirect',
    location: `/orders/${token}`,
    flash: sent ? 'refund-requested' : 'refund-requested-no-email',
  };
}

// ── P7: find my tickets ────────────────────────────────────────────────────────────────────────────────────────

export type FindOutcome = { kind: 'error'; error: string } | { kind: 'done' };

/**
 * Looks the address up and sends its links (`findMyTickets`). The answer is the same whether or not the address has
 * tickets, and when rate limited, so it never tells who bought what. Only an empty or malformed address is refused.
 */
export async function findTickets(
  live: LiveContext,
  input: { form: FormData; request: Request; origin: string; now: number },
  deps: { sendEmail?: SendEmail } = {},
): Promise<FindOutcome> {
  const email = normalizeEmail(String(input.form.get('email') ?? ''));
  if (!email) return { kind: 'error', error: 'Enter the email address you bought the tickets with.' };
  if (!isPlausibleEmail(email)) return { kind: 'error', error: 'Enter a valid email address.' };
  const origin = input.origin.replace(/\/+$/, '');
  const result = await findMyTickets(live.db, live.env, {
    email,
    ipHash: (await requesterHash(input.request, live.env)) ?? null,
    now: input.now,
    orderUrl: (token) => `${origin}/orders/${token}`,
  });
  if (result.email) {
    try {
      await (deps.sendEmail ?? sendLiveEmail)(live.env, result.email);
    } catch (error) {
      // Same answer either way; the person can ask again later.
      if (!(error instanceof EmailUnavailableError)) console.warn('[live:find-tickets] email_failed');
    }
  }
  return { kind: 'done' };
}

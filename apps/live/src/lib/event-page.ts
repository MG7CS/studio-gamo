/**
 * What happens on an event's page when a form is posted: send it for review, delete it, cancel one date or the whole
 * event (and tell the people who registered). The page only calls this and renders the result.
 */
import {
  DOOR_TOTAL_FILTERS,
  PaidError,
  SecretNotConfiguredError,
  StripeApiError,
  TERMS_REGISTRY,
  listEventOrders,
  listEventRegistrations,
  listTicketTypes,
  orderTokenFor,
  paymentsRuntime,
  readEventTicketing,
  startOnlineCheckout,
  voidPreviewOrder,
  type OrganizerOrderRow,
  type PaidEnv,
  OrganizerError,
  deleteUnpublishedEvent,
  getOrganizerEvent,
  doorFilterQuery,
  doorTotals,
  orderCounts,
  submitEvent,
  type DoorTotalKey,
  type MembershipSummary,
  type OrganizerEventDetail,
  type SqlDatabase,
} from '@gamo/domain';
import { cancelDateAndNotify, cancelEventAndNotify } from './organizer-events';
import { NOT_VERIFIED_NOTICE, SELLING_NOT_READY_NOTICE, STATUS_AFTER_SAVE } from './event-editor';
import type { LiveContext } from './registration';
import { readinessWording } from './payments-page';
import { organizerPage, type OrganizerPageContext } from './organizer-session';

export interface EventPageResult {
  notice?: { tone: 'info' | 'error'; text: string };
  /** The event is gone (deleted): go here instead of drawing it. */
  redirect?: string;
}

const messageFor = (code: string) =>
  code === 'suspended'
    ? 'This organization is suspended.'
    : code === 'status_locked'
      ? 'That is not possible for this event right now. Events need a date that has not passed to be submitted.'
      : 'That could not be done.';

export async function runEventPageAction(input: {
  live: Pick<LiveContext, 'db' | 'env'>;
  active: MembershipSummary;
  event: Pick<OrganizerEventDetail, 'values'>;
  eventId: string;
  form: FormData;
  now: number;
}): Promise<EventPageResult> {
  const { live, active, event, eventId, form, now } = input;
  const action = String(form.get('action') ?? '');
  const message = String(form.get('message') ?? '').slice(0, 1000);
  const base = {
    live,
    organizationId: active.organizationId,
    organizationName: active.name,
    eventId,
    eventTitle: event.values.title,
    timezone: event.values.timezone,
    message,
    now,
  };
  try {
    if (action === 'submit') {
      const status = await submitEvent(live.db, { organizationId: active.organizationId, eventId, now });
      return { notice: { tone: 'info', text: STATUS_AFTER_SAVE[status] ?? 'Saved.' } };
    }
    if (action === 'delete') {
      await deleteUnpublishedEvent(live.db, { organizationId: active.organizationId, eventId });
      return { redirect: '/organizer/events?deleted=1' };
    }
    if (action === 'cancel_date')
      return {
        notice: await cancelDateAndNotify({ ...base, occurrenceId: String(form.get('occurrence') ?? '') }),
      };
    if (action === 'cancel') {
      if (form.get('confirm') !== 'yes')
        return {
          notice: { tone: 'error', text: 'Tick the box to confirm that you want to cancel this event.' },
        };
      return { notice: await cancelEventAndNotify(base) };
    }
    return {};
  } catch (error) {
    // A paid event's "who may sell" refusals (verification, payments, terms) in plain words.
    if (error instanceof PaidError && error.code === 'not_verified')
      return { notice: { tone: 'error', text: NOT_VERIFIED_NOTICE } };
    if (error instanceof PaidError && SELLING_NOT_READY_NOTICE[error.code])
      return { notice: { tone: 'error', text: SELLING_NOT_READY_NOTICE[error.code] } };
    if (!(error instanceof OrganizerError)) throw error;
    return { notice: { tone: 'error', text: messageFor(error.code) } };
  }
}

// ── Door-day totals (paid events) ─────────────────────────────────────────────────────────────────────────────

/** Which date the totals card shows: the one chosen on the calendar, else today's or the next one, else the last. */
export function doorDayOccurrence(
  occurrences: ReadonlyArray<
    Pick<OrganizerEventDetail['occurrences'][number], 'id' | 'startsAt' | 'endsAt' | 'canceled'>
  >,
  selectedIds: readonly string[],
  now: number,
): string | null {
  if (selectedIds.length === 1) return selectedIds[0];
  const live = occurrences.filter((o) => !o.canceled);
  // A date counts as "today" until 12 hours after it starts (or until it ends, when that is later).
  const current = live.find((o) => Math.max(o.endsAt ?? o.startsAt, o.startsAt + 12 * 3600) > now);
  return (current ?? live[live.length - 1] ?? occurrences[occurrences.length - 1])?.id ?? null;
}

export const DOOR_TOTAL_LABELS: Record<DoorTotalKey, string> = {
  soldOnline: 'Sold online',
  doorCash: 'Door: cash',
  doorPhone: 'Door: buyer’s phone',
  doorReader: 'Door: card reader',
  doorComp: 'Door: comp',
  checkedIn: 'Checked in',
  toArrive: 'Still to arrive',
};

export interface DoorTotalItem {
  key: DoorTotalKey;
  label: string;
  /** Tickets: equals the length of the list `href` opens. */
  value: number;
  href: string;
}

/** The door-day numbers of one date, each with the link to the tickets it counts (same filter). */
export async function doorTotalsView(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; occurrenceId: string },
): Promise<DoorTotalItem[]> {
  const totals = await doorTotals(db, {
    organizationId: input.organizationId,
    occurrenceId: input.occurrenceId,
  });
  // The door's own list of a date's tickets (the same filter and WHERE as the count).
  const base = `/organizer/door/${encodeURIComponent(input.occurrenceId)}/list`;
  return (Object.keys(DOOR_TOTAL_FILTERS) as DoorTotalKey[]).map((key) => ({
    key,
    label: DOOR_TOTAL_LABELS[key],
    value: totals[key],
    href: `${base}?${doorFilterQuery(DOOR_TOTAL_FILTERS[key])}`,
  }));
}

export interface PaidOverview {
  /** The date the door-day card counts; null when the event has no dates. */
  occurrenceId: string | null;
  totals: DoorTotalItem[];
  /** Paid orders (fully or partly) not yet refunded: what canceling would refund. */
  paidOrders: number;
  /** Door sales are on for this event. */
  doorSales: boolean;
}

/** What the Overview of a paid event adds: the door-day totals of one date and the paid orders count. */
export async function paidOverviewView(
  db: SqlDatabase,
  input: {
    organizationId: string;
    event: Pick<OrganizerEventDetail, 'id' | 'occurrences'>;
    selectedIds: readonly string[];
    now: number;
  },
): Promise<PaidOverview> {
  const occurrenceId = doorDayOccurrence(input.event.occurrences, input.selectedIds, input.now);
  const [totals, counts, ticketing] = await Promise.all([
    occurrenceId
      ? doorTotalsView(db, { organizationId: input.organizationId, eventId: input.event.id, occurrenceId })
      : Promise.resolve([]),
    orderCounts(db, input.organizationId, input.event.id),
    readEventTicketing(db, input.event.id),
  ]);
  return {
    occurrenceId,
    totals,
    paidOrders: (counts.byStatus.paid ?? 0) + (counts.byStatus.partially_refunded ?? 0),
    doorSales: ticketing?.doorSalesEnabled ?? false,
  };
}

// ── Preview checkout (O10) ─────────────────────────────────────────────────────────────────────────────────────

/** Events an organizer may preview: not canceled or rejected (a draft, one in review, or published). */
export const PREVIEWABLE_STATUSES = ['draft', 'pending_review', 'changes_requested', 'published'];

export const PREVIEW_FLASH: Record<string, string> = {
  voided: 'Preview order voided. Its seats are free again and it never counts in reports.',
};

export type PreviewResult =
  | { kind: 'redirect'; url: string }
  /** A preview that cost nothing is paid at once: its order page. */
  | { kind: 'free'; orderPath: string }
  | { kind: 'done'; flash: string }
  | { kind: 'error'; notice: string; fields?: Record<string, string> };

const PREVIEW_ERRORS: Partial<Record<string, string>> = {
  not_found: 'This event cannot be previewed (it is canceled, rejected or not yours).',
  not_on_sale:
    'Those tickets are not on sale for this date (a hidden type needs its access code; check the sales window, or that the date is not canceled).',
  sold_out: 'There are not enough tickets left on that date.',
  limit_exceeded: 'That is more than one order may hold.',
  closed_past: 'That date has passed.',
  code_invalid: 'That code does not work for this event right now.',
  code_used_up: 'That code has been used as many times as it allows.',
  forbidden: 'Previews are not possible with live payments. Use test mode.',
  stripe_error: 'The checkout page could not be opened. Nothing was charged; please try again.',
  payments_unavailable: 'Card sales are not available for your organization yet.',
};

/**
 * Places a preview order through the same online checkout buyers use (`isPreview`), as the signed-in organizer, and
 * sends them to the payment page (the local stand-in in development). Refused, with the reason, when card sales are
 * unavailable for the organization.
 */
export async function startPreviewCheckout(input: {
  db: SqlDatabase;
  env: PaidEnv;
  organizationId: string;
  event: { id: string; title: string; status: string; occurrences: ReadonlyArray<{ id: string }> };
  buyer: { name: string; email: string };
  form: FormData;
  origin: string;
  now: number;
}): Promise<PreviewResult> {
  if (!PREVIEWABLE_STATUSES.includes(input.event.status))
    return { kind: 'error', notice: PREVIEW_ERRORS.not_found! };
  const occurrenceId = String(input.form.get('occurrence') ?? '');
  const lines: Array<{ ticketTypeId: string; quantity: number }> = [];
  for (const [key, value] of input.form.entries()) {
    if (!key.startsWith('qty_')) continue;
    const q = String(value).trim();
    if (q && q !== '0')
      lines.push({ ticketTypeId: key.slice(4), quantity: /^\d{1,2}$/.test(q) ? Number(q) : -1 });
  }
  const fields: Record<string, string> = {};
  if (!input.event.occurrences.some((o) => o.id === occurrenceId)) fields.occurrence = 'Choose a date.';
  if (lines.length === 0 || lines.some((l) => l.quantity < 1))
    fields.quantities = 'Choose at least one ticket (a whole number).';
  if (Object.keys(fields).length > 0)
    return { kind: 'error', notice: 'Please fix the highlighted fields.', fields };
  const runtime = paymentsRuntime(input.db, input.env);
  const resolved = await runtime.routingForOrganization(input.organizationId);
  if (!resolved.available)
    return {
      kind: 'error',
      notice: `Preview checkout needs card sales, which are not available yet: ${readinessWording(resolved.reason, resolved.flow, 0).text}`,
    };
  const total = lines.reduce((a, l) => a + l.quantity, 0);
  try {
    const result = await startOnlineCheckout(input.db, input.env, {
      input: {
        eventId: input.event.id,
        occurrenceId,
        lines,
        code: String(input.form.get('code') ?? '') || null,
        buyerName: input.buyer.name,
        buyerEmail: input.buyer.email,
        attendeeNames: Array.from({ length: total }, () => input.buyer.name),
        termsVersion: TERMS_REGISTRY['ticket-terms'].version,
        isPreview: true,
        now: input.now,
      },
      routing: resolved.routing,
      origin: input.origin,
      eventTitle: input.event.title,
      now: input.now,
    });
    await runtime.flush();
    return result.kind === 'redirect'
      ? { kind: 'redirect', url: result.url }
      : { kind: 'free', orderPath: `/orders/${encodeURIComponent(result.orderToken)}` };
  } catch (error) {
    await runtime.flush().catch(() => {});
    if (error instanceof PaidError)
      return {
        kind: 'error',
        notice:
          error.code === 'invalid' && error.detail === 'buyer_email'
            ? 'Your account has no usable email address for the preview receipt.'
            : (PREVIEW_ERRORS[error.code] ?? 'The preview could not be started. Please check the choices.'),
      };
    if (error instanceof SecretNotConfiguredError || error instanceof StripeApiError)
      return { kind: 'error', notice: PREVIEW_ERRORS.payments_unavailable! };
    throw error;
  }
}

/** This event's preview orders, newest first, each with its buyer order page (they never count in reports). */
export async function listPreviewOrders(
  db: SqlDatabase,
  env: PaidEnv,
  input: { organizationId: string; eventId: string },
): Promise<Array<OrganizerOrderRow & { orderPath: string | null }>> {
  const rows = await listEventOrders(db, input.organizationId, input.eventId, { includePreview: true });
  const previews = rows.filter((r) => r.isPreview && r.status !== 'voided');
  return Promise.all(
    previews.map(async (r) => {
      const token = r.status === 'paid' ? await orderTokenFor(db, env, r.id) : null;
      return { ...r, orderPath: token ? `/orders/${encodeURIComponent(token)}` : null };
    }),
  );
}

/** Voids one preview order: its seats are freed and it is removed. */
export async function voidPreview(input: {
  db: SqlDatabase;
  env: PaidEnv;
  organizationId: string;
  orderId: string;
  now: number;
}): Promise<PreviewResult> {
  try {
    const runtime = paymentsRuntime(input.db, input.env);
    await voidPreviewOrder(input.db, {
      ...input,
      // A preview still waiting at Checkout is closed there first, so it cannot be paid after it is voided.
      expireCheckout: async (sessionId) => {
        const route = await runtime.routingForOrder(input.orderId);
        if (!route.available) throw new PaidError('payments_unavailable', { detail: 'checkout_open' });
        await route.routing.expireCheckout(sessionId);
      },
    });
    await runtime.flush();
    return { kind: 'done', flash: 'voided' };
  } catch (error) {
    if (!(error instanceof PaidError)) throw error;
    return {
      kind: 'error',
      notice:
        error.code === 'already_done'
          ? 'That preview was already voided.'
          : 'That is not a preview order of this event.',
    };
  }
}

// ── Tab counts ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The counts on an event's tabs, each the length of the list the tab opens without filters: ticket types and orders
 * for a paid event, registrations for a free one.
 */
export async function eventTabCounts(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; admission: string; now: number },
): Promise<Partial<Record<'tickets' | 'orders' | 'registrations', number>>> {
  if (input.admission === 'paid_tickets') {
    const [types, counts] = await Promise.all([
      listTicketTypes(db, input.organizationId, input.eventId),
      orderCounts(db, input.organizationId, input.eventId),
    ]);
    return { tickets: types.length, orders: counts.all };
  }
  if (input.admission === 'free_registration') {
    const rows = await listEventRegistrations(db, input.organizationId, input.eventId, { now: input.now });
    return { registrations: rows.length };
  }
  return {};
}

// ── The start of every paid event page ──────────────────────────────────────────────────────────────────────────

export interface PaidEventPage extends OrganizerPageContext {
  active: NonNullable<OrganizerPageContext['active']>;
  event: OrganizerEventDetail;
  eventId: string;
}

/**
 * Signed in, a member of the active organization, and the event is that organization's paid event; otherwise the
 * answer to send (sign-in redirect, 503 when Live is unavailable, 404 for anything else).
 */
export async function paidEventPage(
  astro: Parameters<typeof organizerPage>[0] & {
    params: Record<string, string | undefined>;
  },
): Promise<PaidEventPage | Response> {
  let ctx: OrganizerPageContext | Response | null;
  try {
    ctx = await organizerPage(astro);
  } catch {
    ctx = null;
  }
  if (ctx instanceof Response) return ctx;
  if (!ctx || !ctx.active) return new Response('Gamo Live is temporarily unavailable.', { status: 503 });
  const eventId = astro.params.id ?? '';
  const event = await getOrganizerEvent(ctx.live.db, ctx.active.organizationId, eventId, ctx.now);
  if (!event || event.admission !== 'paid_tickets') return new Response(null, { status: 404 });
  return { ...ctx, active: ctx.active, event, eventId };
}

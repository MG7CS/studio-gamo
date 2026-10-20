/**
 * Organizer event actions that touch the database and send email, so the pages only call them. Canceling a paid event
 * or date also expires its open Checkout Sessions, refunds every paid order in full and emails each buyer
 * (docs/LIVE_REQUIREMENTS.md §8.2 item 17); registrants of free events are told exactly as before.
 */
import {
  holderChanges,
  notifyHoldersOfChange as notifyHolders,
  CANCEL_EMAIL_LIMIT,
  PaidError,
  SecretNotConfiguredError,
  StripeApiError,
  cancelEvent,
  cancelOccurrence,
  confirmationEmail,
  eventCanceledEmail,
  eventCanceledRefundEmail,
  loadPaidOrder,
  paymentsRuntime,
  recoverRegistration,
  refundOrderInFull,
  sendLiveEmail,
  type AffectedRegistrant,
  type CancelResult,
  type LiveEventDetail,
  type PaidEnv,
  type PaidOrder,
} from '@gamo/domain';
import { whenLabel } from './organizer-format';
import { whenWhere, type LiveContext } from './registration';

interface CancelContext {
  live: Pick<LiveContext, 'db' | 'env'>;
  organizationId: string;
  organizationName: string;
  eventId: string;
  eventTitle: string;
  timezone: string;
  message: string;
  now: number;
}

/** Emails the people whose registration was canceled (the first CANCEL_EMAIL_LIMIT) and words the result. */
async function notify(c: CancelContext, affected: AffectedRegistrant[], what: string) {
  let sent = 0;
  for (const person of affected.slice(0, CANCEL_EMAIL_LIMIT)) {
    try {
      await sendLiveEmail(
        c.live.env,
        eventCanceledEmail(
          person.email,
          person.name,
          {
            title: c.eventTitle,
            whenLabel: whenLabel(person.startsAt, c.timezone),
            organizationName: c.organizationName,
          },
          c.message,
        ),
      );
      sent++;
    } catch {
      // Counted below as not emailed.
    }
  }
  const missed = affected.length - sent;
  const text =
    affected.length === 0
      ? `${what} is canceled.`
      : `${what} is canceled and ${affected.length} ${affected.length === 1 ? 'registration was' : 'registrations were'} canceled. ${sent} ${sent === 1 ? 'person was' : 'people were'} emailed.` +
        (missed > 0
          ? ` ${missed} could not be emailed; download the registration list and tell them directly.`
          : '');
  return { tone: (missed > 0 ? 'error' : 'info') as 'error' | 'info', text };
}

/** What happened to the paid orders of a canceled event or date. */
export interface PaidCancelReport {
  /** Refunded in full (or on its way through Stripe). */
  refunded: number;
  /** Cash orders: the money is given back in person at the door. */
  cash: number;
  /** Could not be refunded here (a dispute is open, or payments are unavailable): needs the organizer. */
  attention: number;
  emailed: number;
  notEmailed: number;
  /** Open Checkout Sessions that could not be expired (they expire on their own within 31 minutes). */
  checkoutsLeft: number;
}

const mailEventOf = (o: PaidOrder) => ({
  title: o.eventTitle,
  startsAt: o.startsAt,
  timezone: o.timezone,
  venueName: o.venueName,
  venueAddress: o.venueAddress,
  organizationName: o.organizationName,
});

/**
 * After the domain canceled the dates: expire the open Checkout Sessions, refund every paid order in full with the
 * order's own routing, email each buyer, then deliver the local stand-in's events. A failure on one order never stops
 * the others; it is counted as needing attention.
 */
export async function refundCanceledOrders(
  c: Pick<CancelContext, 'live' | 'message' | 'now'>,
  result: Pick<CancelResult, 'ordersToRefund' | 'checkoutsToExpire'>,
): Promise<PaidCancelReport> {
  const report: PaidCancelReport = {
    refunded: 0,
    cash: 0,
    attention: 0,
    emailed: 0,
    notEmailed: 0,
    checkoutsLeft: 0,
  };
  if (result.ordersToRefund.length === 0 && result.checkoutsToExpire.length === 0) return report;
  const env = c.live.env as PaidEnv;
  const runtime = paymentsRuntime(c.live.db, env);
  for (const checkout of result.checkoutsToExpire) {
    try {
      const r = await runtime.routingForOrder(checkout.orderId);
      if (!r.available) throw new PaidError('payments_unavailable');
      await r.routing.expireCheckout(checkout.checkoutSessionId);
    } catch {
      report.checkoutsLeft++;
    }
  }
  for (const target of result.ordersToRefund) {
    let order: PaidOrder | null;
    let amountCents = 0;
    let cash = false;
    try {
      const r = await runtime.routingForOrder(target.orderId);
      const outcome = await refundOrderInFull(c.live.db, env, {
        orderId: target.orderId,
        reason: 'event_canceled',
        routing: r.available ? r.routing : null,
        now: c.now,
      });
      order = outcome.order;
      if (outcome.outcome === 'refunded' || outcome.outcome === 'pending') {
        // A comp or free order had nothing to give back; its buyer is still told.
        if (outcome.amountCents > 0) report.refunded++;
        amountCents = outcome.amountCents;
      } else if (outcome.outcome === 'cash_manual') {
        report.cash++;
        cash = true;
        amountCents = outcome.order.totalCents - outcome.order.amountRefundedCents;
      } else if (outcome.outcome === 'disputed') report.attention++;
      else continue; // Nothing left to give back: already refunded.
    } catch (error) {
      if (
        !(error instanceof PaidError) &&
        !(error instanceof SecretNotConfiguredError) &&
        !(error instanceof StripeApiError)
      )
        throw error;
      report.attention++;
      order = await loadPaidOrder(c.live.db, target.orderId);
    }
    if (!order?.buyerEmail) continue;
    if (report.emailed + report.notEmailed >= CANCEL_EMAIL_LIMIT) {
      report.notEmailed++;
      continue;
    }
    try {
      await sendLiveEmail(
        c.live.env,
        eventCanceledRefundEmail({
          to: order.buyerEmail,
          name: order.buyerName,
          event: mailEventOf(order),
          reference: order.reference,
          amountCents,
          cash,
          message: c.message,
        }),
      );
      report.emailed++;
    } catch {
      report.notEmailed++;
    }
  }
  await runtime.flush();
  return report;
}

const orders = (n: number) => `${n} paid ${n === 1 ? 'order' : 'orders'}`;

/** The paid part of the notice, in plain words; empty when there were no paid orders. */
export function paidCancelText(r: PaidCancelReport): string {
  const parts: string[] = [];
  if (r.refunded > 0)
    parts.push(`${orders(r.refunded)} ${r.refunded === 1 ? 'was' : 'were'} refunded in full.`);
  if (r.cash > 0)
    parts.push(
      `${r.cash} cash ${r.cash === 1 ? 'order needs its' : 'orders need their'} money given back in person at the door.`,
    );
  if (r.attention > 0)
    parts.push(
      `${orders(r.attention)} could not be refunded here; open the Orders tab to refund ${r.attention === 1 ? 'it' : 'them'}.`,
    );
  if (r.emailed > 0) parts.push(`${r.emailed} ${r.emailed === 1 ? 'buyer was' : 'buyers were'} emailed.`);
  if (r.notEmailed > 0)
    parts.push(
      `${r.notEmailed} ${r.notEmailed === 1 ? 'buyer' : 'buyers'} could not be emailed; download the orders list and tell them directly.`,
    );
  return parts.join(' ');
}

/** The registrants' notice with the paid part added (unchanged when there were no paid orders). */
function withPaid(
  notice: { tone: 'error' | 'info'; text: string },
  report: PaidCancelReport,
): { tone: 'error' | 'info'; text: string } {
  const paid = paidCancelText(report);
  if (!paid) return notice;
  return {
    tone: notice.tone === 'error' || report.attention > 0 || report.notEmailed > 0 ? 'error' : 'info',
    text: `${notice.text} ${paid}`,
  };
}

/** Cancels a whole published event, then tells every confirmed registrant and refunds every paid order. */
export async function cancelEventAndNotify(c: CancelContext) {
  const affected = await cancelEvent(c.live.db, {
    organizationId: c.organizationId,
    eventId: c.eventId,
    now: c.now,
  });
  const notice = await notify(c, affected, 'The event');
  return withPaid(notice, await refundCanceledOrders(c, affected));
}

/** Cancels one date of a series, then tells that date's confirmed registrants and refunds its paid orders. */
export async function cancelDateAndNotify(c: CancelContext & { occurrenceId: string }) {
  const affected = await cancelOccurrence(c.live.db, {
    organizationId: c.organizationId,
    eventId: c.eventId,
    occurrenceId: c.occurrenceId,
    now: c.now,
  });
  const notice = await notify(c, affected, 'That date');
  return withPaid(notice, await refundCanceledOrders(c, affected));
}

/**
 * A repeated sign-up: if the email already holds a confirmed registration for the date, email its link again.
 * Never reports whether one was found, so the page cannot be used to learn who is registered.
 */
export async function emailRegistrationLinkAgain(
  live: Pick<LiveContext, 'db' | 'env'>,
  input: {
    event: LiveEventDetail;
    occurrenceId: string;
    email: string;
    origin: string;
    now: number;
  },
): Promise<void> {
  const found = await recoverRegistration(live.db, live.env, {
    occurrenceId: input.occurrenceId,
    email: input.email,
    now: input.now,
  });
  if (!found) return;
  const occurrence = input.event.occurrences.find((o) => o.id === input.occurrenceId);
  try {
    await sendLiveEmail(
      live.env,
      confirmationEmail(
        found.email,
        found.name,
        found.partySize,
        whenWhere(input.event, occurrence?.startsAt),
        `${input.origin}/registrations/${found.manageToken}`,
        found.checkinCode,
      ),
    );
  } catch {
    // The page answers the same either way; the person can ask again later.
  }
}

// ── A paid event's details changed ─────────────────────────────────────────────────────────────────────────────

/** Emails the holders of a paid event that changed (the domain's `notifyHoldersOfChange`). */
export function notifyHoldersOfChange(
  live: Pick<LiveContext, 'db' | 'env'>,
  input: { organizationId: string; eventId: string; changes: readonly string[]; origin: string; now: number },
): Promise<{ emailed: number; notEmailed: number }> {
  return notifyHolders(live.db, live.env as PaidEnv & Record<string, unknown>, input);
}

export { holderChanges };

/** Organizer event actions that touch the database and send email, so the pages only call them. */
import {
  CANCEL_EMAIL_LIMIT,
  cancelEvent,
  cancelOccurrence,
  confirmationEmail,
  eventCanceledEmail,
  recoverRegistration,
  sendLiveEmail,
  type AffectedRegistrant,
  type LiveEventDetail,
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

/** Cancels a whole published event, then tells every confirmed registrant. */
export async function cancelEventAndNotify(c: CancelContext) {
  const affected = await cancelEvent(c.live.db, {
    organizationId: c.organizationId,
    eventId: c.eventId,
    now: c.now,
  });
  return notify(c, affected, 'The event');
}

/** Cancels one date of a series, then tells that date's confirmed registrants. */
export async function cancelDateAndNotify(c: CancelContext & { occurrenceId: string }) {
  const affected = await cancelOccurrence(c.live.db, {
    organizationId: c.organizationId,
    eventId: c.eventId,
    occurrenceId: c.occurrenceId,
    now: c.now,
  });
  return notify(c, affected, 'That date');
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

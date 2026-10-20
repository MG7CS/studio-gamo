/**
 * What happens on an event's page when a form is posted: send it for review, delete it, cancel one date or the whole
 * event (and tell the people who registered). The page only calls this and renders the result.
 */
import {
  OrganizerError,
  deleteUnpublishedEvent,
  submitEvent,
  type MembershipSummary,
  type OrganizerEventDetail,
} from '@gamo/domain';
import { cancelDateAndNotify, cancelEventAndNotify } from './organizer-events';
import { STATUS_AFTER_SAVE } from './event-editor';
import type { LiveContext } from './registration';

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
    if (!(error instanceof OrganizerError)) throw error;
    return { notice: { tone: 'error', text: messageFor(error.code) } };
  }
}

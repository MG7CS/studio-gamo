/**
 * What happens on an event's Registrations page when a form is posted: cancel one registration, tell the person, free
 * their seats. The page only calls this and renders the result; the rules live in `@gamo/domain`.
 */
import {
  OrganizerError,
  RegistrationError,
  canceledEmail,
  cancelRegistrationForOrganizer,
  sendLiveEmail,
} from '@gamo/domain';
import type { LiveContext } from './registration';
import { whenLabel } from './organizer-format';

export interface RegistrationsNotice {
  tone: 'success' | 'danger';
  text: string;
}

export async function cancelRegistrationAction(input: {
  live: Pick<LiveContext, 'db' | 'env'>;
  organizationId: string;
  registrationId: string;
  timeZone: string;
  now: number;
}): Promise<RegistrationsNotice> {
  const { live, organizationId, registrationId, timeZone, now } = input;
  try {
    const view = await cancelRegistrationForOrganizer(live.db, { organizationId, registrationId, now });
    await sendLiveEmail(
      live.env,
      canceledEmail(view.email, view.name, {
        title: view.eventTitle,
        whenLabel: whenLabel(view.startsAt, timeZone),
        venueLabel: '',
      }),
    ).catch(() => {});
    return {
      tone: 'success',
      text: `Canceled the registration for ${view.name}. Their seats are free again.`,
    };
  } catch (error) {
    if (!(error instanceof OrganizerError) && !(error instanceof RegistrationError)) throw error;
    return { tone: 'danger', text: 'That registration could not be canceled.' };
  }
}

/** The status word and tone of a registration row. */
export function registrationStatus(r: { status: string; checkedInAt: number | null }): {
  label: string;
  tone: 'success' | 'info' | 'warning' | 'neutral' | 'danger';
} {
  if (r.status === 'confirmed')
    return r.checkedInAt ? { label: 'Checked in', tone: 'success' } : { label: 'Confirmed', tone: 'info' };
  if (r.status === 'pending') return { label: 'Waiting for code', tone: 'warning' };
  if (r.status === 'expired') return { label: 'Expired', tone: 'neutral' };
  return { label: 'Canceled', tone: 'danger' };
}

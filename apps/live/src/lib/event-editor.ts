/** Form reading, field messages and the save action shared by the new-event and edit-event pages. */
import {
  OrganizerError,
  organizerErrorMessage,
  saveEvent,
  type EventFormValues,
  type SqlDatabase,
} from '@gamo/domain';

const text = (form: FormData, name: string) => String(form.get(name) ?? '');

export function readEventForm(form: FormData): EventFormValues {
  return {
    title: text(form, 'title'),
    category: text(form, 'category'),
    description: text(form, 'description'),
    performers: text(form, 'performers'),
    venueName: text(form, 'venueName'),
    address: text(form, 'address'),
    city: text(form, 'city'),
    state: text(form, 'state'),
    timezone: text(form, 'timezone'),
    schedule: text(form, 'schedule') || 'once',
    date: text(form, 'date'),
    startTime: text(form, 'startTime'),
    endTime: text(form, 'endTime'),
    until: text(form, 'until'),
    admission: text(form, 'admission'),
    externalUrl: text(form, 'externalUrl'),
    priceText: text(form, 'priceText'),
    refundPolicyText: text(form, 'refundPolicyText'),
    capacity: text(form, 'capacity'),
    maxPartySize: text(form, 'maxPartySize'),
    qrCheckin: form.get('qrCheckin') === 'yes',
    checkinOpensHours: text(form, 'checkinOpensHours'),
  };
}

export const EMPTY_EVENT: EventFormValues = {
  title: '',
  category: 'worship',
  description: '',
  performers: '',
  venueName: '',
  address: '',
  city: '',
  state: '',
  timezone: 'America/Phoenix',
  schedule: 'once',
  date: '',
  startTime: '19:00',
  endTime: '',
  until: '',
  admission: 'free_registration',
  externalUrl: '',
  priceText: '',
  refundPolicyText: '',
  capacity: '',
  maxPartySize: '6',
  qrCheckin: false,
  checkinOpensHours: '3',
};

const FIELD_MESSAGES: Record<string, string> = {
  title: 'Give the event a title (3 to 140 characters).',
  category: 'Choose a category.',
  description: 'Describe the event in at least 20 characters (up to 4,000).',
  performers: 'One performer per line, like "Name | Role" (up to 20; names under 100 characters).',
  venueName: 'Enter the venue or church name.',
  address: 'The address is too long.',
  city: 'Enter the city.',
  state: 'Use the two-letter state code, for example AZ.',
  timezone: 'Choose the time zone of the venue.',
  schedule: 'Choose how often the event happens.',
  date: 'Enter a date that has not passed.',
  startTime: 'Enter the start time.',
  endTime:
    'Enter a valid end time. It cannot equal the start time; an earlier time means the event ends after midnight.',
  until: 'Enter the last date. A series can have at most 52 dates.',
  admission: 'Choose how people attend.',
  externalUrl: 'Enter the full https:// address of the page where people get tickets or register.',
  priceText: 'Keep the price note under 300 characters.',
  refundPolicyText: 'Keep the refund note under 600 characters.',
  capacity: 'Capacity must be a whole number of at least 1, and not below the seats already taken.',
  maxPartySize: 'People per registration must be between 1 and 20.',
  qrCheckin: 'QR check-in is only for free events with registration.',
  checkinOpensHours: 'Choose how long before the start check-in opens.',
};

/** Result of trying to save: where to go, or what to show. */
export type SaveOutcome =
  | { kind: 'saved'; eventId: string; status: string }
  | { kind: 'errors'; errors: Record<string, string>; notice?: string };

export async function saveFromForm(
  db: SqlDatabase,
  args: { organizationId: string; eventId?: string; form: FormData; now: number },
): Promise<SaveOutcome> {
  const submit = text(args.form, 'intent') === 'submit';
  try {
    const result = await saveEvent(db, {
      organizationId: args.organizationId,
      eventId: args.eventId,
      input: readEventForm(args.form),
      submit,
      now: args.now,
    });
    return { kind: 'saved', ...result };
  } catch (error) {
    if (error instanceof OrganizerError) {
      if (error.code === 'invalid' && error.field)
        return {
          kind: 'errors',
          errors: { [error.field]: FIELD_MESSAGES[error.field] ?? 'Please check this field.' },
        };
      if (error.code === 'suspended')
        return {
          kind: 'errors',
          errors: {},
          notice: 'This organization is suspended, so events cannot be changed.',
        };
      if (error.code === 'status_locked')
        return { kind: 'errors', errors: {}, notice: 'This event can no longer be edited.' };
      if (error.code === 'quota' || error.code === 'not_ready')
        return { kind: 'errors', errors: {}, notice: organizerErrorMessage(error.code) };
    }
    throw error;
  }
}

export const STATUS_AFTER_SAVE: Record<string, string> = {
  draft: 'Saved as a draft.',
  pending_review: 'Sent to Gamo for review. The decision will show on the event page.',
  published: 'Published. It is now on Gamo Live.',
  changes_requested: 'Saved.',
};

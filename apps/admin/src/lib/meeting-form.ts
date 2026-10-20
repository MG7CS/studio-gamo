/**
 * The one meeting form of the admin (`components/MeetingForm.astro`), read on the server. Gamo Live organizations
 * and Community churches both use it: date, time, zone, format (video call or in person), the link or the place,
 * and a note. Organizations pass it to `scheduleVerificationMeeting`; churches keep their own record in the shared
 * database (`provider-review.ts`), which has no format column, so the format is written into the visible note.
 */
import { DEFAULT_MEETING_TIME_ZONE, zonedLocalToEpochSeconds, type MeetingInput } from '@gamo/domain';

/** The zones offered in the form (Gamo Live serves Christian events nationwide). */
export const MEETING_ZONES = [
  'America/Phoenix',
  'America/Denver',
  'America/Los_Angeles',
  'America/Chicago',
  'America/New_York',
  'Pacific/Honolulu',
  'America/Anchorage',
] as const;

export const MEETING_FORMAT_CHOICES = [
  { value: 'video', label: 'Video call' },
  { value: 'in_person', label: 'In person' },
] as const;

/** The form's field names, in one place for the component, the handlers and the tests. */
export const MEETING_FIELDS = {
  date: 'meeting_date',
  time: 'meeting_time',
  timeZone: 'meeting_zone',
  format: 'meeting_format',
  location: 'meeting_location',
  note: 'notes',
} as const;

export type MeetingField = keyof typeof MEETING_FIELDS;

const text = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
};

/** The meeting form as the domain's `MeetingInput` (the domain validates it). */
export function readMeetingForm(form: FormData): MeetingInput {
  return {
    date: text(form, MEETING_FIELDS.date).trim(),
    time: text(form, MEETING_FIELDS.time).trim(),
    timeZone: text(form, MEETING_FIELDS.timeZone).trim() || DEFAULT_MEETING_TIME_ZONE,
    format: text(form, MEETING_FIELDS.format).trim(),
    location: text(form, MEETING_FIELDS.location),
    note: text(form, MEETING_FIELDS.note).trim() || null,
  };
}

export type ChurchMeeting =
  | { ok: true; meetingAt: number; timeZone: string; location: string; notes: string }
  | { ok: false; message: string; field: MeetingField };

/**
 * The same form for a church's `schedule_meeting`: the wall-clock time as epoch seconds, and the format written at the
 * start of the note ("Video call." or "In person."), since the church record has no format column.
 */
export function readChurchMeeting(form: FormData): ChurchMeeting {
  const m = readMeetingForm(form);
  const choice = MEETING_FORMAT_CHOICES.find((c) => c.value === m.format);
  if (!choice) return { ok: false, message: 'Choose video call or in person.', field: 'format' };
  if (!(MEETING_ZONES as readonly string[]).includes(m.timeZone))
    return { ok: false, message: 'Choose a valid time zone.', field: 'timeZone' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date))
    return { ok: false, message: 'Enter the meeting date.', field: 'date' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.time))
    return { ok: false, message: 'Enter the meeting time.', field: 'time' };
  const meetingAt = zonedLocalToEpochSeconds(`${m.date}T${m.time}`, m.timeZone);
  if (meetingAt === null) return { ok: false, message: 'Enter the meeting date.', field: 'date' };
  const location = m.location.replace(/\s+/g, ' ').trim();
  if (!location)
    return {
      ok: false,
      message:
        choice.value === 'video' ? 'Enter the video call link.' : 'Enter where the meeting takes place.',
      field: 'location',
    };
  return {
    ok: true,
    meetingAt,
    timeZone: m.timeZone,
    location,
    notes: [`${choice.label}.`, m.note ?? ''].join(' ').trim(),
  };
}

/**
 * Which field of the meeting form an error names: a form field name (`meeting_date`), a domain detail (`date`,
 * `timeZone`) or the church record's own names (`meeting_at`). Null for anything else.
 */
export function meetingErrorField(field: string | null | undefined): MeetingField | null {
  if (!field) return null;
  if (field === 'meeting_at') return 'date';
  if (field in MEETING_FIELDS) return field as MeetingField;
  const entry = Object.entries(MEETING_FIELDS).find(([, name]) => name === field);
  return entry ? (entry[0] as MeetingField) : null;
}

export interface MeetingDefaults {
  date: string;
  time: string;
  timeZone: string;
  format: string;
  location: string;
}

/** The form's starting values for rescheduling a meeting: its date and time in its own zone. */
export function meetingDefaults(meeting: {
  startsAt: number;
  timeZone: string;
  format: string;
  location: string;
}): MeetingDefaults {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: meeting.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(meeting.startsAt * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    timeZone: meeting.timeZone,
    format: meeting.format,
    location: meeting.location,
  };
}

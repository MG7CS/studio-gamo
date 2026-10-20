/**
 * Pure logic behind a guest's registration ("ticket") page: what state to show, which actions are allowed, the
 * calendar file and the map link. No I/O; the page and the `calendar.ics` route only load data and call these.
 */

export interface TicketInput {
  /** Registration status in the database. */
  status: 'pending' | 'confirmed' | 'canceled' | 'expired';
  checkedInAt: number | null;
  /** The event has QR check-in on and this registration has its check-in code. */
  hasCheckinCode: boolean;
  /** Seconds since the epoch when the date starts. */
  startsAt: number;
  /** The date has ended (the catalog's `isPast`). */
  occurrenceOver: boolean;
  /** The event, or this date of it, was canceled by the organizer. */
  eventCanceled: boolean;
  /** Seconds since the epoch. */
  now: number;
}

export type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface TicketView {
  /** `active` = a live registration; `canceled`; `expired` = never confirmed or its hold ended. */
  state: 'active' | 'canceled' | 'expired';
  pill: { label: 'Confirmed' | 'Checked in' | 'Canceled' | 'Expired' | 'Event canceled'; tone: PillTone };
  showQr: boolean;
  showCalendar: boolean;
  showMaps: boolean;
  canCancel: boolean;
  /** One plain sentence under the details, or null. */
  note: string | null;
  /** For a confirmed guest at an event without QR check-in: how they get in. */
  doorHint: string | null;
}

export function ticketView(input: TicketInput): TicketView {
  const none = { showQr: false, showCalendar: false, showMaps: false, canCancel: false, doorHint: null };
  if (input.status === 'canceled')
    return {
      state: 'canceled',
      pill: { label: 'Canceled', tone: 'danger' },
      ...none,
      note: 'This registration was canceled and its seats were released.',
    };
  if (input.status !== 'confirmed')
    return {
      state: 'expired',
      pill: { label: 'Expired', tone: 'neutral' },
      ...none,
      note: 'This registration was never confirmed, so nothing was reserved.',
    };
  if (input.eventCanceled)
    return {
      state: 'active',
      pill: { label: 'Event canceled', tone: 'danger' },
      ...none,
      note: 'The organizer canceled this event.',
    };
  if (input.checkedInAt != null)
    return {
      state: 'active',
      pill: { label: 'Checked in', tone: 'success' },
      ...none,
      showMaps: !input.occurrenceOver,
      note: null,
    };
  return {
    state: 'active',
    pill: { label: 'Confirmed', tone: 'success' },
    showQr: input.hasCheckinCode && !input.occurrenceOver,
    showCalendar: !input.occurrenceOver,
    showMaps: !input.occurrenceOver,
    canCancel: input.startsAt > input.now,
    note: input.occurrenceOver ? 'This event has ended.' : null,
    doorHint: !input.hasCheckinCode && !input.occurrenceOver ? 'Give your name at the door.' : null,
  };
}

/** A Google Maps search for a place, the same link everywhere on Gamo Live. */
export function mapsSearchUrl(parts: readonly (string | null | undefined)[]): string {
  const query = parts.filter((p): p is string => Boolean(p && p.trim())).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export interface IcsEventInput {
  /** Stable id so a calendar app updates, not duplicates, the entry. */
  uid: string;
  title: string;
  startsAt: Date;
  /** Calendars need a length; when the event has no end time the entry lasts `defaultMinutes`. */
  endsAt?: Date | null;
  defaultMinutes?: number;
  location?: string | null;
  description?: string | null;
  /** A public address for the event (never the private registration link). */
  url?: string | null;
  now: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `20261019T153000Z` */
export function icsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g;

/** RFC 5545 TEXT escaping; line breaks become `\n` and other control characters are dropped (no header injection). */
export function icsEscape(text: string): string {
  return text
    .replace(/\r\n|\r|\n/g, '\n')
    .replace(CONTROL, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

const encoder = new TextEncoder();

/** Folds a content line to at most 75 octets per line (continuations start with a space), never inside a character. */
export function icsFold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

/** A one-event iCalendar file (CRLF line endings, as the standard requires). */
export function buildEventIcs(e: IcsEventInput): string {
  const end = e.endsAt ?? new Date(e.startsAt.getTime() + (e.defaultMinutes ?? 120) * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gamo Studios//Gamo Live//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsEscape(e.uid)}`,
    `DTSTAMP:${icsDate(e.now)}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url.replace(CONTROL, '').replace(/[\r\n]/g, '')}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/** The page title for each state of a registration: the status in plain words. */
export function ticketHeading(label: TicketView['pill']['label']): string {
  switch (label) {
    case 'Confirmed':
      return "You're registered";
    case 'Checked in':
      return "You're checked in";
    case 'Canceled':
      return 'Registration canceled';
    case 'Expired':
      return 'Registration expired';
    case 'Event canceled':
      return 'Event canceled';
  }
}

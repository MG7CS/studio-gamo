/**
 * `.ics` calendar file for an order (design T-06, §5.5): local time in the venue's IANA zone with a
 * VTIMEZONE block, a UID that is stable per order, and a SEQUENCE that rises with every reschedule,
 * venue change or cancellation so calendar apps update the existing entry instead of adding one.
 *
 * The VTIMEZONE holds one fixed-offset observance: the offset in force at the event start. That is
 * exact for the event (an event does not span a DST change in practice; if it does, DTEND is written
 * in UTC so the end instant stays correct).
 */
import { utcToZonedLocal, zoneAbbreviation, zoneOffsetMs, isValidTimeZone } from './events-time.ts';

export interface CalendarEventInput {
  /** e.g. `order-ord_…@live.gamostudio.org`. */
  uid: string;
  sequence: number;
  title: string;
  description: string;
  location: string;
  url: string;
  startsAt: number;
  endsAt: number | null;
  timezone: string;
  cancelled?: boolean;
  /** DTSTAMP (epoch seconds). */
  now: number;
}

function escapeIcs(text: string): string {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

const utcStamp = (s: number) =>
  new Date(s * 1000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const localStamp = (s: number, zone: string) => {
  const l = utcToZonedLocal(s, zone);
  return `${l.date.replace(/-/g, '')}T${l.time.replace(':', '')}00`;
};

function offsetText(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const abs = Math.abs(ms) / 60000;
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
}

export function buildCalendarIcs(e: CalendarEventInput): string {
  const zone = isValidTimeZone(e.timezone) ? e.timezone : 'UTC';
  const end = e.endsAt ?? e.startsAt + 2 * 3600;
  const startOffset = zoneOffsetMs(e.startsAt * 1000, zone);
  const sameOffset = zoneOffsetMs(end * 1000, zone) === startOffset;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gamo Studios//Gamo Live//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${e.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VTIMEZONE',
    `TZID:${zone}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    `TZOFFSETFROM:${offsetText(startOffset)}`,
    `TZOFFSETTO:${offsetText(startOffset)}`,
    `TZNAME:${escapeIcs(zoneAbbreviation(e.startsAt, zone))}`,
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `SEQUENCE:${Math.max(0, Math.floor(e.sequence))}`,
    `DTSTAMP:${utcStamp(e.now)}`,
    `DTSTART;TZID=${zone}:${localStamp(e.startsAt, zone)}`,
    sameOffset ? `DTEND;TZID=${zone}:${localStamp(end, zone)}` : `DTEND:${utcStamp(end)}`,
    `SUMMARY:${escapeIcs(e.title)}`,
    `DESCRIPTION:${escapeIcs(e.description)}`,
    `LOCATION:${escapeIcs(e.location)}`,
    `URL:${e.url}`,
    `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** A map search link for the venue address (no third-party script; opens the person's map app). */
export function mapSearchUrl(parts: Array<string | null | undefined>): string {
  const query = parts.filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

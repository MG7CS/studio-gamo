/**
 * Search-engine data for Gamo Live pages (schema.org). Pure functions: the page passes the event it already
 * loaded and the site origin. Only facts we have are emitted; nothing is claimed about verification, prices
 * we do not know or images we do not have.
 */
import type { LiveEventWithDetails } from './catalog.ts';

export type SeoEvent = Pick<
  LiveEventWithDetails,
  | 'slug'
  | 'title'
  | 'description'
  | 'startsAt'
  | 'endsAt'
  | 'timezone'
  | 'status'
  | 'isPast'
  | 'admission'
  | 'externalUrl'
  | 'venueName'
  | 'address'
  | 'city'
  | 'state'
  | 'organizerName'
  | 'artworkUrl'
  | 'artworkRightsVerified'
  | 'performers'
>;

const SCHEMA = 'https://schema.org';

/** UTC offset of an IANA time zone at an instant, in minutes (Phoenix -420, New York -240 in summer). */
export function utcOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const localAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((localAsUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** `2026-11-07T19:00:00-07:00`: the wall-clock time in the event's zone with its real UTC offset. */
export function isoWithOffset(instant: Date, timeZone: string): string {
  const offset = utcOffsetMinutes(instant, timeZone);
  const local = new Date(Math.floor(instant.getTime() / 1000) * 1000 + offset * 60000);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${local.toISOString().slice(0, 19)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const absolute = (origin: string, value: string) =>
  /^https?:\/\//i.test(value)
    ? value
    : `${origin.replace(/\/+$/, '')}${value.startsWith('/') ? '' : '/'}${value}`;

/** schema.org `Event` for an event page. */
export function eventJsonLd(event: SeoEvent, origin: string): Record<string, unknown> {
  const base = origin.replace(/\/+$/, '');
  const url = `${base}/events/${event.slug}`;
  const canceled = event.status === 'canceled';

  const offers = (() => {
    if (canceled || event.isPast) return null;
    if (event.admission === 'free_registration')
      return { '@type': 'Offer', url: `${url}/register`, price: '0', priceCurrency: 'USD' };
    if (event.admission === 'external_tickets' && event.externalUrl)
      return { '@type': 'Offer', url: event.externalUrl };
    return null;
  })();

  const address = {
    '@type': 'PostalAddress',
    ...(event.address ? { streetAddress: event.address } : {}),
    ...(event.city ? { addressLocality: event.city } : {}),
    ...(event.state ? { addressRegion: event.state } : {}),
    addressCountry: 'US',
  };

  return {
    '@context': SCHEMA,
    '@type': 'Event',
    name: event.title,
    url,
    startDate: isoWithOffset(event.startsAt, event.timezone),
    ...(event.endsAt ? { endDate: isoWithOffset(event.endsAt, event.timezone) } : {}),
    eventStatus: `${SCHEMA}/${canceled ? 'EventCancelled' : 'EventScheduled'}`,
    eventAttendanceMode: `${SCHEMA}/OfflineEventAttendanceMode`,
    ...(event.description ? { description: event.description } : {}),
    ...(event.venueName
      ? {
          location: {
            '@type': 'Place',
            name: event.venueName,
            ...(event.address || event.city ? { address } : {}),
          },
        }
      : {}),
    ...(event.organizerName ? { organizer: { '@type': 'Organization', name: event.organizerName } } : {}),
    ...(event.performers.length
      ? { performer: event.performers.map((p) => ({ '@type': 'PerformingGroup', name: p.displayName })) }
      : {}),
    ...(offers ? { offers } : {}),
    ...(event.artworkRightsVerified && event.artworkUrl ? { image: [absolute(base, event.artworkUrl)] } : {}),
  };
}

/** JSON for a `<script type="application/ld+json">` block; `<` is escaped so text can never close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

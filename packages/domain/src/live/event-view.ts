/**
 * What an event page shows, worked out once and kept out of the page: which single action the panel offers, how the
 * dates of a multi-date event read, the facts people need and which other events are worth a mention. Pure functions
 * over the catalog's event, so every rule here has a unit test.
 */
import type { LiveEventDetail, LiveEventWithDetails } from './catalog.ts';
import { formatLocalEventSchedule } from '../services/live-external-discovery.ts';

/** The most upcoming dates listed before the rest fold into "Show all N dates". */
export const VISIBLE_DATE_COUNT = 6;
/** The most related events shown under an event. */
export const RELATED_EVENT_COUNT = 3;

export type EventPanel =
  | { kind: 'canceled' }
  | { kind: 'past' }
  | { kind: 'free_open' }
  | { kind: 'register'; full: boolean; seats: string | null; href: string }
  | { kind: 'external'; provider: string | null; url: string | null };

export type DateState = 'open' | 'full' | 'canceled' | 'past';

export interface EventDateRow {
  id: string;
  label: string;
  state: DateState;
  /** "Full", "Canceled", "3 seats left", or null when there is nothing to say. */
  note: string | null;
  /** Where to register for this date; null when registering for it is not possible. */
  registerHref: string | null;
}

type DatedEvent = Pick<
  LiveEventDetail,
  | 'slug'
  | 'timezone'
  | 'admission'
  | 'capacity'
  | 'status'
  | 'isPast'
  | 'externalUrl'
  | 'externalTicketProvider'
  | 'occurrences'
  | 'seatsTaken'
>;

/** `/events/<slug>/register`, or with `?date=<occurrence id>` to open it on one date. */
export function registerHref(slug: string, occurrenceId?: string): string {
  const base = `/events/${slug}/register`;
  return occurrenceId ? `${base}?date=${encodeURIComponent(occurrenceId)}` : base;
}

function seatsNote(capacity: number | null, taken: number): { full: boolean; note: string | null } {
  if (capacity == null) return { full: false, note: null };
  const left = Math.max(0, capacity - taken);
  if (left === 0) return { full: true, note: 'Full' };
  return { full: false, note: `${left} ${left === 1 ? 'seat' : 'seats'} left` };
}

/** Every date of the event with its own state, in time order. */
export function eventDateRows(event: DatedEvent): EventDateRow[] {
  const registration = event.admission === 'free_registration';
  const eventCanceled = event.status === 'canceled';
  return event.occurrences.map((o) => {
    const label = formatLocalEventSchedule(null, null, event.timezone, o.startsAt).fullLabel;
    if (o.isPast) return { id: o.id, label, state: 'past', note: null, registerHref: null };
    if (o.canceled || eventCanceled)
      return { id: o.id, label, state: 'canceled', note: 'Canceled', registerHref: null };
    const seats = registration ? seatsNote(event.capacity, o.seatsTaken) : { full: false, note: null };
    return {
      id: o.id,
      label,
      state: seats.full ? 'full' : 'open',
      note: seats.note,
      registerHref: registration && !seats.full ? registerHref(event.slug, o.id) : null,
    };
  });
}

/** Upcoming dates (including canceled ones, which say so) and past dates, each in time order. */
export function splitDates(rows: EventDateRow[]): { upcoming: EventDateRow[]; past: EventDateRow[] } {
  return {
    upcoming: rows.filter((r) => r.state !== 'past'),
    past: rows.filter((r) => r.state === 'past'),
  };
}

/** The one thing the action panel offers, decided from the event and its dates. */
export function eventPanel(event: DatedEvent): EventPanel {
  if (event.status === 'canceled') return { kind: 'canceled' };
  if (event.isPast) return { kind: 'past' };
  const upcoming = event.occurrences.filter((o) => !o.isPast);
  const active = upcoming.filter((o) => !o.canceled);
  // Every remaining date was called off: the visitor needs to hear "canceled", not see an empty list.
  if (event.occurrences.length > 0 && upcoming.length > 0 && active.length === 0) return { kind: 'canceled' };
  if (event.occurrences.length > 0 && upcoming.length === 0) return { kind: 'past' };

  if (event.admission === 'external_tickets')
    return { kind: 'external', provider: event.externalTicketProvider, url: event.externalUrl };
  if (event.admission === 'free_open') return { kind: 'free_open' };

  const seats = active.map((o) => seatsNote(event.capacity, o.seatsTaken));
  const full =
    seats.length > 0 ? seats.every((s) => s.full) : seatsNote(event.capacity, event.seatsTaken).full;
  // With several dates each row carries its own seats; a single date says it in the panel.
  const single = active.length <= 1;
  return {
    kind: 'register',
    full,
    seats: single && seats[0] ? seats[0].note : null,
    href: registerHref(event.slug),
  };
}

/** Blank-line separated paragraphs of the organizer's text, trimmed; line breaks inside one stay as spaces. */
export function descriptionParagraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/** An outbound Google Maps search for the place; no key, no embed. */
/** The street address and "City, ST", without repeating the city when the address already contains it. */
export function placeLine(event: Pick<LiveEventWithDetails, 'address' | 'city' | 'state'>): string {
  const cityState = `${event.city}, ${event.state}`;
  const address = (event.address ?? '').trim();
  if (address && event.city && address.toLowerCase().includes(event.city.toLowerCase())) return address;
  return [address, cityState].filter(Boolean).join(', ');
}

export function mapsUrl(
  event: Pick<LiveEventWithDetails, 'venueName' | 'address' | 'city' | 'state'>,
): string {
  const query = [event.venueName, placeLine(event)].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Who is named as the organizer, and whether an admin verified them. Listings Gamo collected name their source. */
export function organizerLine(
  event: Pick<
    LiveEventWithDetails,
    'organizerName' | 'organizerVerified' | 'originalOrganizerName' | 'listingType'
  >,
): { name: string; verified: boolean } {
  const name =
    event.listingType === 'external_discovery' && event.originalOrganizerName
      ? event.originalOrganizerName
      : event.organizerName;
  return { name, verified: event.listingType === 'organizer_submitted' && event.organizerVerified };
}

/** The meta description: plain, with the title, the place and the next date. */
export function eventMetaDescription(
  event: Pick<LiveEventWithDetails, 'title' | 'venueName' | 'city' | 'state' | 'timezone' | 'startsAt'>,
): string {
  const date = formatLocalEventSchedule(null, null, event.timezone, event.startsAt).dateLabel;
  return `${event.title} at ${event.venueName} in ${event.city}, ${event.state} on ${date}.`;
}

/**
 * Up to three other upcoming events worth a look: the same city or metro first, then the same category. Events that
 * share neither are left out; a short list is better than filler.
 */
export function pickRelatedEvents(
  event: Pick<LiveEventWithDetails, 'id' | 'city' | 'state' | 'metroSlug' | 'category'>,
  candidates: LiveEventWithDetails[],
  max = RELATED_EVENT_COUNT,
): LiveEventWithDetails[] {
  const sameCity = (c: LiveEventWithDetails) =>
    (c.city === event.city && c.state === event.state) ||
    (event.metroSlug != null && c.metroSlug === event.metroSlug);
  const sameCategory = (c: LiveEventWithDetails) => c.category === event.category;
  return candidates
    .filter((c) => c.id !== event.id && !c.isPast && c.status !== 'canceled')
    .filter((c) => sameCity(c) || sameCategory(c))
    .map((c, index) => ({ c, index, rank: (sameCity(c) ? 2 : 0) + (sameCategory(c) ? 1 : 0) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .slice(0, max)
    .map((x) => x.c);
}

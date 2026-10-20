/** Pure helpers for the public venue list and the home page, so the pages only render what these return. */
import type { LiveEventWithDetails, LiveVenueSummary } from './catalog.ts';

/** The city/region labels that occur among the venues, in alphabetical order, each once. */
export function venueRegionOptions(venues: Pick<LiveVenueSummary, 'regionLabel'>[]): string[] {
  return [...new Set(venues.map((v) => v.regionLabel))].sort((a, b) => a.localeCompare(b));
}

/**
 * The venues of one region. A region that no venue has (for example a stale link) is treated as "all", so the
 * list never comes back empty because of a filter the visitor cannot see.
 */
export function filterVenuesByRegion<T extends Pick<LiveVenueSummary, 'regionLabel'>>(
  venues: T[],
  region: string | null | undefined,
): { venues: T[]; region: string | null } {
  const wanted = (region ?? '').trim();
  if (!wanted || !venues.some((v) => v.regionLabel === wanted)) return { venues, region: null };
  return { venues: venues.filter((v) => v.regionLabel === wanted), region: wanted };
}

/** Up to `max` upcoming events of a venue to show on its card, and how many more there are. */
export function venueEventPreview(
  venue: Pick<LiveVenueSummary, 'upcomingEvents' | 'upcomingEventCount'>,
  max = 2,
): { events: Pick<LiveEventWithDetails, 'slug' | 'title'>[]; moreCount: number } {
  const events = venue.upcomingEvents.slice(0, max).map((e) => ({ slug: e.slug, title: e.title }));
  return { events, moreCount: Math.max(0, venue.upcomingEventCount - events.length) };
}

/**
 * The home page's events. Only an event an admin marked as featured gets the "Featured by Gamo" treatment; the
 * next few upcoming events follow in date order, without repeating the featured one. Canceled and past events
 * never appear.
 */
export function pickHomeEvents<
  T extends Pick<LiveEventWithDetails, 'id' | 'isFeatured' | 'isPast' | 'status'>,
>(events: T[], max = 4): { featured: T | null; upcoming: T[] } {
  const open = events.filter((e) => !e.isPast && e.status === 'approved');
  const featured = open.find((e) => e.isFeatured) ?? null;
  return { featured, upcoming: open.filter((e) => e.id !== featured?.id).slice(0, max) };
}

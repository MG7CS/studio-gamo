import { formatUsd } from '@studio-gamo/ui/lib/format';
/**
 * Gamo Live showcase data & database mapper for the Gamo Studios main website (`apps/web/src/pages/live.astro`).
 *
 * Permanent rules:
 * 1. Always render real approved/published events from our database (`events` table in D1 via `LiveService`),
 *    with a deterministic fallback to the verified real event catalog (`GAMO_LIVE_VERIFIED_CATALOG_2026_10_15`)
 *    if D1 is temporarily unreachable. Never display fictional sample events such as "Harvest Night of Gospel".
 * 2. Any event whose scheduled date/time is already in the past (`isEventPast(event, now) === true`)
 *    MUST resolve to `status = 'past'`, `isPast = true`, `isClosed = true`, and display as closed/past
 *    with registration/ticket actions disabled.
 */
import type { PhotoKey } from '@studio-gamo/ui/lib/images';
import {
  GAMO_LIVE_VERIFIED_CATALOG_2026_10_15,
  buildFactualEditorialSummary,
  evaluateCandidateForEditorialImport,
  formatLocalEventSchedule,
  getEventLifecycleStatus,
  inferExternalProviderName,
  isEventPast,
  type LiveEventWithDetails,
} from '@gamo/domain';

export type EventCategory = 'concert' | 'worship' | 'bible' | 'conference' | 'youth';
export type Ticketing = 'free' | 'preview' | 'external';
export type EventStatus = 'scheduled' | 'rescheduled' | 'canceled' | 'past';

export interface TicketTier {
  name: string;
  priceCents: number;
  note: string;
}

export interface LiveEvent {
  id: string;
  /** Destination path on the standalone Gamo Live marketplace (`apps/live`). */
  productPath: string;
  /** Ticket / action destination path on the standalone Gamo Live marketplace (`apps/live`). */
  ticketPath: string;
  /** Direct external ticket URL when applicable */
  externalUrl?: string | null;
  sample: boolean;
  title: string;
  tagline: string;
  category: EventCategory;
  date: string; // ISO date (YYYY-MM-DD local event date)
  time: string;
  city: string;
  state: string;
  venue: string;
  organizer: string; // organizer slug
  organizerName: string;
  photo: PhotoKey;
  photoPosition?: string;
  ticketing: Ticketing;
  status: EventStatus;
  isPast: boolean;
  isClosed: boolean;
  recurring?: string;
  featured?: boolean;
  tiers: TicketTier[];
  externalSource?: string;
  description: string;
}

export interface Organizer {
  slug: string;
  sample: boolean;
  name: string;
  kind: string;
  city: string;
  photo: PhotoKey;
  bio: string;
}

export const categoryLabels: Record<EventCategory, string> = {
  concert: 'Christian concert',
  worship: 'Worship gathering',
  bible: 'Bible study',
  conference: 'Christian conference',
  youth: 'Youth & family',
};

const PHOTO_ROTATION: PhotoKey[] = [
  'gospelVocalists',
  'worshipNight',
  'concertCrowdWide',
  'worshipLeaderGolden',
  'acousticLeader',
  'worshipBand',
  'sanctuaryCongregation',
  'churchGoldenHour',
  'acousticLeaderAlt',
  'churchModernDay',
];

function resolvePhotoKey(rawKey: string | null | undefined, index: number, category: string): PhotoKey {
  const validKeys = new Set<string>(PHOTO_ROTATION);
  if (rawKey && validKeys.has(rawKey)) {
    return rawKey as PhotoKey;
  }
  if (category === 'worship') {
    const worshipPhotos: PhotoKey[] = ['worshipNight', 'worshipBand', 'sanctuaryCongregation', 'churchGoldenHour'];
    return worshipPhotos[index % worshipPhotos.length];
  }
  return PHOTO_ROTATION[index % PHOTO_ROTATION.length];
}

function normalizeCategory(raw: string | null | undefined): EventCategory {
  if (raw === 'worship' || raw === 'worship_event') return 'worship';
  if (raw === 'bible') return 'bible';
  if (raw === 'conference') return 'conference';
  if (raw === 'youth') return 'youth';
  return 'concert';
}

function toIsoDate(startDateLocal: string | null | undefined, startsAt: Date | string, timezone?: string | null): string {
  if (startDateLocal && /^\d{4}-\d{2}-\d{2}$/.test(startDateLocal)) {
    return startDateLocal;
  }
  const dt = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (!Number.isFinite(dt.getTime())) return '2026-11-07';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(dt);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '11';
  const d = parts.find((p) => p.type === 'day')?.value ?? '07';
  return `${y}-${m}-${d}`;
}

function slugifyOrganizer(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-') || 'gamo-live-listings'
  );
}

/**
 * Maps real `LiveEventWithDetails` records from D1 (`LiveService.listDiscoverableEvents`)
 * into the `LiveEvent` view model used across the `/live` showcase components, enforcing
 * the Past Event Closure Rule (`status = 'past'`, `isPast = true`, `isClosed = true`).
 */
export function mapDbEventsToMarketingEvents(
  dbEvents: LiveEventWithDetails[],
  referenceNow: Date = new Date()
): LiveEvent[] {
  const mapped = dbEvents.map((row, index): LiveEvent => {
    const category = normalizeCategory(row.category);
    const isoDate = toIsoDate(row.startDateLocal, row.startsAt, row.timezone);
    const schedule = formatLocalEventSchedule(
      row.startDateLocal,
      row.startTimeLocal,
      row.timezone,
      row.startsAt
    );

    const past = typeof row.isPast === 'boolean' ? row.isPast : isEventPast(row, referenceNow);
    const lifecycleStatus = getEventLifecycleStatus(row, referenceNow);
    const status: EventStatus =
      row.status === 'canceled'
        ? 'canceled'
        : past || lifecycleStatus === 'past'
          ? 'past'
          : row.status === 'rescheduled'
            ? 'rescheduled'
            : 'scheduled';

    const isExternal =
      row.listingType === 'external_discovery' ||
      Boolean(row.externalOnly) ||
      row.admissionType === 'external';

    const ticketing: Ticketing = isExternal
      ? 'external'
      : row.admissionType === 'free'
        ? 'free'
        : 'preview';

    const providerName =
      row.externalTicketProvider ||
      inferExternalProviderName(row.externalUrl, null) ||
      (isExternal ? 'Official event page' : undefined);

    const organizerDisplayName =
      row.originalOrganizerName ||
      (isExternal ? row.venueName : row.organizerName) ||
      row.publishedByLabel ||
      'Gamo Live Listings';
    const organizerSlug = slugifyOrganizer(organizerDisplayName);

    const tiers: TicketTier[] =
      row.tiers && row.tiers.length > 0
        ? row.tiers.map((tier) => ({
            name: tier.name,
            priceCents: tier.priceCents,
            note: tier.note || '',
          }))
        : typeof row.priceMinCents === 'number'
          ? [
              {
                name: isExternal ? `Tickets via ${providerName}` : 'General Admission',
                priceCents: row.priceMinCents,
                note: isExternal ? 'Sold on official ticket site' : '',
              },
            ]
          : [];

    const eventPath = `/events/${row.slug || row.id}`;

    return {
      id: row.slug || row.id,
      productPath: eventPath,
      ticketPath: eventPath,
      externalUrl: row.externalUrl ?? null,
      sample: false,
      featured: Boolean(row.isFeatured) || index < 4,
      title: row.title,
      tagline:
        row.tagline ||
        `${row.venueName} · ${row.city}, ${row.state}`,
      category,
      date: isoDate,
      time: schedule.timeLabel,
      city: row.city,
      state: row.state,
      venue: row.venueName,
      organizer: organizerSlug,
      organizerName: organizerDisplayName,
      photo: resolvePhotoKey(row.photoKey, index, category),
      ticketing,
      status,
      isPast: past,
      isClosed: past || status === 'canceled',
      tiers,
      externalSource: providerName,
      description: row.description,
    };
  });

  // Sort upcoming events first in chronological order, then past/closed events
  mapped.sort((a, b) => {
    if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
    return a.date.localeCompare(b.date);
  });

  // Ensure the top 4 upcoming non-canceled events are marked featured for the hero carousel
  let featuredCount = 0;
  for (const ev of mapped) {
    if (!ev.isPast && ev.status !== 'canceled' && featuredCount < 4) {
      ev.featured = true;
      featuredCount++;
    } else {
      ev.featured = false;
    }
  }

  return mapped;
}

/**
 * Builds the verified catalog fallback directly from `GAMO_LIVE_VERIFIED_CATALOG_2026_10_15`
 * so that even if a local/static build runs without D1, only real verified events are shown.
 */
export function buildVerifiedCatalogFallbackEvents(referenceNow: Date = new Date()): LiveEvent[] {
  const approvedCandidates = GAMO_LIVE_VERIFIED_CATALOG_2026_10_15.events.filter((candidate) => {
    // Same rules as the editorial import (no revalidateUnfetched): listings held for an
    // unverified ticket destination must not appear here either, or they would link to a 404.
    const evalResult = evaluateCandidateForEditorialImport(candidate, {
      referenceNow: new Date('2026-10-15T00:00:00Z'),
    });
    return evalResult.editorialDecision === 'approved';
  });

  const syntheticDbRows: LiveEventWithDetails[] = approvedCandidates.map((candidate, idx) => {
    // Same rules as the editorial import (no revalidateUnfetched): listings held for an
    // unverified ticket destination must not appear here either, or they would link to a 404.
    const evalResult = evaluateCandidateForEditorialImport(candidate, {
      referenceNow: new Date('2026-10-15T00:00:00Z'),
    });
    const summary = buildFactualEditorialSummary(candidate);
    const providerName = inferExternalProviderName(
      candidate.external_destination?.url,
      candidate.external_destination?.provider_name
    );
    const past = isEventPast(
      {
        startsAt: evalResult.startsAt,
        startDateLocal: candidate.start_date_local,
        startTimeLocal: candidate.start_time_local,
        timezone: candidate.timezone,
      },
      referenceNow
    );

    return {
      id: `evt_seed_${evalResult.slug}`,
      organizerId: 'orgprof_gamo_live_listings',
      title: candidate.title,
      slug: evalResult.slug,
      category: evalResult.normalizedCategory,
      tagline: summary.tagline,
      description: summary.description,
      venueName: candidate.venue.name || 'Venue TBA',
      address: candidate.venue.street_address ?? null,
      city: candidate.venue.city,
      state: candidate.venue.state,
      country: candidate.venue.country || 'US',
      metroSlug: candidate.metro_slug,
      startsAt: evalResult.startsAt,
      endsAt: null,
      startDateLocal: candidate.start_date_local,
      startTimeLocal: candidate.start_time_local ?? null,
      timezone: candidate.timezone,
      admissionType: 'external',
      listingType: 'external_discovery',
      importKey: candidate.import_key ?? null,
      editorialStatus: 'published',
      publishedByUserId: 'usr_gamo_live_listings',
      publishedByLabel: 'Gamo Live Listings',
      originalOrganizerName: candidate.original_organizer_name ?? null,
      externalDestinationKind: candidate.external_destination?.kind ?? 'official_ticket_page',
      externalTicketProvider: providerName,
      externalOnly: true,
      checkoutOnGamo: false,
      priceMinCents:
        typeof candidate.ticketing?.price_min_usd === 'number'
          ? Math.round(candidate.ticketing.price_min_usd * 100)
          : null,
      currency: 'USD',
      availabilityStatus: candidate.ticketing?.availability ?? 'unverified',
      ticketAvailability: candidate.ticketing?.availability ?? 'unverified',
      artworkUrl: null,
      artworkRightsVerified: false,
      artworkLicenseCredit: null,
      independentDisclosure: 'Independent listing · Tickets sold by the external provider.',
      sourceUrlsJson: JSON.stringify(candidate.source_urls ?? []),
      editorialNotes: null,
      lastVerifiedAt: new Date('2026-10-15T00:00:00Z'),
      isFeatured: idx < 4,
      photoKey: PHOTO_ROTATION[idx % PHOTO_ROTATION.length],
      externalUrl: candidate.external_destination?.url ?? null,
      status: 'approved',
      createdAt: new Date('2026-10-15T00:00:00Z'),
      organizerName: candidate.venue.name || 'Gamo Live Listings',
      organizerKind: 'venue',
      tiers: [],
      totalRegistered: 0,
      performers: (candidate.performers ?? []).map((name, pIdx) => ({
        id: `perf_${idx}_${pIdx}`,
        displayName: name,
        billingOrder: pIdx + 1,
        roleLabel: pIdx === 0 ? 'Headliner' : 'Special Guest',
      })),
      isPast: past,
      isClosed: past,
      lifecycleStatus: past ? 'past' : 'scheduled',
    };
  });

  return mapDbEventsToMarketingEvents(syntheticDbRows, referenceNow);
}

/**
 * Builds the featured organizers / venues list dynamically from real events.
 */
export function buildOrganizersFromEvents(eventList: LiveEvent[]): Organizer[] {
  const bySlug = new Map<string, { org: Organizer; count: number }>();

  for (let i = 0; i < eventList.length; i++) {
    const e = eventList[i];
    const existing = bySlug.get(e.organizer);
    if (existing) {
      existing.count += 1;
    } else {
      const isChurch = /church|chapel|cathedral|fellowship|ministry/i.test(e.venue);
      bySlug.set(e.organizer, {
        org: {
          slug: e.organizer,
          sample: false,
          name: e.organizerName || e.venue,
          kind: isChurch ? 'Host church & venue' : 'Concert venue & host',
          city: `${e.city}, ${e.state}`,
          photo: PHOTO_ROTATION[i % PHOTO_ROTATION.length],
          bio: `Verified Christian event venue and host location in ${e.city}, ${e.state}.`,
        },
        count: 1,
      });
    }
  }

  return [...bySlug.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((entry) => entry.org);
}

export const events: LiveEvent[] = buildVerifiedCatalogFallbackEvents();
export const organizers: Organizer[] = buildOrganizersFromEvents(events);

export const getOrganizer = (slug: string, orgList: Organizer[] = organizers): Organizer =>
  orgList.find((o) => o.slug === slug) ?? {
    slug,
    sample: false,
    name: 'Gamo Live Listings',
    kind: 'Verified directory',
    city: 'Nationwide',
    photo: 'gospelVocalists',
    bio: 'Curated Christian concerts, worship nights, and church gatherings.',
  };

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
export const dateParts = (iso: string) => ({
  day: fmt(iso, { day: 'numeric' }),
  month: fmt(iso, { month: 'short' }),
  weekday: fmt(iso, { weekday: 'short' }),
  long: fmt(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
});
const price = (cents: number) => (cents === 0 ? 'Free' : formatUsd(cents));
export const fromPrice = (e: LiveEvent) => {
  if (e.isPast || e.status === 'past') {
    return 'Past · Closed';
  }
  if (e.status === 'canceled') {
    return 'Canceled';
  }
  if (e.ticketing === 'free') {
    return 'Free';
  }
  if (e.tiers && e.tiers.length > 0) {
    const min = Math.min(...e.tiers.map((x) => x.priceCents));
    return min === 0 ? 'Free' : `From ${price(min)}`;
  }
  if (e.externalSource) {
    return `Tickets via ${e.externalSource}`;
  }
  return 'Official ticket page';
};

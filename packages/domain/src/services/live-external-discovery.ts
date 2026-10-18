/**
 * Gamo Live — Curated External Concert & Worship Discovery Module
 *
 * Governs the internal `Gamo Live Listings` editorial publisher identity,
 * metro market catalog, external outbound destination validation, factual
 * editorial summary generation, and candidate review rules.
 *
 * Truthfulness & Non-Deception Invariants:
 * - External discovery listings are independent referral listings, never Gamo-produced
 *   or Gamo-ticketed events.
 * - Unknown prices, street addresses, start times, or organizer names remain `null`.
 * - External poster artwork is never displayed unless `artwork_rights_verified === true`.
 * - Every outbound ticket/event URL must use HTTPS and resolve to a verified provider,
 *   organizer, or venue domain.
 */

export const GAMO_LIVE_PUBLISHER_ORG_ID = 'org_gamo_live_listings';
export const GAMO_LIVE_PUBLISHER_ORG_SLUG = 'gamo-live-listings';
export const GAMO_LIVE_PUBLISHER_ORG_NAME = 'Gamo Live Listings';
export const GAMO_LIVE_PUBLISHER_PROFILE_ID = 'orgprof_gamo_live_listings';
export const GAMO_LIVE_PUBLISHER_USER_ID = 'usr_gamo_live_listings_editorial';
export const GAMO_LIVE_PUBLISHER_EMAIL = 'listings-editorial@gamostudio.org';
export const GAMO_LIVE_PUBLISHER_LABEL = 'Gamo Live Listings';

export const DEFAULT_INDEPENDENT_DISCLOSURE = 'Independent listing · Tickets sold by the external provider.';

export interface GamoLiveMetro {
  slug: string;
  name: string;
  state: string;
  displayLabel: string;
  regionLabel: string;
  cities: string[];
  lat: number;
  lng: number;
  timezone: string;
  isPrimaryLaunchMarket: boolean;
  introCopy: string;
}

export const GAMO_LIVE_METROS: readonly GamoLiveMetro[] = [
  {
    slug: 'phoenix-az',
    name: 'Phoenix',
    state: 'AZ',
    displayLabel: 'Phoenix, AZ',
    regionLabel: 'Phoenix & Valley of the Sun, AZ',
    cities: ['Phoenix', 'Glendale', 'Scottsdale', 'Tempe', 'Mesa', 'Chandler'],
    lat: 33.4484,
    lng: -112.074,
    timezone: 'America/Phoenix',
    isPrimaryLaunchMarket: true,
    introCopy:
      'Discover verified Christian concerts, arena worship nights, and live ministry gatherings across Phoenix, Glendale, and the Valley of the Sun.',
  },
  {
    slug: 'atlanta-ga',
    name: 'Atlanta',
    state: 'GA',
    displayLabel: 'Atlanta, GA',
    regionLabel: 'Greater Atlanta, Duluth & Woodstock, GA',
    cities: ['Atlanta', 'Duluth', 'Woodstock', 'Powder Springs', 'Marietta'],
    lat: 33.749,
    lng: -84.388,
    timezone: 'America/New_York',
    isPrimaryLaunchMarket: false,
    introCopy:
      'Explore verified Christian concerts and church worship nights across Greater Atlanta, Duluth, and Woodstock.',
  },
  {
    slug: 'nashville-tn',
    name: 'Nashville',
    state: 'TN',
    displayLabel: 'Nashville, TN',
    regionLabel: 'Nashville & Middle Tennessee',
    cities: ['Nashville', 'Franklin', 'Brentwood'],
    lat: 36.1627,
    lng: -86.7816,
    timezone: 'America/Chicago',
    isPrimaryLaunchMarket: false,
    introCopy:
      'Browse verified Christian concerts, seasonal tours, and worship gatherings across Nashville venues from Cannery Hall and Brooklyn Bowl to Bridgestone Arena.',
  },
  {
    slug: 'orlando-fl',
    name: 'Orlando',
    state: 'FL',
    displayLabel: 'Orlando, FL',
    regionLabel: 'Orlando & Central Florida',
    cities: ['Orlando', 'Longwood', 'Winter Park'],
    lat: 28.5383,
    lng: -81.3792,
    timezone: 'America/New_York',
    isPrimaryLaunchMarket: false,
    introCopy:
      'Find verified Christian concerts and church worship nights in Orlando, Longwood, and Central Florida.',
  },
  {
    slug: 'los-angeles-ca',
    name: 'Los Angeles',
    state: 'CA',
    displayLabel: 'Los Angeles, CA',
    regionLabel: 'Los Angeles & Inglewood, CA',
    cities: ['Los Angeles', 'Inglewood', 'Pasadena', 'Anaheim'],
    lat: 34.0522,
    lng: -118.2437,
    timezone: 'America/Los_Angeles',
    isPrimaryLaunchMarket: false,
    introCopy:
      'Discover verified Christian concerts and arena worship nights across Los Angeles and Inglewood.',
  },
  {
    slug: 'houston-tx',
    name: 'Houston',
    state: 'TX',
    displayLabel: 'Houston, TX',
    regionLabel: 'Greater Houston, TX',
    cities: ['Houston', 'Sugar Land', 'The Woodlands'],
    lat: 29.7604,
    lng: -95.3698,
    timezone: 'America/Chicago',
    isPrimaryLaunchMarket: false,
    introCopy: 'Explore verified Christian concerts and live worship gatherings in Houston, Texas.',
  },
  {
    slug: 'seattle-wa',
    name: 'Seattle',
    state: 'WA',
    displayLabel: 'Seattle, WA',
    regionLabel: 'Seattle & Puget Sound, WA',
    cities: ['Seattle', 'Bellevue', 'Tacoma'],
    lat: 47.6062,
    lng: -122.3321,
    timezone: 'America/Los_Angeles',
    isPrimaryLaunchMarket: false,
    introCopy: 'Find verified Christian concerts and seasonal worship gatherings in Seattle, Washington.',
  },
  {
    slug: 'new-york-ny',
    name: 'New York',
    state: 'NY',
    displayLabel: 'New York, NY',
    regionLabel: 'New York City & Brooklyn, NY',
    cities: ['Brooklyn', 'New York', 'Queens', 'Manhattan'],
    lat: 40.6782,
    lng: -73.9442,
    timezone: 'America/New_York',
    isPrimaryLaunchMarket: false,
    introCopy: 'Discover verified Christian worship nights and live concerts in Brooklyn and New York City.',
  },
  {
    slug: 'oklahoma-city-ok',
    name: 'Oklahoma City',
    state: 'OK',
    displayLabel: 'Oklahoma City, OK',
    regionLabel: 'Oklahoma City Metro, OK',
    cities: ['Oklahoma City', 'Edmond', 'Norman'],
    lat: 35.4676,
    lng: -97.5164,
    timezone: 'America/Chicago',
    isPrimaryLaunchMarket: false,
    introCopy: 'Browse verified Christian worship nights and arena concerts in Oklahoma City, Oklahoma.',
  },
] as const;

export function resolveMetroBySlug(slug: string | null | undefined): GamoLiveMetro | null {
  if (!slug) return null;
  const normalized = slug.trim().toLowerCase();
  return GAMO_LIVE_METROS.find((m) => m.slug === normalized) ?? null;
}

/**
 * Computes approximate Haversine distance in kilometers and returns the closest curated metro.
 */
export function resolveNearestMetroByCoordinates(
  lat: number,
  lng: number,
): { metro: GamoLiveMetro; distanceKm: number } {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  let bestMetro = GAMO_LIVE_METROS[0];
  let bestDist = Number.POSITIVE_INFINITY;

  for (const metro of GAMO_LIVE_METROS) {
    const dLat = toRad(metro.lat - lat);
    const dLng = toRad(metro.lng - lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat)) * Math.cos(toRad(metro.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = 6371 * c;
    if (distKm < bestDist) {
      bestDist = distKm;
      bestMetro = metro;
    }
  }

  return { metro: bestMetro, distanceKm: Math.round(bestDist) };
}

/**
 * Resolves the truthful external action label for an event listing.
 */
export function resolveExternalCtaLabel(params: {
  externalTicketProvider?: string | null;
  externalDestinationKind?: string | null;
}): string {
  const provider = params.externalTicketProvider?.trim();
  const kind = params.externalDestinationKind?.trim();

  if (provider) {
    const lower = provider.toLowerCase();
    if (lower.includes('ticketmaster')) return 'Tickets at Ticketmaster';
    if (lower.includes('ticketweb')) return 'Tickets at TicketWeb';
    if (lower === 'axs' || lower.includes('axs')) return 'Tickets at AXS';
    if (lower.includes('live nation')) return 'Tickets at Live Nation';
    return `Tickets at ${provider}`;
  }

  if (kind === 'venue_event_page') {
    return 'View official venue page';
  }
  if (kind === 'organizer_event_page') {
    return 'View official event';
  }
  return 'View official event';
}

export function extractExternalDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

export function buildIndependentDisclosure(provider?: string | null, kind?: string | null): string {
  if (provider && provider.trim()) {
    return `Independent listing · Tickets sold by ${provider.trim()}.`;
  }
  if (kind === 'venue_event_page') {
    return 'Independent listing · Official venue event page.';
  }
  if (kind === 'organizer_event_page') {
    return 'Independent listing · Official organizer event page.';
  }
  return DEFAULT_INDEPENDENT_DISCLOSURE;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'example.com',
  'example.org',
  'example.invalid',
]);

/**
 * Validates that an outbound external ticket/event URL is safe, HTTPS-only,
 * and points to a legitimate public hostname.
 */
export function validateExternalDestinationUrl(rawUrl: string | null | undefined): {
  valid: boolean;
  normalizedUrl: string | null;
  hostname: string | null;
  reason?: string;
} {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      valid: false,
      normalizedUrl: null,
      hostname: null,
      reason: 'Missing external destination URL.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return {
      valid: false,
      normalizedUrl: null,
      hostname: null,
      reason: 'Malformed external destination URL.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      valid: false,
      normalizedUrl: null,
      hostname: null,
      reason: `External destination URL must use HTTPS (received ${parsed.protocol}).`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.invalid') ||
    hostname.endsWith('.internal') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
  ) {
    return {
      valid: false,
      normalizedUrl: null,
      hostname,
      reason: `Blocked or non-public external destination hostname: ${hostname}.`,
    };
  }

  return {
    valid: true,
    normalizedUrl: parsed.toString(),
    hostname,
  };
}

/**
 * Converts a local date (`YYYY-MM-DD`), optional local time (`HH:MM`), and IANA timezone
 * into a UTC `Date` instance using `Intl.DateTimeFormat` offset calculation.
 */
export function parseLocalEventDateTimeToUtc(
  startDateLocal: string,
  startTimeLocal: string | null | undefined,
  timezone: string,
): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDateLocal.trim());
  if (!dateMatch) {
    throw new Error(`Invalid start_date_local format: ${startDateLocal}`);
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  // When start_time_local is null/unknown, default the sortable timestamp to 19:00 local time
  // while keeping start_time_local itself null in the database so the UI renders "Time TBA".
  let hour = 19;
  let minute = 0;
  if (startTimeLocal && startTimeLocal.trim()) {
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(startTimeLocal.trim());
    if (!timeMatch) {
      throw new Error(`Invalid start_time_local format: ${startTimeLocal}`);
    }
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  }

  const approxUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(new Date(approxUtcMs));
  const partMap: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      partMap[part.type] = Number(part.value);
    }
  }

  const zonedAsUtcMs = Date.UTC(
    partMap.year,
    (partMap.month ?? 1) - 1,
    partMap.day ?? 1,
    partMap.hour ?? 0,
    partMap.minute ?? 0,
    partMap.second ?? 0,
  );
  const offsetMs = zonedAsUtcMs - approxUtcMs;
  return new Date(approxUtcMs - offsetMs);
}

/**
 * Checks whether a local date (`YYYY-MM-DD`) falls on Friday, Saturday, or Sunday.
 */
export function isLocalWeekendDate(
  startDateLocal: string | null | undefined,
  startsAt: Date,
  timezone: string,
): boolean {
  if (startDateLocal && /^\d{4}-\d{2}-\d{2}$/.test(startDateLocal)) {
    const [y, m, d] = startDateLocal.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
    return dow === 5 || dow === 6 || dow === 0;
  }
  try {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'America/Phoenix',
      weekday: 'short',
    }).format(startsAt);
    return weekday === 'Fri' || weekday === 'Sat' || weekday === 'Sun';
  } catch {
    const dow = startsAt.getUTCDay();
    return dow === 5 || dow === 6 || dow === 0;
  }
}

export function inferExternalProviderName(
  url: string | null | undefined,
  explicitProvider?: string | null,
): string | null {
  if (explicitProvider && explicitProvider.trim() && explicitProvider.trim().toLowerCase() !== 'external') {
    return explicitProvider.trim();
  }
  const domain = extractExternalDomain(url);
  if (!domain) return null;
  if (domain.includes('ticketmaster.')) return 'Ticketmaster';
  if (domain.includes('ticketweb.')) return 'TicketWeb';
  if (domain === 'axs.com' || domain.endsWith('.axs.com')) return 'AXS';
  if (domain.includes('livenation.')) return 'Live Nation';
  return null;
}

export interface SeedCatalogCandidateEvent {
  import_key: string;
  slug?: string;
  title: string;
  category: string;
  performers: string[];
  start_date_local: string;
  start_time_local: string | null;
  timezone: string;
  metro_slug: string;
  listing_type?: string;
  venue: {
    name: string | null;
    street_address?: string | null;
    address?: string | null;
    city: string;
    state: string;
    country: string;
  };
  original_organizer_name?: string | null;
  published_by_account?: string;
  organizer?: {
    original_organizer_name: string | null;
    published_by_label: string;
  };
  source_urls?: string[];
  external_destination: {
    kind: string | null;
    provider_name?: string | null;
    url: string | null;
    external_only?: boolean;
    last_checked_at?: string;
    must_revalidate_before_publishing?: boolean;
  };
  ticketing?: {
    provider?: string;
    price_min_usd: number | null;
    currency: string;
    availability: string;
    checkout_on_gamo?: boolean;
  };
  pricing?: {
    currency: string;
    price_min_usd: number | null;
    availability_status: string;
  };
  artwork: {
    url: string | null;
    rights_verified: boolean;
  };
  summary?: string | null;
  editorial_notes?: string | null;
  review_status?: string;
  publish_eligible_after_review?: boolean;
  verification?: {
    review_status: string;
    publish_eligible_after_review: boolean;
    last_verified_at: string;
    source_urls: string[];
    editorial_notes: string;
  };
}

export interface SeedCatalogDocument {
  schema_version: string;
  purpose?: string;
  generated_at?: string;
  research_date?: string;
  intended_account_label?: string;
  default_currency?: string;
  publisher_disclaimer?: string;
  publication_policy?: Record<string, unknown>;
  publisher_identity_recommendation?: {
    display_name: string;
    slug: string;
    listing_type: string;
    public_disclosure: string;
  };
  events: SeedCatalogCandidateEvent[];
}

/**
 * Generates a concise, factual 1–2 sentence editorial summary strictly from verified fields
 * in the seed record without inventing prices, availability, or organizer relationships.
 */
export function buildFactualEditorialSummary(candidate: SeedCatalogCandidateEvent): {
  tagline: string;
  description: string;
} {
  const performersList =
    candidate.performers.length === 0
      ? candidate.title
      : candidate.performers.length === 1
        ? candidate.performers[0]
        : candidate.performers.length === 2
          ? `${candidate.performers[0]} and ${candidate.performers[1]}`
          : `${candidate.performers.slice(0, -1).join(', ')}, and ${candidate.performers[candidate.performers.length - 1]}`;

  const locationLabel = `${candidate.venue.city}, ${candidate.venue.state}`;
  const venueLabel = candidate.venue.name ? `${candidate.venue.name} in ${locationLabel}` : locationLabel;

  const formattedDate = (() => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(candidate.start_date_local);
    if (!match) return candidate.start_date_local;
    const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0));
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  })();

  const formattedTime = (() => {
    if (!candidate.start_time_local) return null;
    const match = /^(\d{2}):(\d{2})$/.exec(candidate.start_time_local);
    if (!match) return candidate.start_time_local;
    const h24 = Number(match[1]);
    const min = match[2];
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${min} ${period}`;
  })();

  const scheduleClause = formattedTime
    ? `on ${formattedDate} at ${formattedTime} local time`
    : `on ${formattedDate} (local start time to be announced by the venue or ticket provider)`;

  const resolvedProvider = inferExternalProviderName(
    candidate.external_destination?.url,
    candidate.external_destination?.provider_name,
  );

  const providerClause = resolvedProvider
    ? `Official tickets and current availability are provided externally through ${resolvedProvider}.`
    : candidate.external_destination?.kind === 'venue_event_page'
      ? `Official event details and admission information are published on the venue's official event page.`
      : candidate.external_destination?.kind === 'organizer_event_page'
        ? `Official event details and registration information are published on the host organizer's official event page.`
        : `Official event details require verification before publication.`;

  const isWorship = candidate.category === 'worship_event' || candidate.category === 'worship';

  const tagline = isWorship
    ? `Live worship gathering with ${performersList} in ${locationLabel}`
    : `${performersList} live in ${locationLabel}`;

  const description = `${candidate.title} brings ${performersList} to ${venueLabel} ${scheduleClause}. ${providerClause}`;

  return { tagline, description };
}

export interface CandidateEvaluationResult {
  importKey: string;
  slug: string;
  title: string;
  normalizedCategory: 'concert' | 'worship';
  startsAt: Date;
  editorialDecision: 'approved' | 'held_for_review' | 'rejected';
  editorialStatus: 'approved' | 'verified' | 'rejected';
  reason: string;
  isFeatured: boolean;
}

/**
 * Evaluates a seed candidate against Gamo Live editorial launch rules:
 * 1. Rejects records missing a verified venue name, missing an HTTPS external destination URL,
 *    or explicitly marked `publish_eligible_after_review: false`.
 * 2. Holds records in `verified` (draft/needs_review) if `editorial_notes` indicates the external
 *    ticket destination could not be fetched directly during research, unless explicitly revalidated.
 * 3. Approves complete, verified records for publication via `live:events:publish --only-approved`.
 */
export function evaluateCandidateForEditorialImport(
  candidate: SeedCatalogCandidateEvent,
  options?: { referenceNow?: Date; revalidateUnfetched?: boolean },
): CandidateEvaluationResult {
  const referenceNow = options?.referenceNow ?? new Date('2026-10-15T00:00:00Z');
  const slug = (candidate.slug || candidate.import_key).trim();
  const normalizedCategory: 'concert' | 'worship' =
    candidate.category === 'worship_event' || candidate.category === 'worship' ? 'worship' : 'concert';

  const startsAt = parseLocalEventDateTimeToUtc(
    candidate.start_date_local,
    candidate.start_time_local,
    candidate.timezone,
  );

  const publishEligible =
    candidate.publish_eligible_after_review ?? candidate.verification?.publish_eligible_after_review ?? false;

  if (!publishEligible) {
    return {
      importKey: candidate.import_key,
      slug,
      title: candidate.title,
      normalizedCategory,
      startsAt,
      editorialDecision: 'rejected',
      editorialStatus: 'rejected',
      reason:
        'Candidate marked publish_eligible_after_review=false; missing verified venue and official ticket destination URL.',
      isFeatured: false,
    };
  }

  if (!candidate.venue?.name || !candidate.venue.name.trim()) {
    return {
      importKey: candidate.import_key,
      slug,
      title: candidate.title,
      normalizedCategory,
      startsAt,
      editorialDecision: 'rejected',
      editorialStatus: 'rejected',
      reason: 'Missing verified venue name.',
      isFeatured: false,
    };
  }

  const urlCheck = validateExternalDestinationUrl(candidate.external_destination?.url);
  if (!urlCheck.valid) {
    return {
      importKey: candidate.import_key,
      slug,
      title: candidate.title,
      normalizedCategory,
      startsAt,
      editorialDecision: 'rejected',
      editorialStatus: 'rejected',
      reason: urlCheck.reason ?? 'Invalid external destination URL.',
      isFeatured: false,
    };
  }

  if (startsAt.getTime() <= referenceNow.getTime()) {
    return {
      importKey: candidate.import_key,
      slug,
      title: candidate.title,
      normalizedCategory,
      startsAt,
      editorialDecision: 'rejected',
      editorialStatus: 'rejected',
      reason: `Event start time (${startsAt.toISOString()}) is not in the future.`,
      isFeatured: false,
    };
  }

  const rawNotes = candidate.editorial_notes ?? candidate.verification?.editorial_notes ?? '';
  const notesLower = rawNotes.toLowerCase();
  const hasUnfetchedDestinationWarning =
    notesLower.includes('could not be fetched') ||
    notesLower.includes('revalidate before publication') ||
    notesLower.includes('revalidate link before publishing');

  if (hasUnfetchedDestinationWarning && !options?.revalidateUnfetched) {
    return {
      importKey: candidate.import_key,
      slug,
      title: candidate.title,
      normalizedCategory,
      startsAt,
      editorialDecision: 'held_for_review',
      editorialStatus: 'verified',
      reason:
        'Held in editorial review queue: external TicketWeb destination could not be fetched directly during research and requires manual link revalidation before public approval.',
      isFeatured: false,
    };
  }

  return {
    importKey: candidate.import_key,
    slug,
    title: candidate.title,
    normalizedCategory,
    startsAt,
    editorialDecision: 'approved',
    editorialStatus: 'approved',
    reason: 'Verified venue, schedule, performers, and HTTPS official external destination confirmed.',
    isFeatured: candidate.import_key === 'cain-phoenix-2026-11-07',
  };
}

/**
 * Formats an event's local date (`YYYY-MM-DD`), optional local start time (`HH:MM`),
 * and IANA timezone into human-readable display strings without fabricating a start time when null.
 */
export function formatLocalEventSchedule(
  startDateLocal: string | null | undefined,
  startTimeLocal: string | null | undefined,
  timezone: string | null | undefined,
  fallbackStartsAt?: Date | string | null,
): {
  dateLabel: string;
  shortDateLabel: string;
  timeLabel: string;
  tzAbbrev: string;
  fullLabel: string;
} {
  const tz = timezone || 'America/Phoenix';
  let dateLabel = 'Date TBA';
  let shortDateLabel = 'TBA';

  if (startDateLocal && /^\d{4}-\d{2}-\d{2}$/.test(startDateLocal)) {
    const [y, m, d] = startDateLocal.split('-').map((v) => Number.parseInt(v, 10));
    const utcAnchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    dateLabel = utcAnchor.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    shortDateLabel = utcAnchor.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } else if (fallbackStartsAt) {
    const dt = new Date(fallbackStartsAt);
    dateLabel = dt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: tz,
    });
    shortDateLabel = dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: tz,
    });
  }

  const TZ_ABBREV_MAP: Record<string, string> = {
    'America/Phoenix': 'MST',
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Los_Angeles': 'PT',
  };
  const tzAbbrev = TZ_ABBREV_MAP[tz] || tz;

  let timeLabel = 'Time TBA';
  if (startTimeLocal && /^\d{2}:\d{2}$/.test(startTimeLocal)) {
    const [hRaw, minRaw] = startTimeLocal.split(':').map((v) => Number.parseInt(v, 10));
    const period = hRaw >= 12 ? 'PM' : 'AM';
    const hour12 = hRaw % 12 === 0 ? 12 : hRaw % 12;
    const minPadded = String(minRaw).padStart(2, '0');
    timeLabel = `${hour12}:${minPadded} ${period} ${tzAbbrev}`;
  } else if (!startDateLocal && fallbackStartsAt) {
    const dt = new Date(fallbackStartsAt);
    timeLabel = `${dt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    })} ${tzAbbrev}`;
  }

  return {
    dateLabel,
    shortDateLabel,
    timeLabel,
    tzAbbrev,
    fullLabel: `${shortDateLabel} · ${timeLabel}`,
  };
}

export interface EventLifecycleTemporalInput {
  startsAt?: Date | string | number | null;
  endsAt?: Date | string | number | null;
  startDateLocal?: string | null;
  startTimeLocal?: string | null;
  timezone?: string | null;
  status?: string | null;
}

/**
 * Determines whether an event is already in the past and therefore closed for registration/tickets.
 *
 * Rules:
 * 1. If `endsAt` is provided and valid, the event is past once `endsAt <= referenceNow`.
 * 2. Otherwise, if `startDateLocal` is provided without a specific `startTimeLocal`, the event
 *    remains open through the end of that local calendar date (`23:59` local time).
 * 3. Otherwise, uses `startsAt` (or parsed `startDateLocal + startTimeLocal`) and marks the event
 *    past once the event start window has elapsed (`startsAt <= referenceNow`).
 */
export function isEventPast(event: EventLifecycleTemporalInput, referenceNow: Date = new Date()): boolean {
  const nowMs = referenceNow.getTime();
  if (!Number.isFinite(nowMs)) return false;

  if (event.endsAt != null) {
    const endDt = event.endsAt instanceof Date ? event.endsAt : new Date(event.endsAt);
    if (Number.isFinite(endDt.getTime())) {
      return endDt.getTime() <= nowMs;
    }
  }

  if (event.startDateLocal && /^\d{4}-\d{2}-\d{2}$/.test(event.startDateLocal) && !event.startTimeLocal) {
    const endOfDayUtc = parseLocalEventDateTimeToUtc(
      event.startDateLocal,
      '23:59',
      event.timezone || 'America/Phoenix',
    );
    if (Number.isFinite(endOfDayUtc.getTime())) {
      return endOfDayUtc.getTime() <= nowMs;
    }
  }

  if (event.startsAt != null) {
    const startDt = event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt);
    if (Number.isFinite(startDt.getTime())) {
      return startDt.getTime() <= nowMs;
    }
  }

  if (event.startDateLocal && /^\d{4}-\d{2}-\d{2}$/.test(event.startDateLocal)) {
    const parsedUtc = parseLocalEventDateTimeToUtc(
      event.startDateLocal,
      event.startTimeLocal ?? '23:59',
      event.timezone || 'America/Phoenix',
    );
    if (Number.isFinite(parsedUtc.getTime())) {
      return parsedUtc.getTime() <= nowMs;
    }
  }

  return false;
}

export type EventLifecycleStatus = 'past' | 'canceled' | 'rescheduled' | 'scheduled';

/**
 * Computes the effective display lifecycle status of an event, guaranteeing that
 * any event whose date/time has passed resolves to `'past'` (closed & past) unless canceled.
 */
export function getEventLifecycleStatus(
  event: EventLifecycleTemporalInput,
  referenceNow: Date = new Date(),
): EventLifecycleStatus {
  if (event.status === 'canceled') return 'canceled';
  if (isEventPast(event, referenceNow)) return 'past';
  if (event.status === 'rescheduled') return 'rescheduled';
  return 'scheduled';
}

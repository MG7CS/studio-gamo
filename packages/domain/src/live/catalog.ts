/**
 * Gamo Live read model: what the public pages show (docs/LIVE_DATA_MODEL.md §4).
 * Only `published` events of active organizations; catalog listings appear once the admin published them.
 * Field names follow what the existing public pages already read, so they keep their approved look.
 */
import {
  GAMO_LIVE_METROS,
  isLocalWeekendDate,
  resolveMetroBySlug,
  resolveNearestMetroByCoordinates,
  type EventLifecycleStatus,
  type GamoLiveMetro,
} from '../services/live-external-discovery.ts';
import { allRows, type SqlDatabase } from '../security/sql-database.ts';
import type { EVENT_CATEGORIES } from './events.ts';

export type EventCategory = (typeof EVENT_CATEGORIES)[number]['value'];

/**
 * Display text for every category. `Record<EventCategory, …>` makes this total: adding a category to
 * EVENT_CATEGORIES without a label here is a compile error, so none can fall through to a raw value.
 */
const CATEGORY_DISPLAY: Record<EventCategory, { label: string; badge: string }> = {
  concert: { label: 'Concert', badge: 'Concert' },
  worship: { label: 'Worship night', badge: 'Worship Night' },
  conference: { label: 'Conference', badge: 'Conference' },
  youth: { label: 'Youth event', badge: 'Youth' },
  bible: { label: 'Bible study', badge: 'Bible Study' },
  prayer: { label: 'Prayer gathering', badge: 'Prayer' },
  retreat: { label: 'Retreat', badge: 'Retreat' },
  community: { label: 'Community event', badge: 'Community' },
};

/** Older imports used `worship_event` for what is now `worship`. */
const CATEGORY_ALIASES: Record<string, EventCategory> = { worship_event: 'worship' };

export function normalizeCategory(value: string | null | undefined): EventCategory | null {
  const key = (value ?? '').trim().toLowerCase();
  const alias = CATEGORY_ALIASES[key];
  if (alias) return alias;
  return key in CATEGORY_DISPLAY ? (key as EventCategory) : null;
}

const humanize = (value: string) => {
  const text = value.trim().replace(/[_-]+/g, ' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Event';
};

/** Full label, e.g. "Bible study". Unknown values are made readable, never shown as a raw key. */
export function categoryLabel(value: string | null | undefined): string {
  const category = normalizeCategory(value);
  return category ? CATEGORY_DISPLAY[category].label : humanize(value ?? '');
}

/** Short label for a card badge, e.g. "Worship Night". */
export function categoryBadge(value: string | null | undefined): string {
  const category = normalizeCategory(value);
  return category ? CATEGORY_DISPLAY[category].badge : humanize(value ?? '');
}

export interface LiveEventPerformerSummary {
  id: string;
  displayName: string;
  billingOrder: number;
  roleLabel: string;
}

export interface LiveOccurrenceView {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  canceled: boolean;
  isPast: boolean;
  seatsTaken: number;
}

export interface LiveEventWithDetails {
  id: string;
  slug: string;
  title: string;
  category: string;
  tagline: string | null;
  description: string;
  venueName: string;
  address: string | null;
  city: string;
  state: string;
  /** Slug of one of the nine Gamo Live metros, or null outside them (never invented). */
  metroSlug: string | null;
  /** Same as `metroSlug`; null when the city is outside every metro. */
  metro: string | null;
  /** Grouping label: the metro's label, else "City, ST". */
  regionLabel: string;
  timezone: string;
  /** The next upcoming occurrence, or the most recent one when all have passed. */
  startsAt: Date;
  endsAt: Date | null;
  startDateLocal: string;
  startTimeLocal: string;
  occurrenceId: string;
  /** Paid events on their detail page only (`getEvent`); lists leave it out. */
  paidTickets?: PaidTicketSummary | null;
  /** `free` (open or with registration), `external` (tickets sold elsewhere) or `paid` (Gamo's own tickets). */
  admissionType: 'free' | 'external' | 'paid';
  admission: 'free_open' | 'free_registration' | 'external_tickets' | 'paid_tickets';
  registrationOpen: boolean;
  qrCheckin: boolean;
  capacity: number | null;
  seatsTaken: number;
  maxPartySize: number;
  priceText: string | null;
  refundPolicyText: string | null;
  externalUrl: string | null;
  externalOnly: boolean;
  externalTicketProvider: string | null;
  externalDestinationKind: string | null;
  sourceUrlsJson: string | null;
  lastVerifiedAt: Date | null;
  originalOrganizerName: string | null;
  priceMinCents: number | null;
  currency: string;
  ticketAvailability: string;
  photoKey: string | null;
  artworkUrl: string | null;
  listingType: 'organizer_submitted' | 'external_discovery';
  publishedByLabel: string | null;
  organizationSlug: string | null;
  organizerName: string;
  organizerKind: string;
  organizerVerified: boolean;
  /** `approved` (published) or `canceled`; nothing else is ever public. */
  status: 'approved' | 'canceled';
  isFeatured: boolean;
  editorialStatus: 'published';
  artworkRightsVerified: boolean;
  independentDisclosure: string | null;
  tiers: never[];
  totalRegistered: number;
  performers: LiveEventPerformerSummary[];
  isPast: boolean;
  isClosed: boolean;
  lifecycleStatus: EventLifecycleStatus;
  createdAt: Date;
}

export interface LiveEventDetail extends LiveEventWithDetails {
  occurrences: LiveOccurrenceView[];
  /** Only for `paid_tickets` events: what the event page's action panel shows (never invented availability). */
  paidTickets: PaidTicketSummary | null;
}

/** The public summary of a paid event's tickets for the date shown. */
export interface PaidTicketSummary {
  /** `on_sale`: at least one public type can be bought now; `sold_out`: every public type is taken; `not_open`: sales
   * start later; `ended`: sales are over. */
  state: 'on_sale' | 'sold_out' | 'not_open' | 'ended';
  /** Lowest price in force among public types on sale (cents), or null. */
  fromCents: number | null;
  /** When sales open, for `not_open` (epoch seconds). */
  opensAt: number | null;
  /** The refund policy in plain words. */
  refundLine: string;
  /** Who sells the tickets, or null while Gamo has not chosen how payments work. */
  sellerLine: string | null;
}

const REFUND_WORDS: Record<string, (hours: number | null) => string> = {
  none: () => 'No refunds.',
  until_hours_before: (h) => `Refunds until ${h ?? 0} hours before the start.`,
  until_start: () => 'Refunds any time before the start.',
};

export interface LiveEventFilters {
  category?: string;
  city?: string;
  metro?: string;
  lat?: number;
  lng?: number;
  venue?: string;
  artist?: string;
  /** Exact performer names (any of them); used for an artist's own page. */
  performers?: string[];
  q?: string;
  dateFrom?: Date;
  dateTo?: Date;
  weekend?: boolean;
  /** Only events that have a date that has not ended yet. */
  upcomingOnly?: boolean;
  limit?: number;
}

export interface LiveVenueSummary {
  venueName: string;
  address: string | null;
  city: string;
  state: string;
  metroSlug: string | null;
  metro: string | null;
  regionLabel: string;
  /** Upcoming (not yet ended, not canceled) events only. */
  upcomingEventCount: number;
  nextEventStartsAt: Date | null;
  nextEventDateLocal: string | null;
  upcomingEvents: LiveEventWithDetails[];
}

export interface LiveArtistSummary {
  id: string;
  stageName: string;
  slug: string;
  /** Upcoming (not yet ended, not canceled) events only. */
  upcomingEventCount: number;
  nextEventStartsAt: Date | null;
  nextEventDateLocal: string | null;
}

export interface LiveArtistProfile extends LiveArtistSummary {
  /** Every spelling of the name found on performer lines. */
  names: string[];
  upcomingEvents: LiveEventWithDetails[];
}

export interface LiveRegion {
  /** Metro slug, or null outside the nine metros. */
  metro: string | null;
  /** The metro's label, else "City, ST" (or just the state). */
  regionLabel: string;
}

/**
 * Which metro (if any) a place belongs to, and a label for grouping. A stored metro slug wins; otherwise the
 * city is matched against the metro's city list. Anywhere else has no metro, only a "City, ST" label.
 */
export function regionForPlace(place: {
  city: string;
  state: string;
  metroSlug?: string | null;
}): LiveRegion {
  const city = place.city.trim();
  const state = place.state.trim().toUpperCase();
  const stored = resolveMetroBySlug(place.metroSlug ?? null);
  const metro =
    stored ??
    GAMO_LIVE_METROS.find(
      (m) => m.state === state && m.cities.some((c) => c.toLowerCase() === city.toLowerCase()),
    ) ??
    null;
  if (metro) return { metro: metro.slug, regionLabel: metro.displayLabel };
  return { metro: null, regionLabel: city && state ? `${city}, ${state}` : city || state || 'United States' };
}

/** `YYYY-MM-DD` and `HH:mm` of an instant in an IANA time zone. */
export function localParts(epochSeconds: number, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochSeconds * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** Case-, accent- and spacing-insensitive identity of an artist name. */
export function artistKey(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Short deterministic hash (base 36, 8 characters) for slugs that cannot be built from Latin letters alone. */
export function stableHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(8, '0').slice(-8);
}

/**
 * URL slug of an artist name. Plain ASCII names keep their old slug ("Grace Choir" -> "grace-choir"); accents are
 * folded ("José" -> "jose"). A name with letters that cannot be written in ASCII (Korean, Arabic, Hindi...) or with no
 * letters at all gets a stable hash of the full name appended, so different names never share a slug and the same
 * name always gets the same one.
 */
export function toArtistSlug(name: string): string {
  const key = artistKey(name);
  const folded = key.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const base = folded
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
  const lossy = /[\p{L}\p{N}]/u.test(folded.replace(/[\x20-\x7e]/g, ''));
  if (!lossy && base) return base;
  const stem = base.replace(/^-+|-+$/g, '').slice(0, 60) || 'artist';
  return `${stem}-${stableHash(key)}`;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);
const date = (seconds: unknown): Date | null => (seconds == null ? null : new Date(Number(seconds) * 1000));

/**
 * Seats held by pending registrations whose hold has run out. They are still counted in `seats_taken` until the next
 * registration (or cleanup) releases them, so every read subtracts them; `?1` is "now" in epoch seconds.
 */
const heldSeats = (occurrence: string) =>
  `COALESCE((SELECT SUM(party_size) FROM registrations WHERE occurrence_id = ${occurrence} AND status = 'pending' AND expires_at <= ?1), 0)`;

/** A date has not ended yet: its end, or its start when no end is set, is after "now" (`?1`). */
const NOT_ENDED = (alias = '') => `COALESCE(${alias}ends_at, ${alias}starts_at) > ?1`;

/**
 * One row per event, joined to the occurrence a visitor should see: the next upcoming (or running) one, else the
 * most recent past one; canceled dates only when nothing else is left. `?1` is "now" in epoch seconds.
 *
 * `discovery` is for every list (home, search, city, venues, artists): only `published` events, and only dates that
 * are not canceled, so a canceled event never shows up there. The detail page (`discovery: false`) also finds
 * events canceled after they were published, so they can say so. `occurrenceWhere` narrows the dates considered
 * (for example the date window of a search), as extra `AND ...` conditions on the occurrence table.
 */
function eventSelect(discovery: boolean, occurrenceWhere = ''): string {
  return `
  SELECT e.id, e.slug, e.title, e.category, e.description, e.timezone, e.admission, e.external_url, e.price_text,
         e.refund_policy_text, e.status, e.featured, e.image_rights_confirmed_at, e.capacity, e.max_party_size, e.qr_checkin, e.image_key, e.origin, e.created_at,
         COALESCE(e.venue_name, v.name) AS venue_name, COALESCE(e.venue_address, v.address) AS address, v.city, v.state, v.metro_slug,
         g.name AS org_name, g.kind AS org_kind, g.slug AS org_slug, g.verified_at AS org_verified_at,
         cs.source_urls, cs.provider, cs.destination_kind, cs.last_verified_at, cs.original_organizer_name,
         o.id AS occurrence_id, o.starts_at, o.ends_at, o.seats_taken - ${heldSeats('o.id')} AS seats_taken,
         CASE WHEN e.admission = 'paid_tickets' THEN (
           SELECT MIN(COALESCE((SELECT d.price_cents FROM price_deadlines d WHERE d.ticket_type_id = t.id AND d.ends_at > ?1
                                 ORDER BY d.ends_at LIMIT 1), t.price_cents))
             FROM ticket_types t
            WHERE t.event_id = e.id AND t.status = 'on_sale' AND (t.sales_end_at IS NULL OR t.sales_end_at > ?1)
         ) END AS paid_from_cents,
         (SELECT COALESCE(SUM(x.seats_taken - ${heldSeats('x.id')}), 0) FROM event_occurrences x WHERE x.event_id = e.id) AS registered_total
    FROM events e
    JOIN venues v ON v.id = e.venue_id
    LEFT JOIN organizations g ON g.id = e.organization_id
    LEFT JOIN catalog_sources cs ON cs.event_id = e.id
    JOIN event_occurrences o ON o.id = (
      SELECT id FROM event_occurrences
       WHERE event_id = e.id${discovery ? " AND status <> 'canceled'" : ''}${occurrenceWhere}
       ORDER BY (status = 'canceled'), (${NOT_ENDED()}) = 0, CASE WHEN ${NOT_ENDED()} THEN starts_at END ASC, starts_at DESC
       LIMIT 1)
   WHERE ${
     discovery
       ? "e.status = 'published'"
       : "(e.status = 'published' OR (e.status = 'canceled' AND e.published_at IS NOT NULL))"
   } AND (g.id IS NULL OR g.status = 'active')`;
}

export class LiveCatalog {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  private async performersFor(eventIds: string[]): Promise<Map<string, LiveEventPerformerSummary[]>> {
    const out = new Map<string, LiveEventPerformerSummary[]>();
    if (eventIds.length === 0) return out;
    const rows = await allRows<Row>(this.db, {
      sql: `SELECT event_id, position, name, role FROM event_performers
             WHERE event_id IN (${eventIds.map((_, i) => `?${i + 1}`).join(',')}) ORDER BY event_id, position`,
      params: eventIds,
    });
    for (const r of rows) {
      const list = out.get(String(r.event_id)) ?? [];
      list.push({
        id: `${r.event_id}:${r.position}`,
        displayName: String(r.name),
        billingOrder: num(r.position),
        roleLabel: str(r.role) ?? 'Performer',
      });
      out.set(String(r.event_id), list);
    }
    return out;
  }

  private mapEvent(r: Row, performers: LiveEventPerformerSummary[], now: number): LiveEventWithDetails {
    const startsSec = num(r.starts_at);
    const endsSec = r.ends_at == null ? null : num(r.ends_at);
    const timezone = String(r.timezone);
    const local = localParts(startsSec, timezone);
    const past = (endsSec ?? startsSec) <= now;
    const admission = String(r.admission) as LiveEventWithDetails['admission'];
    const catalog = r.origin === 'catalog';
    const canceled = r.status === 'canceled';
    const region = regionForPlace({
      city: String(r.city),
      state: String(r.state),
      metroSlug: str(r.metro_slug),
    });
    return {
      id: String(r.id),
      slug: String(r.slug),
      title: String(r.title),
      category: String(r.category),
      tagline: null,
      description: str(r.description) ?? '',
      venueName: String(r.venue_name),
      address: str(r.address),
      city: String(r.city),
      state: String(r.state),
      metroSlug: region.metro,
      metro: region.metro,
      regionLabel: region.regionLabel,
      timezone,
      startsAt: new Date(startsSec * 1000),
      endsAt: endsSec == null ? null : new Date(endsSec * 1000),
      startDateLocal: local.date,
      startTimeLocal: local.time,
      occurrenceId: String(r.occurrence_id),
      admissionType:
        admission === 'external_tickets' ? 'external' : admission === 'paid_tickets' ? 'paid' : 'free',
      admission,
      registrationOpen: admission === 'free_registration' && !past && !canceled,
      qrCheckin: num(r.qr_checkin) === 1,
      capacity: r.capacity == null ? null : num(r.capacity),
      seatsTaken: num(r.seats_taken),
      maxPartySize: num(r.max_party_size),
      priceText: str(r.price_text),
      refundPolicyText: str(r.refund_policy_text),
      externalUrl: str(r.external_url),
      externalOnly: admission === 'external_tickets',
      externalTicketProvider: str(r.provider),
      externalDestinationKind: str(r.destination_kind),
      sourceUrlsJson: str(r.source_urls),
      lastVerifiedAt: date(r.last_verified_at),
      originalOrganizerName: str(r.original_organizer_name),
      priceMinCents:
        admission === 'paid_tickets' && r.paid_from_cents != null ? num(r.paid_from_cents) : null,
      currency: 'USD',
      ticketAvailability: 'unverified',
      photoKey: str(r.image_key),
      artworkUrl: null,
      listingType: catalog ? 'external_discovery' : 'organizer_submitted',
      publishedByLabel: catalog ? 'Gamo Live Listings' : null,
      organizationSlug: str(r.org_slug),
      organizerName: str(r.org_name) ?? 'Gamo Live Listings',
      organizerKind: str(r.org_kind) ?? 'organizer',
      organizerVerified: r.org_verified_at != null,
      status: canceled ? 'canceled' : 'approved',
      isFeatured: num(r.featured) === 1,
      editorialStatus: 'published',
      artworkRightsVerified: r.image_rights_confirmed_at != null,
      independentDisclosure: null,
      tiers: [],
      totalRegistered: num(r.registered_total),
      performers,
      isPast: past,
      isClosed: past || canceled,
      lifecycleStatus: canceled ? 'canceled' : past ? 'past' : 'scheduled',
      createdAt: date(r.created_at) ?? new Date(0),
    };
  }

  /**
   * Discovery list: published events only (a canceled event is never listed, only reachable by its own page).
   * Upcoming events first (soonest first), then past ones unless `upcomingOnly`; each event once, at its relevant date.
   */
  async listDiscoverableEvents(filters: LiveEventFilters = {}): Promise<LiveEventWithDetails[]> {
    const now = this.now();
    const params: (string | number)[] = [now];
    const bind = (value: string | number) => {
      params.push(value);
      return `?${params.length}`;
    };
    const where: string[] = [];
    const add = (sql: string, value: string | number) => where.push(sql.replace('?', bind(value)));
    // Conditions on the date itself are applied while choosing the date, so an event with several dates
    // matches when any of them does.
    const occurrenceWhere: string[] = [];
    if (filters.upcomingOnly) occurrenceWhere.push(` AND ${NOT_ENDED()}`);
    if (filters.dateFrom && Number.isFinite(filters.dateFrom.getTime()))
      occurrenceWhere.push(` AND starts_at >= ${bind(Math.floor(filters.dateFrom.getTime() / 1000))}`);
    if (filters.dateTo && Number.isFinite(filters.dateTo.getTime()))
      occurrenceWhere.push(` AND starts_at <= ${bind(Math.floor(filters.dateTo.getTime() / 1000))}`);
    if (filters.category) add('e.category = ?', normalizeCategory(filters.category) ?? filters.category);
    if (filters.city) add('v.city = ?', filters.city);
    const metroSlug = (
      filters.metro ||
      (Number.isFinite(filters.lat) && Number.isFinite(filters.lng)
        ? resolveNearestMetroByCoordinates(filters.lat as number, filters.lng as number).metro.slug
        : undefined)
    )
      ?.trim()
      .toLowerCase();
    if (metroSlug) {
      const known = resolveMetroBySlug(metroSlug);
      if (known) {
        // Venues saved without a metro slug still belong to the metro when their city is one of its cities.
        const slug = bind(known.slug);
        const state = bind(known.state);
        const cities = known.cities.map((c) => bind(c.toLowerCase())).join(', ');
        where.push(`(v.metro_slug = ${slug} OR (v.state = ${state} AND LOWER(v.city) IN (${cities})))`);
      } else add('v.metro_slug = ?', metroSlug);
    }
    const like = (text: string) =>
      `%${text
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, '\\$&')}%`;
    if (filters.venue?.trim()) add("LOWER(v.name) LIKE ? ESCAPE '\\'", like(filters.venue));
    if (filters.performers?.length) {
      const names = filters.performers.map((n) => bind(n)).join(', ');
      where.push(
        `EXISTS (SELECT 1 FROM event_performers p WHERE p.event_id = e.id AND p.name IN (${names}))`,
      );
    }
    if (filters.artist?.trim()) {
      const p = bind(like(filters.artist));
      where.push(
        `(LOWER(e.title) LIKE ${p} ESCAPE '\\' OR EXISTS (SELECT 1 FROM event_performers p WHERE p.event_id = e.id AND LOWER(p.name) LIKE ${p} ESCAPE '\\'))`,
      );
    }
    if (filters.q?.trim()) {
      const p = bind(like(filters.q));
      where.push(
        `(LOWER(e.title) LIKE ${p} ESCAPE '\\' OR LOWER(COALESCE(e.description, '')) LIKE ${p} ESCAPE '\\'
          OR LOWER(v.name) LIKE ${p} ESCAPE '\\' OR LOWER(v.city) LIKE ${p} ESCAPE '\\' OR LOWER(v.state) LIKE ${p} ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM event_performers p WHERE p.event_id = e.id AND LOWER(p.name) LIKE ${p} ESCAPE '\\'))`,
      );
    }
    const rows = await allRows<Row>(this.db, {
      sql: `${eventSelect(true, occurrenceWhere.join(''))}${where.length ? ` AND ${where.join(' AND ')}` : ''}
            ORDER BY (${NOT_ENDED('o.')}) = 0, CASE WHEN ${NOT_ENDED('o.')} THEN o.starts_at END ASC, o.starts_at DESC, e.id
            LIMIT ${Math.min(Math.max(Math.trunc(filters.limit ?? 50), 1), 2000)}`,
      params,
    });
    const performers = await this.performersFor(rows.map((r) => String(r.id)));
    const events = rows.map((r) => this.mapEvent(r, performers.get(String(r.id)) ?? [], now));
    return filters.weekend
      ? events.filter((e) => isLocalWeekendDate(e.startDateLocal, e.startsAt, e.timezone))
      : events;
  }

  /** One published event by id or slug, with all of its occurrences. */
  async getEvent(idOrSlug: string): Promise<LiveEventDetail | null> {
    const now = this.now();
    const column = idOrSlug.startsWith('evt_') ? 'e.id' : 'e.slug';
    const rows = await allRows<Row>(this.db, {
      sql: `${eventSelect(false)} AND ${column} = ?2 LIMIT 1`,
      params: [now, idOrSlug],
    });
    const row = rows[0];
    if (!row) return null;
    const performers = await this.performersFor([String(row.id)]);
    const occ = await allRows<Row>(this.db, {
      sql: `SELECT o.id, o.starts_at, o.ends_at, o.status, o.seats_taken - ${heldSeats('o.id')} AS seats_taken
               FROM event_occurrences o WHERE o.event_id = ?2 ORDER BY o.starts_at`,
      params: [now, String(row.id)],
    });
    return {
      ...this.mapEvent(row, performers.get(String(row.id)) ?? [], now),
      paidTickets: row.admission === 'paid_tickets' ? await this.paidTicketSummary(row, now) : null,
      occurrences: occ.map((o) => ({
        id: String(o.id),
        startsAt: new Date(num(o.starts_at) * 1000),
        endsAt: o.ends_at == null ? null : new Date(num(o.ends_at) * 1000),
        canceled: o.status === 'canceled',
        isPast: (o.ends_at == null ? num(o.starts_at) : num(o.ends_at)) <= now,
        seatsTaken: num(o.seats_taken),
      })),
    };
  }

  /**
   * What a paid event's panel shows for the date on screen: whether a public ticket type can be bought now (sales
   * window open, not ended, seats left online after the door allocation, counting holds of unpaid orders that have
   * already expired as free), the lowest price in force, the refund policy and the seller.
   */
  private async paidTicketSummary(row: Row, now: number): Promise<PaidTicketSummary> {
    const eventId = String(row.id);
    const occurrenceId = String(row.occurrence_id);
    const types = await allRows<Row>(this.db, {
      sql: `SELECT t.id, t.status, t.sales_start_at, t.sales_end_at, t.people_per_ticket,
                   COALESCE((SELECT d.price_cents FROM price_deadlines d WHERE d.ticket_type_id = t.id AND d.ends_at > ?1
                              ORDER BY d.ends_at LIMIT 1), t.price_cents) AS price_cents,
                   i.capacity, i.online_taken, i.door_allocation, i.door_taken,
                   COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                              WHERE oi.ticket_type_id = t.id AND o.occurrence_id = ?3 AND o.status = 'pending'
                                AND o.channel = 'online' AND o.hold_expires_at <= ?1), 0) AS expired_held
              FROM ticket_types t
              LEFT JOIN ticket_inventory i ON i.ticket_type_id = t.id AND i.occurrence_id = ?3
             WHERE t.event_id = ?2 AND t.status <> 'hidden'`,
      params: [now, eventId, occurrenceId],
    });
    const [cap] = await allRows<Row>(this.db, {
      sql: `SELECT capacity, people_taken,
                   COALESCE((SELECT SUM(oi.quantity * oi.people_per_ticket) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                              WHERE o.occurrence_id = ?2 AND o.status = 'pending' AND o.hold_expires_at <= ?1), 0) AS expired_people
              FROM occurrence_inventory WHERE occurrence_id = ?2`,
      params: [now, occurrenceId],
    });
    const [policy] = await allRows<Row>(this.db, {
      sql: `SELECT et.refund_policy, et.refund_hours,
                   COALESCE(op.funds_flow_override, CASE WHEN ps.funds_flow_default = 'not_chosen' THEN NULL ELSE ps.funds_flow_default END) AS flow
              FROM events e
              LEFT JOIN event_ticketing et ON et.event_id = e.id
              LEFT JOIN organization_payments op ON op.organization_id = e.organization_id
              LEFT JOIN payment_settings ps ON ps.id = 1
             WHERE e.id = ?1`,
      params: [eventId],
    });
    const peopleLeft =
      cap?.capacity == null ? Infinity : num(cap.capacity) - num(cap.people_taken) + num(cap.expired_people);
    let fromCents: number | null = null;
    let anyLater: number | null = null;
    let anyOpenWindow = false;
    let anyBuyable = false;
    for (const t of types) {
      if (t.status !== 'on_sale') continue;
      const start = t.sales_start_at == null ? null : num(t.sales_start_at);
      const end = t.sales_end_at == null ? null : num(t.sales_end_at);
      if (end !== null && end <= now) continue;
      if (start !== null && start > now) {
        anyLater = anyLater === null ? start : Math.min(anyLater, start);
        continue;
      }
      anyOpenWindow = true;
      const online =
        t.capacity == null
          ? Infinity
          : num(t.capacity) -
            (num(t.online_taken) - num(t.expired_held)) -
            Math.max(num(t.door_allocation), num(t.door_taken));
      if (online >= 1 && peopleLeft >= num(t.people_per_ticket)) {
        anyBuyable = true;
        fromCents = fromCents === null ? num(t.price_cents) : Math.min(fromCents, num(t.price_cents));
      }
    }
    const state: PaidTicketSummary['state'] = anyBuyable
      ? 'on_sale'
      : anyOpenWindow
        ? 'sold_out'
        : anyLater !== null
          ? 'not_open'
          : 'ended';
    const words = REFUND_WORDS[String(policy?.refund_policy ?? 'none')] ?? REFUND_WORDS.none;
    const org = str(row.org_name) ?? 'the organizer';
    const flow = str(policy?.flow);
    return {
      state,
      fromCents,
      opensAt: state === 'not_open' ? anyLater : null,
      refundLine: words(policy?.refund_hours == null ? null : num(policy.refund_hours)),
      sellerLine:
        flow === 'organizer_account'
          ? `Sold by ${org}.`
          : flow === 'gamo_collects'
            ? `Sold by Gamo Studios on behalf of ${org}.`
            : null,
    };
  }

  /**
   * Artists (from performer lines) with at least one upcoming, not canceled, published event. Counts and the next
   * date only cover upcoming events. Two names that would share a slug keep it apart with a stable hash.
   */
  private async artistIndex(): Promise<Array<LiveArtistSummary & { names: string[] }>> {
    const now = this.now();
    const rows = await allRows<Row>(this.db, {
      sql: `SELECT p.name, e.id AS event_id, e.timezone, MIN(o.starts_at) AS next_starts
              FROM event_performers p
              JOIN events e ON e.id = p.event_id AND e.status = 'published'
              JOIN event_occurrences o ON o.event_id = e.id AND o.status <> 'canceled' AND ${NOT_ENDED('o.')}
              LEFT JOIN organizations g ON g.id = e.organization_id
             WHERE g.id IS NULL OR g.status = 'active'
             GROUP BY p.name, e.id`,
      params: [now],
    });
    interface Group {
      key: string;
      spellings: Map<string, number>;
      events: Set<string>;
      next: { startsAt: number; timezone: string } | null;
    }
    const groups = new Map<string, Group>();
    for (const r of rows) {
      const display = String(r.name).normalize('NFC').trim().replace(/\s+/g, ' ');
      if (!display) continue;
      const key = artistKey(display);
      const group = groups.get(key) ?? { key, spellings: new Map(), events: new Set(), next: null };
      groups.set(key, group);
      group.spellings.set(String(r.name), (group.spellings.get(String(r.name)) ?? 0) + 1);
      group.events.add(String(r.event_id));
      const startsAt = num(r.next_starts);
      if (!group.next || startsAt < group.next.startsAt)
        group.next = { startsAt, timezone: String(r.timezone) };
    }
    const used = new Set<string>();
    const slugs = new Map<string, string>();
    for (const key of [...groups.keys()].sort()) {
      let slug = toArtistSlug(key);
      if (used.has(slug)) slug = `${slug}-${stableHash(key)}`;
      while (used.has(slug)) slug = `${slug}-x`;
      used.add(slug);
      slugs.set(key, slug);
    }
    return [...groups.values()]
      .map((group) => {
        const spellings = [...group.spellings.entries()].sort(
          (x, y) => y[1] - x[1] || x[0].localeCompare(y[0]),
        );
        const stageName = spellings[0][0].normalize('NFC').trim().replace(/\s+/g, ' ');
        const slug = slugs.get(group.key) as string;
        return {
          id: `artist:${slug}`,
          stageName,
          slug,
          upcomingEventCount: group.events.size,
          nextEventStartsAt: group.next ? new Date(group.next.startsAt * 1000) : null,
          nextEventDateLocal: group.next ? localParts(group.next.startsAt, group.next.timezone).date : null,
          names: spellings.map(([name]) => name),
        };
      })
      .sort((x, y) => y.upcomingEventCount - x.upcomingEventCount || x.stageName.localeCompare(y.stageName));
  }

  async listArtists(): Promise<LiveArtistSummary[]> {
    return (await this.artistIndex()).map(({ names: _names, ...artist }) => artist);
  }

  /** One artist by the slug `listArtists` gave them, with their upcoming events; null when there are none. */
  async getArtistBySlug(slug: string): Promise<LiveArtistProfile | null> {
    const wanted = slug.trim().toLowerCase();
    const artist = (await this.artistIndex()).find((a) => a.slug === wanted);
    if (!artist) return null;
    const upcomingEvents = await this.listDiscoverableEvents({
      performers: artist.names,
      upcomingOnly: true,
      limit: 100,
    });
    return { ...artist, upcomingEvents };
  }

  /** Per metro: how many upcoming (not canceled) published events, and which one is next. */
  async getMetroSummaries(): Promise<
    Array<
      GamoLiveMetro & {
        /** Upcoming events (kept under its old name for the existing pages). */
        publishedEventCount: number;
        upcomingEventCount: number;
        nextEventTitle: string | null;
        nextEventDateLocal: string | null;
      }
    >
  > {
    const upcoming = await this.listDiscoverableEvents({ upcomingOnly: true, limit: 2000 });
    return GAMO_LIVE_METROS.map((metro) => {
      const mine = upcoming.filter((e) => e.metro === metro.slug);
      const next = mine[0] ?? null;
      return {
        ...metro,
        publishedEventCount: mine.length,
        upcomingEventCount: mine.length,
        nextEventTitle: next?.title ?? null,
        nextEventDateLocal: next?.startDateLocal ?? null,
      };
    });
  }

  /** Venues that have at least one upcoming, not canceled, published event, most active first. */
  async listDiscoverableVenues(filters: { metro?: string } = {}): Promise<LiveVenueSummary[]> {
    const upcoming = await this.listDiscoverableEvents({
      metro: filters.metro,
      upcomingOnly: true,
      limit: 2000,
    });
    const map = new Map<string, LiveVenueSummary>();
    for (const evt of upcoming) {
      const key = `${evt.venueName.toLowerCase()}|${evt.city.toLowerCase()}|${evt.state.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.upcomingEventCount++;
        existing.upcomingEvents.push(evt);
      } else {
        map.set(key, {
          venueName: evt.venueName,
          address: evt.address,
          city: evt.city,
          state: evt.state,
          metroSlug: evt.metro,
          metro: evt.metro,
          regionLabel: evt.regionLabel,
          upcomingEventCount: 1,
          // The list is soonest first, so the first event of a venue is its next one.
          nextEventStartsAt: evt.startsAt,
          nextEventDateLocal: evt.startDateLocal,
          upcomingEvents: [evt],
        });
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        b.upcomingEventCount - a.upcomingEventCount ||
        a.city.localeCompare(b.city) ||
        a.venueName.localeCompare(b.venueName),
    );
  }
}

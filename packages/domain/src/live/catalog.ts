/**
 * Gamo Live read model: what the public pages show (docs/LIVE_DATA_MODEL.md §4).
 * Only `published` events of active organizations; catalog listings appear once the admin published them.
 * Field names follow what the existing public pages already read, so they keep their approved look.
 */
import {
  GAMO_LIVE_METROS,
  isLocalWeekendDate,
  resolveNearestMetroByCoordinates,
  type EventLifecycleStatus,
  type GamoLiveMetro,
} from '../services/live-external-discovery.ts';
import { allRows, type SqlDatabase } from '../security/sql-database.ts';

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
  metroSlug: string | null;
  timezone: string;
  /** The next upcoming occurrence, or the most recent one when all have passed. */
  startsAt: Date;
  endsAt: Date | null;
  startDateLocal: string;
  startTimeLocal: string;
  occurrenceId: string;
  /** `free` (open or with registration) or `external` (tickets sold elsewhere). */
  admissionType: 'free' | 'external';
  admission: 'free_open' | 'free_registration' | 'external_tickets';
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
}

export interface LiveEventFilters {
  category?: string;
  city?: string;
  metro?: string;
  lat?: number;
  lng?: number;
  venue?: string;
  artist?: string;
  q?: string;
  dateFrom?: Date;
  dateTo?: Date;
  weekend?: boolean;
  limit?: number;
}

export interface LiveVenueSummary {
  venueName: string;
  address: string | null;
  city: string;
  state: string;
  metroSlug: string | null;
  upcomingEventCount: number;
  upcomingEvents: LiveEventWithDetails[];
}

export interface LiveArtistSummary {
  id: string;
  stageName: string;
  slug: string;
  upcomingEventCount: number;
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

export function toArtistSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);
const date = (seconds: unknown): Date | null => (seconds == null ? null : new Date(Number(seconds) * 1000));

/**
 * One row per published event, joined to the occurrence a visitor should see: the next upcoming one,
 * else the most recent past one. `?1` is "now" in epoch seconds.
 */
const EVENT_SELECT = `
  SELECT e.id, e.slug, e.title, e.category, e.description, e.timezone, e.admission, e.external_url, e.price_text,
         e.refund_policy_text, e.status, e.featured, e.image_rights_confirmed_at, e.capacity, e.max_party_size, e.qr_checkin, e.image_key, e.origin, e.created_at,
         v.name AS venue_name, v.address, v.city, v.state, v.metro_slug,
         g.name AS org_name, g.kind AS org_kind, g.slug AS org_slug, g.verified_at AS org_verified_at,
         cs.source_urls, cs.provider, cs.destination_kind, cs.last_verified_at, cs.original_organizer_name,
         o.id AS occurrence_id, o.starts_at, o.ends_at, o.seats_taken,
         (SELECT COALESCE(SUM(seats_taken), 0) FROM event_occurrences WHERE event_id = e.id) AS registered_total
    FROM events e
    JOIN venues v ON v.id = e.venue_id
    LEFT JOIN organizations g ON g.id = e.organization_id
    LEFT JOIN catalog_sources cs ON cs.event_id = e.id
    JOIN event_occurrences o ON o.id = (
      SELECT id FROM event_occurrences
       WHERE event_id = e.id AND status = 'scheduled'
       ORDER BY (starts_at < ?1), CASE WHEN starts_at >= ?1 THEN starts_at END ASC, starts_at DESC
       LIMIT 1)
   WHERE e.status IN ('published', 'canceled') AND (g.id IS NULL OR g.status = 'active')`;

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
      metroSlug: str(r.metro_slug),
      timezone,
      startsAt: new Date(startsSec * 1000),
      endsAt: endsSec == null ? null : new Date(endsSec * 1000),
      startDateLocal: local.date,
      startTimeLocal: local.time,
      occurrenceId: String(r.occurrence_id),
      admissionType: admission === 'external_tickets' ? 'external' : 'free',
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
      priceMinCents: null,
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

  /** Upcoming events first (soonest first), then past ones; each event once, at its relevant occurrence. */
  async listDiscoverableEvents(filters: LiveEventFilters = {}): Promise<LiveEventWithDetails[]> {
    const now = this.now();
    const where: string[] = [];
    const params: (string | number)[] = [now];
    const add = (sql: string, value: string | number) => {
      params.push(value);
      where.push(sql.replace('?', `?${params.length}`));
    };
    if (filters.category)
      add('e.category = ?', filters.category === 'worship_event' ? 'worship' : filters.category);
    if (filters.city) add('v.city = ?', filters.city);
    const metro =
      filters.metro ||
      (Number.isFinite(filters.lat) && Number.isFinite(filters.lng)
        ? resolveNearestMetroByCoordinates(filters.lat as number, filters.lng as number).metro.slug
        : undefined);
    if (metro) add('v.metro_slug = ?', metro.trim().toLowerCase());
    if (filters.dateFrom && Number.isFinite(filters.dateFrom.getTime()))
      add('o.starts_at >= ?', Math.floor(filters.dateFrom.getTime() / 1000));
    if (filters.dateTo && Number.isFinite(filters.dateTo.getTime()))
      add('o.starts_at <= ?', Math.floor(filters.dateTo.getTime() / 1000));
    const like = (text: string) =>
      `%${text
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, '\\$&')}%`;
    if (filters.venue?.trim()) add("LOWER(v.name) LIKE ? ESCAPE '\\'", like(filters.venue));
    if (filters.artist?.trim()) {
      params.push(like(filters.artist));
      const p = `?${params.length}`;
      where.push(
        `(LOWER(e.title) LIKE ${p} ESCAPE '\\' OR EXISTS (SELECT 1 FROM event_performers p WHERE p.event_id = e.id AND LOWER(p.name) LIKE ${p} ESCAPE '\\'))`,
      );
    }
    if (filters.q?.trim()) {
      params.push(like(filters.q));
      const p = `?${params.length}`;
      where.push(
        `(LOWER(e.title) LIKE ${p} ESCAPE '\\' OR LOWER(COALESCE(e.description, '')) LIKE ${p} ESCAPE '\\'
          OR LOWER(v.name) LIKE ${p} ESCAPE '\\' OR LOWER(v.city) LIKE ${p} ESCAPE '\\' OR LOWER(v.state) LIKE ${p} ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM event_performers p WHERE p.event_id = e.id AND LOWER(p.name) LIKE ${p} ESCAPE '\\'))`,
      );
    }
    const rows = await allRows<Row>(this.db, {
      sql: `${EVENT_SELECT}${where.length ? ` AND ${where.join(' AND ')}` : ''}
            ORDER BY (o.starts_at < ?1), CASE WHEN o.starts_at >= ?1 THEN o.starts_at END ASC, o.starts_at DESC, e.id
            LIMIT ${Math.min(Math.max(Math.trunc(filters.limit ?? 50), 1), 500)}`,
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
      sql: `${EVENT_SELECT} AND ${column} = ?2 LIMIT 1`,
      params: [now, idOrSlug],
    });
    const row = rows[0];
    if (!row) return null;
    const performers = await this.performersFor([String(row.id)]);
    const occ = await allRows<Row>(this.db, {
      sql: 'SELECT id, starts_at, ends_at, status, seats_taken FROM event_occurrences WHERE event_id = ?1 ORDER BY starts_at',
      params: [String(row.id)],
    });
    return {
      ...this.mapEvent(row, performers.get(String(row.id)) ?? [], now),
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

  /** Artists with at least one published event, derived from performers. */
  async listArtists(): Promise<LiveArtistSummary[]> {
    const rows = await allRows<Row>(this.db, {
      sql: `SELECT p.name, COUNT(DISTINCT e.id) AS events
              FROM event_performers p
              JOIN events e ON e.id = p.event_id AND e.status = 'published'
              LEFT JOIN organizations g ON g.id = e.organization_id
             WHERE g.id IS NULL OR g.status = 'active'
             GROUP BY LOWER(p.name)
             ORDER BY events DESC, p.name`,
      params: [],
    });
    return rows.map((r) => ({
      id: `artist:${toArtistSlug(String(r.name))}`,
      stageName: String(r.name),
      slug: toArtistSlug(String(r.name)),
      upcomingEventCount: num(r.events),
    }));
  }

  async getMetroSummaries(): Promise<
    Array<
      GamoLiveMetro & {
        publishedEventCount: number;
        nextEventTitle: string | null;
        nextEventDateLocal: string | null;
      }
    >
  > {
    const all = await this.listDiscoverableEvents({ limit: 500 });
    return GAMO_LIVE_METROS.map((metro) => {
      const mine = all.filter(
        (e) =>
          e.metroSlug === metro.slug ||
          (e.state.toUpperCase() === metro.state &&
            metro.cities.some((c) => c.toLowerCase() === e.city.toLowerCase())),
      );
      const next = mine.find((e) => !e.isPast) ?? null;
      return {
        ...metro,
        publishedEventCount: mine.length,
        nextEventTitle: next?.title ?? null,
        nextEventDateLocal: next?.startDateLocal ?? null,
      };
    });
  }

  /** Venues that have at least one published event, most active first. */
  async listDiscoverableVenues(filters: { metro?: string } = {}): Promise<LiveVenueSummary[]> {
    const published = await this.listDiscoverableEvents({ metro: filters.metro, limit: 500 });
    const map = new Map<string, LiveVenueSummary>();
    for (const evt of published) {
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
          metroSlug: evt.metroSlug,
          upcomingEventCount: 1,
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

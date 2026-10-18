/**
 * Shared helpers for door scanning, scanner sessions, the offline manifest and the organizer
 * dashboard (Agent C, design §5.3, T-09, T-10): the event as the scanner sees it, venue-local day
 * keys, holder initials and small SQL helpers. All instants are epoch seconds (UTC).
 */
import { allRows, type SqlDatabase, type SqlParam } from '../../security/sql-database.ts';
import { eventPolicyFromRow, type EventPolicy, type EventPolicyRow } from '../../types/policy.ts';

/** The event fields scanning needs. Times are epoch seconds. */
export interface ScanEventContext {
  id: string;
  title: string;
  slug: string;
  startsAt: number;
  /** `ends_at`, or start + 4 h when the organizer gave no end. */
  endsAt: number;
  /** IANA zone of the venue (venues.timezone when linked, else events.timezone). */
  timeZone: string;
  cancelledAt: number | null;
  status: string;
  organizerId: string;
  policy: EventPolicy;
}

/** Events without an end time are treated as four hours long for scanning and expiry purposes. */
export const DEFAULT_EVENT_LENGTH_SECONDS = 4 * 60 * 60;

export async function firstRow<T = Record<string, unknown>>(
  db: SqlDatabase,
  sql: string,
  params: SqlParam[] = [],
): Promise<T | null> {
  const rows = await allRows<T>(db, { sql, params });
  return rows[0] ?? null;
}

/** Loads the event (with its policy and venue zone) or null when it does not exist. */
export async function loadScanEvent(db: SqlDatabase, eventId: string): Promise<ScanEventContext | null> {
  const row = await firstRow<{
    id: string;
    title: string;
    slug: string;
    starts_at: number;
    ends_at: number | null;
    timezone: string;
    venue_tz: string | null;
    cancelled_at: number | null;
    status: string;
    organizer_id: string;
  }>(
    db,
    'SELECT e.id, e.title, e.slug, e.starts_at, e.ends_at, e.timezone, v.timezone AS venue_tz, e.cancelled_at, e.status, e.organizer_id FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = ?1',
    [eventId],
  );
  if (!row) return null;
  const policyRow = await firstRow<EventPolicyRow>(db, 'SELECT * FROM event_policies WHERE event_id = ?1', [
    eventId,
  ]);
  const startsAt = Number(row.starts_at);
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    startsAt,
    endsAt: row.ends_at === null ? startsAt + DEFAULT_EVENT_LENGTH_SECONDS : Number(row.ends_at),
    timeZone: isValidTimeZone(row.venue_tz)
      ? row.venue_tz!
      : isValidTimeZone(row.timezone)
        ? row.timezone
        : 'UTC',
    cancelledAt: row.cancelled_at === null ? null : Number(row.cancelled_at),
    status: row.status,
    organizerId: row.organizer_id,
    policy: eventPolicyFromRow(policyRow),
  };
}

/** Finds an event by id or slug (scanner URLs accept either). */
export async function resolveEventIdOrSlug(db: SqlDatabase, idOrSlug: string): Promise<string | null> {
  if (!idOrSlug || idOrSlug.length > 200) return null;
  const row = await firstRow<{ id: string }>(
    db,
    'SELECT id FROM events WHERE id = ?1 UNION ALL SELECT id FROM events WHERE slug = ?1 LIMIT 1',
    [idOrSlug],
  );
  return row?.id ?? null;
}

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const dayKeyFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * The venue-local calendar date `YYYY-MM-DD` of an instant (presence and multi-day passes are per
 * local day). Intl does the zone arithmetic, so DST changes and midnight are exact.
 */
export function venueDayKey(epochSeconds: number, timeZone: string): string {
  let fmt = dayKeyFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    dayKeyFormatters.set(timeZone, fmt);
  }
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(epochSeconds * 1000)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** "12 Nov, 19:02 MST"-style local time for result screens and the dashboard. */
export function formatVenueTime(epochSeconds: number, timeZone: string, withDate = false): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    ...(withDate ? { month: 'short', day: 'numeric' } : {}),
    timeZoneName: 'short',
  }).format(new Date(epochSeconds * 1000));
}

/** First name + last initial ("Grace H."). Never the full name, never an email. */
export function holderInitials(name: string | null | undefined): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'Guest';
  const first = parts[0].slice(0, 40);
  if (parts.length === 1) return first;
  const last = parts[parts.length - 1];
  return `${first} ${last[0]!.toUpperCase()}.`;
}

/** `j•••@example.org` — enough to recognise an address, not to read it. */
export function maskEmail(email: string | null | undefined): string {
  const value = String(email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at < 1) return value ? '•••' : '';
  return `${value[0]}•••@${value.slice(at + 1)}`;
}

/** Parses a JSON array of strings (category zone codes, valid days, allowed zones); invalid → null. */
export function parseStringArray(json: unknown): string[] | null {
  if (typeof json !== 'string' || json.trim() === '') return null;
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) return null;
    const out = value
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.trim());
    return out;
  } catch {
    return null;
  }
}

/** Formats integer minor units as money for display (`$40.00`). */
export function formatMinorUnits(cents: number, currency = 'usd'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

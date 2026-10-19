/**
 * Organizer-side event management for Gamo Live (docs/LIVE_SCREENS.md B4–B7): validate and save events,
 * expand recurring dates, apply the review rule, cancel events, list registrations and export them.
 * Every function is scoped to one organization; callers have already checked membership.
 */
import { GAMO_LIVE_METROS } from '../services/live-external-discovery.ts';
import { zonedLocalToEpochSeconds, isTimeZone } from '../services/meeting-time.ts';
import { bytesToBase64Url, randomBytes } from '../security/crypto.ts';
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import {
  cancelRegistration,
  checkIn,
  type CheckInResult,
  type RegistrationView,
  getRegistration,
} from './registration.ts';
import { OrganizerError } from './organizers.ts';

export const EVENT_CATEGORIES = [
  { value: 'concert', label: 'Concert' },
  { value: 'worship', label: 'Worship night' },
  { value: 'conference', label: 'Conference' },
  { value: 'youth', label: 'Youth event' },
  { value: 'bible', label: 'Bible study' },
  { value: 'prayer', label: 'Prayer gathering' },
  { value: 'retreat', label: 'Retreat' },
  { value: 'community', label: 'Community event' },
] as const;

export const EVENT_TIME_ZONES = [
  { value: 'America/Phoenix', label: 'Arizona (no daylight time)' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
] as const;

export const ADMISSIONS = [
  { value: 'free_open', label: 'Free, no registration' },
  { value: 'free_registration', label: 'Free, with registration on Gamo Live' },
  { value: 'external_tickets', label: 'Tickets or registration on another website' },
] as const;
export type Admission = (typeof ADMISSIONS)[number]['value'];

export const MAX_OCCURRENCES = 52;
/** Registrants emailed in one request when an event is canceled (the rest are told to use the export). */
export const CANCEL_EMAIL_LIMIT = 40;

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  changes_requested: 'Changes requested',
  published: 'Published',
  rejected: 'Rejected',
  canceled: 'Canceled',
  hidden: 'Hidden by Gamo',
};

/** What the editor form holds (all strings, as typed). */
export interface EventFormValues {
  title: string;
  category: string;
  description: string;
  performers: string;
  venueName: string;
  address: string;
  city: string;
  state: string;
  timezone: string;
  schedule: string;
  date: string;
  startTime: string;
  endTime: string;
  until: string;
  admission: string;
  externalUrl: string;
  priceText: string;
  refundPolicyText: string;
  capacity: string;
  maxPartySize: string;
  qrCheckin: boolean;
}

export interface ValidatedEvent {
  title: string;
  category: string;
  description: string;
  performers: Array<{ name: string; role: string | null }>;
  venueName: string;
  address: string | null;
  city: string;
  state: string;
  timezone: string;
  schedule: 'once' | 'weekly' | 'monthly';
  date: string;
  startTime: string;
  endTime: string | null;
  until: string | null;
  admission: Admission;
  externalUrl: string | null;
  priceText: string | null;
  refundPolicyText: string | null;
  capacity: number | null;
  maxPartySize: number;
  qrCheckin: boolean;
}

const bad = (field: string): never => {
  throw new OrganizerError('invalid', field);
};
const t = (v: string | undefined) => (v ?? '').trim();
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function validDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return (
    d.getUTCFullYear() === Number(m[1]) &&
    d.getUTCMonth() === Number(m[2]) - 1 &&
    d.getUTCDate() === Number(m[3])
  );
}

/** One performer per line: `Name` or `Name | Role`. */
export function parsePerformers(text: string): Array<{ name: string; role: string | null }> {
  const out: Array<{ name: string; role: string | null }> = [];
  for (const raw of t(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [name, ...rest] = line.split('|');
    const role = rest.join('|').trim();
    if (!name.trim() || name.trim().length > 100 || role.length > 60 || out.length >= 20) bad('performers');
    out.push({ name: name.trim(), role: role || null });
  }
  return out;
}

export function validateEvent(input: EventFormValues): ValidatedEvent {
  const title = t(input.title);
  if (title.length < 3 || title.length > 140) bad('title');
  if (!EVENT_CATEGORIES.some((c) => c.value === input.category)) bad('category');
  const description = t(input.description);
  if (description.length < 20 || description.length > 4000) bad('description');
  const performers = parsePerformers(input.performers);
  const venueName = t(input.venueName);
  if (venueName.length < 2 || venueName.length > 120) bad('venueName');
  const address = t(input.address);
  if (address.length > 200) bad('address');
  const city = t(input.city);
  if (city.length < 2 || city.length > 80) bad('city');
  const state = t(input.state).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) bad('state');
  if (!isTimeZone(input.timezone) || !EVENT_TIME_ZONES.some((z) => z.value === input.timezone))
    bad('timezone');
  const schedule = input.schedule as ValidatedEvent['schedule'];
  if (!['once', 'weekly', 'monthly'].includes(schedule)) bad('schedule');
  if (!validDate(input.date)) bad('date');
  if (!TIME.test(input.startTime)) bad('startTime');
  const endTime = t(input.endTime);
  if (endTime && (!TIME.test(endTime) || endTime < input.startTime)) bad('endTime');
  let until: string | null = null;
  if (schedule !== 'once') {
    until = t(input.until);
    if (!validDate(until) || until < input.date) bad('until');
  }
  const admission = input.admission as Admission;
  if (!ADMISSIONS.some((a) => a.value === admission)) bad('admission');
  let externalUrl: string | null = null;
  if (admission === 'external_tickets') {
    try {
      const url = new URL(t(input.externalUrl));
      if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password)
        throw new Error();
      externalUrl = url.toString();
    } catch {
      bad('externalUrl');
    }
  }
  const priceText = t(input.priceText);
  if (priceText.length > 300) bad('priceText');
  const refundPolicyText = t(input.refundPolicyText);
  if (refundPolicyText.length > 600) bad('refundPolicyText');
  let capacity: number | null = null;
  if (t(input.capacity) !== '') {
    capacity = Number(t(input.capacity));
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100000) bad('capacity');
  }
  const maxPartySize = t(input.maxPartySize) === '' ? 6 : Number(t(input.maxPartySize));
  if (!Number.isInteger(maxPartySize) || maxPartySize < 1 || maxPartySize > 20) bad('maxPartySize');
  if (input.qrCheckin && admission !== 'free_registration') bad('qrCheckin');
  const v: ValidatedEvent = {
    title,
    category: input.category,
    description,
    performers,
    venueName,
    address: address || null,
    city,
    state,
    timezone: input.timezone,
    schedule,
    date: input.date,
    startTime: input.startTime,
    endTime: endTime || null,
    until,
    admission,
    externalUrl,
    priceText: priceText || null,
    refundPolicyText: refundPolicyText || null,
    capacity: admission === 'free_registration' ? capacity : null,
    maxPartySize,
    qrCheckin: Boolean(input.qrCheckin),
  };
  if (expandOccurrences(v).length > MAX_OCCURRENCES) bad('until');
  return v;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** All dates of a schedule as epoch seconds, computed per local date so daylight-time changes are correct. */
export function expandOccurrences(
  v: Pick<ValidatedEvent, 'schedule' | 'date' | 'startTime' | 'endTime' | 'until' | 'timezone'>,
  limit = MAX_OCCURRENCES + 1,
): Array<{ startsAt: number; endsAt: number | null }> {
  const [y, m, d] = v.date.split('-').map(Number);
  const out: Array<{ startsAt: number; endsAt: number | null }> = [];
  for (let i = 0; i < limit; i++) {
    let date: Date;
    if (v.schedule === 'monthly') {
      const first = new Date(Date.UTC(y, m - 1 + i, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
    } else {
      date = new Date(Date.UTC(y, m - 1, d + (v.schedule === 'weekly' ? 7 * i : 0)));
    }
    const local = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
    if (v.until && local > v.until) break;
    const startsAt = zonedLocalToEpochSeconds(`${local}T${v.startTime}`, v.timezone);
    if (startsAt == null) bad('startTime');
    const endsAt = v.endTime ? zonedLocalToEpochSeconds(`${local}T${v.endTime}`, v.timezone) : null;
    out.push({ startsAt: startsAt as number, endsAt });
    if (v.schedule === 'once') break;
  }
  return out;
}

const slugify = (title: string) =>
  title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'event';

function metroFor(city: string, state: string): string | null {
  const metro = GAMO_LIVE_METROS.find(
    (m) => m.state === state && m.cities.some((c) => c.toLowerCase() === city.toLowerCase()),
  );
  return metro?.slug ?? null;
}

// --- Review rule -----------------------------------------------------------------------------------

export type ReviewRule = 'first_event' | 'every_event' | 'none';

export async function reviewRuleFor(db: SqlDatabase, organizationId: string): Promise<ReviewRule> {
  const row = (
    await allRows<{ review_every_event: number; first_event_approved_at: number | null }>(db, {
      sql: 'SELECT review_every_event, first_event_approved_at FROM organizations WHERE id = ?1',
      params: [organizationId],
    })
  )[0];
  if (!row) throw new OrganizerError('not_found');
  if (row.review_every_event === 1) return 'every_event';
  return row.first_event_approved_at == null ? 'first_event' : 'none';
}

// --- Saving ----------------------------------------------------------------------------------------

export interface SaveEventInput {
  organizationId: string;
  /** Present when editing. */
  eventId?: string;
  input: EventFormValues;
  /** Send for review (or publish, when the review rule allows) instead of keeping a draft. */
  submit: boolean;
  now: number;
}

const EDITABLE = ['draft', 'pending_review', 'changes_requested', 'rejected', 'published'];

/** Creates or updates an event. Returns its id and resulting status. Throws `OrganizerError`. */
export async function saveEvent(
  db: SqlDatabase,
  args: SaveEventInput,
): Promise<{ eventId: string; status: string }> {
  const org = (
    await allRows<{ status: string }>(db, {
      sql: 'SELECT status FROM organizations WHERE id = ?1',
      params: [args.organizationId],
    })
  )[0];
  if (!org) throw new OrganizerError('not_found');
  if (org.status !== 'active') throw new OrganizerError('suspended');
  const v = validateEvent(args.input);
  const occurrences = expandOccurrences(v);
  if (args.submit && !occurrences.some((o) => o.startsAt > args.now)) bad('date');

  const rule = await reviewRuleFor(db, args.organizationId);
  const gate = (): 'pending_review' | 'published' => (rule === 'none' ? 'published' : 'pending_review');
  const venueId = newPrefixedId('ven');
  const metro = metroFor(v.city, v.state);

  const venueStatement = {
    sql: `INSERT INTO venues (id, name, address, city, state, metro_slug, timezone) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          ON CONFLICT (name, city, state) DO UPDATE SET address = COALESCE(venues.address, excluded.address),
            metro_slug = COALESCE(venues.metro_slug, excluded.metro_slug)`,
    params: [venueId, v.venueName, v.address, v.city, v.state, metro, v.timezone] as (
      string | number | null
    )[],
  };
  const venueRef = '(SELECT id FROM venues WHERE name = ?1 AND city = ?2 AND state = ?3)';
  const recurrence = v.schedule === 'once' ? null : JSON.stringify({ freq: v.schedule, until: v.until });

  if (!args.eventId) {
    const eventId = newPrefixedId('evt');
    const status = args.submit ? gate() : 'draft';
    for (let attempt = 0; attempt < 4; attempt++) {
      const slug = `${slugify(v.title)}-${bytesToBase64Url(randomBytes(3))
        .toLowerCase()
        .replace(/[^a-z0-9]/g, 'x')
        .slice(0, 4)}`;
      try {
        await runBatch(db, [
          venueStatement,
          {
            sql: `INSERT INTO events (id, organization_id, origin, slug, title, category, description, venue_id, timezone, admission,
                    external_url, price_text, refund_policy_text, capacity, max_party_size, qr_checkin, recurrence, status,
                    published_at, created_at, updated_at)
                  SELECT ?1, ?2, 'organizer', ?3, ?4, ?5, ?6, v.id, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18
                    FROM venues v WHERE v.name = ?19 AND v.city = ?20 AND v.state = ?21`,
            params: [
              eventId,
              args.organizationId,
              slug,
              v.title,
              v.category,
              v.description,
              v.timezone,
              v.admission,
              v.externalUrl,
              v.priceText,
              v.refundPolicyText,
              v.capacity,
              v.maxPartySize,
              v.qrCheckin ? 1 : 0,
              recurrence,
              status,
              status === 'published' ? args.now : null,
              args.now,
              v.venueName,
              v.city,
              v.state,
            ],
          },
          ...occurrences.map((o) => ({
            sql: 'INSERT INTO event_occurrences (id, event_id, starts_at, ends_at) VALUES (?1, ?2, ?3, ?4)',
            params: [newPrefixedId('occ'), eventId, o.startsAt, o.endsAt] as (string | number | null)[],
          })),
          ...v.performers.map((p, position) => ({
            sql: 'INSERT INTO event_performers (event_id, position, name, role) VALUES (?1, ?2, ?3, ?4)',
            params: [eventId, position, p.name, p.role] as (string | number | null)[],
          })),
        ]);
        return { eventId, status };
      } catch (error) {
        if (!/UNIQUE|constraint/i.test(String((error as Error)?.message)) || attempt === 3) throw error;
      }
    }
    throw new OrganizerError('invalid', 'title');
  }

  // Editing.
  const existing = (
    await allRows<{ status: string; qr_checkin: number; admission: string }>(db, {
      sql: 'SELECT status, qr_checkin, admission FROM events WHERE id = ?1 AND organization_id = ?2',
      params: [args.eventId, args.organizationId],
    })
  )[0];
  if (!existing) throw new OrganizerError('not_found');
  if (!EDITABLE.includes(existing.status)) throw new OrganizerError('status_locked');

  const taken = (
    await allRows<{ active: number; max_seats: number }>(db, {
      sql: `SELECT (SELECT COUNT(*) FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
                     WHERE o.event_id = ?1 AND r.status IN ('pending', 'confirmed')) AS active,
                   COALESCE((SELECT MAX(seats_taken) FROM event_occurrences WHERE event_id = ?1), 0) AS max_seats`,
      params: [args.eventId],
    })
  )[0];
  const locked = Number(taken?.active ?? 0) > 0;
  if (locked && v.capacity != null && v.capacity < Number(taken?.max_seats ?? 0)) bad('capacity');

  let status = existing.status;
  if (existing.status === 'published' || args.submit) status = gate();
  else if (existing.status === 'rejected') status = 'draft';
  const publishing = status === 'published' && existing.status !== 'published';

  const statements = [
    venueStatement,
    {
      sql: `UPDATE events SET title = ?2, category = ?3, description = ?4, venue_id = ${venueRef.replace('?1', '?5').replace('?2', '?6').replace('?3', '?7')},
              timezone = ?8, price_text = ?9, refund_policy_text = ?10, max_party_size = ?11, status = ?12,
              published_at = CASE WHEN ?13 = 1 THEN ?14 ELSE published_at END, updated_at = ?14
              ${locked ? '' : ', admission = ?15, external_url = ?16, capacity = ?17, qr_checkin = ?18, recurrence = ?19'}
            WHERE id = ?1`,
      params: [
        args.eventId,
        v.title,
        v.category,
        v.description,
        v.venueName,
        v.city,
        v.state,
        v.timezone,
        v.priceText,
        v.refundPolicyText,
        v.maxPartySize,
        status,
        publishing ? 1 : 0,
        args.now,
        ...(locked ? [] : [v.admission, v.externalUrl, v.capacity, v.qrCheckin ? 1 : 0, recurrence]),
      ] as (string | number | null)[],
    },
    ...(locked
      ? [
          {
            sql: "UPDATE events SET capacity = CASE WHEN admission = 'free_registration' THEN ?2 ELSE capacity END WHERE id = ?1",
            params: [args.eventId, v.capacity] as (string | number | null)[],
          },
        ]
      : [
          {
            sql: 'DELETE FROM event_occurrences WHERE event_id = ?1',
            params: [args.eventId] as (string | number | null)[],
          },
          ...occurrences.map((o) => ({
            sql: 'INSERT INTO event_occurrences (id, event_id, starts_at, ends_at) VALUES (?1, ?2, ?3, ?4)',
            params: [newPrefixedId('occ'), args.eventId as string, o.startsAt, o.endsAt] as (
              string | number | null
            )[],
          })),
        ]),
    {
      sql: 'DELETE FROM event_performers WHERE event_id = ?1',
      params: [args.eventId] as (string | number | null)[],
    },
    ...v.performers.map((p, position) => ({
      sql: 'INSERT INTO event_performers (event_id, position, name, role) VALUES (?1, ?2, ?3, ?4)',
      params: [args.eventId as string, position, p.name, p.role] as (string | number | null)[],
    })),
  ];
  await runBatch(db, statements);
  return { eventId: args.eventId, status };
}

/** Sends a draft or "changes requested" event for review, or publishes it when the review rule allows. */
export async function submitEvent(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; now: number },
): Promise<string> {
  const org = (
    await allRows<{ status: string }>(db, {
      sql: 'SELECT status FROM organizations WHERE id = ?1',
      params: [input.organizationId],
    })
  )[0];
  if (org?.status !== 'active') throw new OrganizerError('suspended');
  const rule = await reviewRuleFor(db, input.organizationId);
  const status = rule === 'none' ? 'published' : 'pending_review';
  const rows = await allRows<{ id: string }>(db, {
    sql: `UPDATE events SET status = ?3, published_at = CASE WHEN ?3 = 'published' THEN ?4 ELSE published_at END, updated_at = ?4
           WHERE id = ?1 AND organization_id = ?2 AND status IN ('draft', 'changes_requested', 'rejected')
             AND EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = events.id AND o.status = 'scheduled' AND o.starts_at > ?4)
       RETURNING id`,
    params: [input.eventId, input.organizationId, status, input.now],
  });
  if (rows.length === 0) throw new OrganizerError('status_locked');
  return status;
}

// --- Reading ---------------------------------------------------------------------------------------

export interface OrganizerEventRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  status: string;
  admission: string;
  venueName: string;
  city: string;
  state: string;
  timezone: string;
  nextStartsAt: number | null;
  firstStartsAt: number | null;
  occurrenceCount: number;
  peopleRegistered: number;
}

export async function listOrganizerEvents(
  db: SqlDatabase,
  organizationId: string,
  filters: { status?: string; q?: string } = {},
  now = Math.floor(Date.now() / 1000),
): Promise<OrganizerEventRow[]> {
  const params: (string | number)[] = [organizationId, now];
  let where = 'e.organization_id = ?1';
  if (filters.status && EVENT_STATUS_LABELS[filters.status]) {
    params.push(filters.status);
    where += ` AND e.status = ?${params.length}`;
  }
  if (filters.q?.trim()) {
    params.push(
      `%${filters.q
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, '\\$&')}%`,
    );
    where += ` AND (LOWER(e.title) LIKE ?${params.length} ESCAPE '\\' OR LOWER(v.name) LIKE ?${params.length} ESCAPE '\\')`;
  }
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT e.id, e.slug, e.title, e.category, e.status, e.admission, e.timezone, v.name AS venue_name, v.city, v.state,
                 (SELECT MIN(starts_at) FROM event_occurrences WHERE event_id = e.id AND status = 'scheduled' AND starts_at >= ?2) AS next_at,
                 (SELECT MIN(starts_at) FROM event_occurrences WHERE event_id = e.id) AS first_at,
                 (SELECT COUNT(*) FROM event_occurrences WHERE event_id = e.id) AS n,
                 (SELECT COALESCE(SUM(r.party_size), 0) FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
                    WHERE o.event_id = e.id AND r.status = 'confirmed') AS people
            FROM events e JOIN venues v ON v.id = e.venue_id
           WHERE ${where}
           ORDER BY (next_at IS NULL), next_at, first_at DESC, e.created_at DESC
           LIMIT 200`,
    params,
  });
  const n = (x: unknown) => (x == null ? null : Number(x));
  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    category: String(r.category),
    status: String(r.status),
    admission: String(r.admission),
    venueName: String(r.venue_name),
    city: String(r.city),
    state: String(r.state),
    timezone: String(r.timezone),
    nextStartsAt: n(r.next_at),
    firstStartsAt: n(r.first_at),
    occurrenceCount: Number(r.n),
    peopleRegistered: Number(r.people),
  }));
}

export interface OrganizerOccurrence {
  id: string;
  startsAt: number;
  endsAt: number | null;
  canceled: boolean;
  seatsTaken: number;
  confirmedPeople: number;
  checkedInPeople: number;
}

export interface OrganizerEventDetail {
  id: string;
  slug: string;
  status: string;
  values: EventFormValues;
  qrCheckin: boolean;
  admission: Admission;
  capacity: number | null;
  occurrences: OrganizerOccurrence[];
  registrationsLocked: boolean;
  decision: { decision: string; note: string | null; decidedAt: number } | null;
}

function parseRecurrence(value: unknown): { freq?: string; until?: string } {
  try {
    return value ? JSON.parse(String(value)) : {};
  } catch {
    return {};
  }
}

/** Splits an epoch time back into the editor's local date and time. */
function localFields(epoch: number, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epoch * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

export async function getOrganizerEvent(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
): Promise<OrganizerEventDetail | null> {
  const e = (
    await allRows<Record<string, unknown>>(db, {
      sql: `SELECT e.*, v.name AS venue_name, v.address, v.city, v.state FROM events e JOIN venues v ON v.id = e.venue_id
             WHERE e.id = ?1 AND e.organization_id = ?2`,
      params: [eventId, organizationId],
    })
  )[0];
  if (!e) return null;
  const occ = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.starts_at, o.ends_at, o.status, o.seats_taken,
                 COALESCE((SELECT SUM(party_size) FROM registrations WHERE occurrence_id = o.id AND status = 'confirmed'), 0) AS confirmed,
                 COALESCE((SELECT SUM(party_size) FROM registrations WHERE occurrence_id = o.id AND status = 'confirmed' AND checked_in_at IS NOT NULL), 0) AS checked_in
            FROM event_occurrences o WHERE o.event_id = ?1 ORDER BY o.starts_at`,
    params: [eventId],
  });
  const performers = await allRows<{ name: string; role: string | null }>(db, {
    sql: 'SELECT name, role FROM event_performers WHERE event_id = ?1 ORDER BY position',
    params: [eventId],
  });
  const decision = (
    await allRows<{ decision: string; note: string | null; decided_at: number }>(db, {
      sql: `SELECT decision, note, decided_at FROM review_decisions WHERE subject_type = 'event' AND subject_id = ?1
             ORDER BY decided_at DESC, rowid DESC LIMIT 1`,
      params: [eventId],
    })
  )[0];
  const active = (
    await allRows<{ n: number }>(db, {
      sql: `SELECT COUNT(*) AS n FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
             WHERE o.event_id = ?1 AND r.status IN ('pending', 'confirmed')`,
      params: [eventId],
    })
  )[0];
  const tz = String(e.timezone);
  const first = occ[0] ? localFields(Number(occ[0].starts_at), tz) : { date: '', time: '19:00' };
  const end = occ[0]?.ends_at != null ? localFields(Number(occ[0].ends_at), tz).time : '';
  const recurrence = parseRecurrence(e.recurrence);
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    id: String(e.id),
    slug: String(e.slug),
    status: String(e.status),
    qrCheckin: Number(e.qr_checkin) === 1,
    admission: e.admission as Admission,
    capacity: e.capacity == null ? null : Number(e.capacity),
    registrationsLocked: Number(active?.n ?? 0) > 0,
    occurrences: occ.map((o) => ({
      id: String(o.id),
      startsAt: Number(o.starts_at),
      endsAt: o.ends_at == null ? null : Number(o.ends_at),
      canceled: o.status === 'canceled',
      seatsTaken: Number(o.seats_taken),
      confirmedPeople: Number(o.confirmed),
      checkedInPeople: Number(o.checked_in),
    })),
    decision: decision
      ? { decision: decision.decision, note: decision.note, decidedAt: Number(decision.decided_at) }
      : null,
    values: {
      title: s(e.title),
      category: s(e.category),
      description: s(e.description),
      performers: performers.map((p) => (p.role ? `${p.name} | ${p.role}` : p.name)).join('\n'),
      venueName: s(e.venue_name),
      address: s(e.address),
      city: s(e.city),
      state: s(e.state),
      timezone: tz,
      schedule: recurrence.freq === 'weekly' || recurrence.freq === 'monthly' ? recurrence.freq : 'once',
      date: first.date,
      startTime: first.time,
      endTime: end,
      until: recurrence.until ?? '',
      admission: s(e.admission),
      externalUrl: s(e.external_url),
      priceText: s(e.price_text),
      refundPolicyText: s(e.refund_policy_text),
      capacity: e.capacity == null ? '' : String(e.capacity),
      maxPartySize: String(e.max_party_size),
      qrCheckin: Number(e.qr_checkin) === 1,
    },
  };
}

// --- Canceling -------------------------------------------------------------------------------------

export interface AffectedRegistrant {
  name: string;
  email: string;
  startsAt: number;
}

/**
 * Cancels an event: every date is canceled, every pending or confirmed registration is canceled and its seats
 * are released. Returns the people to tell. Draft and review-stage events can be canceled too.
 */
export async function cancelEvent(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; now: number },
): Promise<AffectedRegistrant[]> {
  const ev = (
    await allRows<{ status: string }>(db, {
      sql: 'SELECT status FROM events WHERE id = ?1 AND organization_id = ?2',
      params: [input.eventId, input.organizationId],
    })
  )[0];
  if (!ev) throw new OrganizerError('not_found');
  if (ev.status === 'canceled' || ev.status === 'hidden') throw new OrganizerError('status_locked');
  const affected = await allRows<{ name: string; email: string; starts_at: number }>(db, {
    sql: `SELECT r.name, r.email, o.starts_at FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
           WHERE o.event_id = ?1 AND r.status = 'confirmed' ORDER BY o.starts_at, r.name`,
    params: [input.eventId],
  });
  await runBatch(db, [
    {
      sql: `UPDATE registrations SET status = 'canceled', canceled_at = ?2, expires_at = NULL
             WHERE status IN ('pending', 'confirmed') AND occurrence_id IN (SELECT id FROM event_occurrences WHERE event_id = ?1)`,
      params: [input.eventId, input.now],
    },
    {
      sql: "UPDATE event_occurrences SET status = 'canceled', seats_taken = 0 WHERE event_id = ?1",
      params: [input.eventId],
    },
    {
      sql: "UPDATE events SET status = 'canceled', updated_at = ?2 WHERE id = ?1",
      params: [input.eventId, input.now],
    },
  ]);
  return affected.map((a) => ({ name: a.name, email: a.email, startsAt: Number(a.starts_at) }));
}

// --- Registrations ---------------------------------------------------------------------------------

export interface OrganizerRegistration {
  id: string;
  occurrenceId: string;
  startsAt: number;
  name: string;
  email: string;
  partySize: number;
  status: string;
  checkedInAt: number | null;
  createdAt: number;
}

export async function listEventRegistrations(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
  filters: { occurrenceId?: string; q?: string } = {},
): Promise<OrganizerRegistration[]> {
  const params: (string | number)[] = [eventId, organizationId];
  let where = 'o.event_id = ?1 AND e.organization_id = ?2';
  if (filters.occurrenceId) {
    params.push(filters.occurrenceId);
    where += ` AND o.id = ?${params.length}`;
  }
  if (filters.q?.trim()) {
    params.push(
      `%${filters.q
        .trim()
        .toLowerCase()
        .replace(/[\\%_]/g, '\\$&')}%`,
    );
    where += ` AND (LOWER(r.name) LIKE ?${params.length} ESCAPE '\\' OR LOWER(r.email) LIKE ?${params.length} ESCAPE '\\')`;
  }
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT r.id, r.occurrence_id, o.starts_at, r.name, r.email, r.party_size, r.status, r.checked_in_at, r.created_at
            FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id JOIN events e ON e.id = o.event_id
           WHERE ${where} AND r.status IN ('pending', 'confirmed', 'canceled')
           ORDER BY o.starts_at, r.created_at LIMIT 2000`,
    params,
  });
  return rows.map((r) => ({
    id: String(r.id),
    occurrenceId: String(r.occurrence_id),
    startsAt: Number(r.starts_at),
    name: String(r.name),
    email: String(r.email),
    partySize: Number(r.party_size),
    status: String(r.status),
    checkedInAt: r.checked_in_at == null ? null : Number(r.checked_in_at),
    createdAt: Number(r.created_at),
  }));
}

/** CSV cell safe against spreadsheet formula injection (`=`, `+`, `-`, `@`, tab, CR at the start). */
export function csvCell(value: string | number | null): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function registrationsCsv(rows: OrganizerRegistration[], timeZone: string): string {
  const when = (epoch: number) => {
    const p = localFields(epoch, timeZone);
    return `${p.date} ${p.time}`;
  };
  const lines = [
    ['Date', 'Name', 'Email', 'People', 'Status', 'Checked in', 'Registered'].map(csvCell).join(','),
  ];
  for (const r of rows)
    lines.push(
      [
        when(r.startsAt),
        r.name,
        r.email,
        r.partySize,
        r.status,
        r.checkedInAt ? when(r.checkedInAt) : '',
        when(r.createdAt),
      ]
        .map(csvCell)
        .join(','),
    );
  return lines.join('\r\n') + '\r\n';
}

/** Cancels one registration of this organization's event on the organizer's behalf. */
export async function cancelRegistrationForOrganizer(
  db: SqlDatabase,
  input: { organizationId: string; registrationId: string; now: number },
): Promise<RegistrationView> {
  const owned = await allRows(db, {
    sql: `SELECT 1 AS ok FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id JOIN events e ON e.id = o.event_id
           WHERE r.id = ?1 AND e.organization_id = ?2`,
    params: [input.registrationId, input.organizationId],
  });
  if (owned.length === 0) throw new OrganizerError('not_found');
  await cancelRegistration(db, input.registrationId, input.now);
  const view = await getRegistration(db, input.registrationId);
  if (!view) throw new OrganizerError('not_found');
  return view;
}

// --- Check-in --------------------------------------------------------------------------------------

export interface CheckInOccurrence {
  occurrenceId: string;
  eventId: string;
  eventTitle: string;
  timezone: string;
  startsAt: number;
  qrCheckin: boolean;
  canceled: boolean;
  confirmedPeople: number;
  checkedInPeople: number;
}

/** The date being checked in, if it belongs to this organization. */
export async function getCheckInOccurrence(
  db: SqlDatabase,
  organizationId: string,
  occurrenceId: string,
): Promise<CheckInOccurrence | null> {
  const r = (
    await allRows<Record<string, unknown>>(db, {
      sql: `SELECT o.id, o.event_id, o.starts_at, o.status, e.title, e.timezone, e.qr_checkin,
                   COALESCE((SELECT SUM(party_size) FROM registrations WHERE occurrence_id = o.id AND status = 'confirmed'), 0) AS confirmed,
                   COALESCE((SELECT SUM(party_size) FROM registrations WHERE occurrence_id = o.id AND status = 'confirmed' AND checked_in_at IS NOT NULL), 0) AS checked_in
              FROM event_occurrences o JOIN events e ON e.id = o.event_id
             WHERE o.id = ?1 AND e.organization_id = ?2`,
      params: [occurrenceId, organizationId],
    })
  )[0];
  if (!r) return null;
  return {
    occurrenceId: String(r.id),
    eventId: String(r.event_id),
    eventTitle: String(r.title),
    timezone: String(r.timezone),
    startsAt: Number(r.starts_at),
    qrCheckin: Number(r.qr_checkin) === 1,
    canceled: r.status === 'canceled',
    confirmedPeople: Number(r.confirmed),
    checkedInPeople: Number(r.checked_in),
  };
}

/** Checks a person in by their code. Only this organization's QR-enabled, scheduled dates accept check-in. */
export async function checkInForOrganizer(
  db: SqlDatabase,
  input: { organizationId: string; occurrenceId: string; code: string; now: number },
): Promise<CheckInResult> {
  const occ = await getCheckInOccurrence(db, input.organizationId, input.occurrenceId);
  if (!occ || !occ.qrCheckin || occ.canceled) throw new OrganizerError('not_found');
  return checkIn(db, { occurrenceId: input.occurrenceId, code: input.code, now: input.now });
}

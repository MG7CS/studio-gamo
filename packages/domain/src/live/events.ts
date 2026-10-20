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
import { OrganizerError, assertEventQuota } from './organizers.ts';

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

/** The list filter value for events that are with Gamo or sent back: in review, or changes requested. */
export const WAITING_FILTER = 'waiting';
export const WAITING_EVENT_STATUSES = ['pending_review', 'changes_requested'] as const;

/** Labels for every value the organizer's event list accepts as a status filter. */
export const EVENT_FILTER_LABELS: Record<string, string> = {
  ...EVENT_STATUS_LABELS,
  [WAITING_FILTER]: 'Waiting for Gamo',
};

/** How many events are waiting, from the per-status counts of `organizationCounts`. */
export function countWaitingEvents(eventsByStatus: Record<string, number>): number {
  return WAITING_EVENT_STATUSES.reduce((sum, status) => sum + (eventsByStatus[status] ?? 0), 0);
}

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
  /** Hours before a date that check-in opens by itself (only for events with QR check-in). */
  checkinOpensHours: string;
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
  checkinOpensHours: number;
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
  const venueName = t(input.venueName).replace(/\s+/g, ' ');
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
  // An end before the start means the event runs past midnight (a vigil from 9 PM to 2 AM).
  if (endTime && (!TIME.test(endTime) || endTime === input.startTime)) bad('endTime');
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
  const opensHours = t(input.checkinOpensHours) === '' ? 3 : Number(t(input.checkinOpensHours));
  if (!(CHECKIN_OPENS_HOURS_CHOICES as readonly number[]).includes(opensHours)) bad('checkinOpensHours');
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
    checkinOpensHours: opensHours,
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
    let endLocal = local;
    if (v.endTime && v.endTime < v.startTime) {
      const next = new Date(date.getTime() + 86_400_000);
      endLocal = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
    }
    const endsAt = v.endTime ? zonedLocalToEpochSeconds(`${endLocal}T${v.endTime}`, v.timezone) : null;
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

/** The proposed values of a change that waits for review (see migration 0004). */
export interface EventRevisionPayload {
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
  capacity: number | null;
  qrCheckin: boolean;
}

export function revisionPayloadFrom(v: ValidatedEvent): EventRevisionPayload {
  return {
    venueName: v.venueName,
    address: v.address,
    city: v.city,
    state: v.state,
    timezone: v.timezone,
    schedule: v.schedule,
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    until: v.until,
    admission: v.admission,
    externalUrl: v.externalUrl,
    capacity: v.capacity,
    qrCheckin: v.qrCheckin,
  };
}

/** A stored proposal, or null when there is none or it cannot be read. */
export function parseRevision(payload: unknown): EventRevisionPayload | null {
  if (typeof payload !== 'string' || payload === '') return null;
  try {
    return JSON.parse(payload) as EventRevisionPayload;
  } catch {
    return null;
  }
}

type Statement = { sql: string; params: (string | number | null)[] };

/**
 * Statements that write an approved revision onto its event. Every write waits on the review decision `decisionId`
 * already being recorded in the same batch, so nothing is applied unless the approval won. The dates, time zone and
 * admission are replaced only while nobody holds a registration (`scheduleLocked` is false).
 */
export function revisionApplyStatements(input: {
  eventId: string;
  revision: EventRevisionPayload;
  decisionId: string;
  now: number;
  scheduleLocked: boolean;
}): Statement[] {
  const { eventId, revision: r, decisionId, now, scheduleLocked } = input;
  const decided = 'EXISTS (SELECT 1 FROM review_decisions WHERE id = ?2)';
  const statements: Statement[] = [
    {
      sql: `INSERT INTO venues (id, name, address, city, state, metro_slug, timezone) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT (name, city, state) DO UPDATE SET address = COALESCE(venues.address, excluded.address),
              metro_slug = COALESCE(venues.metro_slug, excluded.metro_slug)`,
      params: [
        newPrefixedId('ven'),
        r.venueName,
        r.address,
        r.city,
        r.state,
        metroFor(r.city, r.state),
        r.timezone,
      ],
    },
    {
      sql: `UPDATE events SET venue_id = (SELECT id FROM venues WHERE name = ?3 AND city = ?4 AND state = ?5),
                   venue_name = ?3, venue_address = ?6, updated_at = ?7
             WHERE id = ?1 AND ${decided}`,
      params: [eventId, decisionId, r.venueName, r.city, r.state, r.address, now],
    },
  ];
  if (!scheduleLocked) {
    const recurrence = r.schedule === 'once' ? null : JSON.stringify({ freq: r.schedule, until: r.until });
    statements.push(
      {
        sql: `UPDATE events SET timezone = ?3, recurrence = ?4, admission = ?5, external_url = ?6, capacity = ?7, qr_checkin = ?8
               WHERE id = ?1 AND ${decided}`,
        params: [
          eventId,
          decisionId,
          r.timezone,
          recurrence,
          r.admission,
          r.externalUrl,
          r.capacity,
          r.qrCheckin ? 1 : 0,
        ],
      },
      {
        sql: `DELETE FROM event_occurrences WHERE event_id = ?1 AND ${decided}
                AND NOT EXISTS (SELECT 1 FROM registrations x JOIN event_occurrences q ON q.id = x.occurrence_id
                                 WHERE q.event_id = ?1 AND x.status IN ('pending', 'confirmed'))`,
        params: [eventId, decisionId],
      },
      ...expandOccurrences(r).map((o) => ({
        sql: `INSERT INTO event_occurrences (id, event_id, starts_at, ends_at)
              SELECT ?3, ?1, ?4, ?5 WHERE ${decided}
                AND NOT EXISTS (SELECT 1 FROM registrations x JOIN event_occurrences q ON q.id = x.occurrence_id
                                 WHERE q.event_id = ?1 AND x.status IN ('pending', 'confirmed'))`,
        params: [eventId, decisionId, newPrefixedId('occ'), o.startsAt, o.endsAt],
      })),
    );
  }
  statements.push({
    sql: `DELETE FROM event_revisions WHERE event_id = ?1 AND ${decided}`,
    params: [eventId, decisionId],
  });
  return statements;
}

/** The schedule and admission fields of a stored event, which stay as stored once people have registered. */
function lockedValues(stored: EventFormValues): Partial<EventFormValues> {
  const keep: Partial<EventFormValues> = {
    timezone: stored.timezone,
    schedule: stored.schedule,
    date: stored.date,
    startTime: stored.startTime,
    endTime: stored.endTime,
    until: stored.until,
    admission: stored.admission,
    externalUrl: stored.externalUrl,
    qrCheckin: stored.qrCheckin,
  };
  if (stored.admission !== 'free_registration') keep.capacity = stored.capacity;
  return keep;
}

function scheduleDiffers(stored: EventFormValues, next: ValidatedEvent): boolean {
  return (
    JSON.stringify([
      stored.timezone,
      stored.schedule,
      stored.date,
      stored.startTime,
      stored.endTime || null,
      stored.until || null,
    ]) !== JSON.stringify([next.timezone, next.schedule, next.date, next.startTime, next.endTime, next.until])
  );
}

/** True when an edit changes when, where or how people get in: the things review exists to check. */
function isMaterialChange(stored: EventFormValues, next: ValidatedEvent): boolean {
  let before: ValidatedEvent;
  try {
    before = validateEvent(stored);
  } catch {
    return true;
  }
  const pick = (e: ValidatedEvent) =>
    JSON.stringify([
      e.venueName.toLowerCase(),
      e.address,
      e.city.toLowerCase(),
      e.state,
      e.timezone,
      e.schedule,
      e.date,
      e.startTime,
      e.endTime,
      e.until,
      e.admission,
      e.externalUrl,
    ]);
  return pick(before) !== pick(next);
}

/** SQL condition: nobody holds a pending (unexpired) or confirmed registration for event `?1`; `?2` is now. */
const NO_ACTIVE_REGISTRATIONS = `NOT EXISTS (SELECT 1 FROM registrations x JOIN event_occurrences q ON q.id = x.occurrence_id
    WHERE q.event_id = ?1 AND (x.status = 'confirmed' OR (x.status = 'pending' AND x.expires_at > ?2)))`;

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
  // Editing an event people have registered for: the schedule and admission are locked, and the form does not post
  // disabled fields, so the stored values stand in for them before anything is validated.
  const current = args.eventId
    ? await getOrganizerEvent(db, args.organizationId, args.eventId, args.now)
    : null;
  if (args.eventId && !current) throw new OrganizerError('not_found');
  const v = validateEvent(
    current?.registrationsLocked ? { ...args.input, ...lockedValues(current.liveValues) } : args.input,
  );
  const occurrences = expandOccurrences(v);
  const hasFutureDate = current?.registrationsLocked
    ? current.occurrences.some((o) => !o.canceled && o.startsAt > args.now)
    : occurrences.some((o) => o.startsAt > args.now);
  if (args.submit && !hasFutureDate) bad('date');

  const rule = await reviewRuleFor(db, args.organizationId);
  // Events that send people to another site for tickets are always reviewed, whatever the organization's rule.
  const gate = (): 'pending_review' | 'published' =>
    rule === 'none' && v.admission !== 'external_tickets' ? 'published' : 'pending_review';
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
    await assertEventQuota(db, args.organizationId);
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
                    published_at, created_at, updated_at, venue_name, venue_address)
                  SELECT ?1, ?2, 'organizer', ?3, ?4, ?5, ?6, v.id, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18, ?19, ?22
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
              v.address,
            ],
          },
          {
            sql: 'UPDATE events SET checkin_opens_hours = ?2 WHERE id = ?1',
            params: [eventId, v.checkinOpensHours],
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
  const existing = current as OrganizerEventDetail;
  if (!EDITABLE.includes(existing.status)) throw new OrganizerError('status_locked');

  const taken = (
    await allRows<{ active: number; max_seats: number }>(db, {
      sql: `SELECT (SELECT COUNT(*) FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
                     WHERE o.event_id = ?1 AND (r.status = 'confirmed' OR (r.status = 'pending' AND r.expires_at > ?2))) AS active,
                   COALESCE((SELECT MAX(o.seats_taken - COALESCE((SELECT SUM(party_size) FROM registrations
                       WHERE occurrence_id = o.id AND status = 'pending' AND expires_at <= ?2), 0))
                     FROM event_occurrences o WHERE o.event_id = ?1), 0) AS max_seats`,
      params: [args.eventId, args.now],
    })
  )[0];
  const locked = Number(taken?.active ?? 0) > 0;
  if (locked && v.capacity != null && v.capacity < Number(taken?.max_seats ?? 0)) bad('capacity');

  // A published event stays published and visible through every edit. Wording, price notes and performers save
  // straight away. A change to when, where or how people get in is applied at once when the review rule allows;
  // otherwise it waits as a proposal (event_revisions) while the current version stays live for the public.
  const live = existing.liveValues;
  const published = existing.status === 'published';
  const material = published && isMaterialChange(live, v);
  const deferred = material && gate() !== 'published';
  let status = existing.status;
  if (!published) {
    if (args.submit) status = gate();
    else if (existing.status === 'rejected') status = 'draft';
  }
  const publishing = status === 'published' && !published;
  const scheduleChanged = !published || scheduleDiffers(live, v);

  const eventId = args.eventId;
  const statements: Statement[] = [];
  if (deferred) {
    const capacityDirect = v.admission === live.admission;
    statements.push(
      {
        sql: `UPDATE events SET title = ?2, category = ?3, description = ?4, price_text = ?5, refund_policy_text = ?6,
                max_party_size = ?7, updated_at = ?8
                ${capacityDirect ? ", capacity = CASE WHEN admission = 'free_registration' THEN ?9 ELSE capacity END" : ''}
              WHERE id = ?1`,
        params: [
          eventId,
          v.title,
          v.category,
          v.description,
          v.priceText,
          v.refundPolicyText,
          v.maxPartySize,
          args.now,
          ...(capacityDirect ? [v.capacity] : []),
        ],
      },
      {
        sql: 'INSERT OR REPLACE INTO event_revisions (event_id, payload, created_at) VALUES (?1, ?2, ?3)',
        params: [eventId, JSON.stringify(revisionPayloadFrom(v)), args.now],
      },
    );
  } else {
    statements.push(venueStatement, {
      sql: `UPDATE events SET title = ?2, category = ?3, description = ?4, venue_id = ${venueRef.replace('?1', '?5').replace('?2', '?6').replace('?3', '?7')},
              venue_name = ?5, venue_address = ?15, timezone = ?8, price_text = ?9, refund_policy_text = ?10, max_party_size = ?11, status = ?12,
              published_at = CASE WHEN ?13 = 1 THEN ?14 ELSE published_at END, updated_at = ?14
              ${locked ? '' : ', admission = ?16, external_url = ?17, capacity = ?18, qr_checkin = ?19, recurrence = ?20'}
            WHERE id = ?1`,
      params: [
        eventId,
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
        v.address,
        ...(locked ? [] : [v.admission, v.externalUrl, v.capacity, v.qrCheckin ? 1 : 0, recurrence]),
      ],
    });
    if (locked) {
      statements.push({
        sql: "UPDATE events SET capacity = CASE WHEN admission = 'free_registration' THEN ?2 ELSE capacity END WHERE id = ?1",
        params: [eventId, v.capacity],
      });
    } else if (scheduleChanged) {
      // Dates are rewritten only when the schedule itself changed, so an edit to wording keeps every date row (and
      // the history of canceled registrations that hangs off it).
      statements.push(
        // Guarded: if someone registered after this edit was read, the dates are left alone rather than deleted.
        {
          sql: `DELETE FROM event_occurrences WHERE event_id = ?1 AND ${NO_ACTIVE_REGISTRATIONS}`,
          params: [eventId, args.now],
        },
        ...occurrences.map((o) => ({
          sql: `INSERT INTO event_occurrences (id, event_id, starts_at, ends_at)
                SELECT ?3, ?1, ?4, ?5 WHERE ${NO_ACTIVE_REGISTRATIONS}`,
          params: [eventId, args.now, newPrefixedId('occ'), o.startsAt, o.endsAt] as (
            string | number | null
          )[],
        })),
      );
    }
    statements.push({ sql: 'DELETE FROM event_revisions WHERE event_id = ?1', params: [eventId] });
  }
  statements.push(
    {
      sql: 'UPDATE events SET checkin_opens_hours = ?2 WHERE id = ?1',
      params: [eventId, v.checkinOpensHours],
    },
    { sql: 'DELETE FROM event_performers WHERE event_id = ?1', params: [eventId] },
    ...v.performers.map((p, position) => ({
      sql: 'INSERT INTO event_performers (event_id, position, name, role) VALUES (?1, ?2, ?3, ?4)',
      params: [eventId, position, p.name, p.role] as (string | number | null)[],
    })),
  );
  await runBatch(db, statements);
  return { eventId, status };
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
  const admission = (
    await allRows<{ admission: string }>(db, {
      sql: 'SELECT admission FROM events WHERE id = ?1 AND organization_id = ?2',
      params: [input.eventId, input.organizationId],
    })
  )[0]?.admission;
  const status = rule === 'none' && admission !== 'external_tickets' ? 'published' : 'pending_review';
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

// --- The organization's schedule -------------------------------------------------------------------

/** One date of one of the organization's events, for a calendar that spans all of them. */
export interface ScheduledDate {
  id: string;
  eventId: string;
  title: string;
  status: string;
  timeZone: string;
  startsAt: number;
  endsAt: number | null;
  canceled: boolean;
  /** People confirmed for this date (registration events). */
  confirmedPeople: number;
}

/**
 * Every date of the organization's events that are public or waiting for review (drafts, rejected, hidden and
 * canceled events stay off it), soonest first, with the people confirmed for each.
 */
export async function listOrganizationSchedule(
  db: SqlDatabase,
  organizationId: string,
  limit = 1000,
): Promise<ScheduledDate[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.event_id, e.title, e.status, e.timezone, o.starts_at, o.ends_at, o.status AS occ_status,
                 COALESCE((SELECT SUM(party_size) FROM registrations WHERE occurrence_id = o.id AND status = 'confirmed'), 0) AS confirmed
            FROM event_occurrences o JOIN events e ON e.id = o.event_id
           WHERE e.organization_id = ?1 AND e.status IN ('published', 'pending_review', 'changes_requested')
           ORDER BY o.starts_at, e.title LIMIT ?2`,
    params: [organizationId, limit],
  });
  return rows.map((r) => ({
    id: String(r.id),
    eventId: String(r.event_id),
    title: String(r.title),
    status: String(r.status),
    timeZone: String(r.timezone),
    startsAt: Number(r.starts_at),
    endsAt: r.ends_at == null ? null : Number(r.ends_at),
    canceled: r.occ_status === 'canceled',
    confirmedPeople: Number(r.confirmed),
  }));
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
  if (filters.status === WAITING_FILTER) {
    where += ` AND e.status IN (${WAITING_EVENT_STATUSES.map((status) => `'${status}'`).join(', ')})`;
  } else if (filters.status && EVENT_STATUS_LABELS[filters.status]) {
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
    sql: `SELECT e.id, e.slug, e.title, e.category, e.status, e.admission, e.timezone, COALESCE(e.venue_name, v.name) AS venue_name, v.city, v.state,
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
  /** What the form shows: the live values, with a waiting proposal laid over them. */
  values: EventFormValues;
  /** What the public sees right now. Equals `values` unless a change is waiting for review. */
  liveValues: EventFormValues;
  /** A change to when, where or how people get in is waiting for Gamo; the live version stays visible. */
  changeWaiting: boolean;
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
  now: number,
): Promise<OrganizerEventDetail | null> {
  const e = (
    await allRows<Record<string, unknown>>(db, {
      sql: `SELECT e.*, COALESCE(e.venue_name, v.name) AS venue_name, COALESCE(e.venue_address, v.address) AS address, v.city, v.state FROM events e JOIN venues v ON v.id = e.venue_id
             WHERE e.id = ?1 AND e.organization_id = ?2`,
      params: [eventId, organizationId],
    })
  )[0];
  if (!e) return null;
  const occ = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.starts_at, o.ends_at, o.status,
                 o.seats_taken - COALESCE((SELECT SUM(party_size) FROM registrations
                   WHERE occurrence_id = o.id AND status = 'pending' AND expires_at <= ?2), 0) AS seats_taken,
                 COALESCE((SELECT SUM(party_size) FROM registrations WHERE occurrence_id = o.id AND status = 'confirmed'), 0) AS confirmed,
                 COALESCE((SELECT SUM(party_size) FROM registrations WHERE occurrence_id = o.id AND status = 'confirmed' AND checked_in_at IS NOT NULL), 0) AS checked_in
            FROM event_occurrences o WHERE o.event_id = ?1 ORDER BY o.starts_at`,
    params: [eventId, now],
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
             WHERE o.event_id = ?1 AND (r.status = 'confirmed' OR (r.status = 'pending' AND r.expires_at > ?2))`,
      params: [eventId, now],
    })
  )[0];
  const tz = String(e.timezone);
  const first = occ[0] ? localFields(Number(occ[0].starts_at), tz) : { date: '', time: '19:00' };
  const end = occ[0]?.ends_at != null ? localFields(Number(occ[0].ends_at), tz).time : '';
  const recurrence = parseRecurrence(e.recurrence);
  const s = (v: unknown) => (v == null ? '' : String(v));
  const liveValues: EventFormValues = {
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
    checkinOpensHours: String(e.checkin_opens_hours ?? 3),
  };
  const revisionRow = (
    await allRows<{ payload: string }>(db, {
      sql: 'SELECT payload FROM event_revisions WHERE event_id = ?1',
      params: [eventId],
    })
  )[0];
  const revision = parseRevision(revisionRow?.payload);
  const values: EventFormValues = revision
    ? {
        ...liveValues,
        venueName: revision.venueName,
        address: revision.address ?? '',
        city: revision.city,
        state: revision.state,
        timezone: revision.timezone,
        schedule: revision.schedule,
        date: revision.date,
        startTime: revision.startTime,
        endTime: revision.endTime ?? '',
        until: revision.until ?? '',
        admission: revision.admission,
        externalUrl: revision.externalUrl ?? '',
        capacity: revision.capacity == null ? '' : String(revision.capacity),
        qrCheckin: revision.qrCheckin,
      }
    : liveValues;
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
    values,
    liveValues,
    changeWaiting: revision != null,
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
  // Only a published event can be canceled; one that never went live is deleted instead (`deleteUnpublishedEvent`).
  if (ev.status !== 'published') throw new OrganizerError('status_locked');
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

/**
 * Cancels one date of a series. Its pending and confirmed registrations are canceled and the seats released; the
 * other dates are untouched. When it was the last date left, the whole event is marked canceled.
 */
export async function cancelOccurrence(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; occurrenceId: string; now: number },
): Promise<AffectedRegistrant[]> {
  const row = (
    await allRows<{ status: string; occ_status: string }>(db, {
      sql: `SELECT e.status, o.status AS occ_status FROM event_occurrences o JOIN events e ON e.id = o.event_id
             WHERE o.id = ?1 AND e.id = ?2 AND e.organization_id = ?3`,
      params: [input.occurrenceId, input.eventId, input.organizationId],
    })
  )[0];
  if (!row) throw new OrganizerError('not_found');
  if (row.status !== 'published' || row.occ_status !== 'scheduled') throw new OrganizerError('status_locked');
  const affected = await allRows<{ name: string; email: string; starts_at: number }>(db, {
    sql: `SELECT r.name, r.email, o.starts_at FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
           WHERE o.id = ?1 AND r.status = 'confirmed' ORDER BY r.name`,
    params: [input.occurrenceId],
  });
  await runBatch(db, [
    {
      sql: `UPDATE registrations SET status = 'canceled', canceled_at = ?2, expires_at = NULL
             WHERE status IN ('pending', 'confirmed') AND occurrence_id = ?1`,
      params: [input.occurrenceId, input.now],
    },
    {
      sql: "UPDATE event_occurrences SET status = 'canceled', seats_taken = 0 WHERE id = ?1",
      params: [input.occurrenceId],
    },
    {
      sql: `UPDATE events SET updated_at = ?2,
                   status = CASE WHEN EXISTS (SELECT 1 FROM event_occurrences WHERE event_id = ?1 AND status = 'scheduled')
                                 THEN status ELSE 'canceled' END
             WHERE id = ?1`,
      params: [input.eventId, input.now],
    },
  ]);
  return affected.map((a) => ({ name: a.name, email: a.email, startsAt: Number(a.starts_at) }));
}

/** Deletes an event that never went live (draft, in review, changes requested, rejected). Nobody can have registered. */
export async function deleteUnpublishedEvent(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string },
): Promise<void> {
  const rows = await allRows<{ id: string }>(db, {
    sql: `SELECT id FROM events WHERE id = ?1 AND organization_id = ?2 AND published_at IS NULL
             AND status IN ('draft', 'pending_review', 'changes_requested', 'rejected')`,
    params: [input.eventId, input.organizationId],
  });
  if (rows.length === 0) throw new OrganizerError('status_locked');
  await runBatch(db, [
    { sql: 'DELETE FROM event_performers WHERE event_id = ?1', params: [input.eventId] },
    { sql: 'DELETE FROM event_occurrences WHERE event_id = ?1', params: [input.eventId] },
    {
      sql: "DELETE FROM review_decisions WHERE subject_type = 'event' AND subject_id = ?1",
      params: [input.eventId],
    },
    { sql: 'DELETE FROM events WHERE id = ?1 AND published_at IS NULL', params: [input.eventId] },
  ]);
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
  filters: { occurrenceId?: string; q?: string; now: number },
): Promise<OrganizerRegistration[]> {
  const { now } = filters;
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
    sql: `SELECT r.id, r.occurrence_id, o.starts_at, r.name, r.email, r.party_size, r.status, r.expires_at, r.checked_in_at, r.created_at
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
    // A hold that ran out is shown as expired even before cleanup marks it so.
    status: r.status === 'pending' && Number(r.expires_at ?? 0) <= now ? 'expired' : String(r.status),
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
  /** Hours before the start that check-in opens by itself (the event's setting). */
  opensHours: number;
  /** When the organizer opened check-in by hand, if they did. */
  openedAt: number | null;
}

/** The date being checked in, if it belongs to this organization. */
export async function getCheckInOccurrence(
  db: SqlDatabase,
  organizationId: string,
  occurrenceId: string,
): Promise<CheckInOccurrence | null> {
  const r = (
    await allRows<Record<string, unknown>>(db, {
      sql: `SELECT o.id, o.event_id, o.starts_at, o.status, o.checkin_opened_at, e.title, e.timezone, e.qr_checkin, e.checkin_opens_hours,
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
    opensHours: Number(r.checkin_opens_hours ?? 3),
    openedAt: r.checkin_opened_at == null ? null : Number(r.checkin_opened_at),
  };
}

/** Check-in always ends this long after a date starts, so a leaked code is useless days later. */
export const CHECKIN_CLOSES_AFTER_SECONDS = 12 * 3600;
export const CHECKIN_OPENS_HOURS_CHOICES = [1, 3, 12, 24] as const;

export interface CheckInWindow {
  open: boolean;
  /** Epoch seconds when check-in opens by itself. */
  opensAt: number;
  closesAt: number;
  /** True when it is open because the organizer opened it by hand. */
  manual: boolean;
}

/**
 * Whether a date accepts check-in now. It opens `opensHours` before the start (the event's setting), or whenever the
 * organizer presses "Open check-in now" (early doors, a dry run), and always ends 12 hours after the start.
 */
export function checkInWindow(
  occ: Pick<CheckInOccurrence, 'startsAt' | 'opensHours' | 'openedAt'>,
  now: number,
): CheckInWindow {
  const opensAt = occ.startsAt - occ.opensHours * 3600;
  const closesAt = occ.startsAt + CHECKIN_CLOSES_AFTER_SECONDS;
  const manual = occ.openedAt != null;
  return { open: now <= closesAt && (manual || now >= opensAt), opensAt, closesAt, manual };
}

/** Opens or closes check-in for one date by hand. Only this organization's QR-enabled, scheduled dates. */
export async function setCheckInOpen(
  db: SqlDatabase,
  input: { organizationId: string; occurrenceId: string; open: boolean; now: number },
): Promise<void> {
  const occ = await getCheckInOccurrence(db, input.organizationId, input.occurrenceId);
  if (!occ || !occ.qrCheckin || occ.canceled) throw new OrganizerError('not_found');
  await runBatch(db, [
    {
      sql: 'UPDATE event_occurrences SET checkin_opened_at = ?2 WHERE id = ?1',
      params: [input.occurrenceId, input.open ? input.now : null],
    },
  ]);
}

/** Checks a person in by their code. Only this organization's QR-enabled, scheduled dates accept check-in. */
export async function checkInForOrganizer(
  db: SqlDatabase,
  input: { organizationId: string; occurrenceId: string; code: string; now: number },
): Promise<CheckInResult> {
  const occ = await getCheckInOccurrence(db, input.organizationId, input.occurrenceId);
  if (!occ || !occ.qrCheckin || occ.canceled) throw new OrganizerError('not_found');
  if (!checkInWindow(occ, input.now).open) return { ok: false, reason: 'outside_window' };
  return checkIn(db, { occurrenceId: input.occurrenceId, code: input.code, now: input.now });
}

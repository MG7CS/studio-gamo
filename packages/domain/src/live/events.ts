/**
 * Organizer-side event management for Gamo Live (docs/LIVE_SCREENS.md B4–B7): validate and save events,
 * expand recurring dates, apply the review rule, cancel events, list registrations and export them.
 * Every function is scoped to one organization; callers have already checked membership.
 *
 * Paid events (docs/LIVE_REQUIREMENTS.md §8 items 1, 6, 7 and 17): admission `paid_tickets` (no external link or price
 * text needed, the capacity in people is optional, QR check-in always on, the party size unused); an organization's
 * first paid event is always reviewed even after its first free event was approved, and only a verified organization
 * can submit one; once a sale exists the schedule and admission lock like registrations lock them; canceling cancels
 * the pending orders of the affected dates (seats and code uses given back) and returns the paid orders to refund.
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
import { PaidError } from './paid-types.ts';
import {
  accountReady,
  effectiveFundsFlow,
  readOrganizationPayments,
  readPaymentSettings,
} from './payments/resolve.ts';
import { TERMS_REGISTRY } from '../terms/registry.ts';

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
  { value: 'paid_tickets', label: 'Paid tickets on Gamo Live' },
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
  const paid = admission === 'paid_tickets';
  if (input.qrCheckin && admission !== 'free_registration' && !paid) bad('qrCheckin');
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
    capacity: admission === 'free_registration' || paid ? capacity : null,
    maxPartySize,
    // Paid tickets always carry a QR code; check-in is how they are used.
    qrCheckin: paid || Boolean(input.qrCheckin),
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

/**
 * Where a submitted event goes: `published`, or `pending_review` when the organization's rule asks for it, the event
 * sends people to another site for tickets (always reviewed), or it is the organization's first paid event (always
 * reviewed until one paid event was approved, even after the first free one was).
 */
export async function reviewGateFor(
  db: SqlDatabase,
  organizationId: string,
): Promise<(admission: string) => 'pending_review' | 'published'> {
  const row = (
    await allRows<{ first_paid_event_approved_at: number | null }>(db, {
      sql: 'SELECT first_paid_event_approved_at FROM organizations WHERE id = ?1',
      params: [organizationId],
    })
  )[0];
  const rule = await reviewRuleFor(db, organizationId);
  const firstPaidApproved = row?.first_paid_event_approved_at != null;
  return (admission) =>
    rule === 'none' && admission !== 'external_tickets' && (admission !== 'paid_tickets' || firstPaidApproved)
      ? 'published'
      : 'pending_review';
}

/** Only a verified organization (meeting held, Gamo verified) may submit a paid event (§8 item 7). */
/**
 * Who may sell (docs/LIVE_REQUIREMENTS.md §8.1 item 7): an organization sends a paid event for review, and Gamo approves
 * it, only when it is verified, its payments are ready for its funds-flow mode (from the stored settings and account
 * flags, as `sellingChecklist` shows them), and an owner accepted the current organizer terms. Throws the first missing
 * item as a `PaidError` (`not_verified`, `mode_not_chosen`, `account_not_ready`, `terms_not_accepted`).
 */
export async function assertMaySellTickets(db: SqlDatabase, organizationId: string): Promise<void> {
  const row = (
    await allRows<{ verified_at: number | null; terms: number }>(db, {
      sql: `SELECT g.verified_at,
                   EXISTS (SELECT 1 FROM terms_acceptances t JOIN memberships m ON m.organizer_id = t.organizer_id
                            WHERE m.organization_id = g.id AND m.role = 'owner' AND t.document = 'organizer-terms'
                              AND t.version = ?2) AS terms
              FROM organizations g WHERE g.id = ?1`,
      params: [organizationId, TERMS_REGISTRY['organizer-terms'].version],
    })
  )[0];
  if (row?.verified_at == null) throw new PaidError('not_verified');
  const [settings, payments] = await Promise.all([
    readPaymentSettings(db),
    readOrganizationPayments(db, organizationId),
  ]);
  const flow = effectiveFundsFlow(settings, payments);
  if (!flow) throw new PaidError('mode_not_chosen');
  if (!accountReady(flow, payments)) throw new PaidError('account_not_ready');
  if (Number(row.terms) !== 1) throw new PaidError('terms_not_accepted');
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
                                 WHERE q.event_id = ?1 AND x.status IN ('pending', 'confirmed'))
                AND ${NO_ORDER_HISTORY}`,
        params: [eventId, decisionId],
      },
      ...expandOccurrences(r).map((o) => ({
        sql: `INSERT INTO event_occurrences (id, event_id, starts_at, ends_at)
              SELECT ?3, ?1, ?4, ?5 WHERE ${decided}
                AND NOT EXISTS (SELECT 1 FROM registrations x JOIN event_occurrences q ON q.id = x.occurrence_id
                                 WHERE q.event_id = ?1 AND x.status IN ('pending', 'confirmed'))
                AND ${NO_ORDER_HISTORY}`,
        params: [eventId, decisionId, newPrefixedId('occ'), o.startsAt, o.endsAt],
      })),
    );
  }
  statements.push(...paidInventoryStatements(eventId));
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
  if (stored.admission !== 'free_registration' && stored.admission !== 'paid_tickets')
    keep.capacity = stored.capacity;
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

/**
 * SQL condition: no order and no cash drawer points at a date of event `?1`. Orders keep their date for good (the
 * foreign key has no cascade: order history is never deleted with a date), so any order, even a preview, an expired
 * hold or a refunded one, keeps the dates as they are.
 */
const NO_ORDER_HISTORY = `NOT EXISTS (SELECT 1 FROM orders od WHERE od.event_id = ?1)
    AND NOT EXISTS (SELECT 1 FROM cash_sessions cs WHERE cs.event_id = ?1)`;

/**
 * SQL condition: nobody holds a pending (unexpired) or confirmed registration for event `?1` (`?2` is now), and no
 * order points at its dates. A pending or paid order locks the schedule like a registration; an expired, canceled,
 * refunded or preview order keeps it too, because its date cannot be deleted (`NO_ORDER_HISTORY`).
 */
const NO_ACTIVE_REGISTRATIONS = `NOT EXISTS (SELECT 1 FROM registrations x JOIN event_occurrences q ON q.id = x.occurrence_id
    WHERE q.event_id = ?1 AND (x.status = 'confirmed' OR (x.status = 'pending' AND x.expires_at > ?2)))
    AND ${NO_ORDER_HISTORY}`;

/**
 * Inventory rows for every date of a paid event: one `occurrence_inventory` row per date (the event's cap in people)
 * and one `ticket_inventory` row per ticket type and date. Idempotent (`INSERT OR IGNORE`), so it runs after every
 * write that can add dates or ticket types; the event's capacity is copied onto existing rows too.
 */
export function paidInventoryStatements(eventId: string): Statement[] {
  return [
    {
      sql: `INSERT OR IGNORE INTO occurrence_inventory (occurrence_id, capacity)
            SELECT o.id, e.capacity FROM event_occurrences o JOIN events e ON e.id = o.event_id
             WHERE o.event_id = ?1 AND e.admission = 'paid_tickets'`,
      params: [eventId],
    },
    {
      sql: `UPDATE occurrence_inventory SET capacity = (SELECT capacity FROM events WHERE id = ?1)
             WHERE occurrence_id IN (SELECT id FROM event_occurrences WHERE event_id = ?1)
               AND EXISTS (SELECT 1 FROM events WHERE id = ?1 AND admission = 'paid_tickets')`,
      params: [eventId],
    },
    {
      sql: `INSERT OR IGNORE INTO ticket_inventory (ticket_type_id, occurrence_id, capacity, door_allocation, door_uses_online)
            SELECT t.id, o.id, t.capacity, t.door_allocation, t.door_uses_online
              FROM ticket_types t JOIN event_occurrences o ON o.event_id = t.event_id JOIN events e ON e.id = t.event_id
             WHERE t.event_id = ?1 AND e.admission = 'paid_tickets'`,
      params: [eventId],
    },
  ];
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

  // Events that send people to another site for tickets are always reviewed, whatever the organization's rule, and
  // so is an organization's first paid event.
  const gateOf = await reviewGateFor(db, args.organizationId);
  const gate = (): 'pending_review' | 'published' => gateOf(v.admission);
  const paid = v.admission === 'paid_tickets';
  // Submitting a paid event, or turning a published event into one, needs a verified organization.
  if (
    paid &&
    (current
      ? (current.status !== 'published' && args.submit) ||
        (current.status === 'published' && current.liveValues.admission !== 'paid_tickets')
      : args.submit)
  )
    await assertMaySellTickets(db, args.organizationId);
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
          ...paidInventoryStatements(eventId),
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
    await allRows<{ max_seats: number; max_people: number }>(db, {
      sql: `SELECT COALESCE((SELECT MAX(o.seats_taken - COALESCE((SELECT SUM(party_size) FROM registrations
                       WHERE occurrence_id = o.id AND status = 'pending' AND expires_at <= ?2), 0))
                     FROM event_occurrences o WHERE o.event_id = ?1), 0) AS max_seats,
                   COALESCE((SELECT MAX(i.people_taken) FROM occurrence_inventory i JOIN event_occurrences o ON o.id = i.occurrence_id
                     WHERE o.event_id = ?1), 0) AS max_people`,
      params: [args.eventId, args.now],
    })
  )[0];
  const locked = existing.registrationsLocked;
  if (locked && v.capacity != null && v.capacity < Number(taken?.max_seats ?? 0)) bad('capacity');
  // A paid event's cap can never drop below the people already holding or bought tickets for a date.
  if (v.admission === 'paid_tickets' && v.capacity != null && v.capacity < Number(taken?.max_people ?? 0))
    bad('capacity');

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
                ${capacityDirect ? ", capacity = CASE WHEN admission IN ('free_registration', 'paid_tickets') THEN ?9 ELSE capacity END" : ''}
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
        sql: "UPDATE events SET capacity = CASE WHEN admission IN ('free_registration', 'paid_tickets') THEN ?2 ELSE capacity END WHERE id = ?1",
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
    ...paidInventoryStatements(eventId),
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
  const gate = await reviewGateFor(db, input.organizationId);
  const admission = (
    await allRows<{ admission: string }>(db, {
      sql: 'SELECT admission FROM events WHERE id = ?1 AND organization_id = ?2',
      params: [input.eventId, input.organizationId],
    })
  )[0]?.admission;
  if (admission === 'paid_tickets') await assertMaySellTickets(db, input.organizationId);
  const status = gate(admission ?? '');
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
  /** The event's check-in settings, so the schedule can offer "Check in" while the door is open. */
  checkIn?: { enabled: boolean; opensHours: number; openedAt: number | null };
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
                 e.qr_checkin, e.checkin_opens_hours, o.checkin_opened_at,
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
    checkIn: {
      enabled: Number(r.qr_checkin) === 1,
      opensHours: Number(r.checkin_opens_hours ?? 3),
      openedAt: r.checkin_opened_at == null ? null : Number(r.checkin_opened_at),
    },
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
  /**
   * The schedule and admission are locked: someone holds a registration, or an order points at the event's dates
   * (pending, paid, or kept as history: orders are never deleted with a date).
   */
  registrationsLocked: boolean;
  /** The lock comes (also) from orders. */
  ordersLocked: boolean;
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
    await allRows<{ n: number; orders: number }>(db, {
      sql: `SELECT (SELECT COUNT(*) FROM registrations r JOIN event_occurrences o ON o.id = r.occurrence_id
                     WHERE o.event_id = ?1 AND (r.status = 'confirmed' OR (r.status = 'pending' AND r.expires_at > ?2))) AS n,
                   CASE WHEN ${NO_ORDER_HISTORY} THEN 0 ELSE 1 END AS orders`,
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
    registrationsLocked: Number(active?.n ?? 0) > 0 || Number(active?.orders ?? 0) > 0,
    ordersLocked: Number(active?.orders ?? 0) > 0,
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

/** A paid order on a canceled date: refund it in full with the refunds module and email the buyer (§8 item 17). */
export interface OrderToRefund {
  orderId: string;
  /** Null for a door sale where no email was given. */
  buyerEmail: string | null;
  buyerName: string | null;
  paymentMethod: string;
  startsAt: number;
}

/** A pending order canceled with its date whose Checkout Session may still be open: expire it at Stripe. */
export interface CheckoutToExpire {
  orderId: string;
  checkoutSessionId: string;
  stripeAccountId: string | null;
}

/**
 * What a cancellation returns: the confirmed registrants to tell (the array itself, as before), plus the paid orders
 * to refund and the open Checkout Sessions of the pending orders it canceled.
 */
export type CancelResult = AffectedRegistrant[] & {
  ordersToRefund: OrderToRefund[];
  checkoutsToExpire: CheckoutToExpire[];
};

/**
 * Statements that cancel every pending order on the dates `scope` selects (an SQL list of occurrence ids using
 * `?1`), giving back what each one held: ticket counts by channel (`online_taken` / `door_taken`), people per date
 * (`occurrence_inventory`) and code uses. The counters are lowered before the orders change status, in one batch.
 * Preview orders are released the same way.
 */
function releasePendingOrdersStatements(scope: string, scopeParam: string, now: number): Statement[] {
  const pending = `o.status = 'pending' AND o.occurrence_id IN (${scope})`;
  const held = (channel: string) =>
    `COALESCE((SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE ${pending} AND o.channel = '${channel}' AND o.occurrence_id = ticket_inventory.occurrence_id
          AND oi.ticket_type_id = ticket_inventory.ticket_type_id), 0)`;
  return [
    {
      sql: `UPDATE ticket_inventory SET online_taken = MAX(0, online_taken - ${held('online')}),
                   door_taken = MAX(0, door_taken - ${held('door')})
             WHERE occurrence_id IN (${scope})`,
      params: [scopeParam],
    },
    {
      sql: `UPDATE occurrence_inventory SET people_taken = MAX(0, people_taken - COALESCE((
                SELECT SUM(oi.quantity * oi.people_per_ticket) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                 WHERE ${pending} AND o.occurrence_id = occurrence_inventory.occurrence_id), 0))
             WHERE occurrence_id IN (${scope})`,
      params: [scopeParam],
    },
    {
      sql: `UPDATE event_codes SET uses = MAX(0, uses - (SELECT COUNT(*) FROM orders o WHERE ${pending} AND o.code_id = event_codes.id))
             WHERE id IN (SELECT o.code_id FROM orders o WHERE ${pending} AND o.code_id IS NOT NULL)`,
      params: [scopeParam],
    },
    {
      sql: `UPDATE orders SET status = 'canceled', canceled_at = ?2, updated_at = ?2
             WHERE status = 'pending' AND occurrence_id IN (${scope})`,
      params: [scopeParam, now],
    },
  ];
}

const str = (v: unknown) => (v == null ? null : String(v));

/** Pending orders with a Checkout Session on these dates (read before they are canceled). */
async function openCheckoutsOn(
  db: SqlDatabase,
  scope: string,
  scopeParam: string,
): Promise<CheckoutToExpire[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.checkout_session_id, o.stripe_account_id FROM orders o
           WHERE o.occurrence_id IN (${scope}) AND o.status = 'pending' AND o.checkout_session_id IS NOT NULL
           ORDER BY o.created_at, o.id`,
    params: [scopeParam],
  });
  return rows.map((r) => ({
    orderId: String(r.id),
    checkoutSessionId: String(r.checkout_session_id),
    stripeAccountId: str(r.stripe_account_id),
  }));
}

/**
 * Paid orders on these dates, read after the cancellation so an order paid while it ran is not missed (one paid
 * later still is the orders module's "paid, not fulfilled" case). Preview orders are voided, never refunded.
 */
async function paidOrdersOn(db: SqlDatabase, scope: string, scopeParam: string): Promise<OrderToRefund[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.buyer_email, o.buyer_name, o.payment_method, q.starts_at
            FROM orders o JOIN event_occurrences q ON q.id = o.occurrence_id
           WHERE o.occurrence_id IN (${scope}) AND o.is_preview = 0 AND o.status IN ('paid', 'partially_refunded')
           ORDER BY q.starts_at, o.created_at, o.id`,
    params: [scopeParam],
  });
  return rows.map((r) => ({
    orderId: String(r.id),
    buyerEmail: str(r.buyer_email),
    buyerName: str(r.buyer_name),
    paymentMethod: String(r.payment_method),
    startsAt: Number(r.starts_at),
  }));
}

const withOrders = (
  affected: AffectedRegistrant[],
  ordersToRefund: OrderToRefund[],
  checkoutsToExpire: CheckoutToExpire[],
): CancelResult => Object.assign(affected, { ordersToRefund, checkoutsToExpire });

/**
 * Cancels an event: every date is canceled, every pending or confirmed registration is canceled and its seats
 * are released, and every pending order is canceled with its seats and code uses given back. Returns the people to
 * tell, the paid orders to refund and the Checkout Sessions to expire.
 */
export async function cancelEvent(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; now: number },
): Promise<CancelResult> {
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
  const eventDates = 'SELECT id FROM event_occurrences WHERE event_id = ?1';
  const checkouts = await openCheckoutsOn(db, eventDates, input.eventId);
  await runBatch(db, [
    ...releasePendingOrdersStatements(eventDates, input.eventId, input.now),
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
  return withOrders(
    affected.map((a) => ({ name: a.name, email: a.email, startsAt: Number(a.starts_at) })),
    await paidOrdersOn(db, eventDates, input.eventId),
    checkouts,
  );
}

/**
 * Cancels one date of a series. Its pending and confirmed registrations are canceled and the seats released; the
 * other dates are untouched. When it was the last date left, the whole event is marked canceled.
 */
export async function cancelOccurrence(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; occurrenceId: string; now: number },
): Promise<CancelResult> {
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
  const checkouts = await openCheckoutsOn(db, '?1', input.occurrenceId);
  await runBatch(db, [
    ...releasePendingOrdersStatements('?1', input.occurrenceId, input.now),
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
  return withOrders(
    affected.map((a) => ({ name: a.name, email: a.email, startsAt: Number(a.starts_at) })),
    await paidOrdersOn(db, '?1', input.occurrenceId),
    checkouts,
  );
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

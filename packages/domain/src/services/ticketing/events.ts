/**
 * Organizer event create/edit (design §5.4, §4.4): venue-local date + time in the venue's IANA zone
 * (DST-safe), venue fields, event policies within platform bounds (`normalizeEventPolicy`), and ticket
 * categories (general, VIP, child with max age, companion bound to an accessible category, accessible,
 * group/table with seats per ticket, day / multi-day passes with valid days, sales window, per-order
 * limit, capacity, price in USD).
 *
 * Review: an organizer's first event goes to `pending_review` (staff approve it in admin). Once an event of
 * that organizer has been approved (`organizer_profiles.first_event_approved_at`, or — until the admin
 * review sets that column — an earlier staff-approved event), later events publish directly unless staff
 * set `always_review`. The caller has checked the organization membership (owner/admin).
 */
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../../security/sql-database.ts';
import { newPrefixedId, randomBase32 } from '../../security/index.ts';
import { CATEGORY_KINDS, CATEGORY_STATUSES, isOneOf, type CategoryKind } from '../../types/enums.ts';
import {
  eventPolicyToRow,
  normalizeEventPolicy,
  type EventPolicy,
  type EventPolicyInput,
} from '../../types/policy.ts';
import { singleLine } from './calendar.ts';
import { isValidTimeZone, utcToZonedLocal, zonedLocalToUtc } from './events-time.ts';
import {
  TicketingError,
  loadCategories,
  loadEvent,
  type CategoryRow,
  type FieldError,
} from './orders-shared.ts';

export const EVENT_CATEGORIES = ['worship', 'concert', 'bible', 'conference', 'youth'] as const;
export const MAX_CATEGORIES = 12;
export const MAX_CAPACITY = 100_000;
export const MAX_PRICE_CENTS = 100_000;

export interface LocalDateTimeInput {
  date: string;
  time: string;
}

export interface CategoryInput {
  /** Existing category id when editing. */
  id?: string | null;
  name: string;
  kind: string;
  description?: string | null;
  /** Dollars as typed ("12.50") or cents (number). */
  price: string | number;
  capacity: string | number;
  perOrderLimit?: string | number | null;
  maxAge?: string | number | null;
  seatsPerTicket?: string | number | null;
  /** YYYY-MM-DD dates (comma or space separated when typed). */
  validDays?: string | string[] | null;
  salesStart?: LocalDateTimeInput | null;
  salesEnd?: LocalDateTimeInput | null;
  /** Index (in this list) of the accessible category a companion ticket belongs to. */
  companionOf?: string | number | null;
  status?: string | null;
}

export interface EventInput {
  organizationId: string;
  title: string;
  category: string;
  tagline?: string | null;
  description: string;
  venueName: string;
  address?: string | null;
  city: string;
  state: string;
  timezone: string;
  start: LocalDateTimeInput;
  end?: LocalDateTimeInput | null;
  admissionType: string;
  categories: CategoryInput[];
  policy: EventPolicyInput;
}

interface NormalizedCategory {
  id: string;
  existing: boolean;
  name: string;
  kind: CategoryKind;
  description: string | null;
  priceCents: number;
  capacity: number;
  perOrderLimit: number | null;
  maxAge: number | null;
  seatsPerTicket: number;
  validDaysJson: string | null;
  salesStartAt: number | null;
  salesEndAt: number | null;
  requiresCompanionOf: string | null;
  status: string;
  sortOrder: number;
}

export interface NormalizedEvent {
  title: string;
  category: string;
  tagline: string | null;
  description: string;
  venueName: string;
  address: string | null;
  city: string;
  state: string;
  timezone: string;
  startsAt: number;
  endsAt: number | null;
  startDateLocal: string;
  startTimeLocal: string;
  admissionType: 'free' | 'paid';
  categories: NormalizedCategory[];
  policy: EventPolicy;
}

const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
const int = (v: unknown): number | null =>
  /^-?\d{1,7}$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : null;

/** "12.50" → 1250; numbers are taken as cents. Returns null for anything else. */
export function parsePriceCents(v: string | number): number | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? v : null;
  const t = String(v ?? '')
    .trim()
    .replace(/^\$/, '');
  if (t === '') return 0;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  const [d, c = ''] = t.split('.');
  return Number(d) * 100 + Number(c.padEnd(2, '0'));
}

function parseValidDays(v: CategoryInput['validDays']): string[] | null {
  if (blank(v)) return [];
  const list = Array.isArray(v) ? v : String(v).split(/[\s,]+/);
  const days = list.map((d) => d.trim()).filter(Boolean);
  return days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T12:00:00Z`)))
    ? [...new Set(days)].sort()
    : null;
}

/**
 * Validates the whole form. Field names match the form (`title`, `startDate`, `cat.0.price`,
 * `policy.refundPolicy` …) so pages can show each message next to its field.
 */
export function normalizeEventInput(
  input: EventInput,
  now: number,
  existing: CategoryRow[] = [],
): { ok: true; value: NormalizedEvent } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const text = (field: string, value: unknown, min: number, max: number, message: string) => {
    const v = singleLine(value as string);
    if (v.length < min || v.length > max) errors.push({ field, message });
    return v;
  };
  const title = text('title', input.title, 3, 150, 'Enter the event title (3 to 150 characters).');
  if (!(EVENT_CATEGORIES as readonly string[]).includes(input.category))
    errors.push({ field: 'category', message: 'Choose what kind of gathering this is.' });
  const tagline = singleLine(input.tagline).slice(0, 250) || null;
  const description = String(input.description ?? '').trim();
  if (description.length < 20 || description.length > 10_000)
    errors.push({ field: 'description', message: 'Describe the event in at least 20 characters.' });
  const venueName = text('venueName', input.venueName, 2, 200, 'Enter the venue name.');
  const address = singleLine(input.address).slice(0, 300) || null;
  const city = text('city', input.city, 2, 100, 'Enter the city.');
  const state = text('state', input.state, 2, 50, 'Enter the state.');
  const timezone = String(input.timezone ?? '').trim();
  if (!isValidTimeZone(timezone))
    errors.push({ field: 'timezone', message: 'Choose the time zone of the venue.' });

  let startsAt = 0;
  let endsAt: number | null = null;
  if (isValidTimeZone(timezone)) {
    const s = zonedLocalToUtc({
      date: input.start?.date ?? '',
      time: input.start?.time ?? '',
      zone: timezone,
    });
    if (!s.ok)
      errors.push({
        field: s.reason === 'invalid_time' ? 'startTime' : 'startDate',
        message: 'Enter the start date and time.',
      });
    else if (s.epochSeconds <= now)
      errors.push({ field: 'startDate', message: 'The start must be in the future.' });
    else startsAt = s.epochSeconds;
    if (input.end && !blank(input.end.date)) {
      const e = zonedLocalToUtc({
        date: input.end.date,
        time: blank(input.end.time) ? '23:59' : input.end.time,
        zone: timezone,
      });
      if (!e.ok)
        errors.push({ field: 'endDate', message: 'Enter a valid end date and time, or leave both empty.' });
      else if (startsAt && e.epochSeconds <= startsAt)
        errors.push({ field: 'endDate', message: 'The end must be after the start.' });
      else endsAt = e.epochSeconds;
    }
  }
  const admissionType =
    input.admissionType === 'paid' ? 'paid' : input.admissionType === 'free' ? 'free' : null;
  if (!admissionType) errors.push({ field: 'admissionType', message: 'Choose free or paid tickets.' });

  const policyResult = normalizeEventPolicy(input.policy ?? {});
  if (!policyResult.ok)
    for (const e of policyResult.errors) errors.push({ field: `policy.${e.field}`, message: e.message });

  const rows = (input.categories ?? []).filter((c) => !(blank(c.name) && blank(c.capacity) && blank(c.id)));
  if (rows.length === 0) errors.push({ field: 'cat.0.name', message: 'Add at least one ticket type.' });
  if (rows.length > MAX_CATEGORIES)
    errors.push({ field: 'categories', message: `Use at most ${MAX_CATEGORIES} ticket types.` });
  const ids = rows.map((r) => (r.id && existing.some((e) => e.id === r.id) ? r.id : newPrefixedId('cat')));
  const categories: NormalizedCategory[] = [];
  rows.forEach((c, i) => {
    const f = (name: string) => `cat.${i}.${name}`;
    const prior = existing.find((e) => e.id === c.id) ?? null;
    const name = text(f('name'), c.name, 1, 80, 'Name this ticket type (up to 80 characters).');
    const kind = isOneOf(CATEGORY_KINDS, c.kind) ? c.kind : null;
    if (!kind) errors.push({ field: f('kind'), message: 'Choose the kind of ticket.' });
    const priceCents = parsePriceCents(c.price);
    if (priceCents === null || priceCents > MAX_PRICE_CENTS)
      errors.push({
        field: f('price'),
        message: 'Enter the price in dollars, like 15 or 12.50 (0 for free).',
      });
    if (admissionType === 'free' && priceCents)
      errors.push({
        field: f('price'),
        message: 'Free events have free tickets only: set the price to 0, or choose paid tickets.',
      });
    const capacity = int(c.capacity);
    const minCapacity = prior ? Number(prior.reserved_count) : 1;
    if (capacity === null || capacity < 1 || capacity > MAX_CAPACITY)
      errors.push({
        field: f('capacity'),
        message: `Enter how many tickets are available (1 to ${MAX_CAPACITY}).`,
      });
    else if (prior && capacity * 1 < minCapacity / Math.max(1, Number(prior.seats_per_ticket)))
      errors.push({
        field: f('capacity'),
        message: `Capacity can't go below the ${Math.ceil(minCapacity / Math.max(1, Number(prior.seats_per_ticket)))} tickets already reserved or sold.`,
      });
    const perOrderLimit = blank(c.perOrderLimit) ? null : int(c.perOrderLimit);
    if (!blank(c.perOrderLimit) && (perOrderLimit === null || perOrderLimit < 1 || perOrderLimit > 20))
      errors.push({
        field: f('perOrderLimit'),
        message: 'Per-order limit: choose from 1 to 20, or leave it empty.',
      });
    let maxAge: number | null = null;
    if (kind === 'child') {
      maxAge = int(c.maxAge);
      if (maxAge === null || maxAge < 1 || maxAge > 17)
        errors.push({
          field: f('maxAge'),
          message: 'Child tickets: enter the oldest age allowed (1 to 17).',
        });
    }
    let seats = 1;
    if (kind === 'group' || kind === 'table') {
      const s = int(c.seatsPerTicket);
      if (s === null || s < 2 || s > 50)
        errors.push({
          field: f('seatsPerTicket'),
          message: 'Group and table tickets: enter how many people one ticket admits (2 to 50).',
        });
      else seats = s;
    }
    if (
      prior &&
      Number(prior.reserved_count) > 0 &&
      (seats !== Number(prior.seats_per_ticket) || kind !== prior.kind)
    )
      errors.push({
        field: f('kind'),
        message:
          "Tickets of this type are already reserved, so its kind and seats can't change. Add a new ticket type instead.",
      });
    let validDaysJson: string | null = null;
    if (kind === 'day_pass' || kind === 'multi_day') {
      const days = parseValidDays(c.validDays);
      if (!days || days.length === 0 || (kind === 'day_pass' && days.length !== 1))
        errors.push({
          field: f('validDays'),
          message:
            kind === 'day_pass'
              ? 'Day pass: enter the one date it is valid (YYYY-MM-DD).'
              : 'Multi-day pass: enter the dates it is valid (YYYY-MM-DD, separated by commas).',
        });
      else validDaysJson = JSON.stringify(days);
    }
    const window = (field: 'salesStart' | 'salesEnd'): number | null => {
      const w = c[field];
      if (!w || blank(w.date)) return null;
      const r = isValidTimeZone(timezone)
        ? zonedLocalToUtc({ date: w.date, time: blank(w.time) ? '00:00' : w.time, zone: timezone })
        : null;
      if (!r || !r.ok) {
        errors.push({
          field: f(field),
          message: 'Enter a valid date and time for the sales window, or leave it empty.',
        });
        return null;
      }
      return r.epochSeconds;
    };
    const salesStartAt = window('salesStart');
    const salesEndAt = window('salesEnd');
    if (salesStartAt !== null && salesEndAt !== null && salesStartAt >= salesEndAt)
      errors.push({ field: f('salesEnd'), message: 'Sales must end after they start.' });
    let requiresCompanionOf: string | null = null;
    if (kind === 'companion') {
      const idx = int(c.companionOf);
      const target = idx !== null ? rows[idx] : undefined;
      if (idx === null || !target || target.kind !== 'accessible' || idx === i)
        errors.push({
          field: f('companionOf'),
          message: 'Companion tickets: choose the accessible ticket type they go with.',
        });
      else requiresCompanionOf = ids[idx];
    }
    const status = isOneOf(CATEGORY_STATUSES, c.status) ? c.status : 'active';
    categories.push({
      id: ids[i],
      existing: Boolean(prior),
      name,
      kind: kind ?? 'general',
      description:
        String(c.description ?? '')
          .trim()
          .slice(0, 300) || null,
      priceCents: priceCents ?? 0,
      capacity: (capacity ?? 1) * seats,
      perOrderLimit,
      maxAge,
      seatsPerTicket: seats,
      validDaysJson,
      salesStartAt,
      salesEndAt,
      requiresCompanionOf,
      status,
      sortOrder: i,
    });
  });
  if (admissionType === 'paid' && categories.length && categories.every((c) => c.priceCents === 0))
    errors.push({ field: 'cat.0.price', message: 'Paid events need at least one ticket type with a price.' });
  if (errors.length || !policyResult.ok || !admissionType) return { ok: false, errors };
  const local = utcToZonedLocal(startsAt, timezone);
  return {
    ok: true,
    value: {
      title,
      category: input.category,
      tagline,
      description,
      venueName,
      address,
      city,
      state,
      timezone,
      startsAt,
      endsAt,
      startDateLocal: local.date,
      startTimeLocal: local.time,
      admissionType,
      categories,
      policy: policyResult.policy,
    },
  };
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 70);
  return `${base || 'event'}-${randomBase32(6).toLowerCase()}`;
}

/** Inserts companion categories after the accessible ones they reference (the tier trigger checks that). */
function categoryOrder(categories: NormalizedCategory[]): NormalizedCategory[] {
  return [...categories].sort(
    (a, b) => Number(Boolean(a.requiresCompanionOf)) - Number(Boolean(b.requiresCompanionOf)),
  );
}

function insertCategory(eventId: string, c: NormalizedCategory): SqlStatementSpec {
  return {
    sql: "INSERT INTO ticket_tiers (id, event_id, name, price_cents, capacity, reserved_count, note, kind, description, sold_count, per_order_limit, min_age, max_age, seats_per_ticket, zone_codes_json, valid_days_json, sales_start_at, sales_end_at, requires_companion_of, currency, sort_order, status) VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL, ?6, ?7, 0, ?8, NULL, ?9, ?10, NULL, ?11, ?12, ?13, ?14, 'usd', ?15, ?16)",
    params: [
      c.id,
      eventId,
      c.name,
      c.priceCents,
      c.capacity,
      c.kind,
      c.description,
      c.perOrderLimit,
      c.maxAge,
      c.seatsPerTicket,
      c.validDaysJson,
      c.salesStartAt,
      c.salesEndAt,
      c.requiresCompanionOf,
      c.sortOrder,
      c.status,
    ],
  };
}

function policyUpsert(
  eventId: string,
  policy: EventPolicy,
  userId: string | null,
  now: number,
): SqlStatementSpec {
  const r = eventPolicyToRow(eventId, policy);
  return {
    sql: 'INSERT INTO event_policies (event_id, reentry_allowed, reentry_limit, refund_policy, refund_cutoff_hours, transfer_allowed, transfer_cutoff_hours, max_transfers_per_ticket, attendee_names_required, max_tickets_per_order, door_sales_enabled, door_sales_methods_json, age_policy, min_age, scan_opens_minutes_before, updated_by_user_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17) ON CONFLICT(event_id) DO UPDATE SET reentry_allowed = excluded.reentry_allowed, reentry_limit = excluded.reentry_limit, refund_policy = excluded.refund_policy, refund_cutoff_hours = excluded.refund_cutoff_hours, transfer_allowed = excluded.transfer_allowed, transfer_cutoff_hours = excluded.transfer_cutoff_hours, max_transfers_per_ticket = excluded.max_transfers_per_ticket, attendee_names_required = excluded.attendee_names_required, max_tickets_per_order = excluded.max_tickets_per_order, door_sales_enabled = excluded.door_sales_enabled, door_sales_methods_json = excluded.door_sales_methods_json, age_policy = excluded.age_policy, min_age = excluded.min_age, scan_opens_minutes_before = excluded.scan_opens_minutes_before, updated_by_user_id = excluded.updated_by_user_id, updated_at = excluded.updated_at',
    params: [
      r.event_id,
      r.reentry_allowed,
      r.reentry_limit,
      r.refund_policy,
      r.refund_cutoff_hours,
      r.transfer_allowed,
      r.transfer_cutoff_hours,
      r.max_transfers_per_ticket,
      r.attendee_names_required,
      r.max_tickets_per_order,
      r.door_sales_enabled,
      r.door_sales_methods_json,
      r.age_policy,
      r.min_age,
      r.scan_opens_minutes_before,
      userId,
      now,
    ],
  };
}

/** Organizer status for publishing: first event → review; later ones publish unless `always_review`. */
export async function publishDecision(
  db: SqlDatabase,
  organizerId: string,
): Promise<'approved' | 'pending_review'> {
  const rows = await allRows<{ approved_at: number | null; always_review: number; approved_events: number }>(
    db,
    {
      sql: "SELECT first_event_approved_at AS approved_at, always_review, (SELECT count(*) FROM events e WHERE e.organizer_id = op.id AND e.status = 'approved' AND e.first_event_review = 1) AS approved_events FROM organizer_profiles op WHERE op.id = ?1",
      params: [organizerId],
    },
  );
  const r = rows[0];
  if (!r || Number(r.always_review) === 1) return 'pending_review';
  return r.approved_at !== null || Number(r.approved_events) > 0 ? 'approved' : 'pending_review';
}

/** For the admin review (lead/Agent A): mark the organizer verified when their first event is approved. */
export async function recordFirstEventApproval(db: SqlDatabase, eventId: string, now: number): Promise<void> {
  await db
    .prepare(
      'UPDATE organizer_profiles SET first_event_approved_at = coalesce(first_event_approved_at, ?2) WHERE id = (SELECT organizer_id FROM events WHERE id = ?1)',
    )
    .bind(eventId, now)
    .run();
}

async function organizerFor(db: SqlDatabase, organizationId: string, now: number): Promise<string> {
  await db
    .prepare(
      "INSERT INTO organizer_profiles (id, organization_id, kind, verification_status, created_at) SELECT ?1, ?2, 'church', 'unverified', ?3 WHERE NOT EXISTS (SELECT 1 FROM organizer_profiles WHERE organization_id = ?2)",
    )
    .bind(newPrefixedId('orgprof'), organizationId, now)
    .run();
  const rows = await allRows<{ id: string }>(db, {
    sql: 'SELECT id FROM organizer_profiles WHERE organization_id = ?1 ORDER BY created_at, id LIMIT 1',
    params: [organizationId],
  });
  return rows[0].id;
}

export async function createOrganizerEvent(
  db: SqlDatabase,
  input: { event: EventInput; actorUserId: string; now: number; forceReview?: boolean },
): Promise<{ eventId: string; slug: string; status: 'approved' | 'pending_review' }> {
  const n = normalizeEventInput(input.event, input.now);
  if (!n.ok) throw new TicketingError('VALIDATION', n.errors[0].message, { fields: n.errors });
  const v = n.value;
  const organizerId = await organizerFor(db, input.event.organizationId, input.now);
  const decision = input.forceReview ? 'pending_review' : await publishDecision(db, organizerId);
  const eventId = newPrefixedId('evt');
  const slug = slugify(v.title);
  const specs: SqlStatementSpec[] = [
    {
      sql: "INSERT INTO events (id, organizer_id, title, slug, category, tagline, description, venue_name, address, city, state, starts_at, ends_at, timezone, admission_type, status, created_at, listing_type, start_date_local, start_time_local, currency, first_event_review, published_by_user_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, 'organizer_submitted', ?18, ?19, 'USD', ?20, ?21)",
      params: [
        eventId,
        organizerId,
        v.title,
        slug,
        v.category,
        v.tagline,
        v.description,
        v.venueName,
        v.address,
        v.city,
        v.state,
        v.startsAt,
        v.endsAt,
        v.timezone,
        v.admissionType,
        decision,
        input.now,
        v.startDateLocal,
        v.startTimeLocal,
        decision === 'pending_review' ? 1 : 0,
        input.actorUserId,
      ],
    },
    {
      sql: "INSERT INTO event_organizations (id, event_id, organization_id, participation_role, is_sponsored_label_required, status, created_at) VALUES (?1, ?2, ?3, 'owner', 0, 'active', ?4)",
      params: [`evtorg_${eventId}_owner`, eventId, input.event.organizationId, input.now],
    },
    policyUpsert(eventId, v.policy, input.actorUserId, input.now),
    ...categoryOrder(v.categories).map((c) => insertCategory(eventId, c)),
  ];
  await runBatch(db, specs);
  return { eventId, slug, status: decision };
}

/** Whether the event already has orders (date and venue then change only through `event-changes`). */
export async function eventHasOrders(db: SqlDatabase, eventId: string): Promise<boolean> {
  const rows = await allRows(db, {
    sql: "SELECT 1 FROM ticket_orders WHERE event_id = ?1 AND status NOT IN ('expired', 'cancelled') LIMIT 1",
    params: [eventId],
  });
  return rows.length > 0;
}

/** Edits an event. The caller has checked `edit_content` (and `manage_ticketing` for categories). */
export async function updateOrganizerEvent(
  db: SqlDatabase,
  input: { eventId: string; event: EventInput; actorUserId: string; now: number },
): Promise<{ eventId: string }> {
  const event = await loadEvent(db, input.eventId);
  if (!event || event.listing_type === 'external_discovery')
    throw new TicketingError('NOT_FOUND', 'Event not found.');
  if (event.cancelled_at !== null)
    throw new TicketingError('CONFLICT', 'This event is cancelled and can no longer be edited.');
  const existing = await loadCategories(db, event.id);
  const n = normalizeEventInput(input.event, Math.min(input.now, Number(event.starts_at) - 1), existing);
  if (!n.ok) throw new TicketingError('VALIDATION', n.errors[0].message, { fields: n.errors });
  const v = n.value;
  const hasOrders = await eventHasOrders(db, event.id);
  if (hasOrders) {
    const moved =
      v.startsAt !== Number(event.starts_at) ||
      v.timezone !== event.timezone ||
      (v.endsAt ?? null) !== (event.ends_at === null ? null : Number(event.ends_at));
    const venueMoved =
      v.venueName !== event.venue_name ||
      (v.address ?? null) !== (event.address ?? null) ||
      v.city !== event.city ||
      v.state !== event.state;
    if (moved || venueMoved)
      throw new TicketingError(
        'CONFLICT',
        'People already have tickets. Change the date or venue from "Event changes" so everyone is told.',
        {
          fields: [
            {
              field: moved ? 'startDate' : 'venueName',
              message: 'Use "Event changes" to move the date or venue: ticket holders will be emailed.',
            },
          ],
        },
      );
    if (v.admissionType !== event.admission_type)
      throw new TicketingError(
        'CONFLICT',
        "Tickets exist, so the event can't switch between free and paid.",
        { fields: [{ field: 'admissionType', message: "Tickets exist, so this can't change." }] },
      );
  }
  const specs: SqlStatementSpec[] = [
    {
      sql: 'UPDATE events SET title = ?2, category = ?3, tagline = ?4, description = ?5, venue_name = ?6, address = ?7, city = ?8, state = ?9, starts_at = ?10, ends_at = ?11, timezone = ?12, admission_type = ?13, start_date_local = ?14, start_time_local = ?15 WHERE id = ?1',
      params: [
        event.id,
        v.title,
        v.category,
        v.tagline,
        v.description,
        v.venueName,
        v.address,
        v.city,
        v.state,
        v.startsAt,
        v.endsAt,
        v.timezone,
        v.admissionType,
        v.startDateLocal,
        v.startTimeLocal,
      ],
    },
    policyUpsert(event.id, v.policy, input.actorUserId, input.now),
  ];
  for (const c of categoryOrder(v.categories)) {
    if (!c.existing) {
      specs.push(insertCategory(event.id, c));
      continue;
    }
    specs.push({
      sql: 'UPDATE ticket_tiers SET name = ?2, price_cents = ?3, capacity = ?4, kind = ?5, description = ?6, per_order_limit = ?7, max_age = ?8, seats_per_ticket = ?9, valid_days_json = ?10, sales_start_at = ?11, sales_end_at = ?12, requires_companion_of = ?13, sort_order = ?14, status = ?15 WHERE id = ?1 AND event_id = ?16',
      params: [
        c.id,
        c.name,
        c.priceCents,
        c.capacity,
        c.kind,
        c.description,
        c.perOrderLimit,
        c.maxAge,
        c.seatsPerTicket,
        c.validDaysJson,
        c.salesStartAt,
        c.salesEndAt,
        c.requiresCompanionOf,
        c.sortOrder,
        c.status,
        event.id,
      ],
    });
  }
  // Categories left out of the form are closed (never deleted: orders reference them).
  for (const old of existing)
    if (!v.categories.some((c) => c.id === old.id))
      specs.push({
        sql: "UPDATE ticket_tiers SET status = 'closed' WHERE id = ?1 AND event_id = ?2",
        params: [old.id, event.id],
      });
  try {
    await runBatch(db, specs);
  } catch (err) {
    if (/TIER_INVALID|CHECK constraint failed/.test(String((err as Error)?.message ?? err)))
      throw new TicketingError(
        'VALIDATION',
        "Some ticket numbers don't fit what is already reserved. Check the capacities and try again.",
      );
    throw err;
  }
  return { eventId: event.id };
}

/** Values to pre-fill the edit form. */
export async function eventEditorValues(db: SqlDatabase, eventId: string) {
  const event = await loadEvent(db, eventId);
  if (!event) return null;
  const categories = await loadCategories(db, eventId);
  const zone = event.timezone;
  const start = utcToZonedLocal(Number(event.starts_at), zone);
  const end = event.ends_at === null ? null : utcToZonedLocal(Number(event.ends_at), zone);
  const toLocal = (s: number | null) => (s === null ? null : utcToZonedLocal(Number(s), zone));
  return {
    event,
    start,
    end,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      description: c.description ?? '',
      price: (Number(c.price_cents) / 100).toFixed(2),
      capacity: String(Math.floor(Number(c.capacity) / Math.max(1, Number(c.seats_per_ticket)))),
      perOrderLimit: c.per_order_limit === null ? '' : String(c.per_order_limit),
      maxAge: c.max_age === null ? '' : String(c.max_age),
      seatsPerTicket: String(c.seats_per_ticket),
      validDays: c.valid_days_json ? (JSON.parse(c.valid_days_json) as string[]).join(', ') : '',
      salesStart: toLocal(c.sales_start_at),
      salesEnd: toLocal(c.sales_end_at),
      companionOf: c.requires_companion_of
        ? String(categories.findIndex((x) => x.id === c.requires_companion_of))
        : '',
      status: c.status,
      reserved: Number(c.reserved_count),
    })),
  };
}

/**
 * Ticket types, price deadlines and inventory for paid events (docs/LIVE_REQUIREMENTS.md §8.1 items 2–3,
 * docs/LIVE_DATA_MODEL.md §8 `ticket_types`, `price_deadlines`, `ticket_inventory`, `occurrence_inventory`).
 *
 * - A type has a name, price (cents), kind, people per ticket (group or family pack), capacity per date, per-order
 *   limit, sales window, status (on sale, hidden, ended) and an optional door allocation, with whether the door may
 *   also sell the online pool. "Sold out" is never stored: `availabilityFor` computes it from inventory.
 * - `syncTicketInventory` keeps one `ticket_inventory` row per type and date and one `occurrence_inventory` row per
 *   date, carrying the current capacities. A capacity below what is already taken fails the inventory `CHECK`, which
 *   `applyInventorySync` turns into `PaidError('invalid', { detail: 'capacity_below_sold' })`.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import { isCents, parseDollarsToCents } from './money.ts';
import { isCheckFailure } from './orders.ts';
import { unitPriceAt, type PriceDeadline } from './pricing.ts';
import {
  ORDER_HOLD_SECONDS,
  PAID_ID_PREFIX,
  PaidError,
  TICKET_TYPE_KINDS,
  TICKET_TYPE_STATUSES,
  type TicketTypeKind,
  type TicketTypeStatus,
} from './paid-types.ts';

export const TICKET_TYPE_NAME_MAX = 60;
export const TICKET_TYPE_DESCRIPTION_MAX = 200;
export const MAX_PRICE_CENTS = 1_000_000;

/** Quick starts offered when adding a type (the organizer sets the price and capacity). */
export const TICKET_TYPE_QUICK_STARTS: ReadonlyArray<{
  kind: TicketTypeKind;
  name: string;
  peoplePerTicket: number;
}> = [
  { kind: 'general', name: 'General admission', peoplePerTicket: 1 },
  { kind: 'vip', name: 'VIP', peoplePerTicket: 1 },
  { kind: 'child', name: 'Child', peoplePerTicket: 1 },
  { kind: 'student', name: 'Student', peoplePerTicket: 1 },
  { kind: 'group', name: 'Family pack (4 people)', peoplePerTicket: 4 },
  { kind: 'day_pass', name: 'Day pass', peoplePerTicket: 1 },
];

export interface TicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  kind: TicketTypeKind;
  priceCents: number;
  peoplePerTicket: number;
  capacity: number | null;
  doorAllocation: number;
  doorUsesOnline: boolean;
  perOrderLimit: number;
  salesStartAt: number | null;
  salesEndAt: number | null;
  status: TicketTypeStatus;
  position: number;
  deadlines: Array<PriceDeadline & { id: string }>;
}

interface TypeRow {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  kind: TicketTypeKind;
  price_cents: number;
  people_per_ticket: number;
  capacity: number | null;
  door_allocation: number;
  door_uses_online: number;
  per_order_limit: number;
  sales_start_at: number | null;
  sales_end_at: number | null;
  status: TicketTypeStatus;
  position: number;
}

const TYPE_COLUMNS =
  'id, event_id, name, description, kind, price_cents, people_per_ticket, capacity, door_allocation, ' +
  'door_uses_online, per_order_limit, sales_start_at, sales_end_at, status, position';

async function assertPaidEvent(db: SqlDatabase, organizationId: string, eventId: string): Promise<void> {
  const [row] = await allRows<{ admission: string }>(db, {
    sql: 'SELECT admission FROM events WHERE id = ?1 AND organization_id = ?2',
    params: [eventId, organizationId],
  });
  if (!row) throw new PaidError('not_found');
  if (row.admission !== 'paid_tickets') throw new PaidError('invalid', { detail: 'admission' });
}

/** Every ticket type of this organization's event, in display order, with its price deadlines. */
export async function listTicketTypes(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
): Promise<TicketType[]> {
  const rows = await allRows<TypeRow>(db, {
    sql: `SELECT ${TYPE_COLUMNS} FROM ticket_types
           WHERE event_id = ?1 AND event_id IN (SELECT id FROM events WHERE organization_id = ?2)
           ORDER BY position, created_at, id`,
    params: [eventId, organizationId],
  });
  return attachDeadlines(db, rows);
}

/** Ticket types of an event for public pages (the caller checks the event is visible). Hidden and ended types too. */
export async function listEventTicketTypes(db: SqlDatabase, eventId: string): Promise<TicketType[]> {
  const rows = await allRows<TypeRow>(db, {
    sql: `SELECT ${TYPE_COLUMNS} FROM ticket_types WHERE event_id = ?1 ORDER BY position, created_at, id`,
    params: [eventId],
  });
  return attachDeadlines(db, rows);
}

async function attachDeadlines(db: SqlDatabase, rows: TypeRow[]): Promise<TicketType[]> {
  if (rows.length === 0) return [];
  const deadlines = await allRows<{
    id: string;
    ticket_type_id: string;
    price_cents: number;
    ends_at: number;
  }>(db, {
    sql: `SELECT d.id, d.ticket_type_id, d.price_cents, d.ends_at FROM price_deadlines d
           WHERE d.ticket_type_id IN (SELECT id FROM ticket_types WHERE event_id = ?1) ORDER BY d.ends_at`,
    params: [rows[0].event_id],
  });
  return rows.map((r) => ({
    id: r.id,
    eventId: r.event_id,
    name: r.name,
    description: r.description,
    kind: r.kind,
    priceCents: r.price_cents,
    peoplePerTicket: r.people_per_ticket,
    capacity: r.capacity,
    doorAllocation: r.door_allocation,
    doorUsesOnline: r.door_uses_online === 1,
    perOrderLimit: r.per_order_limit,
    salesStartAt: r.sales_start_at,
    salesEndAt: r.sales_end_at,
    status: r.status,
    position: r.position,
    deadlines: deadlines
      .filter((d) => d.ticket_type_id === r.id)
      .map((d) => ({ id: d.id, priceCents: d.price_cents, endsAt: d.ends_at })),
  }));
}

/** The price a buyer pays for a type at `now` (price deadlines applied). */
export const priceNow = (t: Pick<TicketType, 'priceCents' | 'deadlines'>, now: number) =>
  unitPriceAt(t.priceCents, t.deadlines, now);

export interface TicketTypeForm {
  name: unknown;
  description?: unknown;
  kind?: unknown;
  /** Dollars as typed. */
  price: unknown;
  peoplePerTicket?: unknown;
  /** Tickets per date; empty = only the event's capacity. */
  capacity?: unknown;
  doorAllocation?: unknown;
  doorUsesOnline?: unknown;
  perOrderLimit?: unknown;
  /** Epoch seconds, already converted from the event's zone by the caller; null = no limit. */
  salesStartAt?: number | null;
  salesEndAt?: number | null;
  status?: unknown;
}

export interface ValidatedTicketType {
  name: string;
  description: string | null;
  kind: TicketTypeKind;
  priceCents: number;
  peoplePerTicket: number;
  capacity: number | null;
  doorAllocation: number;
  doorUsesOnline: boolean;
  perOrderLimit: number;
  salesStartAt: number | null;
  salesEndAt: number | null;
  status: TicketTypeStatus;
}

const checked = (v: unknown) => v === true || v === 'on' || v === 'true' || v === '1' || v === 1;

function intField(v: unknown, fallback: number | null): number | null {
  const text = String(v ?? '').trim();
  if (!text) return fallback;
  return /^\d{1,7}$/.test(text) ? Number(text) : NaN;
}

/** Validates the organizer's ticket type form. Throws `PaidError('invalid', { detail: field })`. */
export function validateTicketTypeForm(form: TicketTypeForm): ValidatedTicketType {
  const name = String(form.name ?? '').trim();
  if (name.length < 1 || name.length > TICKET_TYPE_NAME_MAX)
    throw new PaidError('invalid', { detail: 'name' });
  const description = String(form.description ?? '').trim() || null;
  if (description && description.length > TICKET_TYPE_DESCRIPTION_MAX)
    throw new PaidError('invalid', { detail: 'description' });
  const kind = (String(form.kind ?? '').trim() || 'general') as TicketTypeKind;
  if (!TICKET_TYPE_KINDS.includes(kind)) throw new PaidError('invalid', { detail: 'kind' });
  const priceCents = parseDollarsToCents(form.price);
  if (!isCents(priceCents, 0, MAX_PRICE_CENTS)) throw new PaidError('invalid', { detail: 'price' });
  const peoplePerTicket = intField(form.peoplePerTicket, 1);
  if (
    peoplePerTicket === null ||
    !Number.isInteger(peoplePerTicket) ||
    peoplePerTicket < 1 ||
    peoplePerTicket > 20
  )
    throw new PaidError('invalid', { detail: 'people_per_ticket' });
  const capacity = intField(form.capacity, null);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))
    throw new PaidError('invalid', { detail: 'capacity' });
  const doorAllocation = intField(form.doorAllocation, 0);
  if (doorAllocation === null || !Number.isInteger(doorAllocation) || doorAllocation < 0)
    throw new PaidError('invalid', { detail: 'door_allocation' });
  if (capacity !== null && doorAllocation > capacity)
    throw new PaidError('invalid', { detail: 'door_allocation' });
  const perOrderLimit = intField(form.perOrderLimit, 10);
  if (perOrderLimit === null || !Number.isInteger(perOrderLimit) || perOrderLimit < 1 || perOrderLimit > 50)
    throw new PaidError('invalid', { detail: 'per_order_limit' });
  const salesStartAt = form.salesStartAt ?? null;
  const salesEndAt = form.salesEndAt ?? null;
  for (const [field, v] of [
    ['sales_start_at', salesStartAt],
    ['sales_end_at', salesEndAt],
  ] as const)
    if (v !== null && !Number.isInteger(v)) throw new PaidError('invalid', { detail: field });
  if (salesStartAt !== null && salesEndAt !== null && salesEndAt <= salesStartAt)
    throw new PaidError('invalid', { detail: 'sales_end_at' });
  const status = (String(form.status ?? '').trim() || 'on_sale') as TicketTypeStatus;
  if (!TICKET_TYPE_STATUSES.includes(status)) throw new PaidError('invalid', { detail: 'status' });
  return {
    name,
    description,
    kind,
    priceCents,
    peoplePerTicket,
    capacity,
    doorAllocation,
    doorUsesOnline: form.doorUsesOnline === undefined ? true : checked(form.doorUsesOnline),
    perOrderLimit,
    salesStartAt,
    salesEndAt,
    status,
  };
}

// ── Inventory ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Statements that create the missing inventory rows of an event (every type × every date, and every date) and copy
 * the current capacities and door settings onto the existing ones. Run them in the same batch as the change that
 * needs them (a saved type, a new date, a new event capacity).
 */
export function syncTicketInventory(_db: SqlDatabase, eventId: string): SqlStatementSpec[] {
  return [
    {
      sql: `INSERT INTO ticket_inventory (ticket_type_id, occurrence_id, capacity, door_allocation, door_uses_online)
            SELECT t.id, o.id, t.capacity, t.door_allocation, t.door_uses_online
              FROM ticket_types t JOIN event_occurrences o ON o.event_id = t.event_id
             WHERE t.event_id = ?1
            ON CONFLICT (ticket_type_id, occurrence_id) DO UPDATE SET capacity = excluded.capacity,
              door_allocation = excluded.door_allocation, door_uses_online = excluded.door_uses_online`,
      params: [eventId],
    },
    {
      sql: `INSERT INTO occurrence_inventory (occurrence_id, capacity)
            SELECT o.id, e.capacity FROM event_occurrences o JOIN events e ON e.id = o.event_id WHERE e.id = ?1
            ON CONFLICT (occurrence_id) DO UPDATE SET capacity = excluded.capacity`,
      params: [eventId],
    },
  ];
}

/**
 * Runs `statements` followed by the inventory sync in one batch. A capacity below what is already sold or held makes
 * the batch roll back with `PaidError('invalid', { detail: 'capacity_below_sold' })`.
 */
export async function applyInventorySync(
  db: SqlDatabase,
  eventId: string,
  statements: readonly SqlStatementSpec[] = [],
): Promise<void> {
  try {
    await runBatch(db, [...statements, ...syncTicketInventory(db, eventId)]);
  } catch (error) {
    if (isCheckFailure(error)) throw new PaidError('invalid', { detail: 'capacity_below_sold' });
    throw error;
  }
}

/** Creates or updates a ticket type on this organization's paid event, and its inventory rows, in one batch. */
export async function saveTicketType(
  db: SqlDatabase,
  input: {
    organizationId: string;
    eventId: string;
    ticketTypeId?: string | null;
    form: TicketTypeForm;
    now: number;
  },
): Promise<string> {
  await assertPaidEvent(db, input.organizationId, input.eventId);
  const v = validateTicketTypeForm(input.form);
  const values = [
    v.name,
    v.description,
    v.kind,
    v.priceCents,
    v.peoplePerTicket,
    v.capacity,
    v.doorAllocation,
    v.doorUsesOnline ? 1 : 0,
    v.perOrderLimit,
    v.salesStartAt,
    v.salesEndAt,
    v.status,
    input.now,
  ];
  if (input.ticketTypeId) {
    const [existing] = await allRows(db, {
      sql: 'SELECT 1 AS ok FROM ticket_types WHERE id = ?1 AND event_id = ?2',
      params: [input.ticketTypeId, input.eventId],
    });
    if (!existing) throw new PaidError('not_found');
    await applyInventorySync(db, input.eventId, [
      {
        sql: `UPDATE ticket_types SET name = ?2, description = ?3, kind = ?4, price_cents = ?5, people_per_ticket = ?6,
                capacity = ?7, door_allocation = ?8, door_uses_online = ?9, per_order_limit = ?10, sales_start_at = ?11,
                sales_end_at = ?12, status = ?13, updated_at = ?14
               WHERE id = ?1`,
        params: [input.ticketTypeId, ...values],
      },
    ]);
    return input.ticketTypeId;
  }
  const id = newPrefixedId(PAID_ID_PREFIX.ticketType);
  await applyInventorySync(db, input.eventId, [
    {
      sql: `INSERT INTO ticket_types (id, event_id, name, description, kind, price_cents, people_per_ticket, capacity,
              door_allocation, door_uses_online, per_order_limit, sales_start_at, sales_end_at, status, position,
              created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                    (SELECT COALESCE(MAX(position), -1) + 1 FROM ticket_types WHERE event_id = ?2), ?15, ?15)`,
      params: [id, input.eventId, ...values],
    },
  ]);
  return id;
}

/** Puts a type on sale, hides it (presale with an access code) or ends its sales. */
export async function setTicketTypeStatus(
  db: SqlDatabase,
  input: { organizationId: string; ticketTypeId: string; status: TicketTypeStatus; now: number },
): Promise<void> {
  if (!TICKET_TYPE_STATUSES.includes(input.status)) throw new PaidError('invalid', { detail: 'status' });
  const rows = await allRows(db, {
    sql: `UPDATE ticket_types SET status = ?3, updated_at = ?4
           WHERE id = ?1 AND event_id IN (SELECT id FROM events WHERE organization_id = ?2) RETURNING id`,
    params: [input.ticketTypeId, input.organizationId, input.status, input.now],
  });
  if (rows.length === 0) throw new PaidError('not_found');
}

/** Deletes a type nobody has ordered yet (otherwise end its sales instead). */
export async function deleteTicketType(
  db: SqlDatabase,
  input: { organizationId: string; ticketTypeId: string },
): Promise<void> {
  const [row] = await allRows<{ ordered: number }>(db, {
    sql: `SELECT (SELECT COUNT(*) FROM order_items WHERE ticket_type_id = t.id) AS ordered FROM ticket_types t
           WHERE t.id = ?1 AND t.event_id IN (SELECT id FROM events WHERE organization_id = ?2)`,
    params: [input.ticketTypeId, input.organizationId],
  });
  if (!row) throw new PaidError('not_found');
  if (row.ordered > 0) throw new PaidError('invalid', { detail: 'has_orders' });
  await runBatch(db, [{ sql: 'DELETE FROM ticket_types WHERE id = ?1', params: [input.ticketTypeId] }]);
}

/** Adds an early-bird price that applies until `endsAt` (the first deadline still ahead wins). */
export async function addPriceDeadline(
  db: SqlDatabase,
  input: { organizationId: string; ticketTypeId: string; price: unknown; endsAt: number; now: number },
): Promise<string> {
  const priceCents = parseDollarsToCents(input.price);
  if (!isCents(priceCents, 0, MAX_PRICE_CENTS)) throw new PaidError('invalid', { detail: 'price' });
  if (!Number.isInteger(input.endsAt) || input.endsAt <= input.now)
    throw new PaidError('invalid', { detail: 'ends_at' });
  const [owned] = await allRows(db, {
    sql: `SELECT 1 AS ok FROM ticket_types WHERE id = ?1 AND event_id IN (SELECT id FROM events WHERE organization_id = ?2)`,
    params: [input.ticketTypeId, input.organizationId],
  });
  if (!owned) throw new PaidError('not_found');
  const id = newPrefixedId(PAID_ID_PREFIX.priceDeadline);
  try {
    await runBatch(db, [
      {
        sql: 'INSERT INTO price_deadlines (id, ticket_type_id, price_cents, ends_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
        params: [id, input.ticketTypeId, priceCents, input.endsAt, input.now],
      },
    ]);
  } catch (error) {
    if (/UNIQUE/i.test(String((error as Error)?.message)))
      throw new PaidError('invalid', { detail: 'ends_at' });
    throw error;
  }
  return id;
}

export async function removePriceDeadline(
  db: SqlDatabase,
  input: { organizationId: string; deadlineId: string },
): Promise<void> {
  const rows = await allRows(db, {
    sql: `DELETE FROM price_deadlines WHERE id = ?1 AND ticket_type_id IN (
            SELECT t.id FROM ticket_types t JOIN events e ON e.id = t.event_id WHERE e.organization_id = ?2)
          RETURNING id`,
    params: [input.deadlineId, input.organizationId],
  });
  if (rows.length === 0) throw new PaidError('not_found');
}

// ── Availability (computed, never stored) ──────────────────────────────────────────────────────────────────────

export interface TypeAvailability {
  ticketTypeId: string;
  /** Tickets still available online; null = no limit. */
  online: number | null;
  /** Tickets the door can still sell (door allocation, plus the online pool where allowed); null = no limit. */
  door: number | null;
  soldOut: boolean;
}

const minLimit = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

/**
 * What is left per type for one date, counting the seats of expired holds as free (they are released on the next
 * reservation). A type is sold out when nothing is left online.
 */
export async function availabilityFor(
  db: SqlDatabase,
  eventId: string,
  occurrenceId: string,
  now: number,
): Promise<TypeAvailability[]> {
  const expired =
    "o.occurrence_id = ?2 AND o.status = 'pending' AND ((o.hold_expires_at IS NOT NULL AND o.hold_expires_at <= ?3) " +
    'OR (o.hold_expires_at IS NULL AND o.created_at <= ?4))';
  const params = [eventId, occurrenceId, now, now - ORDER_HOLD_SECONDS];
  const [rows, people] = await Promise.all([
    allRows<{
      id: string;
      people_per_ticket: number;
      capacity: number | null;
      door_allocation: number;
      door_uses_online: number;
      online_taken: number | null;
      door_taken: number | null;
      expired_online: number;
      expired_door: number;
    }>(db, {
      sql: `SELECT t.id, t.people_per_ticket, inv.capacity, COALESCE(inv.door_allocation, t.door_allocation) AS door_allocation,
                   COALESCE(inv.door_uses_online, t.door_uses_online) AS door_uses_online, inv.online_taken, inv.door_taken,
                   COALESCE((SELECT SUM(i.quantity) FROM order_items i JOIN orders o ON o.id = i.order_id
                              WHERE i.ticket_type_id = t.id AND o.channel = 'online' AND ${expired}), 0) AS expired_online,
                   COALESCE((SELECT SUM(i.quantity) FROM order_items i JOIN orders o ON o.id = i.order_id
                              WHERE i.ticket_type_id = t.id AND o.channel = 'door' AND ${expired}), 0) AS expired_door
              FROM ticket_types t
              LEFT JOIN ticket_inventory inv ON inv.ticket_type_id = t.id AND inv.occurrence_id = ?2
             WHERE t.event_id = ?1 ORDER BY t.position, t.created_at, t.id`,
      params,
    }),
    allRows<{ capacity: number | null; people_taken: number; expired_people: number }>(db, {
      sql: `SELECT oi.capacity, oi.people_taken,
                   COALESCE((SELECT SUM(i.quantity * i.people_per_ticket) FROM order_items i JOIN orders o ON o.id = i.order_id
                              WHERE ${expired}), 0) AS expired_people
              FROM occurrence_inventory oi WHERE oi.occurrence_id = ?2 AND ?1 = ?1`,
      params,
    }),
  ]);
  const occ = people[0];
  const peopleLeft =
    occ && occ.capacity !== null ? occ.capacity - (occ.people_taken - occ.expired_people) : null;
  return rows.map((r) => {
    if (r.online_taken === null || !occ)
      // No inventory row for this date: nothing can be sold until it exists.
      return { ticketTypeId: r.id, online: 0, door: 0, soldOut: true };
    const online = r.online_taken - r.expired_online;
    const door = (r.door_taken ?? 0) - r.expired_door;
    const byPeople = peopleLeft === null ? null : Math.max(0, Math.floor(peopleLeft / r.people_per_ticket));
    const onlineLeft =
      r.capacity === null ? null : Math.max(0, r.capacity - online - Math.max(r.door_allocation, door));
    const doorLeft =
      r.door_uses_online === 1
        ? r.capacity === null
          ? null
          : Math.max(0, Math.max(r.door_allocation, r.capacity - online) - door)
        : Math.max(0, r.door_allocation - door);
    const onlineFinal = minLimit(onlineLeft, byPeople);
    return {
      ticketTypeId: r.id,
      online: onlineFinal,
      door: minLimit(doorLeft, byPeople),
      soldOut: onlineFinal !== null && onlineFinal <= 0,
    };
  });
}

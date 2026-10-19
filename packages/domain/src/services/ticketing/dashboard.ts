/**
 * Organizer event dashboard (read side): sales by category and section, orders, attendance, the scan
 * log with filters, refunds (read-only; refund actions belong to the refunds flow) and offline
 * conflict review, plus CSV exports. Money stays in integer minor units until it is formatted.
 *
 * Personal data: purchaser emails are masked unless the viewer may see settlement details (owner or
 * an explicit grant, `view_settlement`) — the caller passes `unmask`. Scan rows show the holder's
 * first name + last initial only.
 */
import { allRows, runBatch, type SqlDatabase, type SqlParam } from '../../security/sql-database.ts';
import { FULFILLED_ORDER_STATUSES, SCAN_RESULTS, type ScanResult } from '../../types/enums.ts';
import { eventHeadcount, type Headcount } from './scanning.ts';
import {
  firstRow,
  formatMinorUnits,
  formatVenueTime,
  holderInitials,
  loadScanEvent,
  maskEmail,
  venueDayKey,
} from './scanning-context.ts';

const FULFILLED = FULFILLED_ORDER_STATUSES.map((s) => `'${s}'`).join(', ');

export interface SalesRow {
  id: string;
  name: string;
  capacity: number;
  /** Units held (unpaid holds, not yet sold). */
  held: number;
  sold: number;
  remaining: number;
  grossCents: number;
  currency: string;
}

export interface SalesSummary {
  categories: SalesRow[];
  sections: Array<SalesRow & { code: string; categoryName: string }>;
  totals: {
    orders: number;
    tickets: number;
    grossCents: number;
    refundedCents: number;
    netCents: number;
    currency: string;
  };
}

export async function salesSummary(db: SqlDatabase, eventId: string): Promise<SalesSummary> {
  const categories = await allRows<{
    id: string;
    name: string;
    capacity: number;
    reserved_count: number;
    sold_count: number;
    currency: string;
    gross: number | null;
  }>(db, {
    sql: `SELECT c.id, c.name, c.capacity, c.reserved_count, c.sold_count, c.currency, (SELECT sum(oi.unit_price_cents * (oi.quantity - oi.refunded_quantity)) FROM order_items oi JOIN ticket_orders o ON o.id = oi.order_id WHERE oi.tier_id = c.id AND o.status IN (${FULFILLED})) AS gross FROM ticket_tiers c WHERE c.event_id = ?1 ORDER BY c.sort_order, c.name`,
    params: [eventId],
  });
  const sections = await allRows<{
    id: string;
    code: string;
    name: string;
    category_name: string;
    capacity: number;
    reserved_count: number;
    sold_count: number;
    currency: string;
    gross: number | null;
  }>(db, {
    sql: `SELECT s.id, s.code, s.name, c.name AS category_name, s.capacity, s.reserved_count, s.sold_count, c.currency, (SELECT sum(oi.unit_price_cents * (oi.quantity - oi.refunded_quantity)) FROM order_items oi JOIN ticket_orders o ON o.id = oi.order_id WHERE oi.section_id = s.id AND o.status IN (${FULFILLED})) AS gross FROM venue_sections s JOIN ticket_tiers c ON c.id = s.tier_id WHERE s.event_id = ?1 ORDER BY s.sort_order, s.code`,
    params: [eventId],
  });
  const totals = await firstRow<{
    orders: number;
    tickets: number;
    gross: number | null;
    refunded: number | null;
    currency: string | null;
  }>(
    db,
    `SELECT count(*) AS orders, coalesce(sum(quantity), 0) AS tickets, sum(total_cents) AS gross, sum(amount_refunded_cents) AS refunded, max(currency) AS currency FROM ticket_orders WHERE event_id = ?1 AND status IN (${FULFILLED})`,
    [eventId],
  );
  const row = (r: {
    id: string;
    name: string;
    capacity: number;
    reserved_count: number;
    sold_count: number;
    currency: string;
    gross: number | null;
  }): SalesRow => ({
    id: r.id,
    name: r.name,
    capacity: Number(r.capacity),
    held: Math.max(0, Number(r.reserved_count) - Number(r.sold_count)),
    sold: Number(r.sold_count),
    remaining: Math.max(0, Number(r.capacity) - Number(r.reserved_count)),
    grossCents: Number(r.gross ?? 0),
    currency: r.currency,
  });
  const gross = Number(totals?.gross ?? 0);
  const refunded = Number(totals?.refunded ?? 0);
  return {
    categories: categories.map(row),
    sections: sections.map((s) => ({ ...row(s), code: s.code, categoryName: s.category_name })),
    totals: {
      orders: Number(totals?.orders ?? 0),
      tickets: Number(totals?.tickets ?? 0),
      grossCents: gross,
      refundedCents: refunded,
      netCents: gross - refunded,
      currency: totals?.currency ?? categories[0]?.currency ?? 'usd',
    },
  };
}

export interface OrderRow {
  id: string;
  reference: string;
  status: string;
  source: string;
  quantity: number;
  totalCents: number;
  refundedCents: number;
  currency: string;
  totalText: string;
  purchaserName: string;
  purchaserEmail: string;
  createdAt: number;
}

export async function listOrders(
  db: SqlDatabase,
  eventId: string,
  options: { unmask: boolean; limit?: number; offset?: number; refundsOnly?: boolean },
): Promise<{ orders: OrderRow[]; total: number }> {
  const where = options.refundsOnly
    ? "event_id = ?1 AND (amount_refunded_cents > 0 OR status IN ('refunded', 'partially_refunded'))"
    : 'event_id = ?1';
  const limit = Math.min(Math.max(1, options.limit ?? 50), 200);
  const rows = await allRows<{
    id: string;
    order_reference: string | null;
    order_number: string;
    status: string;
    source: string;
    quantity: number;
    total_cents: number;
    amount_refunded_cents: number;
    currency: string;
    purchaser_name: string;
    purchaser_email: string;
    created_at: number;
  }>(db, {
    sql: `SELECT id, order_reference, order_number, status, source, quantity, total_cents, amount_refunded_cents, currency, purchaser_name, purchaser_email, created_at FROM ticket_orders WHERE ${where} ORDER BY created_at DESC, id LIMIT ?2 OFFSET ?3`,
    params: [eventId, limit, Math.max(0, options.offset ?? 0)],
  });
  const total = await firstRow<{ n: number }>(db, `SELECT count(*) AS n FROM ticket_orders WHERE ${where}`, [
    eventId,
  ]);
  return {
    total: Number(total?.n ?? 0),
    orders: rows.map((r) => ({
      id: r.id,
      reference: r.order_reference ?? r.order_number,
      status: r.status,
      source: r.source,
      quantity: Number(r.quantity),
      totalCents: Number(r.total_cents),
      refundedCents: Number(r.amount_refunded_cents),
      currency: r.currency,
      totalText: Number(r.total_cents) === 0 ? 'Free' : formatMinorUnits(Number(r.total_cents), r.currency),
      purchaserName: options.unmask ? r.purchaser_name : holderInitials(r.purchaser_name),
      purchaserEmail: options.unmask ? r.purchaser_email : maskEmail(r.purchaser_email),
      createdAt: Number(r.created_at),
    })),
  };
}

export interface AttendanceSummary {
  headcount: Headcount;
  timeZone: string;
  days: Array<{ dayKey: string; admitted: number; entries: number; exits: number }>;
  /** Entries and exits per local hour for the chosen day. */
  hours: Array<{ hour: string; entries: number; exits: number }>;
  dayKey: string;
}

export async function attendanceSummary(
  db: SqlDatabase,
  eventId: string,
  now: number,
  day?: string,
): Promise<AttendanceSummary> {
  const event = await loadScanEvent(db, eventId);
  if (!event) throw new Error('NOT_FOUND: event');
  const headcount = await eventHeadcount(db, eventId, now);
  const days = await allRows<{ day_key: string; admitted: number; entries: number; exits: number }>(db, {
    sql: 'SELECT p.day_key, sum(CASE WHEN p.entry_count > 0 THEN 1 ELSE 0 END) AS admitted, sum(p.entry_count) AS entries, sum(p.exit_count) AS exits FROM ticket_presence p WHERE p.event_id = ?1 GROUP BY p.day_key ORDER BY p.day_key',
    params: [eventId],
  });
  const dayKey =
    day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : (days.at(-1)?.day_key ?? venueDayKey(now, event.timeZone));
  const scans = await allRows<{
    received_at: number;
    device_scanned_at: number | null;
    offline: number;
    direction: string;
  }>(db, {
    sql: "SELECT received_at, device_scanned_at, offline, direction FROM ticket_scan_events WHERE event_id = ?1 AND day_key = ?2 AND result IN ('admitted', 'override_admitted', 'exited')",
    params: [eventId, dayKey],
  });
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: event.timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const buckets = new Map<number, { entries: number; exits: number }>();
  for (const s of scans) {
    const at =
      Number(s.offline) === 1 && s.device_scanned_at ? Number(s.device_scanned_at) : Number(s.received_at);
    const hour = Number(fmt.format(new Date(at * 1000))) % 24;
    const b = buckets.get(hour) ?? { entries: 0, exits: 0 };
    if (s.direction === 'out') b.exits++;
    else b.entries++;
    buckets.set(hour, b);
  }
  const hours = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([h, v]) => ({ hour: `${String(h).padStart(2, '0')}:00`, ...v }));
  return {
    headcount,
    timeZone: event.timeZone,
    dayKey,
    hours,
    days: days.map((d) => ({
      dayKey: d.day_key,
      admitted: Number(d.admitted),
      entries: Number(d.entries),
      exits: Number(d.exits),
    })),
  };
}

export interface ScanLogFilters {
  result?: string | null;
  gate?: string | null;
  deviceId?: string | null;
  conflictsOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface ScanLogRow {
  id: string;
  at: number;
  atText: string;
  direction: string;
  result: ScanResult;
  gate: string | null;
  device: string | null;
  deviceId: string | null;
  holder: string | null;
  category: string | null;
  offline: boolean;
  conflict: string;
  overrideReason: string | null;
  reviewed: boolean;
}

export async function scanLog(
  db: SqlDatabase,
  eventId: string,
  filters: ScanLogFilters = {},
): Promise<{
  rows: ScanLogRow[];
  total: number;
  gates: string[];
  devices: Array<{ id: string; label: string }>;
}> {
  const event = await loadScanEvent(db, eventId);
  if (!event) throw new Error('NOT_FOUND: event');
  const clauses = ['e.event_id = ?1'];
  const params: SqlParam[] = [eventId];
  if (filters.result && (SCAN_RESULTS as readonly string[]).includes(filters.result)) {
    params.push(filters.result);
    clauses.push(`e.result = ?${params.length}`);
  }
  if (filters.gate) {
    params.push(filters.gate.slice(0, 80));
    clauses.push(`e.gate = ?${params.length}`);
  }
  if (filters.deviceId) {
    params.push(filters.deviceId.slice(0, 64));
    clauses.push(`e.scanner_device_id = ?${params.length}`);
  }
  if (filters.conflictsOnly) clauses.push("e.conflict != 'none'");
  const where = clauses.join(' AND ');
  const limit = Math.min(Math.max(1, filters.limit ?? 100), 1000);
  const rows = await allRows<{
    id: string;
    received_at: number;
    device_scanned_at: number | null;
    offline: number;
    direction: string;
    result: ScanResult;
    gate: string | null;
    device_label: string | null;
    session_label: string | null;
    scanner_device_id: string | null;
    holder_name: string | null;
    category_name: string | null;
    conflict: string;
    override_reason: string | null;
    reviewed: number;
  }>(db, {
    sql: `SELECT e.id, e.received_at, e.device_scanned_at, e.offline, e.direction, e.result, e.gate, d.device_label, s.label AS session_label, e.scanner_device_id, t.holder_name, c.name AS category_name, e.conflict, e.override_reason, (e.reviewed_at IS NOT NULL) AS reviewed FROM ticket_scan_events e LEFT JOIN scanner_devices d ON d.id = e.scanner_device_id LEFT JOIN scanner_sessions s ON s.id = e.scanner_session_id LEFT JOIN tickets t ON t.id = e.ticket_id LEFT JOIN ticket_tiers c ON c.id = t.tier_id WHERE ${where} ORDER BY e.received_at DESC, e.id DESC LIMIT ${limit} OFFSET ${Math.max(0, filters.offset ?? 0)}`,
    params,
  });
  const total = await firstRow<{ n: number }>(
    db,
    `SELECT count(*) AS n FROM ticket_scan_events e WHERE ${where}`,
    params,
  );
  const gates = await allRows<{ gate: string }>(db, {
    sql: 'SELECT DISTINCT gate FROM ticket_scan_events WHERE event_id = ?1 AND gate IS NOT NULL ORDER BY gate LIMIT 100',
    params: [eventId],
  });
  const devices = await allRows<{ id: string; label: string }>(db, {
    sql: "SELECT d.id, coalesce(d.device_label, s.label || ' · ' || substr(d.id, 6, 6)) AS label FROM scanner_devices d JOIN scanner_sessions s ON s.id = d.scanner_session_id WHERE s.event_id = ?1 ORDER BY d.created_at LIMIT 200",
    params: [eventId],
  });
  return {
    total: Number(total?.n ?? 0),
    gates: gates.map((g) => g.gate),
    devices,
    rows: rows.map((r) => {
      const at =
        Number(r.offline) === 1 && r.device_scanned_at ? Number(r.device_scanned_at) : Number(r.received_at);
      return {
        id: r.id,
        at,
        atText: formatVenueTime(at, event.timeZone, true),
        direction: r.direction,
        result: r.result,
        gate: r.gate,
        device:
          r.device_label ??
          (r.scanner_device_id
            ? `${r.session_label ?? 'Scanner'} · ${r.scanner_device_id.slice(5, 11)}`
            : 'Organizer account'),
        deviceId: r.scanner_device_id,
        holder: r.holder_name ? holderInitials(r.holder_name) : null,
        category: r.category_name,
        offline: Number(r.offline) === 1,
        conflict: r.conflict,
        overrideReason: r.override_reason,
        reviewed: Number(r.reviewed) === 1,
      };
    }),
  };
}

/** Marks an offline conflict as reviewed (`reviewed_at` / `reviewed_by_user_id`, migration 0016; idempotent). */
export async function markConflictReviewed(
  db: SqlDatabase,
  input: { eventId: string; scanEventId: string; userId: string; note?: string | null; now: number },
): Promise<boolean> {
  const [rows] = await runBatch(db, [
    {
      sql: "UPDATE ticket_scan_events SET reviewed_at = ?1, reviewed_by_user_id = ?2 WHERE id = ?3 AND event_id = ?4 AND conflict != 'none' AND reviewed_at IS NULL RETURNING id",
      params: [input.now, input.userId, input.scanEventId, input.eventId],
    },
  ]);
  return rows.length === 1;
}

// ---------------------------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------------------------

/** RFC 4180 CSV; cells that a spreadsheet would run as a formula are prefixed with `'`. */
export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Attendance per ticket and day. Emails only when `unmask` (owner/admin). */
export async function attendanceCsv(db: SqlDatabase, eventId: string, unmask: boolean): Promise<string> {
  const event = await loadScanEvent(db, eventId);
  if (!event) throw new Error('NOT_FOUND: event');
  const rows = await allRows<{
    ticket_id: string;
    holder_name: string;
    holder_email: string;
    category_name: string | null;
    section_name: string | null;
    status: string;
    day_key: string | null;
    entry_count: number | null;
    exit_count: number | null;
    first_entry_at: number | null;
    last_gate: string | null;
    order_reference: string | null;
  }>(db, {
    sql: 'SELECT t.id AS ticket_id, t.holder_name, t.holder_email, c.name AS category_name, s.name AS section_name, t.status, p.day_key, p.entry_count, p.exit_count, p.first_entry_at, p.last_gate, o.order_reference FROM tickets t JOIN ticket_orders o ON o.id = t.order_id LEFT JOIN ticket_tiers c ON c.id = t.tier_id LEFT JOIN venue_sections s ON s.id = t.section_id LEFT JOIN ticket_presence p ON p.ticket_id = t.id WHERE t.event_id = ?1 ORDER BY t.holder_name, t.id, p.day_key LIMIT 50000',
    params: [eventId],
  });
  const header = [
    'ticket',
    'order',
    'holder',
    ...(unmask ? ['email'] : []),
    'category',
    'section',
    'status',
    'day',
    'entries',
    'exits',
    'first_entry',
    'last_gate',
  ];
  return toCsv(
    header,
    rows.map((r) => [
      r.ticket_id,
      r.order_reference,
      unmask ? r.holder_name : holderInitials(r.holder_name),
      ...(unmask ? [r.holder_email] : []),
      r.category_name,
      r.section_name,
      r.status,
      r.day_key,
      r.entry_count ?? 0,
      r.exit_count ?? 0,
      r.first_entry_at ? formatVenueTime(Number(r.first_entry_at), event.timeZone, true) : null,
      r.last_gate,
    ]),
  );
}

export async function scanLogCsv(
  db: SqlDatabase,
  eventId: string,
  filters: ScanLogFilters = {},
): Promise<string> {
  const { rows } = await scanLog(db, eventId, { ...filters, limit: 1000 });
  return toCsv(
    [
      'scan',
      'time',
      'direction',
      'result',
      'gate',
      'device',
      'holder',
      'category',
      'offline',
      'conflict',
      'reviewed',
      'override_reason',
    ],
    rows.map((r) => [
      r.id,
      r.atText,
      r.direction,
      r.result,
      r.gate,
      r.device,
      r.holder,
      r.category,
      r.offline ? 'yes' : 'no',
      r.conflict,
      r.reviewed ? 'yes' : 'no',
      r.overrideReason,
    ]),
  );
}

/** Events the dashboard lists for a user: organizer-org owner/admin, or an active team grant. */
export async function organizerEvents(
  db: SqlDatabase,
  input: { userId: string; organizationIds: string[]; limit?: number },
) {
  const orgs = input.organizationIds.slice(0, 50);
  const orgClause = orgs.length
    ? `op.organization_id IN (${orgs.map((_, i) => `?${i + 2}`).join(', ')})`
    : '0';
  return allRows<{
    id: string;
    title: string;
    starts_at: number;
    timezone: string;
    status: string;
    admission_type: string;
  }>(db, {
    sql: `SELECT e.id, e.title, e.starts_at, e.timezone, e.status, e.admission_type FROM events e JOIN organizer_profiles op ON op.id = e.organizer_id WHERE e.listing_type != 'external_discovery' AND e.external_only = 0 AND (${orgClause} OR EXISTS (SELECT 1 FROM event_team_members m WHERE m.event_id = e.id AND m.user_id = ?1 AND m.status = 'active' AND (m.can_manage_ticketing = 1 OR m.can_scan_tickets = 1))) ORDER BY e.starts_at DESC LIMIT ${Math.min(input.limit ?? 50, 200)}`,
    params: [input.userId, ...orgs],
  });
}

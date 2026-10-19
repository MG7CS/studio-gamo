/**
 * What a rendered ticket shows (design T-06): event, date/time in the venue zone with abbreviation,
 * venue, gate, section, category badge, holder name, order reference, the signed QR payload, and the
 * terms line. Built from the database; the QR is re-signed from (id, version, salt) on every render,
 * so a transferred or reissued ticket can never render its old code.
 */
import { signTicketQr, isQrKeyId } from '../../security/ticket-qr.ts';
import { allRows, type SqlDatabase } from '../../security/sql-database.ts';
import { formatEventDate, formatEventTime } from './events-time.ts';
import {
  TICKET_COLUMNS,
  TicketingError,
  ticketQrKeyring,
  type TicketRow,
  type TicketingEnv,
} from './orders-shared.ts';

export const TICKET_TERMS_LINE = 'Personal ticket · no resale · first scan admits';

export interface TicketRenderModel {
  ticketId: string;
  version: number;
  status: string;
  /** `GL1.…` payload; null when the ticket is not valid (no code is ever shown for a dead ticket). */
  qrPayload: string | null;
  eventId: string;
  eventTitle: string;
  dateLine: string;
  timeLine: string;
  venueName: string;
  venueAddress: string;
  gateLabel: string | null;
  sectionName: string | null;
  categoryName: string;
  /** e.g. "VIP", "Child · ages up to 12", "Table of 8", "Accessible". */
  categoryBadge: string | null;
  holderName: string;
  orderId: string;
  orderReference: string;
  /** e.g. "Ages 18+ · ID may be checked". */
  ageNote: string | null;
  /** Multi-day passes: "Valid Mar 20, Mar 21". */
  validDays: string | null;
  startsAt: number;
  endsAt: number | null;
  timezone: string;
}

const KIND_BADGE: Record<string, string> = {
  vip: 'VIP',
  child: 'Child',
  companion: 'Companion',
  accessible: 'Accessible',
  group: 'Group',
  table: 'Table',
  day_pass: 'Day pass',
  multi_day: 'Multi-day pass',
};

export function categoryBadge(c: {
  kind: string;
  max_age: number | null;
  seats_per_ticket: number;
}): string | null {
  const base = KIND_BADGE[c.kind] ?? null;
  if ((c.kind === 'group' || c.kind === 'table') && c.seats_per_ticket > 1)
    return `${c.kind === 'table' ? 'Table' : 'Group'} of ${c.seats_per_ticket}`;
  if (c.kind === 'child' && c.max_age !== null) return `Child · ages up to ${c.max_age}`;
  return base;
}

function formatValidDays(json: string | null, zone: string): string | null {
  if (!json) return null;
  try {
    const days = JSON.parse(json) as unknown;
    if (!Array.isArray(days) || days.length === 0) return null;
    const label = days
      .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .map((d) =>
        new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(
          new Date(`${d}T12:00:00Z`),
        ),
      )
      .join(', ');
    void zone;
    return label ? `Valid ${label}` : null;
  } catch {
    return null;
  }
}

interface JoinedRow extends TicketRow {
  e_title: string;
  e_starts_at: number;
  e_ends_at: number | null;
  e_timezone: string;
  e_venue_name: string;
  e_address: string | null;
  e_city: string;
  e_state: string;
  o_reference: string | null;
  o_number: string;
  o_policy: string | null;
  c_name: string | null;
  c_kind: string | null;
  c_max_age: number | null;
  c_seats: number | null;
  c_valid_days: string | null;
  s_name: string | null;
}

/** Loads render models for the given tickets (any status; `qrPayload` only for valid tickets). */
export async function loadTicketRenderModels(
  db: SqlDatabase,
  env: TicketingEnv,
  where: { orderId: string } | { ticketIds: string[] },
): Promise<TicketRenderModel[]> {
  const cols = TICKET_COLUMNS.split(', ')
    .map((c) => `t.${c}`)
    .join(', ');
  const base = `SELECT ${cols}, e.title AS e_title, e.starts_at AS e_starts_at, e.ends_at AS e_ends_at, e.timezone AS e_timezone, e.venue_name AS e_venue_name, e.address AS e_address, e.city AS e_city, e.state AS e_state, o.order_reference AS o_reference, o.order_number AS o_number, o.policy_snapshot_json AS o_policy, c.name AS c_name, c.kind AS c_kind, c.max_age AS c_max_age, c.seats_per_ticket AS c_seats, c.valid_days_json AS c_valid_days, s.name AS s_name FROM tickets t JOIN events e ON e.id = t.event_id JOIN ticket_orders o ON o.id = t.order_id LEFT JOIN ticket_tiers c ON c.id = t.tier_id LEFT JOIN venue_sections s ON s.id = t.section_id`;
  let rows: JoinedRow[];
  if ('orderId' in where) {
    rows = await allRows<JoinedRow>(db, {
      sql: `${base} WHERE t.order_id = ?1 ORDER BY t.order_item_id, t.seq, t.id`,
      params: [where.orderId],
    });
  } else {
    if (where.ticketIds.length === 0) return [];
    const ids = where.ticketIds.slice(0, 200);
    rows = await allRows<JoinedRow>(db, {
      sql: `${base} WHERE t.id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')}) ORDER BY t.order_item_id, t.seq, t.id`,
      params: ids,
    });
  }
  const needsKey = rows.some((r) => r.status === 'valid' && r.order_item_id);
  const keyring = needsKey ? ticketQrKeyring(env) : {};
  const models: TicketRenderModel[] = [];
  for (const r of rows) {
    let qrPayload: string | null = null;
    if (r.status === 'valid' && r.order_item_id && r.qr_salt && isQrKeyId(r.qr_key_id)) {
      const signed = await signTicketQr(
        { ticketId: r.id, version: Number(r.version), eventId: r.event_id, salt: r.qr_salt },
        keyring,
        r.qr_key_id,
      );
      if (!signed.ok) throw new TicketingError('UNAVAILABLE', 'Tickets are temporarily unavailable.');
      qrPayload = signed.payload;
    } else if (r.status === 'valid' && !r.order_item_id && r.registration_id) {
      // Legacy free RSVP (pre-0013): its gamt_ token stays scannable through the legacy path.
      qrPayload = r.qr_token;
    }
    let ageNote: string | null = null;
    try {
      const p = JSON.parse(r.o_policy ?? 'null') as { agePolicy?: string; minAge?: number } | null;
      if (p?.agePolicy === 'min_age' && p.minAge) ageNote = `Ages ${p.minAge}+ · ID may be checked`;
    } catch {
      ageNote = null;
    }
    const zone = r.e_timezone || 'UTC';
    models.push({
      ticketId: r.id,
      version: Number(r.version),
      status: r.status,
      qrPayload,
      eventId: r.event_id,
      eventTitle: r.e_title,
      dateLine: formatEventDate(Number(r.e_starts_at), zone),
      timeLine: formatEventTime(Number(r.e_starts_at), zone),
      venueName: r.e_venue_name,
      venueAddress: [r.e_address, r.e_city, r.e_state].filter(Boolean).join(', '),
      gateLabel: r.gate_label,
      sectionName: r.s_name,
      categoryName: r.c_name ?? 'General admission',
      categoryBadge:
        r.c_kind !== null
          ? categoryBadge({ kind: r.c_kind, max_age: r.c_max_age, seats_per_ticket: Number(r.c_seats ?? 1) })
          : null,
      holderName: r.holder_name,
      orderId: r.order_id,
      orderReference: r.o_reference ?? r.o_number,
      ageNote,
      validDays: formatValidDays(r.c_valid_days, zone),
      startsAt: Number(r.e_starts_at),
      endsAt: r.e_ends_at === null ? null : Number(r.e_ends_at),
      timezone: zone,
    });
  }
  return models;
}

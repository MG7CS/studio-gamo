/**
 * Promo codes and presale access codes for paid events (docs/LIVE_REQUIREMENTS.md §8.1 item 3, docs/LIVE_DATA_MODEL.md
 * §8 `event_codes`).
 *
 * - A promo code takes a percent or an amount off, optionally only on some ticket types, between optional dates, with
 *   an optional use limit. An access code unlocks `hidden` ticket types (presale) and is required to buy them.
 * - One code per order. Its use is taken in the reservation batch (`CHECK (uses <= max_uses)` makes it atomic) and
 *   given back when an unpaid order expires or is canceled (orders.ts).
 * - Codes are stored upper case; what a buyer types is normalized the same way.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { isCents, parseDollarsToCents } from './money.ts';
import {
  ORDER_HOLD_SECONDS,
  PAID_ID_PREFIX,
  PaidError,
  type CodeKind,
  type DiscountInput,
  type DiscountKind,
} from './paid-types.ts';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

/** What a person typed, as stored: trimmed, upper case, inner spaces removed. Null when empty. */
export function normalizeCode(raw: unknown): string | null {
  const text = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  return text ? text : null;
}

export interface EventCode {
  id: string;
  eventId: string;
  code: string;
  kind: CodeKind;
  discountKind: DiscountKind | null;
  percentOff: number | null;
  amountOffCents: number | null;
  /** Ticket types the code applies to (promo) or unlocks (access); null = all (promo only). */
  ticketTypeIds: string[] | null;
  maxUses: number | null;
  uses: number;
  startsAt: number | null;
  endsAt: number | null;
  status: 'active' | 'disabled';
}

interface CodeRow {
  id: string;
  event_id: string;
  code: string;
  kind: CodeKind;
  discount_kind: DiscountKind | null;
  percent_off: number | null;
  amount_off_cents: number | null;
  ticket_type_ids: string | null;
  max_uses: number | null;
  uses: number;
  starts_at: number | null;
  ends_at: number | null;
  status: 'active' | 'disabled';
}

const CODE_COLUMNS =
  'id, event_id, code, kind, discount_kind, percent_off, amount_off_cents, ticket_type_ids, max_uses, uses, ' +
  'starts_at, ends_at, status';

function parseTypeIds(json: string | null): string[] | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : null;
  } catch {
    return null;
  }
}

function toCode(r: CodeRow): EventCode {
  return {
    id: r.id,
    eventId: r.event_id,
    code: r.code,
    kind: r.kind,
    discountKind: r.discount_kind,
    percentOff: r.percent_off,
    amountOffCents: r.amount_off_cents,
    ticketTypeIds: parseTypeIds(r.ticket_type_ids),
    maxUses: r.max_uses,
    uses: r.uses,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
  };
}

/** The discount a promo code gives (null for access codes). */
export function discountOf(code: EventCode | null): DiscountInput | null {
  if (!code || code.kind !== 'promo' || !code.discountKind) return null;
  return {
    kind: code.discountKind,
    percentOff: code.percentOff,
    amountOffCents: code.amountOffCents,
    ticketTypeIds: code.ticketTypeIds,
  };
}

/** True when the access code unlocks this (hidden) ticket type. */
export function codeUnlocks(code: EventCode | null, ticketTypeId: string): boolean {
  return code?.kind === 'access' && (code.ticketTypeIds ?? []).includes(ticketTypeId);
}

/**
 * Finds a code a buyer typed for an event and checks it can be used now. Throws `code_invalid` (unknown, disabled,
 * outside its dates) or `code_used_up`.
 */
export async function findUsableCode(
  db: SqlDatabase,
  eventId: string,
  raw: unknown,
  now: number,
): Promise<EventCode | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  // Uses held by expired, not yet released orders do not count: the reservation batch gives them back first.
  const [row] = await allRows<CodeRow & { stale_uses: number }>(db, {
    sql: `SELECT ${CODE_COLUMNS},
                 (SELECT COUNT(*) FROM orders o WHERE o.code_id = event_codes.id AND o.status = 'pending'
                   AND ((o.hold_expires_at IS NOT NULL AND o.hold_expires_at <= ?3)
                        OR (o.hold_expires_at IS NULL AND o.created_at <= ?4))) AS stale_uses
            FROM event_codes WHERE event_id = ?1 AND code = ?2`,
    params: [eventId, code, now, now - ORDER_HOLD_SECONDS],
  });
  if (!row || row.status !== 'active') throw new PaidError('code_invalid', { detail: 'code' });
  if ((row.starts_at != null && now < row.starts_at) || (row.ends_at != null && now >= row.ends_at))
    throw new PaidError('code_invalid', { detail: 'code' });
  if (row.max_uses != null && row.uses - row.stale_uses >= row.max_uses)
    throw new PaidError('code_used_up', { detail: 'code' });
  return toCode(row);
}

export interface CodeFormInput {
  code: unknown;
  kind: unknown;
  discountKind?: unknown;
  /** Whole percent, 1–100. */
  percentOff?: unknown;
  /** Dollars as typed. */
  amountOff?: unknown;
  ticketTypeIds?: readonly unknown[] | null;
  maxUses?: unknown;
  startsAt?: number | null;
  endsAt?: number | null;
}

export interface ValidatedCode {
  code: string;
  kind: CodeKind;
  discountKind: DiscountKind | null;
  percentOff: number | null;
  amountOffCents: number | null;
  ticketTypeIds: string[] | null;
  maxUses: number | null;
  startsAt: number | null;
  endsAt: number | null;
}

const optionalInt = (v: unknown): number | null => {
  const text = String(v ?? '').trim();
  if (!text) return null;
  return /^\d{1,7}$/.test(text) ? Number(text) : NaN;
};

/** Validates the organizer's code form. Throws `PaidError('invalid', { detail: field })`. */
export function validateCodeForm(input: CodeFormInput, eventTypeIds: readonly string[]): ValidatedCode {
  const code = normalizeCode(input.code);
  if (!code || !CODE_PATTERN.test(code)) throw new PaidError('invalid', { detail: 'code' });
  const kind = String(input.kind ?? '') as CodeKind;
  if (kind !== 'promo' && kind !== 'access') throw new PaidError('invalid', { detail: 'kind' });
  const typeIds = (input.ticketTypeIds ?? []).map((v) => String(v)).filter(Boolean);
  if (typeIds.some((id) => !eventTypeIds.includes(id)))
    throw new PaidError('invalid', { detail: 'ticket_type_ids' });
  const uniqueTypes = [...new Set(typeIds)];
  const maxUses = optionalInt(input.maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1))
    throw new PaidError('invalid', { detail: 'max_uses' });
  const startsAt = input.startsAt ?? null;
  const endsAt = input.endsAt ?? null;
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt)
    throw new PaidError('invalid', { detail: 'ends_at' });

  if (kind === 'access') {
    if (uniqueTypes.length === 0) throw new PaidError('invalid', { detail: 'ticket_type_ids' });
    return {
      code,
      kind,
      discountKind: null,
      percentOff: null,
      amountOffCents: null,
      ticketTypeIds: uniqueTypes,
      maxUses,
      startsAt,
      endsAt,
    };
  }
  const discountKind = String(input.discountKind ?? '') as DiscountKind;
  let percentOff: number | null = null;
  let amountOffCents: number | null = null;
  if (discountKind === 'percent') {
    percentOff = optionalInt(input.percentOff);
    if (percentOff === null || !Number.isInteger(percentOff) || percentOff < 1 || percentOff > 100)
      throw new PaidError('invalid', { detail: 'percent_off' });
  } else if (discountKind === 'amount') {
    amountOffCents = parseDollarsToCents(input.amountOff);
    if (!isCents(amountOffCents, 1, 1_000_000)) throw new PaidError('invalid', { detail: 'amount_off' });
  } else throw new PaidError('invalid', { detail: 'discount_kind' });
  return {
    code,
    kind,
    discountKind,
    percentOff,
    amountOffCents,
    ticketTypeIds: uniqueTypes.length ? uniqueTypes : null,
    maxUses,
    startsAt,
    endsAt,
  };
}

async function eventTypeIdsFor(db: SqlDatabase, organizationId: string, eventId: string): Promise<string[]> {
  const rows = await allRows<{ type_id: string | null }>(db, {
    sql: `SELECT t.id AS type_id FROM events e LEFT JOIN ticket_types t ON t.event_id = e.id
           WHERE e.id = ?1 AND e.organization_id = ?2 AND e.admission = 'paid_tickets'`,
    params: [eventId, organizationId],
  });
  if (rows.length === 0) throw new PaidError('not_found');
  return rows.map((r) => r.type_id).filter((v): v is string => v !== null);
}

/** Creates a code on this organization's paid event. A code already used on the event → `invalid` / `code_taken`. */
export async function createEventCode(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; form: CodeFormInput; now: number },
): Promise<EventCode> {
  const typeIds = await eventTypeIdsFor(db, input.organizationId, input.eventId);
  const v = validateCodeForm(input.form, typeIds);
  const id = newPrefixedId(PAID_ID_PREFIX.code);
  try {
    await runBatch(db, [
      {
        sql: `INSERT INTO event_codes (id, event_id, code, kind, discount_kind, percent_off, amount_off_cents,
                ticket_type_ids, max_uses, starts_at, ends_at, created_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
        params: [
          id,
          input.eventId,
          v.code,
          v.kind,
          v.discountKind,
          v.percentOff,
          v.amountOffCents,
          v.ticketTypeIds ? JSON.stringify(v.ticketTypeIds) : null,
          v.maxUses,
          v.startsAt,
          v.endsAt,
          input.now,
        ],
      },
    ]);
  } catch (error) {
    if (/UNIQUE/i.test(String((error as Error)?.message)))
      throw new PaidError('invalid', { detail: 'code_taken' });
    throw error;
  }
  return { ...v, id, eventId: input.eventId, uses: 0, status: 'active' };
}

/** Turns a code off or back on. Orders that already used it keep their price. */
export async function setEventCodeStatus(
  db: SqlDatabase,
  input: { organizationId: string; codeId: string; status: 'active' | 'disabled' },
): Promise<void> {
  if (input.status !== 'active' && input.status !== 'disabled')
    throw new PaidError('invalid', { detail: 'status' });
  const rows = await allRows(db, {
    sql: `UPDATE event_codes SET status = ?3
           WHERE id = ?1 AND event_id IN (SELECT id FROM events WHERE organization_id = ?2) RETURNING id`,
    params: [input.codeId, input.organizationId, input.status],
  });
  if (rows.length === 0) throw new PaidError('not_found');
}

/** Every code of this organization's event, newest first. */
export async function listEventCodes(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
): Promise<EventCode[]> {
  const rows = await allRows<CodeRow>(db, {
    sql: `SELECT ${CODE_COLUMNS} FROM event_codes
           WHERE event_id = ?1 AND event_id IN (SELECT id FROM events WHERE organization_id = ?2)
           ORDER BY created_at DESC, code`,
    params: [eventId, organizationId],
  });
  return rows.map(toCode);
}

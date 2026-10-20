/**
 * Cash drawers at the door (docs/LIVE_REQUIREMENTS.md §8.3 items 24–25, docs/LIVE_PAYMENTS.md §7).
 *
 * Each selling staff link (or signed-in organizer) opens one cash session per date with a starting float. Every cash
 * sale and cash refund is a `cash_movements` row; expected = float + sales − refunds. Closing stores the expected and
 * counted amounts (the difference is shown); a closed session never changes. A movement written into a session that is
 * not open makes its whole batch fail (a CHECK on the amount), so a sale can never land in a closed drawer.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import {
  CURRENCY,
  PAID_ID_PREFIX,
  PaidError,
  type CashMovementKind,
  type CashSessionStatus,
} from './paid-types.ts';
import { requirePermission, requireScope, type StaffActor } from './staff-links.ts';

/** The largest float accepted ($10,000), to catch a typo in dollars-vs-cents. */
export const MAX_FLOAT_CENTS = 1_000_000;
export const CLOSE_NOTE_MAX = 500;
export const CASH_REASON_MAX = 200;

export interface DoorOccurrence {
  occurrenceId: string;
  eventId: string;
  organizationId: string;
  startsAt: number;
  occurrenceStatus: string;
  eventStatus: string;
  admission: string;
}

/** The date with its event and organization, or null. */
export async function loadDoorOccurrence(
  db: SqlDatabase,
  occurrenceId: string,
): Promise<DoorOccurrence | null> {
  const [r] = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.event_id, o.starts_at, o.status AS occurrence_status, e.organization_id, e.status AS event_status,
                 e.admission
            FROM event_occurrences o JOIN events e ON e.id = o.event_id
           WHERE o.id = ?1`,
    params: [occurrenceId],
  });
  if (!r || r.organization_id == null) return null;
  return {
    occurrenceId: String(r.id),
    eventId: String(r.event_id),
    organizationId: String(r.organization_id),
    startsAt: Number(r.starts_at),
    occurrenceStatus: String(r.occurrence_status),
    eventStatus: String(r.event_status),
    admission: String(r.admission),
  };
}

export interface CashSession {
  id: string;
  eventId: string;
  occurrenceId: string;
  staffLinkId: string | null;
  organizerId: string | null;
  /** The staff link's label or the organizer's name. */
  openedBy: string | null;
  floatCents: number;
  currency: string;
  status: CashSessionStatus;
  salesCents: number;
  refundsCents: number;
  saleCount: number;
  refundCount: number;
  /** Float + sales − refunds (stored at close; computed while open). */
  expectedCents: number;
  countedCents: number | null;
  /** Counted − expected, once closed. */
  differenceCents: number | null;
  closeNote: string | null;
  openedAt: number;
  closedAt: number | null;
}

const SESSION_SELECT = `
  SELECT s.id, s.event_id, s.occurrence_id, s.staff_link_id, s.organizer_id, s.float_cents, s.currency, s.status,
         s.expected_cents, s.counted_cents, s.close_note, s.opened_at, s.closed_at,
         COALESCE(l.label, g.display_name) AS opened_by,
         COALESCE((SELECT SUM(amount_cents) FROM cash_movements m WHERE m.cash_session_id = s.id AND m.kind = 'sale'), 0) AS sales,
         COALESCE((SELECT SUM(amount_cents) FROM cash_movements m WHERE m.cash_session_id = s.id AND m.kind = 'refund'), 0) AS refunds,
         (SELECT COUNT(*) FROM cash_movements m WHERE m.cash_session_id = s.id AND m.kind = 'sale') AS sale_count,
         (SELECT COUNT(*) FROM cash_movements m WHERE m.cash_session_id = s.id AND m.kind = 'refund') AS refund_count
    FROM cash_sessions s
    LEFT JOIN staff_links l ON l.id = s.staff_link_id
    LEFT JOIN organizers g ON g.id = s.organizer_id`;

function sessionOf(r: Record<string, unknown>): CashSession {
  const sales = Number(r.sales);
  const refunds = Number(r.refunds);
  const closed = r.status === 'closed';
  const expected = closed ? Number(r.expected_cents) : Number(r.float_cents) + sales - refunds;
  const counted = r.counted_cents == null ? null : Number(r.counted_cents);
  return {
    id: String(r.id),
    eventId: String(r.event_id),
    occurrenceId: String(r.occurrence_id),
    staffLinkId: (r.staff_link_id as string | null) ?? null,
    organizerId: (r.organizer_id as string | null) ?? null,
    openedBy: (r.opened_by as string | null) ?? null,
    floatCents: Number(r.float_cents),
    currency: String(r.currency),
    status: closed ? 'closed' : 'open',
    salesCents: sales,
    refundsCents: refunds,
    saleCount: Number(r.sale_count),
    refundCount: Number(r.refund_count),
    expectedCents: expected,
    countedCents: counted,
    differenceCents: closed && counted !== null ? counted - expected : null,
    closeNote: (r.close_note as string | null) ?? null,
    openedAt: Number(r.opened_at),
    closedAt: r.closed_at == null ? null : Number(r.closed_at),
  };
}

function actorColumns(actor: StaffActor): { staffLinkId: string | null; organizerId: string | null } {
  return actor.kind === 'staff'
    ? { staffLinkId: actor.staffLinkId, organizerId: null }
    : { staffLinkId: null, organizerId: actor.organizerId };
}

/** Opens a drawer for this actor on this date. One open drawer per actor per date (`already_done` otherwise). */
export async function openCashSession(
  db: SqlDatabase,
  input: { occurrenceId: string; actor: StaffActor; floatCents: number; now: number },
): Promise<CashSession> {
  requirePermission(input.actor, 'sell');
  if (!Number.isInteger(input.floatCents) || input.floatCents < 0 || input.floatCents > MAX_FLOAT_CENTS)
    throw new PaidError('invalid', { detail: 'float' });
  const occ = await loadDoorOccurrence(db, input.occurrenceId);
  if (!occ) throw new PaidError('not_found');
  requireScope(input.actor, { organizationId: occ.organizationId, scopeId: occ.eventId });
  const id = newPrefixedId(PAID_ID_PREFIX.cashSession);
  const who = actorColumns(input.actor);
  try {
    await runBatch(db, [
      {
        sql: `INSERT INTO cash_sessions (id, event_id, occurrence_id, staff_link_id, organizer_id, float_cents, currency, status, opened_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8)`,
        params: [
          id,
          occ.eventId,
          occ.occurrenceId,
          who.staffLinkId,
          who.organizerId,
          input.floatCents,
          CURRENCY,
          input.now,
        ],
      },
    ]);
  } catch (error) {
    if (/UNIQUE/i.test(String((error as Error)?.message)))
      throw new PaidError('already_done', { detail: 'open_session' });
    throw error;
  }
  const session = await getCashSession(db, id);
  if (!session) throw new PaidError('not_found');
  return session;
}

export async function getCashSession(db: SqlDatabase, sessionId: string): Promise<CashSession | null> {
  const [r] = await allRows<Record<string, unknown>>(db, {
    sql: `${SESSION_SELECT} WHERE s.id = ?1`,
    params: [sessionId],
  });
  return r ? sessionOf(r) : null;
}

/** The actor's open drawer on this date, or null. */
export async function findOpenCashSession(
  db: SqlDatabase,
  input: { occurrenceId: string; actor: StaffActor },
): Promise<CashSession | null> {
  const who = actorColumns(input.actor);
  const [r] = await allRows<Record<string, unknown>>(db, {
    sql:
      who.staffLinkId !== null
        ? `${SESSION_SELECT} WHERE s.occurrence_id = ?1 AND s.staff_link_id = ?2 AND s.status = 'open'`
        : `${SESSION_SELECT} WHERE s.occurrence_id = ?1 AND s.organizer_id = ?2 AND s.status = 'open'`,
    params: [input.occurrenceId, who.staffLinkId ?? who.organizerId],
  });
  return r ? sessionOf(r) : null;
}

/** Float, sales, refunds and expected for one drawer (`not_found` when it does not exist). */
export async function cashSessionSummary(db: SqlDatabase, sessionId: string): Promise<CashSession> {
  const session = await getCashSession(db, sessionId);
  if (!session) throw new PaidError('not_found');
  return session;
}

/** True when this actor may act on this drawer: its own, or any drawer of the organization for an organizer. */
export function mayUseCashSession(actor: StaffActor, session: CashSession, organizationId: string): boolean {
  if (actor.organizationId !== organizationId) return false;
  if (actor.kind === 'organizer') return true;
  return session.staffLinkId === actor.staffLinkId;
}

async function sessionOrganization(db: SqlDatabase, sessionId: string): Promise<string | null> {
  const [r] = await allRows<{ organization_id: string }>(db, {
    sql: 'SELECT e.organization_id FROM cash_sessions s JOIN events e ON e.id = s.event_id WHERE s.id = ?1',
    params: [sessionId],
  });
  return r?.organization_id ?? null;
}

/**
 * Closes a drawer with the counted amount. Expected is computed in the same statement from the movements, so a sale
 * racing the close is either counted or refused. A staff link closes only its own drawer; an organizer any of theirs.
 */
export async function closeCashSession(
  db: SqlDatabase,
  input: { sessionId: string; actor: StaffActor; countedCents: number; note?: string | null; now: number },
): Promise<CashSession> {
  if (
    !Number.isInteger(input.countedCents) ||
    input.countedCents < 0 ||
    input.countedCents > 100 * MAX_FLOAT_CENTS
  )
    throw new PaidError('invalid', { detail: 'counted' });
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
  if (note !== null && note.length > CLOSE_NOTE_MAX) throw new PaidError('invalid', { detail: 'note' });
  const session = await getCashSession(db, input.sessionId);
  const organizationId = session ? await sessionOrganization(db, input.sessionId) : null;
  if (!session || !organizationId || !mayUseCashSession(input.actor, session, organizationId))
    throw new PaidError('not_found');
  if (session.status !== 'open') throw new PaidError('session_closed');
  const [rows] = await runBatch(db, [
    {
      sql: `UPDATE cash_sessions
               SET status = 'closed',
                   expected_cents = float_cents
                     + COALESCE((SELECT SUM(CASE kind WHEN 'sale' THEN amount_cents ELSE -amount_cents END)
                                   FROM cash_movements WHERE cash_session_id = cash_sessions.id), 0),
                   counted_cents = ?2, close_note = ?3, closed_at = ?4
             WHERE id = ?1 AND status = 'open'
         RETURNING id`,
      params: [input.sessionId, input.countedCents, note, input.now],
    },
  ]);
  if (rows.length === 0) throw new PaidError('session_closed');
  return cashSessionSummary(db, input.sessionId);
}

export interface CashMovementInput {
  sessionId: string;
  kind: CashMovementKind;
  orderId: string | null;
  refundId?: string | null;
  amountCents: number;
  receivedCents?: number | null;
  changeCents?: number | null;
  reason?: string | null;
  now: number;
}

/**
 * The statement that records one cash movement, for a caller's batch. When the session is not open, the amount
 * becomes −1 and the table's CHECK fails, so the whole batch (the sale or refund with it) rolls back.
 */
export function cashMovementStatement(input: CashMovementInput): SqlStatementSpec {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0)
    throw new PaidError('invalid', { detail: 'amount' });
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null;
  if (input.kind === 'refund' && reason === null) throw new PaidError('invalid', { detail: 'reason' });
  if (reason !== null && reason.length > CASH_REASON_MAX)
    throw new PaidError('invalid', { detail: 'reason' });
  return {
    sql: `INSERT INTO cash_movements (id, cash_session_id, kind, order_id, refund_id, amount_cents, received_cents, change_cents, reason, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5,
                  CASE WHEN EXISTS (SELECT 1 FROM cash_sessions WHERE id = ?2 AND status = 'open') THEN ?6 ELSE -1 END,
                  ?7, ?8, ?9, ?10)`,
    params: [
      newPrefixedId(PAID_ID_PREFIX.cashMovement),
      input.sessionId,
      input.kind,
      input.orderId,
      input.refundId ?? null,
      input.amountCents,
      input.receivedCents ?? null,
      input.changeCents ?? null,
      reason,
      input.now,
    ],
  };
}

export interface CashMovementRow {
  id: string;
  kind: CashMovementKind;
  orderId: string | null;
  orderReference: string | null;
  refundId: string | null;
  amountCents: number;
  receivedCents: number | null;
  changeCents: number | null;
  reason: string | null;
  createdAt: number;
}

/** A drawer's movements, oldest first. */
export async function listCashMovements(db: SqlDatabase, sessionId: string): Promise<CashMovementRow[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT m.id, m.kind, m.order_id, o.reference, m.refund_id, m.amount_cents, m.received_cents, m.change_cents,
                 m.reason, m.created_at
            FROM cash_movements m LEFT JOIN orders o ON o.id = m.order_id
           WHERE m.cash_session_id = ?1
           ORDER BY m.created_at, m.id`,
    params: [sessionId],
  });
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.kind === 'refund' ? 'refund' : 'sale',
    orderId: (r.order_id as string | null) ?? null,
    orderReference: (r.reference as string | null) ?? null,
    refundId: (r.refund_id as string | null) ?? null,
    amountCents: Number(r.amount_cents),
    receivedCents: r.received_cents == null ? null : Number(r.received_cents),
    changeCents: r.change_cents == null ? null : Number(r.change_cents),
    reason: (r.reason as string | null) ?? null,
    createdAt: Number(r.created_at),
  }));
}

/** Every drawer of one event (the organizer's Door tab), newest first. */
export async function listCashSessions(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
): Promise<CashSession[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `${SESSION_SELECT}
           WHERE s.event_id = ?2 AND EXISTS (SELECT 1 FROM events e WHERE e.id = s.event_id AND e.organization_id = ?1)
           ORDER BY s.opened_at DESC, s.id`,
    params: [organizationId, eventId],
  });
  return rows.map(sessionOf);
}

/**
 * A paid event's policies and settings (docs/LIVE_REQUIREMENTS.md §8.1 items 4–5, docs/LIVE_DATA_MODEL.md §8
 * `event_ticketing`): refunds, transfers, re-entry, entry notes, attendee names, gifts, the fee choice (pass on or
 * absorb), door sales and the per-order maximum. Each order copies the policies (`PolicySnapshot`); a later change
 * applies to an existing order only when it is better for the buyer (`isBetterForBuyer`, `effectivePolicy`).
 */
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { giftPresetsFromForm, parseGiftPresets } from './gifts.ts';
import {
  FEE_PAYERS,
  PaidError,
  REFUND_HOURS,
  REFUND_POLICIES,
  type FeePayer,
  type PolicySnapshot,
  type RefundHours,
  type RefundPolicy,
} from './paid-types.ts';

export const ENTRY_NOTES_MAX = 280;
export const TRANSFER_CUTOFF_MAX_HOURS = 168;
export const MAX_TICKETS_PER_ORDER_LIMIT = 50;

export interface EventTicketing {
  eventId: string;
  currency: 'usd';
  feePayer: FeePayer;
  refundPolicy: RefundPolicy;
  refundHours: RefundHours | null;
  transfersAllowed: boolean;
  transferCutoffHours: number;
  reentryAllowed: boolean;
  entryNotes: string | null;
  namesRequired: boolean;
  giftsEnabled: boolean;
  /** Gift presets in cents (defaults when none chosen). */
  giftPresets: number[];
  doorSalesEnabled: boolean;
  maxTicketsPerOrder: number;
}

interface TicketingRow {
  event_id: string;
  fee_payer: FeePayer;
  refund_policy: RefundPolicy;
  refund_hours: number | null;
  transfers_allowed: number;
  transfer_cutoff_hours: number;
  reentry_allowed: number;
  entry_notes: string | null;
  names_required: number;
  gifts_enabled: number;
  gift_presets: string | null;
  door_sales_enabled: number;
  max_tickets_per_order: number;
}

export const TICKETING_COLUMNS =
  'event_id, fee_payer, refund_policy, refund_hours, transfers_allowed, transfer_cutoff_hours, reentry_allowed, ' +
  'entry_notes, names_required, gifts_enabled, gift_presets, door_sales_enabled, max_tickets_per_order';

export function eventTicketingFromRow(r: TicketingRow): EventTicketing {
  return {
    eventId: r.event_id,
    currency: 'usd',
    feePayer: r.fee_payer,
    refundPolicy: r.refund_policy,
    refundHours: (r.refund_hours as RefundHours | null) ?? null,
    transfersAllowed: r.transfers_allowed === 1,
    transferCutoffHours: r.transfer_cutoff_hours,
    reentryAllowed: r.reentry_allowed === 1,
    entryNotes: r.entry_notes,
    namesRequired: r.names_required === 1,
    giftsEnabled: r.gifts_enabled === 1,
    giftPresets: parseGiftPresets(r.gift_presets),
    doorSalesEnabled: r.door_sales_enabled === 1,
    maxTicketsPerOrder: r.max_tickets_per_order,
  };
}

/** The event's paid settings, or null when it has none yet. */
export async function readEventTicketing(db: SqlDatabase, eventId: string): Promise<EventTicketing | null> {
  const [row] = await allRows<TicketingRow>(db, {
    sql: `SELECT ${TICKETING_COLUMNS} FROM event_ticketing WHERE event_id = ?1`,
    params: [eventId],
  });
  return row ? eventTicketingFromRow(row) : null;
}

/** The policies copied onto an order. */
export function policySnapshotOf(t: EventTicketing): PolicySnapshot {
  return {
    v: 1,
    refundPolicy: t.refundPolicy,
    refundHours: t.refundPolicy === 'until_hours_before' ? t.refundHours : null,
    transfersAllowed: t.transfersAllowed,
    transferCutoffHours: t.transferCutoffHours,
    reentryAllowed: t.reentryAllowed,
    entryNotes: t.entryNotes,
    namesRequired: t.namesRequired,
  };
}

/** Reads `orders.policy_snapshot`; null when it is not a v1 snapshot. */
export function parsePolicySnapshot(json: unknown): PolicySnapshot | null {
  if (typeof json !== 'string') return null;
  try {
    const p = JSON.parse(json) as Partial<PolicySnapshot>;
    if (p?.v !== 1 || !REFUND_POLICIES.includes(p.refundPolicy as RefundPolicy)) return null;
    return p as PolicySnapshot;
  } catch {
    return null;
  }
}

export interface EventTicketingForm {
  feePayer: unknown;
  refundPolicy: unknown;
  refundHours?: unknown;
  transfersAllowed?: unknown;
  transferCutoffHours?: unknown;
  reentryAllowed?: unknown;
  entryNotes?: unknown;
  namesRequired?: unknown;
  giftsEnabled?: unknown;
  /** Dollars, comma separated; empty = the defaults. */
  giftPresets?: unknown;
  doorSalesEnabled?: unknown;
  maxTicketsPerOrder?: unknown;
}

export interface ValidatedEventTicketing {
  feePayer: FeePayer;
  refundPolicy: RefundPolicy;
  refundHours: RefundHours | null;
  transfersAllowed: boolean;
  transferCutoffHours: number;
  reentryAllowed: boolean;
  entryNotes: string | null;
  namesRequired: boolean;
  giftsEnabled: boolean;
  /** JSON cents, or null for the defaults. */
  giftPresetsJson: string | null;
  doorSalesEnabled: boolean;
  maxTicketsPerOrder: number;
}

const checked = (v: unknown) => v === true || v === 'on' || v === 'true' || v === '1' || v === 1;

function intField(v: unknown, fallback: number): number {
  const text = String(v ?? '').trim();
  if (!text) return fallback;
  return /^\d{1,4}$/.test(text) ? Number(text) : NaN;
}

/** Validates the editor's paid-settings section. Throws `PaidError('invalid', { detail: field })`. */
export function validateEventTicketing(form: EventTicketingForm): ValidatedEventTicketing {
  const feePayer = String(form.feePayer ?? '') as FeePayer;
  if (!FEE_PAYERS.includes(feePayer)) throw new PaidError('invalid', { detail: 'fee_payer' });
  const refundPolicy = String(form.refundPolicy ?? '') as RefundPolicy;
  if (!REFUND_POLICIES.includes(refundPolicy)) throw new PaidError('invalid', { detail: 'refund_policy' });
  let refundHours: RefundHours | null = null;
  if (refundPolicy === 'until_hours_before') {
    const h = intField(form.refundHours, NaN);
    if (!REFUND_HOURS.includes(h as RefundHours)) throw new PaidError('invalid', { detail: 'refund_hours' });
    refundHours = h as RefundHours;
  }
  const transfersAllowed = checked(form.transfersAllowed);
  const transferCutoffHours = transfersAllowed ? intField(form.transferCutoffHours, 0) : 0;
  if (
    !Number.isInteger(transferCutoffHours) ||
    transferCutoffHours < 0 ||
    transferCutoffHours > TRANSFER_CUTOFF_MAX_HOURS
  )
    throw new PaidError('invalid', { detail: 'transfer_cutoff_hours' });
  const notes = String(form.entryNotes ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (notes.length > ENTRY_NOTES_MAX) throw new PaidError('invalid', { detail: 'entry_notes' });
  const giftsEnabled = checked(form.giftsEnabled);
  const presetsText = String(form.giftPresets ?? '').trim();
  const giftPresetsJson = giftsEnabled && presetsText ? giftPresetsFromForm(presetsText) : null;
  const maxTicketsPerOrder = intField(form.maxTicketsPerOrder, 10);
  if (
    !Number.isInteger(maxTicketsPerOrder) ||
    maxTicketsPerOrder < 1 ||
    maxTicketsPerOrder > MAX_TICKETS_PER_ORDER_LIMIT
  )
    throw new PaidError('invalid', { detail: 'max_tickets_per_order' });
  return {
    feePayer,
    refundPolicy,
    refundHours,
    transfersAllowed,
    transferCutoffHours,
    reentryAllowed: checked(form.reentryAllowed),
    entryNotes: notes || null,
    namesRequired: checked(form.namesRequired),
    giftsEnabled,
    giftPresetsJson,
    doorSalesEnabled: checked(form.doorSalesEnabled),
    maxTicketsPerOrder,
  };
}

/** The upsert for an event's paid settings (for the editor's save batch). */
export function eventTicketingUpsert(eventId: string, v: ValidatedEventTicketing, now: number) {
  return {
    sql: `INSERT INTO event_ticketing (event_id, fee_payer, refund_policy, refund_hours, transfers_allowed,
            transfer_cutoff_hours, reentry_allowed, entry_notes, names_required, gifts_enabled, gift_presets,
            door_sales_enabled, max_tickets_per_order, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
          ON CONFLICT (event_id) DO UPDATE SET fee_payer = excluded.fee_payer, refund_policy = excluded.refund_policy,
            refund_hours = excluded.refund_hours, transfers_allowed = excluded.transfers_allowed,
            transfer_cutoff_hours = excluded.transfer_cutoff_hours, reentry_allowed = excluded.reentry_allowed,
            entry_notes = excluded.entry_notes, names_required = excluded.names_required,
            gifts_enabled = excluded.gifts_enabled, gift_presets = excluded.gift_presets,
            door_sales_enabled = excluded.door_sales_enabled, max_tickets_per_order = excluded.max_tickets_per_order,
            updated_at = excluded.updated_at`,
    params: [
      eventId,
      v.feePayer,
      v.refundPolicy,
      v.refundHours,
      v.transfersAllowed ? 1 : 0,
      v.transferCutoffHours,
      v.reentryAllowed ? 1 : 0,
      v.entryNotes,
      v.namesRequired ? 1 : 0,
      v.giftsEnabled ? 1 : 0,
      v.giftPresetsJson,
      v.doorSalesEnabled ? 1 : 0,
      v.maxTicketsPerOrder,
      now,
    ],
  };
}

/** Saves the paid settings of this organization's paid event. Orders already placed keep their snapshot. */
export async function saveEventTicketing(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; form: EventTicketingForm; now: number },
): Promise<EventTicketing> {
  const v = validateEventTicketing(input.form);
  const [event] = await allRows<{ admission: string }>(db, {
    sql: 'SELECT admission FROM events WHERE id = ?1 AND organization_id = ?2',
    params: [input.eventId, input.organizationId],
  });
  if (!event) throw new PaidError('not_found');
  if (event.admission !== 'paid_tickets') throw new PaidError('invalid', { detail: 'admission' });
  await runBatch(db, [eventTicketingUpsert(input.eventId, v, input.now)]);
  const saved = await readEventTicketing(db, input.eventId);
  if (!saved) throw new PaidError('not_found');
  return saved;
}

// ── Better for the buyer ───────────────────────────────────────────────────────────────────────────────────────

/** How late a refund may be asked for, in hours before the start (larger = better); none = −∞. */
function refundReach(p: Pick<PolicySnapshot, 'refundPolicy' | 'refundHours'>): number {
  if (p.refundPolicy === 'until_start') return 0;
  if (p.refundPolicy === 'until_hours_before') return -(p.refundHours ?? 168);
  return Number.NEGATIVE_INFINITY;
}

/** How late a transfer may be made, in hours before the start (larger = better); not allowed = −∞. */
function transferReach(p: Pick<PolicySnapshot, 'transfersAllowed' | 'transferCutoffHours'>): number {
  return p.transfersAllowed ? -p.transferCutoffHours : Number.NEGATIVE_INFINITY;
}

/**
 * True when `next` is at least as good for a buyer as `old` on refunds, transfers and re-entry, and better on at
 * least one. Entry notes and the names rule do not count (they inform, they do not take anything away).
 */
export function isBetterForBuyer(old: PolicySnapshot, next: PolicySnapshot): boolean {
  const dims: Array<[number, number]> = [
    [refundReach(old), refundReach(next)],
    [transferReach(old), transferReach(next)],
    [old.reentryAllowed ? 1 : 0, next.reentryAllowed ? 1 : 0],
  ];
  return dims.every(([a, b]) => b >= a) && dims.some(([a, b]) => b > a);
}

/**
 * The policy that applies to an existing order: for each of refunds, transfers and re-entry, the better of the
 * order's snapshot and the event's current policy. Entry notes and names follow the current policy.
 */
export function effectivePolicy(snapshot: PolicySnapshot, current: PolicySnapshot): PolicySnapshot {
  const refund = refundReach(current) > refundReach(snapshot) ? current : snapshot;
  const transfer = transferReach(current) > transferReach(snapshot) ? current : snapshot;
  return {
    v: 1,
    refundPolicy: refund.refundPolicy,
    refundHours: refund.refundHours,
    transfersAllowed: transfer.transfersAllowed,
    transferCutoffHours: transfer.transferCutoffHours,
    reentryAllowed: snapshot.reentryAllowed || current.reentryAllowed,
    entryNotes: current.entryNotes,
    namesRequired: snapshot.namesRequired,
  };
}

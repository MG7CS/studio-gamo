/**
 * Event policies (design §5.4): platform defaults and the bounds an event creator may choose within.
 * `normalizeEventPolicy` validates organizer input and returns either a complete policy or errors
 * that say what to change. The same bounds are CHECK constraints on `event_policies` (0013).
 */
import {
  AGE_POLICIES,
  DOOR_SALES_METHODS,
  REFUND_POLICIES,
  isOneOf,
  type AgePolicy,
  type DoorSalesMethod,
  type RefundPolicy,
} from './enums.ts';

export interface EventPolicy {
  reentryAllowed: boolean;
  /** Re-entries allowed after the first entry, per day; null = unlimited. Always null when re-entry is off. */
  reentryLimit: number | null;
  refundPolicy: RefundPolicy;
  /** Derived from `refundPolicy`: hours before start when refunds close; null = no automatic window. */
  refundCutoffHours: number | null;
  transferAllowed: boolean;
  /** Transfers close this many hours before the start. */
  transferCutoffHours: number;
  /** Per ticket; 0 when transfers are off. */
  maxTransfersPerTicket: number;
  attendeeNamesRequired: boolean;
  maxTicketsPerOrder: number;
  doorSalesEnabled: boolean;
  doorSalesMethods: DoorSalesMethod[];
  agePolicy: AgePolicy;
  /** Set only when `agePolicy` is `min_age`. */
  minAge: number | null;
  scanOpensMinutesBefore: number;
}

/** Hold duration is a platform constant (30 minutes), not an event policy. */
export const HOLD_DURATION_SECONDS = 30 * 60;
/** Stripe Checkout sessions last at least 30 minutes; a paid hold also survives this grace after session expiry. */
export const CHECKOUT_EXPIRY_GRACE_SECONDS = 5 * 60;

export const EVENT_POLICY_DEFAULTS: Readonly<EventPolicy> = Object.freeze({
  reentryAllowed: true,
  reentryLimit: null,
  refundPolicy: 'until_48h',
  refundCutoffHours: 48,
  transferAllowed: true,
  transferCutoffHours: 0,
  maxTransfersPerTicket: 3,
  attendeeNamesRequired: false,
  maxTicketsPerOrder: 10,
  doorSalesEnabled: false,
  doorSalesMethods: [],
  agePolicy: 'all_ages',
  minAge: null,
  scanOpensMinutesBefore: 120,
});

export const EVENT_POLICY_BOUNDS = Object.freeze({
  reentryLimit: { min: 1, max: 20 },
  transferCutoffHours: { min: 0, max: 168 },
  maxTransfersPerTicket: { min: 0, max: 3 },
  maxTicketsPerOrder: { min: 1, max: 20 },
  minAge: { min: 1, max: 21 },
  scanOpensMinutesBefore: { min: 0, max: 720 },
} as const);

/** Hours before the start when refunds close, per refund policy (null = none / organizer decides). */
export const REFUND_CUTOFF_HOURS: Readonly<Record<RefundPolicy, number | null>> = Object.freeze({
  none: null,
  until_start: 0,
  until_24h: 24,
  until_48h: 48,
  until_7d: 168,
  organizer_discretion: null,
});

export type EventPolicyField = keyof EventPolicy;

export interface PolicyError {
  field: EventPolicyField;
  code: 'invalid_type' | 'out_of_range' | 'invalid_choice' | 'conflict';
  /** Plain sentence that tells the organizer what to do next. */
  message: string;
}

export type NormalizePolicyResult = { ok: true; policy: EventPolicy } | { ok: false; errors: PolicyError[] };

/** Input from a form or API: anything may be missing (→ default) or the wrong type (→ error). */
export type EventPolicyInput = { [K in keyof EventPolicy]?: unknown };

const LABELS: Record<EventPolicyField, string> = {
  reentryAllowed: 'Re-entry',
  reentryLimit: 'Re-entry limit',
  refundPolicy: 'Refund policy',
  refundCutoffHours: 'Refund cutoff',
  transferAllowed: 'Transfers',
  transferCutoffHours: 'Transfer cutoff',
  maxTransfersPerTicket: 'Transfers per ticket',
  attendeeNamesRequired: 'Attendee names',
  maxTicketsPerOrder: 'Tickets per order',
  doorSalesEnabled: 'Door sales',
  doorSalesMethods: 'Door sales methods',
  agePolicy: 'Age policy',
  minAge: 'Minimum age',
  scanOpensMinutesBefore: 'Scanning opens',
};

function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true' || v === 'on') return true;
  if (v === 0 || v === '0' || v === 'false' || v === 'off') return false;
  return undefined;
}

function toInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?[0-9]{1,6}$/.test(v.trim())) return Number(v.trim());
  return undefined;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '';

/**
 * Validates organizer input against the platform bounds. Missing fields take the defaults; any
 * invalid field yields an error (values are never silently clamped, so what was saved is what was meant).
 * Derived/implied fields are normalised: `refundCutoffHours` follows `refundPolicy`; `reentryLimit`
 * is null when re-entry is off; `maxTransfersPerTicket` is 0 when transfers are off; `minAge` is null
 * for all ages; door sales methods are de-duplicated.
 */
export function normalizeEventPolicy(input: EventPolicyInput = {}): NormalizePolicyResult {
  const errors: PolicyError[] = [];
  const p: EventPolicy = { ...EVENT_POLICY_DEFAULTS, doorSalesMethods: [] };

  const bool = (
    field: 'reentryAllowed' | 'transferAllowed' | 'attendeeNamesRequired' | 'doorSalesEnabled',
  ) => {
    const raw = input[field];
    if (isBlank(raw)) return;
    const v = toBool(raw);
    if (v === undefined)
      errors.push({ field, code: 'invalid_type', message: `${LABELS[field]}: choose yes or no.` });
    else p[field] = v;
  };

  const int = (
    field: keyof typeof EVENT_POLICY_BOUNDS,
    unit: string,
    nullable = false,
  ): number | null | undefined => {
    const raw = input[field];
    if (isBlank(raw)) return nullable ? null : undefined;
    const { min, max } = EVENT_POLICY_BOUNDS[field];
    const v = toInt(raw);
    if (v === undefined) {
      errors.push({
        field,
        code: 'invalid_type',
        message: `${LABELS[field]}: enter a whole number of ${unit} from ${min} to ${max}.`,
      });
      return undefined;
    }
    if (v < min || v > max) {
      errors.push({
        field,
        code: 'out_of_range',
        message: `${LABELS[field]}: choose from ${min} to ${max} ${unit}.`,
      });
      return undefined;
    }
    return v;
  };

  bool('reentryAllowed');
  bool('transferAllowed');
  bool('attendeeNamesRequired');
  bool('doorSalesEnabled');

  if (!isBlank(input.refundPolicy)) {
    if (isOneOf(REFUND_POLICIES, input.refundPolicy)) p.refundPolicy = input.refundPolicy;
    else
      errors.push({
        field: 'refundPolicy',
        code: 'invalid_choice',
        message:
          'Refund policy: choose no refunds, until the start, 24 hours, 48 hours or 7 days before, or organizer discretion.',
      });
  }
  p.refundCutoffHours = REFUND_CUTOFF_HOURS[p.refundPolicy];

  if (!isBlank(input.agePolicy)) {
    if (isOneOf(AGE_POLICIES, input.agePolicy)) p.agePolicy = input.agePolicy;
    else
      errors.push({
        field: 'agePolicy',
        code: 'invalid_choice',
        message: 'Age policy: choose all ages or a minimum age.',
      });
  }

  const reentryLimit = int('reentryLimit', 're-entries', true);
  if (reentryLimit !== undefined) p.reentryLimit = reentryLimit;
  const transferCutoff = int('transferCutoffHours', 'hours');
  if (typeof transferCutoff === 'number') p.transferCutoffHours = transferCutoff;
  const maxTransfers = int('maxTransfersPerTicket', 'transfers');
  if (typeof maxTransfers === 'number') p.maxTransfersPerTicket = maxTransfers;
  const perOrder = int('maxTicketsPerOrder', 'tickets');
  if (typeof perOrder === 'number') p.maxTicketsPerOrder = perOrder;
  const minAge = int('minAge', 'years', true);
  if (minAge !== undefined) p.minAge = minAge;
  const scanOpens = int('scanOpensMinutesBefore', 'minutes');
  if (typeof scanOpens === 'number') p.scanOpensMinutesBefore = scanOpens;

  if (!isBlank(input.doorSalesMethods)) {
    const raw = input.doorSalesMethods;
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : null;
    if (!list || !list.every((m) => isOneOf(DOOR_SALES_METHODS, m)))
      errors.push({
        field: 'doorSalesMethods',
        code: 'invalid_choice',
        message:
          'Door sales methods: choose free issue and/or cash recorded (card payments at the door are not available).',
      });
    else p.doorSalesMethods = [...new Set(list as DoorSalesMethod[])];
  }

  // Implied values and conflicts.
  if (!p.reentryAllowed) {
    if (p.reentryLimit !== null && !isBlank(input.reentryLimit))
      errors.push({
        field: 'reentryLimit',
        code: 'conflict',
        message: 'Re-entry limit: turn re-entry on, or leave the limit empty.',
      });
    p.reentryLimit = null;
  }
  if (!p.transferAllowed) p.maxTransfersPerTicket = 0;
  if (p.agePolicy === 'all_ages') {
    if (p.minAge !== null && !isBlank(input.minAge))
      errors.push({
        field: 'minAge',
        code: 'conflict',
        message: 'Minimum age: choose "minimum age" as the age policy, or leave it empty.',
      });
    p.minAge = null;
  } else if (p.minAge === null && !errors.some((e) => e.field === 'minAge')) {
    errors.push({
      field: 'minAge',
      code: 'out_of_range',
      message: 'Minimum age: enter an age from 1 to 21.',
    });
  }
  if (
    p.doorSalesEnabled &&
    p.doorSalesMethods.length === 0 &&
    !errors.some((e) => e.field === 'doorSalesMethods')
  )
    errors.push({
      field: 'doorSalesMethods',
      code: 'conflict',
      message: 'Door sales methods: choose at least one, or turn door sales off.',
    });
  if (!p.doorSalesEnabled) p.doorSalesMethods = [];

  return errors.length > 0 ? { ok: false, errors } : { ok: true, policy: p };
}

/**
 * Entries allowed per ticket per day for the scanner's admit statement:
 * re-entry off → 1; re-entry on and unlimited → null; limit N → 1 + N.
 */
export function maxEntriesPerDay(
  policy: Pick<EventPolicy, 'reentryAllowed' | 'reentryLimit'>,
): number | null {
  if (!policy.reentryAllowed) return 1;
  return policy.reentryLimit === null ? null : 1 + policy.reentryLimit;
}

/** Row shape of `event_policies` (snake_case, integers for booleans). */
export interface EventPolicyRow {
  event_id: string;
  reentry_allowed: number;
  reentry_limit: number | null;
  refund_policy: string;
  refund_cutoff_hours: number | null;
  transfer_allowed: number;
  transfer_cutoff_hours: number;
  max_transfers_per_ticket: number;
  attendee_names_required: number;
  max_tickets_per_order: number;
  door_sales_enabled: number;
  door_sales_methods_json: string;
  age_policy: string;
  min_age: number | null;
  scan_opens_minutes_before: number;
}

export function eventPolicyToRow(eventId: string, p: EventPolicy): EventPolicyRow {
  return {
    event_id: eventId,
    reentry_allowed: p.reentryAllowed ? 1 : 0,
    reentry_limit: p.reentryLimit,
    refund_policy: p.refundPolicy,
    refund_cutoff_hours: p.refundCutoffHours,
    transfer_allowed: p.transferAllowed ? 1 : 0,
    transfer_cutoff_hours: p.transferCutoffHours,
    max_transfers_per_ticket: p.maxTransfersPerTicket,
    attendee_names_required: p.attendeeNamesRequired ? 1 : 0,
    max_tickets_per_order: p.maxTicketsPerOrder,
    door_sales_enabled: p.doorSalesEnabled ? 1 : 0,
    door_sales_methods_json: JSON.stringify(p.doorSalesMethods),
    age_policy: p.agePolicy,
    min_age: p.minAge,
    scan_opens_minutes_before: p.scanOpensMinutesBefore,
  };
}

/** Reads a stored row (or none → defaults). A row that no longer validates falls back to the platform defaults. */
export function eventPolicyFromRow(row: Partial<EventPolicyRow> | null | undefined): EventPolicy {
  if (!row) return { ...EVENT_POLICY_DEFAULTS, doorSalesMethods: [] };
  let methods: unknown;
  try {
    methods = JSON.parse(row.door_sales_methods_json ?? '[]');
  } catch {
    methods = [];
  }
  const r = normalizeEventPolicy({
    reentryAllowed: row.reentry_allowed,
    reentryLimit: row.reentry_limit,
    refundPolicy: row.refund_policy,
    transferAllowed: row.transfer_allowed,
    transferCutoffHours: row.transfer_cutoff_hours,
    maxTransfersPerTicket: row.max_transfers_per_ticket,
    attendeeNamesRequired: row.attendee_names_required,
    maxTicketsPerOrder: row.max_tickets_per_order,
    doorSalesEnabled: row.door_sales_enabled,
    doorSalesMethods: methods,
    agePolicy: row.age_policy,
    minAge: row.min_age,
    scanOpensMinutesBefore: row.scan_opens_minutes_before,
  });
  return r.ok ? r.policy : { ...EVENT_POLICY_DEFAULTS, doorSalesMethods: [] };
}

/** `ticket_orders.policy_snapshot_json`: the terms a buyer bought under (§5.4). */
export function policySnapshotJson(p: EventPolicy): string {
  return JSON.stringify({ v: 1, ...p });
}

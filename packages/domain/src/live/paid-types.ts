/**
 * Shared contract for Gamo Live paid ticketing (docs/LIVE_REQUIREMENTS.md §8, docs/LIVE_DATA_MODEL.md §8,
 * docs/LIVE_PAYMENTS.md). Enumerations mirror the `CHECK` constraints of migrations 0008–0011 exactly; the function
 * types pin the names and shapes that one module calls in another, so they can be built side by side.
 *
 * Money is integer cents with its currency (`usd` only for now). Times are UTC epoch seconds.
 */
import type { SqlDatabase, SqlStatementSpec } from '../security/sql-database.ts';

// ── Enumerations (match the migrations) ────────────────────────────────────────────────────────────────────────

export const CURRENCY = 'usd' as const;
export type Currency = typeof CURRENCY;

export const FUNDS_FLOWS = ['organizer_account', 'gamo_collects'] as const;
/** Mode A (`organizer_account`) or Mode B (`gamo_collects`). */
export type FundsFlow = (typeof FUNDS_FLOWS)[number];
export const FUNDS_FLOW_DEFAULTS = ['not_chosen', ...FUNDS_FLOWS] as const;
export type FundsFlowDefault = (typeof FUNDS_FLOW_DEFAULTS)[number];

export const SELLERS = ['organization', 'gamo'] as const;
export type Seller = (typeof SELLERS)[number];

export const FEE_PAYERS = ['buyer', 'organizer'] as const;
/** `buyer` = the fee is passed on to the buyer; `organizer` = the organizer absorbs it. */
export type FeePayer = (typeof FEE_PAYERS)[number];

export const REFUND_POLICIES = ['none', 'until_hours_before', 'until_start'] as const;
export type RefundPolicy = (typeof REFUND_POLICIES)[number];
export const REFUND_HOURS = [24, 48, 72, 168] as const;
export type RefundHours = (typeof REFUND_HOURS)[number];

export const TICKET_TYPE_KINDS = [
  'general',
  'vip',
  'child',
  'student',
  'group',
  'day_pass',
  'other',
] as const;
export type TicketTypeKind = (typeof TICKET_TYPE_KINDS)[number];
export const TICKET_TYPE_STATUSES = ['on_sale', 'hidden', 'ended'] as const;
export type TicketTypeStatus = (typeof TICKET_TYPE_STATUSES)[number];

export const CODE_KINDS = ['promo', 'access'] as const;
export type CodeKind = (typeof CODE_KINDS)[number];
export const DISCOUNT_KINDS = ['percent', 'amount'] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export const ORDER_CHANNELS = ['online', 'door'] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];
export const PAYMENT_METHODS = ['card_online', 'phone_qr', 'card_reader', 'cash', 'comp', 'free'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
/** Methods that take money through Stripe (need a funds-flow mode). */
export const STRIPE_METHODS: readonly PaymentMethod[] = ['card_online', 'phone_qr', 'card_reader'];
export const ORDER_STATUSES = [
  'pending',
  'paid',
  'paid_unfulfilled',
  'canceled',
  'expired',
  'refunded',
  'partially_refunded',
  'voided',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TICKET_STATUSES = ['valid', 'refunded', 'voided', 'canceled'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PAYMENT_KINDS = ['checkout_session', 'card_present', 'cash', 'comp'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'canceled', 'expired'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = [
  'requested',
  'declined',
  'pending',
  'succeeded',
  'failed',
  'canceled',
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];
export const REFUND_METHODS = ['stripe', 'cash', 'none'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];
export const REFUND_REQUESTERS = ['buyer', 'organizer', 'admin', 'system'] as const;
export type RefundRequester = (typeof REFUND_REQUESTERS)[number];

export const DISPUTE_OUTCOMES = ['won', 'lost', 'warning_closed'] as const;
export type DisputeOutcome = (typeof DISPUTE_OUTCOMES)[number];

export const LEDGER_ENTRY_TYPES = [
  'ticket_sale',
  'gift',
  'gamo_fee',
  'processing_cost',
  'refund',
  'gift_refund',
  'fee_refund',
  'dispute',
  'dispute_reversal',
  'payout',
  'cash_sale',
  'cash_refund',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
/** Money categories of docs/GAMO_NONPROFIT_MODEL.md §5.3. */
export const LEDGER_CATEGORIES = [
  'program_service_receipt',
  'third_party_payable',
  'processing_cost',
  'refund',
  'dispute',
] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];
export const HELD_BY = ['organization', 'gamo'] as const;
export type HeldBy = (typeof HELD_BY)[number];

export const PAYOUT_STATUSES = ['prepared', 'approved', 'sent', 'failed', 'canceled'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const STAFF_PERMISSIONS = ['check_in', 'sell', 'comp'] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export const CASH_SESSION_STATUSES = ['open', 'closed'] as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUSES)[number];
export const CASH_MOVEMENT_KINDS = ['sale', 'refund'] as const;
export type CashMovementKind = (typeof CASH_MOVEMENT_KINDS)[number];

export const READER_STATUSES = ['online', 'offline', 'unknown'] as const;
export type ReaderStatus = (typeof READER_STATUSES)[number];
export const READER_ACTION_STATUSES = ['idle', 'in_progress', 'succeeded', 'failed'] as const;
export type ReaderActionStatus = (typeof READER_ACTION_STATUSES)[number];

export const VERIFICATION_STATUSES = [
  'none',
  'requested',
  'meeting_scheduled',
  'meeting_held',
  'verified',
  'declined',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const MEETING_FORMATS = ['video', 'in_person'] as const;
export type MeetingFormat = (typeof MEETING_FORMATS)[number];
export const MEETING_STATUSES = ['scheduled', 'held', 'canceled'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const PAYMENT_DECISION_SUBJECTS = [
  'funds_flow_default',
  'organization_override',
  'door_sales',
  'fee',
  'payout',
] as const;
export type PaymentDecisionSubject = (typeof PAYMENT_DECISION_SUBJECTS)[number];

// ── Id prefixes (newPrefixedId) ────────────────────────────────────────────────────────────────────────────────

export const PAID_ID_PREFIX = {
  ticketType: 'tty',
  priceDeadline: 'tpd',
  code: 'cod',
  order: 'ord',
  orderItem: 'oit',
  ticket: 'tkt',
  payment: 'pay',
  refund: 'rfd',
  dispute: 'dsp',
  transfer: 'trf',
  ledger: 'led',
  payout: 'pyo',
  staffLink: 'stf',
  cashSession: 'csh',
  cashMovement: 'cmv',
  location: 'tml',
  reader: 'rdr',
  fee: 'fee',
  paymentDecision: 'pdc',
  meeting: 'vmt',
} as const;

/** Paid ticket QR payloads start with this (free registrations use `GL1.`), so a scan is routed without guessing. */
export const PAID_TICKET_QR_PREFIX = 'GT1';

/** How long a pending order holds its seats: the Checkout Session lasts 31 minutes (Stripe's minimum is 30). */
export const CHECKOUT_SESSION_SECONDS = 31 * 60;
export const HOLD_GRACE_SECONDS = 4 * 60;
export const ORDER_HOLD_SECONDS = CHECKOUT_SESSION_SECONDS + HOLD_GRACE_SECONDS;
/** A door "buyer's phone" sale waits this long for the buyer to pay. */
export const DOOR_PHONE_HOLD_SECONDS = ORDER_HOLD_SECONDS;

// ── Snapshots copied onto each order ───────────────────────────────────────────────────────────────────────────

/** The event's policies when the order was created (`orders.policy_snapshot`). */
export interface PolicySnapshot {
  v: 1;
  refundPolicy: RefundPolicy;
  refundHours: RefundHours | null;
  transfersAllowed: boolean;
  transferCutoffHours: number;
  reentryAllowed: boolean;
  entryNotes: string | null;
  namesRequired: boolean;
}

/** The Gamo fee in force when the order was created (`orders.fee_snapshot`). */
export interface FeeSnapshot {
  v: 1;
  feeSettingId: string;
  fixedCents: number;
  percentBps: number;
  payer: FeePayer;
}

/** A row of `fee_settings`. */
export interface FeeSetting {
  id: string;
  fixedCents: number;
  percentBps: number;
  effectiveAt: number;
}

// ── Prices (fees.ts) ───────────────────────────────────────────────────────────────────────────────────────────

export interface PriceLineInput {
  ticketTypeId: string;
  name: string;
  /** The unit price in force (after price deadlines), computed on the server. */
  unitPriceCents: number;
  quantity: number;
  peoplePerTicket: number;
}

export interface DiscountInput {
  kind: DiscountKind;
  percentOff: number | null;
  amountOffCents: number | null;
  /** Ticket types the discount applies to; null = all. */
  ticketTypeIds: readonly string[] | null;
}

export interface PricedLine extends PriceLineInput {
  discountCents: number;
  /** Gamo fee on this line (whether the buyer pays it or the organizer absorbs it). */
  feeCents: number;
  /** What the buyer pays for this line: unit × quantity − discount (+ fee when passed on). */
  lineTotalCents: number;
}

export interface PricedOrder {
  currency: Currency;
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  feePayer: FeePayer;
  giftCents: number;
  /** What the buyer pays. Equals subtotal − discount + (fee if passed on) + gift. */
  totalCents: number;
  /** Ticket money owed to the organization before processing costs: subtotal − discount − (fee if absorbed). */
  ticketNetCents: number;
}

export interface PriceOrderInput {
  lines: readonly PriceLineInput[];
  discount: DiscountInput | null;
  fee: FeeSnapshot;
  giftCents: number;
  /** False for cash, comp and price-0 sales: no Gamo fee (proposal 7). */
  chargeFee: boolean;
}

// ── Orders (orders.ts, owned by the tickets-and-orders module) ────────────────────────────────────────────────

export interface ReserveOrderLine {
  ticketTypeId: string;
  quantity: number;
}

export interface ReserveOrderInput {
  eventId: string;
  occurrenceId: string;
  channel: OrderChannel;
  paymentMethod: PaymentMethod;
  lines: readonly ReserveOrderLine[];
  /** Promo or access code as typed (normalized on the server). */
  code?: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  /** Attendee names in ticket order, when the event requires names. */
  attendeeNames?: readonly string[] | null;
  giftCents?: number;
  termsVersion?: string | null;
  /** Organizer's preview order (never counted in reports, voidable). */
  isPreview?: boolean;
  compReason?: string | null;
  staffLinkId?: string | null;
  cashSessionId?: string | null;
  readerId?: string | null;
  now: number;
}

/** What `reserveOrder` returns: the pending order with server-computed prices. */
export interface ReservedOrder {
  orderId: string;
  reference: string;
  organizationId: string;
  status: OrderStatus;
  priced: PricedOrder;
  fundsFlow: FundsFlow | null;
  seller: Seller;
  /** The Stripe account charges go to (null = Gamo's own account). */
  stripeAccountId: string | null;
  holdExpiresAt: number | null;
}

export type ReserveOrder = (
  db: SqlDatabase,
  env: PaidEnv,
  input: ReserveOrderInput,
) => Promise<ReservedOrder>;

export interface MarkPaidInput {
  orderId: string;
  /** What actually arrived, checked against the order (Stripe amount_total / amount_received, or cash due). */
  amountCents: number;
  currency: string;
  /** The Stripe object that paid (Checkout Session or PaymentIntent id); null for cash, comp, free. */
  providerRef: string | null;
  /** The account the payment was made on (null = Gamo's own), checked against the order. */
  stripeAccountId: string | null;
  paymentIntentId?: string | null;
  /** Door sales: create the tickets already checked in. */
  admit?: boolean;
  admittedBy?: string | null;
  /** Statements to run in the same batch (for example a cash movement). */
  extraStatements?: readonly SqlStatementSpec[];
  now: number;
}

export type MarkPaidResult =
  | { outcome: 'paid'; orderId: string; ticketIds: string[] }
  | { outcome: 'already_paid'; orderId: string }
  /** Paid after the seats were lost or the event was canceled: refund it in full and email the buyer. */
  | { outcome: 'unfulfilled'; orderId: string }
  | { outcome: 'mismatch'; orderId: string; reason: 'amount' | 'currency' | 'account' | 'reference' }
  | { outcome: 'not_found' };

export type MarkOrderPaid = (db: SqlDatabase, env: PaidEnv, input: MarkPaidInput) => Promise<MarkPaidResult>;

export type ReleaseReason = 'expired' | 'canceled' | 'failed' | 'voided';
export type ReleaseOrder = (
  db: SqlDatabase,
  input: { orderId: string; reason: ReleaseReason; now: number },
) => Promise<{ released: boolean }>;

// ── Webhook handlers (webhooks.ts dispatches; each module exports its handler) ──────────────────────────────────

/** A verified Stripe event (only the fields Gamo reads). */
export interface StripeEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  /** Present for events on a connected account (Connect endpoint). */
  account?: string;
  data: { object: Record<string, unknown> };
}

/**
 * `processed`: done. `ignored`: nothing to do (recorded, answered 200). `retry`: depends on something not recorded yet
 * (for example a refund before its payment): marked failed and answered 500 so Stripe redelivers.
 */
export type HandlerResult = 'processed' | 'ignored' | 'retry';

export interface WebhookContext {
  db: SqlDatabase;
  env: PaidEnv;
  now: number;
  /** Which endpoint received it: Mode A events arrive on `connect` with `event.account`. */
  endpoint: 'platform' | 'connect';
}

export type StripeEventHandler = (event: StripeEvent, ctx: WebhookContext) => Promise<HandlerResult>;

/** Event type → handler. Assembled by the app from the modules' exported handlers. */
export type StripeEventHandlers = Partial<Record<string, StripeEventHandler>>;

// ── Environment ────────────────────────────────────────────────────────────────────────────────────────────────

/** The Worker environment (`GamoEnv`); only the variables paid ticketing reads. */
export interface PaidEnv {
  ENVIRONMENT?: unknown;
  STRIPE_SECRET_KEY?: unknown;
  STRIPE_WEBHOOK_SECRET?: unknown;
  STRIPE_CONNECT_WEBHOOK_SECRET?: unknown;
  ALLOW_STRIPE_STANDIN?: unknown;
  LIVE_TICKET_SECRET?: unknown;
  PII_HASH_SECRET?: unknown;
}

// ── Errors ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type PaidErrorCode =
  | 'invalid'
  | 'not_found'
  | 'forbidden'
  | 'not_on_sale'
  | 'sold_out'
  | 'limit_exceeded'
  | 'closed_past'
  | 'code_invalid'
  | 'code_used_up'
  | 'payments_unavailable'
  | 'mode_not_chosen'
  | 'account_not_ready'
  | 'not_verified'
  | 'terms_not_accepted'
  | 'policy_forbids'
  | 'already_done'
  | 'stale'
  | 'rate_limited'
  | 'locked'
  | 'expired'
  | 'wrong_pin'
  | 'session_closed'
  | 'reader_unavailable'
  | 'stripe_error';

/** One error type for paid ticketing; pages map `code` to a message. */
export class PaidError extends Error {
  readonly code: PaidErrorCode;
  /** Field name for form errors, or a short machine detail. */
  readonly detail?: string;
  readonly retryAfterSeconds?: number;
  constructor(code: PaidErrorCode, extra: { detail?: string; retryAfterSeconds?: number } = {}) {
    super(extra.detail ? `${code}: ${extra.detail}` : code);
    this.name = 'PaidError';
    this.code = code;
    this.detail = extra.detail;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

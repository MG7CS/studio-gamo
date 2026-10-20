/**
 * The Gamo Live ledger (docs/LIVE_PAYMENTS.md §6, docs/LIVE_DATA_MODEL.md §8). Append-only: every money movement is
 * one or more `ledger_entries` rows in signed cents with a category from docs/GAMO_NONPROFIT_MODEL.md §5.3 and
 * `held_by` (who holds the money). Reports and statements read only these rows.
 *
 * The builders return SQL for the caller's batch. Every row has a `source_key`, so writing the same movement twice
 * is a no-op, and an optional guard makes the rows conditional on the order's status inside that same batch.
 */
import { newPrefixedId } from '../security/ids.ts';
import type { SqlStatementSpec } from '../security/sql-database.ts';
import type {
  FeePayer,
  FundsFlow,
  HeldBy,
  LedgerCategory,
  LedgerEntryType,
  OrderStatus,
  PaymentMethod,
} from './paid-types.ts';

export interface LedgerRow {
  organizationId: string;
  eventId: string | null;
  orderId: string | null;
  refundId?: string | null;
  disputeId?: string | null;
  payoutId?: string | null;
  entryType: LedgerEntryType;
  category: LedgerCategory;
  heldBy: HeldBy;
  fundsFlow: FundsFlow | null;
  amountCents: number;
  currency: string;
  sourceKey: string;
  stripeBalanceTransactionId?: string | null;
  occurredAt: number;
}

/** Who holds money paid through Stripe in a mode: the organization's own account (A) or Gamo (B). */
export function heldByFor(flow: FundsFlow | null): HeldBy {
  return flow === 'gamo_collects' ? 'gamo' : 'organization';
}

/**
 * One insert, idempotent on `source_key`. With `guard`, the row is written only when the order has one of those
 * statuses at that point of the batch.
 */
export function ledgerInsert(
  row: LedgerRow,
  guard?: { orderId: string; statuses: readonly OrderStatus[] },
): SqlStatementSpec {
  if (!Number.isInteger(row.amountCents)) throw new RangeError('ledgerInsert: amount must be integer cents');
  const params = [
    newPrefixedId('led'),
    row.organizationId,
    row.eventId,
    row.orderId,
    row.refundId ?? null,
    row.disputeId ?? null,
    row.payoutId ?? null,
    row.entryType,
    row.category,
    row.heldBy,
    row.fundsFlow,
    row.amountCents,
    row.currency,
    row.sourceKey,
    row.stripeBalanceTransactionId ?? null,
    row.occurredAt,
  ];
  const columns =
    'id, organization_id, event_id, order_id, refund_id, dispute_id, payout_id, entry_type, category, held_by, ' +
    'funds_flow, amount_cents, currency, source_key, stripe_balance_transaction_id, occurred_at';
  const values = params.map((_, i) => `?${i + 1}`).join(', ');
  if (!guard) {
    return {
      sql: `INSERT INTO ledger_entries (${columns}) VALUES (${values}) ON CONFLICT (source_key) DO NOTHING`,
      params,
    };
  }
  const statusParams = guard.statuses.map((_, i) => `?${params.length + 2 + i}`).join(', ');
  return {
    sql:
      `INSERT INTO ledger_entries (${columns}) SELECT ${values} ` +
      `WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?${params.length + 1} AND status IN (${statusParams})) ` +
      `ON CONFLICT (source_key) DO NOTHING`,
    params: [...params, guard.orderId, ...guard.statuses],
  };
}

export interface PaidOrderLedgerInput {
  orderId: string;
  organizationId: string;
  eventId: string;
  fundsFlow: FundsFlow | null;
  paymentMethod: PaymentMethod;
  isPreview: boolean;
  subtotalCents: number;
  discountCents: number;
  feeCents: number;
  feePayer: FeePayer;
  giftCents: number;
  currency: string;
  occurredAt: number;
}

/**
 * Entries for an order that was just paid. Preview orders and orders of 0 write nothing. Cash: `cash_sale` and
 * `gift`, held by the organization, no fee. Stripe: `ticket_sale` and `gift` (third-party payable, held per mode),
 * `gamo_fee` (program service receipt, held by Gamo), and when the organizer absorbs the fee, a negative
 * `ticket_sale` of the same amount. Guarded: written only while the order is paid.
 */
export function ledgerForPaidOrder(input: PaidOrderLedgerInput): SqlStatementSpec[] {
  if (input.isPreview) return [];
  const ticketCents = input.subtotalCents - input.discountCents;
  if (ticketCents + input.giftCents + (input.feePayer === 'buyer' ? input.feeCents : 0) === 0) return [];
  const guard = { orderId: input.orderId, statuses: ['paid'] as const };
  const base = {
    organizationId: input.organizationId,
    eventId: input.eventId,
    orderId: input.orderId,
    fundsFlow: input.fundsFlow,
    currency: input.currency,
    occurredAt: input.occurredAt,
  };
  const key = (part: string) => `order:${input.orderId}:${part}`;
  const out: SqlStatementSpec[] = [];
  if (input.paymentMethod === 'cash') {
    if (ticketCents > 0)
      out.push(
        ledgerInsert(
          {
            ...base,
            entryType: 'cash_sale',
            category: 'third_party_payable',
            heldBy: 'organization',
            amountCents: ticketCents,
            sourceKey: key('cash_sale'),
          },
          guard,
        ),
      );
    if (input.giftCents > 0)
      out.push(
        ledgerInsert(
          {
            ...base,
            entryType: 'gift',
            category: 'third_party_payable',
            heldBy: 'organization',
            amountCents: input.giftCents,
            sourceKey: key('gift'),
          },
          guard,
        ),
      );
    return out;
  }
  const heldBy = heldByFor(input.fundsFlow);
  if (ticketCents > 0)
    out.push(
      ledgerInsert(
        {
          ...base,
          entryType: 'ticket_sale',
          category: 'third_party_payable',
          heldBy,
          amountCents: ticketCents,
          sourceKey: key('ticket_sale'),
        },
        guard,
      ),
    );
  if (input.giftCents > 0)
    out.push(
      ledgerInsert(
        {
          ...base,
          entryType: 'gift',
          category: 'third_party_payable',
          heldBy,
          amountCents: input.giftCents,
          sourceKey: key('gift'),
        },
        guard,
      ),
    );
  if (input.feeCents > 0) {
    out.push(
      ledgerInsert(
        {
          ...base,
          entryType: 'gamo_fee',
          category: 'program_service_receipt',
          heldBy: 'gamo',
          amountCents: input.feeCents,
          sourceKey: key('gamo_fee'),
        },
        guard,
      ),
    );
    if (input.feePayer === 'organizer')
      out.push(
        ledgerInsert(
          {
            ...base,
            entryType: 'ticket_sale',
            category: 'third_party_payable',
            heldBy,
            amountCents: -input.feeCents,
            sourceKey: key('fee_absorbed'),
          },
          guard,
        ),
      );
  }
  return out;
}

export interface RefundLedgerInput {
  refundId: string;
  orderId: string;
  organizationId: string;
  eventId: string;
  fundsFlow: FundsFlow | null;
  method: 'stripe' | 'cash';
  /** Total returned to the buyer, including the gift and fee parts below. */
  amountCents: number;
  giftCents: number;
  /** The part of the Gamo fee returned (passed-on fee given back, or an absorbed fee reversed). */
  feeCents: number;
  /** True when the fee was absorbed by the organizer: reversing it credits the organization back. */
  feeAbsorbed: boolean;
  currency: string;
  occurredAt: number;
}

/** Entries for a refund that succeeded. All negative except an absorbed fee's reversal, which credits the organization. */
export function ledgerForRefund(input: RefundLedgerInput): SqlStatementSpec[] {
  const key = (part: string) => `refund:${input.refundId}:${part}`;
  const base = {
    organizationId: input.organizationId,
    eventId: input.eventId,
    orderId: input.orderId,
    refundId: input.refundId,
    fundsFlow: input.fundsFlow,
    currency: input.currency,
    occurredAt: input.occurredAt,
  };
  if (input.method === 'cash')
    return [
      ledgerInsert({
        ...base,
        entryType: 'cash_refund',
        category: 'refund',
        heldBy: 'organization',
        amountCents: -input.amountCents,
        sourceKey: key('cash_refund'),
      }),
    ];
  const heldBy = heldByFor(input.fundsFlow);
  const passedOnFee = input.feeAbsorbed ? 0 : input.feeCents;
  const ticketPart = input.amountCents - input.giftCents - passedOnFee;
  const out: SqlStatementSpec[] = [];
  if (ticketPart !== 0)
    out.push(
      ledgerInsert({
        ...base,
        entryType: 'refund',
        category: 'refund',
        heldBy,
        amountCents: -ticketPart,
        sourceKey: key('refund'),
      }),
    );
  if (input.giftCents > 0)
    out.push(
      ledgerInsert({
        ...base,
        entryType: 'gift_refund',
        category: 'refund',
        heldBy,
        amountCents: -input.giftCents,
        sourceKey: key('gift_refund'),
      }),
    );
  if (input.feeCents > 0) {
    out.push(
      ledgerInsert({
        ...base,
        entryType: 'fee_refund',
        category: 'refund',
        heldBy: 'gamo',
        amountCents: -input.feeCents,
        sourceKey: key('fee_refund'),
      }),
    );
    if (input.feeAbsorbed)
      out.push(
        ledgerInsert({
          ...base,
          entryType: 'ticket_sale',
          category: 'third_party_payable',
          heldBy,
          amountCents: input.feeCents,
          sourceKey: key('fee_absorbed_back'),
        }),
      );
  }
  return out;
}

/** A dispute opened (money taken back) or won (money returned). */
export function ledgerForDispute(input: {
  disputeId: string;
  orderId: string;
  organizationId: string;
  eventId: string;
  fundsFlow: FundsFlow | null;
  amountCents: number;
  phase: 'opened' | 'won';
  currency: string;
  occurredAt: number;
}): SqlStatementSpec[] {
  const opened = input.phase === 'opened';
  return [
    ledgerInsert({
      organizationId: input.organizationId,
      eventId: input.eventId,
      orderId: input.orderId,
      disputeId: input.disputeId,
      entryType: opened ? 'dispute' : 'dispute_reversal',
      category: 'dispute',
      heldBy: heldByFor(input.fundsFlow),
      fundsFlow: input.fundsFlow,
      amountCents: opened ? -input.amountCents : input.amountCents,
      currency: input.currency,
      sourceKey: `dispute:${input.disputeId}:${input.phase}`,
      occurredAt: input.occurredAt,
    }),
  ];
}

/** Stripe's processing cost for a payment, from its balance transaction (negative). */
export function ledgerForProcessingCost(input: {
  orderId: string;
  organizationId: string;
  eventId: string;
  fundsFlow: FundsFlow;
  feeCents: number;
  balanceTransactionId: string;
  currency: string;
  occurredAt: number;
}): SqlStatementSpec[] {
  if (input.feeCents <= 0) return [];
  return [
    ledgerInsert({
      organizationId: input.organizationId,
      eventId: input.eventId,
      orderId: input.orderId,
      entryType: 'processing_cost',
      category: 'processing_cost',
      heldBy: heldByFor(input.fundsFlow),
      fundsFlow: input.fundsFlow,
      amountCents: -input.feeCents,
      currency: input.currency,
      sourceKey: `processing:${input.balanceTransactionId}`,
      stripeBalanceTransactionId: input.balanceTransactionId,
      occurredAt: input.occurredAt,
    }),
  ];
}

/** A Mode B payout sent to the organization (negative: Gamo no longer holds it). */
export function ledgerForPayout(input: {
  payoutId: string;
  organizationId: string;
  amountCents: number;
  currency: string;
  occurredAt: number;
}): SqlStatementSpec[] {
  return [
    ledgerInsert({
      organizationId: input.organizationId,
      eventId: null,
      orderId: null,
      payoutId: input.payoutId,
      entryType: 'payout',
      category: 'third_party_payable',
      heldBy: 'gamo',
      fundsFlow: 'gamo_collects',
      amountCents: -input.amountCents,
      currency: input.currency,
      sourceKey: `payout:${input.payoutId}`,
      occurredAt: input.occurredAt,
    }),
  ];
}

/**
 * What Gamo owes an organization (Mode B): payable money Gamo holds, less processing costs, refunds, disputes and
 * payouts. The Gamo fee (program service receipt) is Gamo's and is not counted.
 */
export const OWED_TO_ORGANIZATION_SQL =
  `SELECT COALESCE(SUM(amount_cents), 0) AS owed FROM ledger_entries ` +
  `WHERE organization_id = ?1 AND held_by = 'gamo' AND category <> 'program_service_receipt' ` +
  `AND entry_type NOT IN ('fee_refund')`;

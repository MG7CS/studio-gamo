/**
 * Money reports for Gamo Live (docs/LIVE_REQUIREMENTS.md §8 items 28, 29, 31 and 36; docs/LIVE_PAYMENTS.md §6).
 * Every amount comes from `ledger_entries`; order rows only supply what the ledger does not hold (tickets per type,
 * discounts, the channel and method of door sales, references for statements). Preview orders write no ledger rows
 * and are excluded from the counts.
 *
 * - `salesSummary` / `salesByDate`: per event or per date.
 * - `reconcileEvent`: each Stripe-paid order's ledger lines next to Stripe's balance transactions (Mode A on the
 *   connected account, Mode B on Gamo's), optionally recording Stripe's processing cost in the ledger
 *   (`ledgerForProcessingCost`, idempotent per balance transaction). `reconcilePayouts` does the same for Mode B
 *   transfers.
 * - `owedToOrganization` / `modeBBalances`: what Gamo holds for organizations (`OWED_TO_ORGANIZATION_SQL`).
 * - `organizationStatement`: the ledger lines of a period with opening and closing balances.
 */
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { ledgerForProcessingCost, OWED_TO_ORGANIZATION_SQL } from './ledger.ts';
import {
  PaidError,
  type FundsFlow,
  type HeldBy,
  type LedgerCategory,
  type LedgerEntryType,
  type PaidEnv,
  type PaymentMethod,
} from './paid-types.ts';
import { stripeGatewayFor } from './payments/index.ts';
import type { StripeBalanceTransaction, StripeGateway } from './payments/types.ts';
import { webhookErrorCode } from './webhooks.ts';

/** Orders that sold tickets (paid, then possibly refunded). */
const SOLD_STATUSES = "('paid', 'partially_refunded', 'refunded')";
/** Ledger rows that are the organization's money (everything but Gamo's fee and payouts). */
const TO_ORGANIZATION = "entry_type NOT IN ('gamo_fee', 'fee_refund', 'payout')";

async function requireEvent(
  db: SqlDatabase,
  organizationId: string,
  eventId: string,
): Promise<{ title: string }> {
  const [row] = await allRows<{ title: string }>(db, {
    sql: 'SELECT title FROM events WHERE id = ?1 AND organization_id = ?2',
    params: [eventId, organizationId],
  });
  if (!row) throw new PaidError('not_found');
  return row;
}

// ── Sales summary ──────────────────────────────────────────────────────────────────────────────────────────────

export interface SalesByType {
  ticketTypeId: string;
  name: string;
  quantity: number;
  /** Price × quantity less discounts (what the tickets brought before fees). */
  ticketCents: number;
}

export interface DoorSalesByMethod {
  method: PaymentMethod;
  orders: number;
  /** Ticket money and gifts taken at the door with this method (0 for comps). */
  amountCents: number;
}

export interface SalesSummary {
  eventId: string;
  occurrenceId: string | null;
  types: SalesByType[];
  ticketsSold: number;
  /** Ticket prices before discounts. */
  grossCents: number;
  discountCents: number;
  /** Ticket money after discounts (online and door, cash included). */
  ticketSalesCents: number;
  /** Gamo fee kept, net of fee refunds. */
  gamoFeeCents: number;
  /** The fee taken from the organization's share when it absorbs it (negative), net of reversals. */
  feeAbsorbedCents: number;
  giftsCents: number;
  /** Ticket, gift and cash refunds (negative). */
  refundsCents: number;
  /** Disputes less those won (negative). */
  disputesCents: number;
  /** Stripe's processing cost recorded so far (negative). */
  processingCostCents: number;
  /** Everything that is the organization's: sales + gifts − absorbed fee − refunds − disputes − processing. */
  netToOrganizationCents: number;
  doorByMethod: DoorSalesByMethod[];
}

export async function salesSummary(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string; occurrenceId?: string | null },
): Promise<SalesSummary> {
  await requireEvent(db, input.organizationId, input.eventId);
  const occ = input.occurrenceId ?? null;
  const types = await allRows<{
    ticket_type_id: string;
    name: string;
    quantity: number;
    ticket_cents: number;
  }>(db, {
    sql:
      'SELECT oi.ticket_type_id, tt.name, SUM(oi.quantity) AS quantity, ' +
      'SUM(oi.unit_price_cents * oi.quantity - oi.discount_cents) AS ticket_cents ' +
      'FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN ticket_types tt ON tt.id = oi.ticket_type_id ' +
      `WHERE o.event_id = ?1 AND (?2 IS NULL OR o.occurrence_id = ?2) AND o.is_preview = 0 AND o.status IN ${SOLD_STATUSES} ` +
      'GROUP BY oi.ticket_type_id, tt.name ORDER BY MIN(tt.position), tt.name',
    params: [input.eventId, occ],
  });
  const [discounts] = await allRows<{ discount: number }>(db, {
    sql:
      'SELECT COALESCE(SUM(discount_cents), 0) AS discount FROM orders ' +
      `WHERE event_id = ?1 AND (?2 IS NULL OR occurrence_id = ?2) AND is_preview = 0 AND status IN ${SOLD_STATUSES}`,
    params: [input.eventId, occ],
  });
  const ledger = await allRows<{ entry_type: LedgerEntryType; absorbed: number; cents: number }>(db, {
    sql:
      "SELECT l.entry_type, (l.source_key LIKE '%:fee_absorbed%') AS absorbed, SUM(l.amount_cents) AS cents " +
      'FROM ledger_entries l LEFT JOIN orders o ON o.id = l.order_id ' +
      'WHERE l.event_id = ?1 AND l.organization_id = ?2 AND (?3 IS NULL OR o.occurrence_id = ?3) ' +
      'GROUP BY l.entry_type, absorbed',
    params: [input.eventId, input.organizationId, occ],
  });
  const sum = (types: LedgerEntryType[], absorbed?: boolean) =>
    ledger
      .filter(
        (r) => types.includes(r.entry_type) && (absorbed === undefined || (r.absorbed === 1) === absorbed),
      )
      .reduce((a, r) => a + Number(r.cents), 0);
  const ticketSalesCents = sum(['ticket_sale'], false) + sum(['cash_sale']);
  const feeAbsorbedCents = sum(['ticket_sale'], true);
  const giftsCents = sum(['gift']);
  const refundsCents = sum(['refund', 'gift_refund', 'cash_refund']);
  const disputesCents = sum(['dispute', 'dispute_reversal']);
  const processingCostCents = sum(['processing_cost']);
  const door = await allRows<{ method: PaymentMethod; orders: number; cents: number }>(db, {
    sql:
      'SELECT o.payment_method AS method, COUNT(*) AS orders, COALESCE(SUM((SELECT SUM(l.amount_cents) FROM ledger_entries l ' +
      "WHERE l.order_id = o.id AND l.entry_type IN ('ticket_sale', 'cash_sale', 'gift') AND l.source_key LIKE 'order:%' " +
      "AND l.source_key NOT LIKE '%:fee_absorbed%')), 0) AS cents FROM orders o " +
      "WHERE o.event_id = ?1 AND (?2 IS NULL OR o.occurrence_id = ?2) AND o.channel = 'door' AND o.is_preview = 0 " +
      `AND o.status IN ${SOLD_STATUSES} GROUP BY o.payment_method ORDER BY o.payment_method`,
    params: [input.eventId, occ],
  });
  const discountCents = Number(discounts?.discount ?? 0);
  return {
    eventId: input.eventId,
    occurrenceId: occ,
    types: types.map((t) => ({
      ticketTypeId: t.ticket_type_id,
      name: t.name,
      quantity: Number(t.quantity),
      ticketCents: Number(t.ticket_cents),
    })),
    ticketsSold: types.reduce((a, t) => a + Number(t.quantity), 0),
    grossCents: ticketSalesCents + discountCents,
    discountCents,
    ticketSalesCents,
    gamoFeeCents: sum(['gamo_fee', 'fee_refund']),
    feeAbsorbedCents,
    giftsCents,
    refundsCents,
    disputesCents,
    processingCostCents,
    netToOrganizationCents:
      ticketSalesCents + feeAbsorbedCents + giftsCents + refundsCents + disputesCents + processingCostCents,
    doorByMethod: door.map((d) => ({
      method: d.method,
      orders: Number(d.orders),
      amountCents: Number(d.cents),
    })),
  };
}

/** One summary per date of the event, in date order. */
export async function salesByDate(
  db: SqlDatabase,
  input: { organizationId: string; eventId: string },
): Promise<Array<SalesSummary & { startsAt: number }>> {
  await requireEvent(db, input.organizationId, input.eventId);
  const dates = await allRows<{ id: string; starts_at: number }>(db, {
    sql: 'SELECT id, starts_at FROM event_occurrences WHERE event_id = ?1 ORDER BY starts_at, id',
    params: [input.eventId],
  });
  const out: Array<SalesSummary & { startsAt: number }> = [];
  for (const d of dates)
    out.push({ ...(await salesSummary(db, { ...input, occurrenceId: d.id })), startsAt: d.starts_at });
  return out;
}

// ── Reconciliation ─────────────────────────────────────────────────────────────────────────────────────────────

export interface LedgerLine {
  entryType: LedgerEntryType;
  amountCents: number;
  sourceKey: string;
  stripeBalanceTransactionId: string | null;
}

export interface ReconciliationLine {
  orderId: string;
  reference: string;
  fundsFlow: FundsFlow | null;
  /** The account the order was charged on (null = Gamo's). */
  stripeAccountId: string | null;
  ledger: LedgerLine[];
  balanceTransactions: StripeBalanceTransaction[];
  /** What the buyer was charged per the ledger, and per Stripe. */
  ledgerChargedCents: number;
  stripeChargedCents: number;
  ledgerRefundedCents: number;
  stripeRefundedCents: number;
  /** Stripe's processing cost for the charge (Mode A: the balance transaction fee less Gamo's application fee). */
  processingCostCents: number | null;
  status: 'matched' | 'mismatch' | 'missing_in_stripe' | 'unavailable';
  errorCode: string | null;
}

interface ReconcileOrderRow {
  id: string;
  reference: string;
  funds_flow: FundsFlow | null;
  stripe_account_id: string | null;
  payment_intent_id: string | null;
  checkout_session_id: string | null;
  paid_at: number | null;
}

function gatewayFor(db: SqlDatabase, env: PaidEnv, gateway: StripeGateway | undefined): StripeGateway {
  const g = gateway ?? stripeGatewayFor(db, env);
  if (!g) throw new PaidError('payments_unavailable', { detail: 'stripe_not_configured' });
  return g;
}

/**
 * Each Stripe-paid order of the event: its ledger lines and Stripe's balance transactions (the charge and its
 * refunds). With `record`, the processing cost is written to the ledger (once per balance transaction).
 */
export async function reconcileEvent(
  db: SqlDatabase,
  env: PaidEnv,
  input: { organizationId: string; eventId: string; now: number; record?: boolean; gateway?: StripeGateway },
): Promise<{ lines: ReconciliationLine[]; recorded: number }> {
  await requireEvent(db, input.organizationId, input.eventId);
  const gateway = gatewayFor(db, env, input.gateway);
  const orders = await allRows<ReconcileOrderRow>(db, {
    sql:
      'SELECT id, reference, funds_flow, stripe_account_id, payment_intent_id, checkout_session_id, paid_at FROM orders ' +
      "WHERE event_id = ?1 AND organization_id = ?2 AND is_preview = 0 AND payment_method IN ('card_online', 'phone_qr', 'card_reader') " +
      "AND status IN ('paid', 'partially_refunded', 'refunded', 'paid_unfulfilled') ORDER BY paid_at, id",
    params: [input.eventId, input.organizationId],
  });
  const lines: ReconciliationLine[] = [];
  let recorded = 0;
  for (const order of orders) {
    const ledger = (
      await allRows<{
        entry_type: LedgerEntryType;
        amount_cents: number;
        source_key: string;
        stripe_balance_transaction_id: string | null;
      }>(db, {
        sql:
          'SELECT entry_type, amount_cents, source_key, stripe_balance_transaction_id FROM ledger_entries ' +
          'WHERE order_id = ?1 ORDER BY occurred_at, rowid',
        params: [order.id],
      })
    ).map((r) => ({
      entryType: r.entry_type,
      amountCents: Number(r.amount_cents),
      sourceKey: r.source_key,
      stripeBalanceTransactionId: r.stripe_balance_transaction_id,
    }));
    const ledgerChargedCents = ledger
      .filter((l) => l.sourceKey.startsWith(`order:${order.id}:`))
      .reduce((a, l) => a + l.amountCents, 0);
    const ledgerRefundedCents = ledger
      .filter((l) => l.sourceKey.startsWith('refund:'))
      .reduce((a, l) => a + l.amountCents, 0);
    const applicationFeeCents =
      order.funds_flow === 'organizer_account'
        ? ledger
            .filter((l) => l.sourceKey === `order:${order.id}:gamo_fee`)
            .reduce((a, l) => a + l.amountCents, 0)
        : 0;
    const line: ReconciliationLine = {
      orderId: order.id,
      reference: order.reference,
      fundsFlow: order.funds_flow,
      stripeAccountId: order.stripe_account_id,
      ledger,
      balanceTransactions: [],
      ledgerChargedCents,
      stripeChargedCents: 0,
      ledgerRefundedCents,
      stripeRefundedCents: 0,
      processingCostCents: null,
      status: 'missing_in_stripe',
      errorCode: null,
    };
    const opts = { account: order.stripe_account_id };
    try {
      let paymentIntentId = order.payment_intent_id;
      if (!paymentIntentId && order.checkout_session_id)
        paymentIntentId = (await gateway.retrieveCheckoutSession(order.checkout_session_id, opts))
          .payment_intent;
      const chargeId = paymentIntentId
        ? (await gateway.retrievePaymentIntent(paymentIntentId, opts)).latest_charge
        : null;
      if (chargeId) {
        const refunds = await allRows<{ stripe_refund_id: string }>(db, {
          sql: "SELECT stripe_refund_id FROM refunds WHERE order_id = ?1 AND method = 'stripe' AND stripe_refund_id IS NOT NULL",
          params: [order.id],
        });
        const sources = [chargeId, ...refunds.map((r) => r.stripe_refund_id)];
        for (const source of sources)
          line.balanceTransactions.push(...(await gateway.listBalanceTransactions({ source }, opts)));
        const chargeTxns = line.balanceTransactions.filter((t) => t.source === chargeId);
        line.stripeChargedCents = chargeTxns.reduce((a, t) => a + t.amount, 0);
        line.stripeRefundedCents = line.balanceTransactions
          .filter((t) => t.source !== chargeId)
          .reduce((a, t) => a + t.amount, 0);
        const chargeTxn = chargeTxns.find((t) => t.type === 'charge' || t.type === 'payment');
        if (chargeTxn) {
          line.processingCostCents = Math.max(0, chargeTxn.fee - applicationFeeCents);
          if (input.record && order.funds_flow) {
            const specs = ledgerForProcessingCost({
              orderId: order.id,
              organizationId: input.organizationId,
              eventId: input.eventId,
              fundsFlow: order.funds_flow,
              feeCents: line.processingCostCents,
              balanceTransactionId: chargeTxn.id,
              currency: chargeTxn.currency,
              occurredAt: chargeTxn.created,
            });
            if (specs.length > 0) {
              const already = ledger.some((l) => l.sourceKey === `processing:${chargeTxn.id}`);
              await runBatch(db, specs);
              if (!already) recorded += 1;
            }
          }
        }
        line.status =
          chargeTxn &&
          line.stripeChargedCents === ledgerChargedCents &&
          line.stripeRefundedCents === ledgerRefundedCents
            ? 'matched'
            : chargeTxn
              ? 'mismatch'
              : 'missing_in_stripe';
      }
    } catch (error) {
      line.status = 'unavailable';
      line.errorCode = webhookErrorCode(error);
    }
    lines.push(line);
  }
  return { lines, recorded };
}

export interface PayoutReconciliationLine {
  payoutId: string;
  amountCents: number;
  stripeTransferId: string;
  ledgerCents: number;
  stripeCents: number;
  status: 'matched' | 'mismatch' | 'unavailable';
}

/** Mode B: each sent payout's ledger row next to the transfer's balance transaction on Gamo's account. */
export async function reconcilePayouts(
  db: SqlDatabase,
  env: PaidEnv,
  input: { organizationId: string; gateway?: StripeGateway },
): Promise<PayoutReconciliationLine[]> {
  const gateway = gatewayFor(db, env, input.gateway);
  const payouts = await allRows<{
    id: string;
    amount_cents: number;
    stripe_transfer_id: string;
    ledger: number;
  }>(db, {
    sql:
      'SELECT p.id, p.amount_cents, p.stripe_transfer_id, ' +
      '(SELECT COALESCE(SUM(amount_cents), 0) FROM ledger_entries l WHERE l.payout_id = p.id) AS ledger ' +
      "FROM payouts p WHERE p.organization_id = ?1 AND p.status = 'sent' AND p.stripe_transfer_id IS NOT NULL ORDER BY p.sent_at, p.id",
    params: [input.organizationId],
  });
  const out: PayoutReconciliationLine[] = [];
  for (const p of payouts) {
    try {
      const txns = await gateway.listBalanceTransactions({ source: p.stripe_transfer_id }, { account: null });
      const stripeCents = txns.reduce((a, t) => a + t.amount, 0);
      out.push({
        payoutId: p.id,
        amountCents: p.amount_cents,
        stripeTransferId: p.stripe_transfer_id,
        ledgerCents: Number(p.ledger),
        stripeCents,
        status: stripeCents === Number(p.ledger) && txns.length > 0 ? 'matched' : 'mismatch',
      });
    } catch {
      out.push({
        payoutId: p.id,
        amountCents: p.amount_cents,
        stripeTransferId: p.stripe_transfer_id,
        ledgerCents: Number(p.ledger),
        stripeCents: 0,
        status: 'unavailable',
      });
    }
  }
  return out;
}

// ── Mode B balances ────────────────────────────────────────────────────────────────────────────────────────────

/** What Gamo owes an organization from Gamo-collected sales (can be negative after refunds or disputes). */
export async function owedToOrganization(db: SqlDatabase, organizationId: string): Promise<number> {
  const [row] = await allRows<{ owed: number }>(db, {
    sql: OWED_TO_ORGANIZATION_SQL,
    params: [organizationId],
  });
  return Number(row?.owed ?? 0);
}

export interface ModeBBalance {
  organizationId: string;
  name: string;
  owedCents: number;
  /** Payouts prepared or approved, not yet sent. */
  pendingPayoutCents: number;
}

/** Every organization Gamo holds money for, or has held (balance ≠ 0 or pending payouts). */
export async function modeBBalances(db: SqlDatabase): Promise<ModeBBalance[]> {
  const orgs = await allRows<{ id: string; name: string; pending: number }>(db, {
    sql:
      'SELECT o.id, o.name, (SELECT COALESCE(SUM(amount_cents), 0) FROM payouts p WHERE p.organization_id = o.id ' +
      "AND p.status IN ('prepared', 'approved')) AS pending FROM organizations o WHERE EXISTS (SELECT 1 FROM ledger_entries l " +
      "WHERE l.organization_id = o.id AND l.held_by = 'gamo') ORDER BY o.name, o.id",
    params: [],
  });
  const out: ModeBBalance[] = [];
  for (const o of orgs) {
    const owedCents = await owedToOrganization(db, o.id);
    if (owedCents === 0 && Number(o.pending) === 0) continue;
    out.push({ organizationId: o.id, name: o.name, owedCents, pendingPayoutCents: Number(o.pending) });
  }
  return out;
}

// ── Statements ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface StatementLine {
  occurredAt: number;
  entryType: LedgerEntryType;
  category: LedgerCategory;
  heldBy: HeldBy;
  amountCents: number;
  orderReference: string | null;
  eventId: string | null;
  eventTitle: string | null;
  payoutId: string | null;
  /** False for Gamo's own fee lines (shown for transparency, not part of the organization's balance). */
  toOrganization: boolean;
}

export interface Statement {
  organizationId: string;
  from: number;
  to: number;
  /** The organization's money before `from`, all of it, and the part Gamo holds (Mode B). */
  openingCents: number;
  openingHeldByGamoCents: number;
  lines: StatementLine[];
  closingCents: number;
  closingHeldByGamoCents: number;
  totalsByType: Partial<Record<LedgerEntryType, number>>;
}

/** The ledger of one organization for [from, to), with balances. */
export async function organizationStatement(
  db: SqlDatabase,
  input: { organizationId: string; from: number; to: number },
): Promise<Statement> {
  if (!Number.isInteger(input.from) || !Number.isInteger(input.to) || input.to <= input.from)
    throw new PaidError('invalid', { detail: 'period' });
  const balance = async (before: number) => {
    const [row] = await allRows<{ total: number; gamo: number }>(db, {
      sql:
        `SELECT COALESCE(SUM(CASE WHEN ${TO_ORGANIZATION} THEN amount_cents ELSE 0 END), 0) AS total, ` +
        "COALESCE(SUM(CASE WHEN held_by = 'gamo' AND category <> 'program_service_receipt' AND entry_type <> 'fee_refund' " +
        'THEN amount_cents ELSE 0 END), 0) AS gamo FROM ledger_entries WHERE organization_id = ?1 AND occurred_at < ?2',
      params: [input.organizationId, before],
    });
    return { total: Number(row?.total ?? 0), gamo: Number(row?.gamo ?? 0) };
  };
  const [opening, closing] = await Promise.all([balance(input.from), balance(input.to)]);
  const rows = await allRows<Record<string, unknown>>(db, {
    sql:
      'SELECT l.occurred_at, l.entry_type, l.category, l.held_by, l.amount_cents, l.event_id, l.payout_id, ' +
      'o.reference, e.title FROM ledger_entries l LEFT JOIN orders o ON o.id = l.order_id ' +
      'LEFT JOIN events e ON e.id = l.event_id WHERE l.organization_id = ?1 AND l.occurred_at >= ?2 AND l.occurred_at < ?3 ' +
      'ORDER BY l.occurred_at, l.rowid',
    params: [input.organizationId, input.from, input.to],
  });
  const totalsByType: Partial<Record<LedgerEntryType, number>> = {};
  const lines = rows.map((r): StatementLine => {
    const entryType = r.entry_type as LedgerEntryType;
    const amountCents = Number(r.amount_cents);
    totalsByType[entryType] = (totalsByType[entryType] ?? 0) + amountCents;
    return {
      occurredAt: Number(r.occurred_at),
      entryType,
      category: r.category as LedgerCategory,
      heldBy: r.held_by as HeldBy,
      amountCents,
      orderReference: (r.reference as string | null) ?? null,
      eventId: (r.event_id as string | null) ?? null,
      eventTitle: (r.title as string | null) ?? null,
      payoutId: (r.payout_id as string | null) ?? null,
      toOrganization: !['gamo_fee', 'fee_refund', 'payout'].includes(entryType),
    };
  });
  return {
    organizationId: input.organizationId,
    from: input.from,
    to: input.to,
    openingCents: opening.total,
    openingHeldByGamoCents: opening.gamo,
    lines,
    closingCents: closing.total,
    closingHeldByGamoCents: closing.gamo,
    totalsByType,
  };
}

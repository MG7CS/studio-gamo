/**
 * Mode B payouts (docs/LIVE_REQUIREMENTS.md §8 items 29 and 36, docs/LIVE_PAYMENTS.md §6). Gamo collects ticket money
 * for an organization and pays it out with a Stripe transfer to the organization's connected account.
 *
 * - The admin prepares a payout only for money from events whose dates have all passed (or were canceled), so refunds
 *   and early disputes are settled first, and never more than the balance Gamo owes (`OWED_TO_ORGANIZATION_SQL`)
 *   less payouts already prepared. The check and the insert are one conditional statement, so two preparations cannot
 *   both take the same money.
 * - Sending needs the owner's explicit approval (`ownerApproved: true`) and runs in Stripe test mode only (a live
 *   gateway is refused until the owner approves production). The transfer uses `Idempotency-Key: payout_<id>`; the
 *   ledger's `payout` row is written only after Stripe accepted the transfer. A definite refusal marks the payout
 *   failed; a network error leaves it approved so the same request can be sent again safely.
 */
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import { ledgerForPayout } from './ledger.ts';
import { CURRENCY, PAID_ID_PREFIX, PaidError, type PaidEnv, type PayoutStatus } from './paid-types.ts';
import { paymentDecisionStatement } from './payment-settings.ts';
import { stripeGatewayFor } from './payments/index.ts';
import { readOrganizationPayments } from './payments/resolve.ts';
import { idempotencyKeys } from './payments/shared.ts';
import { StripeApiError, type StripeGateway } from './payments/types.ts';

/** The ledger rows that make up what Gamo owes (same filter as `OWED_TO_ORGANIZATION_SQL`). */
const OWED_ROWS =
  "FROM ledger_entries l WHERE l.organization_id = ?1 AND l.held_by = 'gamo' " +
  "AND l.category <> 'program_service_receipt' AND l.entry_type NOT IN ('fee_refund')";

/** Events of the organization that still have a date ahead (and are not canceled). */
const OPEN_EVENTS =
  "SELECT e.id FROM events e WHERE e.organization_id = ?1 AND e.status <> 'canceled' AND EXISTS (" +
  "SELECT 1 FROM event_occurrences d WHERE d.event_id = e.id AND d.status <> 'canceled' " +
  'AND COALESCE(d.ends_at, d.starts_at) > ?2)';

/**
 * Available to pay out at ?2 (excluding payout ?3 from the pending ones): the lower of what Gamo owes overall and what
 * it owes from settled events (payouts already sent count against both), less payouts prepared or approved.
 */
const AVAILABLE_SQL =
  `MIN((SELECT COALESCE(SUM(l.amount_cents), 0) ${OWED_ROWS}), ` +
  `(SELECT COALESCE(SUM(l.amount_cents), 0) ${OWED_ROWS} AND (l.event_id IS NULL OR l.event_id NOT IN (${OPEN_EVENTS})))) ` +
  "- (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payouts p WHERE p.organization_id = ?1 AND p.status IN ('prepared', 'approved') " +
  'AND p.id IS NOT ?3)';

export interface PayoutAvailability {
  owedCents: number;
  /** Owed from events with dates still ahead (not yet payable). */
  notYetPayableCents: number;
  pendingPayoutCents: number;
  availableCents: number;
}

export async function payoutAvailability(
  db: SqlDatabase,
  input: { organizationId: string; now: number; excludePayoutId?: string | null },
): Promise<PayoutAvailability> {
  const [row] = await allRows<{ owed: number; settled: number; pending: number; available: number }>(db, {
    sql:
      `SELECT (SELECT COALESCE(SUM(l.amount_cents), 0) ${OWED_ROWS}) AS owed, ` +
      `(SELECT COALESCE(SUM(l.amount_cents), 0) ${OWED_ROWS} AND (l.event_id IS NULL OR l.event_id NOT IN (${OPEN_EVENTS}))) AS settled, ` +
      "(SELECT COALESCE(SUM(p.amount_cents), 0) FROM payouts p WHERE p.organization_id = ?1 AND p.status IN ('prepared', 'approved') AND p.id IS NOT ?3) AS pending, " +
      `${AVAILABLE_SQL} AS available`,
    params: [input.organizationId, input.now, input.excludePayoutId ?? null],
  });
  const owed = Number(row?.owed ?? 0);
  return {
    owedCents: owed,
    notYetPayableCents: owed - Number(row?.settled ?? 0),
    pendingPayoutCents: Number(row?.pending ?? 0),
    availableCents: Math.max(0, Number(row?.available ?? 0)),
  };
}

function cleanNote(note: unknown): string {
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length < 1 || text.length > 500) throw new PaidError('invalid', { detail: 'reason' });
  return text;
}

/** Prepares a payout (default: everything available). Throws `limit_exceeded` above the available amount. */
export async function preparePayout(
  db: SqlDatabase,
  input: { organizationId: string; amountCents?: number; reason: string; now: number },
): Promise<{ payoutId: string; amountCents: number }> {
  const reason = cleanNote(input.reason);
  const [org] = await allRows(db, {
    sql: 'SELECT id FROM organizations WHERE id = ?1',
    params: [input.organizationId],
  });
  if (!org) throw new PaidError('not_found');
  const availability = await payoutAvailability(db, { organizationId: input.organizationId, now: input.now });
  const amount = input.amountCents ?? availability.availableCents;
  if (!Number.isInteger(amount) || amount < 1) {
    if (input.amountCents === undefined)
      throw new PaidError('limit_exceeded', { detail: 'nothing_available' });
    throw new PaidError('invalid', { detail: 'amount' });
  }
  const id = newPrefixedId(PAID_ID_PREFIX.payout);
  const [inserted] = await runBatch(db, [
    {
      sql:
        'INSERT INTO payouts (id, organization_id, amount_cents, currency, status, note, prepared_at, updated_at) ' +
        `SELECT ?4, ?1, ?5, '${CURRENCY}', 'prepared', ?6, ?2, ?2 WHERE ?5 <= (${AVAILABLE_SQL}) RETURNING id`,
      params: [input.organizationId, input.now, null, id, amount, reason],
    },
    {
      // Recorded only when the payout was inserted.
      sql:
        'INSERT INTO payment_decisions (id, subject, organization_id, old_value, new_value, reason, decided_at) ' +
        "SELECT ?1, 'payout', ?2, NULL, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM payouts WHERE id = ?6)",
      params: [
        newPrefixedId(PAID_ID_PREFIX.paymentDecision),
        input.organizationId,
        JSON.stringify({ payoutId: id, amountCents: amount, status: 'prepared' }),
        reason,
        input.now,
        id,
      ],
    },
  ]);
  if (!inserted || inserted.length === 0)
    throw new PaidError('limit_exceeded', { detail: 'above_available' });
  return { payoutId: id, amountCents: amount };
}

/** Cancels a payout that has not been sent. */
export async function cancelPayout(
  db: SqlDatabase,
  input: { payoutId: string; reason: string; now: number },
): Promise<void> {
  const reason = cleanNote(input.reason);
  const [row] = await allRows<{ organization_id: string; amount_cents: number }>(db, {
    sql:
      "UPDATE payouts SET status = 'canceled', updated_at = ?2 WHERE id = ?1 AND status = 'prepared' " +
      'RETURNING organization_id, amount_cents',
    params: [input.payoutId, input.now],
  });
  if (!row) throw new PaidError('stale');
  await runBatch(db, [
    paymentDecisionStatement('payout', {
      organizationId: row.organization_id,
      oldValue: JSON.stringify({ payoutId: input.payoutId, status: 'prepared' }),
      newValue: JSON.stringify({ payoutId: input.payoutId, status: 'canceled' }),
      reason,
      now: input.now,
    }),
  ]);
}

/** The one Stripe-paid order behind a payout, when exactly one charge covers it (for `source_transaction`). */
async function singleSourceCharge(
  db: SqlDatabase,
  gateway: StripeGateway,
  organizationId: string,
  amountCents: number,
): Promise<{ orderId: string; chargeId: string } | null> {
  const orders = await allRows<{ order_id: string; payment_intent_id: string | null; total: number }>(db, {
    sql:
      'SELECT l.order_id, o.payment_intent_id, o.total_cents AS total FROM ledger_entries l JOIN orders o ON o.id = l.order_id ' +
      "WHERE l.organization_id = ?1 AND l.held_by = 'gamo' AND l.category <> 'program_service_receipt' " +
      "AND l.entry_type NOT IN ('fee_refund') GROUP BY l.order_id HAVING SUM(l.amount_cents) > 0 LIMIT 2",
    params: [organizationId],
  });
  if (orders.length !== 1 || !orders[0].payment_intent_id || orders[0].total < amountCents) return null;
  const intent = await gateway.retrievePaymentIntent(orders[0].payment_intent_id, { account: null });
  return intent.latest_charge ? { orderId: orders[0].order_id, chargeId: intent.latest_charge } : null;
}

/**
 * Sends a prepared payout. Refuses unless `ownerApproved === true`, and refuses a live-mode gateway (test mode only
 * until the owner approves production).
 */
export async function approveAndSendPayout(
  db: SqlDatabase,
  env: PaidEnv,
  input: { payoutId: string; ownerApproved: boolean; now: number; gateway?: StripeGateway },
): Promise<{ status: 'sent'; stripeTransferId: string }> {
  if (input.ownerApproved !== true) throw new PaidError('forbidden', { detail: 'owner_approval_required' });
  const gateway = input.gateway ?? stripeGatewayFor(db, env);
  if (!gateway) throw new PaidError('payments_unavailable', { detail: 'stripe_not_configured' });
  if (gateway.livemode) throw new PaidError('forbidden', { detail: 'live_mode' });

  const [payout] = await allRows<{ organization_id: string; amount_cents: number; status: PayoutStatus }>(
    db,
    {
      sql: 'SELECT organization_id, amount_cents, status FROM payouts WHERE id = ?1',
      params: [input.payoutId],
    },
  );
  if (!payout) throw new PaidError('not_found');
  if (payout.status !== 'prepared' && payout.status !== 'approved')
    throw new PaidError('stale', { detail: payout.status });
  const account = await readOrganizationPayments(db, payout.organization_id);
  if (!account?.connectedAccountId || !account.payoutsEnabled) throw new PaidError('account_not_ready');
  const availability = await payoutAvailability(db, {
    organizationId: payout.organization_id,
    now: input.now,
    excludePayoutId: input.payoutId,
  });
  if (payout.amount_cents > availability.availableCents)
    throw new PaidError('limit_exceeded', { detail: 'above_available' });

  // Approve (once): from here the transfer may be sent, and re-sent with the same idempotency key.
  if (payout.status === 'prepared') {
    const [approved] = await runBatch(db, [
      {
        sql: "UPDATE payouts SET status = 'approved', approved_at = ?2, updated_at = ?2 WHERE id = ?1 AND status = 'prepared' RETURNING id",
        params: [input.payoutId, input.now],
      },
      {
        sql:
          'INSERT INTO payment_decisions (id, subject, organization_id, old_value, new_value, reason, decided_at) ' +
          "SELECT ?1, 'payout', ?2, ?3, ?4, 'Owner approved sending this payout.', ?5 " +
          "WHERE EXISTS (SELECT 1 FROM payouts WHERE id = ?6 AND status = 'approved' AND approved_at = ?5)",
        params: [
          newPrefixedId(PAID_ID_PREFIX.paymentDecision),
          payout.organization_id,
          JSON.stringify({ payoutId: input.payoutId, status: 'prepared' }),
          JSON.stringify({ payoutId: input.payoutId, status: 'approved', amountCents: payout.amount_cents }),
          input.now,
          input.payoutId,
        ],
      },
    ]);
    if (!approved || approved.length === 0) throw new PaidError('stale');
  }

  let transferId: string;
  try {
    const source = await singleSourceCharge(db, gateway, payout.organization_id, payout.amount_cents);
    const transfer = await gateway.createTransfer(
      {
        amountCents: payout.amount_cents,
        currency: CURRENCY,
        destination: account.connectedAccountId,
        transferGroup: source?.orderId ?? `payout_${input.payoutId}`,
        ...(source ? { sourceTransaction: source.chargeId } : {}),
        metadata: { payout_id: input.payoutId, organization_id: payout.organization_id },
      },
      { account: null, idempotencyKey: idempotencyKeys.payout(input.payoutId) },
    );
    transferId = transfer.id;
  } catch (error) {
    if (error instanceof StripeApiError && error.definite) {
      await runBatch(db, [
        {
          sql: "UPDATE payouts SET status = 'failed', updated_at = ?2 WHERE id = ?1 AND status = 'approved'",
          params: [input.payoutId, input.now],
        },
      ]);
      throw new PaidError('stripe_error', { detail: error.stripeCode ?? `status_${error.status}` });
    }
    throw new PaidError('stripe_error', { detail: 'retry' });
  }

  const [sent] = await runBatch(db, [
    {
      sql:
        "UPDATE payouts SET status = 'sent', stripe_transfer_id = ?2, sent_at = ?3, updated_at = ?3 " +
        "WHERE id = ?1 AND status = 'approved' RETURNING id",
      params: [input.payoutId, transferId, input.now],
    },
    ...ledgerForPayout({
      payoutId: input.payoutId,
      organizationId: payout.organization_id,
      amountCents: payout.amount_cents,
      currency: CURRENCY,
      occurredAt: input.now,
    }).map((spec) => guardOnSent(spec, input.payoutId, transferId)),
  ]);
  if (!sent || sent.length === 0) {
    // Another request already recorded this payout as sent with the same transfer (idempotent).
    const [row] = await allRows<{ status: PayoutStatus; stripe_transfer_id: string | null }>(db, {
      sql: 'SELECT status, stripe_transfer_id FROM payouts WHERE id = ?1',
      params: [input.payoutId],
    });
    if (row?.status === 'sent' && row.stripe_transfer_id === transferId)
      return { status: 'sent', stripeTransferId: transferId };
    throw new PaidError('stale');
  }
  return { status: 'sent', stripeTransferId: transferId };
}

/** Makes a ledger insert conditional on the payout being `sent` with this transfer, inside the same batch. */
function guardOnSent(spec: SqlStatementSpec, payoutId: string, transferId: string): SqlStatementSpec {
  const n = spec.params.length;
  const sql = spec.sql
    .replace(') VALUES (', ') SELECT ')
    .replace(
      ') ON CONFLICT',
      ` WHERE EXISTS (SELECT 1 FROM payouts WHERE id = ?${n + 1} AND status = 'sent' AND stripe_transfer_id = ?${n + 2}) ON CONFLICT`,
    );
  if (sql === spec.sql || !sql.includes('WHERE EXISTS'))
    throw new Error('guardOnSent: unexpected ledger statement');
  return { sql, params: [...spec.params, payoutId, transferId] };
}

export interface PayoutRow {
  id: string;
  organizationId: string;
  amountCents: number;
  status: PayoutStatus;
  stripeTransferId: string | null;
  note: string | null;
  preparedAt: number;
  approvedAt: number | null;
  sentAt: number | null;
}

export async function listPayouts(
  db: SqlDatabase,
  filter: { organizationId?: string } = {},
): Promise<PayoutRow[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql:
      'SELECT id, organization_id, amount_cents, status, stripe_transfer_id, note, prepared_at, approved_at, sent_at ' +
      'FROM payouts WHERE (?1 IS NULL OR organization_id = ?1) ORDER BY prepared_at DESC, id',
    params: [filter.organizationId ?? null],
  });
  return rows.map((r) => ({
    id: String(r.id),
    organizationId: String(r.organization_id),
    amountCents: Number(r.amount_cents),
    status: r.status as PayoutStatus,
    stripeTransferId: (r.stripe_transfer_id as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    preparedAt: Number(r.prepared_at),
    approvedAt: (r.approved_at as number | null) ?? null,
    sentAt: (r.sent_at as number | null) ?? null,
  }));
}

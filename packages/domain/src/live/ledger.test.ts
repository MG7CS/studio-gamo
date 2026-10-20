import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBatch } from '../security/sql-database.ts';
import {
  OWED_TO_ORGANIZATION_SQL,
  ledgerForDispute,
  ledgerForPaidOrder,
  ledgerForPayout,
  ledgerForProcessingCost,
  ledgerForRefund,
} from './ledger.ts';
import { PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';

async function setup(status: 'paid' | 'pending' = 'paid') {
  const { d1, db } = await paidTestDatabase();
  const ids = seedPaidEvent(d1, { flow: 'gamo_collects' });
  d1.sqlite
    .exec(`INSERT INTO orders (id, reference, event_id, occurrence_id, organization_id, channel, payment_method,
      status, funds_flow, seller, subtotal_cents, discount_cents, fee_cents, fee_payer, gift_cents, total_cents,
      policy_snapshot, fee_snapshot)
    VALUES ('ord_1', 'GL-2222-3333', '${ids.eventId}', '${ids.occurrenceId}', '${ids.organizationId}', 'online',
      'card_online', '${status}', 'gamo_collects', 'gamo', 6000, 0, 330, 'organizer', 1000, 7000, '{}', '{}')`);
  return { d1, db, ids };
}

const order = (ids: { organizationId: string; eventId: string }, patch = {}) => ({
  orderId: 'ord_1',
  organizationId: ids.organizationId,
  eventId: ids.eventId,
  fundsFlow: 'gamo_collects' as const,
  paymentMethod: 'card_online' as const,
  isPreview: false,
  subtotalCents: 6000,
  discountCents: 0,
  feeCents: 330,
  feePayer: 'organizer' as const,
  giftCents: 1000,
  currency: 'usd',
  occurredAt: PAID_NOW,
  ...patch,
});

const owed = async (db: Awaited<ReturnType<typeof setup>>['db'], org: string) =>
  ((await runBatch(db, [{ sql: OWED_TO_ORGANIZATION_SQL, params: [org] }]))[0][0] as { owed: number }).owed;

test('a paid Mode B order: ticket money and gift owed, absorbed fee taken from it, written once', async () => {
  const { d1, db, ids } = await setup();
  await runBatch(db, ledgerForPaidOrder(order(ids)));
  await runBatch(db, ledgerForPaidOrder(order(ids))); // a duplicate webhook writes nothing more
  const rows = d1.sqlite
    .prepare('SELECT entry_type, category, held_by, amount_cents FROM ledger_entries ORDER BY amount_cents')
    .all()
    .map((r) => ({ ...r }));
  assert.deepEqual(rows, [
    { entry_type: 'ticket_sale', category: 'third_party_payable', held_by: 'gamo', amount_cents: -330 },
    { entry_type: 'gamo_fee', category: 'program_service_receipt', held_by: 'gamo', amount_cents: 330 },
    { entry_type: 'gift', category: 'third_party_payable', held_by: 'gamo', amount_cents: 1000 },
    { entry_type: 'ticket_sale', category: 'third_party_payable', held_by: 'gamo', amount_cents: 6000 },
  ]);
  assert.equal(await owed(db, ids.organizationId), 6000 - 330 + 1000);
});

test('the guard writes nothing while the order is not paid; previews never count', async () => {
  const { d1, db, ids } = await setup('pending');
  await runBatch(db, ledgerForPaidOrder(order(ids)));
  assert.equal(d1.sqlite.prepare('SELECT count(*) AS n FROM ledger_entries').get()!.n, 0);
  assert.deepEqual(ledgerForPaidOrder(order(ids, { isPreview: true })), []);
});

test('cash is held by the organization, with no fee; Mode A money is held by the organization too', async () => {
  const { d1, db, ids } = await setup();
  await runBatch(db, ledgerForPaidOrder(order(ids, { paymentMethod: 'cash', fundsFlow: null, feeCents: 0 })));
  const rows = d1.sqlite.prepare('SELECT entry_type, held_by FROM ledger_entries ORDER BY entry_type').all();
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    [
      { entry_type: 'cash_sale', held_by: 'organization' },
      { entry_type: 'gift', held_by: 'organization' },
    ],
  );
  assert.equal(await owed(db, ids.organizationId), 0, 'Gamo owes nothing for cash');
  const modeA = ledgerForPaidOrder(order(ids, { fundsFlow: 'organizer_account' }));
  assert.ok(modeA.every((s) => s.params.includes('organization') || s.params.includes('gamo')));
});

test('refunds, disputes, processing costs and payouts bring the balance owed back to what is real', async () => {
  const { d1, db, ids } = await setup();
  d1.sqlite
    .exec(`INSERT INTO refunds (id, order_id, amount_cents, gift_cents, fee_cents, method, requested_by, status)
      VALUES ('rfd_1', 'ord_1', 7000, 1000, 330, 'stripe', 'organizer', 'succeeded');
    INSERT INTO disputes (id, order_id, stripe_dispute_id, amount_cents, status) VALUES ('dsp_1', 'ord_1', 'du_1', 500, 'won')`);
  await runBatch(db, ledgerForPaidOrder(order(ids)));
  // Full refund of the absorbed-fee order: tickets, gift and the fee reversal.
  await runBatch(
    db,
    ledgerForRefund({
      refundId: 'rfd_1',
      orderId: 'ord_1',
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      fundsFlow: 'gamo_collects',
      method: 'stripe',
      amountCents: 7000,
      giftCents: 1000,
      feeCents: 330,
      feeAbsorbed: true,
      currency: 'usd',
      occurredAt: PAID_NOW + 10,
    }),
  );
  assert.equal(await owed(db, ids.organizationId), 0);
  await runBatch(db, [
    ...ledgerForDispute({
      disputeId: 'dsp_1',
      orderId: 'ord_1',
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      fundsFlow: 'gamo_collects',
      amountCents: 500,
      phase: 'opened',
      currency: 'usd',
      occurredAt: PAID_NOW + 20,
    }),
    ...ledgerForDispute({
      disputeId: 'dsp_1',
      orderId: 'ord_1',
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      fundsFlow: 'gamo_collects',
      amountCents: 500,
      phase: 'won',
      currency: 'usd',
      occurredAt: PAID_NOW + 30,
    }),
    ...ledgerForProcessingCost({
      orderId: 'ord_1',
      organizationId: ids.organizationId,
      eventId: ids.eventId,
      fundsFlow: 'gamo_collects',
      feeCents: 233,
      balanceTransactionId: 'txn_1',
      currency: 'usd',
      occurredAt: PAID_NOW + 1,
    }),
  ]);
  assert.equal(await owed(db, ids.organizationId), -233);
  assert.equal(
    ledgerForPayout({
      payoutId: 'pyo_1',
      organizationId: ids.organizationId,
      amountCents: 100,
      currency: 'usd',
      occurredAt: PAID_NOW,
    })[0].params.includes(-100),
    true,
  );
});

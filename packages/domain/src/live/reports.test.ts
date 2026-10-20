import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { ledgerForRefund } from './ledger.ts';
import { PAID_ENV, PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import { createModeARouting } from './payments/mode-a.ts';
import { createModeBRouting } from './payments/mode-b.ts';
import { insertPaidOrder } from './payments/money-testing.ts';
import { createStandinGateway, standinCompleteCheckout, standinProcessingFee } from './payments/standin.ts';
import {
  modeBBalances,
  organizationStatement,
  owedToOrganization,
  reconcileEvent,
  reconcilePayouts,
  salesByDate,
  salesSummary,
} from './reports.ts';

async function refund(
  db: SqlDatabase,
  r: {
    id: string;
    orderId: string;
    amount: number;
    gift: number;
    fee: number;
    flow: 'organizer_account' | 'gamo_collects';
    stripeRefundId?: string;
    at: number;
  },
) {
  await runBatch(db, [
    {
      sql: "INSERT INTO refunds (id, order_id, amount_cents, gift_cents, fee_cents, method, requested_by, status, stripe_refund_id) VALUES (?1, ?2, ?3, ?4, ?5, 'stripe', 'organizer', 'succeeded', ?6)",
      params: [r.id, r.orderId, r.amount, r.gift, r.fee, r.stripeRefundId ?? null],
    },
    {
      sql: "UPDATE orders SET status = 'partially_refunded', amount_refunded_cents = ?2 WHERE id = ?1",
      params: [r.orderId, r.amount],
    },
    ...ledgerForRefund({
      refundId: r.id,
      orderId: r.orderId,
      organizationId: 'org_1',
      eventId: 'evt_1',
      fundsFlow: r.flow,
      method: 'stripe',
      amountCents: r.amount,
      giftCents: r.gift,
      feeCents: r.fee,
      feeAbsorbed: false,
      currency: 'usd',
      occurredAt: r.at,
    }),
  ]);
}

test('sales summary from the ledger: types, gross, discounts, fee, gifts, refunds, net, door by method; previews excluded', async () => {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1, { flow: 'organizer_account' });
  const t = PAID_NOW;
  await insertPaidOrder(db, {
    orderId: 'ord_a',
    flow: 'organizer_account',
    method: 'card_online',
    quantity: 2,
    unitCents: 2000,
    feeCents: 100,
    giftCents: 500,
    stripeAccountId: 'acct_test_1',
    paidAt: t,
  });
  await insertPaidOrder(db, {
    orderId: 'ord_b',
    flow: null,
    method: 'cash',
    quantity: 1,
    unitCents: 5000,
    ticketTypeId: 'tty_vip_1',
    name: 'VIP',
    paidAt: t,
  });
  await insertPaidOrder(db, {
    orderId: 'ord_c',
    flow: null,
    method: 'comp',
    quantity: 1,
    unitCents: 0,
    ticketTypeId: 'tty_vip_1',
    name: 'VIP',
    paidAt: t,
  });
  await insertPaidOrder(db, {
    orderId: 'ord_d',
    flow: 'organizer_account',
    method: 'card_online',
    quantity: 3,
    unitCents: 2000,
    isPreview: true,
    stripeAccountId: 'acct_test_1',
    paidAt: t,
  });
  await insertPaidOrder(db, {
    orderId: 'ord_e',
    flow: 'organizer_account',
    method: 'card_online',
    quantity: 1,
    unitCents: 2000,
    discountCents: 500,
    feeCents: 200,
    feePayer: 'organizer',
    stripeAccountId: 'acct_test_1',
    paidAt: t,
  });
  await refund(db, {
    id: 'rfd_1',
    orderId: 'ord_a',
    amount: 2050,
    gift: 0,
    fee: 50,
    flow: 'organizer_account',
    at: t + 10,
  });

  const s = await salesSummary(db, { organizationId: 'org_1', eventId: 'evt_1' });
  assert.deepEqual(
    s.types.map((x) => [x.name, x.quantity, x.ticketCents]),
    [
      ['General', 3, 5500],
      ['VIP', 2, 5000],
    ],
  );
  assert.equal(s.ticketsSold, 5);
  assert.equal(s.ticketSalesCents, 10_500);
  assert.equal(s.discountCents, 500);
  assert.equal(s.grossCents, 11_000);
  assert.equal(s.gamoFeeCents, 250);
  assert.equal(s.feeAbsorbedCents, -200);
  assert.equal(s.giftsCents, 500);
  assert.equal(s.refundsCents, -2000);
  assert.equal(s.disputesCents, 0);
  assert.equal(s.processingCostCents, 0);
  assert.equal(s.netToOrganizationCents, 8800);
  assert.deepEqual(s.doorByMethod, [
    { method: 'cash', orders: 1, amountCents: 5000 },
    { method: 'comp', orders: 1, amountCents: 0 },
  ]);
  const byDate = await salesByDate(db, { organizationId: 'org_1', eventId: 'evt_1' });
  assert.equal(byDate.length, 1);
  assert.equal(byDate[0].netToOrganizationCents, 8800);
  assert.equal(byDate[0].occurrenceId, 'occ_1');
  await assert.rejects(salesSummary(db, { organizationId: 'org_other', eventId: 'evt_1' }), {
    code: 'not_found',
  });
});

test('reconciliation (Mode A): ledger next to Stripe balance transactions; processing cost recorded once, net of the application fee', async () => {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1, { flow: 'organizer_account' });
  const gateway = createStandinGateway(db, PAID_ENV, undefined, {
    clock: () => PAID_NOW,
    deferredDelivery: 'manual',
  });
  const routing = createModeARouting(gateway, 'acct_test_1');
  const session = await routing.createCheckout({
    orderId: 'ord_a',
    orderReference: 'GL-AAAA-TEST',
    eventTitle: 'Gospel Night 1',
    lines: [
      { name: 'General', unitAmountCents: 2000, quantity: 2 },
      { name: 'Gamo fee', unitAmountCents: 100, quantity: 1 },
      { name: 'Gift', unitAmountCents: 500, quantity: 1 },
    ],
    customerEmail: null,
    successUrl: '/s',
    cancelUrl: '/c',
    expiresAt: PAID_NOW + 31 * 60,
    gamoFeeCents: 100,
  });
  const paid = await standinCompleteCheckout(db, PAID_ENV, session.id, 'paid', PAID_NOW);
  await insertPaidOrder(db, {
    orderId: 'ord_a',
    flow: 'organizer_account',
    method: 'card_online',
    quantity: 2,
    unitCents: 2000,
    feeCents: 100,
    giftCents: 500,
    stripeAccountId: 'acct_test_1',
    checkoutSessionId: session.id,
    paidAt: PAID_NOW,
  });
  await insertPaidOrder(db, {
    orderId: 'ord_b',
    flow: null,
    method: 'cash',
    quantity: 1,
    unitCents: 5000,
    paidAt: PAID_NOW,
  });

  const first = await reconcileEvent(db, PAID_ENV, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    now: PAID_NOW,
    record: true,
    gateway,
  });
  assert.equal(first.lines.length, 1, 'cash orders are not reconciled against Stripe');
  const [line] = first.lines;
  assert.equal(line.status, 'matched');
  assert.equal(line.ledgerChargedCents, 4600);
  assert.equal(line.stripeChargedCents, 4600);
  assert.equal(line.processingCostCents, standinProcessingFee(4600, 'online'));
  assert.equal(first.recorded, 1);
  const again = await reconcileEvent(db, PAID_ENV, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    now: PAID_NOW,
    record: true,
    gateway,
  });
  assert.equal(again.recorded, 0);
  const processing = d1.sqlite
    .prepare("SELECT amount_cents, held_by FROM ledger_entries WHERE entry_type = 'processing_cost'")
    .all();
  assert.deepEqual(
    processing.map((r) => ({ ...r })),
    [{ amount_cents: -standinProcessingFee(4600, 'online'), held_by: 'organization' }],
  );
  assert.equal(
    (await salesSummary(db, { organizationId: 'org_1', eventId: 'evt_1' })).processingCostCents,
    -standinProcessingFee(4600, 'online'),
  );

  // A refund through Stripe and in the ledger still matches; one only in the ledger does not.
  const stripeRefund = await routing.refund({
    refundId: 'rfd_1',
    orderId: 'ord_a',
    paymentIntentId: String(paid.session.payment_intent),
    amountCents: 2050,
    refundFee: true,
  });
  await refund(db, {
    id: 'rfd_1',
    orderId: 'ord_a',
    amount: 2050,
    gift: 0,
    fee: 50,
    flow: 'organizer_account',
    stripeRefundId: stripeRefund.id,
    at: PAID_NOW + 5,
  });
  let r = await reconcileEvent(db, PAID_ENV, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    now: PAID_NOW,
    gateway,
  });
  assert.equal(r.lines[0].status, 'matched');
  assert.equal(r.lines[0].stripeRefundedCents, -2050);
  await refund(db, {
    id: 'rfd_2',
    orderId: 'ord_a',
    amount: 100,
    gift: 0,
    fee: 0,
    flow: 'organizer_account',
    at: PAID_NOW + 6,
  });
  r = await reconcileEvent(db, PAID_ENV, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    now: PAID_NOW,
    gateway,
  });
  assert.equal(r.lines[0].status, 'mismatch');
  // Stripe unreachable: shown as unavailable, never as a match.
  d1.sqlite.exec(
    `UPDATE orders SET checkout_session_id = NULL, payment_intent_id = 'pi_test_unknown' WHERE id = 'ord_a'`,
  );
  r = await reconcileEvent(db, PAID_ENV, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    now: PAID_NOW,
    gateway,
  });
  assert.equal(r.lines[0].status, 'unavailable');
  assert.equal(r.lines[0].errorCode, 'stripe_404_resource_missing');
});

test('Mode B: owed balance excludes the Gamo fee and counts refunds and processing; balances list matches', async () => {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1, { flow: 'gamo_collects' });
  seedPaidEvent(d1, { flow: 'organizer_account' }, '2');
  d1.sqlite.exec(
    `UPDATE organization_payments SET funds_flow_override = 'gamo_collects' WHERE organization_id = 'org_1'`,
  );
  const gateway = createStandinGateway(db, PAID_ENV, undefined, {
    clock: () => PAID_NOW,
    deferredDelivery: 'manual',
  });
  const session = await createModeBRouting(gateway, 'acct_test_1').createCheckout({
    orderId: 'ord_m',
    orderReference: 'GL-MMMM-TEST',
    eventTitle: 'Gospel Night 1',
    lines: [
      { name: 'General', unitAmountCents: 2000, quantity: 3 },
      { name: 'Gamo fee', unitAmountCents: 150, quantity: 1 },
    ],
    customerEmail: null,
    successUrl: '/s',
    cancelUrl: '/c',
    expiresAt: PAID_NOW + 31 * 60,
    gamoFeeCents: 150,
  });
  const paid = await standinCompleteCheckout(db, PAID_ENV, session.id, 'paid', PAID_NOW);
  await insertPaidOrder(db, {
    orderId: 'ord_m',
    flow: 'gamo_collects',
    method: 'card_online',
    quantity: 3,
    unitCents: 2000,
    feeCents: 150,
    paymentIntentId: String(paid.session.payment_intent),
    paidAt: PAID_NOW,
  });
  assert.equal(await owedToOrganization(db, 'org_1'), 6000);
  const rec = await reconcileEvent(db, PAID_ENV, {
    organizationId: 'org_1',
    eventId: 'evt_1',
    now: PAID_NOW,
    record: true,
    gateway,
  });
  assert.equal(rec.lines[0].status, 'matched');
  assert.equal(
    rec.lines[0].processingCostCents,
    standinProcessingFee(6150, 'online'),
    'Mode B: the whole fee is processing',
  );
  await refund(db, {
    id: 'rfd_m',
    orderId: 'ord_m',
    amount: 2000,
    gift: 0,
    fee: 0,
    flow: 'gamo_collects',
    at: PAID_NOW + 1,
  });
  const owed = 6000 - standinProcessingFee(6150, 'online') - 2000;
  assert.equal(await owedToOrganization(db, 'org_1'), owed);
  assert.deepEqual(await modeBBalances(db), [
    { organizationId: 'org_1', name: 'Grace Church 1', owedCents: owed, pendingPayoutCents: 0 },
  ]);
  assert.deepEqual(await reconcilePayouts(db, PAID_ENV, { organizationId: 'org_1', gateway }), []);
});

test('statement: opening and closing balances, lines with references, Gamo fee shown but not counted', async () => {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1, { flow: 'gamo_collects' });
  await insertPaidOrder(db, {
    orderId: 'ord_1',
    flow: 'gamo_collects',
    method: 'card_online',
    quantity: 1,
    unitCents: 2000,
    feeCents: 100,
    paidAt: PAID_NOW - 100,
  });
  await insertPaidOrder(db, {
    orderId: 'ord_2',
    flow: 'gamo_collects',
    method: 'card_online',
    quantity: 2,
    unitCents: 2000,
    giftCents: 300,
    paidAt: PAID_NOW + 100,
  });
  await insertPaidOrder(db, {
    orderId: 'ord_3',
    flow: null,
    method: 'cash',
    quantity: 1,
    unitCents: 2000,
    paidAt: PAID_NOW + 200,
  });
  const s = await organizationStatement(db, { organizationId: 'org_1', from: PAID_NOW, to: PAID_NOW + 1000 });
  assert.equal(s.openingCents, 2000);
  assert.equal(s.openingHeldByGamoCents, 2000);
  assert.equal(s.closingCents, 2000 + 4300 + 2000);
  assert.equal(s.closingHeldByGamoCents, 2000 + 4300);
  assert.deepEqual(
    s.lines.map((l) => [l.entryType, l.amountCents, l.heldBy, l.toOrganization]),
    [
      ['ticket_sale', 4000, 'gamo', true],
      ['gift', 300, 'gamo', true],
      ['cash_sale', 2000, 'organization', true],
    ],
  );
  assert.equal(s.lines[0].eventTitle, 'Gospel Night 1');
  assert.ok(s.lines[0].orderReference);
  assert.equal(s.totalsByType.ticket_sale, 4000);
  const early = await organizationStatement(db, {
    organizationId: 'org_1',
    from: PAID_NOW - 1000,
    to: PAID_NOW,
  });
  assert.deepEqual(
    early.lines.map((l) => [l.entryType, l.toOrganization]),
    [
      ['ticket_sale', true],
      ['gamo_fee', false],
    ],
  );
  await assert.rejects(organizationStatement(db, { organizationId: 'org_1', from: 10, to: 10 }), {
    code: 'invalid',
  });
});

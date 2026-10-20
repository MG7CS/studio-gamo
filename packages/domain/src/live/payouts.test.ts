import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAID_ENV, PAID_NOW, paidTestDatabase, seedPaidEvent } from './paid-testing.ts';
import { createModeBRouting } from './payments/mode-b.ts';
import { insertPaidOrder } from './payments/money-testing.ts';
import { createStandinGateway, standinCompleteCheckout, standinEvents } from './payments/standin.ts';
import { createStripeHttpGateway } from './payments/stripe-http.ts';
import { StripeApiError, type StripeGateway } from './payments/types.ts';
import {
  approveAndSendPayout,
  cancelPayout,
  listPayouts,
  payoutAvailability,
  preparePayout,
} from './payouts.ts';
import { owedToOrganization, reconcilePayouts } from './reports.ts';

const AFTER = PAID_NOW + 30 * 86_400 + 3 * 3600 + 1;

async function setup() {
  const { d1, db } = await paidTestDatabase();
  seedPaidEvent(d1, { flow: 'gamo_collects' });
  const gateway = createStandinGateway(db, PAID_ENV, undefined, {
    clock: () => AFTER,
    deferredDelivery: 'manual',
  });
  const session = await createModeBRouting(gateway, 'acct_test_1').createCheckout({
    orderId: 'ord_1',
    orderReference: 'GL-AAAA-TEST',
    eventTitle: 'Gospel Night 1',
    lines: [{ name: 'General', unitAmountCents: 2000, quantity: 3 }],
    customerEmail: null,
    successUrl: '/s',
    cancelUrl: '/c',
    expiresAt: AFTER + 31 * 60,
    gamoFeeCents: 0,
  });
  const paid = await standinCompleteCheckout(db, PAID_ENV, session.id, 'paid', PAID_NOW);
  await insertPaidOrder(db, {
    orderId: 'ord_1',
    flow: 'gamo_collects',
    method: 'card_online',
    quantity: 3,
    unitCents: 2000,
    paymentIntentId: String(paid.session.payment_intent),
    paidAt: PAID_NOW,
  });
  return { d1, db, gateway };
}

test('prepare: only after the event dates have passed, never above what is owed less pending payouts', async () => {
  const { d1, db } = await setup();
  await assert.rejects(preparePayout(db, { organizationId: 'org_1', reason: 'Payout', now: PAID_NOW }), {
    code: 'limit_exceeded',
  });
  assert.deepEqual(await payoutAvailability(db, { organizationId: 'org_1', now: PAID_NOW }), {
    owedCents: 6000,
    notYetPayableCents: 6000,
    pendingPayoutCents: 0,
    availableCents: 0,
  });
  await assert.rejects(
    preparePayout(db, { organizationId: 'org_1', amountCents: 6001, reason: 'Payout', now: AFTER }),
    { code: 'limit_exceeded' },
  );
  await assert.rejects(
    preparePayout(db, { organizationId: 'org_1', amountCents: 10, reason: '', now: AFTER }),
    { code: 'invalid' },
  );
  const a = await preparePayout(db, {
    organizationId: 'org_1',
    amountCents: 4000,
    reason: 'First part',
    now: AFTER,
  });
  const b = await preparePayout(db, { organizationId: 'org_1', reason: 'The rest', now: AFTER });
  assert.equal(b.amountCents, 2000);
  await assert.rejects(preparePayout(db, { organizationId: 'org_1', reason: 'More', now: AFTER }), {
    code: 'limit_exceeded',
  });
  assert.deepEqual(
    (await listPayouts(db, { organizationId: 'org_1' })).map((p) => p.status),
    ['prepared', 'prepared'],
  );
  await cancelPayout(db, { payoutId: b.payoutId, reason: 'Not now', now: AFTER });
  await assert.rejects(cancelPayout(db, { payoutId: b.payoutId, reason: 'Again', now: AFTER }), {
    code: 'stale',
  });
  assert.equal((await payoutAvailability(db, { organizationId: 'org_1', now: AFTER })).availableCents, 2000);
  const decisions = d1.sqlite
    .prepare("SELECT new_value FROM payment_decisions WHERE subject = 'payout' ORDER BY rowid")
    .all();
  assert.equal(decisions.length, 3);
  assert.ok(String((decisions[0] as { new_value: string }).new_value).includes(a.payoutId));
  // A canceled event's money is payable before its date.
  d1.sqlite.exec(`UPDATE events SET status = 'canceled'`);
  assert.equal(
    (await payoutAvailability(db, { organizationId: 'org_1', now: PAID_NOW })).availableCents,
    2000,
  );
});

test('send: refused without the owner approval, with a live gateway, or an account not ready', async () => {
  const { d1, db, gateway } = await setup();
  const { payoutId } = await preparePayout(db, { organizationId: 'org_1', reason: 'Payout', now: AFTER });
  await assert.rejects(
    approveAndSendPayout(db, PAID_ENV, { payoutId, ownerApproved: false, now: AFTER, gateway }),
    { code: 'forbidden', detail: 'owner_approval_required' },
  );
  await assert.rejects(
    approveAndSendPayout(db, PAID_ENV, {
      payoutId,
      ownerApproved: 'yes' as unknown as boolean,
      now: AFTER,
      gateway,
    }),
    { code: 'forbidden' },
  );
  let fetched = 0;
  const live = createStripeHttpGateway({
    secretKey: 'sk_live_not_real',
    fetchImpl: (async () => {
      fetched += 1;
      return new Response('{}');
    }) as unknown as typeof fetch,
  });
  await assert.rejects(
    approveAndSendPayout(db, PAID_ENV, { payoutId, ownerApproved: true, now: AFTER, gateway: live }),
    { code: 'forbidden', detail: 'live_mode' },
  );
  assert.equal(fetched, 0);
  await assert.rejects(
    approveAndSendPayout(db, { ENVIRONMENT: 'preview' }, { payoutId, ownerApproved: true, now: AFTER }),
    { code: 'payments_unavailable' },
  );
  d1.sqlite.exec(`UPDATE organization_payments SET payouts_enabled = 0`);
  await assert.rejects(
    approveAndSendPayout(db, PAID_ENV, { payoutId, ownerApproved: true, now: AFTER, gateway }),
    { code: 'account_not_ready' },
  );
  assert.equal((await listPayouts(db))[0].status, 'prepared');
  assert.equal(
    d1.sqlite.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE entry_type = 'payout'").get()?.n,
    0,
  );
});

test('send with owner approval: transfer with source transaction and idempotency key, ledger payout, balance settled', async () => {
  const { d1, db, gateway } = await setup();
  const { payoutId } = await preparePayout(db, { organizationId: 'org_1', reason: 'Payout', now: AFTER });
  const sent = await approveAndSendPayout(db, PAID_ENV, {
    payoutId,
    ownerApproved: true,
    now: AFTER,
    gateway,
  });
  assert.match(sent.stripeTransferId, /^tr_test_/);
  const [p] = await listPayouts(db);
  assert.equal(p.status, 'sent');
  assert.equal(p.stripeTransferId, sent.stripeTransferId);
  assert.equal(await owedToOrganization(db, 'org_1'), 0);
  assert.deepEqual(
    {
      ...d1.sqlite
        .prepare("SELECT amount_cents, held_by, payout_id FROM ledger_entries WHERE entry_type = 'payout'")
        .get(),
    },
    { amount_cents: -6000, held_by: 'gamo', payout_id: payoutId },
  );
  const transferEvent = (await standinEvents(db, PAID_ENV)).find((e) => e.type === 'transfer.created');
  const transfer = JSON.parse(transferEvent?.body ?? '{}').data.object;
  assert.equal(transfer.transfer_group, 'ord_1');
  assert.equal(transfer.destination, 'acct_test_1');
  assert.equal(transfer.metadata.payout_id, payoutId);
  await assert.rejects(
    approveAndSendPayout(db, PAID_ENV, { payoutId, ownerApproved: true, now: AFTER, gateway }),
    { code: 'stale' },
  );
  assert.deepEqual(
    (await reconcilePayouts(db, PAID_ENV, { organizationId: 'org_1', gateway })).map((r) => r.status),
    ['matched'],
  );
});

test('send failures: a definite refusal marks it failed with no ledger row; a network error keeps it approved for a safe retry', async () => {
  const { d1, db, gateway } = await setup();
  const failing = (error: StripeApiError): StripeGateway => ({
    ...gateway,
    createTransfer: async () => Promise.reject(error),
  });
  const a = await preparePayout(db, { organizationId: 'org_1', amountCents: 1000, reason: 'A', now: AFTER });
  await assert.rejects(
    approveAndSendPayout(db, PAID_ENV, {
      payoutId: a.payoutId,
      ownerApproved: true,
      now: AFTER,
      gateway: failing(new StripeApiError(400, 'insufficient_funds')),
    }),
    { code: 'stripe_error' },
  );
  assert.equal((await listPayouts(db)).find((p) => p.id === a.payoutId)?.status, 'failed');
  const b = await preparePayout(db, { organizationId: 'org_1', amountCents: 1000, reason: 'B', now: AFTER });
  await assert.rejects(
    approveAndSendPayout(db, PAID_ENV, {
      payoutId: b.payoutId,
      ownerApproved: true,
      now: AFTER,
      gateway: failing(new StripeApiError(0, 'network_error')),
    }),
    { detail: 'retry' },
  );
  assert.equal((await listPayouts(db)).find((p) => p.id === b.payoutId)?.status, 'approved');
  assert.equal(
    d1.sqlite.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE entry_type = 'payout'").get()?.n,
    0,
  );
  const retried = await approveAndSendPayout(db, PAID_ENV, {
    payoutId: b.payoutId,
    ownerApproved: true,
    now: AFTER + 5,
    gateway,
  });
  assert.match(retried.stripeTransferId, /^tr_test_/);
  assert.equal(await owedToOrganization(db, 'org_1'), 5000);
});

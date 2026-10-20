import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAID_ENV, PAID_NOW, paidTestDatabase } from '../paid-testing.ts';
import type { StripeEvent, StripeEventHandlers } from '../paid-types.ts';
import { verifyStripeSignature } from '../webhooks.ts';
import { createModeARouting } from './mode-a.ts';
import { createModeBRouting } from './mode-b.ts';
import { webhookDelivery } from './money-testing.ts';
import { STANDIN_WEBHOOK_SECRET } from './resolve.ts';
import {
  createStandinGateway,
  registerStandinDelivery,
  standinCheckoutView,
  standinCloseDispute,
  standinCompleteCheckout,
  standinCompleteOnboarding,
  standinDeliverPending,
  standinEvents,
  standinOpenDispute,
  standinPresentCard,
  type StandinDelivery,
} from './standin.ts';
import { StripeApiError, type OrderCheckoutInput } from './types.ts';

const input = (orderId: string, gamoFeeCents = 0): OrderCheckoutInput => ({
  orderId,
  orderReference: 'GL-AAAA-BBBB',
  eventTitle: 'Gospel Night',
  lines: [{ name: 'General', unitAmountCents: 2000, quantity: 2 }],
  customerEmail: null,
  successUrl: 'http://localhost/orders/return?session={CHECKOUT_SESSION_ID}',
  cancelUrl: 'http://localhost/e/gospel-night',
  expiresAt: PAID_NOW + 31 * 60,
  gamoFeeCents,
});

/** Records every delivery; verifies each signature like the real receiver. */
function recorder() {
  const events: { endpoint: string; event: StripeEvent }[] = [];
  const deliver: StandinDelivery = async (rawBody, header, endpoint) => {
    const event = await verifyStripeSignature({
      rawBody,
      signatureHeader: header,
      secrets: [STANDIN_WEBHOOK_SECRET],
      now: PAID_NOW,
    });
    assert.ok(event, 'every stand-in event is correctly signed');
    events.push({ endpoint, event });
  };
  return { events, deliver };
}

async function setup() {
  const { d1, db } = await paidTestDatabase();
  const rec = recorder();
  const gateway = createStandinGateway(db, PAID_ENV, rec.deliver, {
    clock: () => PAID_NOW,
    deferredDelivery: 'manual',
  });
  return { d1, db, gateway, ...rec };
}

test('the stand-in refuses to run outside the local stand-in environment', async () => {
  const { db } = await paidTestDatabase();
  assert.throws(() => createStandinGateway(db, { ENVIRONMENT: 'preview' }), /stripe_standin_not_allowed/);
  assert.throws(() =>
    createStandinGateway(db, {
      ENVIRONMENT: 'local',
      ALLOW_STRIPE_STANDIN: 'true',
      STRIPE_SECRET_KEY: 'sk_test_x',
    }),
  );
  assert.throws(() => createStandinGateway(db, { ENVIRONMENT: 'production', ALLOW_STRIPE_STANDIN: 'true' }));
  await assert.rejects(standinCompleteCheckout(db, { ENVIRONMENT: 'preview' }, 'cs_x', 'paid', PAID_NOW));
  assert.ok(createStandinGateway(db, { ENVIRONMENT: 'preview' }, undefined, { testHarness: true }));
});

test('Mode A end to end: session → pay → signed checkout.session.completed on the Connect endpoint with account', async () => {
  const s = await setup();
  const routing = createModeARouting(s.gateway, 'acct_test_1');
  const session = await routing.createCheckout(input('ord_1', 150));
  assert.match(session.id, /^cs_test_/);
  assert.equal(session.url, `/dev/stripe/checkout/${session.id}`);
  assert.equal(session.amount_total, 4000);
  assert.equal(session.status, 'open');
  // Same idempotency key → the same session.
  assert.equal((await routing.createCheckout(input('ord_1', 150))).id, session.id);
  // Not visible on another account.
  await assert.rejects(
    s.gateway.retrieveCheckoutSession(session.id, { account: null }),
    (e: unknown) => e instanceof StripeApiError && e.status === 404,
  );

  const view = await standinCheckoutView(s.db, PAID_ENV, session.id, PAID_NOW, { deliver: s.deliver });
  assert.equal(view?.amountTotal, 4000);
  assert.equal(view?.connectedAccount, 'acct_test_1');

  const done = await standinCompleteCheckout(s.db, PAID_ENV, session.id, 'paid', PAID_NOW + 60, {
    deliver: s.deliver,
  });
  assert.equal(done.redirectUrl, `http://localhost/orders/return?session=${session.id}`);
  assert.equal(done.session.payment_status, 'paid');
  const types = s.events.map((e) => e.event.type);
  assert.deepEqual(types, ['payment_intent.succeeded', 'checkout.session.completed']);
  for (const e of s.events) {
    assert.equal(e.endpoint, 'connect');
    assert.equal(e.event.account, 'acct_test_1');
    assert.equal(e.event.livemode, false);
  }
  const completed = s.events[1].event.data.object as Record<string, unknown>;
  assert.equal(completed.amount_total, 4000);
  assert.equal(completed.currency, 'usd');
  assert.equal((completed.metadata as Record<string, string>).order_id, 'ord_1');
  assert.equal(completed.client_reference_id, 'ord_1');
  const pi = await s.gateway.retrievePaymentIntent(String(completed.payment_intent), {
    account: 'acct_test_1',
  });
  assert.equal(pi.status, 'succeeded');
  assert.equal(pi.metadata.order_id, 'ord_1');
  // Balance transaction: Stripe's fee includes the application fee on direct charges.
  const txns = await s.gateway.listBalanceTransactions(
    { source: pi.latest_charge ?? '' },
    { account: 'acct_test_1' },
  );
  assert.equal(txns.length, 1);
  assert.equal(txns[0].amount, 4000);
  assert.equal(txns[0].fee, 146 + 150);
  // A second completion changes nothing.
  await standinCompleteCheckout(s.db, PAID_ENV, session.id, 'paid', PAID_NOW + 70, { deliver: s.deliver });
  assert.equal(s.events.length, 2);
});

test('Mode B: platform events without account; refunds; transfers', async () => {
  const s = await setup();
  const routing = createModeBRouting(s.gateway, 'acct_test_1');
  const session = await routing.createCheckout(input('ord_2'));
  await standinCompleteCheckout(s.db, PAID_ENV, session.id, 'paid', PAID_NOW, { deliver: s.deliver });
  assert.ok(s.events.every((e) => e.endpoint === 'platform' && e.event.account === undefined));
  const completed = s.events.at(-1)!.event.data.object as { payment_intent: string };
  const refund = await routing.refund({
    refundId: 'rfd_1',
    orderId: 'ord_2',
    paymentIntentId: completed.payment_intent,
    amountCents: 2000,
    refundFee: false,
  });
  assert.equal(refund.status, 'succeeded');
  assert.equal(refund.amount, 2000);
  // Retrying the same refund returns it; more than what is left is refused.
  assert.equal(
    (
      await routing.refund({
        refundId: 'rfd_1',
        orderId: 'ord_2',
        paymentIntentId: completed.payment_intent,
        amountCents: 2000,
        refundFee: false,
      })
    ).id,
    refund.id,
  );
  await assert.rejects(
    routing.refund({
      refundId: 'rfd_2',
      orderId: 'ord_2',
      paymentIntentId: completed.payment_intent,
      amountCents: 2001,
      refundFee: false,
    }),
    (e: unknown) => e instanceof StripeApiError && e.stripeCode === 'amount_too_large',
  );
  // API-caused events wait for delivery (manual mode here).
  const before = s.events.length;
  assert.deepEqual(await standinDeliverPending(s.db, PAID_ENV, PAID_NOW, { deliver: s.deliver }), {
    delivered: 2,
    pending: 0,
  });
  assert.deepEqual(
    s.events.slice(before).map((e) => e.event.type),
    ['refund.created', 'charge.refunded'],
  );
  const charge = s.events.at(-1)!.event.data.object as { amount_refunded: number; payment_intent: string };
  assert.equal(charge.amount_refunded, 2000);
  const pi = await s.gateway.retrievePaymentIntent(completed.payment_intent, {});
  const transfer = await s.gateway.createTransfer(
    {
      amountCents: 1500,
      currency: 'usd',
      destination: 'acct_test_1',
      transferGroup: 'ord_2',
      sourceTransaction: pi.latest_charge ?? undefined,
      metadata: {},
    },
    { idempotencyKey: 'payout_pyo_1' },
  );
  assert.match(transfer.id, /^tr_test_/);
  await assert.rejects(
    s.gateway.createTransfer(
      { amountCents: 1500, currency: 'usd', destination: 'acct_test_1', metadata: {} },
      { idempotencyKey: 'payout_pyo_1' },
    ),
    (e: unknown) => e instanceof StripeApiError && e.stripeCode === 'idempotency_error',
  );
});

test('checkout outcomes: declined stays open, async failure, expiry; expires_at bounds', async () => {
  const s = await setup();
  const routing = createModeARouting(s.gateway, 'acct_test_1');
  const a = await routing.createCheckout(input('ord_a'));
  const declined = await standinCompleteCheckout(s.db, PAID_ENV, a.id, 'declined', PAID_NOW, {
    deliver: s.deliver,
  });
  assert.equal(declined.session.status, 'open');
  assert.equal(s.events.at(-1)?.event.type, 'payment_intent.payment_failed');
  const canceled = await standinCompleteCheckout(s.db, PAID_ENV, a.id, 'canceled', PAID_NOW, {
    deliver: s.deliver,
  });
  assert.equal(canceled.redirectUrl, 'http://localhost/e/gospel-night');
  assert.equal(canceled.session.status, 'open');
  const b = await routing.createCheckout(input('ord_b'));
  await standinCompleteCheckout(s.db, PAID_ENV, b.id, 'async_failed', PAID_NOW, { deliver: s.deliver });
  assert.equal(s.events.at(-1)?.event.type, 'checkout.session.async_payment_failed');
  const c = await routing.createCheckout(input('ord_c'));
  await standinCompleteCheckout(s.db, PAID_ENV, c.id, 'expired', PAID_NOW, { deliver: s.deliver });
  assert.equal(s.events.at(-1)?.event.type, 'checkout.session.expired');
  // Staff cancel: expiring an open session, then again (already expired) is a no-op for the routing.
  const d = await routing.createCheckout(input('ord_d'));
  await routing.expireCheckout(d.id);
  await routing.expireCheckout(d.id);
  assert.equal((await s.gateway.retrieveCheckoutSession(d.id, { account: 'acct_test_1' })).status, 'expired');
  // A session whose time passed is expired when next read.
  const e = await routing.createCheckout(input('ord_e'));
  const later = createStandinGateway(s.db, PAID_ENV, s.deliver, {
    clock: () => PAID_NOW + 32 * 60,
    deferredDelivery: 'manual',
  });
  assert.equal((await later.retrieveCheckoutSession(e.id, { account: 'acct_test_1' })).status, 'expired');
  await assert.rejects(
    routing.createCheckout({ ...input('ord_f'), expiresAt: PAID_NOW + 29 * 60 }),
    StripeApiError,
  );
  await assert.rejects(
    routing.createCheckout({ ...input('ord_g'), expiresAt: PAID_NOW + 25 * 3600 }),
    StripeApiError,
  );
});

test('simulated reader: register, process, present → payment_intent.succeeded and terminal.reader.action_succeeded', async () => {
  const s = await setup();
  const opts = { account: 'acct_test_1' };
  await assert.rejects(
    s.gateway.registerReader({ registrationCode: 'nope', label: 'x', location: 'tml_x' }, opts),
    StripeApiError,
  );
  const location = await s.gateway.createLocation(
    {
      displayName: 'Grace Hall',
      address: { line1: '1 Main St', city: 'Phoenix', state: 'AZ', postalCode: '85001', country: 'US' },
      metadata: {},
    },
    { ...opts, idempotencyKey: 'loc_1' },
  );
  const reader = await s.gateway.registerReader(
    { registrationCode: 'simulated-s700', label: 'North door', location: location.id },
    opts,
  );
  assert.equal(reader.status, 'online');
  assert.equal(reader.device_type, 'stripe_s700');
  const routing = createModeARouting(s.gateway, 'acct_test_1');
  const pi = await routing.createCardPresentPayment({
    orderId: 'ord_r',
    orderReference: 'GL-R',
    amountCents: 5000,
    gamoFeeCents: 0,
    description: 'Door',
  });
  const busy = await s.gateway.processPaymentIntentOnReader(reader.id, pi.id, opts);
  assert.equal(busy.action?.status, 'in_progress');
  const pi2 = await routing.createCardPresentPayment({
    orderId: 'ord_r2',
    orderReference: 'GL-R2',
    amountCents: 5000,
    gamoFeeCents: 0,
    description: 'Door',
  });
  await assert.rejects(
    s.gateway.processPaymentIntentOnReader(reader.id, pi2.id, opts),
    (e: unknown) => e instanceof StripeApiError && e.stripeCode === 'terminal_reader_busy',
  );
  const done = await s.gateway.presentPaymentMethod(reader.id, opts);
  assert.equal(done.action?.status, 'succeeded');
  await standinDeliverPending(s.db, PAID_ENV, PAID_NOW, { deliver: s.deliver });
  assert.deepEqual(
    s.events.map((e) => e.event.type),
    ['payment_intent.succeeded', 'terminal.reader.action_succeeded'],
  );
  assert.ok(s.events.every((e) => e.event.account === 'acct_test_1' && e.endpoint === 'connect'));
  assert.equal(
    (s.events[0].event.data.object as { metadata: Record<string, string> }).metadata.order_id,
    'ord_r',
  );
  // A declined card on the next payment; cancel_action resets without an event.
  await s.gateway.processPaymentIntentOnReader(reader.id, pi2.id, opts);
  await standinPresentCard(s.db, PAID_ENV, reader.id, 'declined', PAID_NOW, { deliver: s.deliver });
  assert.deepEqual(
    s.events.slice(2).map((e) => e.event.type),
    ['payment_intent.payment_failed', 'terminal.reader.action_failed'],
  );
  await s.gateway.processPaymentIntentOnReader(reader.id, pi2.id, opts);
  assert.equal((await s.gateway.cancelReaderAction(reader.id, opts)).action, null);
  await s.gateway.deleteReader(reader.id, opts);
  await assert.rejects(s.gateway.retrieveReader(reader.id, opts), StripeApiError);
});

test('connected accounts: created not ready, onboarding makes them ready and sends account.updated with account', async () => {
  const s = await setup();
  const acct = await s.gateway.createAccount(
    { purpose: 'transfers_only', email: null, businessName: 'Grace', metadata: {} },
    { idempotencyKey: 'account_org_1' },
  );
  assert.equal(acct.payouts_enabled, false);
  const link = await s.gateway.createAccountLink({ account: acct.id, refreshUrl: '/r', returnUrl: '/back' });
  assert.equal(link.url, `/dev/stripe/onboard/${acct.id}`);
  const result = await standinCompleteOnboarding(s.db, PAID_ENV, acct.id, PAID_NOW, { deliver: s.deliver });
  assert.equal(result.returnUrl, '/back');
  assert.equal(result.account.payouts_enabled, true);
  assert.equal(result.account.charges_enabled, false, 'a transfers-only account takes no charges');
  assert.equal(s.events[0].event.type, 'account.updated');
  assert.equal(s.events[0].event.account, acct.id);
  assert.equal(s.events[0].endpoint, 'connect');
});

test('disputes on demand; delivery through the real receiver; refused deliveries stay pending; registered delivery', async () => {
  const { db } = await paidTestDatabase();
  const handlers: StripeEventHandlers = { 'charge.dispute.created': async () => 'retry' };
  const hook = webhookDelivery(db, handlers, () => PAID_NOW);
  const gateway = createStandinGateway(db, PAID_ENV, hook.deliver, {
    clock: () => PAID_NOW,
    deferredDelivery: 'manual',
  });
  const session = await createModeBRouting(gateway, 'acct_test_1').createCheckout(input('ord_x'));
  const paid = await standinCompleteCheckout(db, PAID_ENV, session.id, 'paid', PAID_NOW, {
    deliver: hook.deliver,
  });
  assert.ok(hook.received.every((r) => r.status === 200));
  const opened = await standinOpenDispute(db, PAID_ENV, String(paid.session.payment_intent), PAID_NOW, {
    deliver: hook.deliver,
  });
  assert.equal(opened.amount, 4000);
  assert.equal(hook.received.at(-1)?.status, 500);
  let events = await standinEvents(db, PAID_ENV);
  assert.equal(events.find((e) => e.type === 'charge.dispute.created')?.delivered, false);
  handlers['charge.dispute.created'] = async () => 'processed';
  assert.deepEqual(await standinDeliverPending(db, PAID_ENV, PAID_NOW + 60, { deliver: hook.deliver }), {
    delivered: 1,
    pending: 0,
  });
  await standinCloseDispute(db, PAID_ENV, opened.disputeId, 'won', PAID_NOW + 120, { deliver: hook.deliver });
  events = await standinEvents(db, PAID_ENV);
  assert.ok(events.every((e) => e.delivered));
  assert.equal(events.at(-1)?.type, 'charge.dispute.closed');

  // Without any delivery the event is just recorded; a registered delivery is used when none is given.
  const second = await createModeBRouting(
    createStandinGateway(db, PAID_ENV, undefined, { clock: () => PAID_NOW }),
    'acct_test_1',
  ).createCheckout(input('ord_y'));
  await standinCompleteCheckout(db, PAID_ENV, second.id, 'expired', PAID_NOW);
  events = await standinEvents(db, PAID_ENV);
  assert.equal(events.at(-1)?.delivered, false);
  const rec = recorder();
  registerStandinDelivery(rec.deliver);
  try {
    await standinDeliverPending(db, PAID_ENV, PAID_NOW);
  } finally {
    registerStandinDelivery(null);
  }
  assert.equal(rec.events.at(-1)?.event.type, 'checkout.session.expired');
});

test('timer delivery: API-caused events arrive shortly after the call', async () => {
  const { db } = await paidTestDatabase();
  const rec = recorder();
  const gateway = createStandinGateway(db, PAID_ENV, rec.deliver, { clock: () => PAID_NOW });
  const acct = await gateway.createAccount(
    { purpose: 'direct_charges', email: null, businessName: 'G', metadata: {} },
    {},
  );
  const routing = createModeARouting(gateway, acct.id);
  const session = await routing.createCheckout(input('ord_t'));
  await routing.expireCheckout(session.id);
  assert.equal(rec.events.length, 0, 'not delivered inside the call');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(
    rec.events.map((e) => e.event.type),
    ['checkout.session.expired'],
  );
});

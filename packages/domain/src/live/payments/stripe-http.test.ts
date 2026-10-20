import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModeARouting } from './mode-a.ts';
import { createModeBRouting } from './mode-b.ts';
import { createStripeHttpGateway, encodeStripeForm } from './stripe-http.ts';
import { StripeApiError, type OrderCheckoutInput } from './types.ts';

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: URLSearchParams;
}

/** A fake `fetch`: records each request and answers from a queue (default: 200 with `{ id: 'obj_1' }`). */
function fakeFetch(answers: Array<() => Response> = []) {
  const calls: Captured[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string>) },
      body: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
    });
    const next = answers.shift();
    return next
      ? next()
      : new Response(JSON.stringify({ id: 'obj_1', object: 'x', data: [] }), { status: 200 });
  }) as typeof fetch;
  return { calls, impl };
}

const KEY = 'sk_test_not_a_real_key';

const checkoutInput = (gamoFeeCents: number): OrderCheckoutInput => ({
  orderId: 'ord_1',
  orderReference: 'GL-AAAA-BBBB',
  eventTitle: 'Gospel Night',
  lines: [
    { name: 'General', unitAmountCents: 2000, quantity: 2 },
    { name: 'Gamo fee', unitAmountCents: 100, quantity: 1 },
  ],
  customerEmail: 'buyer@example.org',
  successUrl: 'https://live.example/orders/return?session={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://live.example/e/gospel-night',
  expiresAt: 1_800_000_000,
  gamoFeeCents,
});

test('form encoding: nested objects, arrays of objects and scalar lists', () => {
  assert.equal(
    decodeURIComponent(
      encodeStripeForm({ a: { b: 1, c: [{ d: 'x' }] }, e: ['card_present'], f: null, g: undefined, h: true }),
    ),
    'a[b]=1&a[c][0][d]=x&e[]=card_present&h=true',
  );
});

test('Mode A Checkout: Stripe-Account, idempotency key, line items, metadata on session and intent, application fee', async () => {
  const { calls, impl } = fakeFetch();
  const routing = createModeARouting(
    createStripeHttpGateway({ secretKey: KEY, fetchImpl: impl }),
    'acct_org1',
  );
  assert.equal(routing.seller, 'organization');
  assert.equal(routing.chargeAccountId, 'acct_org1');
  await routing.createCheckout(checkoutInput(100));
  const [c] = calls;
  assert.equal(c.url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(c.method, 'POST');
  assert.equal(c.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(c.headers['Stripe-Account'], 'acct_org1');
  assert.equal(c.headers['Idempotency-Key'], 'checkout_ord_1');
  assert.equal(c.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const b = c.body;
  assert.equal(b.get('mode'), 'payment');
  assert.equal(b.get('line_items[0][price_data][currency]'), 'usd');
  assert.equal(b.get('line_items[0][price_data][product_data][name]'), 'General');
  assert.equal(b.get('line_items[0][price_data][unit_amount]'), '2000');
  assert.equal(b.get('line_items[0][quantity]'), '2');
  assert.equal(b.get('line_items[1][price_data][unit_amount]'), '100');
  assert.equal(b.get('customer_email'), 'buyer@example.org');
  assert.equal(b.get('client_reference_id'), 'ord_1');
  assert.equal(b.get('metadata[order_id]'), 'ord_1');
  assert.equal(b.get('payment_intent_data[metadata][order_id]'), 'ord_1');
  assert.equal(b.get('payment_intent_data[application_fee_amount]'), '100');
  assert.equal(b.get('payment_intent_data[transfer_group]'), null);
  assert.equal(b.get('expires_at'), '1800000000');
  assert.equal(b.get('success_url'), checkoutInput(0).successUrl);
  assert.equal(b.get('cancel_url'), checkoutInput(0).cancelUrl);
});

test('Mode A: no application fee when the Gamo fee is 0; a fee not below the total is refused', async () => {
  const { calls, impl } = fakeFetch();
  const routing = createModeARouting(
    createStripeHttpGateway({ secretKey: KEY, fetchImpl: impl }),
    'acct_org1',
  );
  await routing.createCheckout(checkoutInput(0));
  assert.equal(calls[0].body.get('payment_intent_data[application_fee_amount]'), null);
  await assert.rejects(routing.createCheckout(checkoutInput(4100)), { name: 'PaidError', code: 'invalid' });
  assert.equal(calls.length, 1);
});

test('Mode B Checkout: Gamo account, transfer group, never an application fee', async () => {
  const { calls, impl } = fakeFetch();
  const routing = createModeBRouting(
    createStripeHttpGateway({ secretKey: KEY, fetchImpl: impl }),
    'acct_payout1',
  );
  assert.equal(routing.seller, 'gamo');
  assert.equal(routing.chargeAccountId, null);
  await routing.createCheckout(checkoutInput(100));
  const [c] = calls;
  assert.equal(c.headers['Stripe-Account'], undefined);
  assert.equal(c.headers['Idempotency-Key'], 'checkout_ord_1');
  assert.equal(c.body.get('payment_intent_data[transfer_group]'), 'ord_1');
  assert.equal(c.body.get('payment_intent_data[application_fee_amount]'), null);
  assert.equal(c.body.get('payment_intent_data[metadata][order_id]'), 'ord_1');
});

test('refunds: Mode A passes refund_application_fee and the account; Mode B neither', async () => {
  const a = fakeFetch();
  await createModeARouting(
    createStripeHttpGateway({ secretKey: KEY, fetchImpl: a.impl }),
    'acct_org1',
  ).refund({
    refundId: 'rfd_1',
    orderId: 'ord_1',
    paymentIntentId: 'pi_1',
    amountCents: 2000,
    refundFee: true,
  });
  assert.equal(a.calls[0].url, 'https://api.stripe.com/v1/refunds');
  assert.equal(a.calls[0].headers['Stripe-Account'], 'acct_org1');
  assert.equal(a.calls[0].headers['Idempotency-Key'], 'refund_rfd_1');
  assert.equal(a.calls[0].body.get('payment_intent'), 'pi_1');
  assert.equal(a.calls[0].body.get('amount'), '2000');
  assert.equal(a.calls[0].body.get('refund_application_fee'), 'true');
  assert.equal(a.calls[0].body.get('metadata[refund_id]'), 'rfd_1');
  const b = fakeFetch();
  await createModeBRouting(createStripeHttpGateway({ secretKey: KEY, fetchImpl: b.impl }), 'acct_p').refund({
    refundId: 'rfd_2',
    orderId: 'ord_1',
    paymentIntentId: 'pi_1',
    amountCents: 500,
    refundFee: true,
  });
  assert.equal(b.calls[0].headers['Stripe-Account'], undefined);
  assert.equal(b.calls[0].body.get('refund_application_fee'), null);
});

test('card-present PaymentIntent and reader calls (server-driven Terminal)', async () => {
  const { calls, impl } = fakeFetch();
  const gateway = createStripeHttpGateway({ secretKey: KEY, fetchImpl: impl });
  await createModeARouting(gateway, 'acct_org1').createCardPresentPayment({
    orderId: 'ord_9',
    orderReference: 'GL-XXXX-YYYY',
    amountCents: 5000,
    gamoFeeCents: 150,
    description: 'Door sale',
  });
  const pi = calls[0].body;
  assert.equal(pi.get('allowed_payment_method_types[]'), 'card_present');
  assert.equal(pi.get('capture_method'), 'automatic');
  assert.equal(pi.get('amount'), '5000');
  assert.equal(pi.get('application_fee_amount'), '150');
  assert.equal(calls[0].headers['Idempotency-Key'], 'card_present_ord_9');
  await gateway.processPaymentIntentOnReader('tmr_1', 'pi_9', { account: 'acct_org1' });
  assert.equal(calls[1].url, 'https://api.stripe.com/v1/terminal/readers/tmr_1/process_payment_intent');
  assert.equal(calls[1].body.get('payment_intent'), 'pi_9');
  await gateway.registerReader(
    { registrationCode: 'simulated-s700', label: 'North door', location: 'tml_1' },
    {},
  );
  assert.equal(calls[2].body.get('registration_code'), 'simulated-s700');
  assert.ok(calls[2].headers['Idempotency-Key'], 'creates always carry a key');
  await gateway.createLocation(
    {
      displayName: 'Grace Hall',
      address: { line1: '1 Main St', city: 'Phoenix', state: 'AZ', postalCode: '85001', country: 'US' },
      metadata: {},
    },
    {},
  );
  assert.equal(calls[3].body.get('address[postal_code]'), '85001');
  await gateway.deleteReader('tmr_1', {});
  assert.equal(calls[4].method, 'DELETE');
  await gateway.presentPaymentMethod('tmr_1', {});
  assert.equal(
    calls[5].url,
    'https://api.stripe.com/v1/test_helpers/terminal/readers/tmr_1/present_payment_method',
  );
  await gateway.cancelReaderAction('tmr_1', {});
  assert.match(calls[6].url, /cancel_action$/);
});

test('connected accounts use controller properties per mode; account links and balance transactions', async () => {
  const { calls, impl } = fakeFetch();
  const gateway = createStripeHttpGateway({ secretKey: KEY, fetchImpl: impl });
  await gateway.createAccount(
    { purpose: 'direct_charges', email: null, businessName: 'Grace', metadata: { organization_id: 'org_1' } },
    { idempotencyKey: 'k1' },
  );
  const a = calls[0].body;
  assert.equal(a.get('controller[fees][payer]'), 'account');
  assert.equal(a.get('controller[losses][payments]'), 'stripe');
  assert.equal(a.get('controller[stripe_dashboard][type]'), 'full');
  assert.equal(a.get('capabilities[card_payments][requested]'), 'true');
  assert.equal(a.get('capabilities[transfers][requested]'), 'true');
  assert.equal(a.get('email'), null);
  await gateway.createAccount(
    { purpose: 'transfers_only', email: null, businessName: 'Grace', metadata: {} },
    { idempotencyKey: 'k2' },
  );
  const b = calls[1].body;
  assert.equal(b.get('controller[fees][payer]'), 'application');
  assert.equal(b.get('controller[losses][payments]'), 'application');
  assert.equal(b.get('controller[requirement_collection]'), 'stripe');
  assert.equal(b.get('controller[stripe_dashboard][type]'), 'express');
  assert.equal(b.get('capabilities[card_payments][requested]'), null);
  await gateway.createAccountLink({ account: 'acct_1', refreshUrl: 'https://x/r', returnUrl: 'https://x/b' });
  assert.equal(calls[2].body.get('type'), 'account_onboarding');
  await gateway.listBalanceTransactions({ source: 'ch_1' }, { account: 'acct_1' });
  assert.equal(calls[3].url, 'https://api.stripe.com/v1/balance_transactions?source=ch_1&limit=100');
  assert.equal(calls[3].headers['Stripe-Account'], 'acct_1');
  await gateway.createTransfer(
    {
      amountCents: 900,
      currency: 'usd',
      destination: 'acct_1',
      transferGroup: 'ord_1',
      sourceTransaction: 'ch_1',
      metadata: { payout_id: 'pyo_1' },
    },
    { idempotencyKey: 'payout_pyo_1' },
  );
  assert.equal(calls[4].body.get('destination'), 'acct_1');
  assert.equal(calls[4].body.get('source_transaction'), 'ch_1');
  assert.equal(calls[4].body.get('transfer_group'), 'ord_1');
});

test('errors keep only status and code; retries once on 5xx when idempotent, never a POST without a key', async () => {
  const err = (status: number, code: string) => () =>
    new Response(JSON.stringify({ error: { code, message: 'Secret detail buyer@example.org' } }), { status });
  const a = fakeFetch([err(402, 'card_declined')]);
  const gateway = createStripeHttpGateway({ secretKey: KEY, fetchImpl: a.impl });
  const e = await gateway.retrievePaymentIntent('pi_1', {}).catch((x: unknown) => x);
  assert.ok(e instanceof StripeApiError);
  assert.equal(e.status, 402);
  assert.equal(e.stripeCode, 'card_declined');
  assert.equal(e.definite, true);
  assert.doesNotMatch(e.message, /buyer/);

  const b = fakeFetch([err(500, 'api_error')]);
  await createStripeHttpGateway({ secretKey: KEY, fetchImpl: b.impl }).retrievePaymentIntent('pi_1', {});
  assert.equal(b.calls.length, 2, 'GET retried once');

  const c = fakeFetch([err(429, 'rate_limit'), err(429, 'rate_limit')]);
  const e2 = await createStripeHttpGateway({ secretKey: KEY, fetchImpl: c.impl })
    .expireCheckoutSession('cs_1', {})
    .catch((x: unknown) => x);
  assert.equal(c.calls.length, 1, 'a POST without an idempotency key is not retried');
  assert.ok(e2 instanceof StripeApiError && !e2.definite);

  let n = 0;
  const flaky = (async () => {
    n += 1;
    if (n === 1) throw new TypeError('network');
    return new Response(JSON.stringify({ id: 'cs_1' }), { status: 200 });
  }) as unknown as typeof fetch;
  await createStripeHttpGateway({ secretKey: KEY, fetchImpl: flaky }).createCheckoutSession(
    {
      lineItems: [{ name: 'x', unitAmountCents: 100, quantity: 1 }],
      currency: 'usd',
      customerEmail: null,
      clientReferenceId: 'o',
      metadata: {},
      successUrl: 's',
      cancelUrl: 'c',
      expiresAt: 1,
    },
    { idempotencyKey: 'checkout_o' },
  );
  assert.equal(n, 2, 'a create with an idempotency key is retried after a network error');
});

test('live keys report livemode and refuse test helpers; bad keys and ids are refused', async () => {
  const { calls, impl } = fakeFetch();
  const live = createStripeHttpGateway({ secretKey: 'sk_live_x', fetchImpl: impl });
  assert.equal(live.livemode, true);
  await assert.rejects(live.presentPaymentMethod('tmr_1', {}), StripeApiError);
  assert.equal(calls.length, 0);
  assert.throws(() => createStripeHttpGateway({ secretKey: 'pk_test_x' }));
  await assert.rejects(live.retrieveAccount('acct_1/../x'), StripeApiError);
});

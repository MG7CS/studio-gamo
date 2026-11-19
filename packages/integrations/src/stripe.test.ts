import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStripeTestMode,
  createStripeTestClient,
  StripeNotConfiguredError,
  verifyStripeWebhookSignature,
  parseInvoiceEvent,
  StripeApiError,
  STRIPE_INVOICING_API_VERSION,
  type StripeWebhookEvent,
} from './stripe.ts';

describe('Stripe Integration & Nonprofit Governance Gates', () => {
  test('assertStripeTestMode strictly rejects live secret and restricted keys', () => {
    assert.throws(
      () => assertStripeTestMode('sk_live_1234567890abcdef'),
      /\[Gamo Governance Gate\] Live Stripe keys \(sk_live_ \/ rk_live_\) are strictly prohibited/,
    );

    assert.throws(
      () => assertStripeTestMode('rk_live_1234567890abcdef'),
      /\[Gamo Governance Gate\] Live Stripe keys \(sk_live_ \/ rk_live_\) are strictly prohibited/,
    );

    // Permitted test keys
    assert.doesNotThrow(() => assertStripeTestMode('sk_test_1234567890abcdef'));
    assert.doesNotThrow(() => assertStripeTestMode('rk_test_1234567890abcdef'));
    assert.doesNotThrow(() => assertStripeTestMode('mock_key_test'));
    assert.doesNotThrow(() => assertStripeTestMode(undefined));
  });

  test('without a real test key and without allowMock, every Stripe call fails closed', async () => {
    for (const secretKey of [undefined, 'mock_test_key', 'sk_test_placeholder']) {
      const client = createStripeTestClient({ secretKey });
      assert.equal(client.isConfigured(), false);
      await assert.rejects(
        client.createTestCheckoutSession({
          mode: 'payment',
          amountMinorUnits: 2500,
          successUrl: 'https://academy.gamostudio.org/registrations/receipt?ref=A1',
          cancelUrl: 'https://academy.gamostudio.org/register/keyboard',
        }),
        StripeNotConfiguredError,
      );
      await assert.rejects(
        client.createCustomerPortalSession({
          customerId: 'cus_1',
          returnUrl: 'https://academy.gamostudio.org/account',
        }),
        StripeNotConfiguredError,
      );
    }
  });
});

describe('Cryptographic Stripe Webhook Signature Verification', () => {
  const secret = 'whsec_test_secret_1234567890abcdef';
  const samplePayload = JSON.stringify({
    id: 'evt_test_checkout_completed_123',
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_test_session_123',
        payment_status: 'paid',
        amount_total: 2500,
        currency: 'usd',
      },
    },
    livemode: false,
  });

  async function generateSignatureHeader(payload: string, secretKey: string, timestamp: number) {
    const payloadToSign = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadToSign));
    const hex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `t=${timestamp},v1=${hex}`;
  }

  test('successfully verifies valid Stripe HMAC-SHA256 signature', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const signatureHeader = await generateSignatureHeader(samplePayload, secret, nowSec);

    const result = await verifyStripeWebhookSignature(samplePayload, signatureHeader, secret);
    assert.equal(result.valid, true);
    assert.equal(result.event?.id, 'evt_test_checkout_completed_123');
    assert.equal(result.event?.type, 'checkout.session.completed');
  });

  test('rejects tampered webhook body', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const signatureHeader = await generateSignatureHeader(samplePayload, secret, nowSec);
    const tamperedPayload = samplePayload.replace('2500', '1000');

    const result = await verifyStripeWebhookSignature(tamperedPayload, signatureHeader, secret);
    assert.equal(result.valid, false);
    assert.equal(result.error, 'Webhook signature verification failed');
  });

  test('rejects timestamps older than tolerance window (replay attack mitigation)', async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const signatureHeader = await generateSignatureHeader(samplePayload, secret, staleTimestamp);

    const result = await verifyStripeWebhookSignature(
      samplePayload,
      signatureHeader,
      secret,
      300, // 5 minute tolerance
    );
    assert.equal(result.valid, false);
    assert.equal(result.error, 'Webhook signature timestamp outside tolerance window');
  });
});

describe('Webhook Deduplication & Idempotency Store', () => {});

describe('Stripe Invoicing (test mode)', () => {
  const KEY = 'sk_test_51abcdef';
  type Call = { url: string; method: string; headers: Record<string, string>; body: URLSearchParams };

  /** Fake fetch: records calls and answers from a queue of [status, json]. */
  function fakeFetch(responses: Array<[number, unknown]>) {
    const calls: Call[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: String(init.method),
        headers: init.headers as Record<string, string>,
        body: new URLSearchParams(typeof init.body === 'string' ? init.body : ''),
      });
      const [status, json] = responses.shift() ?? [500, { error: { code: 'no_response_queued' } }];
      return new Response(JSON.stringify(json), { status });
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  const invoice = (over: Record<string, unknown> = {}) => ({
    id: 'in_123',
    number: null,
    status: 'draft',
    hosted_invoice_url: null,
    amount_due: 0,
    amount_paid: 0,
    metadata: { invoiceId: 'inv-1' },
    ...over,
  });

  test('live keys are rejected before any request is made', () => {
    const { calls, impl } = fakeFetch([]);
    assert.throws(
      () => createStripeTestClient({ secretKey: 'sk_live_abc', fetchImpl: impl }),
      /Governance Gate/,
    );
    assert.throws(
      () => createStripeTestClient({ secretKey: 'rk_live_abc', fetchImpl: impl }),
      /Governance Gate/,
    );
    assert.equal(calls.length, 0);
  });

  test('createInvoice creates a send_invoice draft with card + ACH, then one item per line, each idempotent', async () => {
    const { calls, impl } = fakeFetch([
      [200, invoice()],
      [200, { id: 'ii_1' }],
      [200, { id: 'ii_2' }],
      [200, invoice({ amount_due: 35000 })],
    ]);
    const client = createStripeTestClient({ secretKey: KEY, fetchImpl: impl });
    const created = await client.createInvoice({
      customerId: 'cus_1',
      daysUntilDue: 14,
      lines: [
        { description: 'Musician pay: Sample Pianist', amountCents: 30000 },
        { description: 'Setup hours', amountCents: 2500, quantity: 2 },
      ],
      metadata: { invoiceId: 'inv-1', number: 'GS-2026-0001', source: 'service_request' },
      idempotencyKey: 'invoice-key-0001',
    });
    assert.equal(created.amount_due, 35000);
    assert.equal(calls.length, 4);

    const [inv, item1, item2, get] = calls;
    assert.equal(inv.url, 'https://api.stripe.com/v1/invoices');
    assert.equal(inv.body.get('customer'), 'cus_1');
    assert.equal(inv.body.get('collection_method'), 'send_invoice');
    assert.equal(inv.body.get('days_until_due'), '14');
    assert.equal(inv.body.get('currency'), 'usd');
    assert.equal(inv.body.get('auto_advance'), 'false');
    assert.equal(inv.body.get('pending_invoice_items_behavior'), 'exclude');
    assert.equal(inv.body.get('payment_settings[payment_method_types][0]'), 'card');
    assert.equal(inv.body.get('payment_settings[payment_method_types][1]'), 'us_bank_account');
    assert.equal(inv.body.get('metadata[number]'), 'GS-2026-0001');
    assert.equal(inv.body.get('metadata[invoiceId]'), 'inv-1');
    assert.equal(inv.headers['Idempotency-Key'], 'invoice-key-0001:invoice');

    assert.equal(item1.url, 'https://api.stripe.com/v1/invoiceitems');
    assert.equal(item1.body.get('invoice'), 'in_123');
    assert.equal(item1.body.get('customer'), 'cus_1');
    assert.equal(item1.body.get('quantity'), '1');
    assert.equal(item1.body.get('unit_amount_decimal'), '30000');
    assert.equal(item1.headers['Idempotency-Key'], 'invoice-key-0001:item:0');
    assert.equal(item2.body.get('quantity'), '2');
    assert.equal(item2.body.get('unit_amount_decimal'), '2500');
    assert.equal(item2.headers['Idempotency-Key'], 'invoice-key-0001:item:1');

    assert.equal(get.method, 'GET');
    assert.equal(get.url, 'https://api.stripe.com/v1/invoices/in_123');
    assert.equal(get.headers['Idempotency-Key'], undefined);
    for (const c of calls) assert.equal(c.headers['Stripe-Version'], STRIPE_INVOICING_API_VERSION);
  });

  test('createInvoice rejects bad input before any request', async () => {
    const { calls, impl } = fakeFetch([]);
    const client = createStripeTestClient({ secretKey: KEY, fetchImpl: impl });
    const ok = {
      customerId: 'cus_1',
      daysUntilDue: 14,
      lines: [{ description: 'x', amountCents: 100 }],
      idempotencyKey: 'invoice-key-0001',
    };
    const bad = [
      { ...ok, lines: [] },
      { ...ok, lines: [{ description: 'x', amountCents: -100 }] },
      { ...ok, lines: [{ description: 'x', amountCents: 10.5 }] },
      { ...ok, lines: [{ description: 'x', amountCents: 0 }] },
      { ...ok, lines: [{ description: 'x', amountCents: 100, quantity: 0 }] },
      { ...ok, lines: [{ description: '  ', amountCents: 100 }] },
      { ...ok, daysUntilDue: 0 },
      { ...ok, daysUntilDue: 2.5 },
      { ...ok, customerId: 'cus_1/../x' },
      { ...ok, idempotencyKey: 'short' },
      { ...ok, metadata: { k: 'v'.repeat(501) } },
    ];
    for (const input of bad) await assert.rejects(client.createInvoice(input));
    assert.equal(calls.length, 0);
  });

  test('Stripe errors map to StripeApiError with status and code only, never the key or body', async () => {
    const { impl } = fakeFetch([
      [400, { error: { code: 'invoice_not_editable', message: `secret ${KEY} leaked` } }],
    ]);
    const client = createStripeTestClient({ secretKey: KEY, fetchImpl: impl });
    await assert.rejects(client.finalizeInvoice('in_9'), (err: unknown) => {
      assert.ok(err instanceof StripeApiError);
      assert.equal(err.status, 400);
      assert.equal(err.code, 'invoice_not_editable');
      assert.ok(!err.message.includes(KEY));
      assert.ok(!err.message.includes('leaked'));
      return true;
    });
  });
});

describe('parseInvoiceEvent', () => {
  const event = (type: string, object: unknown): StripeWebhookEvent => ({
    id: 'evt_1',
    object: 'event',
    type,
    created: 1,
    data: { object },
    livemode: false,
  });

  test('invoice.paid yields id, paidAt, amountPaid and metadata', () => {
    const parsed = parseInvoiceEvent(
      event('invoice.paid', {
        id: 'in_1',
        amount_paid: 35000,
        metadata: { invoiceId: 'inv-1', number: 'GS-2026-0001' },
        status_transitions: { paid_at: 1_700_000_000 },
      }),
    );
    assert.deepEqual(parsed, {
      stripeInvoiceId: 'in_1',
      status: 'paid',
      paidAt: '2023-11-14T22:13:20.000Z',
      amountPaid: 35000,
      metadata: { invoiceId: 'inv-1', number: 'GS-2026-0001' },
    });
  });

  test('a bad signature is rejected by the shared verifier, so no event is ever parsed', async () => {
    const body = JSON.stringify(event('invoice.paid', { id: 'in_1' }));
    const t = Math.floor(Date.now() / 1000);
    const result = await verifyStripeWebhookSignature(body, `t=${t},v1=${'0'.repeat(64)}`, 'whsec_x');
    assert.equal(result.valid, false);
    assert.equal(result.event, undefined);
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStripeTestMode,
  createStripeTestClient,
  StripeNotConfiguredError,
  verifyStripeWebhookSignature,
  createMemoryIdempotencyStore,
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
          successUrl: 'https://live.gamostudio.org/my-tickets?order=A1',
          cancelUrl: 'https://live.gamostudio.org/events/concert-1',
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

  test('a real test-mode key counts as configured', () => {
    assert.equal(createStripeTestClient({ secretKey: 'sk_test_51abc' }).isConfigured(), true);
  });

  test('createStripeTestClient generates mock checkout sessions only when allowMock is set', async () => {
    const client = createStripeTestClient({ secretKey: 'mock_test_key', allowMock: true });
    assert.equal(client.isConfigured(), true);

    const session = await client.createTestCheckoutSession({
      mode: 'payment',
      amountMinorUnits: 2500, // $25.00
      description: 'Gamo Live Event Ticket (Test)',
      successUrl: 'https://live.gamostudio.org/tickets/success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://live.gamostudio.org/events/concert-1',
    });

    assert.equal(session.mock, true);
    assert.ok(session.id.startsWith('cs_test_mock_'));
    assert.ok(session.url?.includes('test_mode=true'));
    assert.ok(session.url?.includes(session.id));
  });

  test('mock success URL keeps an existing query string well-formed', async () => {
    const client = createStripeTestClient({ allowMock: true });
    const session = await client.createTestCheckoutSession({
      mode: 'payment',
      amountMinorUnits: 2500,
      successUrl: 'https://live.gamostudio.org/my-tickets?order=A1',
      cancelUrl: 'https://live.gamostudio.org/events/concert-1',
    });
    const url = new URL(session.url!);
    assert.equal(url.searchParams.get('order'), 'A1');
    assert.equal(url.searchParams.get('session_id'), session.id);
    assert.equal((session.url!.match(/\?/g) ?? []).length, 1);
  });

  test('createStripeTestClient supports subscription mode for Academy lessons', async () => {
    const client = createStripeTestClient({ secretKey: 'mock_test_key', allowMock: true });

    const session = await client.createTestCheckoutSession({
      mode: 'subscription',
      amountMinorUnits: 12000, // $120/mo
      description: 'Gamo Academy Monthly Keyboard Lessons',
      customerEmail: 'student@example.org',
      successUrl: 'https://academy.gamostudio.org/enrollment/success',
      cancelUrl: 'https://academy.gamostudio.org/programs',
      subscriptionData: {
        trialPeriodDays: 7,
      },
    });

    assert.equal(session.mock, true);
    assert.ok(session.id.startsWith('cs_test_mock_'));
  });

  test('createCustomerPortalSession creates self-service portal link', async () => {
    const client = createStripeTestClient({ secretKey: 'mock_test_key', allowMock: true });

    const portal = await client.createCustomerPortalSession({
      customerId: 'cus_test_123',
      returnUrl: 'https://academy.gamostudio.org/account',
    });

    assert.equal(portal.mock, true);
    assert.ok(portal.id.startsWith('bps_test_mock_'));
    assert.ok(portal.url.includes('portal_mock=true'));
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

  test('rejects signatures created with different secret', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const wrongSecret = 'whsec_wrong_attacker_secret_99999';
    const signatureHeader = await generateSignatureHeader(samplePayload, wrongSecret, nowSec);

    const result = await verifyStripeWebhookSignature(samplePayload, signatureHeader, secret);
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

  test('rejects missing or malformed header', async () => {
    const res1 = await verifyStripeWebhookSignature(samplePayload, null, secret);
    assert.equal(res1.valid, false);
    assert.equal(res1.error, 'Missing stripe-signature header');

    const res2 = await verifyStripeWebhookSignature(samplePayload, 'malformed-header-data', secret);
    assert.equal(res2.valid, false);
    assert.equal(res2.error, 'Malformed stripe-signature header');
  });
});

describe('Webhook Deduplication & Idempotency Store', () => {
  test('correctly tracks and flags previously processed webhook events', () => {
    const store = createMemoryIdempotencyStore();
    const eventId = 'evt_test_checkout_session_unique_456';

    assert.equal(store.hasProcessed(eventId), false);
    store.markProcessed(eventId);
    assert.equal(store.hasProcessed(eventId), true);

    // Unrelated event is not marked
    assert.equal(store.hasProcessed('evt_another_event'), false);
  });
});

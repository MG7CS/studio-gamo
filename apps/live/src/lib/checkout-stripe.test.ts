/** Stripe's side of checkout (lib/checkout-stripe.ts): the webhook route and the local stand-in's hosted pages. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paymentsRuntime, startOrganizationOnboarding } from '@gamo/domain';
import { liveFixture } from './checkout-testing.ts';
import {
  completeStandinCheckout,
  completeStandinOnboarding,
  localRedirect,
  openStandinCheckout,
  openStandinOnboarding,
  receiveWebhook,
  webhookMethodNotAllowed,
} from './checkout-stripe.ts';

const ORIGIN = 'https://live.example.org';
const NOW = Math.floor(Date.now() / 1000);
const standinEvent = () => liveFixture({ flow: 'gamo_collects', startsAt: NOW + 30 * 86_400 }, {}, NOW);

test('stand-in pages exist only with the stand-in; outcomes and redirects are limited to this site', async () => {
  const { live } = await liveFixture({ flow: 'gamo_collects' }, { ALLOW_STRIPE_STANDIN: 'false' });
  assert.equal(await openStandinCheckout(live, { sessionId: 'cs_test_x', now: NOW }), null);
  assert.equal(
    await completeStandinCheckout(live, { sessionId: 'cs_test_x', outcome: 'paid', now: NOW }),
    null,
  );
  assert.equal(await openStandinOnboarding(live, { accountId: 'acct_x' }), null);
  assert.equal(await completeStandinOnboarding(live, { accountId: 'acct_x', now: NOW }), null);
  const standin = await standinEvent();
  assert.equal(await openStandinCheckout(standin.live, { sessionId: 'cs_test_missing', now: NOW }), null);
  assert.equal(await openStandinCheckout(standin.live, { sessionId: '../etc', now: NOW }), null);
  assert.equal(
    await completeStandinCheckout(standin.live, {
      sessionId: 'cs_test_missing',
      outcome: 'refund_all',
      now: NOW,
    }),
    null,
  );
  assert.equal(localRedirect('https://evil.example/orders/x?y=1', '/'), '/orders/x?y=1');
  assert.equal(localRedirect('//evil.example', '/fallback'), '/fallback');
  assert.equal(localRedirect('javascript:alert(1)', '/fallback'), '/fallback');
  assert.equal(localRedirect(null, '/fallback'), '/fallback');
});

test('stand-in onboarding makes the account ready and returns to this site', async () => {
  const { live, seed, exec } = await liveFixture({ flow: 'organizer_account', accountReady: false });
  exec(
    `UPDATE organization_payments SET connected_account_id = NULL WHERE organization_id = '${seed.organizationId}'`,
  );
  const started = await startOrganizationOnboarding(live.db, live.env, {
    organizationId: seed.organizationId,
    refreshUrl: `${ORIGIN}/organizer/organization/payments`,
    returnUrl: `${ORIGIN}/organizer/organization/payments?onboarded=1`,
    now: NOW,
  });
  const accountId = started.connectedAccountId;
  assert.deepEqual(await openStandinOnboarding(live, { accountId }), { id: accountId, ready: false });
  assert.equal(
    await completeStandinOnboarding(live, { accountId, now: NOW }),
    '/organizer/organization/payments?onboarded=1',
  );
  assert.deepEqual(await openStandinOnboarding(live, { accountId }), { id: accountId, ready: true });
  assert.equal(await openStandinOnboarding(live, { accountId: 'acct_missing' }), null);
});

test('the webhook route passes the raw bytes and the signature, answers with no-store; other methods 405', async () => {
  const seen: Array<{ body: Uint8Array; signature: string | null; endpoint: string }> = [];
  const runtime = {
    receive: async (
      body: string | Uint8Array,
      signature: string | null,
      endpoint: 'platform' | 'connect',
    ) => {
      seen.push({ body: body as Uint8Array, signature, endpoint });
      return { status: 400, body: 'signature' };
    },
  };
  const res = await receiveWebhook(
    runtime,
    new Request('https://live.example.org/api/stripe/connect-webhook', {
      method: 'POST',
      body: new Uint8Array([123, 34, 105, 100, 34, 58, 49, 125]),
      headers: { 'Stripe-Signature': 't=1,v1=abc' },
    }),
    'connect',
  );
  assert.equal(res.status, 400);
  assert.equal(await res.text(), 'signature');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.ok(seen[0].body instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(seen[0].body), '{"id":1}');
  assert.equal(seen[0].signature, 't=1,v1=abc');
  assert.equal(seen[0].endpoint, 'connect');

  const real = await standinEvent();
  const unsigned = await receiveWebhook(
    paymentsRuntime(real.live.db, real.live.env),
    new Request('https://live.example.org/api/stripe/webhook', { method: 'POST', body: '{}' }),
    'platform',
  );
  assert.equal(unsigned.status, 400, 'no signature: refused');

  const wrong = webhookMethodNotAllowed();
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'POST');
});

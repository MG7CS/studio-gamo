import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createStripeTestClient, StripeApiError } from './stripe.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch with a scripted sequence of responses and records each request. */
function stubFetch(responses: Array<() => Response>) {
  const calls: Request[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Request(input, init));
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  }) as typeof fetch;
  return calls;
}
const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const checkout = {
  mode: 'payment' as const,
  amountMinorUnits: 2500,
  successUrl: 'https://academy.example.test/registrations/receipt?ref=A1',
  cancelUrl: 'https://academy.example.test/register/x',
};

test('Stripe: idempotency key is sent and one retry follows a 5xx', async () => {
  const calls = stubFetch([
    json(500, { error: { type: 'api_error' } }),
    json(200, { id: 'cs_1', url: 'https://x' }),
  ]);
  const session = await createStripeTestClient({ secretKey: 'sk_test_abc' }).createTestCheckoutSession({
    ...checkout,
    idempotencyKey: 'checkout_session_ord_1',
  });
  assert.equal(session.id, 'cs_1');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers.get('idempotency-key'), 'checkout_session_ord_1');
  assert.equal(calls[1].headers.get('idempotency-key'), 'checkout_session_ord_1');
});

test('Stripe: no retry on 4xx or without an idempotency key; errors carry the code, not the body', async () => {
  stubFetch([json(400, { error: { code: 'parameter_invalid_integer', message: 'secret detail' } })]);
  await assert.rejects(
    createStripeTestClient({ secretKey: 'sk_test_abc' }).createTestCheckoutSession({
      ...checkout,
      idempotencyKey: 'k',
    }),
    (err: unknown) =>
      err instanceof StripeApiError &&
      err.status === 400 &&
      err.code === 'parameter_invalid_integer' &&
      !err.message.includes('secret detail'),
  );
  const calls = stubFetch([json(503, {})]);
  await assert.rejects(
    createStripeTestClient({ secretKey: 'sk_test_abc' }).createTestCheckoutSession(checkout),
  );
  assert.equal(calls.length, 1);
});

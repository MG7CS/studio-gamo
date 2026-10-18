import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TURNSTILE_DUMMY_TOKEN, TURNSTILE_SITEVERIFY_URL, verifyTurnstile } from './turnstile.ts';

const SECRET = '0x4AAAAAAA-test-secret';

function fakeFetch(respond: (url: string, body: URLSearchParams) => Response | Promise<Response>) {
  const calls: Array<{ url: string; body: URLSearchParams; method?: string }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body as URLSearchParams;
    calls.push({ url: String(url), body, method: init?.method });
    return respond(String(url), body);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

test('posts a form body to siteverify with secret, token, remote IP and idempotency key', async () => {
  const f = fakeFetch(() => json({ success: true, hostname: 'live.gamostudio.org', action: 'rsvp' }));
  const r = await verifyTurnstile({
    token: 'tok',
    secret: SECRET,
    remoteIp: '203.0.113.7',
    idempotencyKey: 'idem-1',
    fetchImpl: f.impl,
    expectedHostname: 'live.gamostudio.org',
    expectedAction: 'rsvp',
  });
  assert.deepEqual(r, { ok: true, mocked: false, hostname: 'live.gamostudio.org', action: 'rsvp' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, TURNSTILE_SITEVERIFY_URL);
  assert.equal(f.calls[0].method, 'POST');
  assert.ok(f.calls[0].body instanceof URLSearchParams);
  assert.deepEqual(Object.fromEntries(f.calls[0].body), {
    secret: SECRET,
    response: 'tok',
    remoteip: '203.0.113.7',
    idempotency_key: 'idem-1',
  });
});

test('fails closed without a secret outside local; local mock accepts only the dummy token', async () => {
  const f = fakeFetch(() => json({ success: true }));
  assert.deepEqual(await verifyTurnstile({ token: 'tok', secret: undefined, fetchImpl: f.impl }), {
    ok: false,
    reason: 'not_configured',
  });
  assert.deepEqual(await verifyTurnstile({ token: 'tok', secret: '  ', fetchImpl: f.impl }), {
    ok: false,
    reason: 'not_configured',
  });
  assert.deepEqual(
    await verifyTurnstile({ token: TURNSTILE_DUMMY_TOKEN, secret: '', allowMock: true, fetchImpl: f.impl }),
    {
      ok: true,
      mocked: true,
    },
  );
  const wrong = await verifyTurnstile({ token: 'forged', secret: '', allowMock: true, fetchImpl: f.impl });
  assert.equal(wrong.ok, false);
  assert.equal(!wrong.ok && wrong.reason, 'rejected');
  assert.equal(f.calls.length, 0, 'no network call without a secret');
});

test('missing or oversized tokens are rejected before any call', async () => {
  const f = fakeFetch(() => json({ success: true }));
  for (const token of [undefined, null, '', '   ', 'x'.repeat(2049)])
    assert.deepEqual(await verifyTurnstile({ token, secret: SECRET, fetchImpl: f.impl }), {
      ok: false,
      reason: 'missing_token',
    });
  assert.equal(f.calls.length, 0);
});

test('maps Cloudflare answers: rejected, misconfigured secret, internal error, HTTP errors, bad JSON, network errors', async () => {
  const run = (respond: () => Response | Promise<Response>) =>
    verifyTurnstile({ token: 'tok', secret: SECRET, fetchImpl: fakeFetch(respond).impl });
  assert.deepEqual(await run(() => json({ success: false, 'error-codes': ['timeout-or-duplicate'] })), {
    ok: false,
    reason: 'rejected',
    errorCodes: ['timeout-or-duplicate'],
  });
  assert.equal(
    ((await run(() => json({ success: false, 'error-codes': ['invalid-input-secret'] }))) as any).reason,
    'not_configured',
  );
  assert.equal(
    ((await run(() => json({ success: false, 'error-codes': ['internal-error'] }))) as any).reason,
    'unavailable',
  );
  assert.deepEqual(await run(() => json({}, 500)), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await run(() => new Response('<html>', { status: 200 })), {
    ok: false,
    reason: 'unavailable',
  });
  assert.deepEqual(await run(() => Promise.reject(new TypeError('network down'))), {
    ok: false,
    reason: 'unavailable',
  });
  assert.deepEqual(await run(() => json({ success: 'yes' })), {
    ok: false,
    reason: 'rejected',
    errorCodes: [],
  });
});

test('hostname and action must match when expected; a slow siteverify times out as unavailable', async () => {
  const ok = fakeFetch(() => json({ success: true, hostname: 'evil.example', action: 'login' }));
  assert.deepEqual(
    await verifyTurnstile({
      token: 't',
      secret: SECRET,
      fetchImpl: ok.impl,
      expectedHostname: 'live.gamostudio.org',
    }),
    { ok: false, reason: 'hostname_mismatch' },
  );
  assert.deepEqual(
    await verifyTurnstile({ token: 't', secret: SECRET, fetchImpl: ok.impl, expectedAction: 'rsvp' }),
    {
      ok: false,
      reason: 'action_mismatch',
    },
  );
  const slow = (async (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
  const started = Date.now();
  assert.deepEqual(await verifyTurnstile({ token: 't', secret: SECRET, fetchImpl: slow, timeoutMs: 50 }), {
    ok: false,
    reason: 'unavailable',
  });
  assert.ok(Date.now() - started < 2000);
});

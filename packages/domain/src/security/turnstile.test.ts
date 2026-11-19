import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TURNSTILE_DUMMY_TOKEN, verifyTurnstile } from './turnstile.ts';

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

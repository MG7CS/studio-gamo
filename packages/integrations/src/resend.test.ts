import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResendClient } from './resend.ts';

function recorder(responses: Array<() => Response>) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  }) as typeof fetch;
  return { impl, calls };
}

test('failures carry a short error code; no key and no mock → not_configured without a request', async () => {
  const r = recorder([() => new Response('{}', { status: 422 })]);
  const failed = await createResendClient({ apiKey: 're_live_example_key', fetchImpl: r.impl }).send({
    to: 'a@example.test',
    subject: 's',
    text: 't',
  });
  assert.equal(failed.success, false);
  assert.equal(failed.status, 422);
  assert.equal(failed.errorCode, 'http_422');

  const none = recorder([]);
  const off = await createResendClient({ fetchImpl: none.impl }).send({ to: 'a@example.test', subject: 's' });
  assert.equal(off.notConfigured, true);
  assert.equal(off.errorCode, 'not_configured');
  assert.equal(none.calls.length, 0);
  const mocked = await createResendClient({ allowMock: true, fetchImpl: none.impl }).send({
    to: 'a@example.test',
    subject: 's',
  });
  assert.equal(mocked.mock, true);
  assert.equal(none.calls.length, 0);
});

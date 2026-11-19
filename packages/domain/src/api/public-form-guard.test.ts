import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  PUBLIC_FORM_MAX_BYTES,
  readBoundedBody,
  readPublicFormBody,
  guardPublicForm,
  TURNSTILE_RESPONSE_FIELD,
} from './public-form-guard.ts';
import { TURNSTILE_DUMMY_TOKEN } from '../security/turnstile.ts';

const PII = 'pii-hash-secret-for-guard-tests-0000000001';
const TS_SECRET = 'turnstile-secret-for-tests';
const T0 = 1_900_000_020;

function siteverify(answer: Record<string, unknown> | 'down') {
  const calls: URLSearchParams[] = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(new URLSearchParams(String(init?.body)));
    if (answer === 'down') return new Response('nope', { status: 502 });
    return Response.json(answer);
  }) as typeof fetch;
  return { impl, calls };
}

const formRequest = (fields: Record<string, string>, ip = '203.0.113.9') =>
  new Request('https://live.example.test/events/sample/rsvp', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip },
    body: new URLSearchParams(fields).toString(),
  });

const limits = {
  perIp: { limit: 3, windowSeconds: 60 },
  perEmail: { limit: 2, windowSeconds: 600 },
};

const roomy = { perIp: { limit: 100, windowSeconds: 60 } };

async function env(extra: Record<string, unknown> = {}) {
  return {
    ENVIRONMENT: 'production',
    DB: await createMigratedD1(),
    PII_HASH_SECRET: PII,
    TURNSTILE_SECRET_KEY: TS_SECRET,
    ...extra,
  };
}

test('missing token → 400 TURNSTILE_REQUIRED tied to the field; rejected → 403; siteverify down → 503', async () => {
  const e = await env();
  const missing = await guardPublicForm(
    { request: formRequest({ email: 'sam@example.org' }), env: e },
    { route: 'live.rsvp', limits: roomy, now: T0, fetchImpl: siteverify({ success: true }).impl },
  );
  assert.ok(!missing.ok);
  assert.equal(missing.response.status, 400);
  const body = (await missing.response.json()) as any;
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'TURNSTILE_REQUIRED');
  assert.deepEqual(body.error.details[0].field, TURNSTILE_RESPONSE_FIELD);

  const rejected = await guardPublicForm(
    { request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: 'bad' }), env: e },
    {
      route: 'live.rsvp',
      limits: roomy,
      now: T0,
      fetchImpl: siteverify({ success: false, 'error-codes': ['invalid-input-response'] }).impl,
    },
  );
  assert.ok(!rejected.ok);
  assert.equal(rejected.response.status, 403);
  assert.equal(((await rejected.response.json()) as any).error.code, 'TURNSTILE_FAILED');

  const wrongAction = await guardPublicForm(
    { request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: 'tok' }), env: e },
    {
      route: 'live.rsvp',
      turnstileAction: 'rsvp',
      limits: roomy,
      now: T0,
      fetchImpl: siteverify({ success: true, action: 'find-tickets' }).impl,
    },
  );
  assert.ok(!wrongAction.ok);
  assert.equal(wrongAction.error.code, 'TURNSTILE_FAILED');

  const down = await guardPublicForm(
    { request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: 'tok' }), env: e },
    { route: 'live.rsvp', limits: roomy, now: T0, fetchImpl: siteverify('down').impl },
  );
  assert.ok(!down.ok);
  assert.equal(down.response.status, 503);
});

test('not configured: preview/production answer 503 (no siteverify call); local accepts only the dummy token', async () => {
  for (const ENVIRONMENT of ['preview', 'production', undefined]) {
    const sv = siteverify({ success: true });
    const r = await guardPublicForm(
      {
        request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: TURNSTILE_DUMMY_TOKEN }),
        env: await env({ ENVIRONMENT, TURNSTILE_SECRET_KEY: undefined }),
      },
      { route: 'live.rsvp', limits, now: T0, fetchImpl: sv.impl },
    );
    assert.ok(!r.ok, String(ENVIRONMENT));
    assert.equal(r.response.status, 503);
    const body = (await r.response.json()) as any;
    assert.equal(body.error.code, 'UNAVAILABLE');
    assert.match(body.error.message, /try again later/);
    assert.equal(sv.calls.length, 0);
  }
  const noPii = await guardPublicForm(
    {
      request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: 'tok' }),
      env: await env({ PII_HASH_SECRET: 'short' }),
    },
    { route: 'live.rsvp', limits, now: T0, fetchImpl: siteverify({ success: true }).impl },
  );
  assert.ok(!noPii.ok);
  assert.equal(noPii.response.status, 503);
  const noDb = await guardPublicForm(
    { request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: 'tok' }), env: { ...(await env()), DB: undefined } },
    { route: 'live.rsvp', limits, now: T0, fetchImpl: siteverify({ success: true }).impl },
  );
  assert.ok(!noDb.ok);
  assert.equal(noDb.response.status, 503);

  const localEnv = await env({
    ENVIRONMENT: 'local',
    TURNSTILE_SECRET_KEY: undefined,
    PII_HASH_SECRET: undefined,
  });
  const ok = await guardPublicForm(
    { request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: TURNSTILE_DUMMY_TOKEN }), env: localEnv },
    { route: 'live.rsvp', limits, now: T0 },
  );
  assert.ok(ok.ok);
  assert.equal(ok.turnstileMocked, true);
  const notDummy = await guardPublicForm(
    { request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: 'anything-else' }), env: localEnv },
    { route: 'live.rsvp', limits, now: T0 },
  );
  assert.ok(!notDummy.ok);
  assert.equal(notDummy.error.code, 'TURNSTILE_FAILED');
});

test('per-IP limit: 429 with Retry-After and a message saying how long to wait; other IPs unaffected', async () => {
  const e = await env();
  const sv = siteverify({ success: true });
  const send = (ip: string, now = T0 + 10) =>
    guardPublicForm(
      { request: formRequest({ [TURNSTILE_RESPONSE_FIELD]: 'tok' }, ip), env: e },
      { route: 'live.find', limits: { perIp: { limit: 3, windowSeconds: 600 } }, now, fetchImpl: sv.impl },
    );
  for (let i = 0; i < 3; i++) assert.ok((await send('198.51.100.1')).ok);
  const blocked = await send('198.51.100.1');
  assert.ok(!blocked.ok);
  assert.equal(blocked.response.status, 429);
  const retryAfter = Number(blocked.response.headers.get('retry-after'));
  assert.ok(retryAfter > 0 && retryAfter <= 600);
  const body = (await blocked.response.json()) as any;
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.match(body.error.message, /wait about \d+ minutes/);
  assert.equal(sv.calls.length, 3, 'a rate-limited request never reaches siteverify');
  assert.ok((await send('198.51.100.2')).ok);
});

test('bodies: malformed JSON, arrays, unknown content types and oversize bodies are refused', async () => {
  const e = await env();
  const opts = { route: 'live.rsvp', limits, now: T0 };
  const raw = (body: string, type: string) =>
    new Request('https://live.example.test/x', { method: 'POST', headers: { 'content-type': type }, body });
  for (const req of [
    raw('{oops', 'application/json'),
    raw('[1]', 'application/json'),
    new Request('https://live.example.test/x', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new Uint8Array([0x61, 0x3d, 0xff, 0xfe]), // invalid UTF-8
    }),
  ]) {
    const r = await guardPublicForm({ request: req, env: e }, opts);
    assert.ok(!r.ok);
    assert.equal(r.response.status, 400);
  }
  const plain = await guardPublicForm({ request: raw('a=b', 'text/plain'), env: e }, opts);
  assert.ok(!plain.ok);
  assert.equal(plain.response.status, 415);
  const big = await guardPublicForm(
    { request: raw(`a=${'x'.repeat(70_000)}`, 'application/x-www-form-urlencoded'), env: e },
    opts,
  );
  assert.ok(!big.ok);
  assert.equal(big.response.status, 413);
  await assert.rejects(
    guardPublicForm({ request: formRequest({}), env: e }, { ...opts, route: 'Bad Route' }),
    RangeError,
  );
});

/** A streamed body with no Content-Length (or a lying one); counts how many chunks were pulled. */
function streamed(totalBytes: number, chunk = 8192, headers: Record<string, string> = {}) {
  let sent = 0;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      if (sent >= totalBytes) return controller.close();
      const n = Math.min(chunk, totalBytes - sent);
      sent += n;
      controller.enqueue(new Uint8Array(n).fill(0x61));
    },
  });
  const request = new Request('https://live.example.test/x', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  return { request, pulls: () => pulls };
}

test('size limit counts bytes as they stream: no Content-Length and a lying Content-Length both get 413 early', async () => {
  const noLength = streamed(10 * 1024 * 1024);
  const r1 = await readPublicFormBody(noLength.request);
  assert.ok(!r1.ok);
  assert.equal(r1.error.status, 413);
  assert.match(r1.error.message, /too large/);
  assert.ok(noLength.pulls() < 20, 'reading stops right after the limit (not the whole 10 MB)');

  const lying = streamed(1024 * 1024, 8192, { 'content-length': '10' });
  const r2 = await readPublicFormBody(lying.request);
  assert.ok(!r2.ok);
  assert.equal(r2.error.status, 413);

  const honestBig = new Request('https://live.example.test/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(PUBLIC_FORM_MAX_BYTES + 1) },
    body: '{}',
  });
  const r3 = await readPublicFormBody(honestBig);
  assert.ok(!r3.ok);
  assert.equal(r3.error.status, 413, 'an honest oversize Content-Length is refused without reading');

  const exact = await readBoundedBody(streamed(PUBLIC_FORM_MAX_BYTES).request, PUBLIC_FORM_MAX_BYTES);
  assert.ok(exact.ok && exact.bytes.byteLength === PUBLIC_FORM_MAX_BYTES, 'exactly the limit is fine');
  await assert.rejects(readBoundedBody(streamed(1).request, 0), RangeError);
});

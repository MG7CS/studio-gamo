import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import {
  describeWait,
  guardPublicForm,
  guardPublicFormForPage,
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

const jsonRequest = (body: unknown, ip = '203.0.113.9') =>
  new Request('https://live.example.test/api/rsvp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
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

test('success: verifies the token, returns the parsed body and hashes; form and JSON bodies', async () => {
  const e = await env();
  const sv = siteverify({ success: true, action: 'rsvp', hostname: 'live.example.test' });
  const r = await guardPublicForm(
    {
      request: formRequest({ email: 'Sam@Example.org', name: 'Sam', [TURNSTILE_RESPONSE_FIELD]: 'tok-1' }),
      env: e,
    },
    { route: 'live.rsvp', turnstileAction: 'rsvp', limits, now: T0, fetchImpl: sv.impl },
  );
  assert.ok(r.ok);
  assert.equal(r.body.get('name'), 'Sam');
  assert.match(r.ipHash, /^[0-9a-f]{64}$/);
  assert.match(r.emailHash ?? '', /^[0-9a-f]{64}$/);
  assert.equal(r.turnstileMocked, false);
  assert.equal(sv.calls.length, 1);
  assert.equal(sv.calls[0].get('response'), 'tok-1');
  assert.equal(sv.calls[0].get('remoteip'), '203.0.113.9');

  const j = await guardPublicForm(
    {
      request: jsonRequest({
        email: 'sam@example.org',
        quantity: 2,
        names: ['A', 'B'],
        [TURNSTILE_RESPONSE_FIELD]: 'tok-2',
      }),
      env: e,
    },
    { route: 'live.rsvp', limits, now: T0, fetchImpl: sv.impl },
  );
  assert.ok(j.ok);
  assert.equal(j.body.type, 'json');
  assert.equal(j.body.get('quantity'), '2');
  assert.deepEqual(j.body.getAll('names'), ['A', 'B']);
  assert.equal(j.emailHash, r.emailHash, 'the email hash is normalised (case-insensitive)');
});

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

test('per-email limit counts the normalised address across IPs, after Turnstile', async () => {
  const e = await env();
  const ok = siteverify({ success: true });
  const send = (email: string, ip: string, fetchImpl = ok.impl) =>
    guardPublicForm(
      { request: formRequest({ email, [TURNSTILE_RESPONSE_FIELD]: 'tok' }, ip), env: e },
      { route: 'live.find', limits: { perEmail: { limit: 2, windowSeconds: 3600 } }, now: T0, fetchImpl },
    );
  // Failed Turnstile attempts do not use up the victim's email budget.
  const bad = siteverify({ success: false, 'error-codes': ['invalid-input-response'] });
  for (let i = 0; i < 5; i++) assert.ok(!(await send('victim@example.org', '192.0.2.1', bad.impl)).ok);
  assert.ok((await send('victim@example.org', '192.0.2.2')).ok);
  assert.ok((await send(' VICTIM@example.org ', '192.0.2.3')).ok);
  const blocked = await send('victim@example.org', '192.0.2.4');
  assert.ok(!blocked.ok);
  assert.equal(blocked.response.status, 429);
  assert.ok(Number(blocked.response.headers.get('retry-after')) > 0);
  assert.match(blocked.error.message, /this email address/);
  assert.ok((await send('other@example.org', '192.0.2.4')).ok);
  const noEmail = await send('', '192.0.2.5');
  assert.ok(noEmail.ok && noEmail.emailHash === undefined, 'no email → limit skipped, validation decides');
});

test('page variant returns an inline error (field id for the summary link) instead of JSON', async () => {
  const e = await env();
  const r = await guardPublicFormForPage(
    { request: formRequest({ email: 'sam@example.org' }), env: e },
    { route: 'live.rsvp', limits, now: T0, turnstileFieldId: 'rsvp-turnstile' },
  );
  assert.ok(!r.ok);
  assert.equal(r.error.status, 400);
  assert.equal(r.error.field, TURNSTILE_RESPONSE_FIELD);
  assert.equal(r.error.fieldId, 'rsvp-turnstile');
  assert.equal(r.error.headers['Cache-Control'], 'no-store');
  assert.ok(!('response' in r));
});

test('bodies: malformed JSON, arrays, unknown content types and oversize bodies are refused', async () => {
  const e = await env();
  const opts = { route: 'live.rsvp', limits, now: T0 };
  const raw = (body: string, type: string) =>
    new Request('https://live.example.test/x', { method: 'POST', headers: { 'content-type': type }, body });
  for (const req of [
    raw('{oops', 'application/json'),
    raw('[1]', 'application/json'),
    raw('a=b', 'text/plain'),
  ]) {
    const r = await guardPublicForm({ request: req, env: e }, opts);
    assert.ok(!r.ok);
    assert.equal(r.response.status, 400);
  }
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

test('describeWait phrases the wait for people', () => {
  assert.equal(describeWait(1), '1 second');
  assert.equal(describeWait(42), '42 seconds');
  assert.equal(describeWait(60), 'about 1 minute');
  assert.equal(describeWait(61), 'about 2 minutes');
  assert.equal(describeWait(3600), 'about 1 hour');
  assert.equal(describeWait(7201), 'about 3 hours');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import type { GamoEnv } from '@gamo/config/env';
import { TURNSTILE_DUMMY_TOKEN } from '../security/turnstile.ts';
import { seedDefaultForms } from './seeds.ts';
import { FormsService } from './service.ts';
import { FORM_TURNSTILE_ACTION, readSentReference, submitFormPage, UPLOAD_TOKEN_FIELD } from './http.ts';

const NOW = 1_900_000_000;
const SECRET = 'form-sent-secret-for-tests-00000000001';

async function setup() {
  const d1 = await createMigratedD1();
  await seedDefaultForms(d1, NOW);
  const env = {
    ENVIRONMENT: 'local',
    DB: d1,
    FORM_UPLOAD_SECRET: SECRET,
    INQUIRY_INBOX_EMAIL: 'inbox@gamostudio.org',
    RESEND_API_KEY: 're_test_example_key',
  } as unknown as GamoEnv;
  const sent: string[] = [];
  const email = {
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      sent.push(String(JSON.parse(String(init?.body)).subject));
      return Response.json({ id: `re_${sent.length}` });
    }) as typeof fetch,
  };
  const count = (table: string) =>
    (d1.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { d1, env, sent, email, count };
}

const REQUEST_ANSWERS: Record<string, string | string[]> = {
  church_name: 'Sample Church',
  name: 'Sample Pastor',
  email: 'pastor@example.org',
  phone: '555-0100',
  service_date: '2030-04-07',
  start_time: '10:00',
  address: '1 Example Way, Phoenix, AZ',
  service_type: 'Sunday service',
  roles_needed: ['Keys', 'Drums'],
  terms: [
    'I agree that Gamo Studios may use these details to arrange musicians and contact me, as described in the privacy notice.',
  ],
};

function post(
  fields: Record<string, string | string[]>,
  over: { turnstile?: string | null; ip?: string } = {},
) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) body.append(k, one);
  const token = over.turnstile === undefined ? TURNSTILE_DUMMY_TOKEN : over.turnstile;
  if (token) body.set('cf-turnstile-response', token);
  return new Request('https://gamostudio.org/worship/request', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'cf-connecting-ip': over.ip ?? '203.0.113.7',
    },
    body,
  });
}

const adminUrlFor = (id: string) => `https://admin.gamostudio.org/submissions/${id}`;

test('a valid church request is stored, becomes a service request, sends both emails and signs its reference', async () => {
  const s = await setup();
  const out = await submitFormPage({
    slug: 'worship-request',
    env: s.env,
    db: s.d1,
    request: post({ ...REQUEST_ANSWERS, idempotency_key: 'key-aaaaaaaaaaaaaaaa' }),
    locals: {},
    uploads: null,
    adminUrlFor,
    now: NOW,
    email: s.email,
  });
  assert.equal(out.kind, 'sent');
  if (out.kind !== 'sent') return;
  assert.match(out.reference, /^GW-2030-\d{4}$/);
  assert.deepEqual(out.hookFailures, []);
  assert.equal(s.count('form_submissions'), 1);
  assert.equal(s.count('service_requests'), 1);
  assert.equal(s.sent.length, 2, 'receipt and staff notice');
  assert.ok(
    s.sent.every((subject) => !subject.includes('Sample Pastor')),
    'no names in subjects',
  );
  assert.equal(await readSentReference(s.env, out.signedReference, NOW + 10), out.reference);
  assert.equal(await readSentReference(s.env, out.signedReference, NOW + 7200), null, 'expires');
  assert.equal(await readSentReference(s.env, `${out.reference}.${NOW + 99999}.forged`, NOW), null);
  assert.equal(await readSentReference(s.env, null, NOW), null);
});

test('posting the same form twice stores it once and sends no second email', async () => {
  const s = await setup();
  const send = () =>
    submitFormPage({
      slug: 'worship-request',
      env: s.env,
      db: s.d1,
      request: post({ ...REQUEST_ANSWERS, idempotency_key: 'key-bbbbbbbbbbbbbbbb' }),
      locals: {},
      uploads: null,
      adminUrlFor,
      now: NOW,
      email: s.email,
    });
  const first = await send();
  const second = await send();
  assert.equal(first.kind, 'sent');
  assert.equal(second.kind, 'sent');
  assert.equal(s.count('form_submissions'), 1);
  assert.equal(s.sent.length, 2);
});

test('invalid answers redisplay with the errors and every value kept, and store nothing', async () => {
  const s = await setup();
  const out = await submitFormPage({
    slug: 'worship-request',
    env: s.env,
    db: s.d1,
    request: post({
      ...REQUEST_ANSWERS,
      church_name: '',
      email: 'not-an-email',
      idempotency_key: 'key-cccccccccccccccc',
    }),
    locals: {},
    uploads: null,
    adminUrlFor,
    now: NOW,
    email: s.email,
  });
  assert.equal(out.kind, 'redisplay');
  if (out.kind !== 'redisplay') return;
  assert.equal(out.status, 422);
  assert.ok(out.errors.some((e) => e.questionId === 'church_name'));
  assert.ok(out.errors.some((e) => e.questionId === 'email'));
  assert.equal(out.values.name, 'Sample Pastor');
  assert.deepEqual(out.values.roles_needed, ['Keys', 'Drums']);
  assert.equal(out.idempotencyKey, 'key-cccccccccccccccc', 'the same key is kept for the retry');
  assert.equal(s.count('form_submissions'), 0);
  assert.equal(s.sent.length, 0);
});

test('a missing bot check is refused with a message for the widget and nothing is stored', async () => {
  const s = await setup();
  const out = await submitFormPage({
    slug: 'worship-request',
    env: s.env,
    db: s.d1,
    request: post(REQUEST_ANSWERS, { turnstile: null }),
    locals: {},
    uploads: null,
    adminUrlFor,
    now: NOW,
    email: s.email,
  });
  assert.equal(out.kind, 'redisplay');
  if (out.kind !== 'redisplay') return;
  assert.ok(out.status === 400 || out.status === 403);
  assert.ok(out.turnstileError);
  assert.equal(s.count('form_submissions'), 0);
});

test('too many posts from one address are limited before anything is stored', async () => {
  const s = await setup();
  let limited = 0;
  for (let i = 0; i < 22; i++) {
    const out = await submitFormPage({
      slug: 'worship-request',
      env: s.env,
      db: s.d1,
      request: post({ ...REQUEST_ANSWERS, church_name: '' }, { ip: '198.51.100.9' }),
      locals: {},
      uploads: null,
      adminUrlFor,
      now: NOW,
      email: s.email,
    });
    if (out.kind === 'redisplay' && out.status === 429) limited++;
  }
  assert.ok(limited >= 1, 'the per-IP limit answers 429');
});

test('an unknown form is not_found and a closed form is closed', async () => {
  const s = await setup();
  const base = { env: s.env, db: s.d1, locals: {}, uploads: null, adminUrlFor, now: NOW, email: s.email };
  assert.deepEqual(await submitFormPage({ ...base, slug: 'no-such-form', request: post(REQUEST_ANSWERS) }), {
    kind: 'not_found',
  });
  const forms = new FormsService(s.d1, { now: NOW });
  const form = await forms.findBySlug('worship-request');
  await forms.close(form!.id, { now: NOW });
  assert.deepEqual(
    await submitFormPage({ ...base, slug: 'worship-request', request: post(REQUEST_ANSWERS) }),
    { kind: 'closed' },
  );
});

test('the form and the guard agree on one Turnstile action, and the token field is not an answer', () => {
  assert.match(FORM_TURNSTILE_ACTION, /^[A-Za-z0-9_-]{1,32}$/);
  assert.equal(UPLOAD_TOKEN_FIELD, 'upload_session_token');
});

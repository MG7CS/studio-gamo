import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import type { GamoEnv } from '@gamo/config/env';
import { TURNSTILE_DUMMY_TOKEN } from '../security/turnstile.ts';
import { seedDefaultForms } from './seeds.ts';
import { FormsService } from './service.ts';
import { UploadService } from './uploads.ts';
import { FakeBucket, fakeImages, withHeader } from './uploads-test-support.ts';
import { parseFormSchema } from './schema.ts';
import { readSentReference, submitFormPage } from './http.ts';

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

// ---- files posted inside the form (a browser without JavaScript) -----------------------------------------

async function withPhotoForm() {
  const s = await setup();
  const forms = new FormsService(s.d1, { now: NOW });
  const form = await forms.create({
    slug: 'photo-contact',
    program: 'web',
    kind: 'contact',
    title: 'Photo contact',
    staffId: 'staff_1',
    now: NOW,
  });
  const { revision } = await forms.saveDraft({
    formId: form.id,
    expectedRevision: form.revision,
    staffId: 'staff_1',
    now: NOW,
    schema: parseFormSchema({
      sections: [
        {
          id: 'main',
          title: 'Send',
          questions: [
            { id: 'name', type: 'short_text', label: 'Name', required: true, bind: 'contact.name' },
            {
              id: 'email',
              type: 'short_text',
              label: 'Email',
              required: true,
              bind: 'contact.email',
              validation: { kind: 'email' },
            },
            {
              id: 'photo',
              type: 'file_upload',
              label: 'Photo',
              accept: ['image'],
              maxFiles: 1,
              maxMb: 10,
              required: true,
            },
          ],
        },
      ],
    }),
  });
  await forms.publish({
    formId: form.id,
    expectedRevision: revision,
    changeNote: 'First.',
    staffId: 'staff_1',
    now: NOW,
  });
  const bucket = new FakeBucket();
  const images = fakeImages();
  const uploads = new UploadService(s.d1, bucket, { secret: SECRET, images: images.binding, now: () => NOW });
  return { ...s, bucket, uploads, images };
}

function multipart(
  fields: Record<string, string>,
  files: { field: string; name: string; type: string; bytes: Uint8Array }[],
  ip = '203.0.113.21',
) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('cf-turnstile-response', TURNSTILE_DUMMY_TOKEN);
  for (const f of files)
    form.append(`${f.field}.file`, new File([f.bytes as Uint8Array<ArrayBuffer>], f.name, { type: f.type }));
  return new Request('https://gamostudio.org/contact', {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip },
    body: form,
  });
}

const TEXT = {
  name: 'Sample Visitor',
  email: 'visitor@example.org',
  idempotency_key: 'key-ffffffffffffffff',
};

async function send(s: Awaited<ReturnType<typeof withPhotoForm>>, request: Request) {
  return submitFormPage({
    slug: 'photo-contact',
    env: s.env,
    db: s.d1,
    request,
    locals: {},
    uploads: s.uploads,
    adminUrlFor,
    now: NOW,
    email: s.email,
  });
}

test('a video, a disguised file and an oversized photo are refused next to their question; nothing is stored', async () => {
  const s = await withPhotoForm();
  const cases: [string, { name: string; type: string; bytes: Uint8Array }, RegExp][] = [
    ['video', { name: 'clip.mp4', type: 'video/mp4', bytes: withHeader('mp4', 2000) }, /JavaScript/],
    [
      'disguised',
      { name: 'x.webp', type: 'image/webp', bytes: withHeader('html', 2000) },
      /couldn't be accepted/,
    ],
    [
      'too big',
      { name: 'big.webp', type: 'image/webp', bytes: withHeader('webp', 10 * 1024 * 1024 + 1) },
      /10 MB/,
    ],
    ['wrong type', { name: 'a.zip', type: 'application/zip', bytes: new Uint8Array(100) }, /isn't accepted/],
  ];
  for (const [label, file, message] of cases) {
    const out = await send(
      s,
      multipart({ ...TEXT, idempotency_key: `key-${label.replace(/\W/g, '')}-aaaaaaaaaa` }, [
        { field: 'photo', ...file },
      ]),
    );
    assert.equal(out.kind, 'redisplay', label);
    if (out.kind !== 'redisplay') return;
    assert.equal(out.status, 422, label);
    assert.ok(
      out.errors.some((e) => e.questionId === 'photo' && message.test(e.message)),
      label,
    );
  }
  assert.equal(s.count('form_submissions'), 0);
});

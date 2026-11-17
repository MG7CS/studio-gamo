/**
 * HTTP-level tests for the public form-upload routes and the Stripe webhook served by apps/web. The route
 * handlers are called directly with fake locals, a migrated in-memory D1 and a fake R2 bucket.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createMigratedD1, type SqliteD1 } from '../../packages/db/testing.ts';
import { seedDefaultForms } from '../../packages/domain/src/forms/seeds.ts';
import { InvoiceService } from '../../packages/domain/src/invoices/service.ts';
import { TURNSTILE_DUMMY_TOKEN } from '../../packages/domain/src/security/turnstile.ts';

const ORIGIN = 'https://web.example.test';
const SECRET = 'form-upload-secret-for-web-route-tests-0001';
const PII = 'pii-hash-secret-for-web-route-tests-000000001';
const PART = 8_388_608;
const FORM = 'worship-apply'; // seeded: video_file (video, 500 MB), photo (image, 10 MB), documents (pdf, 5 x 10 MB)

type Handler = (context: never) => Promise<Response> | Response;
const sessionRoute = await import('../../apps/web/src/pages/api/forms/[slug]/upload-session.ts');
const startRoute = await import('../../apps/web/src/pages/api/forms/uploads/index.ts');
const partRoute = await import('../../apps/web/src/pages/api/forms/uploads/[id]/parts/[n].ts');
const completeRoute = await import('../../apps/web/src/pages/api/forms/uploads/[id]/complete.ts');
const deleteRoute = await import('../../apps/web/src/pages/api/forms/uploads/[id]/index.ts');
const stripeRoute = await import('../../apps/web/src/pages/api/webhook/stripe.ts');

// ---- fake R2 -----------------------------------------------------------------------------------------------

async function bytesOf(value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  const chunks: Uint8Array[] = [];
  const reader = value.getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

class FakeBucket {
  objects = new Map<string, Uint8Array>();
  uploads = new Map<string, { key: string; parts: Map<number, { bytes: Uint8Array; etag: string }> }>();
  private n = 0;
  async put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>) {
    this.objects.set(key, await bytesOf(value));
    return { etag: `single-${++this.n}` };
  }
  async get(key: string, options?: { range?: { offset: number; length?: number } }) {
    const found = this.objects.get(key);
    if (!found) return null;
    const start = options?.range?.offset ?? 0;
    const end = options?.range?.length === undefined ? found.length : start + options.range.length;
    const slice = found.slice(start, end);
    return {
      size: found.length,
      body: new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(slice);
          c.close();
        },
      }),
      arrayBuffer: async () =>
        slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer,
    };
  }
  async head(key: string) {
    const found = this.objects.get(key);
    return found ? { size: found.length } : null;
  }
  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
  async createMultipartUpload(key: string) {
    const uploadId = `mpu-${this.uploads.size + 1}`;
    this.uploads.set(uploadId, { key, parts: new Map() });
    return { uploadId, ...this.handle(key, uploadId) };
  }
  resumeMultipartUpload(key: string, uploadId: string) {
    return this.handle(key, uploadId);
  }
  private handle(key: string, uploadId: string) {
    const find = () => {
      const upload = this.uploads.get(uploadId);
      if (!upload) throw new Error('NoSuchUpload');
      return upload;
    };
    return {
      uploadPart: async (partNumber: number, value: ArrayBuffer | Uint8Array) => {
        const etag = `part-${++this.n}`;
        find().parts.set(partNumber, { bytes: await bytesOf(value), etag });
        return { partNumber, etag };
      },
      complete: async (parts: { partNumber: number; etag: string }[]) => {
        const upload = find();
        const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
        const chunks = ordered.map((p) => {
          const stored = upload.parts.get(p.partNumber);
          if (!stored || stored.etag !== p.etag) throw new Error('InvalidPart');
          return stored.bytes;
        });
        this.objects.set(key, Buffer.concat(chunks));
        this.uploads.delete(uploadId);
        return {};
      },
      abort: async () => {
        find();
        this.uploads.delete(uploadId);
      },
    };
  }
}

// ---- harness -----------------------------------------------------------------------------------------------

interface Fixture {
  d1: SqliteD1;
  bucket: FakeBucket;
  env: Record<string, unknown>;
}

async function setup(overrides: Record<string, unknown> = {}): Promise<Fixture> {
  const d1 = await createMigratedD1();
  await seedDefaultForms(d1, 1_900_000_000);
  const bucket = new FakeBucket();
  const env = {
    ENVIRONMENT: 'local',
    DB: d1,
    FORM_UPLOAD_SECRET: SECRET,
    PII_HASH_SECRET: PII,
    MEDIA_BUCKET: bucket,
    ...overrides,
  };
  return { d1, bucket, env };
}

async function call(
  handler: unknown,
  f: Pick<Fixture, 'env'>,
  path: string,
  init: RequestInit & { duplex?: 'half' } = {},
  params: Record<string, string> = {},
): Promise<Response> {
  return (handler as Handler)({
    request: new Request(`${ORIGIN}${path}`, init),
    locals: { runtime: { env: f.env } },
    params,
  } as never);
}

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json', ...headers },
});

const session = (f: Fixture, slug = FORM, token: unknown = TURNSTILE_DUMMY_TOKEN, headers = {}) =>
  call(
    sessionRoute.POST,
    f,
    `/api/forms/${slug}/upload-session`,
    {
      method: 'POST',
      ...json({ turnstileToken: token }, headers),
    },
    { slug },
  );

async function newToken(f: Fixture, slug = FORM): Promise<string> {
  const res = await session(f, slug);
  assert.equal(res.status, 200);
  return ((await res.json()) as { token: string }).token;
}

const start = (f: Fixture, body: Record<string, unknown>, headers = {}) =>
  call(startRoute.POST, f, '/api/forms/uploads', { method: 'POST', ...json(body, headers) });

const MP4 = (size: number) => {
  const out = new Uint8Array(size);
  out.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  return out;
};
const PDF = (size: number) => {
  const out = new Uint8Array(size);
  out.set(Buffer.from('%PDF-1.7'));
  return out;
};

const putPart = (
  f: Fixture,
  uploadId: string,
  n: number | string,
  token: string | null,
  body: Uint8Array,
  extra: Record<string, string> = {},
  withLength = true,
) =>
  call(
    partRoute.PUT,
    f,
    `/api/forms/uploads/${uploadId}/parts/${n}`,
    {
      method: 'PUT',
      body: body as BodyInit,
      headers: {
        'content-type': 'application/octet-stream',
        ...(withLength ? { 'content-length': String(body.byteLength) } : {}),
        ...(token ? { 'x-upload-token': token } : {}),
        ...extra,
      },
    },
    { id: uploadId, n: String(n) },
  );

const complete = (f: Fixture, uploadId: string, token: string | null, headers: Record<string, string> = {}) =>
  call(
    completeRoute.POST,
    f,
    `/api/forms/uploads/${uploadId}/complete`,
    { method: 'POST', headers: { ...(token ? { 'x-upload-token': token } : {}), ...headers } },
    { id: uploadId },
  );

const remove = (f: Fixture, uploadId: string, token: string | null, headers: Record<string, string> = {}) =>
  call(
    deleteRoute.DELETE,
    f,
    `/api/forms/uploads/${uploadId}`,
    { method: 'DELETE', headers: { ...(token ? { 'x-upload-token': token } : {}), ...headers } },
    { id: uploadId },
  );

const errorOf = async (res: Response) =>
  ((await res.json()) as { success: boolean; error: { code: string; message: string } }).error;

function assertNoStore(res: Response, label: string) {
  assert.equal(res.headers.get('cache-control'), 'no-store', `${label}: Cache-Control`);
}

// ---- happy path --------------------------------------------------------------------------------------------

test('full multi-part upload through the HTTP handlers: session, start, two parts, complete, delete', async () => {
  const f = await setup();
  const sessionRes = await session(f);
  assert.equal(sessionRes.status, 200);
  assertNoStore(sessionRes, 'session');
  const sessionBody = (await sessionRes.json()) as { token: string; expiresAt: string };
  assert.deepEqual(Object.keys(sessionBody).sort(), ['expiresAt', 'token'], 'flat body');
  assert.ok(!Number.isNaN(Date.parse(sessionBody.expiresAt)), 'expiresAt is an ISO timestamp');
  assert.ok(Date.parse(sessionBody.expiresAt) > Date.now());
  const { token } = sessionBody;
  assert.ok(!JSON.stringify(sessionBody).includes(SECRET));

  const size = PART + 1000;
  const startRes = await start(f, {
    token,
    questionId: 'video_file',
    filename: 'My Performance.mp4',
    size,
    contentType: 'video/mp4',
  });
  assert.equal(startRes.status, 200);
  assertNoStore(startRes, 'start');
  const started = (await startRes.json()) as { uploadId: string; partSize: number; parts: number };
  assert.equal(started.partSize, PART);
  assert.equal(started.parts, 2);

  const body = MP4(size);
  const p1 = await putPart(f, started.uploadId, 1, token, body.subarray(0, PART));
  assert.equal(p1.status, 200);
  assertNoStore(p1, 'part');
  const p1Body = (await p1.json()) as { etag?: string };
  assert.equal(typeof p1Body.etag, 'string');
  assert.deepEqual(Object.keys(p1Body), ['etag']);
  const p2 = await putPart(f, started.uploadId, 2, token, body.subarray(PART));
  assert.equal(p2.status, 200);
  // A retried part replaces the first answer and is accepted.
  assert.equal((await putPart(f, started.uploadId, 2, token, body.subarray(PART))).status, 200);

  const done = await complete(f, started.uploadId, token);
  assert.equal(done.status, 200);
  assertNoStore(done, 'complete');
  assert.deepEqual(await done.json(), { status: 'verified' });
  // Completing again returns the stored result.
  assert.deepEqual(await (await complete(f, started.uploadId, token)).json(), { status: 'verified' });
  assert.equal([...f.bucket.objects.keys()].filter((k) => k.startsWith('forms/pending/')).length, 1);

  const del = await remove(f, started.uploadId, token);
  assert.equal(del.status, 204);
  assertNoStore(del, 'delete');
  assert.equal(await del.text(), '');
  assert.equal(f.bucket.objects.size, 0, 'the object is gone');
  assert.equal((await remove(f, started.uploadId, token)).status, 204, 'deleting again is a no-op');
});

test('a single-part PDF verifies and a wrong first-bytes file is rejected with 200 status rejected', async () => {
  const f = await setup();
  const token = await newToken(f);
  const open = async (size: number) =>
    (await (
      await start(f, {
        token,
        questionId: 'documents',
        filename: 'cv.pdf',
        size,
        contentType: 'application/pdf',
      })
    ).json()) as { uploadId: string; parts: number };
  const good = await open(2000);
  assert.equal(good.parts, 1);
  assert.equal((await putPart(f, good.uploadId, 1, token, PDF(2000))).status, 200);
  assert.deepEqual(await (await complete(f, good.uploadId, token)).json(), { status: 'verified' });

  const bad = await open(2000);
  assert.equal((await putPart(f, bad.uploadId, 1, token, new Uint8Array(2000).fill(65))).status, 200);
  const rejected = await complete(f, bad.uploadId, token);
  assert.equal(rejected.status, 200);
  const result = (await rejected.json()) as { status: string; reason?: string };
  assert.equal(result.status, 'rejected');
  assert.equal(result.reason, 'content_mismatch');
});

// ---- tokens ------------------------------------------------------------------------------------------------

test('missing, garbage, foreign and expired tokens answer generic 401/404 and never echo the token', async () => {
  const f = await setup();
  const token = await newToken(f);
  const other = await newToken(f);
  const started = (await (
    await start(f, {
      token,
      questionId: 'documents',
      filename: 'a.pdf',
      size: 100,
      contentType: 'application/pdf',
    })
  ).json()) as { uploadId: string };

  // missing / garbage header
  for (const t of [null, 'garbage', `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`]) {
    for (const res of [
      await putPart(f, started.uploadId, 1, t, PDF(100)),
      await complete(f, started.uploadId, t),
      await remove(f, started.uploadId, t),
    ]) {
      assert.equal(res.status, 401, String(t));
      assertNoStore(res, 'token error');
      const text = JSON.stringify(await errorOf(res));
      assert.ok(!text.includes(token) && !text.includes(String(t ?? 'x_x_x')));
    }
  }
  assert.equal(
    (
      await start(f, {
        token: 'garbage',
        questionId: 'documents',
        filename: 'a.pdf',
        size: 1,
        contentType: 'application/pdf',
      })
    ).status,
    401,
  );

  // a valid token of ANOTHER session cannot touch this upload (404, generic)
  const foreignPart = await putPart(f, started.uploadId, 1, other, PDF(100));
  assert.equal(foreignPart.status, 404);
  assert.equal((await errorOf(foreignPart)).code, 'UPLOAD_NOT_FOUND');
  assert.equal((await complete(f, started.uploadId, other)).status, 404);
  assert.equal((await remove(f, started.uploadId, other)).status, 204, 'foreign delete is a silent no-op');
  const stillThere = f.d1.sqlite
    .prepare('SELECT status FROM form_uploads WHERE id = ?')
    .get(started.uploadId) as { status: string };
  assert.equal(stillThere.status, 'started');

  // expired session
  f.d1.sqlite.prepare('UPDATE upload_sessions SET expires_at = 1').run();
  assert.equal((await putPart(f, started.uploadId, 1, token, PDF(100))).status, 401);
  assert.equal((await complete(f, started.uploadId, token)).status, 401);
  assert.equal(
    (
      await start(f, {
        token,
        questionId: 'documents',
        filename: 'a.pdf',
        size: 1,
        contentType: 'application/pdf',
      })
    ).status,
    401,
  );
});

// ---- part rules --------------------------------------------------------------------------------------------

test('part: Content-Length is required and capped before the body is read; bad part numbers are 400', async () => {
  const f = await setup();
  const token = await newToken(f);
  const started = (await (
    await start(f, {
      token,
      questionId: 'documents',
      filename: 'a.pdf',
      size: 100,
      contentType: 'application/pdf',
    })
  ).json()) as { uploadId: string };

  const missing = await putPart(f, started.uploadId, 1, token, PDF(100), {}, false);
  assert.equal(missing.status, 400);
  assert.equal((await errorOf(missing)).code, 'LENGTH_REQUIRED');

  // Over the cap by declaration: refused without pulling a single byte of the stream.
  let pulled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled = true;
        controller.enqueue(new Uint8Array(1024));
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const over = await call(
    partRoute.PUT,
    f,
    `/api/forms/uploads/${started.uploadId}/parts/1`,
    {
      method: 'PUT',
      body: stream,
      duplex: 'half',
      headers: { 'content-length': String(PART + 1), 'x-upload-token': token },
    },
    { id: started.uploadId, n: '1' },
  );
  assert.equal(over.status, 413);
  assert.equal(pulled, false, 'the body was not read');

  // A lying (too small) Content-Length with a bigger body never exceeds the cap.
  const lying = await call(
    partRoute.PUT,
    f,
    `/api/forms/uploads/${started.uploadId}/parts/1`,
    {
      method: 'PUT',
      body: new Uint8Array(PART + 500),
      headers: { 'content-length': '10', 'x-upload-token': token },
    },
    { id: started.uploadId, n: '1' },
  );
  assert.equal(lying.status, 413);

  // Declared length differs from the body.
  const mismatch = await call(
    partRoute.PUT,
    f,
    `/api/forms/uploads/${started.uploadId}/parts/1`,
    { method: 'PUT', body: PDF(100), headers: { 'content-length': '200', 'x-upload-token': token } },
    { id: started.uploadId, n: '1' },
  );
  assert.equal(mismatch.status, 400);

  for (const n of ['0', 'x', '-1', '1001', '1.5']) {
    assert.equal((await putPart(f, started.uploadId, n, token, PDF(100))).status, 400, n);
  }
  // Part 2 of a one-part upload is a sequence error from the service.
  assert.equal((await putPart(f, started.uploadId, 2, token, PDF(100))).status, 409);
  assert.equal(f.bucket.objects.size, 0, 'nothing was stored by the refused parts');
});

// ---- start: question and type rules ------------------------------------------------------------------------

test('start: the question must be a file_upload of the session form that accepts the type and size', async () => {
  const f = await setup();
  const token = await newToken(f);
  const base = { token, filename: 'x', size: 1000 };
  // wrong type for the question (video question, image file)
  const wrongType = await start(f, { ...base, questionId: 'video_file', contentType: 'image/png' });
  assert.equal(wrongType.status, 400);
  assert.equal((await errorOf(wrongType)).code, 'UPLOAD_TYPE');
  // a type our allowlist never accepts
  assert.equal((await start(f, { ...base, questionId: 'documents', contentType: 'text/html' })).status, 400);
  // unknown question, and a question that is not a file_upload
  assert.equal((await start(f, { ...base, questionId: 'nope', contentType: 'video/mp4' })).status, 400);
  const notFile = await db_question(f);
  assert.equal((await start(f, { ...base, questionId: notFile, contentType: 'video/mp4' })).status, 400);
  // over the question's own cap (photo question is 10 MB)
  assert.equal(
    (await start(f, { ...base, questionId: 'photo', size: 11 * 1_048_576, contentType: 'image/jpeg' }))
      .status,
    400,
  );
  // bad shapes
  assert.equal(
    (await start(f, { ...base, questionId: 'photo', size: '10', contentType: 'image/png' })).status,
    400,
  );
  assert.equal(
    (await start(f, { ...base, questionId: 'photo', contentType: 'image/png', extra: true })).status,
    400,
  );
  assert.equal((await start(f, { token })).status, 400);
  // the same question with the right type works
  assert.equal((await start(f, { ...base, questionId: 'photo', contentType: 'image/png' })).status, 200);
});

async function db_question(f: Fixture): Promise<string> {
  const row = f.d1.sqlite
    .prepare(
      'SELECT schema_json FROM form_versions WHERE form_id = (SELECT id FROM forms WHERE slug = ?) LIMIT 1',
    )
    .get(FORM) as { schema_json: string };
  const schema = JSON.parse(row.schema_json) as {
    sections: { questions: { id: string; type: string }[] }[];
  };
  const q = schema.sections.flatMap((s) => s.questions).find((x) => x.type !== 'file_upload');
  assert.ok(q);
  return q.id;
}

test('start: the question is checked against the PUBLISHED version of the session form, not another form', async () => {
  const f = await setup();
  const token = await newToken(f); // worship-apply session
  // 'photo' exists in other forms too, but a question id from a form with no such id must not pass
  const res = await start(f, {
    token,
    questionId: 'q_from_another_form',
    filename: 'a.png',
    size: 10,
    contentType: 'image/png',
  });
  assert.equal(res.status, 400);
  // closing the form after the session was issued stops new uploads
  f.d1.sqlite.prepare("UPDATE forms SET status = 'closed' WHERE slug = ?").run(FORM);
  const closed = await start(f, {
    token,
    questionId: 'photo',
    filename: 'a.png',
    size: 10,
    contentType: 'image/png',
  });
  assert.equal(closed.status, 400);
  assert.equal((await errorOf(closed)).code, 'FORM_CLOSED');
});

// ---- session -----------------------------------------------------------------------------------------------

test('upload-session: unknown, draft, closed and upload-less forms are 404; bad slugs never reach the database', async () => {
  const f = await setup();
  assert.equal((await session(f, 'does-not-exist')).status, 404);
  assert.equal((await session(f, 'Bad_Slug')).status, 404);
  assert.equal((await session(f, 'contact')).status, 404, 'a published form without a file_upload question');
  f.d1.sqlite.prepare("UPDATE forms SET status = 'closed' WHERE slug = ?").run(FORM);
  const closed = await session(f);
  assert.equal(closed.status, 404);
  assert.equal((await errorOf(closed)).code, 'FORM_CLOSED');
  assertNoStore(closed, 'closed');
  f.d1.sqlite.prepare("UPDATE forms SET status = 'draft' WHERE slug = ?").run(FORM);
  assert.equal((await session(f)).status, 404);
  assert.equal(f.d1.sqlite.prepare('SELECT COUNT(*) AS n FROM upload_sessions').get()!.n, 0);
});

test('upload-session: Turnstile is required (400 missing, 403 rejected, 503 unconfigured outside local)', async () => {
  const f = await setup();
  assert.equal((await session(f, FORM, '')).status, 400);
  const noToken = await call(
    sessionRoute.POST,
    f,
    `/api/forms/${FORM}/upload-session`,
    {
      method: 'POST',
      ...json({}),
    },
    { slug: FORM },
  );
  assert.equal(noToken.status, 400);
  assert.equal(
    (await session(f, FORM, 'not-the-dummy-token')).status,
    403,
    'local accepts only the dummy token',
  );
  assert.equal((await session(f, FORM, 42)).status, 400);
  // extra keys, non-JSON content type
  assert.equal(
    (
      await call(
        sessionRoute.POST,
        f,
        `/api/forms/${FORM}/upload-session`,
        {
          method: 'POST',
          ...json({ turnstileToken: TURNSTILE_DUMMY_TOKEN, other: 1 }),
        },
        { slug: FORM },
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        sessionRoute.POST,
        f,
        `/api/forms/${FORM}/upload-session`,
        {
          method: 'POST',
          body: 'turnstileToken=x',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        },
        { slug: FORM },
      )
    ).status,
    415,
  );

  const prod = await setup({ ENVIRONMENT: 'production' });
  const unconfigured = await session(prod);
  assert.equal(unconfigured.status, 503, 'no TURNSTILE_SECRET_KEY outside local');
  assertNoStore(unconfigured, 'unconfigured');

  const configured = await setup({
    ENVIRONMENT: 'production',
    TURNSTILE_SECRET_KEY: 'turnstile-secret-for-tests',
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    Response.json({ success: false, 'error-codes': ['invalid-input-response'] })) as typeof fetch;
  try {
    const rejected = await session(configured, FORM, 'a-real-looking-token');
    assert.equal(rejected.status, 403);
    assert.equal(configured.d1.sqlite.prepare('SELECT COUNT(*) AS n FROM upload_sessions').get()!.n, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('upload-session: per-IP rate limit answers 429 with Retry-After', async () => {
  const f = await setup();
  for (let i = 0; i < 10; i++)
    assert.equal(
      (await session(f, FORM, TURNSTILE_DUMMY_TOKEN, { 'cf-connecting-ip': '203.0.113.9' })).status,
      200,
    );
  const limited = await session(f, FORM, TURNSTILE_DUMMY_TOKEN, { 'cf-connecting-ip': '203.0.113.9' });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  assertNoStore(limited, 'rate limited');
  assert.equal((await errorOf(limited)).code, 'RATE_LIMITED');
  // another address is unaffected
  assert.equal(
    (await session(f, FORM, TURNSTILE_DUMMY_TOKEN, { 'cf-connecting-ip': '203.0.113.10' })).status,
    200,
  );
});

test('start, part, complete and delete are rate limited per IP too', async () => {
  const f = await setup();
  const token = await newToken(f);
  const ip = { 'cf-connecting-ip': '198.51.100.7' };
  f.d1.sqlite.prepare('DELETE FROM rate_limit_counters').run();
  // Hammer `complete` (limit 120) with an unknown id: each call is 404 until the limit, then 429.
  let last = 0;
  for (let i = 0; i < 121; i++) last = (await complete(f, 'fup_nothing', token, ip)).status;
  assert.equal(last, 429);
  let removed = 0;
  for (let i = 0; i < 121; i++) removed = (await remove(f, 'fup_nothing', token, ip)).status;
  assert.equal(removed, 429);
  let starts = 0;
  for (let i = 0; i < 61; i++)
    starts = (
      await start(f, { token, questionId: 'nope', filename: 'a', size: 1, contentType: 'image/png' }, ip)
    ).status;
  assert.equal(starts, 429);
});

// ---- same origin -------------------------------------------------------------------------------------------

test('every state-changing upload route refuses cross-origin requests before doing anything', async () => {
  const f = await setup();
  const token = await newToken(f);
  const evil = { origin: 'https://evil.example' };
  const results = await Promise.all([
    session(f, FORM, TURNSTILE_DUMMY_TOKEN, evil),
    start(f, { token, questionId: 'photo', filename: 'a.png', size: 10, contentType: 'image/png' }, evil),
    putPart(f, 'fup_x', 1, token, PDF(10), evil),
    complete(f, 'fup_x', token, evil),
    remove(f, 'fup_x', token, evil),
    session(f, FORM, TURNSTILE_DUMMY_TOKEN, { 'sec-fetch-site': 'cross-site' }),
  ]);
  for (const res of results) {
    assert.equal(res.status, 403);
    assertNoStore(res, 'cross-origin');
  }
  assert.equal(f.d1.sqlite.prepare('SELECT COUNT(*) AS n FROM form_uploads').get()!.n, 0);
  // same-origin Origin header passes
  assert.equal((await session(f, FORM, TURNSTILE_DUMMY_TOKEN, { origin: ORIGIN })).status, 200);
});

// ---- availability ------------------------------------------------------------------------------------------

test('without MEDIA_BUCKET or FORM_UPLOAD_SECRET (outside local) the routes answer 503 and never fake success', async () => {
  const noBucket = await setup({ MEDIA_BUCKET: undefined });
  assert.equal((await session(noBucket)).status, 503);
  const noSecret = await setup({
    ENVIRONMENT: 'production',
    TURNSTILE_SECRET_KEY: 'x',
    FORM_UPLOAD_SECRET: undefined,
  });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ success: true })) as typeof fetch;
  try {
    const res = await session(noSecret);
    assert.equal(res.status, 503);
    assert.ok(!JSON.stringify(await errorOf(res)).includes('FORM_UPLOAD_SECRET'), 'no variable names leak');
  } finally {
    globalThis.fetch = realFetch;
  }
  const noDb = await setup({ DB: undefined });
  assert.equal((await complete(noDb, 'fup_x', 'x')).status, 503);
});

// ---- Stripe webhook ----------------------------------------------------------------------------------------

const WH_SECRET = 'whsec_web_route_test_secret_value';
const NOW = Math.floor(Date.now() / 1000);
const sign = (body: string, secret = WH_SECRET, t = NOW) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

async function openInvoice(d1: SqliteD1, env: Record<string, unknown>) {
  const svc = new InvoiceService(d1, env as never, {
    fetchImpl: (async () => Response.json({ id: 're_1' })) as typeof fetch,
  });
  const inv = await svc.createDraft({
    source: { type: 'manual' },
    billTo: { name: 'Sample Church', email: 'pastor@example.org' },
    dueDate: '2030-04-30',
    lines: [{ kind: 'other', description: 'Sound setup', unitAmountCents: 5000 }],
    staffId: 's',
    now: NOW,
  });
  d1.sqlite
    .prepare("UPDATE invoices SET status = 'open', stripe_invoice_id = 'in_web_1' WHERE id = ?")
    .run(inv.id);
  return inv;
}

const paidEvent = (livemode = false) =>
  JSON.stringify({
    id: 'evt_paid_web_1',
    object: 'event',
    type: 'invoice.paid',
    created: NOW,
    livemode,
    data: {
      object: {
        id: 'in_web_1',
        status: 'paid',
        amount_paid: 5000,
        metadata: {},
        status_transitions: { paid_at: NOW - 10 },
      },
    },
  });

const stripe = (
  f: Pick<Fixture, 'env'>,
  body: string,
  signature: string | null,
  headers: Record<string, string> = {},
) =>
  call(stripeRoute.POST, f, '/api/webhook/stripe', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'stripe-signature': signature } : {}),
      ...headers,
    },
  });

test('Stripe webhook: 503 without STRIPE_WEBHOOK_SECRET, 400 for a bad or missing signature, no origin check', async () => {
  const f = await setup({ ENVIRONMENT: 'production' });
  const body = paidEvent();
  const unconfigured = await stripe(f, body, sign(body));
  assert.equal(unconfigured.status, 503);
  assertNoStore(unconfigured, 'stripe 503');

  const g = await setup({ ENVIRONMENT: 'production', STRIPE_WEBHOOK_SECRET: WH_SECRET });
  const inv = await openInvoice(g.d1, g.env);
  for (const sig of [
    null,
    'garbage',
    sign(body, 'whsec_another_secret_value'),
    sign(body, WH_SECRET, NOW - 3600),
  ]) {
    const res = await stripe(g, body, sig);
    assert.equal(res.status, 400, String(sig));
    assertNoStore(res, 'stripe 400');
    assert.equal((await errorOf(res)).code, 'INVALID_SIGNATURE');
  }
  // a body that is altered after signing fails too
  assert.equal((await stripe(g, `${body} `, sign(body))).status, 400);
  assert.equal(
    (g.d1.sqlite.prepare('SELECT status FROM invoices WHERE id = ?').get(inv.id) as { status: string })
      .status,
    'open',
  );
  // Live-mode events are refused.
  const live = paidEvent(true);
  assert.equal((await stripe(g, live, sign(live))).status, 400);
});

test('Stripe webhook: a signed invoice.paid marks the invoice paid once (a replay changes nothing)', async () => {
  const g = await setup({ ENVIRONMENT: 'production', STRIPE_WEBHOOK_SECRET: WH_SECRET });
  const inv = await openInvoice(g.d1, g.env);
  const body = paidEvent();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ id: 're_test' })) as typeof fetch;
  try {
    // A cross-origin looking request is still accepted: Stripe is authenticated by its signature only.
    const first = await stripe(g, body, sign(body), { origin: 'https://evil.example' });
    assert.equal(first.status, 200);
    assertNoStore(first, 'stripe 200');
    assert.deepEqual(await first.json(), { received: true, applied: true });
    const second = await stripe(g, body, sign(body));
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { received: true, applied: false });
  } finally {
    globalThis.fetch = realFetch;
  }
  const row = g.d1.sqlite
    .prepare('SELECT status, paid_method AS m, paid_at AS p FROM invoices WHERE id = ?')
    .get(inv.id) as { status: string; m: string; p: number };
  assert.deepEqual({ ...row }, { status: 'paid', m: 'stripe', p: NOW - 10 });
  assert.ok(!JSON.stringify(row).includes(WH_SECRET));
});

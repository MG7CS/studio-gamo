import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import { SecretNotConfiguredError, sha256Hex } from '../security/crypto.ts';
import type { SqlDatabase } from '../security/sql-database.ts';
import {
  UPLOAD_LIMITS,
  UploadError,
  UploadService,
  uploadKindFor,
  uploadServiceFromEnv,
  type ImagesBindingLike,
  type UploadBucketLike,
  type UploadErrorCode,
  type UploadMultipartLike,
  type UploadObjectBodyLike,
  type UploadedPartLike,
} from './uploads.ts';

const SECRET = 'form-upload-secret-for-tests-0000000001';
const T0 = 1_900_000_000;
const PART = 8_388_608;
const MIN_PART = 5 * 1024 * 1024;

// ---- fakes ------------------------------------------------------------------------------------------------

async function toBytes(value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  const chunks: Uint8Array[] = [];
  const reader = value.getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

class FakeBucket implements UploadBucketLike {
  objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  uploads = new Map<string, { key: string; parts: Map<number, { bytes: Uint8Array; etag: string }> }>();
  calls: string[] = [];
  private etags = 0;

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    options?: { httpMetadata?: { contentType?: string } },
  ) {
    this.calls.push(`put ${key}`);
    this.objects.set(key, { bytes: await toBytes(value), contentType: options?.httpMetadata?.contentType });
    return { etag: `single-${++this.etags}` };
  }
  async get(
    key: string,
    options?: { range?: { offset: number; length?: number } },
  ): Promise<UploadObjectBodyLike | null> {
    this.calls.push(`get ${key}`);
    const found = this.objects.get(key);
    if (!found) return null;
    const start = options?.range?.offset ?? 0;
    const end = options?.range?.length === undefined ? found.bytes.length : start + options.range.length;
    const slice = found.bytes.slice(start, end);
    return {
      size: found.bytes.length,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(slice);
          controller.close();
        },
      }),
      arrayBuffer: async () =>
        slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer,
    };
  }
  async head(key: string) {
    this.calls.push(`head ${key}`);
    const found = this.objects.get(key);
    return found ? { size: found.bytes.length } : null;
  }
  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.calls.push(`delete ${key}`);
      this.objects.delete(key);
    }
  }
  async list(prefix = '') {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }
  async createMultipartUpload(key: string) {
    const uploadId = `mpu-${this.uploads.size + 1}`;
    this.uploads.set(uploadId, { key, parts: new Map() });
    this.calls.push(`create ${key}`);
    return { uploadId, ...this.handle(key, uploadId) };
  }
  resumeMultipartUpload(key: string, uploadId: string): UploadMultipartLike {
    return this.handle(key, uploadId);
  }
  private handle(key: string, uploadId: string): UploadMultipartLike {
    const fail = () => {
      throw new Error('NoSuchUpload');
    };
    return {
      uploadPart: async (partNumber, value) => {
        const upload = this.uploads.get(uploadId) ?? fail();
        const etag = `part-${++this.etags}`;
        upload.parts.set(partNumber, { bytes: await toBytes(value), etag });
        this.calls.push(`part ${partNumber}`);
        return { partNumber, etag };
      },
      complete: async (parts: UploadedPartLike[]) => {
        const upload = this.uploads.get(uploadId) ?? fail();
        const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
        const chunks = ordered.map((p, i) => {
          const stored = upload.parts.get(p.partNumber);
          if (!stored || stored.etag !== p.etag) throw new Error('InvalidPart');
          if (i < ordered.length - 1 && stored.bytes.length < MIN_PART) throw new Error('EntityTooSmall');
          if (i < ordered.length - 1 && stored.bytes.length !== upload.parts.get(1)!.bytes.length)
            throw new Error('InvalidPart: non-uniform');
          return stored.bytes;
        });
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let at = 0;
        for (const c of chunks) {
          out.set(c, at);
          at += c.length;
        }
        this.objects.set(key, { bytes: out });
        this.uploads.delete(uploadId);
        this.calls.push('complete');
        return {};
      },
      abort: async () => {
        if (!this.uploads.has(uploadId)) fail();
        this.uploads.delete(uploadId);
        this.calls.push(`abort ${key}`);
      },
    };
  }
}

function webpBytes(length = 64): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(length);
  out.set(Buffer.from('RIFF'), 0);
  out.set(Buffer.from('WEBP'), 8);
  return out;
}

function fakeImages(mode: 'ok' | 'throw' = 'ok') {
  const seen: { transforms: unknown[]; outputs: unknown[]; inputBytes: number[] } = {
    transforms: [],
    outputs: [],
    inputBytes: [],
  };
  const binding: ImagesBindingLike = {
    input(stream) {
      const handle = {
        transform(options: unknown) {
          seen.transforms.push(options);
          return handle;
        },
        async output(options: unknown) {
          seen.outputs.push(options);
          const input = await toBytes(stream);
          seen.inputBytes.push(input.length);
          if (mode === 'throw') throw new Error('unsupported image');
          return { response: () => new Response(webpBytes(40)) };
        },
      };
      return handle;
    },
  };
  return { binding, seen };
}

function withHeader(
  kind: 'mp4' | 'webm' | 'jpeg' | 'png' | 'webp' | 'pdf' | 'heic' | 'html',
  size: number,
): Uint8Array {
  const out = new Uint8Array(size);
  const header: number[] =
    kind === 'mp4'
      ? [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]
      : kind === 'heic'
        ? [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]
        : kind === 'webm'
          ? [0x1a, 0x45, 0xdf, 0xa3]
          : kind === 'jpeg'
            ? [0xff, 0xd8, 0xff, 0xe0]
            : kind === 'png'
              ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
              : kind === 'webp'
                ? [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
                : kind === 'pdf'
                  ? [...Buffer.from('%PDF-1.7')]
                  : [...Buffer.from('<!doctype html><script>alert(1)</script>')];
  out.set(header.slice(0, size), 0);
  return out;
}

async function setup(options: { images?: ImagesBindingLike } = {}) {
  const d1 = await createMigratedD1();
  const db: SqlDatabase = d1;
  const bucket = new FakeBucket();
  const clock = { t: T0 };
  const service = new UploadService(db, bucket, {
    secret: SECRET,
    images: options.images,
    now: () => clock.t,
  });
  const { token, expiresAt } = await service.startSession({
    formSlug: 'musician-application',
    ipHash: 'iphash',
    now: T0,
  });
  const rows = <T = Record<string, unknown>>(sql: string, ...params: (string | number | null)[]) =>
    d1.sqlite.prepare(sql).all(...params) as T[];
  return { d1, db, bucket, clock, service, token, expiresAt, rows };
}

async function expectCode(promise: Promise<unknown>, code: UploadErrorCode, status?: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof UploadError, `expected UploadError, got ${String(error)}`);
    assert.equal(error.code, code);
    if (status !== undefined) assert.equal(error.status, status);
    return true;
  });
}

type Fixture = Awaited<ReturnType<typeof setup>>;

/** Starts, uploads and returns a single-part upload (not yet completed). */
async function startSingle(
  f: Fixture,
  kind: Parameters<typeof withHeader>[0],
  contentType: string,
  size = 1000,
  overrides: { declared?: number; filename?: string; questionId?: string } = {},
) {
  const started = await f.service.start({
    token: f.token,
    questionId: overrides.questionId ?? 'q_video',
    filename: overrides.filename ?? 'clip.mp4',
    size: overrides.declared ?? size,
    contentType,
    now: T0,
  });
  await f.service.putPart(started.uploadId, f.token, 1, withHeader(kind, size));
  return started;
}

async function verifiedUpload(
  f: Fixture,
  kind: Parameters<typeof withHeader>[0] = 'mp4',
  contentType = 'video/mp4',
) {
  const started = await startSingle(f, kind, contentType);
  const result = await f.service.complete(started.uploadId, f.token);
  assert.equal(result.status, 'verified');
  return started.uploadId;
}

// ---- construction ------------------------------------------------------------------------------------------

test('a missing or short secret fails with the variable name only; the env helper answers 503 without a bucket', async () => {
  const d1 = await createMigratedD1();
  assert.throws(
    () => new UploadService(d1, new FakeBucket(), { secret: undefined }),
    (e: unknown) => e instanceof SecretNotConfiguredError && e.variable === 'FORM_UPLOAD_SECRET',
  );
  assert.throws(() => new UploadService(d1, new FakeBucket(), { secret: 'short' }), SecretNotConfiguredError);
  assert.throws(
    () => uploadServiceFromEnv(d1, { FORM_UPLOAD_SECRET: SECRET }),
    (e: unknown) => e instanceof UploadError && e.code === 'UPLOAD_UNAVAILABLE' && e.status === 503,
  );
  assert.ok(uploadServiceFromEnv(d1, { FORM_UPLOAD_SECRET: SECRET, MEDIA_BUCKET: new FakeBucket() }));
});

test('uploadKindFor and UPLOAD_LIMITS are exported', () => {
  assert.equal(uploadKindFor('video/webm'), 'video');
  assert.equal(UPLOAD_LIMITS.video.maxBytes, 524_288_000);
  assert.equal(UPLOAD_LIMITS.maxFilesPerSession, 10);
});

// ---- sessions ----------------------------------------------------------------------------------------------

test('startSession stores only the SHA-256 of the token and expires in 2 hours', async () => {
  const f = await setup();
  assert.equal(f.expiresAt, T0 + 7200);
  const sessions = f.rows<{ token_hash: string; form_slug: string; ip_hash: string; file_count: number }>(
    'SELECT * FROM upload_sessions',
  );
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].token_hash, await sha256Hex(f.token));
  assert.equal(sessions[0].form_slug, 'musician-application');
  const [random] = f.token.split('.');
  const dump = JSON.stringify([...sessions, ...f.rows('SELECT * FROM form_uploads')]);
  assert.ok(!dump.includes(f.token) && !dump.includes(random), 'no raw token in the database');
  const second = await f.service.startSession({ formSlug: 'musician-application', ipHash: null, now: T0 });
  assert.notEqual(second.token, f.token);
  await expectCode(
    f.service.startSession({ formSlug: 'Bad Slug!', ipHash: null, now: T0 }),
    'UPLOAD_INVALID',
  );
});

test('uploads uploaded through a session never leave the token in the database or in errors', async () => {
  const f = await setup();
  const id = await verifiedUpload(f);
  const dump = JSON.stringify([
    ...f.rows('SELECT * FROM upload_sessions'),
    ...f.rows('SELECT * FROM form_uploads'),
  ]);
  assert.ok(!dump.includes(f.token.split('.')[0]));
  try {
    await f.service.start({
      token: f.token + 'x',
      questionId: 'q',
      filename: 'a.mp4',
      size: 1,
      contentType: 'video/mp4',
    });
    assert.fail('should throw');
  } catch (error) {
    assert.ok(error instanceof UploadError);
    assert.ok(!error.message.includes(f.token));
  }
  assert.ok(id);
});

test('expired, unknown, malformed and tampered tokens are all UPLOAD_TOKEN_INVALID (401)', async () => {
  const f = await setup();
  const input = { questionId: 'q_video', filename: 'a.mp4', size: 100, contentType: 'video/mp4' };
  f.clock.t = T0 + 7200; // exactly at expiry
  await expectCode(f.service.start({ ...input, token: f.token }), 'UPLOAD_TOKEN_INVALID', 401);
  // One second before expiry it still works.
  assert.ok((await f.service.start({ ...input, token: f.token, now: T0 + 7199 })).uploadId);
  const fresh = await f.service.startSession({ formSlug: 'musician-application', ipHash: null, now: T0 });
  const [random, tag] = fresh.token.split('.');
  const flip = (s: string) => (s[0] === 'a' ? 'b' : 'a') + s.slice(1);
  for (const bad of [
    '',
    'garbage',
    `${flip(random)}.${tag}`,
    `${random}.${flip(tag)}`,
    `${random}.`,
    `.${tag}`,
    `${random}`,
  ]) {
    await expectCode(f.service.start({ ...input, token: bad, now: T0 + 1 }), 'UPLOAD_TOKEN_INVALID', 401);
  }
  // A well-formed token signed with another secret is rejected before any database read.
  const other = new UploadService(f.db, f.bucket, { secret: 'a-different-secret-for-forged-tokens-0001' });
  const forged = await other.startSession({ formSlug: 'musician-application', ipHash: null, now: T0 });
  await expectCode(
    f.service.start({ ...input, token: forged.token, now: T0 + 1 }),
    'UPLOAD_TOKEN_INVALID',
    401,
  );
  await expectCode(f.service.putPart('fup_x', 'garbage', 1, new Uint8Array(1)), 'UPLOAD_TOKEN_INVALID');
  await expectCode(f.service.complete('fup_x', 'garbage'), 'UPLOAD_TOKEN_INVALID');
  await expectCode(f.service.abort('fup_x', 'garbage'), 'UPLOAD_TOKEN_INVALID');
});

test('an upload belongs to its session: another session cannot touch it', async () => {
  const f = await setup();
  const started = await startSingle(f, 'mp4', 'video/mp4');
  const other = await f.service.startSession({ formSlug: 'musician-application', ipHash: null, now: T0 });
  await expectCode(
    f.service.putPart(started.uploadId, other.token, 1, new Uint8Array(5)),
    'UPLOAD_NOT_FOUND',
    404,
  );
  await expectCode(f.service.complete(started.uploadId, other.token), 'UPLOAD_NOT_FOUND', 404);
  assert.deepEqual(await f.service.abort(started.uploadId, other.token), { deleted: false });
  assert.ok(f.bucket.objects.size === 1, 'the other session did not delete the object');
});

// ---- start: caps and types ---------------------------------------------------------------------------------

test('start enforces size caps per kind and rejects other types', async () => {
  const f = await setup();
  const base = { token: f.token, questionId: 'q1', filename: 'a', now: T0 };
  const ok = await f.service.start({ ...base, size: 524_288_000, contentType: 'video/mp4' });
  assert.equal(ok.partSize, PART);
  assert.equal(ok.parts, 63);
  await expectCode(
    f.service.start({ ...base, size: 524_288_001, contentType: 'video/mp4' }),
    'UPLOAD_SIZE',
    413,
  );
  await expectCode(
    f.service.start({ ...base, size: 10_485_761, contentType: 'image/jpeg' }),
    'UPLOAD_SIZE',
    413,
  );
  await expectCode(
    f.service.start({ ...base, size: 10_485_761, contentType: 'application/pdf' }),
    'UPLOAD_SIZE',
    413,
  );
  const photo = await f.service.start({ ...base, size: 10_485_760, contentType: 'image/heic' });
  assert.equal(photo.parts, 2);
  for (const size of [0, -1, 1.5, Number.NaN]) {
    await expectCode(f.service.start({ ...base, size, contentType: 'video/mp4' }), 'UPLOAD_SIZE', 400);
  }
  for (const contentType of [
    'text/html',
    'image/gif',
    'application/zip',
    'image/svg+xml',
    '',
    'audio/mpeg',
    'application/octet-stream',
  ])
    await expectCode(f.service.start({ ...base, size: 10, contentType }), 'UPLOAD_TYPE', 400);
  await expectCode(
    f.service.start({ ...base, size: 10, contentType: 'video/mp4', questionId: '../x' }),
    'UPLOAD_INVALID',
  );
  await expectCode(
    f.service.start({ ...base, size: 10, contentType: 'video/mp4', filename: '' }),
    'UPLOAD_INVALID',
  );
  const small = await f.service.start({ ...base, size: 100, contentType: 'video/mp4' });
  assert.equal(small.parts, 1);
  assert.equal(f.bucket.uploads.size, 2, 'multipart is opened only for files larger than one part');
});

test('start stores a sanitised original filename and a server-generated key', async () => {
  const f = await setup();
  const started = await f.service.start({
    token: f.token,
    questionId: 'q1',
    filename: '..\\..\\evil\u202e/<b>clip".mp4',
    size: 100,
    contentType: 'Video/MP4; codecs=avc1',
    now: T0,
  });
  const [row] = f.rows<{
    original_name: string;
    r2_key: string;
    content_type: string;
    kind: string;
    status: string;
  }>('SELECT * FROM form_uploads WHERE id = ?', started.uploadId);
  assert.equal(row.original_name, 'bclip.mp4');
  assert.match(row.r2_key, /^forms\/pending\/ups_[0-9a-z]+\/[0-9a-f-]{36}$/);
  assert.ok(!row.r2_key.includes('clip'));
  assert.equal(row.content_type, 'video/mp4');
  assert.equal(row.kind, 'video');
  assert.equal(row.status, 'started');
});

test('at most 10 files per session', async () => {
  const f = await setup();
  for (let i = 0; i < 10; i++)
    await f.service.start({
      token: f.token,
      questionId: 'q1',
      filename: `p${i}.jpg`,
      size: 10,
      contentType: 'image/jpeg',
      now: T0,
    });
  await expectCode(
    f.service.start({
      token: f.token,
      questionId: 'q1',
      filename: 'p.jpg',
      size: 10,
      contentType: 'image/jpeg',
      now: T0,
    }),
    'UPLOAD_LIMIT',
  );
  const [session] = f.rows<{ file_count: number }>('SELECT file_count FROM upload_sessions');
  assert.equal(session.file_count, 10);
  // A new session has its own allowance.
  const next = await f.service.startSession({ formSlug: 'musician-application', ipHash: null, now: T0 });
  await f.service.start({
    token: next.token,
    questionId: 'q1',
    filename: 'p.jpg',
    size: 10,
    contentType: 'image/jpeg',
    now: T0,
  });
});

test('parallel starts cannot exceed the file cap', async () => {
  const f = await setup();
  const results = await Promise.allSettled(
    Array.from({ length: 14 }, (_, i) =>
      f.service.start({
        token: f.token,
        questionId: 'q1',
        filename: `p${i}.jpg`,
        size: 10,
        contentType: 'image/jpeg',
        now: T0,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10);
  assert.equal(f.rows('SELECT id FROM form_uploads').length, 10);
});

test('at most 5 live PDFs per session; deleting one frees a PDF slot', async () => {
  const f = await setup();
  const ids: string[] = [];
  for (let i = 0; i < 5; i++)
    ids.push(
      (
        await f.service.start({
          token: f.token,
          questionId: 'q_docs',
          filename: `d${i}.pdf`,
          size: 100,
          contentType: 'application/pdf',
          now: T0,
        })
      ).uploadId,
    );
  await expectCode(
    f.service.start({
      token: f.token,
      questionId: 'q_docs',
      filename: 'd5.pdf',
      size: 100,
      contentType: 'application/pdf',
      now: T0,
    }),
    'UPLOAD_LIMIT',
  );
  // The refused start must not have used a file slot.
  const [session] = f.rows<{ file_count: number }>('SELECT file_count FROM upload_sessions');
  assert.equal(session.file_count, 5);
  assert.deepEqual(await f.service.abort(ids[0], f.token), { deleted: true });
  await f.service.start({
    token: f.token,
    questionId: 'q_docs',
    filename: 'd5.pdf',
    size: 100,
    contentType: 'application/pdf',
    now: T0,
  });
  // Photos are not limited by the PDF cap.
  await f.service.start({
    token: f.token,
    questionId: 'q_p',
    filename: 'p.jpg',
    size: 100,
    contentType: 'image/jpeg',
    now: T0,
  });
});

// ---- parts -------------------------------------------------------------------------------------------------

test('a multipart upload: parts in any order, complete assembles and verifies', async () => {
  const f = await setup();
  const size = PART + 1234;
  const started = await f.service.start({
    token: f.token,
    questionId: 'q_video',
    filename: 'big.mp4',
    size,
    contentType: 'video/mp4',
    now: T0,
  });
  assert.equal(started.parts, 2);
  const first = withHeader('mp4', PART);
  const last = new Uint8Array(1234).fill(7);
  await f.service.putPart(started.uploadId, f.token, 2, last);
  await f.service.putPart(started.uploadId, f.token, 1, first);
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), { status: 'verified' });
  const [row] = f.rows<{ status: string; r2_key: string; multipart_upload_id: string | null }>(
    'SELECT * FROM form_uploads',
  );
  assert.equal(row.status, 'verified');
  assert.equal(row.multipart_upload_id, null);
  assert.equal(f.bucket.objects.get(row.r2_key)!.bytes.length, size);
  assert.equal(f.bucket.uploads.size, 0);
});

test('retrying part 3 overwrites cleanly and the newest bytes win', async () => {
  const f = await setup();
  const size = 2 * PART + 10;
  const started = await f.service.start({
    token: f.token,
    questionId: 'q_video',
    filename: 'big.mp4',
    size,
    contentType: 'video/mp4',
    now: T0,
  });
  assert.equal(started.parts, 3);
  await f.service.putPart(started.uploadId, f.token, 1, withHeader('mp4', PART));
  await f.service.putPart(started.uploadId, f.token, 2, new Uint8Array(PART).fill(2));
  const firstTry = await f.service.putPart(started.uploadId, f.token, 3, new Uint8Array(10).fill(3));
  // The connection dropped: the client sends part 3 again, and part 2 as well.
  const retry = await f.service.putPart(started.uploadId, f.token, 3, new Uint8Array(10).fill(9));
  await f.service.putPart(started.uploadId, f.token, 2, new Uint8Array(PART).fill(5));
  assert.notEqual(firstTry.etag, retry.etag);
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), { status: 'verified' });
  const [row] = f.rows<{ r2_key: string }>('SELECT r2_key FROM form_uploads');
  const stored = f.bucket.objects.get(row.r2_key)!.bytes;
  assert.equal(stored.length, size);
  assert.equal(stored[PART + 5], 5, 'part 2 is the retried one');
  assert.equal(stored[2 * PART + 5], 9, 'part 3 is the retried one');
  const parts = JSON.parse(
    f.rows<{ parts_json: string }>('SELECT parts_json FROM form_uploads')[0].parts_json,
  );
  assert.deepEqual(Object.keys(parts).sort(), ['1', '2', '3']);
});

test('parallel part uploads do not lose each other in parts_json', async () => {
  const f = await setup();
  const size = 3 * PART;
  const started = await f.service.start({
    token: f.token,
    questionId: 'q_video',
    filename: 'big.mp4',
    size,
    contentType: 'video/mp4',
    now: T0,
  });
  await Promise.all([
    f.service.putPart(started.uploadId, f.token, 1, withHeader('mp4', PART)),
    f.service.putPart(started.uploadId, f.token, 2, new Uint8Array(PART)),
    f.service.putPart(started.uploadId, f.token, 3, new Uint8Array(PART)),
  ]);
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), { status: 'verified' });
});

test('part rules: size, number and state', async () => {
  const f = await setup();
  const size = PART + 100;
  const started = await f.service.start({
    token: f.token,
    questionId: 'q_video',
    filename: 'big.mp4',
    size,
    contentType: 'video/mp4',
    now: T0,
  });
  const put = (n: number, body: Uint8Array) => f.service.putPart(started.uploadId, f.token, n, body);
  await expectCode(put(1, new Uint8Array(PART - 1)), 'UPLOAD_SIZE', 400); // non-last part must be exactly partSize
  await expectCode(put(1, new Uint8Array(PART + 1)), 'UPLOAD_SIZE', 413);
  await expectCode(put(1, new Uint8Array(0)), 'UPLOAD_SIZE');
  await expectCode(put(2, new Uint8Array(PART + 1)), 'UPLOAD_SIZE', 413);
  await expectCode(put(0, new Uint8Array(10)), 'UPLOAD_SEQUENCE', 409);
  await expectCode(put(3, new Uint8Array(10)), 'UPLOAD_SEQUENCE', 409); // beyond ceil(size / partSize)
  await expectCode(put(1.5, new Uint8Array(10)), 'UPLOAD_SEQUENCE');
  await put(2, new Uint8Array(100));
  // complete before every part arrived
  await expectCode(f.service.complete(started.uploadId, f.token), 'UPLOAD_SEQUENCE', 409);
  await put(1, withHeader('mp4', PART));
  assert.equal((await f.service.complete(started.uploadId, f.token)).status, 'verified');
  // no more parts after completion
  await expectCode(put(1, withHeader('mp4', PART)), 'UPLOAD_SEQUENCE', 409);
  await expectCode(f.service.putPart('fup_missing', f.token, 1, new Uint8Array(1)), 'UPLOAD_NOT_FOUND', 404);
});

test('R2 failures surface as UPLOAD_STORAGE without leaking the cause', async () => {
  const f = await setup();
  const started = await startSingleStarted(f);
  f.bucket.put = async () => {
    throw new Error('R2 secret-ish internal detail');
  };
  try {
    await f.service.putPart(started, f.token, 1, new Uint8Array(10));
    assert.fail('should throw');
  } catch (error) {
    assert.ok(error instanceof UploadError);
    assert.equal(error.code, 'UPLOAD_STORAGE');
    assert.equal(error.status, 503);
    assert.ok(!error.message.includes('secret-ish'));
  }
});

async function startSingleStarted(f: Fixture) {
  return (
    await f.service.start({
      token: f.token,
      questionId: 'q1',
      filename: 'a.mp4',
      size: 10,
      contentType: 'video/mp4',
      now: T0,
    })
  ).uploadId;
}

// ---- complete: verification -------------------------------------------------------------------------------

test('HTML bytes named .mp4 are rejected and the object is deleted', async () => {
  const f = await setup();
  const started = await startSingle(f, 'html', 'video/mp4', 200, { filename: 'party.mp4' });
  const [before] = f.rows<{ r2_key: string }>('SELECT r2_key FROM form_uploads');
  assert.ok(f.bucket.objects.has(before.r2_key));
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), {
    status: 'rejected',
    reason: 'content_mismatch',
  });
  assert.ok(!f.bucket.objects.has(before.r2_key), 'object deleted');
  const [row] = f.rows<{ status: string; reject_reason: string }>(
    'SELECT status, reject_reason FROM form_uploads',
  );
  assert.equal(row.status, 'rejected');
  assert.equal(row.reject_reason, 'content_mismatch');
  assert.equal(f.bucket.objects.size, 0);
});

test('every declared type is checked against its own signature', async () => {
  const cases: [Parameters<typeof withHeader>[0], string, boolean][] = [
    ['mp4', 'video/mp4', true],
    ['mp4', 'video/quicktime', true],
    ['webm', 'video/webm', true],
    ['mp4', 'video/webm', false],
    ['jpeg', 'image/jpeg', true],
    ['png', 'image/png', true],
    ['webp', 'image/webp', true],
    ['heic', 'image/heic', true],
    ['mp4', 'image/heic', false],
    ['png', 'image/jpeg', false],
    ['pdf', 'application/pdf', true],
    ['jpeg', 'application/pdf', false],
  ];
  for (const [kind, contentType, accepted] of cases) {
    const f = await setup(); // no IMAGES: images are kept as uploaded after the magic check
    const started = await startSingle(f, kind, contentType, 300);
    const result = await f.service.complete(started.uploadId, f.token);
    assert.equal(result.status, accepted ? 'verified' : 'rejected', `${kind} as ${contentType}`);
  }
});

test('a size that differs from the declared size is rejected and deleted', async () => {
  const f = await setup();
  // Declares 100 bytes but sends 150 in one part.
  const started = await f.service.start({
    token: f.token,
    questionId: 'q1',
    filename: 'a.mp4',
    size: 100,
    contentType: 'video/mp4',
    now: T0,
  });
  await f.service.putPart(started.uploadId, f.token, 1, withHeader('mp4', 150));
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), {
    status: 'rejected',
    reason: 'size_mismatch',
  });
  assert.equal(f.bucket.objects.size, 0);
  // Declares more than it sends.
  const second = await f.service.start({
    token: f.token,
    questionId: 'q1',
    filename: 'a.mp4',
    size: 400,
    contentType: 'video/mp4',
    now: T0,
  });
  await f.service.putPart(second.uploadId, f.token, 1, withHeader('mp4', 399));
  assert.deepEqual(await f.service.complete(second.uploadId, f.token), {
    status: 'rejected',
    reason: 'size_mismatch',
  });
  assert.equal(f.bucket.objects.size, 0);
});

test('a multipart upload with a lying declared size is rejected after assembly', async () => {
  const f = await setup();
  const started = await f.service.start({
    token: f.token,
    questionId: 'q1',
    filename: 'a.mp4',
    size: PART + 10,
    contentType: 'video/mp4',
    now: T0,
  });
  await f.service.putPart(started.uploadId, f.token, 1, withHeader('mp4', PART));
  await f.service.putPart(started.uploadId, f.token, 2, new Uint8Array(PART)); // 8 MiB instead of 10 bytes
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), {
    status: 'rejected',
    reason: 'size_mismatch',
  });
  assert.equal(f.bucket.objects.size, 0);
});

test('complete is idempotent: a second call returns the stored result without touching R2', async () => {
  const f = await setup();
  const ok = await startSingle(f, 'mp4', 'video/mp4');
  assert.deepEqual(await f.service.complete(ok.uploadId, f.token), { status: 'verified' });
  const calls = f.bucket.calls.length;
  assert.deepEqual(await f.service.complete(ok.uploadId, f.token), { status: 'verified' });
  assert.equal(f.bucket.calls.length, calls);
  const bad = await startSingle(f, 'html', 'video/mp4');
  const first = await f.service.complete(bad.uploadId, f.token);
  assert.deepEqual(await f.service.complete(bad.uploadId, f.token), first);
});

test('concurrent completes verify once', async () => {
  const f = await setup();
  const started = await startSingle(f, 'mp4', 'video/mp4');
  const results = await Promise.allSettled([
    f.service.complete(started.uploadId, f.token),
    f.service.complete(started.uploadId, f.token),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  assert.ok(fulfilled.length >= 1);
  for (const r of results) {
    if (r.status === 'rejected') assert.equal((r.reason as UploadError).code, 'UPLOAD_SEQUENCE');
  }
  assert.equal(f.bucket.calls.filter((c) => c.startsWith('head ')).length, 1);
});

test('a failed multipart complete leaves the upload retryable', async () => {
  const f = await setup();
  const started = await f.service.start({
    token: f.token,
    questionId: 'q1',
    filename: 'a.mp4',
    size: PART + 10,
    contentType: 'video/mp4',
    now: T0,
  });
  await f.service.putPart(started.uploadId, f.token, 1, withHeader('mp4', PART));
  await f.service.putPart(started.uploadId, f.token, 2, new Uint8Array(10));
  const original = f.bucket.resumeMultipartUpload.bind(f.bucket);
  f.bucket.resumeMultipartUpload = (key, id) => ({
    ...original(key, id),
    complete: async () => {
      throw new Error('boom');
    },
  });
  await expectCode(f.service.complete(started.uploadId, f.token), 'UPLOAD_STORAGE', 503);
  assert.equal(f.rows<{ status: string }>('SELECT status FROM form_uploads')[0].status, 'started');
  f.bucket.resumeMultipartUpload = original;
  assert.equal((await f.service.complete(started.uploadId, f.token)).status, 'verified');
});

// ---- photos -----------------------------------------------------------------------------------------------

test('photos are re-encoded through IMAGES to 1200 px WebP without metadata and the original is deleted', async () => {
  const images = fakeImages();
  const f = await setup({ images: images.binding });
  const started = await startSingle(f, 'jpeg', 'image/jpeg', 5000, { filename: 'me.jpg' });
  const [before] = f.rows<{ r2_key: string }>('SELECT r2_key FROM form_uploads');
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), { status: 'verified' });
  assert.equal(images.seen.outputs.length, 1);
  assert.deepEqual(images.seen.outputs[0], { format: 'image/webp', quality: 82 });
  assert.deepEqual(images.seen.transforms[0], { width: 1200, fit: 'scale-down', metadata: 'none' });
  assert.equal(images.seen.inputBytes[0], 5000);
  const [row] = f.rows<{ r2_key: string; content_type: string; bytes: number; status: string }>(
    'SELECT * FROM form_uploads',
  );
  assert.notEqual(row.r2_key, before.r2_key);
  assert.ok(!f.bucket.objects.has(before.r2_key), 'original deleted');
  assert.equal(row.content_type, 'image/webp');
  assert.equal(row.bytes, 40);
  assert.equal(f.bucket.objects.get(row.r2_key)!.bytes.length, 40);
  assert.equal(f.bucket.objects.get(row.r2_key)!.contentType, 'image/webp');
  assert.equal(f.bucket.objects.size, 1);
  assert.match(row.r2_key, /^forms\/pending\//);
});

test('an image the binding cannot decode is rejected and nothing is kept', async () => {
  const images = fakeImages('throw');
  const f = await setup({ images: images.binding });
  const started = await startSingle(f, 'png', 'image/png', 400);
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), {
    status: 'rejected',
    reason: 'image_unreadable',
  });
  assert.equal(f.bucket.objects.size, 0);
});

test('without the IMAGES binding the original is kept after the magic check', async () => {
  const f = await setup();
  const started = await startSingle(f, 'jpeg', 'image/jpeg', 700);
  const [before] = f.rows<{ r2_key: string }>('SELECT r2_key FROM form_uploads');
  assert.deepEqual(await f.service.complete(started.uploadId, f.token), { status: 'verified' });
  const [row] = f.rows<{ r2_key: string; content_type: string; bytes: number }>('SELECT * FROM form_uploads');
  assert.equal(row.r2_key, before.r2_key);
  assert.equal(row.content_type, 'image/jpeg');
  assert.equal(row.bytes, 700);
  // A fake photo is still rejected without IMAGES.
  const bad = await startSingle(f, 'html', 'image/jpeg', 100);
  assert.equal((await f.service.complete(bad.uploadId, f.token)).status, 'rejected');
});

test('videos and PDFs never go through IMAGES', async () => {
  const images = fakeImages();
  const f = await setup({ images: images.binding });
  await verifiedUpload(f, 'mp4', 'video/mp4');
  await verifiedUpload(f, 'pdf', 'application/pdf');
  assert.equal(images.seen.outputs.length, 0);
});

// ---- abort / delete ----------------------------------------------------------------------------------------

test('abort aborts a multipart upload, deletes pending objects and is repeatable', async () => {
  const f = await setup();
  const big = await f.service.start({
    token: f.token,
    questionId: 'q1',
    filename: 'a.mp4',
    size: 2 * PART,
    contentType: 'video/mp4',
    now: T0,
  });
  await f.service.putPart(big.uploadId, f.token, 1, withHeader('mp4', PART));
  assert.equal(f.bucket.uploads.size, 1);
  assert.deepEqual(await f.service.abort(big.uploadId, f.token), { deleted: true });
  assert.equal(f.bucket.uploads.size, 0);
  assert.deepEqual(await f.service.abort(big.uploadId, f.token), { deleted: false });
  const verified = await verifiedUpload(f);
  assert.equal(f.bucket.objects.size, 1);
  assert.deepEqual(await f.service.delete(verified, f.token), { deleted: true });
  assert.equal(f.bucket.objects.size, 0);
  assert.deepEqual(await f.service.abort('fup_never_existed', f.token), { deleted: false });
  const rows = f.rows<{ status: string; original_name: string | null }>(
    "SELECT status, original_name FROM form_uploads WHERE status = 'deleted'",
  );
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.original_name === null));
});

test('an attached upload cannot be deleted by the visitor', async () => {
  const f = await setup();
  const id = await verifiedUpload(f);
  await f.service.attach([id], 'sub_1', T0 + 10, { token: f.token });
  await expectCode(f.service.abort(id, f.token), 'UPLOAD_ATTACHED', 409);
});

// ---- attach / declined / delete ----------------------------------------------------------------------------

test('attach moves keys to forms/submissions/{id}/ (copy then delete) and binds the submission', async () => {
  const f = await setup();
  const a = await verifiedUpload(f, 'mp4', 'video/mp4');
  const b = await verifiedUpload(f, 'pdf', 'application/pdf');
  const before = f.rows<{ id: string; r2_key: string }>('SELECT id, r2_key FROM form_uploads');
  const refs = await f.service.attach([a, b, a], 'sub_42', T0 + 5, { token: f.token });
  assert.equal(refs.length, 2);
  assert.deepEqual(
    refs.map((r) => [r.uploadId, r.kind, r.questionId]),
    [
      [a, 'video', 'q_video'],
      [b, 'pdf', 'q_video'],
    ],
  );
  assert.equal(refs[0].bytes, 1000);
  const after = f.rows<{ id: string; r2_key: string; submission_id: string; status: string }>(
    'SELECT * FROM form_uploads',
  );
  for (const row of after) {
    assert.equal(row.submission_id, 'sub_42');
    assert.equal(row.status, 'verified');
    assert.match(row.r2_key, /^forms\/submissions\/sub_42\/[0-9a-f-]{36}$/);
    assert.ok(f.bucket.objects.has(row.r2_key));
  }
  for (const old of before) assert.ok(!f.bucket.objects.has(old.r2_key), 'old key deleted');
  assert.equal(f.bucket.objects.size, 2);
  assert.equal(f.bucket.objects.get(after.find((r) => r.id === b)!.r2_key)!.contentType, 'application/pdf');
  // Repeating the call (a retried submit) changes nothing.
  const again = await f.service.attach([a, b], 'sub_42', T0 + 6, { token: f.token });
  assert.equal(again.length, 2);
  assert.deepEqual(
    f.rows<{ r2_key: string }>('SELECT r2_key FROM form_uploads ORDER BY id').map((r) => r.r2_key),
    [...after].sort((x, y) => x.id.localeCompare(y.id)).map((r) => r.r2_key),
  );
});

test('attach refuses pending, rejected, foreign-session and already-attached uploads, and attaches nothing then', async () => {
  const f = await setup();
  const good = await verifiedUpload(f);
  const pending = await startSingle(f, 'mp4', 'video/mp4');
  const rejected = await startSingle(f, 'html', 'video/mp4');
  await f.service.complete(rejected.uploadId, f.token);
  await expectCode(
    f.service.attach([good, pending.uploadId], 'sub_1', T0, { token: f.token }),
    'UPLOAD_ATTACH',
    409,
  );
  await expectCode(
    f.service.attach([good, rejected.uploadId], 'sub_1', T0, { token: f.token }),
    'UPLOAD_ATTACH',
    409,
  );
  await expectCode(
    f.service.attach([good, 'fup_nope'], 'sub_1', T0, { token: f.token }),
    'UPLOAD_NOT_FOUND',
    404,
  );
  assert.equal(
    f.rows<{ submission_id: string | null }>('SELECT submission_id FROM form_uploads WHERE id = ?', good)[0]
      .submission_id,
    null,
  );

  const other = await f.service.startSession({ formSlug: 'musician-application', ipHash: null, now: T0 });
  await expectCode(f.service.attach([good], 'sub_1', T0, { token: other.token }), 'UPLOAD_NOT_FOUND', 404);
  await expectCode(f.service.attach([good], 'sub_1', T0, { token: 'garbage' }), 'UPLOAD_TOKEN_INVALID', 401);

  await f.service.attach([good], 'sub_1', T0, { token: f.token });
  await expectCode(f.service.attach([good], 'sub_2', T0, { token: f.token }), 'UPLOAD_ATTACH', 409);
  await expectCode(f.service.attach([good], 'bad id!', T0, { token: f.token }), 'UPLOAD_INVALID');
});

test('attach still works after the 2 h session expired (the visitor finished a long form)', async () => {
  const f = await setup();
  const id = await verifiedUpload(f);
  f.clock.t = T0 + 3 * 3600;
  const refs = await f.service.attach([id], 'sub_9', T0 + 3 * 3600, { token: f.token });
  assert.equal(refs.length, 1);
});

test('moveToDeclined moves submission files to forms/declined/ and is repeatable', async () => {
  const f = await setup();
  const a = await verifiedUpload(f);
  await f.service.attach([a], 'sub_7', T0, { token: f.token });
  const [attached] = f.rows<{ r2_key: string }>('SELECT r2_key FROM form_uploads');
  assert.equal(await f.service.moveToDeclined('sub_7'), 1);
  const [row] = f.rows<{ r2_key: string; status: string; submission_id: string }>(
    'SELECT * FROM form_uploads',
  );
  assert.match(row.r2_key, /^forms\/declined\/sub_7\/[0-9a-f-]{36}$/);
  assert.equal(row.status, 'verified');
  assert.equal(row.submission_id, 'sub_7');
  assert.ok(f.bucket.objects.has(row.r2_key));
  assert.ok(!f.bucket.objects.has(attached.r2_key));
  assert.equal(await f.service.moveToDeclined('sub_7'), 0);
  assert.equal(await f.service.moveToDeclined('sub_unknown'), 0);
});

test('deleteForSubmission removes objects and names, and leaves other submissions alone', async () => {
  const f = await setup();
  const a = await verifiedUpload(f);
  const b = await verifiedUpload(f);
  await f.service.attach([a], 'sub_1', T0, { token: f.token });
  await f.service.attach([b], 'sub_2', T0, { token: f.token });
  assert.deepEqual(await f.service.deleteForSubmission('sub_1'), { deleted: 1, failures: 0 });
  const rows = f.rows<{ id: string; status: string; original_name: string | null }>(
    'SELECT id, status, original_name FROM form_uploads ORDER BY id',
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  assert.equal(byId.get(a)!.status, 'deleted');
  assert.equal(byId.get(a)!.original_name, null);
  assert.equal(byId.get(b)!.status, 'verified');
  assert.equal(f.bucket.objects.size, 1);
  assert.deepEqual(await f.service.deleteForSubmission('sub_1'), { deleted: 0, failures: 0 });
});

// ---- serving -----------------------------------------------------------------------------------------------

test('getForServing: images and video inline, PDFs attachment, type from our allowlist only', async () => {
  const f = await setup();
  const video = await verifiedUpload(f, 'mp4', 'video/mp4');
  const pdf = await verifiedUpload(f, 'pdf', 'application/pdf');
  const jpeg = await verifiedUpload(f, 'jpeg', 'image/jpeg');
  const served = {
    video: (await f.service.getForServing(video))!,
    pdf: (await f.service.getForServing(pdf))!,
    jpeg: (await f.service.getForServing(jpeg))!,
  };
  assert.equal(served.video.disposition, 'inline');
  assert.equal(served.video.contentType, 'video/mp4');
  assert.equal(served.video.size, 1000);
  assert.equal(served.video.kind, 'video');
  assert.equal(served.pdf.disposition, 'attachment');
  assert.equal(served.pdf.contentType, 'application/pdf');
  assert.equal(served.jpeg.disposition, 'inline');
  assert.equal(served.jpeg.contentType, 'image/jpeg');
  assert.equal(served.video.filename, 'clip.mp4');
  assert.equal((await served.video.object.arrayBuffer()).byteLength, 1000);

  // Range passes through to R2.
  const ranged = (await f.service.getForServing(video, { range: { offset: 0, length: 12 } }))!;
  assert.equal((await ranged.object.arrayBuffer()).byteLength, 12);

  // A tampered stored type is never echoed and is always a download.
  f.d1.sqlite.prepare("UPDATE form_uploads SET content_type = 'text/html' WHERE id = ?").run(video);
  const tampered = (await f.service.getForServing(video))!;
  assert.equal(tampered.contentType, 'application/octet-stream');
  assert.equal(tampered.disposition, 'attachment');
  f.d1.sqlite.prepare("UPDATE form_uploads SET kind = 'other' WHERE id = ?").run(pdf);
  assert.equal((await f.service.getForServing(pdf))!.disposition, 'attachment');
});

test('getForServing returns null for pending, rejected, deleted, unknown and object-less uploads', async () => {
  const f = await setup();
  const pending = await startSingle(f, 'mp4', 'video/mp4');
  const rejected = await startSingle(f, 'html', 'video/mp4');
  await f.service.complete(rejected.uploadId, f.token);
  const deleted = await verifiedUpload(f);
  await f.service.abort(deleted, f.token);
  assert.equal(await f.service.getForServing(pending.uploadId), null);
  assert.equal(await f.service.getForServing(rejected.uploadId), null);
  assert.equal(await f.service.getForServing(deleted), null);
  assert.equal(await f.service.getForServing('fup_unknown'), null);
  const gone = await verifiedUpload(f);
  const [row] = f.rows<{ r2_key: string }>('SELECT r2_key FROM form_uploads WHERE id = ?', gone);
  f.bucket.objects.delete(row.r2_key);
  assert.equal(await f.service.getForServing(gone), null);
});

// ---- retention ---------------------------------------------------------------------------------------------

test('deletePendingOlderThan removes unattached uploads and expired sessions older than 48 h, keeping the rest', async () => {
  const f = await setup();
  const H = 3600;
  // Old session with: a pending multipart, a verified-but-never-submitted file, a rejected file.
  const oldMulti = await f.service.start({
    token: f.token,
    questionId: 'q1',
    filename: 'a.mp4',
    size: 2 * PART,
    contentType: 'video/mp4',
    now: T0,
  });
  await f.service.putPart(oldMulti.uploadId, f.token, 1, withHeader('mp4', PART));
  const oldVerified = await verifiedUpload(f);
  const oldRejected = await startSingle(f, 'html', 'video/mp4');
  await f.service.complete(oldRejected.uploadId, f.token);
  // An old file that WAS submitted.
  const attached = await verifiedUpload(f);
  await f.service.attach([attached], 'sub_keep', T0 + 60, { token: f.token });

  // A recent session (47 h later) is left alone.
  f.clock.t = T0 + 47 * H;
  const fresh = await f.service.startSession({
    formSlug: 'musician-application',
    ipHash: null,
    now: f.clock.t,
  });
  const freshStart = await f.service.start({
    token: fresh.token,
    questionId: 'q1',
    filename: 'f.mp4',
    size: 100,
    contentType: 'video/mp4',
    now: f.clock.t,
  });
  await f.service.putPart(freshStart.uploadId, fresh.token, 1, withHeader('mp4', 100));

  const now = T0 + 51 * H;
  const result = await f.service.deletePendingOlderThan(48 * H, now);
  assert.deepEqual(result, { uploads: 3, sessions: 1, failures: 0 });

  const status = new Map(
    f
      .rows<{ id: string; status: string }>('SELECT id, status FROM form_uploads')
      .map((r) => [r.id, r.status]),
  );
  assert.equal(status.get(oldMulti.uploadId), 'deleted');
  assert.equal(status.get(oldVerified), 'deleted');
  assert.equal(status.get(oldRejected.uploadId), 'deleted');
  assert.equal(status.get(attached), 'verified', 'submitted files survive their session');
  assert.equal(status.get(freshStart.uploadId), 'started');
  assert.equal(f.bucket.uploads.size, 0, 'the pending multipart was aborted');
  assert.equal(f.bucket.objects.size, 2, 'the submitted file and the recent file remain');
  assert.equal(f.rows('SELECT id FROM upload_sessions').length, 1);
  const attachedRow = f.rows<{ session_id: string | null }>(
    'SELECT session_id FROM form_uploads WHERE id = ?',
    attached,
  )[0];
  assert.equal(attachedRow.session_id, null, 'purging the session only detaches the submitted file');

  // Nothing left to do on a second run.
  assert.deepEqual(await f.service.deletePendingOlderThan(48 * H, now), {
    uploads: 0,
    sessions: 0,
    failures: 0,
  });
});

test('cleanup keeps rows it could not delete for the next run', async () => {
  const f = await setup();
  const id = await verifiedUpload(f);
  const realDelete = f.bucket.delete.bind(f.bucket);
  f.bucket.delete = async () => {
    throw new Error('R2 down');
  };
  const failed = await f.service.deletePendingOlderThan(3600, T0 + 3 * 3600);
  assert.equal(failed.uploads, 0);
  assert.equal(failed.failures, 1);
  assert.equal(
    f.rows<{ status: string }>('SELECT status FROM form_uploads WHERE id = ?', id)[0].status,
    'verified',
  );
  f.bucket.delete = realDelete;
  assert.deepEqual((await f.service.deletePendingOlderThan(3600, T0 + 3 * 3600)).uploads, 1);
});

// ---- ownership (IDOR) --------------------------------------------------------------------------------------

test('attach requires the session token: a missing or non-string token never falls back to id-only lookup', async () => {
  const f = await setup();
  const id = await verifiedUpload(f);
  const attach = f.service.attach.bind(f.service) as unknown as (...args: unknown[]) => Promise<unknown>;
  for (const opts of [undefined, {}, { token: undefined }, { token: null }, { token: 42 }, { token: '' }]) {
    await expectCode(attach([id], 'sub_1', T0, opts) as Promise<unknown>, 'UPLOAD_TOKEN_INVALID', 401);
  }
  await expectCode(attach([id], 'sub_1', T0) as Promise<unknown>, 'UPLOAD_TOKEN_INVALID', 401);
  assert.equal(
    f.rows<{ submission_id: string | null }>('SELECT submission_id FROM form_uploads')[0].submission_id,
    null,
  );
});

test("another session's token cannot attach this session's upload, and the answer does not reveal existence", async () => {
  const f = await setup();
  const mine = await verifiedUpload(f);
  const attacker = await f.service.startSession({ formSlug: 'musician-application', ipHash: null, now: T0 });
  const capture = async (ids: string[]) => {
    try {
      await f.service.attach(ids, 'sub_evil', T0, { token: attacker.token });
      assert.fail('should throw');
    } catch (error) {
      assert.ok(error instanceof UploadError);
      return { code: error.code, status: error.status, message: error.message };
    }
  };
  const foreign = await capture([mine]);
  const missing = await capture(['fup_does_not_exist']);
  assert.deepEqual(foreign, missing, 'foreign and non-existent ids look identical');
  assert.equal(foreign.code, 'UPLOAD_NOT_FOUND');
  assert.ok(!foreign.message.includes(mine));
  // Mixed with the attacker's own upload it still attaches nothing.
  const own = await f.service.start({
    token: attacker.token,
    questionId: 'q1',
    filename: 'a.mp4',
    size: 100,
    contentType: 'video/mp4',
    now: T0,
  });
  await f.service.putPart(own.uploadId, attacker.token, 1, withHeader('mp4', 100));
  await f.service.complete(own.uploadId, attacker.token);
  await expectCode(
    f.service.attach([own.uploadId, mine], 'sub_evil', T0, { token: attacker.token }),
    'UPLOAD_NOT_FOUND',
  );
  const rows = f.rows<{ submission_id: string | null }>('SELECT submission_id FROM form_uploads');
  assert.ok(rows.every((r) => r.submission_id === null));
  // The owner can still attach it.
  assert.equal((await f.service.attach([mine], 'sub_ok', T0, { token: f.token })).length, 1);
});

test('attachAsStaff binds uploads of any session without a token (internal use only)', async () => {
  const f = await setup();
  const a = await verifiedUpload(f);
  const pending = await startSingle(f, 'mp4', 'video/mp4');
  await expectCode(f.service.attachAsStaff([a, pending.uploadId], 'sub_s', T0), 'UPLOAD_ATTACH', 409);
  await expectCode(f.service.attachAsStaff(['fup_nope'], 'sub_s', T0), 'UPLOAD_NOT_FOUND', 404);
  const refs = await f.service.attachAsStaff([a], 'sub_s', T0);
  assert.equal(refs.length, 1);
  const [row] = f.rows<{ id: string; r2_key: string; submission_id: string }>(
    'SELECT * FROM form_uploads WHERE id = ?',
    a,
  );
  assert.equal(row.submission_id, 'sub_s');
  assert.match(row.r2_key, /^forms\/submissions\/sub_s\//);
  assert.equal((await f.service.attachAsStaff([a], 'sub_s', T0)).length, 1);
});

test('every public upload method scopes by session: another session gets not-found, nothing changes', async () => {
  const f = await setup();
  const id = await verifiedUpload(f);
  const started = await startSingle(f, 'mp4', 'video/mp4');
  const other = await f.service.startSession({ formSlug: 'musician-application', ipHash: null, now: T0 });
  await expectCode(
    f.service.putPart(started.uploadId, other.token, 1, new Uint8Array(5)),
    'UPLOAD_NOT_FOUND',
    404,
  );
  await expectCode(f.service.complete(started.uploadId, other.token), 'UPLOAD_NOT_FOUND', 404);
  assert.deepEqual(await f.service.abort(id, other.token), { deleted: false });
  assert.deepEqual(await f.service.delete(id, other.token), { deleted: false });
  assert.deepEqual(await f.service.abort('fup_does_not_exist', other.token), { deleted: false });
  assert.equal(
    f.rows<{ status: string }>('SELECT status FROM form_uploads WHERE id = ?', id)[0].status,
    'verified',
  );
});

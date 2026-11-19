import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import { sha256Hex } from '../security/crypto.ts';
import type { SqlDatabase } from '../security/sql-database.ts';
import { UploadError, UploadService, type ImagesBindingLike, type UploadErrorCode } from './uploads.ts';
import { FakeBucket, withHeader } from './uploads-test-support.ts';

const SECRET = 'form-upload-secret-for-tests-0000000001';
const T0 = 1_900_000_000;
const PART = 8_388_608;

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

// ---- parts -------------------------------------------------------------------------------------------------

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

// ---- photos -----------------------------------------------------------------------------------------------

// ---- abort / delete ----------------------------------------------------------------------------------------

// ---- attach / declined / delete ----------------------------------------------------------------------------

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

// ---- ownership (IDOR) --------------------------------------------------------------------------------------

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINK_TOKEN_RETENTION_SECONDS } from '../security/link-tokens.ts';
import {
  approveApplication,
  respondToOffer,
  sendOffer,
  createRequestFromSubmission,
} from '../worship/index.ts';
import type { WorshipEnv } from '../worship/common.ts';
import {
  all,
  ENV,
  fakeResend,
  get,
  musicianBinds,
  newDb,
  NOW,
  requestBinds,
  run,
  seedSubmission,
} from '../worship/test-support.ts';
import { DAILY_JOB_NAMES, runDailyJobs, type DailyEnv, type DailyResult } from './daily.ts';

const staffId = 'staff_1';
const H = 3600;
const DAY = 24 * H;
const UPLOAD_SECRET = 'form-upload-secret-for-tests-0000000001';

type Db = Awaited<ReturnType<typeof newDb>>;

class FakeBucket {
  objects = new Set<string>();
  deleted: string[] = [];
  failDelete = false;
  async put(key: string) {
    this.objects.add(key);
  }
  async get() {
    return null;
  }
  async head() {
    return null;
  }
  async delete(keys: string | string[]) {
    if (this.failDelete) throw new Error('R2 down for ana@example.org');
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      this.objects.delete(key);
      this.deleted.push(key);
    }
  }
  async createMultipartUpload() {
    throw new Error('unused');
  }
  resumeMultipartUpload() {
    return {
      uploadPart: async () => {
        throw new Error('unused');
      },
      complete: async () => ({}),
      abort: async () => undefined,
    };
  }
}

function envFor(d1: Db, bucket: FakeBucket | undefined, over: Record<string, unknown> = {}): DailyEnv {
  return {
    ...ENV,
    DB: d1,
    FORM_UPLOAD_SECRET: UPLOAD_SECRET,
    ...(bucket ? { MEDIA_BUCKET: bucket } : {}),
    ...over,
  } as unknown as DailyEnv;
}

function captureConsole() {
  const lines: string[] = [];
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const take = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  console.log = take;
  console.info = take;
  console.warn = take;
  console.error = take;
  return {
    lines,
    restore() {
      Object.assign(console, saved);
    },
  };
}

function seedUpload(
  d1: Db,
  bucket: FakeBucket,
  o: { id: string; submissionId?: string | null; createdAt: number; status?: string },
) {
  const key = `forms/pending/${o.id}`;
  bucket.objects.add(key);
  run(
    d1,
    `INSERT INTO form_uploads (id, submission_id, question_id, kind, content_type, original_name, bytes, r2_key, status, created_at)
     VALUES (?, ?, 'q1', 'video', 'video/mp4', 'private-name.mp4', 10, ?, ?, ?)`,
    o.id,
    o.submissionId ?? null,
    key,
    o.status ?? 'verified',
    o.createdAt,
  );
  return key;
}

/** One full world: an unsent email, expiring offer, abandoned and expired data, all due at `NOW + 4 days`. */
async function world() {
  const d1 = await newDb();
  const bucket = new FakeBucket();
  const noKey = { ...ENV, RESEND_API_KEY: undefined } as unknown as WorshipEnv;

  // Email that could not be sent (no key at the time): approved applicant.
  const approvedSub = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds({ 'contact.name': 'Ana Reyes', 'contact.email': 'ana@example.org' }),
  });
  const member = await approveApplication(d1, noKey, { submissionId: approvedSub, staffId, now: NOW });
  assert.equal(
    get(d1, "SELECT status FROM email_log WHERE kind = 'application_approved'")!.status,
    'not_configured',
  );

  // A pending offer that lapses before the run (and whose email can never be rebuilt).
  const request = await createRequestFromSubmission(d1, {
    submissionId: seedSubmission(d1, { kind: 'church_request', program: 'worship', binds: requestBinds() }),
    now: NOW,
  });
  const offer = await sendOffer(
    d1,
    noKey,
    {
      requestId: request.id,
      rosterMemberId: member.id,
      role: 'Drums',
      payCents: 15_000,
      staffId,
      siteOrigin: 'https://gamostudio.org',
      now: NOW,
    },
    fakeResend().options,
  );

  // A declined submission past its retention date, with one stored file.
  const declinedSub = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds({ 'contact.email': 'declined@example.org' }),
    status: 'declined',
  });
  run(d1, 'UPDATE form_submissions SET delete_after = ? WHERE id = ?', NOW + DAY, declinedSub);
  const declinedFile = seedUpload(d1, bucket, {
    id: 'up_declined',
    submissionId: declinedSub,
    createdAt: NOW,
  });
  // A declined submission that is not due yet keeps its record and file.
  const keptSub = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds({ 'contact.email': 'kept@example.org' }),
    status: 'declined',
  });
  run(d1, 'UPDATE form_submissions SET delete_after = ? WHERE id = ?', NOW + 30 * DAY, keptSub);
  const keptFile = seedUpload(d1, bucket, { id: 'up_kept', submissionId: keptSub, createdAt: NOW });

  // Declined 91 days ago: the file goes now, the record stays until its own delete_after.
  const oldDeclinedSub = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds({ 'contact.email': 'olddeclined@example.org' }),
    status: 'declined',
  });
  run(
    d1,
    'UPDATE form_submissions SET reviewed_at = ?, delete_after = ? WHERE id = ?',
    NOW + 4 * DAY - 91 * DAY,
    NOW + 200 * DAY,
    oldDeclinedSub,
  );
  const oldDeclinedFile = seedUpload(d1, bucket, {
    id: 'up_old_declined',
    submissionId: oldDeclinedSub,
    createdAt: NOW,
  });
  // Declined 10 days ago: its file stays.
  const newDeclinedSub = seedSubmission(d1, {
    kind: 'musician_application',
    program: 'worship',
    binds: musicianBinds({ 'contact.email': 'newdeclined@example.org' }),
    status: 'declined',
  });
  run(
    d1,
    'UPDATE form_submissions SET reviewed_at = ?, delete_after = ? WHERE id = ?',
    NOW + 4 * DAY - 10 * DAY,
    NOW + 300 * DAY,
    newDeclinedSub,
  );
  const newDeclinedFile = seedUpload(d1, bucket, {
    id: 'up_new_declined',
    submissionId: newDeclinedSub,
    createdAt: NOW,
  });

  // Abandoned upload (old, never attached) and a recent one.
  const abandoned = seedUpload(d1, bucket, { id: 'up_old', createdAt: NOW });
  const recent = seedUpload(d1, bucket, { id: 'up_recent', createdAt: NOW + 4 * DAY - H });
  run(
    d1,
    "INSERT INTO upload_sessions (id, form_slug, token_hash, expires_at, created_at) VALUES ('us_old', 'f', 'h1', ?, ?)",
    NOW + H,
    NOW,
  );

  // Expired link token (past retention) and a fresh one; expired and live rate-limit windows.
  run(
    d1,
    "INSERT INTO customer_profiles (id, email_normalized, created_at, updated_at) VALUES ('cus_1', 'cust@example.org', 1, 1)",
  );
  const insertToken = (id: string, expires: number) =>
    run(
      d1,
      `INSERT INTO customer_access_tokens (id, customer_profile_id, token_hash, scope, purpose, expires_at, created_at)
       VALUES (?, 'cus_1', ?, 'customer:all', 'recovery', ?, 1)`,
      id,
      id.padEnd(64, '0'),
      expires,
    );
  const later = NOW + 4 * DAY;
  insertToken('tok_old', later - LINK_TOKEN_RETENTION_SECONDS - 10);
  insertToken('tok_recent', later - 10);
  run(
    d1,
    "INSERT INTO rate_limit_counters (bucket, window_start, count, expires_at) VALUES ('b', 1, 1, ?)",
    later - 1,
  );
  run(
    d1,
    "INSERT INTO rate_limit_counters (bucket, window_start, count, expires_at) VALUES ('b', 2, 1, ?)",
    later + 600,
  );

  return {
    d1,
    bucket,
    offerId: offer.offerId,
    declinedSub,
    keptSub,
    files: { declinedFile, keptFile, abandoned, recent, oldDeclinedFile, newDeclinedFile },
    oldDeclinedSub,
    later,
    resend: () => fakeResend(),
  };
}

const failed = (r: DailyResult) => r.failures.map((f) => `${f.job}:${f.error}`);

test('runDailyJobs: every job does its work, counts are reported, and a second run does nothing', async () => {
  const w = await world();
  const r = fakeResend();
  const env = envFor(w.d1, w.bucket);

  const first = await runDailyJobs(env, w.later, r.options);
  assert.deepEqual(failed(first), []);
  assert.equal(first.now, w.later);
  // Emails: the approval is re-rendered and sent to the stored address; the offer link cannot be rebuilt.
  assert.equal(first.emailsRetried, 2);
  assert.equal(first.emailsSent, 1);
  assert.deepEqual(
    r.calls.map((c) => c.to),
    ['ana@example.org'],
  );
  assert.match(r.calls[0]!.subject, /./);
  assert.equal(get(w.d1, "SELECT status FROM email_log WHERE kind = 'application_approved'")!.status, 'sent');
  const offerMail = get(
    w.d1,
    "SELECT status, last_error_code, next_attempt_at FROM email_log WHERE kind = 'offer_sent'",
  )!;
  assert.deepEqual(
    [offerMail.status, offerMail.last_error_code, offerMail.next_attempt_at],
    ['failed', 'not_renderable', null],
  );
  // Uploads: abandoned file and old session are gone; recent, declined (attached) and kept files stay.
  assert.equal(first.uploadsPurged, 1);
  assert.equal(first.uploadSessionsPurged, 1);
  assert.equal(first.uploadFailures, 0);
  assert.equal(get(w.d1, "SELECT status FROM form_uploads WHERE id = 'up_old'")!.status, 'deleted');
  assert.equal(get(w.d1, "SELECT status FROM form_uploads WHERE id = 'up_recent'")!.status, 'verified');
  // Submissions: the due declined one is deleted with its file; the other stays.
  assert.equal(first.submissionsPurged, 1);
  assert.equal(first.submissionFilesDeleted, 1);
  assert.equal(get(w.d1, 'SELECT id FROM form_submissions WHERE id = ?', w.declinedSub), undefined);
  assert.ok(get(w.d1, 'SELECT id FROM form_submissions WHERE id = ?', w.keptSub));
  assert.equal(first.declinedFilesDeleted, 1);
  assert.ok(!w.bucket.objects.has(w.files.oldDeclinedFile), 'file of an application declined 91 days ago');
  assert.ok(w.bucket.objects.has(w.files.newDeclinedFile), 'file of a recent decline');
  assert.ok(get(w.d1, 'SELECT id FROM form_submissions WHERE id = ?', w.oldDeclinedSub), 'its record stays');
  assert.ok(!w.bucket.objects.has(w.files.declinedFile));
  assert.ok(w.bucket.objects.has(w.files.keptFile));
  assert.ok(!w.bucket.objects.has(w.files.abandoned));
  assert.ok(w.bucket.objects.has(w.files.recent));
  // Offers, tokens, rate limits.
  assert.equal(first.offersExpired, 1);
  assert.equal(get(w.d1, 'SELECT status FROM offers WHERE id = ?', w.offerId)!.status, 'expired');
  assert.equal(first.tokensPurged, 1);
  assert.deepEqual(
    all(w.d1, 'SELECT id FROM customer_access_tokens').map((t) => t.id),
    ['tok_recent'],
  );
  assert.equal(first.rateLimitCountersPurged, 1);
  assert.equal(first.recipientEmailsPurged, 0);

  const second = await runDailyJobs(env, w.later, r.options);
  assert.deepEqual(failed(second), []);
  const { now: _a, ...firstCounts } = first;
  const { now: _b, ...secondCounts } = second;
  void firstCounts;
  assert.deepEqual(secondCounts, {
    emailsRetried: 0,
    emailsSent: 0,
    uploadsPurged: 0,
    uploadSessionsPurged: 0,
    uploadFailures: 0,
    declinedFilesDeleted: 0,
    submissionsPurged: 0,
    submissionFilesDeleted: 0,
    offersExpired: 0,
    tokensPurged: 0,
    rateLimitCountersPurged: 0,
    recipientEmailsPurged: 0,
    failures: [],
  });
  assert.equal(r.calls.length, 1, 'no second email');
});

test('runDailyJobs: a failing upload cleanup (missing secret) does not stop the other jobs', async () => {
  const w = await world();
  const r = fakeResend();
  const log = captureConsole();
  let result: DailyResult;
  try {
    result = await runDailyJobs(
      envFor(w.d1, w.bucket, { FORM_UPLOAD_SECRET: undefined }),
      w.later,
      r.options,
    );
  } finally {
    log.restore();
  }
  assert.deepEqual(failed(result), [
    'uploads:SecretNotConfiguredError',
    'declinedFiles:SecretNotConfiguredError',
    'submissions:SecretNotConfiguredError',
  ]);
  assert.equal(result.emailsSent, 1, 'email retry still ran');
  assert.equal(result.offersExpired, 1);
  assert.equal(result.tokensPurged, 1);
  assert.equal(result.rateLimitCountersPurged, 1);
  assert.ok(
    get(w.d1, 'SELECT id FROM form_submissions WHERE id = ?', w.declinedSub),
    'nothing deleted without being able to delete files',
  );
  assert.ok(log.lines.some((l) => l.includes('[daily-jobs] uploads failed (SecretNotConfiguredError)')));
});

test('runDailyJobs: files that cannot be deleted keep the submission record for the next run', async () => {
  const w = await world();
  const r = fakeResend();
  w.bucket.failDelete = true;
  const log = captureConsole();
  let result: DailyResult;
  try {
    result = await runDailyJobs(envFor(w.d1, w.bucket), w.later, r.options);
  } finally {
    log.restore();
  }
  assert.deepEqual(failed(result), ['submissions:SubmissionFilesNotDeletedError']);
  assert.equal(
    result.uploadFailures,
    2,
    'the abandoned upload and the old declined file stay for the next run',
  );
  assert.equal(result.declinedFilesDeleted, 0);
  assert.equal(result.submissionsPurged, 0);
  assert.ok(get(w.d1, 'SELECT id FROM form_submissions WHERE id = ?', w.declinedSub));
  assert.equal(get(w.d1, "SELECT status FROM form_uploads WHERE id = 'up_old'")!.status, 'verified');
  assert.equal(result.emailsSent, 1);
  assert.equal(result.offersExpired, 1);

  w.bucket.failDelete = false;
  const retry = await runDailyJobs(envFor(w.d1, w.bucket), w.later, r.options);
  assert.deepEqual(failed(retry), []);
  assert.equal(retry.submissionsPurged, 1);
  assert.equal(retry.uploadsPurged, 1);
  assert.equal(retry.declinedFilesDeleted, 1);
});

test('runDailyJobs: without an R2 bucket only the upload jobs fail', async () => {
  const w = await world();
  const result = await runDailyJobs(envFor(w.d1, undefined), w.later, fakeResend().options);
  assert.deepEqual(failed(result), [
    'uploads:UploadError',
    'declinedFiles:UploadError',
    'submissions:UploadError',
  ]);
  assert.equal(result.offersExpired, 1);
  assert.equal(result.emailsSent, 1);
});

test('runDailyJobs: a failing email retry (database error) does not stop the rest', async () => {
  const w = await world();
  w.d1.sqlite.exec('DROP TABLE email_log');
  const log = captureConsole();
  let result: DailyResult;
  try {
    result = await runDailyJobs(envFor(w.d1, w.bucket), w.later, fakeResend().options);
  } finally {
    log.restore();
  }
  assert.deepEqual(
    failed(result).map((f) => f.split(':')[0]),
    ['emails', 'recipients'],
  );
  assert.equal(result.uploadsPurged, 1);
  assert.equal(result.submissionsPurged, 1);
  assert.equal(result.offersExpired, 1);
  assert.equal(result.tokensPurged, 1);
});

test('runDailyJobs: nothing in the logs identifies a person, even when a failure message does', async () => {
  const w = await world();
  w.bucket.failDelete = true;
  const log = captureConsole();
  try {
    await runDailyJobs(envFor(w.d1, w.bucket), w.later, fakeResend().options);
    await runDailyJobs(
      envFor(w.d1, w.bucket, { FORM_UPLOAD_SECRET: undefined }),
      w.later,
      fakeResend().options,
    );
  } finally {
    log.restore();
  }
  assert.ok(log.lines.length > 0);
  const text = log.lines.join('\n');
  for (const secret of [
    'example.org',
    'Ana',
    'Reyes',
    'Grace Community',
    'private-name',
    UPLOAD_SECRET,
    'R2 down',
  ]) {
    assert.ok(!text.includes(secret), `log contains ${secret}`);
  }
  assert.ok(log.lines.every((l) => l.length < 400));
});

test('runDailyJobs: a missing database binding is reported for every job and never throws', async () => {
  const log = captureConsole();
  let result: DailyResult;
  try {
    result = await runDailyJobs({ ENVIRONMENT: 'production' } as unknown as DailyEnv, NOW);
  } finally {
    log.restore();
  }
  assert.deepEqual(
    result.failures.map((f) => f.job),
    [...DAILY_JOB_NAMES],
  );
  assert.ok(result.failures.every((f) => f.error === 'DatabaseUnavailable'));
});

test('runDailyJobs: recipient addresses older than 180 days are nulled', async () => {
  const d1 = await newDb();
  run(
    d1,
    `INSERT INTO email_log (id, kind, idempotency_key, recipient_email, recipient_hash, status, created_at, updated_at)
     VALUES ('log_old', 'form_received', 'k1', 'old@example.org', ?, 'sent', ?, ?)`,
    'a'.repeat(64),
    NOW - 181 * DAY,
    NOW - 181 * DAY,
  );
  run(
    d1,
    `INSERT INTO email_log (id, kind, idempotency_key, recipient_email, recipient_hash, status, created_at, updated_at)
     VALUES ('log_new', 'form_received', 'k2', 'new@example.org', ?, 'sent', ?, ?)`,
    'b'.repeat(64),
    NOW - DAY,
    NOW - DAY,
  );
  const result = await runDailyJobs(envFor(d1, new FakeBucket()), NOW, fakeResend().options);
  assert.equal(result.recipientEmailsPurged, 1);
  assert.equal(get(d1, "SELECT recipient_email FROM email_log WHERE id = 'log_old'")!.recipient_email, null);
  assert.equal(
    get(d1, "SELECT recipient_email FROM email_log WHERE id = 'log_new'")!.recipient_email,
    'new@example.org',
  );
});

test('offers accepted before the run are not expired', async () => {
  const w = await world();
  // Re-offer and accept a second pending offer; accepted offers must survive the expiry job.
  const row = get(w.d1, 'SELECT request_id, roster_member_id, role FROM offers WHERE id = ?', w.offerId)!;
  run(w.d1, "UPDATE offers SET status = 'withdrawn' WHERE id = ?", w.offerId);
  const sent = await sendOffer(
    w.d1,
    ENV,
    {
      requestId: String(row.request_id),
      rosterMemberId: String(row.roster_member_id),
      role: String(row.role),
      payCents: 12_000,
      staffId,
      siteOrigin: 'https://gamostudio.org',
      now: NOW,
    },
    fakeResend().options,
  );
  await respondToOffer(
    w.d1,
    ENV,
    { token: sent.url.slice(sent.url.lastIndexOf('/') + 1), action: 'accept', now: NOW + 60 },
    fakeResend().options,
  );
  const result = await runDailyJobs(envFor(w.d1, w.bucket), w.later, fakeResend().options);
  assert.equal(result.offersExpired, 0);
  assert.equal(get(w.d1, 'SELECT status FROM offers WHERE id = ?', sent.offerId)!.status, 'accepted');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINK_TOKEN_RETENTION_SECONDS } from '../security/link-tokens.ts';
import { approveApplication, sendOffer, createRequestFromSubmission } from '../worship/index.ts';
import type { WorshipEnv } from '../worship/common.ts';
import {
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
import { runDailyJobs, type DailyEnv } from './daily.ts';

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

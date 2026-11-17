/**
 * The daily job (design 2026-11-16 "Daily cron (approved)"; plan Task 4.2), run by the Worker `scheduled`
 * handler in `apps/web/src/worker.ts` at 06:00 UTC. Jobs, in order:
 *
 *   1. emails      retry due outbox rows (queued/failed/not_configured, backoff elapsed), at most 100 per run,
 *                  re-rendered from the database by `createPayloadLoader` + `createRetryRenderer`.
 *   2. uploads     abort/delete form uploads never attached to a submission and upload sessions older than 48 h.
 *   3. declinedFiles delete the files (not the record) of applications declined more than 90 days ago.
 *   4. submissions delete submissions past `delete_after` (declined/spam/archived/handled only), their files
 *                  first (`UploadService.deleteForSubmission`), at most 200 per run. If a file cannot be
 *                  deleted nothing is deleted that run and the next run tries again.
 *   5. offers      mark pending offers past their expiry as `expired`.
 *   6. linkTokens  delete customer link tokens expired more than 30 days ago (`LINK_TOKEN_RETENTION_SECONDS`).
 *   7. rateLimits  delete finished `rate_limit_counters` windows.
 *   8. recipients  null `email_log.recipient_email` older than 180 days (`purgeRecipientEmails`).
 *
 * Each job is isolated: a failure is logged by job name and error NAME only (never a message, id, address or
 * any personal data), recorded in `failures`, and the remaining jobs still run. `runDailyJobs` never throws.
 * Every job is idempotent, so a second run right after the first (or a duplicate cron delivery) changes nothing.
 *
 * R2 lifecycle rules (docs/RUNBOOK.md §3b) are the safety net behind jobs 2 to 4.
 */
import type { GamoEnv } from '@gamo/config/env';
import { uploadServiceFromEnv, type CleanupResult, type UploadService } from '../forms/uploads.ts';
import { FormsService } from '../forms/service.ts';
import { createRetryRenderer } from '../email/registry.ts';
import { LINK_TOKEN_RETENTION_SECONDS } from '../security/link-tokens.ts';
import { purgeRateLimitCounters } from '../security/rate-limit.ts';
import { allRows, changesOf, isSqlDatabase, type SqlDatabase } from '../security/sql-database.ts';
import { purgeRecipientEmails, retryDueOutboxEmails, type OutboxOptions } from '../services/email-outbox.ts';
import { expireOffers } from '../worship/offers.ts';
import { createPayloadLoader } from './payload-loader.ts';
import type { WorshipEnv } from '../worship/common.ts';

export const DAILY_JOB_NAMES = [
  'emails',
  'uploads',
  'declinedFiles',
  'submissions',
  'offers',
  'linkTokens',
  'rateLimits',
  'recipients',
] as const;
export type DailyJobName = (typeof DAILY_JOB_NAMES)[number];

/** Uploads and upload sessions older than this are abandoned (matches the R2 `forms/pending/` rule). */
export const PENDING_UPLOAD_MAX_AGE_SECONDS = 48 * 60 * 60;
/** Files of a declined application are kept this long (matches the R2 `forms/declined/` rule); the record stays 12 months. */
export const DECLINED_FILE_RETENTION_SECONDS = 90 * 24 * 60 * 60;
/** Outbox rows retried per run. */
export const EMAIL_RETRY_LIMIT = 100;
/** Submissions purged per run. */
export const SUBMISSION_PURGE_LIMIT = 200;

/** The Worker environment the job reads: D1, the optional R2 bucket and Images binding, secrets and email settings. */
export type DailyEnv = WorshipEnv & { DB: unknown };

export interface DailyFailure {
  job: DailyJobName;
  /** `error.name` only (for example `SecretNotConfiguredError`). Never a message. */
  error: string;
}

export interface DailyResult {
  /** Epoch seconds the run was evaluated at. */
  now: number;
  emailsRetried: number;
  emailsSent: number;
  uploadsPurged: number;
  uploadSessionsPurged: number;
  /** Files whose object could not be deleted; they stay for the next run. */
  uploadFailures: number;
  /** Files deleted from declined applications older than 90 days (their records stay until `delete_after`). */
  declinedFilesDeleted: number;
  submissionsPurged: number;
  submissionFilesDeleted: number;
  offersExpired: number;
  tokensPurged: number;
  rateLimitCountersPurged: number;
  recipientEmailsPurged: number;
  /** Jobs that threw, in run order. Empty on a clean run. */
  failures: DailyFailure[];
}

function emptyResult(now: number): DailyResult {
  return {
    now,
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
  };
}

/** A file of an expiring submission could not be deleted; thrown from `beforeDelete` so no record is deleted. */
class SubmissionFilesNotDeletedError extends Error {
  constructor() {
    super('SUBMISSION_FILES_NOT_DELETED');
    this.name = 'SubmissionFilesNotDeletedError';
  }
}

/** Test seam (the Worker passes none): an injected Resend `fetch`. */
export type DailyOptions = Pick<OutboxOptions, 'fetchImpl'>;

const errorName = (error: unknown): string =>
  error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(error.name) ? error.name : 'Error';

/**
 * Runs every daily job once. `now` is epoch seconds (the cron's scheduled time). Never throws.
 */
export async function runDailyJobs(
  env: DailyEnv,
  now: number,
  options: DailyOptions = {},
): Promise<DailyResult> {
  const result = emptyResult(now);

  async function isolated(job: DailyJobName, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      const name = errorName(error);
      result.failures.push({ job, error: name });
      console.error(`[daily-jobs] ${job} failed (${name})`);
    }
  }

  if (!isSqlDatabase(env.DB)) {
    for (const job of DAILY_JOB_NAMES) {
      result.failures.push({ job, error: 'DatabaseUnavailable' });
    }
    console.error('[daily-jobs] DB binding is missing; no job ran');
    return result;
  }
  const db: SqlDatabase = env.DB;
  const gamoEnv = env as unknown as GamoEnv;

  // Built lazily and inside the job's try: a missing bucket or secret fails the upload jobs only.
  let uploads: UploadService | undefined;
  const uploadService = (): UploadService => (uploads ??= uploadServiceFromEnv(db, env, () => now));

  await isolated('emails', async () => {
    const renderer = createRetryRenderer(createPayloadLoader(db, env));
    const outcomes = await retryDueOutboxEmails(
      db,
      gamoEnv,
      {
        now,
        limit: EMAIL_RETRY_LIMIT,
        render: renderer,
      },
      options,
    );
    result.emailsRetried = outcomes.length;
    result.emailsSent = outcomes.filter((o) => o.sentNow).length;
  });

  await isolated('uploads', async () => {
    const cleaned: CleanupResult = await uploadService().deletePendingOlderThan(
      PENDING_UPLOAD_MAX_AGE_SECONDS,
      now,
    );
    result.uploadsPurged = cleaned.uploads;
    result.uploadSessionsPurged = cleaned.sessions;
    result.uploadFailures = cleaned.failures;
  });

  await isolated('declinedFiles', async () => {
    const due = await allRows<{ id: string }>(db, {
      sql: `SELECT s.id FROM form_submissions s
             WHERE s.status = 'declined' AND s.reviewed_at IS NOT NULL AND s.reviewed_at < ?
               AND EXISTS (SELECT 1 FROM form_uploads u WHERE u.submission_id = s.id AND u.status <> 'deleted')
             ORDER BY s.reviewed_at, s.id LIMIT ?`,
      params: [now - DECLINED_FILE_RETENTION_SECONDS, SUBMISSION_PURGE_LIMIT],
    });
    if (due.length === 0) return;
    const service = uploadService();
    for (const { id } of due) {
      const r = await service.deleteForSubmission(id);
      result.declinedFilesDeleted += r.deleted;
      // A file that could not be deleted stays and is picked up again tomorrow.
      result.uploadFailures += r.failures;
    }
  });

  await isolated('submissions', async () => {
    const purged = await new FormsService(db, { now }).purgeExpiredSubmissions(now, {
      limit: SUBMISSION_PURGE_LIMIT,
      beforeDelete: async (ids) => {
        const service = uploadService();
        let failures = 0;
        for (const id of ids) {
          const r = await service.deleteForSubmission(id);
          result.submissionFilesDeleted += r.deleted;
          failures += r.failures;
        }
        // Deleting the record would orphan a file we could not remove: stop and retry tomorrow.
        if (failures > 0) throw new SubmissionFilesNotDeletedError();
      },
    });
    result.submissionsPurged = purged.deleted;
  });

  await isolated('offers', async () => {
    result.offersExpired = await expireOffers(db, now);
  });

  await isolated('linkTokens', async () => {
    // Same statement as CustomerLinkTokens.purgeExpired, without constructing the class (it needs
    // CUSTOMER_LINK_SECRET, which a retention delete does not use).
    result.tokensPurged = changesOf(
      await db
        .prepare('DELETE FROM customer_access_tokens WHERE expires_at <= ?1')
        .bind(now - LINK_TOKEN_RETENTION_SECONDS)
        .run(),
    );
  });

  await isolated('rateLimits', async () => {
    result.rateLimitCountersPurged = await purgeRateLimitCounters(db, now);
  });

  await isolated('recipients', async () => {
    result.recipientEmailsPurged = await purgeRecipientEmails(db, { now });
  });

  const counts = Object.entries(result)
    .filter(([key, value]) => typeof value === 'number' && key !== 'now')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.warn(
    `[daily-jobs] done ${counts} failures=${result.failures.map((f) => f.job).join(',') || 'none'}`,
  );
  return result;
}

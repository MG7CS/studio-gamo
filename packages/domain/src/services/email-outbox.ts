/**
 * One outbox for every email (design T-12): `email_log` (one row per idempotency key) and
 * `email_suppressions` (hard bounces, complaints). Message bodies are never stored or logged; the
 * recipient address is stored for support and nulled after 180 days (`purgeRecipientEmails`), the
 * keyed hash (`hashEmail`) stays for suppression matching.
 *
 *   const r = await sendOutboxEmail(db, env, { kind: 'ticket_email', idempotencyKey: `ticket_email:${orderId}`,
 *     to, subject, html, text, attachments, relatedType: 'order', relatedId: orderId, product: 'live', now });
 *   if (r.status === 'not_configured' || r.status === 'failed')
 *     show("We couldn't send the email; download your tickets below.");
 *
 * - Same idempotency key again: a sent/delivered row is returned without sending; a queued/failed/
 *   not_configured row is retried (attempts counted, exponential backoff in `next_attempt_at`); a claimed
 *   row acts as a one-minute lease so two concurrent calls never both send. Resend also receives the key.
 * - Suppressed recipients are never sent to (status `suppressed`).
 * - `allowMock` only with `ENVIRONMENT=local`; elsewhere a missing `RESEND_API_KEY` records `not_configured`.
 * - `retryDue` re-sends due rows through a caller-supplied `render` (bodies are not stored), for a future cron.
 * - `applyProviderEvent` applies Resend webhook events; `verifyResendWebhook` checks their Svix signature.
 */
import type { GamoEnv } from '@gamo/config/env';
import type { Product } from '../types/enums.ts';
import {
  createResendClient,
  type EmailAttachment,
  type EmailSendResult,
} from '@studio-gamo/integrations/resend';
import { constantTimeEqual, SecretNotConfiguredError } from '../security/crypto.ts';
import { resolveEnvSecret, isLocalEnvironment } from '../security/env-secret.ts';
import { newPrefixedId } from '../security/ids.ts';
import { hashEmail, isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { allRows, changesOf, type SqlDatabase } from '../security/sql-database.ts';

export type OutboxStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed'
  | 'not_configured';

/** After this many attempts a row stays `failed` and is no longer retried. */
export const OUTBOX_MAX_ATTEMPTS = 6;
/** First retry after 1 minute, doubling, at most 6 hours. */
export const OUTBOX_BACKOFF_BASE_SECONDS = 60;
export const OUTBOX_BACKOFF_MAX_SECONDS = 6 * 60 * 60;
/** A claimed row is not claimed again for this long (concurrent duplicate calls). */
export const OUTBOX_LEASE_SECONDS = 60;
/** Retention for `email_log.recipient_email`. */
export const RECIPIENT_EMAIL_RETENTION_SECONDS = 180 * 24 * 60 * 60;

export interface OutboxMessage {
  /** `[a-z0-9_]`, ≤ 64, e.g. `ticket_email`, `customer_link`, `academy_receipt`. */
  kind: string;
  /** Unique per message (≤ 256 chars, Resend's limit), e.g. `ticket_email:ord_…`. */
  idempotencyKey: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  from?: string;
  replyTo?: string;
  relatedType?: string;
  relatedId?: string;
  product?: Product | 'admin';
  /** Epoch seconds. */
  now: number;
}

/** A second call reused an idempotency key with a different recipient; nothing was sent. */
export class OutboxRecipientMismatchError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_RECIPIENT';
  constructor() {
    super('IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_RECIPIENT');
    this.name = 'OutboxRecipientMismatchError';
  }
}

export interface OutboxResult {
  /** Null only when nothing could be recorded (PII_HASH_SECRET missing outside local). */
  logId: string | null;
  status: OutboxStatus;
  /** True when this call delivered the message to the provider. */
  sentNow: boolean;
  /** True when an earlier call with this key already handled it (or holds the lease). */
  deduplicated: boolean;
  providerMessageId?: string | null;
  /** Local simulation (ENVIRONMENT=local without a key). */
  mocked?: boolean;
  attempts: number;
}

export interface OutboxOptions {
  /** Injected Resend fetch (tests). */
  fetchImpl?: typeof fetch;
}

interface LogRow {
  id: string;
  status: OutboxStatus;
  attempts: number;
  provider_message_id: string | null;
  recipient_email: string | null;
  recipient_hash: string;
  kind: string;
  related_type: string | null;
  related_id: string | null;
  idempotency_key: string;
}

/** Backoff after `attempts` failed attempts: 60 s, 120 s, 240 s, … ≤ 6 h. */
export function outboxBackoffSeconds(attempts: number): number {
  const n = Math.max(1, Math.floor(attempts));
  return Math.min(OUTBOX_BACKOFF_MAX_SECONDS, OUTBOX_BACKOFF_BASE_SECONDS * 2 ** (n - 1));
}

function validateMessage(m: OutboxMessage): string {
  if (!/^[a-z0-9_]{1,64}$/.test(m.kind)) throw new RangeError('outbox: invalid kind');
  if (typeof m.idempotencyKey !== 'string' || m.idempotencyKey.length < 1 || m.idempotencyKey.length > 256)
    throw new RangeError('outbox: invalid idempotency key');
  const to = normalizeEmail(m.to);
  if (!isPlausibleEmail(to)) throw new RangeError('outbox: invalid recipient');
  if (!m.subject) throw new RangeError('outbox: subject required');
  return to;
}

export async function isSuppressedHash(db: SqlDatabase, emailHash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 AS x FROM email_suppressions WHERE email_hash = ?1')
    .bind(emailHash)
    .first();
  return row !== null && row !== undefined;
}

/** Whether an address is suppressed (hard bounce, complaint, manual). Needs PII_HASH_SECRET. */
export async function isSuppressed(db: SqlDatabase, env: GamoEnv, email: string): Promise<boolean> {
  return isSuppressedHash(
    db,
    await hashEmail(email, resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET')),
  );
}

async function deliver(
  db: SqlDatabase,
  env: GamoEnv,
  row: { id: string; attempts: number; recipientHash: string },
  message: OutboxMessage,
  to: string,
  options: OutboxOptions,
): Promise<OutboxResult> {
  const { now } = message;
  // Last line of defence before the provider: only a strict ASCII addr-spec ever reaches `to`.
  if (!isPlausibleEmail(to) || to !== normalizeEmail(to)) throw new RangeError('outbox: invalid recipient');
  if (await isSuppressedHash(db, row.recipientHash)) {
    await db
      .prepare(
        "UPDATE email_log SET status = 'suppressed', next_attempt_at = NULL, last_error_code = 'suppressed', updated_at = ?2 WHERE id = ?1",
      )
      .bind(row.id, now)
      .run();
    return {
      logId: row.id,
      status: 'suppressed',
      sentNow: false,
      deduplicated: false,
      attempts: row.attempts,
    };
  }
  const client = createResendClient({
    apiKey: env.RESEND_API_KEY,
    defaultFrom: env.EMAIL_FROM,
    allowMock: isLocalEnvironment(env),
    fetchImpl: options.fetchImpl,
  });
  let result: EmailSendResult;
  try {
    result = await client.send({
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      from: message.from,
      replyTo: message.replyTo,
      attachments: message.attachments,
      headers: message.headers,
      idempotencyKey: message.idempotencyKey,
    });
  } catch {
    result = { success: false, errorCode: 'network' };
  }
  if (result.success) {
    await db
      .prepare(
        "UPDATE email_log SET status = 'sent', provider_message_id = ?2, sent_at = ?3, next_attempt_at = NULL, last_error_code = NULL, updated_at = ?3 WHERE id = ?1",
      )
      .bind(row.id, result.id ?? null, now)
      .run();
    return {
      logId: row.id,
      status: 'sent',
      sentNow: true,
      deduplicated: false,
      providerMessageId: result.id ?? null,
      mocked: result.mock === true,
      attempts: row.attempts,
    };
  }
  const status: OutboxStatus = result.notConfigured ? 'not_configured' : 'failed';
  // 4xx other than 408/429 will fail the same way again: stop retrying.
  const permanent =
    result.status !== undefined &&
    result.status >= 400 &&
    result.status < 500 &&
    ![408, 429].includes(result.status);
  const giveUp = permanent || row.attempts >= OUTBOX_MAX_ATTEMPTS;
  const errorCode = (result.errorCode ?? 'unknown').slice(0, 64);
  await db
    .prepare(
      'UPDATE email_log SET status = ?2, last_error_code = ?3, next_attempt_at = ?4, updated_at = ?5 WHERE id = ?1',
    )
    .bind(row.id, status, errorCode, giveUp ? null : now + outboxBackoffSeconds(row.attempts), now)
    .run();
  console.warn(`[email-outbox] ${message.kind}: ${status} (${errorCode}), attempt ${row.attempts}`);
  return { logId: row.id, status, sentNow: false, deduplicated: false, attempts: row.attempts };
}

const CLAIM_SQL = `UPDATE email_log SET attempts = attempts + 1, status = 'queued', next_attempt_at = ?2, updated_at = ?3
  WHERE id = ?1 AND status IN ('queued', 'failed', 'not_configured') AND attempts < ?4
    AND (next_attempt_at IS NULL OR next_attempt_at <= ?3)
  RETURNING id, attempts`;

/** Sends (or re-sends) one message through the outbox. See the module header for the rules. */
export async function sendOutboxEmail(
  db: SqlDatabase,
  env: GamoEnv,
  message: OutboxMessage,
  options: OutboxOptions = {},
): Promise<OutboxResult> {
  const to = validateMessage(message);
  const { now } = message;
  let recipientHash: string;
  try {
    recipientHash = await hashEmail(to, resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET'));
  } catch (err) {
    if (!(err instanceof SecretNotConfiguredError)) throw err;
    console.error(`[email-outbox] ${message.kind}: PII_HASH_SECRET is not configured; nothing sent`);
    return { logId: null, status: 'not_configured', sentNow: false, deduplicated: false, attempts: 0 };
  }
  await db
    .prepare(
      `INSERT INTO email_log (id, kind, product, idempotency_key, recipient_email, recipient_hash, subject, related_type, related_id, status, attempts, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'queued', 0, ?10, ?10) ON CONFLICT(idempotency_key) DO NOTHING`,
    )
    .bind(
      newPrefixedId('eml'),
      message.kind,
      message.product ?? null,
      message.idempotencyKey,
      to,
      recipientHash,
      message.subject.slice(0, 300),
      message.relatedType ?? null,
      message.relatedId ?? null,
      now,
    )
    .run();
  const existing = (await db
    .prepare(
      'SELECT id, status, attempts, provider_message_id, recipient_hash FROM email_log WHERE idempotency_key = ?1',
    )
    .bind(message.idempotencyKey)
    .first()) as Pick<LogRow, 'id' | 'status' | 'attempts' | 'provider_message_id' | 'recipient_hash'> | null;
  if (!existing) throw new Error('outbox: row vanished');
  // An idempotency key belongs to one recipient: never send a different address under an old key.
  if (!constantTimeEqual(existing.recipient_hash, recipientHash)) {
    console.error(`[email-outbox] ${message.kind}: IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_RECIPIENT`);
    throw new OutboxRecipientMismatchError();
  }
  const claimed = (await db
    .prepare(CLAIM_SQL)
    .bind(existing.id, now + OUTBOX_LEASE_SECONDS, now, OUTBOX_MAX_ATTEMPTS)
    .first()) as { id: string; attempts: number } | null;
  if (!claimed)
    return {
      logId: existing.id,
      status: existing.status,
      sentNow: false,
      deduplicated: true,
      providerMessageId: existing.provider_message_id,
      attempts: Number(existing.attempts),
    };
  // Suppression is checked on the hash of the address actually sent to (equal to the stored one, above).
  return deliver(
    db,
    env,
    { id: claimed.id, attempts: Number(claimed.attempts), recipientHash },
    message,
    to,
    options,
  );
}

export interface DueOutboxRow {
  id: string;
  kind: string;
  idempotencyKey: string;
  /** Null after the 180-day purge (such rows cannot be re-sent). */
  recipientEmail: string | null;
  relatedType: string | null;
  relatedId: string | null;
  attempts: number;
}

/**
 * Re-sends due rows (queued/failed/not_configured with `next_attempt_at <= now`) to the **stored**
 * `recipient_email` (rows whose address was purged are closed as `not_renderable`). Bodies are not stored,
 * so `render(row)` rebuilds subject/body from `kind` + related ids (it cannot change the recipient); return
 * null to stop retrying that row.
 * For a future cron (O-19); returns per-row outcomes.
 */
export async function retryDueOutboxEmails(
  db: SqlDatabase,
  env: GamoEnv,
  input: {
    now: number;
    limit?: number;
    render: (
      row: DueOutboxRow,
    ) => Promise<Omit<OutboxMessage, 'kind' | 'idempotencyKey' | 'to' | 'now'> | null>;
  },
  options: OutboxOptions = {},
): Promise<OutboxResult[]> {
  const rows = await allRows<LogRow>(db, {
    sql: `SELECT id, kind, idempotency_key, recipient_email, related_type, related_id, attempts FROM email_log
           WHERE status IN ('queued', 'failed', 'not_configured') AND next_attempt_at IS NOT NULL AND next_attempt_at <= ?1
             AND attempts < ?2 ORDER BY next_attempt_at LIMIT ?3`,
    params: [input.now, OUTBOX_MAX_ATTEMPTS, Math.min(Math.max(1, input.limit ?? 25), 100)],
  });
  const out: OutboxResult[] = [];
  for (const row of rows) {
    const due: DueOutboxRow = {
      id: row.id,
      kind: row.kind,
      idempotencyKey: row.idempotency_key,
      recipientEmail: row.recipient_email,
      relatedType: row.related_type,
      relatedId: row.related_id,
      attempts: Number(row.attempts),
    };
    const rendered = row.recipient_email ? await input.render(due) : null;
    if (!rendered || !row.recipient_email) {
      await db
        .prepare(
          "UPDATE email_log SET status = 'failed', next_attempt_at = NULL, last_error_code = 'not_renderable', updated_at = ?2 WHERE id = ?1",
        )
        .bind(row.id, input.now)
        .run();
      out.push({
        logId: row.id,
        status: 'failed',
        sentNow: false,
        deduplicated: false,
        attempts: due.attempts,
      });
      continue;
    }
    out.push(
      await sendOutboxEmail(
        db,
        env,
        {
          ...rendered,
          kind: row.kind,
          idempotencyKey: row.idempotency_key,
          to: row.recipient_email,
          now: input.now,
        },
        options,
      ),
    );
  }
  return out;
}

export type ProviderEventType =
  'email.delivered' | 'email.delivery_delayed' | 'email.bounced' | 'email.complained' | 'email.failed';

/**
 * Applies a Resend webhook event to the matching `email_log` row (by provider message id). Statuses never
 * move backwards (a late `delivered` does not undo a bounce). A permanent bounce (or a bounce without a
 * type) and a complaint add the recipient's hash to `email_suppressions`. Unknown event types are ignored.
 * `email` is accepted for logging symmetry but never needed: the row's stored hash is used.
 */
export async function applyProviderEvent(
  db: SqlDatabase,
  input: {
    type: string;
    providerMessageId: string;
    email?: string | null;
    /** Resend `data.bounce.type` (`Permanent` / `Temporary`), when present. */
    bounceType?: string | null;
    now: number;
  },
): Promise<{ applied: boolean; status?: OutboxStatus; suppressed?: boolean }> {
  const map: Record<ProviderEventType, { status: OutboxStatus; from: readonly OutboxStatus[] }> = {
    'email.delivered': { status: 'delivered', from: ['queued', 'sent', 'delivery_delayed', 'failed'] },
    'email.delivery_delayed': { status: 'delivery_delayed', from: ['queued', 'sent'] },
    'email.bounced': {
      status: 'bounced',
      from: ['queued', 'sent', 'delivery_delayed', 'delivered', 'failed'],
    },
    'email.complained': {
      status: 'complained',
      from: ['queued', 'sent', 'delivery_delayed', 'delivered', 'bounced', 'failed'],
    },
    'email.failed': { status: 'failed', from: ['queued', 'sent', 'delivery_delayed'] },
  };
  const rule = (map as Record<string, (typeof map)[ProviderEventType] | undefined>)[input.type];
  if (!rule || !input.providerMessageId) return { applied: false };
  const row = (await db
    .prepare('SELECT id, status, recipient_hash FROM email_log WHERE provider_message_id = ?1')
    .bind(input.providerMessageId)
    .first()) as Pick<LogRow, 'id' | 'status' | 'recipient_hash'> | null;
  if (!row) return { applied: false };
  const statements = [];
  const moves = rule.from.includes(row.status);
  if (moves)
    statements.push(
      db
        .prepare(
          `UPDATE email_log SET status = ?2, next_attempt_at = NULL, updated_at = ?3 WHERE id = ?1 AND status IN (${rule.from.map((s) => `'${s}'`).join(', ')})`,
        )
        .bind(row.id, rule.status, input.now),
    );
  const hard =
    input.type === 'email.complained' ||
    (input.type === 'email.bounced' && (!input.bounceType || /^permanent$/i.test(input.bounceType)));
  if (hard)
    statements.push(
      db
        .prepare(
          'INSERT INTO email_suppressions (email_hash, reason, created_at) VALUES (?1, ?2, ?3) ON CONFLICT(email_hash) DO NOTHING',
        )
        .bind(row.recipient_hash, input.type === 'email.complained' ? 'complaint' : 'hard_bounce', input.now),
    );
  if (statements.length) await db.batch(statements);
  return { applied: moves, status: moves ? rule.status : row.status, suppressed: hard };
}

/** Retention: nulls `recipient_email` on rows older than `olderThanSeconds` (default 180 days). */
export async function purgeRecipientEmails(
  db: SqlDatabase,
  input: { now: number; olderThanSeconds?: number },
): Promise<number> {
  const cutoff = input.now - (input.olderThanSeconds ?? RECIPIENT_EMAIL_RETENTION_SECONDS);
  return changesOf(
    await db
      .prepare(
        'UPDATE email_log SET recipient_email = NULL WHERE created_at <= ?1 AND recipient_email IS NOT NULL',
      )
      .bind(cutoff)
      .run(),
  );
}

/** The outbox as one object, for callers that prefer `EmailOutbox.send(...)`. */
export const EmailOutbox = {
  send: sendOutboxEmail,
  retryDue: retryDueOutboxEmails,
  applyProviderEvent,
  isSuppressed,
  isSuppressedHash,
  purgeRecipientEmails,
} as const;

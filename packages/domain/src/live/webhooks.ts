/**
 * The Stripe webhook receiver for Gamo Live (docs/LIVE_REQUIREMENTS.md §8 item 12, docs/LIVE_PAYMENTS.md §4). The
 * app's two routes (`/api/stripe/webhook`, platform; `/api/stripe/connect-webhook`, Connect) pass the raw body and the
 * `Stripe-Signature` header here, with the handler map assembled from the modules' exported handlers.
 *
 * 1. Body at most 256 KB and strict UTF-8 (413 / 400).
 * 2. Signature against the endpoint's secrets (none configured → 503; bad, expired or missing → 400).
 * 3. `livemode` must match the environment (live only in production); the Connect endpoint requires a top-level
 *    `account`, the platform endpoint refuses one (400).
 * 4. Claim in `stripe_events` with a fresh claim token: a duplicate already processed or ignored answers 200, one still
 *    processing answers 409 (Stripe retries), a failed one or a claim older than 5 minutes is taken over.
 * 5. Dispatch to `handlers[event.type]` (none → `ignored`, 200). `retry` → marked failed, 500 so Stripe redelivers;
 *    an exception → failed, 500, logging only the event type and an error code.
 * 6. Mark the result only while our claim token still holds; a lost claim answers 409.
 */
import { bytesToHex, randomBytes } from '../security/crypto.ts';
import { allRows, type SqlDatabase } from '../security/sql-database.ts';
import {
  PaidError,
  type HandlerResult,
  type PaidEnv,
  type StripeEvent,
  type StripeEventHandlers,
} from './paid-types.ts';
import { webhookSecretsOf } from './payments/resolve.ts';
import { verifyStripeSignature } from './payments/signature.ts';
import { StripeApiError } from './payments/types.ts';

export { signStripePayload, verifyStripeSignature, parseStripeEvent } from './payments/signature.ts';

export const STRIPE_WEBHOOK_MAX_BYTES = 256 * 1024;
/** A claim older than this is considered abandoned and may be taken over. */
export const STRIPE_EVENT_STALE_SECONDS = 5 * 60;

export interface ReceiveStripeWebhookInput {
  db: SqlDatabase;
  env: PaidEnv;
  /** The raw request body: bytes (decoded here, strictly) or text already decoded by the route. */
  rawBody: string | Uint8Array | ArrayBuffer;
  signatureHeader: string | null;
  endpoint: 'platform' | 'connect';
  now: number;
  handlers: StripeEventHandlers;
}

export interface WebhookResponse {
  status: number;
  body: string;
}

const answer = (status: number, result: string): WebhookResponse => ({
  status,
  body: JSON.stringify({ result }),
});

/** True when a JS string has no lone surrogate (it encodes to UTF-8 losslessly). */
function isWellFormed(text: string): boolean {
  return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
}

function decodeBody(
  raw: string | Uint8Array | ArrayBuffer,
): { text: string } | { status: number; result: string } {
  if (typeof raw === 'string') {
    if (!isWellFormed(raw)) return { status: 400, result: 'invalid_utf8' };
    if (new TextEncoder().encode(raw).length > STRIPE_WEBHOOK_MAX_BYTES)
      return { status: 413, result: 'too_large' };
    return { text: raw };
  }
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  if (bytes.length > STRIPE_WEBHOOK_MAX_BYTES) return { status: 413, result: 'too_large' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch {
    return { status: 400, result: 'invalid_utf8' };
  }
}

/** A short code for the log and `stripe_events.error_code`; never a message, which could carry personal data. */
export function webhookErrorCode(error: unknown): string {
  if (error instanceof PaidError) return `paid_${error.code}`;
  if (error instanceof StripeApiError)
    return `stripe_${error.status}${error.stripeCode ? `_${error.stripeCode}` : ''}`.slice(0, 80);
  return 'exception';
}

type Claim = { claimed: true; token: string } | { claimed: false; status: string };

/** Records the event as `processing` under a fresh token, or reports the state of an earlier delivery. */
export async function claimStripeEvent(db: SqlDatabase, event: StripeEvent, now: number): Promise<Claim> {
  const token = bytesToHex(randomBytes(16));
  const rows = await allRows<{ claim_token: string }>(db, {
    sql:
      'INSERT INTO stripe_events (id, type, account_id, livemode, status, claim_token, claimed_at, stripe_created_at, received_at) ' +
      "VALUES (?1, ?2, ?3, ?4, 'processing', ?5, ?6, ?7, ?6) " +
      "ON CONFLICT (id) DO UPDATE SET status = 'processing', claim_token = excluded.claim_token, " +
      'claimed_at = excluded.claimed_at, error_code = NULL, processed_at = NULL ' +
      "WHERE stripe_events.status = 'failed' OR (stripe_events.status = 'processing' AND stripe_events.claimed_at <= ?8) " +
      'RETURNING claim_token',
    params: [
      event.id,
      event.type,
      event.account ?? null,
      event.livemode ? 1 : 0,
      token,
      now,
      event.created,
      now - STRIPE_EVENT_STALE_SECONDS,
    ],
  });
  if (rows[0]?.claim_token === token) return { claimed: true, token };
  const [row] = await allRows<{ status: string }>(db, {
    sql: 'SELECT status FROM stripe_events WHERE id = ?1',
    params: [event.id],
  });
  return { claimed: false, status: row?.status ?? 'processing' };
}

/** Writes the outcome only if the claim is still ours. */
export async function markStripeEvent(
  db: SqlDatabase,
  input: {
    eventId: string;
    token: string;
    status: 'processed' | 'ignored' | 'failed';
    errorCode: string | null;
    now: number;
  },
): Promise<boolean> {
  const rows = await allRows(db, {
    sql:
      'UPDATE stripe_events SET status = ?1, error_code = ?2, processed_at = ?3 ' +
      "WHERE id = ?4 AND claim_token = ?5 AND status = 'processing' RETURNING id",
    params: [input.status, input.errorCode, input.now, input.eventId, input.token],
  });
  return rows.length === 1;
}

export async function receiveStripeWebhook(input: ReceiveStripeWebhookInput): Promise<WebhookResponse> {
  const decoded = decodeBody(input.rawBody);
  if (!('text' in decoded)) return answer(decoded.status, decoded.result);

  const secrets = webhookSecretsOf(input.env, input.endpoint);
  if (secrets.length === 0) return answer(503, 'not_configured');

  const event = await verifyStripeSignature({
    rawBody: decoded.text,
    signatureHeader: input.signatureHeader,
    secrets,
    now: input.now,
  });
  if (!event) return answer(400, 'bad_signature');

  const production = input.env.ENVIRONMENT === 'production';
  if (event.livemode !== production) return answer(400, 'wrong_mode');
  if (input.endpoint === 'connect' && !event.account) return answer(400, 'account_required');
  if (input.endpoint === 'platform' && event.account) return answer(400, 'unexpected_account');

  const claim = await claimStripeEvent(input.db, event, input.now);
  if (!claim.claimed) {
    if (claim.status === 'processed' || claim.status === 'ignored') return answer(200, 'duplicate');
    return answer(409, 'in_progress');
  }

  const handler = input.handlers[event.type];
  let result: HandlerResult;
  let errorCode: string | null = null;
  try {
    result = handler
      ? await handler(event, { db: input.db, env: input.env, now: input.now, endpoint: input.endpoint })
      : 'ignored';
  } catch (error) {
    errorCode = webhookErrorCode(error);
    console.error('stripe_webhook_failed', { type: event.type, code: errorCode });
    result = 'retry';
  }

  const status = result === 'retry' ? 'failed' : result;
  const marked = await markStripeEvent(input.db, {
    eventId: event.id,
    token: claim.token,
    status,
    errorCode: result === 'retry' ? (errorCode ?? 'retry') : null,
    now: input.now,
  });
  if (!marked) return answer(409, 'claim_lost');
  if (status === 'failed') return answer(500, errorCode ? 'error' : 'retry');
  return answer(200, status);
}

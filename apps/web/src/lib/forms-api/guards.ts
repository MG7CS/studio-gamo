/**
 * Guards for the public upload routes: per-IP rate limits for routes that carry no Turnstile token,
 * the `X-Upload-Token` header, a cheap session lookup (to learn the form before any storage work),
 * and the Turnstile request rewrite for `upload-session`.
 */
import type { GamoEnv } from '@gamo/config/env';
import { errorResponse } from '@gamo/domain';
import {
  asSqlDatabase,
  checkRateLimits,
  clientIp,
  hashIp,
  rateLimitBucket,
  resolveEnvSecret,
  sha256Hex,
  type SqlDatabase,
} from '@gamo/domain/security';
import { readBoundedBody, TURNSTILE_RESPONSE_FIELD } from '@gamo/domain/public-form-guard';

const UPLOAD_TOKEN_HEADER = 'x-upload-token';
/** The shape `UploadService` issues (43 random base64url characters, a dot, a 22-character hex tag). */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}\.[0-9a-f]{22}$/;

export interface RateRule {
  limit: number;
  windowSeconds: number;
}

/** Limits per route; generous for parts (a 500 MB video is 63 parts and a church may share one address). */
export const UPLOAD_RATE_LIMITS = {
  session: { limit: 10, windowSeconds: 15 * 60 },
  start: { limit: 60, windowSeconds: 15 * 60 },
  part: { limit: 600, windowSeconds: 15 * 60 },
  complete: { limit: 120, windowSeconds: 15 * 60 },
  remove: { limit: 120, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateRule>;

/** The database binding, or null (the caller answers 503 through `unavailable()`). */
export function databaseOf(env: GamoEnv): SqlDatabase | null {
  try {
    return asSqlDatabase(env.DB);
  } catch {
    console.error('[forms-api] DB binding unavailable');
    return null;
  }
}

/**
 * Counts one request against the caller's hashed IP. Returns the 429 response (with `Retry-After`) when the
 * limit is exceeded, otherwise null. Throws `SecretNotConfiguredError` (503) outside local without
 * PII_HASH_SECRET.
 */
export async function limitByIp(
  request: Request,
  env: GamoEnv,
  db: SqlDatabase,
  route: string,
  rule: RateRule,
  now = Math.floor(Date.now() / 1000),
): Promise<Response | null> {
  const secret = resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET');
  const ipHash = await hashIp(clientIp(request) ?? 'unknown', secret);
  const result = await checkRateLimits(db, [{ bucket: rateLimitBucket(route, 'ip', ipHash), ...rule }], now);
  if (result.allowed) return null;
  console.warn(`[forms-api] ${route}: rate limited`);
  return errorResponse(
    'RATE_LIMITED',
    'Too many requests from here. Please wait a moment and try again.',
    429,
    undefined,
    { 'Retry-After': String(result.retryAfterSeconds) },
  );
}

/** The `X-Upload-Token` header value, or '' (the service answers 401 for anything that is not a token). */
export function tokenFromHeader(request: Request): string {
  return request.headers.get(UPLOAD_TOKEN_HEADER)?.trim() ?? '';
}

/**
 * Looks up the form an upload token belongs to without touching storage. Null for anything that is not a
 * live session token (wrong shape, unknown, expired); the service repeats the full HMAC check on use.
 */
export async function sessionFormSlug(
  db: SqlDatabase,
  token: string,
  now = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  if (!TOKEN_FORMAT.test(token)) return null;
  const row = (await db
    .prepare('SELECT form_slug, expires_at FROM upload_sessions WHERE token_hash = ?')
    .bind(await sha256Hex(token))
    .first()) as { form_slug: string; expires_at: number } | null;
  if (!row || Number(row.expires_at) <= now) return null;
  return row.form_slug;
}

/**
 * The contract sends `{turnstileToken}`; `guardPublicForm` reads the widget's `cf-turnstile-response` field.
 * Returns an equivalent request carrying the token under that name, or a 4xx response for a body that is
 * not exactly `{turnstileToken: string}`.
 */
export async function turnstileRequest(request: Request): Promise<Request | Response> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json')
    return errorResponse('UNSUPPORTED_MEDIA_TYPE', 'Send the request as JSON.', 415);
  const read = await readBoundedBody(request, 8 * 1024);
  if (!read.ok)
    return read.reason === 'too_large'
      ? errorResponse('PAYLOAD_TOO_LARGE', 'The request is too large.', 413)
      : errorResponse('BAD_REQUEST', 'The request could not be read.', 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read.bytes));
  } catch {
    return errorResponse('BAD_REQUEST', 'The request could not be read.', 400);
  }
  const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : [];
  const token = (parsed as { turnstileToken?: unknown } | null)?.turnstileToken;
  if (keys.length !== 1 || keys[0] !== 'turnstileToken' || typeof token !== 'string' || token.length < 1)
    return errorResponse('BAD_REQUEST', 'The request is invalid.', 400);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify({ [TURNSTILE_RESPONSE_FIELD]: token }),
  });
}

/**
 * One guard for every public (signed-out) form: parse the body once, check configuration, rate-limit
 * by hashed IP, verify Cloudflare Turnstile, then rate-limit by hashed email (design T-08, §4.2).
 *
 *   const guard = await guardPublicForm(context, {
 *     route: 'live.rsvp',
 *     turnstileAction: 'rsvp',
 *     limits: { perIp: { limit: 20, windowSeconds: 600 }, perEmail: { limit: 5, windowSeconds: 3600 } },
 *   });
 *   if (!guard.ok) return guard.response;          // JSON API routes
 *   const name = guard.body.get('name');           // the body is already read: never read the request again
 *
 * Plain HTML form posts (no JS) use `guardPublicFormForPage`, which returns an error the page renders
 * inline (summary + field message) instead of a JSON response.
 *
 * Order matters: the per-IP limit runs before Turnstile (so floods never reach siteverify), and the
 * per-email limit runs after it (so someone without a valid token cannot use up a victim's email budget).
 *
 * Fail closed: outside `ENVIRONMENT=local`, a missing `TURNSTILE_SECRET_KEY` (when Turnstile is required),
 * `PII_HASH_SECRET` or `DB` answers 503 "temporarily unavailable". In local, Turnstile accepts the
 * documented dummy token without a secret and PII hashing uses a fixed development key (`resolveEnvSecret`).
 * Logs carry the route, variable names and failure reasons only — never addresses, IPs or tokens.
 */
import type { GamoEnv } from '@gamo/config/env';
import { errorResponse, getRuntimeEnv } from './response.ts';
import { checkRateLimits, rateLimitBucket, type RateLimitRule } from '../security/rate-limit.ts';
import { verifyTurnstile, type TurnstileFailure } from '../security/turnstile.ts';
import { clientIp, hashEmail, hashIp, isPlausibleEmail } from '../security/pii-hash.ts';
import { isLocalEnvironment, resolveEnvSecret } from '../security/env-secret.ts';
import { isSqlDatabase } from '../security/sql-database.ts';
import { SecretNotConfiguredError } from '../security/crypto.ts';

/** Form/JSON field Cloudflare's widget writes its token into (`data-response-field-name`). */
export const TURNSTILE_RESPONSE_FIELD = 'cf-turnstile-response';
/** Default element id of `TurnstileWidget.astro` (error-summary links point here). */
export const TURNSTILE_WIDGET_ID = 'turnstile-widget';
/** Bodies larger than this are refused before parsing (public forms are small). */
export const PUBLIC_FORM_MAX_BYTES = 64 * 1024;

export interface PublicFormLimit {
  limit: number;
  windowSeconds: number;
}

export interface PublicFormGuardOptions {
  /** Short stable label used in rate-limit buckets and logs, e.g. `live.rsvp` (`[a-z0-9._/-]`). */
  route: string;
  /** Expected widget `data-action`; when set, a token from another form is refused. */
  turnstileAction?: string;
  /** Default true. Pass false only for forms that are protected some other way. */
  requireTurnstile?: boolean;
  /** When set, the token must have been issued for this hostname. */
  expectedHostname?: string;
  limits: {
    perIp?: PublicFormLimit;
    /**
     * Limit per normalised email. `email` defaults to the body's `field` (default `email`);
     * an empty or implausible address skips this limit (validation rejects it afterwards).
     */
    perEmail?: PublicFormLimit & { email?: string | null; field?: string };
  };
  /** Body limit in bytes (default `PUBLIC_FORM_MAX_BYTES`, 64 KiB). */
  maxBytes?: number;
  /** Opt in to `multipart/form-data` with a route-specific byte limit (refused with 415 otherwise). */
  allowMultipart?: { maxBytes: number };
  /** Epoch seconds (tests). */
  now?: number;
  /** Injected siteverify fetch (tests). */
  fetchImpl?: typeof fetch;
}

/** The request body, read exactly once. */
export interface PublicFormBody {
  type: 'form' | 'json';
  /** First value of a field as a string (JSON numbers/booleans are stringified), or null. */
  get(name: string): string | null;
  /** Every value of a field (repeated form fields, JSON arrays). */
  getAll(name: string): string[];
  /** Set for form-encoded and multipart bodies. */
  form?: FormData;
  /** Set for JSON bodies (always a plain object). */
  json?: Record<string, unknown>;
}

export interface PublicFormGuardSuccess {
  ok: true;
  body: PublicFormBody;
  /** HMAC of the client IP with PII_HASH_SECRET (store in `*.ip_hash`). */
  ipHash: string;
  /** HMAC of the normalised email, when a per-email limit ran. */
  emailHash?: string;
  /** True when the local dummy Turnstile token was accepted (ENVIRONMENT=local only). */
  turnstileMocked: boolean;
}

export type PublicFormErrorCode =
  | 'BAD_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNAVAILABLE'
  | 'TURNSTILE_REQUIRED'
  | 'TURNSTILE_FAILED'
  | 'RATE_LIMITED';

/** A failure a page can render inline: a summary message plus, when it belongs to one, a field. */
export interface PublicFormError {
  status: 400 | 403 | 413 | 415 | 429 | 503;
  code: PublicFormErrorCode;
  /** Human sentence for the error summary and API clients. */
  message: string;
  /** Field name the message belongs to (`cf-turnstile-response` for the security check). */
  field?: string;
  /** Element id the error summary should link to. */
  fieldId?: string;
  /** Seconds to wait (429 only); also sent as `Retry-After`. */
  retryAfterSeconds?: number;
  /** Headers to put on the response (`Retry-After`, `Cache-Control`). */
  headers: Record<string, string>;
}

export type PublicFormGuardResult =
  PublicFormGuardSuccess | { ok: false; response: Response; error: PublicFormError };
export type PublicFormPageGuardResult = PublicFormGuardSuccess | { ok: false; error: PublicFormError };

type GuardInput = { request: Request; env?: GamoEnv; locals?: unknown };

const UNAVAILABLE_MESSAGE = 'This form is temporarily unavailable. Please try again later.';

/** "about 1 minute", "about 12 minutes", "about 2 hours". */
export function describeWait(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return s === 1 ? '1 second' : `${s} seconds`;
  const minutes = Math.ceil(s / 60);
  if (minutes < 60) return minutes === 1 ? 'about 1 minute' : `about ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? 'about 1 hour' : `about ${hours} hours`;
}

function failure(
  status: PublicFormError['status'],
  code: PublicFormErrorCode,
  message: string,
  extra: Partial<Pick<PublicFormError, 'field' | 'fieldId' | 'retryAfterSeconds'>> = {},
): PublicFormError {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (extra.retryAfterSeconds !== undefined) headers['Retry-After'] = String(extra.retryAfterSeconds);
  return { status, code, message, headers, ...extra };
}

function bodyFromForm(form: FormData): PublicFormBody {
  const strings = (name: string) => form.getAll(name).filter((v): v is string => typeof v === 'string');
  return {
    type: 'form',
    form,
    get: (name) => strings(name)[0] ?? null,
    getAll: strings,
  };
}

function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function bodyFromJson(json: Record<string, unknown>): PublicFormBody {
  const all = (name: string): string[] => {
    const v = Object.prototype.hasOwnProperty.call(json, name) ? json[name] : undefined;
    if (Array.isArray(v)) return v.map(scalar).filter((x): x is string => x !== null);
    const s = scalar(v);
    return s === null ? [] : [s];
  };
  return { type: 'json', json, get: (name) => all(name)[0] ?? null, getAll: all };
}

export type BoundedBodyResult =
  { ok: true; bytes: Uint8Array } | { ok: false; reason: 'too_large' | 'unreadable' };

/**
 * Reads at most `maxBytes` of a request body, counting bytes as they arrive and cancelling the stream as
 * soon as the limit is passed. `Content-Length` is only a fast path for an honest oversize declaration: a
 * missing or lying header changes nothing. Use it for any route-specific reader (e.g. uploads).
 */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<BoundedBodyResult> {
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new RangeError('readBoundedBody: maxBytes');
  const declared = request.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared) > maxBytes)
    return { ok: false, reason: 'too_large' };
  if (request.bodyUsed) return { ok: false, reason: 'unreadable' };
  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export interface ReadPublicFormBodyOptions {
  /** Default `PUBLIC_FORM_MAX_BYTES` (64 KiB). */
  maxBytes?: number;
  /**
   * `multipart/form-data` is refused (415) on public forms unless a route opts in with its own bounded
   * limit. The bytes are still read through `readBoundedBody` before parsing.
   */
  allowMultipart?: { maxBytes: number };
}

/**
 * Reads a form-encoded or JSON body once (bounded, byte-counted, strict UTF-8). Multipart only when
 * `allowMultipart` is set. Fails with 413 when too large, 415 for other content types, 400 when malformed.
 */
export async function readPublicFormBody(
  request: Request,
  options: ReadPublicFormBodyOptions = {},
): Promise<{ ok: true; body: PublicFormBody } | { ok: false; error: PublicFormError }> {
  const bad = failure(400, 'BAD_REQUEST', "We couldn't read the form. Please reload the page and try again.");
  const tooLarge = failure(
    413,
    'PAYLOAD_TOO_LARGE',
    'The form is too large to send. Please shorten what you typed and try again.',
  );
  const contentType = request.headers.get('content-type') ?? '';
  const type = contentType.split(';')[0].trim().toLowerCase();
  const multipart = type === 'multipart/form-data';
  if (multipart && !options.allowMultipart)
    return {
      ok: false,
      error: failure(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        "This form can't accept file uploads. Please reload the page and send it again.",
      ),
    };
  if (!multipart && type !== 'application/json' && type !== 'application/x-www-form-urlencoded')
    return {
      ok: false,
      error: failure(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        "We couldn't read the form. Please reload the page and try again.",
      ),
    };
  const limit = multipart
    ? (options.allowMultipart?.maxBytes ?? PUBLIC_FORM_MAX_BYTES)
    : (options.maxBytes ?? PUBLIC_FORM_MAX_BYTES);
  const read = await readBoundedBody(request, limit);
  if (!read.ok) return { ok: false, error: read.reason === 'too_large' ? tooLarge : bad };
  try {
    if (multipart) {
      const form = await new Response(read.bytes as BodyInit, {
        headers: { 'content-type': contentType },
      }).formData();
      return { ok: true, body: bodyFromForm(form) };
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(read.bytes);
    if (type === 'application/json') {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: bad };
      return { ok: true, body: bodyFromJson(parsed as Record<string, unknown>) };
    }
    const form = new FormData();
    for (const [k, v] of new URLSearchParams(text)) form.append(k, v);
    return { ok: true, body: bodyFromForm(form) };
  } catch {
    return { ok: false, error: bad };
  }
}

function turnstileError(reason: TurnstileFailure, route: string, fieldId: string): PublicFormError {
  const at = { field: TURNSTILE_RESPONSE_FIELD, fieldId };
  switch (reason) {
    case 'missing_token':
      return failure(
        400,
        'TURNSTILE_REQUIRED',
        'Please complete the security check, then send the form again.',
        at,
      );
    case 'rejected':
    case 'hostname_mismatch':
    case 'action_mismatch':
      return failure(
        403,
        'TURNSTILE_FAILED',
        "The security check didn't go through. Please try it again, then send the form.",
        at,
      );
    case 'unavailable':
      return failure(
        503,
        'UNAVAILABLE',
        "We couldn't run the security check just now. Please wait a moment and try again.",
      );
    case 'not_configured':
    default:
      console.error(`[public-form] ${route}: Turnstile is not configured (TURNSTILE_SECRET_KEY)`);
      return failure(503, 'UNAVAILABLE', UNAVAILABLE_MESSAGE);
  }
}

function rateLimitError(retryAfterSeconds: number): PublicFormError {
  return failure(
    429,
    'RATE_LIMITED',
    `Too many attempts from here. Please wait ${describeWait(retryAfterSeconds)} and try again.`,
    { retryAfterSeconds },
  );
}

async function runGuard(
  input: GuardInput,
  options: PublicFormGuardOptions & { turnstileFieldId?: string },
): Promise<PublicFormGuardSuccess | { ok: false; error: PublicFormError }> {
  const { route } = options;
  rateLimitBucket(route, 'key', '0'.repeat(16)); // validates the route label early (throws on a bad label)
  const env: GamoEnv = input.env ?? (await getRuntimeEnv(input));
  const local = isLocalEnvironment(env);
  const requireTurnstile = options.requireTurnstile !== false;
  const now = options.now ?? Math.floor(Date.now() / 1000);

  const parsed = await readPublicFormBody(input.request, {
    maxBytes: options.maxBytes,
    allowMultipart: options.allowMultipart,
  });
  if (!parsed.ok) return parsed;
  const body = parsed.body;

  if (!isSqlDatabase(env.DB)) {
    console.error(`[public-form] ${route}: DB binding unavailable`);
    return { ok: false, error: failure(503, 'UNAVAILABLE', UNAVAILABLE_MESSAGE) };
  }
  const db = env.DB;
  const turnstileSecret = typeof env.TURNSTILE_SECRET_KEY === 'string' ? env.TURNSTILE_SECRET_KEY.trim() : '';
  if (requireTurnstile && !turnstileSecret && !local) {
    console.error(`[public-form] ${route}: TURNSTILE_SECRET_KEY is not configured`);
    return { ok: false, error: failure(503, 'UNAVAILABLE', UNAVAILABLE_MESSAGE) };
  }
  let piiSecret: string;
  try {
    piiSecret = resolveEnvSecret(env as Record<string, unknown>, 'PII_HASH_SECRET');
  } catch (err) {
    if (!(err instanceof SecretNotConfiguredError)) throw err;
    console.error(`[public-form] ${route}: PII_HASH_SECRET is not configured`);
    return { ok: false, error: failure(503, 'UNAVAILABLE', UNAVAILABLE_MESSAGE) };
  }

  const ip = clientIp(input.request);
  // Without cf-connecting-ip (only possible off Cloudflare, e.g. local dev) all such callers share one bucket.
  const ipHash = await hashIp(ip ?? 'unknown', piiSecret);

  if (options.limits.perIp) {
    const rule: RateLimitRule = { bucket: rateLimitBucket(route, 'ip', ipHash), ...options.limits.perIp };
    const r = await checkRateLimits(db, [rule], now);
    if (!r.allowed) {
      console.warn(`[public-form] ${route}: rate limited (ip)`);
      return { ok: false, error: rateLimitError(r.retryAfterSeconds) };
    }
  }

  let turnstileMocked = false;
  if (requireTurnstile) {
    const result = await verifyTurnstile({
      token: body.get(TURNSTILE_RESPONSE_FIELD),
      secret: turnstileSecret,
      remoteIp: ip,
      allowMock: local,
      expectedAction: options.turnstileAction,
      expectedHostname: options.expectedHostname,
      fetchImpl: options.fetchImpl,
    });
    if (!result.ok) {
      if (result.reason !== 'not_configured')
        console.warn(`[public-form] ${route}: Turnstile ${result.reason}`);
      return {
        ok: false,
        error: turnstileError(result.reason, route, options.turnstileFieldId ?? TURNSTILE_WIDGET_ID),
      };
    }
    turnstileMocked = result.mocked;
  }

  let emailHash: string | undefined;
  const perEmail = options.limits.perEmail;
  if (perEmail) {
    const email = perEmail.email ?? body.get(perEmail.field ?? 'email');
    if (email && isPlausibleEmail(email)) {
      emailHash = await hashEmail(email, piiSecret);
      const r = await checkRateLimits(
        db,
        [
          {
            bucket: rateLimitBucket(route, 'email', emailHash),
            limit: perEmail.limit,
            windowSeconds: perEmail.windowSeconds,
          },
        ],
        now,
      );
      if (!r.allowed) {
        console.warn(`[public-form] ${route}: rate limited (email)`);
        return {
          ok: false,
          error: {
            ...rateLimitError(r.retryAfterSeconds),
            message: `Too many requests for this email address. Please wait ${describeWait(r.retryAfterSeconds)} and try again.`,
          },
        };
      }
    }
  }

  return { ok: true, body, ipHash, ...(emailHash ? { emailHash } : {}), turnstileMocked };
}

/** JSON API variant: on failure, `response` is a standard `errorResponse` (with `Retry-After` on 429). */
export async function guardPublicForm(
  input: GuardInput,
  options: PublicFormGuardOptions,
): Promise<PublicFormGuardResult> {
  const result = await runGuard(input, options);
  if (result.ok) return result;
  const { error } = result;
  const details = error.field
    ? [{ field: error.field, message: error.message, code: error.code }]
    : undefined;
  return {
    ok: false,
    error,
    response: errorResponse(error.code, error.message, error.status, details, error.headers),
  };
}

/**
 * HTML form variant (no JS): returns the error for the page to render with `FormErrorSummary` and the
 * field message. Set `Astro.response.status = error.status` and copy `error.headers` onto `Astro.response`.
 */
export async function guardPublicFormForPage(
  input: GuardInput,
  options: PublicFormGuardOptions & { turnstileFieldId?: string },
): Promise<PublicFormPageGuardResult> {
  return runGuard(input, options);
}

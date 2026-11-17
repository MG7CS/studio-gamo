/**
 * The helpers every admin screen starts with. The middleware has already validated the staff session
 * (Cloudflare Access + gateway cookie) and put it on `locals.adminAuthSession`; these turn it into the
 * context a page or an API route works with, and answer writes the post-redirect-get way.
 *
 * A page (`.astro`) opens with:
 *
 *   let admin: AdminContext;
 *   try {
 *     admin = await adminPage(Astro);
 *   } catch (error) {
 *     if (error instanceof Response) return error;
 *     throw error;
 *   }
 *
 * An API route or POST handler calls `adminApi(context)` (session, Access identity, same origin), reads
 * the body with `readBody`, answers with `jsonOrSee` and maps failures with `domainErrorResponse`.
 */
import type { GamoEnv } from '@gamo/config/env';
import { isStaffOrAdmin, requireSameOrigin, type SessionData } from '@gamo/auth';
import { errorResponse, getRuntimeEnv, jsonResponse, staffContext, type StaffActor } from '@gamo/domain';
import { asSqlDatabase, type SqlDatabase } from '@gamo/domain/security';

export interface AdminContext {
  env: GamoEnv;
  db: SqlDatabase;
  staff: StaffActor;
  auth: SessionData;
}

/** What `adminPage` and `adminApi` need from Astro's `Astro` global or an API route `context`. */
type AstroLike = { request: Request; locals?: unknown; params?: Record<string, string | undefined> };

const MAX_BODY_BYTES = 256 * 1024;
const NOTICE_KEY = /^[a-z0-9-]{1,40}$/;
/** Never copied from a request body: assigning these on a plain object changes its prototype chain. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function staffActorOf(auth: SessionData): StaffActor {
  return {
    userId: auth.user.id,
    name: auth.user.displayName?.trim() || auth.user.email,
    email: auth.user.email,
  };
}

/**
 * The staff context for a page. Throws a `Response` (401 without a staff session, 403 for a cross-origin
 * write or a non-staff session, 503 without a database) that the page returns as is.
 */
export async function adminPage(astro: { locals: App.Locals; request: Request }): Promise<AdminContext> {
  const auth = astro.locals?.adminAuthSession;
  if (!auth) throw errorResponse('UNAUTHENTICATED', 'Staff sign-in is required.', 401);
  if (!isStaffOrAdmin(auth)) throw errorResponse('FORBIDDEN', 'Staff permissions are required.', 403);
  try {
    requireSameOrigin(astro.request);
  } catch {
    throw errorResponse('FORBIDDEN', 'Cross-origin request denied.', 403);
  }
  const env = await getRuntimeEnv(astro);
  if (!env.DB) throw errorResponse('UNAVAILABLE', 'The database is not available.', 503);
  return { env, db: asSqlDatabase(env.DB), staff: staffActorOf(auth), auth };
}

/**
 * The staff context for an API route: the domain `staffContext` gate (staff session, Access identity
 * match, same origin for state-changing methods). Throws `AuthError` (map it with `domainErrorResponse`).
 */
export async function adminApi(context: AstroLike): Promise<AdminContext> {
  const { env, sql, auth, staff } = await staffContext(context);
  return { env, db: sql, staff, auth };
}

/** Only a same-site absolute path is a valid redirect target; anything else becomes `/`. */
function safeLocation(location: string): string {
  const ok =
    typeof location === 'string' &&
    location.startsWith('/') &&
    !location.startsWith('//') &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f\\]/.test(location);
  return ok ? location : '/';
}

/**
 * Post-redirect-get: `303` to `location`. A `notice` key (`/^[a-z0-9-]{1,40}$/`) is appended as
 * `notice=<key>` after the query and before any `#fragment`, replacing a `notice` already there.
 */
export function see(location: string, notice?: string): Response {
  const target = safeLocation(location);
  const hashAt = target.indexOf('#');
  const beforeHash = hashAt === -1 ? target : target.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : target.slice(hashAt);
  let url = beforeHash;
  if (notice !== undefined && NOTICE_KEY.test(notice)) {
    const queryAt = beforeHash.indexOf('?');
    const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
    const kept = (queryAt === -1 ? '' : beforeHash.slice(queryAt + 1))
      .split('&')
      .filter((part) => part !== '' && part !== 'notice' && !part.startsWith('notice='));
    url = `${path}?${[...kept, `notice=${notice}`].join('&')}`;
  }
  return new Response(null, {
    status: 303,
    headers: { Location: `${url}${fragment}`, 'Cache-Control': 'no-store' },
  });
}

/** True when the client is a script (`Accept` or `Content-Type` is JSON) rather than a browser form post. */
export function wantsJson(request: Request): boolean {
  const accept = request.headers.get('accept') ?? '';
  const type = request.headers.get('content-type') ?? '';
  return /\bapplication\/json\b/i.test(accept) || /^application\/json\b/i.test(type.trim());
}

/** JSON clients get `{ success: true, data }`; form posts get the redirect. */
export function jsonOrSee(
  request: Request,
  options: { data: unknown; location: string; notice?: string; status?: number },
): Response {
  if (wantsJson(request)) {
    return jsonResponse(options.data, options.status ?? 200, undefined, { 'Cache-Control': 'no-store' });
  }
  return see(options.location, options.notice);
}

// ---------------------------------------------------------------------------------------------
// readBody
// ---------------------------------------------------------------------------------------------

const tooLarge = () => errorResponse('PAYLOAD_TOO_LARGE', 'The request is too large.', 413);
const badBody = () => errorResponse('BAD_REQUEST', 'The request body could not be read.', 400);

/** Reads at most 256 KB, whatever Content-Length says. */
async function readBounded(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw tooLarge();
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

type Fields = Record<string, string | string[]>;

function addField(out: Fields, key: string, value: string): void {
  if (UNSAFE_KEYS.has(key)) return;
  const existing = Object.prototype.hasOwnProperty.call(out, key) ? out[key] : undefined;
  if (existing === undefined) out[key] = value;
  else if (Array.isArray(existing)) existing.push(value);
  else out[key] = [existing, value];
}

function fromEntries(entries: Iterable<[string, FormDataEntryValue | string]>): Fields {
  const out: Fields = {};
  for (const [key, value] of entries) {
    if (typeof value === 'string') addField(out, key, value);
  }
  return out;
}

const scalar = (value: unknown): string | null =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
      ? String(value)
      : null;

function fromJson(value: unknown): Fields {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw badBody();
  const out: Fields = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (Array.isArray(raw)) {
      out[key] = raw.map(scalar).filter((v): v is string => v !== null);
    } else if (raw === null || raw === undefined) {
      out[key] = '';
    } else if (typeof raw === 'object') {
      out[key] = JSON.stringify(raw);
    } else {
      out[key] = scalar(raw) ?? '';
    }
  }
  return out;
}

/**
 * The fields of a staff form post or JSON call, bounded to 256 KB. Strings only (JSON numbers and booleans
 * become strings, `null` becomes `''`); a key sent more than once, or a JSON array, becomes `string[]`;
 * uploaded files are ignored; `__proto__`, `constructor` and `prototype` keys are dropped. Throws a
 * `Response` (413 too large, 400 malformed) that `domainErrorResponse` passes through.
 */
export async function readBody(request: Request): Promise<Fields> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  const bytes = await readBounded(request);
  if (bytes.byteLength === 0) return {};
  try {
    if (type.startsWith('application/json')) {
      return fromJson(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    }
    if (type.startsWith('multipart/form-data')) {
      const form = await new Response(bytes, {
        headers: { 'content-type': request.headers.get('content-type') ?? '' },
      }).formData();
      return fromEntries(form.entries());
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return fromEntries(new URLSearchParams(text).entries());
  } catch (error) {
    if (error instanceof Response) throw error;
    throw badBody();
  }
}

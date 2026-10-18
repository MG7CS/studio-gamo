/**
 * Fixed-window rate limiter on `rate_limit_counters` (design T-08). One atomic upsert per check:
 *
 *   INSERT … VALUES (bucket, window_start, 1, expires_at)
 *   ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1 RETURNING count
 *
 * so N concurrent requests see N distinct counts and at most `limit` are allowed.
 * Buckets are `route:kind:hash` — never a raw IP or email (hash them with `hashIp`/`hashEmail`).
 */
import { changesOf, type SqlDatabase, type SqlStatementSpec } from './sql-database.ts';

export interface RateLimitRule {
  /** e.g. `rateLimitBucket('live.rsvp', 'ip', ipHash)`. */
  bucket: string;
  /** Requests allowed per window (≥ 1). */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests counted in this window, including this one. */
  count: number;
  remaining: number;
  /** Seconds until the window resets (0 when allowed). Use for `Retry-After`. */
  retryAfterSeconds: number;
  resetAt: number;
}

export type RateLimitKeyKind = 'ip' | 'email' | 'key' | 'session';

const ROUTE = /^[a-z0-9][a-z0-9._/-]{0,99}$/;
const HASH = /^[0-9a-f]{16,64}$/;

/** `route:kind:hash`. `route` is a short stable label (`live.rsvp`), `hash` an HMAC hex value. */
export function rateLimitBucket(route: string, kind: RateLimitKeyKind, hash: string): string {
  if (!ROUTE.test(route)) throw new RangeError('rateLimitBucket: invalid route label');
  if (!HASH.test(hash)) throw new RangeError('rateLimitBucket: expected a hex hash, never a raw value');
  return `${route}:${kind}:${hash}`;
}

function windowStart(now: number, windowSeconds: number): number {
  return Math.floor(now / windowSeconds) * windowSeconds;
}

/** The statement `checkRateLimit` runs (exported so a caller can add it to a batch). */
export function rateLimitIncrementStatement(rule: RateLimitRule, now: number): SqlStatementSpec {
  validateRule(rule);
  const start = windowStart(now, rule.windowSeconds);
  return {
    sql: 'INSERT INTO rate_limit_counters (bucket, window_start, count, expires_at) VALUES (?1, ?2, 1, ?3) ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1 RETURNING count',
    params: [rule.bucket, start, start + rule.windowSeconds],
  };
}

function validateRule(rule: RateLimitRule): void {
  if (typeof rule.bucket !== 'string' || rule.bucket.length < 1 || rule.bucket.length > 200)
    throw new RangeError('rate limit: invalid bucket');
  if (!Number.isInteger(rule.limit) || rule.limit < 1) throw new RangeError('rate limit: limit must be ≥ 1');
  if (!Number.isInteger(rule.windowSeconds) || rule.windowSeconds < 1 || rule.windowSeconds > 86400 * 31)
    throw new RangeError('rate limit: windowSeconds out of range');
}

/** Counts one request against `bucket` and says whether it is within `limit` for the current window. */
export async function checkRateLimit(
  db: SqlDatabase,
  input: RateLimitRule & { now: number },
): Promise<RateLimitResult> {
  const spec = rateLimitIncrementStatement(input, input.now);
  const row = (await db
    .prepare(spec.sql)
    .bind(...spec.params)
    .first()) as { count: number } | null;
  const count = Number(row?.count ?? Number.MAX_SAFE_INTEGER);
  const resetAt = windowStart(input.now, input.windowSeconds) + input.windowSeconds;
  const allowed = count <= input.limit;
  return {
    allowed,
    count,
    remaining: Math.max(0, input.limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, resetAt - input.now),
    resetAt,
  };
}

/**
 * Checks several rules (e.g. per-IP and per-email) and reports the first that is exceeded.
 * Every rule is counted, so a blocked caller still uses up its other buckets.
 */
export async function checkRateLimits(
  db: SqlDatabase,
  rules: RateLimitRule[],
  now: number,
): Promise<RateLimitResult & { bucket?: string }> {
  let first: (RateLimitResult & { bucket?: string }) | null = null;
  let tightest: RateLimitResult | null = null;
  for (const rule of rules) {
    const r = await checkRateLimit(db, { ...rule, now });
    if (!r.allowed && !first) first = { ...r, bucket: rule.bucket };
    if (!tightest || r.remaining < tightest.remaining) tightest = r;
  }
  return first ?? tightest ?? { allowed: true, count: 0, remaining: 0, retryAfterSeconds: 0, resetAt: now };
}

/** Deletes counters whose window has ended. Returns how many rows were removed. */
export async function purgeRateLimitCounters(db: SqlDatabase, now: number): Promise<number> {
  return changesOf(
    await db.prepare('DELETE FROM rate_limit_counters WHERE expires_at <= ?1').bind(now).run(),
  );
}

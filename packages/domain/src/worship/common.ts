/**
 * Shared helpers for the Worship / Production flow (roster, service requests, offers): typed errors, bind
 * parsing, audit and submission-event statements, outbox sending that never throws, and date formatting.
 *
 * Nothing here logs personal data or secret values: log lines name the email kind and an error name only.
 * Times are epoch seconds. A church books a local calendar date and wall-clock time, so conversion to an
 * instant uses `SERVICE_TIME_ZONE` (an IANA name, default `America/Phoenix`, Gamo's initial service area).
 */
import type { GamoEnv } from '@gamo/config/env';
import { base64UrlToBytes, bytesToBase64Url } from '../security/crypto.ts';
import { isPlausibleEmail, normalizeEmail } from '../security/pii-hash.ts';
import { newPrefixedId } from '../security/ids.ts';
import type { SqlDatabase, SqlParam, SqlStatement } from '../security/sql-database.ts';
import {
  sendOutboxEmail,
  type OutboxMessage,
  type OutboxOptions,
  type OutboxResult,
} from '../services/email-outbox.ts';

/**
 * The environment the worship services read. `packages/config` is being updated to carry these names;
 * until then they are declared here (all optional) on top of `GamoEnv`.
 */
export type WorshipEnv = GamoEnv & {
  /** Staff inbox for offer responses. When unset or invalid the staff notice is skipped. */
  INQUIRY_INBOX_EMAIL?: string;
  /** Origin of the admin app, e.g. `https://admin.gamostudio.org` (from wrangler `[vars]`). */
  PUBLIC_SITE_URL_ADMIN?: string;
  /** IANA time zone in which service dates and times are entered. Default `America/Phoenix`. */
  SERVICE_TIME_ZONE?: string;
};

export const DEFAULT_SERVICE_TIME_ZONE = 'America/Phoenix';
const DEFAULT_ADMIN_ORIGIN = 'https://admin.gamostudio.org';

export type WorshipErrorCode =
  'NOT_FOUND' | 'INVALID_INPUT' | 'INVALID_STATE' | 'NOT_AN_APPLICATION' | 'NOT_A_REQUEST';

/** A refused operation. `code` is stable for callers; `message` never contains personal data. */
export class WorshipError extends Error {
  constructor(
    readonly code: WorshipErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorshipError';
  }
}

export type Db = SqlDatabase;

export const SECONDS_PER_DAY = 86_400;

/** The roster / request programs the tables accept. */
export type WorshipProgram = 'web' | 'worship' | 'academy' | 'production';

// ---- bind parsing ----------------------------------------------------------------------------------

export type Binds = Record<string, unknown>;

export function parseBinds(json: string | null | undefined): Binds {
  try {
    const value: unknown = JSON.parse(json ?? '{}');
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Binds) : {};
  } catch {
    return {};
  }
}

export function bindString(binds: Binds, key: string, max: number): string | null {
  const v = binds[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

/** A list bind: an array of strings, or one string split on commas and newlines. Trimmed, de-duplicated. */
export function bindList(binds: Binds, key: string, maxItems = 20, maxLength = 60): string[] {
  const v = binds[key];
  const raw: unknown[] = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim().slice(0, maxLength);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

export function bindBool(binds: Binds, key: string): boolean {
  const v = binds[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') return ['yes', 'true', '1', 'y'].includes(v.trim().toLowerCase());
  return false;
}

export function bindEmail(binds: Binds, key: string): string | null {
  const v = bindString(binds, key, 254);
  if (!v) return null;
  const email = normalizeEmail(v);
  return isPlausibleEmail(email) ? email : null;
}

export function parseStringList(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function sameRole(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

// ---- SQL helpers -----------------------------------------------------------------------------------

export const changesOfRun = (result: { meta?: { changes?: number | bigint } }): number =>
  Number(result.meta?.changes ?? 0);

export async function firstRow<T>(db: Db, sql: string, ...params: SqlParam[]): Promise<T | null> {
  return ((await db
    .prepare(sql)
    .bind(...params)
    .first()) ?? null) as T | null;
}

export async function allRows<T>(db: Db, sql: string, ...params: SqlParam[]): Promise<T[]> {
  const r = await db
    .prepare(sql)
    .bind(...params)
    .all();
  return (r.results ?? []) as T[];
}

/**
 * An `audit_logs` row. Payload values are ids, roles and amounts only (never names, emails or phone
 * numbers). `actor_user_id` is stored only when that user exists, so attribution never blocks a write.
 */
export function auditStatement(
  db: Db,
  a: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, string | number | null>;
    now: number;
  },
): SqlStatement {
  return db
    .prepare(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, payload_json, created_at)
       VALUES (?1, (SELECT id FROM users WHERE id = ?2), ?3, ?4, ?5, ?6, ?7)`,
    )
    .bind(
      newPrefixedId('aud'),
      a.actorId ?? null,
      a.action,
      a.entityType,
      a.entityId,
      a.payload ? JSON.stringify(a.payload) : null,
      a.now,
    );
}

/** An append-only `form_submission_events` row (kind `status` or `note`). */
export function submissionEventStatement(
  db: Db,
  e: { submissionId: string; kind: 'status' | 'note'; actorId?: string | null; body: string; now: number },
): SqlStatement {
  return db
    .prepare(
      `INSERT INTO form_submission_events (id, submission_id, kind, actor_user_id, body, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(newPrefixedId('fse'), e.submissionId, e.kind, e.actorId ?? null, e.body.slice(0, 1000), e.now);
}

// ---- emails ----------------------------------------------------------------------------------------

/** Sends through the outbox; a delivery problem is logged by name and returned as null, never thrown. */
export async function sendEmailSafely(
  db: Db,
  env: WorshipEnv,
  message: OutboxMessage,
  options: OutboxOptions,
): Promise<OutboxResult | null> {
  try {
    return await sendOutboxEmail(db, env, message, options);
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    console.error(`[worship] email ${message.kind} not sent (${name})`);
    return null;
  }
}

export function staffInbox(env: WorshipEnv): string | null {
  const raw = env.INQUIRY_INBOX_EMAIL?.trim();
  if (!raw) return null;
  const email = normalizeEmail(raw);
  return isPlausibleEmail(email) ? email : null;
}

export function adminUrl(env: WorshipEnv, path: string): string {
  const origin = (env.PUBLIC_SITE_URL_ADMIN?.trim() || DEFAULT_ADMIN_ORIGIN).replace(/\/+$/, '');
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

// ---- dates -----------------------------------------------------------------------------------------

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** `2026-03-08` becomes `Sunday, March 8, 2026`. */
export function formatServiceDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** `14:30` becomes `2:30 PM`. */
export function formatClockTime(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function zoneOffsetSeconds(epochSeconds: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epochSeconds * 1000));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) / 1000;
  return asUtc - epochSeconds;
}

/** The instant a local wall-clock date and time (default midnight) happen in `timeZone`. */
export function wallTimeToEpoch(isoDate: string, time: string | null, timeZone: string): number {
  const [y, mo, d] = isoDate.split('-').map(Number) as [number, number, number];
  const [h, mi] = (time ?? '00:00').split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi) / 1000;
  let zone = timeZone;
  try {
    zoneOffsetSeconds(wall, zone);
  } catch {
    zone = DEFAULT_SERVICE_TIME_ZONE;
  }
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - zoneOffsetSeconds(guess, zone);
  return guess;
}

export function serviceTimeZone(env: WorshipEnv): string {
  return env.SERVICE_TIME_ZONE?.trim() || DEFAULT_SERVICE_TIME_ZONE;
}

/** Opaque keyset cursor: base64url JSON of two string parts. */
export function encodeCursor(a: string, b: string): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify([a, b])));
}

export function decodeCursor(cursor: string): [string, string] {
  try {
    const bytes = base64UrlToBytes(cursor);
    const v: unknown = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string')
      return [v[0], v[1]];
  } catch {
    // fall through
  }
  throw new WorshipError('INVALID_INPUT', 'invalid cursor');
}

export function clampLimit(limit: number | undefined, fallback = 25, max = 100): number {
  if (limit === undefined || !Number.isFinite(limit)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(limit)));
}

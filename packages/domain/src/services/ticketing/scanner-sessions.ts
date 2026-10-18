/**
 * Door-staff scanner sessions (design T-09). An organizer creates a gate session for one event;
 * door staff open its link and type its 6-digit PIN; the correct PIN registers a device and sets a
 * short HttpOnly cookie. No account is created for door staff.
 *
 * Secrets: everything here is keyed by SCANNER_SESSION_SECRET (≥ 32 chars; a fixed development key
 * when ENVIRONMENT=local, 503 elsewhere when missing), with a distinct purpose per use:
 *   link token hash   HMAC-SHA256(secret, "scanner-link|" + token)            (never stored in clear)
 *   PIN               PBKDF2(HMAC(secret, "scanner-pin|" + pin), salt, 100k)  (`hashScannerPin` pepper)
 *   device cookie     signValue(deviceId, purpose "scanner_device")           (≤ 12 h, ≤ session expiry)
 */
import { hmacSha256Hex, sha256Hex } from '../../security/crypto.ts';
import { resolveEnvSecret } from '../../security/env-secret.ts';
import { newPrefixedId } from '../../security/ids.ts';
import { generateLinkToken, isWellFormedLinkToken } from '../../security/link-tokens.ts';
import {
  PIN_LOCK_SECONDS,
  PIN_MAX_FAILED_ATTEMPTS,
  generateScannerPin,
  hashScannerPin,
  isWellFormedPin,
  verifyScannerPin,
} from '../../security/pin.ts';
import { checkRateLimit, rateLimitBucket } from '../../security/rate-limit.ts';
import { signValue, verifySignedValue } from '../../security/signed-value.ts';
import { allRows, runBatch, type SqlDatabase } from '../../security/sql-database.ts';
import type { AllowedDirections } from '../../types/enums.ts';
import { firstRow, loadScanEvent, parseStringArray } from './scanning-context.ts';

export const SCANNER_SECRET_NAME = 'SCANNER_SESSION_SECRET';
/** Cookie set after a correct PIN. Two copies, one per path, so it never reaches other pages. */
export const SCANNER_COOKIE_NAME = 'gamo_scanner';
export const SCANNER_COOKIE_PATHS = ['/scan', '/api/scanner'] as const;
export const SCANNER_COOKIE_PURPOSE = 'scanner_device';
export const SCANNER_DEVICE_TTL_SECONDS = 12 * 60 * 60;
/** A gate session lasts until the event ends + 6 h … */
export const SCANNER_SESSION_GRACE_SECONDS = 6 * 60 * 60;
/** … and never more than 7 days from creation. */
export const SCANNER_SESSION_MAX_SECONDS = 7 * 24 * 60 * 60;
/** Per-IP PIN attempts across all sessions (on top of the 5-attempt lock per session). */
export const SCANNER_PIN_IP_LIMIT = { limit: 20, windowSeconds: 15 * 60 } as const;

export const SCANNER_LINK_ENDED_MESSAGE = 'This scanner link has ended — ask the organizer for a new one.';
export const SCANNER_LOCKED_MESSAGE =
  'Too many wrong PINs. This scanner link is locked for 15 minutes. Ask the organizer for a new link if you cannot wait.';

export function scannerSecret(env: Record<string, unknown> | null | undefined): string {
  return resolveEnvSecret(env as never, SCANNER_SECRET_NAME);
}

export async function hashScannerLinkToken(token: string, secret: string): Promise<string> {
  return hmacSha256Hex(secret, `scanner-link|${token}`);
}

/** Expiry of a new gate session: event end + 6 h, capped at 7 days from now. */
export function scannerSessionExpiresAt(eventEndsAt: number, now: number): number {
  return Math.min(eventEndsAt + SCANNER_SESSION_GRACE_SECONDS, now + SCANNER_SESSION_MAX_SECONDS);
}

export class ScannerSessionError extends Error {
  constructor(
    readonly code: 'EVENT_NOT_FOUND' | 'EVENT_ENDED' | 'EVENT_CANCELLED' | 'INVALID_INPUT',
    message: string,
  ) {
    super(message);
    this.name = 'ScannerSessionError';
  }
}

export interface NewScannerSessionInput {
  eventId: string;
  label: string;
  allowedDirections: AllowedDirections;
  /** Zone codes this gate admits; null/empty = every zone. */
  allowedZones?: string[] | null;
  /** Supervisors may override (manual admit with a reason) and sell at the door. */
  canOverride?: boolean;
  createdByUserId: string | null;
  now: number;
}

export interface CreatedScannerSession {
  id: string;
  label: string;
  /** Shown ONCE to the organizer, never stored. */
  token: string;
  /** Shown ONCE to the organizer, never stored. */
  pin: string;
  /** Path of the unlock page (append to the Live origin). */
  path: string;
  expiresAt: number;
}

const ZONE_CODE = /^[A-Za-z0-9_-]{1,32}$/;

export function normalizeZoneList(zones: readonly string[] | null | undefined): string[] | null {
  if (!zones) return null;
  const out = [...new Set(zones.map((z) => z.trim()).filter(Boolean))];
  if (out.some((z) => !ZONE_CODE.test(z)) || out.length > 20)
    throw new ScannerSessionError('INVALID_INPUT', 'Zone codes use letters, numbers, - and _ (up to 20).');
  return out.length ? out : null;
}

export function unlockPath(eventId: string, token: string): string {
  return `/scan/${encodeURIComponent(eventId)}/unlock?k=${encodeURIComponent(token)}`;
}

export async function createScannerSession(
  db: SqlDatabase,
  env: Record<string, unknown>,
  input: NewScannerSessionInput,
): Promise<CreatedScannerSession> {
  const secret = scannerSecret(env);
  const label = input.label.trim();
  if (label.length < 1 || label.length > 80)
    throw new ScannerSessionError('INVALID_INPUT', 'Give the gate a name of up to 80 characters.');
  if (!['in', 'out', 'both'].includes(input.allowedDirections))
    throw new ScannerSessionError('INVALID_INPUT', 'Choose entry, exit or both.');
  const zones = normalizeZoneList(input.allowedZones);
  const event = await loadScanEvent(db, input.eventId);
  if (!event) throw new ScannerSessionError('EVENT_NOT_FOUND', 'That event was not found.');
  if (event.cancelledAt !== null)
    throw new ScannerSessionError(
      'EVENT_CANCELLED',
      'This event is cancelled; scanner links are not needed.',
    );
  const expiresAt = scannerSessionExpiresAt(event.endsAt, input.now);
  if (expiresAt <= input.now)
    throw new ScannerSessionError(
      'EVENT_ENDED',
      'This event has ended, so new scanner links cannot be created.',
    );

  const token = generateLinkToken();
  const pin = generateScannerPin();
  const pinHash = await hashScannerPin(pin, { pepper: secret });
  const id = newPrefixedId('scs');
  await runBatch(db, [
    {
      sql: 'INSERT INTO scanner_sessions (id, event_id, label, link_token_hash, pin_hash, pin_salt, allowed_directions, allowed_zones_json, can_override, created_by_user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)',
      params: [
        id,
        input.eventId,
        label,
        await hashScannerLinkToken(token, secret),
        pinHash.hash,
        pinHash.salt,
        input.allowedDirections,
        zones ? JSON.stringify(zones) : null,
        input.canOverride ? 1 : 0,
        input.createdByUserId,
        expiresAt,
        input.now,
      ],
    },
  ]);
  return { id, label, token, pin, path: unlockPath(input.eventId, token), expiresAt };
}

export type ScannerSessionState = 'active' | 'locked' | 'expired' | 'revoked';

export interface ScannerSessionSummary {
  id: string;
  label: string;
  allowedDirections: AllowedDirections;
  allowedZones: string[] | null;
  canOverride: boolean;
  state: ScannerSessionState;
  expiresAt: number;
  revokedAt: number | null;
  lockedUntil: number | null;
  lastSeenAt: number | null;
  activeDevices: number;
  createdAt: number;
}

interface SessionRow {
  id: string;
  event_id: string;
  label: string;
  allowed_directions: AllowedDirections;
  allowed_zones_json: string | null;
  can_override: number;
  expires_at: number;
  revoked_at: number | null;
  locked_until: number | null;
  last_seen_at: number | null;
  failed_pin_attempts: number;
  created_at: number;
  pin_hash: string;
  pin_salt: string;
}

function stateOf(row: Pick<SessionRow, 'revoked_at' | 'expires_at' | 'locked_until'>, now: number) {
  if (row.revoked_at !== null) return 'revoked' as const;
  if (Number(row.expires_at) <= now) return 'expired' as const;
  if (row.locked_until !== null && Number(row.locked_until) > now) return 'locked' as const;
  return 'active' as const;
}

export async function listScannerSessions(
  db: SqlDatabase,
  eventId: string,
  now: number,
): Promise<ScannerSessionSummary[]> {
  const rows = await allRows<SessionRow & { active_devices: number }>(db, {
    sql: 'SELECT s.*, (SELECT count(*) FROM scanner_devices d WHERE d.scanner_session_id = s.id AND d.revoked_at IS NULL AND d.expires_at > ?2) AS active_devices FROM scanner_sessions s WHERE s.event_id = ?1 ORDER BY s.created_at DESC LIMIT 200',
    params: [eventId, now],
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    allowedDirections: r.allowed_directions,
    allowedZones: parseStringArray(r.allowed_zones_json),
    canOverride: Number(r.can_override) === 1,
    state: stateOf(r, now),
    expiresAt: Number(r.expires_at),
    revokedAt: r.revoked_at === null ? null : Number(r.revoked_at),
    lockedUntil: r.locked_until === null ? null : Number(r.locked_until),
    lastSeenAt: r.last_seen_at === null ? null : Number(r.last_seen_at),
    activeDevices: Number(r.active_devices),
    createdAt: Number(r.created_at),
  }));
}

/** Revokes a gate session and every device it unlocked. Returns false when it was not found/already revoked. */
export async function revokeScannerSession(
  db: SqlDatabase,
  input: { eventId: string; sessionId: string; now: number },
): Promise<boolean> {
  const [revoked] = await runBatch(db, [
    {
      sql: 'UPDATE scanner_sessions SET revoked_at = ?3 WHERE id = ?1 AND event_id = ?2 AND revoked_at IS NULL RETURNING id',
      params: [input.sessionId, input.eventId, input.now],
    },
    {
      sql: 'UPDATE scanner_devices SET revoked_at = ?2 WHERE scanner_session_id = ?1 AND revoked_at IS NULL',
      params: [input.sessionId, input.now],
    },
  ]);
  return revoked.length > 0;
}

export type ScannerLinkLookup =
  | {
      ok: true;
      session: { id: string; eventId: string; label: string; expiresAt: number; locked: boolean };
      event: { id: string; title: string };
    }
  | { ok: false; reason: 'ended' };

async function sessionByToken(db: SqlDatabase, secret: string, token: string) {
  if (!isWellFormedLinkToken(token)) return null;
  return firstRow<SessionRow>(db, 'SELECT * FROM scanner_sessions WHERE link_token_hash = ?1', [
    await hashScannerLinkToken(token, secret),
  ]);
}

/** For the unlock page: is this link usable, and for which event? Unknown, expired and revoked all read "ended". */
export async function findScannerLink(
  db: SqlDatabase,
  env: Record<string, unknown>,
  input: { token: string; eventId?: string; now: number },
): Promise<ScannerLinkLookup> {
  const row = await sessionByToken(db, scannerSecret(env), input.token);
  if (!row || (input.eventId && row.event_id !== input.eventId)) return { ok: false, reason: 'ended' };
  const state = stateOf(row, input.now);
  if (state === 'expired' || state === 'revoked') return { ok: false, reason: 'ended' };
  const event = await loadScanEvent(db, row.event_id);
  if (!event || event.cancelledAt !== null) return { ok: false, reason: 'ended' };
  return {
    ok: true,
    session: {
      id: row.id,
      eventId: row.event_id,
      label: row.label,
      expiresAt: Number(row.expires_at),
      locked: state === 'locked',
    },
    event: { id: event.id, title: event.title },
  };
}

export type UnlockResult =
  | { ok: true; deviceId: string; eventId: string; cookieValue: string; cookieExpiresAt: number }
  | {
      ok: false;
      reason: 'ended' | 'locked' | 'wrong_pin' | 'rate_limited' | 'malformed';
      message: string;
      attemptsLeft?: number;
      retryAfterSeconds?: number;
    };

/**
 * Checks a PIN. Every attempt is counted *before* the PIN is compared (one conditional UPDATE), so
 * concurrent guesses cannot exceed 5 per lock window; the 5th wrong PIN locks the session for 15 min.
 * A correct PIN clears the counter, registers a device and returns the signed cookie value.
 */
export async function unlockScannerSession(
  db: SqlDatabase,
  env: Record<string, unknown>,
  input: {
    token: string;
    pin: string;
    eventId?: string;
    /** HMAC of the client IP (`hashIp`); null when unknown (local, tests). */
    ipHash: string | null;
    deviceLabel?: string | null;
    now: number;
  },
): Promise<UnlockResult> {
  const secret = scannerSecret(env);
  const { now } = input;
  if (input.ipHash) {
    const limited = await checkRateLimit(db, {
      bucket: rateLimitBucket('live.scanner.pin', 'ip', input.ipHash),
      ...SCANNER_PIN_IP_LIMIT,
      now,
    });
    if (!limited.allowed)
      return {
        ok: false,
        reason: 'rate_limited',
        message: `Too many PIN attempts from this network. Wait ${Math.ceil(limited.retryAfterSeconds / 60)} minutes and try again.`,
        retryAfterSeconds: limited.retryAfterSeconds,
      };
  }
  const row = await sessionByToken(db, secret, input.token);
  if (!row || (input.eventId && row.event_id !== input.eventId))
    return { ok: false, reason: 'ended', message: SCANNER_LINK_ENDED_MESSAGE };
  const state = stateOf(row, now);
  if (state === 'expired' || state === 'revoked')
    return { ok: false, reason: 'ended', message: SCANNER_LINK_ENDED_MESSAGE };
  if (!isWellFormedPin(input.pin))
    return { ok: false, reason: 'malformed', message: 'Enter the 6-digit PIN the organizer gave you.' };

  // Claim one attempt (pessimistically counted as wrong); refuses while locked or at the limit.
  const [claimed] = await runBatch(db, [
    {
      sql: `UPDATE scanner_sessions SET
              failed_pin_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= ?2 THEN 1 ELSE failed_pin_attempts + 1 END,
              locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= ?2 THEN 1 ELSE failed_pin_attempts + 1 END) >= ?3 THEN ?2 + ?4 ELSE NULL END
            WHERE id = ?1 AND revoked_at IS NULL AND expires_at > ?2
              AND ((locked_until IS NOT NULL AND locked_until <= ?2) OR (locked_until IS NULL AND failed_pin_attempts < ?3))
            RETURNING failed_pin_attempts`,
      params: [row.id, now, PIN_MAX_FAILED_ATTEMPTS, PIN_LOCK_SECONDS],
    },
  ]);
  if (claimed.length === 0) {
    const latest = await firstRow<{ locked_until: number | null }>(
      db,
      'SELECT locked_until FROM scanner_sessions WHERE id = ?1',
      [row.id],
    );
    const retry = Math.max(0, Number(latest?.locked_until ?? now + PIN_LOCK_SECONDS) - now);
    return { ok: false, reason: 'locked', message: SCANNER_LOCKED_MESSAGE, retryAfterSeconds: retry };
  }
  const attempts = Number((claimed[0] as { failed_pin_attempts: number }).failed_pin_attempts);
  const correct = await verifyScannerPin(
    input.pin,
    { hash: row.pin_hash, salt: row.pin_salt },
    { pepper: secret },
  );
  if (!correct) {
    const attemptsLeft = Math.max(0, PIN_MAX_FAILED_ATTEMPTS - attempts);
    return attemptsLeft === 0
      ? {
          ok: false,
          reason: 'locked',
          message: SCANNER_LOCKED_MESSAGE,
          attemptsLeft: 0,
          retryAfterSeconds: PIN_LOCK_SECONDS,
        }
      : {
          ok: false,
          reason: 'wrong_pin',
          message: `That PIN is not right. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left before the link locks for 15 minutes.`,
          attemptsLeft,
        };
  }

  const deviceId = newPrefixedId('sdev');
  const cookieExpiresAt = Math.min(now + SCANNER_DEVICE_TTL_SECONDS, Number(row.expires_at));
  const label = input.deviceLabel?.trim().slice(0, 80) || null;
  await runBatch(db, [
    {
      sql: 'UPDATE scanner_sessions SET failed_pin_attempts = 0, locked_until = NULL, last_seen_at = ?2 WHERE id = ?1',
      params: [row.id, now],
    },
    {
      sql: 'INSERT INTO scanner_devices (id, scanner_session_id, device_label, expires_at, last_seen_at, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)',
      params: [deviceId, row.id, label, cookieExpiresAt, now],
    },
  ]);
  const cookieValue = await signValue({
    value: deviceId,
    expiresAt: cookieExpiresAt,
    secret,
    purpose: SCANNER_COOKIE_PURPOSE,
    secretName: SCANNER_SECRET_NAME,
  });
  return { ok: true, deviceId, eventId: row.event_id, cookieValue, cookieExpiresAt };
}

/** What a scanner device may do, resolved from its cookie on every request. */
export interface ScannerDeviceContext {
  deviceId: string;
  sessionId: string;
  eventId: string;
  label: string;
  allowedDirections: AllowedDirections;
  allowedZones: string[] | null;
  canOverride: boolean;
  expiresAt: number;
  /** Rate-limit key (hex) for this device. */
  rateKey: string;
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Resolves the scanner cookie to a live device + session, or null (missing, forged, expired, revoked). */
export async function readScannerDevice(
  db: SqlDatabase,
  env: Record<string, unknown>,
  request: Request,
  now: number,
): Promise<ScannerDeviceContext | null> {
  const raw = readCookie(request, SCANNER_COOKIE_NAME);
  if (!raw) return null;
  const verified = await verifySignedValue({
    signed: raw,
    now,
    secret: scannerSecret(env),
    purpose: SCANNER_COOKIE_PURPOSE,
  });
  if (!verified) return null;
  const row = await firstRow<{
    device_id: string;
    device_last_seen: number | null;
    session_id: string;
    event_id: string;
    label: string;
    allowed_directions: AllowedDirections;
    allowed_zones_json: string | null;
    can_override: number;
    expires_at: number;
    session_last_seen: number | null;
  }>(
    db,
    'SELECT d.id AS device_id, d.last_seen_at AS device_last_seen, s.id AS session_id, s.event_id, s.label, s.allowed_directions, s.allowed_zones_json, s.can_override, min(s.expires_at, d.expires_at) AS expires_at, s.last_seen_at AS session_last_seen FROM scanner_devices d JOIN scanner_sessions s ON s.id = d.scanner_session_id WHERE d.id = ?1 AND d.revoked_at IS NULL AND s.revoked_at IS NULL AND d.expires_at > ?2 AND s.expires_at > ?2',
    [verified.value, now],
  );
  if (!row) return null;
  // "Last seen" for the organizer's list, written at most once a minute.
  if (row.device_last_seen === null || Number(row.device_last_seen) < now - 60) {
    await runBatch(db, [
      { sql: 'UPDATE scanner_devices SET last_seen_at = ?2 WHERE id = ?1', params: [row.device_id, now] },
      { sql: 'UPDATE scanner_sessions SET last_seen_at = ?2 WHERE id = ?1', params: [row.session_id, now] },
    ]);
  }
  return {
    deviceId: row.device_id,
    sessionId: row.session_id,
    eventId: row.event_id,
    label: row.label,
    allowedDirections: row.allowed_directions,
    allowedZones: parseStringArray(row.allowed_zones_json),
    canOverride: Number(row.can_override) === 1,
    expiresAt: Number(row.expires_at),
    rateKey: (await sha256Hex(`scanner-device|${row.device_id}`)).slice(0, 32),
  };
}

/** Set-Cookie values for the device cookie (HttpOnly, SameSite=Strict, one per scanner path). */
export function buildScannerCookies(value: string, expiresAt: number, now: number, https: boolean): string[] {
  const maxAge = Math.max(0, expiresAt - now);
  return SCANNER_COOKIE_PATHS.map(
    (path) =>
      `${SCANNER_COOKIE_NAME}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${https ? '; Secure' : ''}`,
  );
}

export function buildClearScannerCookies(https: boolean): string[] {
  return SCANNER_COOKIE_PATHS.map(
    (path) =>
      `${SCANNER_COOKIE_NAME}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Strict${https ? '; Secure' : ''}`,
  );
}

/**
 * Door staff links (docs/LIVE_REQUIREMENTS.md §8.3 item 20, docs/LIVE_DATA_MODEL.md §8 "Door").
 *
 * A staff link is a scoped access link with a 6-digit PIN and a set of permissions (check in, sell, comp). A person
 * opens the link, enters the PIN once, and their device gets a cookie that works until the link expires (at most 12
 * hours at a time). Revoking the link ends every device. Five wrong PINs lock the link for 15 minutes; each IP may try
 * 20 PINs per 15 minutes.
 *
 * Kept generic so other programs can reuse it (Academy check-in, Worship call times): the scope is an id (a Live event
 * today, `staff_links.event_id`), the scope's end time is passed in by the caller, and the only SQL here is on
 * `staff_links` and `staff_devices`. Live-specific wiring (the event's last date, membership checks) lives in the
 * callers (`door-sales.ts`, the app).
 *
 * Secrets: the link token is 32 random bytes, kept only as an HMAC with LIVE_TICKET_SECRET (label `staff-link:`); the
 * PIN with PBKDF2 and a pepper derived from the same secret; the device cookie only as its SHA-256. None of them is
 * stored or logged in plain text; the token and PIN are returned once, at creation.
 */
import {
  base64UrlToBytes,
  bytesToBase64Url,
  hmacSha256Hex,
  randomBytes,
  sha256Hex,
} from '../security/crypto.ts';
import { resolveEnvSecret } from '../security/env-secret.ts';
import { newPrefixedId } from '../security/ids.ts';
import {
  generateScannerPin,
  hashScannerPin,
  PIN_LOCK_SECONDS,
  PIN_MAX_FAILED_ATTEMPTS,
  verifyScannerPin,
} from '../security/pin.ts';
import { checkRateLimits, rateLimitBucket } from '../security/rate-limit.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { PAID_ID_PREFIX, PaidError, type PaidEnv, type StaffPermission } from './paid-types.ts';

/** A link stops working this long after its scope's last date (the event's last date ends). */
export const STAFF_LINK_GRACE_SECONDS = 12 * 3600;
/** A device stays signed in at most this long (and never past the link's expiry). */
export const STAFF_DEVICE_MAX_SECONDS = 12 * 3600;
/** PIN tries per IP per window. */
export const PIN_IP_LIMIT = 20;
export const PIN_IP_WINDOW_SECONDS = 15 * 60;
export const STAFF_LINK_LABEL_MAX = 60;

const TOKEN_BYTES = 32;
const DEVICE_BYTES = 32;

export interface StaffPermissions {
  checkIn: boolean;
  sell: boolean;
  comp: boolean;
}

/**
 * Who is acting at the door. A staff device carries its link's permissions and scope; a signed-in organizer member has
 * every permission within their organization (the caller has checked the membership).
 */
export type StaffActor =
  | {
      kind: 'staff';
      staffLinkId: string;
      organizationId: string;
      /** The scope id (the Live event). */
      scopeId: string;
      label: string;
      permissions: StaffPermissions;
    }
  | { kind: 'organizer'; organizerId: string; organizationId: string };

// ── Permissions ────────────────────────────────────────────────────────────────────────────────────────────────

/** Turns a list of permission names into flags. Comp requires sell; at least check in or sell. Throws `invalid`. */
export function staffPermissionsOf(list: readonly string[]): StaffPermissions {
  const known: readonly string[] = ['check_in', 'sell', 'comp'] satisfies readonly StaffPermission[];
  if (list.some((p) => !known.includes(p))) throw new PaidError('invalid', { detail: 'permissions' });
  const permissions = {
    checkIn: list.includes('check_in'),
    sell: list.includes('sell'),
    comp: list.includes('comp'),
  };
  if (!permissions.checkIn && !permissions.sell) throw new PaidError('invalid', { detail: 'permissions' });
  if (permissions.comp && !permissions.sell) throw new PaidError('invalid', { detail: 'permissions' });
  return permissions;
}

export function hasPermission(actor: StaffActor, permission: StaffPermission): boolean {
  if (actor.kind === 'organizer') return true;
  if (permission === 'check_in') return actor.permissions.checkIn;
  if (permission === 'sell') return actor.permissions.sell;
  return actor.permissions.comp;
}

/** Throws `forbidden` (detail = the permission) when the actor may not do this. */
export function requirePermission(actor: StaffActor, permission: StaffPermission): void {
  if (!hasPermission(actor, permission)) throw new PaidError('forbidden', { detail: permission });
}

/**
 * Throws `forbidden` unless the actor may act on this scope: a staff link only on its own scope, an organizer only on
 * its own organization's scopes.
 */
export function requireScope(actor: StaffActor, scope: { organizationId: string; scopeId: string }): void {
  if (actor.organizationId !== scope.organizationId) throw new PaidError('forbidden', { detail: 'scope' });
  if (actor.kind === 'staff' && actor.scopeId !== scope.scopeId)
    throw new PaidError('forbidden', { detail: 'scope' });
}

/** A short stable reference for audit columns (`tickets.checked_in_by`): `staff:<link id>` or `organizer:<id>`. */
export function actorRef(actor: StaffActor): string {
  return actor.kind === 'staff' ? `staff:${actor.staffLinkId}` : `organizer:${actor.organizerId}`;
}

// ── Secrets ────────────────────────────────────────────────────────────────────────────────────────────────────

const secretOf = (env: PaidEnv) => resolveEnvSecret(env as Record<string, unknown>, 'LIVE_TICKET_SECRET');

async function tokenHashOf(env: PaidEnv, token: string): Promise<string> {
  return hmacSha256Hex(secretOf(env), `staff-link:${token}`);
}

async function pinPepperOf(env: PaidEnv): Promise<string> {
  return hmacSha256Hex(secretOf(env), 'staff-link-pin-pepper:v1');
}

function isWellFormedSecret(value: unknown, bytes: number): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  return base64UrlToBytes(value)?.length === bytes;
}

// ── Create, list, revoke ───────────────────────────────────────────────────────────────────────────────────────

export interface CreateStaffLinkInput {
  organizationId: string;
  /** The scope id (a Live event id). The caller has checked it belongs to the organization. */
  scopeId: string;
  /** When the scope's last date ends; the link expires `STAFF_LINK_GRACE_SECONDS` later. */
  scopeEndsAt: number;
  label: string;
  permissions: readonly string[];
  /** The organizer who created it (audit). */
  createdBy: string | null;
  now: number;
}

export interface CreatedStaffLink {
  linkId: string;
  /** Shown once (in the link URL); only its keyed hash is stored. */
  token: string;
  /** Shown once; only its PBKDF2 hash is stored. */
  pin: string;
  expiresAt: number;
  permissions: StaffPermissions;
}

export function cleanStaffLabel(label: unknown): string {
  const text = typeof label === 'string' ? label.trim().replace(/\s+/g, ' ') : '';
  if (text.length < 1 || text.length > STAFF_LINK_LABEL_MAX)
    throw new PaidError('invalid', { detail: 'label' });
  return text;
}

export async function createStaffLink(
  db: SqlDatabase,
  env: PaidEnv,
  input: CreateStaffLinkInput,
): Promise<CreatedStaffLink> {
  const label = cleanStaffLabel(input.label);
  const permissions = staffPermissionsOf(input.permissions);
  const expiresAt = input.scopeEndsAt + STAFF_LINK_GRACE_SECONDS;
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now) throw new PaidError('expired');
  const token = bytesToBase64Url(randomBytes(TOKEN_BYTES));
  const pin = generateScannerPin();
  const stored = await hashScannerPin(pin, { pepper: await pinPepperOf(env) });
  const linkId = newPrefixedId(PAID_ID_PREFIX.staffLink);
  await runBatch(db, [
    {
      sql: `INSERT INTO staff_links (id, organization_id, event_id, label, token_hash, pin_hash, pin_salt,
                                     can_check_in, can_sell, can_comp, expires_at, created_by, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      params: [
        linkId,
        input.organizationId,
        input.scopeId,
        label,
        await tokenHashOf(env, token),
        stored.hash,
        stored.salt,
        permissions.checkIn ? 1 : 0,
        permissions.sell ? 1 : 0,
        permissions.comp ? 1 : 0,
        expiresAt,
        input.createdBy,
        input.now,
      ],
    },
  ]);
  return { linkId, token, pin, expiresAt, permissions };
}

export type StaffLinkState = 'active' | 'locked' | 'revoked' | 'expired';

export interface StaffLinkRow {
  id: string;
  organizationId: string;
  scopeId: string;
  label: string;
  permissions: StaffPermissions;
  state: StaffLinkState;
  expiresAt: number;
  revokedAt: number | null;
  lockedUntil: number | null;
  lastUsedAt: number | null;
  /** Devices signed in right now. */
  activeDevices: number;
  createdAt: number;
}

interface LinkRecord {
  id: string;
  organization_id: string;
  event_id: string;
  label: string;
  can_check_in: number;
  can_sell: number;
  can_comp: number;
  expires_at: number;
  revoked_at: number | null;
  locked_until: number | null;
  last_used_at: number | null;
  created_at: number;
}

const permissionsOf = (r: Pick<LinkRecord, 'can_check_in' | 'can_sell' | 'can_comp'>): StaffPermissions => ({
  checkIn: r.can_check_in === 1,
  sell: r.can_sell === 1,
  comp: r.can_comp === 1,
});

function stateOf(r: LinkRecord, now: number): StaffLinkState {
  if (r.revoked_at != null) return 'revoked';
  if (r.expires_at <= now) return 'expired';
  if (r.locked_until != null && r.locked_until > now) return 'locked';
  return 'active';
}

/** Every link of one scope, newest first (no secrets). */
export async function listStaffLinks(
  db: SqlDatabase,
  input: { organizationId: string; scopeId: string; now: number },
): Promise<StaffLinkRow[]> {
  const rows = await allRows<LinkRecord & { active_devices: number }>(db, {
    sql: `SELECT l.id, l.organization_id, l.event_id, l.label, l.can_check_in, l.can_sell, l.can_comp, l.expires_at,
                 l.revoked_at, l.locked_until, l.last_used_at, l.created_at,
                 (SELECT COUNT(*) FROM staff_devices d WHERE d.staff_link_id = l.id AND d.expires_at > ?3) AS active_devices
            FROM staff_links l
           WHERE l.organization_id = ?1 AND l.event_id = ?2
           ORDER BY l.created_at DESC, l.id`,
    params: [input.organizationId, input.scopeId, input.now],
  });
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    scopeId: r.event_id,
    label: r.label,
    permissions: permissionsOf(r),
    state: stateOf(r, input.now),
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    lockedUntil: r.locked_until != null && r.locked_until > input.now ? r.locked_until : null,
    lastUsedAt: r.last_used_at,
    activeDevices: Number(r.active_devices),
    createdAt: r.created_at,
  }));
}

/** Revokes a link and signs out every device that used it. `revoked` is false when it was already revoked. */
export async function revokeStaffLink(
  db: SqlDatabase,
  input: { organizationId: string; linkId: string; now: number },
): Promise<{ revoked: boolean }> {
  const [rows] = await runBatch(db, [
    {
      sql: `UPDATE staff_links SET revoked_at = ?3
             WHERE id = ?1 AND organization_id = ?2 AND revoked_at IS NULL RETURNING id`,
      params: [input.linkId, input.organizationId, input.now],
    },
    {
      sql: `DELETE FROM staff_devices
             WHERE staff_link_id = (SELECT id FROM staff_links WHERE id = ?1 AND organization_id = ?2)`,
      params: [input.linkId, input.organizationId],
    },
  ]);
  if (rows.length === 0) {
    const exists = await allRows(db, {
      sql: 'SELECT 1 AS ok FROM staff_links WHERE id = ?1 AND organization_id = ?2',
      params: [input.linkId, input.organizationId],
    });
    if (exists.length === 0) throw new PaidError('not_found');
  }
  return { revoked: rows.length > 0 };
}

// ── PIN entry and devices ──────────────────────────────────────────────────────────────────────────────────────

/** A wrong PIN, with how many tries are left before the link locks. */
export class StaffPinError extends PaidError {
  readonly attemptsLeft: number;
  constructor(attemptsLeft: number) {
    super('wrong_pin', { detail: 'pin' });
    this.name = 'StaffPinError';
    this.attemptsLeft = attemptsLeft;
  }
}

/** What a link page may show before the PIN: only what the token itself proves. */
export interface StaffLinkPreview {
  /** The link this token opens (to match a signed-in device to it exactly). */
  linkId: string;
  label: string;
  scopeId: string;
  state: StaffLinkState;
  lockedUntil: number | null;
}

/** Looks a link up by its token, for the PIN page. Null for an unknown or malformed token. */
export async function previewStaffLink(
  db: SqlDatabase,
  env: PaidEnv,
  input: { token: string; now: number },
): Promise<StaffLinkPreview | null> {
  const link = await linkByToken(db, env, input.token);
  if (!link) return null;
  const state = stateOf(link, input.now);
  return {
    linkId: link.id,
    label: link.label,
    scopeId: link.event_id,
    state,
    lockedUntil: state === 'locked' ? link.locked_until : null,
  };
}

async function linkByToken(
  db: SqlDatabase,
  env: PaidEnv,
  token: unknown,
): Promise<(LinkRecord & { pin_hash: string; pin_salt: string }) | null> {
  if (!isWellFormedSecret(token, TOKEN_BYTES)) return null;
  const [row] = await allRows<LinkRecord & { pin_hash: string; pin_salt: string }>(db, {
    sql: `SELECT id, organization_id, event_id, label, can_check_in, can_sell, can_comp, expires_at, revoked_at,
                 locked_until, last_used_at, created_at, pin_hash, pin_salt
            FROM staff_links WHERE token_hash = ?1`,
    params: [await tokenHashOf(env, token)],
  });
  return row ?? null;
}

export interface EnterPinInput {
  token: string;
  pin: string;
  /** Keyed hash of the requester's IP (`hashIp`), for the per-IP limit. */
  ipHash?: string | null;
  now: number;
}

export interface EnteredPin {
  /** The device cookie value (set it HttpOnly, Secure, SameSite=Strict); only its hash is stored. */
  cookieValue: string;
  expiresAt: number;
  linkId: string;
  scopeId: string;
}

/**
 * Checks the PIN for a link and signs the device in. Throws `PaidError`:
 * `rate_limited` (per IP), `not_found` (unknown token), `forbidden` (revoked), `expired`, `locked`
 * (with `retryAfterSeconds`) or `StaffPinError` (`wrong_pin`, with attempts left).
 */
export async function enterPin(db: SqlDatabase, env: PaidEnv, input: EnterPinInput): Promise<EnteredPin> {
  const { now } = input;
  if (input.ipHash) {
    const limit = await checkRateLimits(
      db,
      [
        {
          bucket: rateLimitBucket('live.door.pin', 'ip', input.ipHash),
          limit: PIN_IP_LIMIT,
          windowSeconds: PIN_IP_WINDOW_SECONDS,
        },
      ],
      now,
    );
    if (!limit.allowed) throw new PaidError('rate_limited', { retryAfterSeconds: limit.retryAfterSeconds });
  }
  const link = await linkByToken(db, env, input.token);
  if (!link) throw new PaidError('not_found');
  if (link.revoked_at != null) throw new PaidError('forbidden', { detail: 'revoked' });
  if (link.expires_at <= now) throw new PaidError('expired');
  if (link.locked_until != null && link.locked_until > now)
    throw new PaidError('locked', { retryAfterSeconds: link.locked_until - now });

  const ok = await verifyScannerPin(
    input.pin,
    { hash: link.pin_hash, salt: link.pin_salt },
    { pepper: await pinPepperOf(env) },
  );

  if (!ok) {
    // One atomic UPDATE: count the failure (starting again from 1 once an earlier lock has passed) and lock at the
    // fifth. A guess that arrives while another request has just locked the link changes nothing.
    const fresh =
      'CASE WHEN locked_until IS NOT NULL AND locked_until <= ?2 THEN 1 ELSE failed_pin_attempts + 1 END';
    const [row] = await allRows<{ failed_pin_attempts: number; locked_until: number | null }>(db, {
      sql: `UPDATE staff_links
               SET failed_pin_attempts = ${fresh},
                   locked_until = CASE WHEN ${fresh} >= ?3 THEN ?2 + ?4 ELSE NULL END
             WHERE id = ?1 AND (locked_until IS NULL OR locked_until <= ?2)
         RETURNING failed_pin_attempts, locked_until`,
      params: [link.id, now, PIN_MAX_FAILED_ATTEMPTS, PIN_LOCK_SECONDS],
    });
    if (!row) throw new PaidError('locked', { retryAfterSeconds: PIN_LOCK_SECONDS });
    if (row.locked_until != null && row.locked_until > now)
      throw new PaidError('locked', { retryAfterSeconds: row.locked_until - now });
    throw new StaffPinError(Math.max(0, PIN_MAX_FAILED_ATTEMPTS - row.failed_pin_attempts));
  }

  const cookieValue = bytesToBase64Url(randomBytes(DEVICE_BYTES));
  const deviceId = await sha256Hex(cookieValue);
  const expiresAt = Math.min(link.expires_at, now + STAFF_DEVICE_MAX_SECONDS);
  await runBatch(db, [
    {
      sql: `UPDATE staff_links SET failed_pin_attempts = 0, locked_until = NULL, last_used_at = ?2
             WHERE id = ?1 AND revoked_at IS NULL AND expires_at > ?2 AND (locked_until IS NULL OR locked_until <= ?2)`,
      params: [link.id, now],
    },
    {
      sql: `INSERT INTO staff_devices (id, staff_link_id, expires_at, created_at, last_seen_at)
            SELECT ?1, ?2, ?3, ?4, ?4 WHERE changes() = 1`,
      params: [deviceId, link.id, expiresAt, now],
    },
  ]);
  const created = await allRows(db, {
    sql: 'SELECT 1 AS ok FROM staff_devices WHERE id = ?1',
    params: [deviceId],
  });
  if (created.length === 0) {
    // The link was revoked or locked between the read and the write.
    throw new PaidError('locked', { retryAfterSeconds: PIN_LOCK_SECONDS });
  }
  return { cookieValue, expiresAt, linkId: link.id, scopeId: link.event_id };
}

export interface StaffDevice {
  actor: Extract<StaffActor, { kind: 'staff' }>;
  linkId: string;
  scopeId: string;
  permissions: StaffPermissions;
  deviceExpiresAt: number;
}

/** Devices update `last_seen_at` at most this often. */
const LAST_SEEN_EVERY_SECONDS = 5 * 60;

/**
 * The staff device behind a cookie, re-checking on every request that the device and its link are still valid (not
 * expired, not revoked). Null otherwise; the caller then sends the person back to the PIN page.
 */
export async function resolveStaffDevice(
  db: SqlDatabase,
  input: { cookieValue: string | null | undefined; now: number },
): Promise<StaffDevice | null> {
  if (!isWellFormedSecret(input.cookieValue, DEVICE_BYTES)) return null;
  const deviceId = await sha256Hex(input.cookieValue);
  const [row] = await allRows<LinkRecord & { device_expires_at: number; last_seen_at: number | null }>(db, {
    sql: `SELECT l.id, l.organization_id, l.event_id, l.label, l.can_check_in, l.can_sell, l.can_comp, l.expires_at,
                 l.revoked_at, l.locked_until, l.last_used_at, l.created_at,
                 d.expires_at AS device_expires_at, d.last_seen_at
            FROM staff_devices d JOIN staff_links l ON l.id = d.staff_link_id
           WHERE d.id = ?1 AND d.expires_at > ?2 AND l.revoked_at IS NULL AND l.expires_at > ?2`,
    params: [deviceId, input.now],
  });
  if (!row) return null;
  if (row.last_seen_at == null || row.last_seen_at <= input.now - LAST_SEEN_EVERY_SECONDS) {
    await runBatch(db, [
      { sql: 'UPDATE staff_devices SET last_seen_at = ?2 WHERE id = ?1', params: [deviceId, input.now] },
    ]);
  }
  const permissions = permissionsOf(row);
  return {
    actor: {
      kind: 'staff',
      staffLinkId: row.id,
      organizationId: row.organization_id,
      scopeId: row.event_id,
      label: row.label,
      permissions,
    },
    linkId: row.id,
    scopeId: row.event_id,
    permissions,
    deviceExpiresAt: Math.min(row.device_expires_at, row.expires_at),
  };
}

/** Signs one device out (the "Leave" button). */
export async function endStaffDevice(
  db: SqlDatabase,
  input: { cookieValue: string | null | undefined },
): Promise<void> {
  if (!isWellFormedSecret(input.cookieValue, DEVICE_BYTES)) return;
  await runBatch(db, [
    { sql: 'DELETE FROM staff_devices WHERE id = ?1', params: [await sha256Hex(input.cookieValue)] },
  ]);
}

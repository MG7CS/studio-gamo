import type { GamoEnv } from '@gamo/config/env';
import type { GamoLocals } from './locals.ts';
/**
 * @gamo/auth — staff authentication for the admin app.
 *
 * Public products have no accounts (removed 2026-11-16); only staff sign in, at admin.gamostudio.org
 * behind Cloudflare Access plus the admin password. Built on:
 * - Web Crypto HMAC-SHA256 cookie signing and verification.
 * - D1 `users`, `sessions`, `roles`, `user_roles`, `admin_credentials` (and `external_identities` for the
 *   Cloudflare Access subject binding).
 * - HTTP-only, Secure, SameSite=Lax host-only cookies and server-side role checks.
 */

import { eq, and, gt, isNull } from 'drizzle-orm';
import {
  users,
  sessions,
  userRoles,
  roles,
  externalIdentities,
  adminCredentials,
  type GamoDatabase,
} from '@gamo/db';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  verifiedEmailAt: Date | null;
  status: string;
  createdAt: Date;
}

export interface SessionData {
  user: AuthUser;
  roles: string[];
  sessionId: string;
  expiresAt: Date;
}

export interface AuthResolutionOptions {
  secret?: string;
  env?: GamoEnv;
}

export type SecretOrAuthOptions = string | AuthResolutionOptions | undefined;

export interface SessionOptions {
  ttlSeconds?: number; // Default 30 days
  ipHash?: string;
  userAgent?: string;
}

export interface CookieOptions {
  domain?: string;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
}

const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const DEFAULT_COOKIE_NAME = '__session';

/**
 * Signs a payload with HMAC-SHA256 using Web Crypto API.
 */
export async function signValue(value: string, secret?: string): Promise<string> {
  if (!secret || secret.length < 32) throw new Error('Session signing secret unavailable.');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${value}.${signatureBase64}`;
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies an HMAC-SHA256 signed value and returns the original value if valid.
 */
export async function verifySignedValue(signedValue: string, secret?: string): Promise<string | null> {
  const lastDot = signedValue.lastIndexOf('.');
  if (lastDot === -1) return null;

  const value = signedValue.slice(0, lastDot);
  const signature = signedValue.slice(lastDot + 1);

  const expectedSigned = await signValue(value, secret);
  const expectedSignature = expectedSigned.slice(expectedSigned.lastIndexOf('.') + 1);

  if (constantTimeCompare(signature, expectedSignature)) {
    return value;
  }
  return null;
}

/**
 * Generates an unpredictable high-entropy session ID.
 */
export function generateSessionId(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Creates an authenticated session in D1 and returns signed cookie data.
 */
export async function createSession(
  db: GamoDatabase,
  userId: string,
  secret?: string,
  options?: SessionOptions,
): Promise<{ sessionId: string; cookieValue: string; expiresAt: Date }> {
  if (!secret || secret.length < 32) throw new Error('Session signing secret unavailable.');
  const sessionId = generateSessionId();
  const ttl = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const now = new Date();

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    ipHash: options?.ipHash,
    userAgent: options?.userAgent,
    createdAt: now,
  });

  const cookieValue = await signValue(sessionId, secret);
  return { sessionId, cookieValue, expiresAt };
}

/**
 * Validates a session cookie against D1 and resolves the user and their unscoped system roles.
 */
export async function validateSession(
  db: GamoDatabase,
  cookieValue: string | undefined | null,
  secret?: string,
): Promise<SessionData | null> {
  if (!cookieValue) return null;

  const sessionId = await verifySignedValue(cookieValue, secret);
  if (!sessionId) return null;

  const now = new Date();

  // 1. Fetch valid, unexpired, unrevoked session
  const [sessionRecord] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now), isNull(sessions.revokedAt)))
    .limit(1);

  // A session issued for a public product (before public accounts were removed) never authenticates.
  if (!sessionRecord || sessionRecord.product) return null;

  // 2. Fetch associated user
  const [userRecord] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionRecord.userId), eq(users.status, 'active')))
    .limit(1);

  if (!userRecord) return null;

  // 3. Resolve system roles
  const userRoleRows = await db
    .select({
      code: roles.code,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userRecord.id), isNull(userRoles.scopeType), isNull(userRoles.scopeId)));

  const roleCodes = userRoleRows.map((r) => r.code);

  return {
    user: {
      id: userRecord.id,
      email: userRecord.email,
      displayName: userRecord.displayName,
      verifiedEmailAt: userRecord.verifiedEmailAt ?? null,
      status: userRecord.status,
      createdAt: userRecord.createdAt,
    },
    roles: roleCodes,
    sessionId: sessionRecord.id,
    expiresAt: sessionRecord.expiresAt,
  };
}

/**
 * Revokes a single session.
 */
export async function revokeSession(db: GamoDatabase, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/**
 * Revokes all active sessions for a user (e.g. security credential reset).
 */
export async function revokeAllUserSessions(db: GamoDatabase, userId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
}

/**
 * Serializes the session cookie header.
 */
export function buildSessionCookie(cookieValue: string, expiresAt: Date, options?: CookieOptions): string {
  const parts = [
    `${DEFAULT_COOKIE_NAME}=${encodeURIComponent(cookieValue)}`,
    `Expires=${expiresAt.toUTCString()}`,
    `Path=${options?.path || '/'}`,
    `SameSite=${options?.sameSite || 'Lax'}`,
    'HttpOnly',
  ];

  if (options?.secure !== false) {
    parts.push('Secure');
  }

  if (options?.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  return parts.join('; ');
}

/**
 * Builds an expired session cookie to log out the user.
 */
export function buildClearSessionCookie(options?: CookieOptions): string {
  const parts = [
    `${DEFAULT_COOKIE_NAME}=`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    `Path=${options?.path || '/'}`,
    `SameSite=${options?.sameSite || 'Lax'}`,
    'HttpOnly',
  ];

  if (options?.secure !== false) {
    parts.push('Secure');
  }

  if (options?.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  return parts.join('; ');
}

/**
 * Extracts session cookie value from a request.
 */
export function extractSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...val] = cookie.trim().split('=');
    if (name === DEFAULT_COOKIE_NAME) {
      try {
        const value = decodeURIComponent(val.join('='));
        // Ours is `id.signature`; skip a JWT (three parts) of the same name, e.g. an old third-party cookie.
        if (value.split('.').length === 3) continue;
        return value;
      } catch {
        continue;
      }
    }
  }
  return null;
}

// ============================================================================
// AUTHORIZATION & PERMISSION GUARDS
// ============================================================================

export class AuthError extends Error {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN';
  status: number;

  constructor(code: 'UNAUTHENTICATED' | 'FORBIDDEN', message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Checks if the authenticated user has a specific system role.
 */
export function hasSystemRole(auth: SessionData | null | undefined, role: string): boolean {
  if (!auth) return false;
  return auth.roles.includes('superadmin') || auth.roles.includes(role);
}

/**
 * Checks if the user is a staff member or administrator.
 */
export function isStaffOrAdmin(auth: SessionData | null | undefined): boolean {
  if (!auth) return false;
  return auth.roles.includes('superadmin') || auth.roles.includes('staff_reviewer');
}

function normalizeAuthOptions(secretOrOptions?: SecretOrAuthOptions): AuthResolutionOptions {
  if (!secretOrOptions) return {};
  if (typeof secretOrOptions === 'string') {
    return { secret: secretOrOptions };
  }
  return secretOrOptions;
}

/**
 * Resolves the staff session (D1 HMAC-signed `__session` cookie) of an Astro or Worker request.
 */
export async function resolveAuth(
  request: Request,
  db: GamoDatabase,
  secretOrOptions?: SecretOrAuthOptions,
): Promise<SessionData | null> {
  const opts = normalizeAuthOptions(secretOrOptions);
  const cookie = extractSessionCookie(request);
  if (!cookie) return null;
  return validateSession(db, cookie, opts.secret ?? opts.env?.SESSION_SECRET);
}

/**
 * Enforces authenticated session; throws AuthError(UNAUTHENTICATED, 401) if not signed in.
 */
export async function requireAuth(
  request: Request,
  db: GamoDatabase,
  secretOrOptions?: SecretOrAuthOptions,
): Promise<SessionData> {
  requireSameOrigin(request);
  const auth = await resolveAuth(request, db, secretOrOptions);
  if (!auth) {
    throw new AuthError('UNAUTHENTICATED', 'Authentication required for this operation.', 401);
  }
  return auth;
}

/**
 * Enforces staff/admin access.
 */
export async function requireStaff(
  request: Request,
  db: GamoDatabase,
  secretOrOptions?: SecretOrAuthOptions,
): Promise<SessionData> {
  const auth = await requireAuth(request, db, secretOrOptions);
  if (!isStaffOrAdmin(auth)) {
    throw new AuthError('FORBIDDEN', 'Administrative or staff permissions required.', 403);
  }
  return auth;
}

/**
 * Enforces superadmin access.
 */
export async function requireSuperadmin(
  request: Request,
  db: GamoDatabase,
  secretOrOptions?: SecretOrAuthOptions,
): Promise<SessionData> {
  const auth = await requireStaff(request, db, secretOrOptions);
  if (!auth.roles.includes('superadmin')) {
    throw new AuthError('FORBIDDEN', 'Superadmin permissions required.', 403);
  }
  return auth;
}

/**
 * Verifies that Cloudflare Access boundary claims (email and immutable sub) match the D1 staff session user.
 */
export async function verifyStaffBoundaryIdentity(
  db: GamoDatabase,
  auth: SessionData,
  locals: Pick<GamoLocals, 'staffEmail' | 'staffSubject'> | undefined,
): Promise<void> {
  const accessEmail = locals?.staffEmail;
  if (accessEmail && accessEmail.toLowerCase() !== auth.user.email.toLowerCase()) {
    throw new AuthError('FORBIDDEN', 'Staff identities do not match.', 403);
  }

  const accessSubject = locals?.staffSubject;
  if (accessSubject) {
    // 1. Check if this user has a provisioned cloudflare_access identity
    const [userBinding] = await db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.userId, auth.user.id),
          eq(externalIdentities.provider, 'cloudflare_access'),
        ),
      )
      .limit(1);

    if (userBinding && userBinding.providerSubject !== accessSubject) {
      throw new AuthError('FORBIDDEN', 'Staff Access subject does not match provisioned identity.', 403);
    }

    // 2. Check if this accessSubject is already bound to a different user
    const [subjectBinding] = await db
      .select()
      .from(externalIdentities)
      .where(
        and(
          eq(externalIdentities.provider, 'cloudflare_access'),
          eq(externalIdentities.providerSubject, accessSubject),
        ),
      )
      .limit(1);

    if (subjectBinding && subjectBinding.userId !== auth.user.id) {
      throw new AuthError('FORBIDDEN', 'Staff Access subject is bound to a different user.', 403);
    }
  }
}

/**
 * CSRF guard for state-changing requests. Browsers send `Origin` on every cross-origin POST/PUT/
 * PATCH/DELETE and `Sec-Fetch-Site` on all modern engines, so:
 * - a mismatched `Origin` (including sibling subdomains such as worship.gamostudio.org) is rejected;
 * - `Sec-Fetch-Site: cross-site` or `same-site` is rejected;
 * - without `Origin`, a mismatched `Referer` is rejected.
 * A request with none of these headers is not from a browser and cannot carry a victim's cookies.
 */
export function requireSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const expected = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  let crossOrigin =
    Boolean(origin && origin !== expected) || fetchSite === 'cross-site' || fetchSite === 'same-site';
  if (!origin && !crossOrigin) {
    const referer = request.headers.get('referer');
    if (referer) {
      try {
        crossOrigin = new URL(referer).origin !== expected;
      } catch {
        crossOrigin = true;
      }
    }
  }
  if (crossOrigin) {
    throw new AuthError('FORBIDDEN', 'Cross-origin mutation denied.', 403);
  }
}

// ============================================================================
// ADMIN GATEWAY PASSWORD AUTHENTICATION & ROTATION
// ============================================================================

const PBKDF2_ITERATIONS = 100_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const ADMIN_GATE_COOKIE_NAME = '__admin_gate';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Hashes a password with Web Crypto PBKDF2-HMAC-SHA256.
 * Format: pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>
 */
export async function hashAdminPassword(
  password: string,
  saltBytes?: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = saltBytes ?? crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, [
    'deriveBits',
  ]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  const hashHex = bytesToHex(new Uint8Array(derivedBits));
  return `pbkdf2_sha256$${iterations}$${bytesToHex(salt)}$${hashHex}`;
}

/**
 * Verifies a plaintext password against a stored PBKDF2-HMAC-SHA256 hash.
 */
export async function verifyAdminPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    return false;
  }
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 500_000) {
    return false;
  }
  const salt = hexToBytes(parts[2]);
  const computed = await hashAdminPassword(password, salt, iterations);
  return constantTimeCompare(computed, storedHash);
}

export interface BootstrapAdminIdentity {
  email: string;
  displayName: string;
  /** Must be changed at first sign-in (`mustChangePassword`). Never commit a real value. */
  temporaryPassword: string;
}

/**
 * Ensures a local superadmin account and its temporary password credential exist in D1.
 * Restricted to explicit local demos; the identity is supplied by the caller (no defaults in code).
 * Never overwrites an existing credential once created or changed.
 */
export async function ensureBootstrapAdminAccount(
  db: GamoDatabase,
  identity: BootstrapAdminIdentity,
  localDemo?: { environment: string; enabled: boolean; requestUrl: string },
): Promise<{ userId: string }> {
  if (
    !localDemo ||
    localDemo.environment !== 'local' ||
    !localDemo.enabled ||
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(localDemo.requestUrl).hostname)
  ) {
    throw new AuthError('FORBIDDEN', 'Bootstrap accounts are restricted to explicit local demos.', 403);
  }
  if (identity.temporaryPassword.length < 12) {
    throw new Error('Temporary password must be at least 12 characters.');
  }
  const cleanEmail = identity.email.trim().toLowerCase();
  const now = new Date();

  let [user] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
  if (!user) {
    const id = `usr_admin_${crypto.randomUUID().slice(0, 12)}`;
    await db.insert(users).values({
      id,
      email: cleanEmail,
      displayName: identity.displayName,
      verifiedEmailAt: now,
      status: 'active',
      createdAt: now,
    });
    const [created] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    user = created;
  } else if (!user.verifiedEmailAt || user.status !== 'active') {
    await db
      .update(users)
      .set({
        verifiedEmailAt: user.verifiedEmailAt ?? now,
        displayName: user.displayName || identity.displayName,
        status: 'active',
      })
      .where(eq(users.id, user.id));
  }

  let [superRole] = await db.select().from(roles).where(eq(roles.code, 'superadmin')).limit(1);
  if (!superRole) {
    await db.insert(roles).values({
      id: 'role_superadmin',
      code: 'superadmin',
      description: 'Global system administrator',
    });
    const [createdRole] = await db.select().from(roles).where(eq(roles.code, 'superadmin')).limit(1);
    superRole = createdRole;
  }

  const [existingUserRole] = await db
    .select()
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, user.id),
        eq(userRoles.roleId, superRole.id),
        isNull(userRoles.scopeType),
        isNull(userRoles.scopeId),
      ),
    )
    .limit(1);

  if (!existingUserRole) {
    await db.insert(userRoles).values({
      id: `ur_super_${user.id}`,
      userId: user.id,
      roleId: superRole.id,
      scopeType: null,
      scopeId: null,
      createdAt: now,
    });
  }

  const [cred] = await db
    .select()
    .from(adminCredentials)
    .where(eq(adminCredentials.userId, user.id))
    .limit(1);

  if (!cred) {
    const initialHash = await hashAdminPassword(identity.temporaryPassword);
    await db.insert(adminCredentials).values({
      userId: user.id,
      passwordHash: initialHash,
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
      createdAt: now,
    });
  }

  return { userId: user.id };
}

export interface AdminAuthResult {
  ok: boolean;
  userId?: string;
  email?: string;
  mustChangePassword?: boolean;
  error?: string;
}

/**
 * Verifies an admin email and password against D1 `admin_credentials` with brute-force lockout protection.
 */
export async function authenticateAdminPassword(
  db: GamoDatabase,
  emailInput: string,
  passwordInput: string,
): Promise<AdminAuthResult> {
  const cleanEmail = emailInput.trim().toLowerCase();
  const password = passwordInput;

  if (!cleanEmail || !password) {
    return { ok: false, error: 'Please enter both your email address and password.' };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, cleanEmail), eq(users.status, 'active')))
    .limit(1);

  if (!user) {
    return { ok: false, error: 'Invalid admin email or password.' };
  }

  const [cred] = await db
    .select()
    .from(adminCredentials)
    .where(eq(adminCredentials.userId, user.id))
    .limit(1);

  if (!cred) {
    return { ok: false, error: 'Invalid admin email or password.' };
  }

  const now = new Date();
  if (cred.lockedUntil && cred.lockedUntil.getTime() > now.getTime()) {
    const minutesLeft = Math.max(1, Math.ceil((cred.lockedUntil.getTime() - now.getTime()) / 60_000));
    return {
      ok: false,
      error: `Too many failed sign-in attempts. Please wait ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} and try again.`,
    };
  }

  const valid = await verifyAdminPassword(password, cred.passwordHash);
  if (!valid) {
    const nextAttempts = (cred.failedAttempts || 0) + 1;
    const lockedUntil = nextAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null;
    await db
      .update(adminCredentials)
      .set({
        failedAttempts: nextAttempts,
        lockedUntil,
        updatedAt: now,
      })
      .where(eq(adminCredentials.userId, user.id));

    return { ok: false, error: 'Invalid admin email or password.' };
  }

  await db
    .update(adminCredentials)
    .set({
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(eq(adminCredentials.userId, user.id));

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    mustChangePassword: Boolean(cred.mustChangePassword),
  };
}

/**
 * Updates the admin user's password after verifying their current password.
 */
export async function changeAdminPassword(
  db: GamoDatabase,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!currentPassword) {
    return { ok: false, error: 'Please enter your current password.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters long.' };
  }
  if (newPassword.length > 128) {
    return { ok: false, error: 'New password must be 128 characters or fewer.' };
  }

  const [cred] = await db.select().from(adminCredentials).where(eq(adminCredentials.userId, userId)).limit(1);

  if (!cred) {
    return { ok: false, error: 'Admin password credential record not found.' };
  }

  const validCurrent = await verifyAdminPassword(currentPassword, cred.passwordHash);
  if (!validCurrent) {
    return { ok: false, error: 'Your current password is incorrect.' };
  }

  const newHash = await hashAdminPassword(newPassword);
  const now = new Date();

  await db
    .update(adminCredentials)
    .set({
      passwordHash: newHash,
      mustChangePassword: false,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(eq(adminCredentials.userId, userId));

  return { ok: true };
}

/**
 * Fetches the admin credential metadata for display on the Admin Security page.
 */
export async function getAdminCredentialStatus(
  db: GamoDatabase,
  userId: string,
): Promise<{ mustChangePassword: boolean; updatedAt: Date | null } | null> {
  const [cred] = await db.select().from(adminCredentials).where(eq(adminCredentials.userId, userId)).limit(1);
  if (!cred) return null;
  return {
    mustChangePassword: Boolean(cred.mustChangePassword),
    updatedAt: cred.updatedAt ?? null,
  };
}

/**
 * Builds the signed `__admin_gate` cookie proving the user authenticated at the Admin Gateway.
 */
export async function buildAdminGateCookie(
  sessionId: string,
  userId: string,
  expiresAt: Date,
  secret: string,
  options?: CookieOptions,
): Promise<string> {
  const payload = `${sessionId}:${userId}`;
  const signed = await signValue(payload, secret);
  const parts = [
    `${ADMIN_GATE_COOKIE_NAME}=${encodeURIComponent(signed)}`,
    `Expires=${expiresAt.toUTCString()}`,
    `Path=${options?.path || '/'}`,
    `SameSite=${options?.sameSite || 'Lax'}`,
    'HttpOnly',
  ];
  if (options?.secure !== false) {
    parts.push('Secure');
  }
  if (options?.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  return parts.join('; ');
}

export function buildClearAdminGateCookie(options?: CookieOptions): string {
  const parts = [
    `${ADMIN_GATE_COOKIE_NAME}=`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    `Path=${options?.path || '/'}`,
    `SameSite=${options?.sameSite || 'Lax'}`,
    'HttpOnly',
  ];
  if (options?.secure !== false) {
    parts.push('Secure');
  }
  if (options?.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  return parts.join('; ');
}

export async function verifyAdminGateCookie(
  request: Request,
  expectedSessionId: string,
  expectedUserId: string,
  secret?: string,
): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;

  let rawGate: string | null = null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...val] = part.trim().split('=');
    if (name === ADMIN_GATE_COOKIE_NAME) {
      try {
        rawGate = decodeURIComponent(val.join('='));
      } catch {
        return false;
      }
      break;
    }
  }
  if (!rawGate) return false;

  const verified = await verifySignedValue(rawGate, secret);
  if (!verified) return false;

  return constantTimeCompare(verified, `${expectedSessionId}:${expectedUserId}`);
}

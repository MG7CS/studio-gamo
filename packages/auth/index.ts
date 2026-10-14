/**
 * @gamo/auth — Cloudflare-Native Authentication & Authorization
 *
 * Implements a lightweight, zero-external-dependency session manager built on:
 * - Standard Web Crypto API (HMAC-SHA256 cookie signing and verification).
 * - Cloudflare D1 persistence for sessions, users, roles, and organization memberships.
 * - HTTP-only, Secure, SameSite=Lax cookies with cross-subdomain support (.gamostudio.org).
 * - Server-side Role-Based Access Control (RBAC) and Multi-Tenant Organization Authorization.
 */

import { eq, and, gt, isNull } from 'drizzle-orm';
import {
  users,
  sessions,
  userRoles,
  roles,
  organizations,
  organizationMembers,
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

export interface OrgMembership {
  organizationId: string;
  role: string;
  orgName: string;
  orgSlug: string;
  orgType: string;
  status: string;
}

export interface SessionData {
  user: AuthUser;
  roles: string[];
  memberships: OrgMembership[];
  sessionId: string;
  expiresAt: Date;
}

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
    ['sign']
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
  options?: SessionOptions
): Promise<{ sessionId: string; cookieValue: string; expiresAt: Date }> {
  if (!secret || secret.length < 32) throw new Error('Session signing secret unavailable.');
  const sessionId = generateSessionId();
  const ttl = options?.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId,
    expiresAt,
    ipHash: options?.ipHash,
    userAgent: options?.userAgent,
    createdAt: new Date(),
  });

  const cookieValue = await signValue(sessionId, secret);
  return { sessionId, cookieValue, expiresAt };
}

/**
 * Validates a session cookie against D1 and resolves user identity, system roles, and organization memberships.
 */
export async function validateSession(
  db: GamoDatabase,
  cookieValue: string | undefined | null,
  secret?: string
): Promise<SessionData | null> {
  if (!cookieValue) return null;

  const sessionId = await verifySignedValue(cookieValue, secret);
  if (!sessionId) return null;

  const now = new Date();

  // 1. Fetch valid, unexpired, unrevoked session
  const [sessionRecord] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, now),
        isNull(sessions.revokedAt)
      )
    )
    .limit(1);

  if (!sessionRecord) return null;

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

  // 4. Resolve organization memberships
  const memberRows = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      orgType: organizations.type,
      status: organizationMembers.status,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(
      and(
        eq(organizationMembers.userId, userRecord.id),
        eq(organizationMembers.status, 'active'),
        eq(organizations.status, 'active')
      )
    );

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
    memberships: memberRows,
    sessionId: sessionRecord.id,
    expiresAt: sessionRecord.expiresAt,
  };
}

/**
 * Revokes a single session.
 */
export async function revokeSession(db: GamoDatabase, sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

/**
 * Revokes all active sessions for a user (e.g. security credential reset).
 */
export async function revokeAllUserSessions(db: GamoDatabase, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.userId, userId));
}

/**
 * Serializes the session cookie header.
 */
export function buildSessionCookie(
  cookieValue: string,
  expiresAt: Date,
  options?: CookieOptions
): string {
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
      try { return decodeURIComponent(val.join('=')); } catch { return null; }
    }
  }
  return null;
}

// ============================================================================
// AUTHORIZATION & PERMISSION GUARDS
// ============================================================================

export class AuthError extends Error {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'ORGANIZATION_FORBIDDEN';
  status: number;

  constructor(
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'ORGANIZATION_FORBIDDEN',
    message: string,
    status: number = 401
  ) {
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
  return (
    auth.roles.includes('superadmin') ||
    auth.roles.includes('staff_reviewer')
  );
}

/**
 * Checks if the user has an allowed role within a target organization.
 */
export function hasOrgRole(
  auth: SessionData | null | undefined,
  organizationId: string,
  allowedRoles: string[] = ['owner', 'admin', 'member']
): boolean {
  if (!auth) return false;
  if (auth.roles.includes('superadmin')) return true; // Superadmins have global tenant override

  const membership = auth.memberships.find((m) => m.organizationId === organizationId);
  if (!membership) return false;

  return allowedRoles.includes(membership.role);
}

/**
 * Resolves session auth from an Astro or Worker Request.
 */
export async function resolveAuth(
  request: Request,
  db: GamoDatabase,
  secret?: string
): Promise<SessionData | null> {
  const cookie = extractSessionCookie(request);
  if (!cookie) return null;
  return validateSession(db, cookie, secret);
}

/**
 * Enforces authenticated session; throws AuthError(UNAUTHENTICATED, 401) if not signed in.
 */
export async function requireAuth(
  request: Request,
  db: GamoDatabase,
  secret?: string
): Promise<SessionData> {
  requireSameOrigin(request);
  const auth = await resolveAuth(request, db, secret);
  if (!auth) {
    throw new AuthError('UNAUTHENTICATED', 'Authentication required for this operation.', 401);
  }
  return auth;
}

/**
 * Enforces authenticated session with verified email; throws AuthError(FORBIDDEN, 403) if email is unverified.
 */
export async function requireVerifiedAuth(
  request: Request,
  db: GamoDatabase,
  secret?: string
): Promise<SessionData> {
  const auth = await requireAuth(request, db, secret);
  if (!auth.user.verifiedEmailAt) {
    throw new AuthError('FORBIDDEN', 'Verified email address required for this operation.', 403);
  }
  return auth;
}

/**
 * Enforces staff/admin access.
 */
export async function requireStaff(
  request: Request,
  db: GamoDatabase,
  secret?: string
): Promise<SessionData> {
  const auth = await requireAuth(request, db, secret);
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
  secret?: string
): Promise<SessionData> {
  const auth = await requireStaff(request, db, secret);
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
  locals: Record<string, any> | undefined
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
          eq(externalIdentities.provider, 'cloudflare_access')
        )
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
          eq(externalIdentities.providerSubject, accessSubject)
        )
      )
      .limit(1);

    if (subjectBinding && subjectBinding.userId !== auth.user.id) {
      throw new AuthError('FORBIDDEN', 'Staff Access subject is bound to a different user.', 403);
    }
  }
}

/**
 * Enforces organization membership and role permissions.
 */
export async function requireOrgAccess(
  request: Request,
  db: GamoDatabase,
  organizationId: string,
  allowedRoles: string[] = ['owner', 'admin'],
  secret?: string
): Promise<SessionData> {
  const auth = await requireAuth(request, db, secret);
  if (!hasOrgRole(auth, organizationId, allowedRoles)) {
    throw new AuthError(
      'ORGANIZATION_FORBIDDEN',
      'You do not have required permissions for this organization.',
      403
    );
  }
  return auth;
}

/** Reject browser cross-origin mutations, including sibling subdomains. */
export function requireSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new AuthError('FORBIDDEN', 'Cross-origin mutation denied.', 403);
  }
}

// ============================================================================
// ADMIN GATEWAY PASSWORD AUTHENTICATION & ROTATION
// ============================================================================

export const BOOTSTRAP_ADMIN_EMAIL = 'gasanamoise7@gmail.com';
export const BOOTSTRAP_ADMIN_NAME = 'Moise Gasana';
export const BOOTSTRAP_ADMIN_TEMP_PASSWORD = 'GamoStudios.Com';

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
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  const salt = saltBytes ?? crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
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

/**
 * Ensures the bootstrap superadmin account (`gasanamoise7@gmail.com`) and its initial
 * temporary password credential (`GamoStudios.Com`) exist in D1.
 * Never overwrites an existing credential once created or changed.
 */
export async function ensureBootstrapAdminAccount(db: GamoDatabase): Promise<{ userId: string }> {
  const cleanEmail = BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const now = new Date();

  let [user] = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
  if (!user) {
    const id = `usr_admin_${crypto.randomUUID().slice(0, 12)}`;
    await db.insert(users).values({
      id,
      email: cleanEmail,
      displayName: BOOTSTRAP_ADMIN_NAME,
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
        displayName: user.displayName || BOOTSTRAP_ADMIN_NAME,
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
        isNull(userRoles.scopeId)
      )
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
    const initialHash = await hashAdminPassword(BOOTSTRAP_ADMIN_TEMP_PASSWORD);
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
  passwordInput: string
): Promise<AdminAuthResult> {
  await ensureBootstrapAdminAccount(db);

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
    const lockedUntil =
      nextAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null;
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
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  await ensureBootstrapAdminAccount(db);

  if (!currentPassword) {
    return { ok: false, error: 'Please enter your current password.' };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'New password must be at least 8 characters long.' };
  }
  if (newPassword.length > 128) {
    return { ok: false, error: 'New password must be 128 characters or fewer.' };
  }

  const [cred] = await db
    .select()
    .from(adminCredentials)
    .where(eq(adminCredentials.userId, userId))
    .limit(1);

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
  userId: string
): Promise<{ mustChangePassword: boolean; updatedAt: Date | null } | null> {
  await ensureBootstrapAdminAccount(db);
  const [cred] = await db
    .select()
    .from(adminCredentials)
    .where(eq(adminCredentials.userId, userId))
    .limit(1);
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
  options?: CookieOptions
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
  secret?: string
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


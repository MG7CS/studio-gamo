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

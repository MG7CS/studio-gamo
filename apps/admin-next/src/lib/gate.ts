/**
 * Admin sign-in, sign-out and session resolution. Everything here fails closed: a missing binding, a bad
 * signature, a thrown error or an identity mismatch all mean "not signed in".
 *
 * Layers, in order (middleware.ts):
 *   1. Cloudflare Access: outside ENVIRONMENT=local every request must carry a valid Access assertion.
 *   2. Gateway session: a D1 `__session` plus the signed `__admin_gate` cookie, for an active staff user.
 *   3. The user must match the Access identity and any provisioned Access subject binding.
 * Pages and API handlers still call `requireStaff` themselves (defense in depth).
 */
import type { GamoEnv } from '@gamo/config/env';
import { getDb } from '@gamo/db';
import {
  authenticateAdminPassword,
  buildAdminGateCookie,
  buildClearAdminGateCookie,
  buildClearSessionCookie,
  buildSessionCookie,
  changeAdminPassword,
  createSession,
  getAdminCredentialStatus,
  isStaffOrAdmin,
  requireSameOrigin,
  resolveAuth,
  revokeSession,
  verifyAdminGateCookie,
  verifyStaffBoundaryIdentity,
  type SessionData,
} from '@gamo/auth';
import { safeReturnPath } from '@gamo/auth/page-access';
import { verifyCloudflareAccessJwt } from './access';

/**
 * Set by the middleware when the sign-in page stands in for a protected URL (the response stays 401).
 * Kept off `App.Locals` so the middleware type-checks wherever it is imported, tests included.
 */
export interface SignInState {
  reason: 'required';
  /** The path (with query) the visitor asked for; sign-in returns there. */
  next: string;
  email?: string;
}
export const setSignInState = (locals: object, state: SignInState): void => {
  (locals as { signIn?: SignInState }).signIn = state;
};
export const getSignInState = (locals: object): SignInState | undefined =>
  (locals as { signIn?: SignInState }).signIn;

export interface AccessIdentity {
  email: string;
  sub: string;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * True only for a local development run. Anything else (preview, production, an unset or unknown
 * ENVIRONMENT, a built worker answering a non-loopback host) requires Cloudflare Access.
 */
export function isLocalRuntime(env: Pick<GamoEnv, 'ENVIRONMENT'>, url: URL): boolean {
  return env.ENVIRONMENT === 'local' && LOOPBACK_HOSTS.has(url.hostname);
}

/** The verified Access identity of this request, or null (header absent, or present but not valid). */
export async function readAccessIdentity(
  request: Request,
  env: Pick<GamoEnv, 'CF_ACCESS_AUD' | 'CF_ACCESS_TEAM_NAME'>,
): Promise<AccessIdentity | null> {
  const assertion = request.headers.get('cf-access-jwt-assertion');
  if (!assertion) return null;
  const result = await verifyCloudflareAccessJwt(assertion, env.CF_ACCESS_AUD, env.CF_ACCESS_TEAM_NAME);
  if (result.valid && result.claims) return { email: result.claims.email, sub: result.claims.sub };
  console.error('[admin] Cloudflare Access assertion rejected:', result.reason ?? 'unknown');
  return null;
}

export function signingSecretOf(env: Pick<GamoEnv, 'SESSION_SECRET'>): string | null {
  const secret = env.SESSION_SECRET;
  return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

export type SessionResolution =
  { kind: 'staff'; session: SessionData } | { kind: 'denied'; message: string } | { kind: 'none' };

/**
 * The staff session of this request. `denied` is a signed-in staff user who may not use this Access
 * identity; `none` is anything else (no cookie, wrong user kind, bad signature, lookup error).
 */
export async function resolveStaffSession(
  request: Request,
  env: Pick<GamoEnv, 'DB' | 'SESSION_SECRET'>,
  access: AccessIdentity | null,
): Promise<SessionResolution> {
  const secret = signingSecretOf(env);
  if (!env.DB || !secret) return { kind: 'none' };
  try {
    const db = getDb(env.DB);
    const session = await resolveAuth(request, db, secret);
    if (
      !session ||
      session.sessionProduct !== null ||
      !isStaffOrAdmin(session) ||
      !(await verifyAdminGateCookie(request, session.sessionId, session.user.id, secret))
    ) {
      return { kind: 'none' };
    }
    if (access && access.email.toLowerCase() !== session.user.email.toLowerCase()) {
      return {
        kind: 'denied',
        message: 'Signed-in staff account does not match your Cloudflare Access identity.',
      };
    }
    try {
      await verifyStaffBoundaryIdentity(db, session, {
        staffEmail: access?.email,
        staffSubject: access?.sub,
      });
    } catch {
      return {
        kind: 'denied',
        message: 'Your Cloudflare Access identity is not bound to this staff account.',
      };
    }
    return { kind: 'staff', session };
  } catch (error) {
    console.error('[admin] session verification failed:', error instanceof Error ? error.name : 'unknown');
    return { kind: 'none' };
  }
}

/** True when the signed-in user is still on a temporary password (fails closed on a lookup error). */
export async function mustChangePassword(env: Pick<GamoEnv, 'DB'>, userId: string): Promise<boolean> {
  try {
    const status = await getAdminCredentialStatus(getDb(env.DB), userId);
    return status?.mustChangePassword === true;
  } catch (error) {
    console.error('[admin] credential status unavailable:', error instanceof Error ? error.name : 'unknown');
    return true;
  }
}

/**
 * Cookies set by older builds were scoped to `.gamostudio.org` and so reached every product site; sign-out
 * clears that variant too.
 */
function legacySharedCookieDomain(url: URL, secure: boolean): string | undefined {
  return secure && (url.hostname === 'gamostudio.org' || url.hostname.endsWith('.gamostudio.org'))
    ? '.gamostudio.org'
    : undefined;
}

/** Where to go after sign-in: a same-site path that is not itself part of the sign-in flow. */
export function afterSignInPath(value: string | null | undefined): string {
  const path = safeReturnPath(value, '/');
  return /^\/(signin|signout)(\/|\?|$)/.test(path) ? '/' : path;
}

export type SignInResult =
  { ok: true; response: Response } | { ok: false; status: number; error: string; email: string };

export async function signInWithPassword(
  request: Request,
  env: GamoEnv,
  secure: boolean,
): Promise<SignInResult> {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const secret = signingSecretOf(env);
  if (!env.DB || !secret) {
    return { ok: false, status: 503, email, error: 'Sign-in is not configured on this deployment.' };
  }
  try {
    requireSameOrigin(request);
    const db = getDb(env.DB);
    const result = await authenticateAdminPassword(db, email, password);
    if (!result.ok || !result.userId) {
      return { ok: false, status: 401, email, error: result.error || 'Invalid admin email or password.' };
    }
    const session = await createSession(db, result.userId, secret, {
      userAgent: request.headers.get('user-agent') || undefined,
    });
    const cookieOptions = { secure, sameSite: 'Lax', path: '/' } as const;
    const headers = new Headers({
      Location: result.mustChangePassword
        ? '/security?welcome=1'
        : afterSignInPath(String(form.get('next') ?? '')),
    });
    headers.append('Set-Cookie', buildSessionCookie(session.cookieValue, session.expiresAt, cookieOptions));
    headers.append(
      'Set-Cookie',
      await buildAdminGateCookie(session.sessionId, result.userId, session.expiresAt, secret, cookieOptions),
    );
    return { ok: true, response: new Response(null, { status: 303, headers }) };
  } catch (error) {
    console.error('[admin] sign-in failed:', error instanceof Error ? error.name : 'unknown');
    return { ok: false, status: 400, email, error: 'Unable to complete the sign-in request.' };
  }
}

/** Revokes the session of this request (if any) and returns the Set-Cookie headers that clear it. */
export async function signOut(request: Request, env: GamoEnv, secure: boolean): Promise<string[]> {
  requireSameOrigin(request);
  const secret = signingSecretOf(env);
  if (env.DB && secret) {
    try {
      const db = getDb(env.DB);
      const existing = await resolveAuth(request, db, secret);
      if (existing) await revokeSession(db, existing.sessionId);
    } catch (error) {
      console.error('[admin] sign-out cleanup failed:', error instanceof Error ? error.name : 'unknown');
    }
  }
  const options = { secure, sameSite: 'Lax', path: '/' } as const;
  const cookies = [buildClearSessionCookie(options)];
  const legacy = legacySharedCookieDomain(new URL(request.url), secure);
  if (legacy) cookies.push(buildClearSessionCookie({ ...options, domain: legacy }));
  cookies.push(buildClearAdminGateCookie(options));
  return cookies;
}

export type PasswordChangeResult = { ok: true } | { ok: false; error: string };

export async function changePasswordFromForm(
  request: Request,
  env: GamoEnv,
  session: SessionData,
): Promise<PasswordChangeResult> {
  requireSameOrigin(request);
  const form = await request.formData();
  const current = String(form.get('currentPassword') ?? '');
  const next = String(form.get('newPassword') ?? '');
  const confirm = String(form.get('confirmPassword') ?? '');
  if (next !== confirm) return { ok: false, error: 'New password and confirmation do not match.' };
  const result = await changeAdminPassword(getDb(env.DB), session.user.id, current, next);
  return result.ok ? { ok: true } : { ok: false, error: result.error || 'Could not update the password.' };
}

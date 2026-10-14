import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  createSession,
  requireSameOrigin,
  revokeSession,
  buildSessionCookie,
  buildClearSessionCookie,
  extractSessionCookie,
  verifySignedValue,
} from '@gamo/auth';
import { IdentityService, jsonResponse, errorResponse, handleApiError, getRuntimeEnv } from '@gamo/domain';

export const prerender = false;

/**
 * POST /api/auth/session — Initializes an authenticated session and sets signed HTTP-only cookie.
 */
export const POST: APIRoute = async (context) => {
  try {
    requireSameOrigin(context.request);
    const runtimeEnv = await getRuntimeEnv(context);
    if (runtimeEnv.ENVIRONMENT !== 'local' || runtimeEnv.ALLOW_DEMO_SESSION !== 'true' || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(context.request.url).hostname)) {
      return errorResponse('FORBIDDEN', 'Demo session creation is disabled. Verified identity login is not implemented.', 403);
    }
    const db = getDb(runtimeEnv.DB);
    const identityService = new IdentityService(db);

    const body = await readContract(context.request, 'SessionInput');
    const { email, displayName } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return errorResponse('BAD_REQUEST', 'A valid email address is required.', 400);
    }

    // 1. Resolve or create user
    const user = await identityService.findOrCreateUser(email, displayName);

    // 2. Create session in D1
    const signingSecret =
      runtimeEnv.SESSION_SECRET ||
      import.meta.env?.SESSION_SECRET ||
      (globalThis as Record<string, any>).process?.env?.SESSION_SECRET;

    const { sessionId, cookieValue, expiresAt } = await createSession(
      db,
      user.id,
      signingSecret
    );

    const prior = extractSessionCookie(context.request);
    if (prior) {
      const priorId = await verifySignedValue(prior, signingSecret);
      if (priorId) await revokeSession(db, priorId);
    }
    // 3. Build host-only HTTP-only cookie (cross-subdomain cookie sharing requires approved SSO threat model)
    const isProd = import.meta.env?.PROD || runtimeEnv.ENVIRONMENT === 'production';

    const cookieHeader = buildSessionCookie(cookieValue, expiresAt, {
      secure: isProd,
      sameSite: 'Lax',
    });

    const res = jsonResponse({
      user,
      sessionId,
      message: 'Authenticated successfully.',
    });

    res.headers.set('Set-Cookie', cookieHeader);
    return res;
  } catch (err) {
    return handleApiError(err);
  }
};

/**
 * DELETE /api/auth/session — Revokes session and clears session cookie.
 */
export const DELETE: APIRoute = async (context) => {
  try {
    requireSameOrigin(context.request);
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);

    const signingSecret =
      runtimeEnv.SESSION_SECRET ||
      import.meta.env?.SESSION_SECRET ||
      (globalThis as Record<string, any>).process?.env?.SESSION_SECRET;

    const rawCookie = extractSessionCookie(context.request);
    if (rawCookie) {
      const sessionId = await verifySignedValue(rawCookie, signingSecret);
      if (sessionId) {
        await revokeSession(db, sessionId);
      }
    }

    const isProd = import.meta.env?.PROD || runtimeEnv.ENVIRONMENT === 'production';
    const clearCookieHeader = buildClearSessionCookie({ secure: isProd });

    const res = jsonResponse({ message: 'Session revoked successfully.' });
    res.headers.set('Set-Cookie', clearCookieHeader);
    return res;
  } catch (err) {
    return handleApiError(err);
  }
};

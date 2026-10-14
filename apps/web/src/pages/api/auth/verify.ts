import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  createSession,
  requireSameOrigin,
  revokeSession,
  buildSessionCookie,
  extractSessionCookie,
  verifySignedValue,
} from '@gamo/auth';
import {
  IdentityService,
  authVerifySchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';

export const prerender = false;

/**
 * POST /api/auth/verify — Verifies a 6-digit email challenge code and establishes an authenticated D1 session.
 *
 * Requirements:
 * 1. Enforces same-origin mutation check.
 * 2. Validates request payload via OpenAPI contract & Zod schema.
 * 3. Verifies the 6-digit code against D1 `auth_challenges`, enforcing 10-minute expiry and 5-attempt lockout.
 * 4. Marks `users.verified_email_at` in D1.
 * 5. Rotates any prior session cookie and sets a new host-only HttpOnly `__session` cookie.
 */
export const POST: APIRoute = async (context) => {
  try {
    requireSameOrigin(context.request);
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const identityService = new IdentityService(db);

    const body = await readContract(context.request, 'AuthVerifyInput');
    const validated = authVerifySchema.parse(body);

    const user = await identityService.verifyEmailChallenge(validated.email, validated.code, {
      displayName: validated.displayName,
      purpose: 'login',
    });

    const signingSecret =
      runtimeEnv.SESSION_SECRET ||
      import.meta.env?.SESSION_SECRET ||
      (globalThis as Record<string, any>).process?.env?.SESSION_SECRET;

    const { sessionId, cookieValue, expiresAt } = await createSession(
      db,
      user.id,
      signingSecret,
      {
        userAgent: context.request.headers.get('user-agent') ?? undefined,
      }
    );

    const prior = extractSessionCookie(context.request);
    if (prior) {
      const priorId = await verifySignedValue(prior, signingSecret);
      if (priorId) await revokeSession(db, priorId);
    }

    const isProd = import.meta.env?.PROD || runtimeEnv.ENVIRONMENT === 'production';
    const cookieHeader = buildSessionCookie(cookieValue, expiresAt, {
      secure: isProd,
      sameSite: 'Lax',
    });

    const res = jsonResponse(
      {
        user,
        sessionId,
        message: 'Email verified and session established.',
      },
      200
    );

    res.headers.set('Set-Cookie', cookieHeader);
    return res;
  } catch (err) {
    return handleApiError(err);
  }
};

import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { requireSameOrigin } from '@gamo/auth';
import {
  IdentityService,
  NotificationService,
  authChallengeSchema,
  jsonResponse,
  handleApiError,
} from '@gamo/domain';

export const prerender = false;

/**
 * POST /api/auth/challenge — Issues a 6-digit email verification challenge code.
 *
 * Requirements:
 * 1. Enforces same-origin mutation check.
 * 2. Validates request payload via OpenAPI contract & Zod schema.
 * 3. Stores SHA-256 hash of the 6-digit code in D1 `auth_challenges` (never plaintext) with 10-minute expiry.
 * 4. Enforces per-email rate limit (max 5 challenges per 15 minutes).
 * 5. Dispatches verification email via Resend (with safe local/preview mock fallback).
 */
export const POST: APIRoute = async (context) => {
  try {
    requireSameOrigin(context.request);
    const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
    const db = getDb(runtimeEnv.DB);
    const identityService = new IdentityService(db);

    const body = await readContract(context.request, 'AuthChallengeInput');
    const validated = authChallengeSchema.parse(body);

    const { challengeId, code, email, expiresAt } = await identityService.issueEmailChallenge(
      validated.email,
      {
        purpose: validated.purpose ?? 'login',
      }
    );

    const notificationService = new NotificationService(db, {
      apiKey: runtimeEnv.RESEND_API_KEY,
      defaultFrom: runtimeEnv.EMAIL_FROM,
    });

    const delivery = await notificationService.sendVerificationChallengeEmail({
      email,
      code,
      expiresAt,
    });

    return jsonResponse(
      {
        challengeId,
        expiresAt: expiresAt.toISOString(),
        deliveryStatus: delivery.deliveryStatus,
        message: 'Verification code dispatched to your email address.',
      },
      200
    );
  } catch (err) {
    return handleApiError(err);
  }
};

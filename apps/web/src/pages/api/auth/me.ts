import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { requireAuth } from '@gamo/auth';
import { jsonResponse, handleApiError, getRuntimeEnv } from '@gamo/domain';

export const prerender = false;

/**
 * GET /api/auth/me — Returns the currently authenticated user profile, global system roles, and active organization memberships.
 */
export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const signingSecret =
      runtimeEnv.SESSION_SECRET ||
      import.meta.env?.SESSION_SECRET ||
      (globalThis as Record<string, any>).process?.env?.SESSION_SECRET ||
      (runtimeEnv.ENVIRONMENT === 'local'
        ? 'gamo_local_dev_fallback_secret_min_32_bytes_change_in_prod'
        : undefined);

    const auth = await requireAuth(context.request, db, signingSecret);

    return jsonResponse(
      {
        user: {
          id: auth.user.id,
          email: auth.user.email,
          displayName: auth.user.displayName,
          verifiedEmailAt: auth.user.verifiedEmailAt ? auth.user.verifiedEmailAt.toISOString() : null,
          status: auth.user.status,
          createdAt: auth.user.createdAt.toISOString(),
        },
        sessionId: auth.sessionId,
        roles: auth.roles,
        memberships: auth.memberships.map((m) => ({
          organizationId: m.organizationId,
          organizationName: m.orgName,
          organizationSlug: m.orgSlug,
          organizationType: m.orgType as 'church' | 'ministry' | 'school' | 'sponsor' | 'other',
          role: m.role as 'owner' | 'admin' | 'coordinator' | 'member',
          status: m.status,
        })),
      },
      200
    );
  } catch (err) {
    return handleApiError(err);
  }
};

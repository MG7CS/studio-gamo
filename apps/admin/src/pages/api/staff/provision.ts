import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { requireSuperadmin, verifyStaffBoundaryIdentity } from '@gamo/auth';
import {
  IdentityService,
  provisionStaffSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';

export const prerender = false;

/**
 * POST /api/staff/provision — Provisions a staff role and binds the immutable Cloudflare Access subject (sub) in D1.
 *
 * Restricted to active `superadmin` users behind the Admin Access boundary.
 */
export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const signingSecret =
      runtimeEnv.SESSION_SECRET ||
      import.meta.env?.SESSION_SECRET ||
      (globalThis as Record<string, any>).process?.env?.SESSION_SECRET;

    const auth = await requireSuperadmin(context.request, db, signingSecret);
    await verifyStaffBoundaryIdentity(db, auth, context.locals as Record<string, any>);

    const body = await readContract(context.request, 'ProvisionStaffInput');
    const validated = provisionStaffSchema.parse(body);

    const identityService = new IdentityService(db);
    const provisioned = await identityService.provisionStaffIdentity(auth.user.id, validated);

    return jsonResponse(
      {
        user: provisioned.user,
        role: provisioned.role,
        provider: provisioned.provider,
        accessSubject: provisioned.accessSubject,
        message: `Staff identity provisioned with role ${provisioned.role}.`,
      },
      200
    );
  } catch (err) {
    return handleApiError(err);
  }
};

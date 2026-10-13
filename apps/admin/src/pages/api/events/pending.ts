import { requireStaff, verifyStaffBoundaryIdentity } from '@gamo/auth';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { AdminService, jsonResponse, handleApiError } from '@gamo/domain';

export const prerender = false;

/**
 * GET /api/events/pending — Lists Christian events awaiting staff moderation.
 * Access is protected by middleware/auth.
 */
export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
    const db = getDb(runtimeEnv.DB);
    const auth = await requireStaff(context.request, db, runtimeEnv.SESSION_SECRET);
    await verifyStaffBoundaryIdentity(db, auth, context.locals as Record<string, any>);
    const adminService = new AdminService(db);

    const pending = await adminService.getPendingReviewEvents();
    return jsonResponse(pending, 200, { total: pending.length });
  } catch (err) {
    return handleApiError(err);
  }
};

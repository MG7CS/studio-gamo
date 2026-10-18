import { requireStaff, verifyStaffBoundaryIdentity } from '@gamo/auth';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { AdminService, jsonResponse, handleApiError, getRuntimeEnv } from '@gamo/domain';

export const prerender = false;

/**
 * GET /api/events/pending — Lists Christian events awaiting staff moderation.
 * Access is protected by middleware/auth.
 */
export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const auth = await requireStaff(context.request, db, runtimeEnv.SESSION_SECRET);
    await verifyStaffBoundaryIdentity(db, auth, context.locals);
    const adminService = new AdminService(db);

    const pending = await adminService.getPendingReviewEvents();
    return jsonResponse(pending, 200, { total: pending.length });
  } catch (err) {
    return handleApiError(err);
  }
};

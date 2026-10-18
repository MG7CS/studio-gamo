import type { APIRoute } from 'astro';
import { requireStaff, verifyStaffBoundaryIdentity } from '@gamo/auth';
import { getDb } from '@gamo/db';
import { ParticipationService, getRuntimeEnv, handleApiError, jsonResponse } from '@gamo/domain';
export const prerender = false;
export const GET: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context);
    const db = getDb(env.DB);
    const auth = await requireStaff(context.request, db, env.SESSION_SECRET);
    await verifyStaffBoundaryIdentity(db, auth, context.locals as Record<string, any>);
    return jsonResponse({ inquiries: await new ParticipationService(db).list() }, 200, undefined, {
      'Cache-Control': 'no-store',
    });
  } catch (error) {
    return handleApiError(error);
  }
};

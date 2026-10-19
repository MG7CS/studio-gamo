import { requireStaff, verifyStaffBoundaryIdentity } from '@gamo/auth';
import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  AdminService,
  reviewDecisionSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';

export const prerender = false;

/**
 * POST /api/events/[id]/review — Staff moderation decision for submitted Christian events.
 *
 * Requirements:
 * - Validates decision ('approved' | 'rejected') and optional notes.
 * - Updates event status in D1.
 * - Records moderation review entry.
 * - Writes immutable audit log.
 */
export const POST: APIRoute = async (context) => {
  try {
    const eventId = validateContract('Identifier', context.params.id) as string;

    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const auth = await requireStaff(context.request, db, runtimeEnv.SESSION_SECRET);
    await verifyStaffBoundaryIdentity(db, auth, context.locals);
    const adminService = new AdminService(db);

    const body = await readContract(context.request, 'ReviewDecision');
    const validated = reviewDecisionSchema.parse(body);

    const reviewerUserId = auth.user.id;

    const { event, reviewId } = await adminService.reviewEvent(reviewerUserId, eventId, validated);

    return jsonResponse(
      {
        event,
        reviewId,
        message: `Event has been successfully ${event.status}.`,
      },
      200,
    );
  } catch (err) {
    return handleApiError(err);
  }
};

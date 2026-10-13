import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { LiveService, jsonResponse, errorResponse, handleApiError } from '@gamo/domain';

export const prerender = false;

/**
 * GET /api/events/[id] — Retrieves full event details and ticket tiers.
 */
export const GET: APIRoute = async (context) => {
  try {
    const id = context.params.id;
    if (!id) {
      return errorResponse('BAD_REQUEST', 'Event identifier is required.', 400);
    }

    const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const event = await liveService.getEvent(id);
    if (!event || event.status !== 'approved') {
      return errorResponse('NOT_FOUND', `Event ${id} not found.`, 404);
    }

    return jsonResponse(event);
  } catch (err) {
    return handleApiError(err);
  }
};

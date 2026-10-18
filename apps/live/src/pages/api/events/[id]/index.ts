import { validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { LiveService, jsonResponse, errorResponse, handleApiError, getRuntimeEnv } from '@gamo/domain';

export const prerender = false;

/**
 * GET /api/events/[id] — Retrieves full event details and ticket tiers.
 */
export const GET: APIRoute = async (context) => {
  try {
    const id = validateContract('Identifier', context.params.id) as string;

    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const event = await liveService.getEvent(id);
    if (!event || event.status !== 'approved') {
      return errorResponse('NOT_FOUND', 'Event not found.', 404);
    }

    return jsonResponse(event);
  } catch (err) {
    return handleApiError(err);
  }
};

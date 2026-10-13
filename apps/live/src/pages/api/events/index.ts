import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  createEventSchema,
  jsonResponse,
  handleApiError,
  errorResponse,
} from '@gamo/domain';
import { resolveAuth } from '@gamo/auth';

export const prerender = false;

/**
 * GET /api/events — Lists approved, discoverable Christian events.
 */
export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const url = new URL(context.request.url);
    const category = url.searchParams.get('category') || undefined;
    const city = url.searchParams.get('city') || undefined;

    const events = await liveService.listDiscoverableEvents({
      category,
      city,
    });

    return jsonResponse(events, 200, { total: events.length });
  } catch (err) {
    return handleApiError(err);
  }
};

/**
 * POST /api/events — Creates a new Christian event proposal in `pending_review` status.
 *
 * Requirements:
 * - Validates input with Zod schema.
 * - Authenticates caller or demo organizer persona.
 * - Persists event and ticket tiers to D1.
 * - Enters `pending_review` status awaiting staff moderation.
 */
export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = (context.locals as Record<string, any>)?.runtime?.env ?? {};
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const body = await context.request.json().catch(() => ({}));
    const validated = createEventSchema.parse(body);

    // Verify authenticated session or authorized organizer in development
    const auth = await resolveAuth(context.request, db, runtimeEnv.SESSION_SECRET);
    const isDev = Boolean(import.meta.env?.DEV);

    if (!auth && !isDev && !context.request.headers.get('x-demo-organizer')) {
      return errorResponse(
        'UNAUTHENTICATED',
        'Authentication required to propose Christian gatherings on Gamo Live.',
        401
      );
    }

    const { event, tiers } = await liveService.createEvent(validated.organizationId, validated);

    return jsonResponse(
      {
        event,
        tiers,
        message: 'Event submitted successfully. Awaiting staff review before publication.',
      },
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
};

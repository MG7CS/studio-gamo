import { readContract, validateContract, ContractValidationError } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  createEventSchema,
  jsonResponse,
  handleApiError,
  errorResponse,
} from '@gamo/domain';
import { requireOrgAccess } from '@gamo/auth';

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
    if (new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length) throw new ContractValidationError();
    const { category, city } = validateContract('EventFilters', Object.fromEntries(url.searchParams));

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

    const body = await readContract(context.request, 'CreateEvent');
    const validated = createEventSchema.parse(body);

    await requireOrgAccess(context.request, db, validated.organizationId, ['owner', 'admin'], runtimeEnv.SESSION_SECRET);

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

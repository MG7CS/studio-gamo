import { readContract, validateContract, ContractValidationError } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  createEventSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import { requireOrgAccess, requireVerifiedAuth } from '@gamo/auth';

export const prerender = false;

/**
 * GET /api/events — Lists approved, discoverable Christian events.
 */
export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const url = new URL(context.request.url);
    if (new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length) throw new ContractValidationError();
    const { category, city, metro, artist, venue, q, dateFrom, dateTo, weekend } = validateContract(
      'EventFilters',
      Object.fromEntries(url.searchParams)
    ) as {
      category?: string;
      city?: string;
      metro?: string;
      artist?: string;
      venue?: string;
      q?: string;
      dateFrom?: string;
      dateTo?: string;
      weekend?: string;
    };

    const parsedDateFrom = dateFrom ? new Date(dateFrom) : undefined;
    if (parsedDateFrom && !Number.isFinite(parsedDateFrom.getTime())) {
      throw new ContractValidationError();
    }

    const parsedDateTo = dateTo ? new Date(dateTo) : undefined;
    if (parsedDateTo && !Number.isFinite(parsedDateTo.getTime())) {
      throw new ContractValidationError();
    }

    const parsedWeekend =
      weekend === 'true' || weekend === '1'
        ? true
        : weekend === 'false' || weekend === '0'
          ? false
          : undefined;

    const events = await liveService.listDiscoverableEvents({
      category,
      city,
      metro,
      artist,
      venue,
      q,
      dateFrom: parsedDateFrom,
      dateTo: parsedDateTo,
      weekend: parsedWeekend,
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
 * - Authenticates the verified organization owner or administrator.
 * - Persists event and ticket tiers to D1.
 * - Enters `pending_review` status awaiting staff moderation.
 */
export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const body = await readContract(context.request, 'CreateEvent');
    const validated = createEventSchema.parse(body);

    const authOpts = { secret: runtimeEnv.SESSION_SECRET, product: 'live' as const, env: runtimeEnv };
    await requireVerifiedAuth(context.request, db, authOpts);
    await requireOrgAccess(context.request, db, validated.organizationId, ['owner', 'admin'], authOpts);

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

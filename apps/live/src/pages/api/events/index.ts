import { readContract, validateContract, ContractValidationError } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  TicketingError,
  createEventSchema,
  createOrganizerEvent,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
  nowSeconds,
  ticketingDb,
  ticketingErrorResponse,
  type EventInput,
} from '@gamo/domain';
import { requireOrgAccess, requireProductAuth, requireSameOrigin } from '@gamo/auth';

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
    if (new Set(url.searchParams.keys()).size !== [...url.searchParams.keys()].length)
      throw new ContractValidationError();
    const { category, city, metro, artist, venue, q, dateFrom, dateTo, weekend } = validateContract(
      'EventFilters',
      Object.fromEntries(url.searchParams),
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
 * POST /api/events — creates an event. The organizer form shape (venue-local `start`, `policy`,
 * `categories`) goes through `createOrganizerEvent` (first event → review, later ones publish once an
 * earlier event was approved); the older `startsAt` shape still goes to staff review.
 */
export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const authOpts = { secret: runtimeEnv.SESSION_SECRET, product: 'live' as const, env: runtimeEnv };
    await requireProductAuth(context.request, db, 'live', authOpts);
    requireSameOrigin(context.request);

    const body = (await readContract(context.request, 'EventCreateRequest')) as unknown as Record<
      string,
      unknown
    >;
    if (body && typeof body === 'object' && 'start' in body) {
      const input = body as unknown as EventInput & { organizationId?: string };
      if (!input.organizationId)
        throw new TicketingError('VALIDATION', 'Choose the organization this event belongs to.');
      const auth = await requireOrgAccess(
        context.request,
        db,
        input.organizationId,
        ['owner', 'admin'],
        authOpts,
      );
      const saved = await createOrganizerEvent(ticketingDb(runtimeEnv as Record<string, unknown>), {
        event: { ...input, policy: input.policy ?? {}, organizationId: input.organizationId },
        actorUserId: auth.user.id,
        now: nowSeconds(),
      });
      return jsonResponse(
        {
          ...saved,
          message:
            saved.status === 'approved'
              ? 'Event published.'
              : 'Event submitted. Staff review your first event before it is published.',
        },
        201,
      );
    }
    const validated = createEventSchema.parse(body);
    await requireOrgAccess(context.request, db, validated.organizationId, ['owner', 'admin'], authOpts);
    const { event, tiers } = await new LiveService(db).createEvent(validated.organizationId, validated);
    return jsonResponse(
      { event, tiers, message: 'Event submitted successfully. Awaiting staff review before publication.' },
      201,
    );
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};

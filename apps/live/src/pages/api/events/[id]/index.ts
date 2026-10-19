import { validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  jsonResponse,
  errorResponse,
  handleApiError,
  getRuntimeEnv,
  loadEvent,
  nowSeconds,
  ticketingDb,
  ticketingErrorResponse,
  updateOrganizerEvent,
  TicketingError,
  type EventInput,
} from '@gamo/domain';
import { readContract } from '@gamo/api-contracts/runtime';
import { requireSameOrigin } from '@gamo/auth';
import { NO_STORE, requireEventAuthority } from '../../../../lib/ticketing-api';

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

/** PATCH /api/events/[id] — organizer edit of details, policies and categories. */
export const PATCH: APIRoute = async (context) => {
  try {
    const id = validateContract('Identifier', context.params.id) as string;
    const { auth, env } = await requireEventAuthority(context, id, ['edit_content', 'manage_ticketing']);
    requireSameOrigin(context.request);
    const body = (await readContract(context.request, 'EventEditInput')) as unknown as EventInput;
    const db = ticketingDb(env);
    const event = await loadEvent(db, id);
    if (!event) throw new TicketingError('NOT_FOUND', 'Event not found.');
    const saved = await updateOrganizerEvent(db, {
      eventId: event.id,
      event: { ...body, organizationId: body.organizationId ?? '', policy: body.policy ?? {} },
      actorUserId: auth.user.id,
      now: nowSeconds(),
    });
    return jsonResponse(
      {
        ...saved,
        slug: event.slug,
        status: saved.status === 'approved' ? 'approved' : 'pending_review',
        message: saved.movedToReview
          ? 'Changes saved. Because you changed public details, staff review the event again before it is shown and tickets are sold. Tickets already issued stay valid.'
          : 'Changes saved.',
      },
      200,
      undefined,
      NO_STORE,
    );
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};

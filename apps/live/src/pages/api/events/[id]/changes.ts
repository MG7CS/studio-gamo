import type { APIRoute } from 'astro';
import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import { requireSameOrigin } from '@gamo/auth';
import {
  cancelEvent,
  changeEventVenue,
  jsonResponse,
  nowSeconds,
  requestOrigin,
  rescheduleEvent,
  ticketingDb,
  ticketingErrorResponse,
} from '@gamo/domain';
import { NO_STORE, requireEventAuthority } from '../../../../lib/ticketing-api';

export const prerender = false;

type ChangeBody = {
  kind: 'cancelled' | 'rescheduled' | 'venue_changed';
  reason?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  timezone?: string;
  venueName?: string;
  address?: string;
  city?: string;
  state?: string;
};

/** POST /api/events/{id}/changes — cancel, reschedule or move the venue (holders are emailed). */
export const POST: APIRoute = async (context) => {
  try {
    const eventId = validateContract('Identifier', context.params.id) as string;
    const { env } = await requireEventAuthority(context, eventId, []);
    requireSameOrigin(context.request);
    const body = (await readContract(context.request, 'EventChangeInput')) as ChangeBody;
    const permissions =
      body.kind === 'cancelled'
        ? (['manage_ticketing', 'approve_refunds'] as const)
        : (['edit_content'] as const);
    const { auth } = await requireEventAuthority(context, eventId, [...permissions]);
    const db = ticketingDb(env);
    const base = {
      eventId,
      actorUserId: auth.user.id,
      origin: requestOrigin(context.request),
      now: nowSeconds(),
    };
    if (body.kind === 'cancelled')
      return jsonResponse(
        await cancelEvent(db, env, { ...base, reason: body.reason ?? '' }),
        200,
        undefined,
        NO_STORE,
      );
    if (body.kind === 'rescheduled')
      return jsonResponse(
        await rescheduleEvent(db, env, {
          ...base,
          startDate: body.startDate ?? '',
          startTime: body.startTime ?? '',
          endDate: body.endDate || null,
          endTime: body.endTime || null,
          timezone: body.timezone ?? '',
        }),
        200,
        undefined,
        NO_STORE,
      );
    return jsonResponse(
      await changeEventVenue(db, env, {
        ...base,
        venueName: body.venueName ?? '',
        address: body.address ?? null,
        city: body.city ?? '',
        state: body.state ?? '',
      }),
      200,
      undefined,
      NO_STORE,
    );
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};

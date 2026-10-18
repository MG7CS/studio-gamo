import type { APIRoute } from 'astro';
import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import { requireSameOrigin } from '@gamo/auth';
import {
  TicketingError,
  getRuntimeEnv,
  jsonResponse,
  loadTicket,
  nowSeconds,
  reissueTicket,
  requestOrigin,
  ticketingDb,
  ticketingErrorResponse,
} from '@gamo/domain';
import { NO_STORE, requireEventAuthority } from '../../../../lib/ticketing-api';

export const prerender = false;

/** POST /api/tickets/{id}/reissue — organizer/staff reissue with a reason (manage_ticketing). */
export const POST: APIRoute = async (context) => {
  try {
    const ticketId = validateContract('Identifier', context.params.id) as string;
    const env0 = (await getRuntimeEnv(context)) as Record<string, unknown>;
    const ticket = await loadTicket(ticketingDb(env0), ticketId);
    const { auth, env } = await requireEventAuthority(context, ticket?.event_id ?? '', []);
    if (!ticket) throw new TicketingError('NOT_FOUND', 'Ticket not found.');
    await requireEventAuthority(context, ticket.event_id, ['manage_ticketing']);
    requireSameOrigin(context.request);
    const body = (await readContract(context.request, 'ReissueInput')) as { reason: string };
    const result = await reissueTicket(ticketingDb(env), env, {
      ticketId,
      reason: body.reason,
      actorUserId: auth.user.id,
      actorType: auth.roles.includes('superadmin') ? 'staff' : 'organizer',
      origin: requestOrigin(context.request),
      now: nowSeconds(),
    });
    return jsonResponse(result, 200, undefined, NO_STORE);
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};

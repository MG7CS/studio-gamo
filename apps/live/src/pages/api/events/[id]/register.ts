import type { APIRoute } from 'astro';
import { validateContract } from '@gamo/api-contracts/runtime';
import { ticketingErrorResponse } from '@gamo/domain';
import { handleOrderPost } from '../../../../lib/ticketing-api';

export const prerender = false;

/**
 * POST /api/events/{id}/register — free RSVP (design §4.2): holds the tickets and emails a code and a
 * confirm link; tickets are issued on confirmation. Same answer whether or not the address has tickets.
 */
export const POST: APIRoute = async (context) => {
  try {
    const eventId = validateContract('Identifier', context.params.id) as string;
    return handleOrderPost(context, { eventId, allow: 'free', contract: 'OrderInput' });
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};

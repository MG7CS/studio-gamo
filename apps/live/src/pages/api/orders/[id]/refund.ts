import type { APIRoute } from 'astro';
import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import { requireSameOrigin } from '@gamo/auth';
import {
  TicketingError,
  jsonResponse,
  loadOrder,
  nowSeconds,
  refundTickets,
  requestOrigin,
  ticketingDb,
  ticketingErrorResponse,
} from '@gamo/domain';
import { NO_STORE, requireEventAuthority } from '../../../../lib/ticketing-api';
import { getRuntimeEnv } from '@gamo/domain';

export const prerender = false;

/** POST /api/orders/{id}/refund — refund (paid) or cancel (free) chosen tickets; approve_refunds required. */
export const POST: APIRoute = async (context) => {
  try {
    const orderId = validateContract('Identifier', context.params.id) as string;
    const env0 = await getRuntimeEnv(context);
    const order = await loadOrder(ticketingDb(env0 as Record<string, unknown>), orderId);
    // Authentication first (an anonymous caller learns nothing about the order).
    const { auth, env } = await requireEventAuthority(context, order?.event_id ?? '', []);
    if (!order) throw new TicketingError('NOT_FOUND', 'Order not found.');
    await requireEventAuthority(context, order.event_id, ['approve_refunds']);
    requireSameOrigin(context.request);
    const body = (await readContract(context.request, 'RefundInput')) as {
      ticketIds?: string[];
      reason: string;
    };
    const result = await refundTickets(ticketingDb(env), env, {
      orderId,
      ticketIds: body.ticketIds,
      reason: body.reason,
      actorUserId: auth.user.id,
      now: nowSeconds(),
      origin: requestOrigin(context.request),
    });
    return jsonResponse(result, 200, undefined, NO_STORE);
  } catch (err) {
    return ticketingErrorResponse(err);
  }
};

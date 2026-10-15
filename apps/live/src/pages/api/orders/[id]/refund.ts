import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  orderRefundSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import { requireVerifiedAuth, requireEventPermission } from '@gamo/auth';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const orderId = validateContract('Identifier', context.params.id) as string;

    const body = await readContract(context.request, 'OrderRefundInput');
    const validated = orderRefundSchema.parse(body);

    const auth = await requireVerifiedAuth(context.request, db, runtimeEnv.SESSION_SECRET);
    const liveService = new LiveService(db);
    const order = await liveService.getTicketOrder(orderId);

    if (!order) {
      return handleApiError(new Error('NOT_FOUND: Ticket order not found.'));
    }

    // Publishing/content authority never implies refund approval authority;
    // require explicit approve_refunds permission on the event.
    await requireEventPermission(db, auth, order.eventId, 'approve_refunds');

    const result = await liveService.refundTicketOrder(
      orderId,
      auth.user.id,
      validated
    );

    return jsonResponse(result, 200);
  } catch (err) {
    return handleApiError(err);
  }
};

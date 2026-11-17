import type { APIRoute } from 'astro';
import { adminApi } from '../../../../lib/admin-page';
import { domainErrorResponse } from '../../../../lib/domain-errors';
import { handleWithdrawOffer } from '../../../../lib/worship/http';

export const prerender = false;

/**
 * POST /api/offers/{id}/withdraw (operationId `withdrawOffer`): revokes a pending offer's link. Repeating it
 * answers 200 unchanged; an offer the musician already answered is a 409.
 */
export const POST: APIRoute = async (context) => {
  try {
    const admin = await adminApi(context);
    return await handleWithdrawOffer(admin, context.request, context.params.id ?? '');
  } catch (err) {
    return domainErrorResponse(err);
  }
};

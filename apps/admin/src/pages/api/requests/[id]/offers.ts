import type { APIRoute } from 'astro';
import { adminApi } from '../../../../lib/admin-page';
import { domainErrorResponse } from '../../../../lib/domain-errors';
import { handleSendOffer } from '../../../../lib/worship/http';

export const prerender = false;

/**
 * POST /api/requests/{id}/offers (operationId `sendOffer`): creates a pending offer for the service request
 * and emails the musician a private link. Staff session and same origin are checked by `adminApi`. The
 * answer carries the offer id and expiry only; the link and token are never returned or logged.
 */
export const POST: APIRoute = async (context) => {
  try {
    const admin = await adminApi(context);
    return await handleSendOffer(admin, context.request, context.params.id ?? '');
  } catch (err) {
    return domainErrorResponse(err);
  }
};

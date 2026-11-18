import type { APIRoute } from 'astro';
import { errorResponse } from '@gamo/domain';
import { adminApi } from '../../../../lib/admin-page';
import { domainErrorResponse } from '../../../../lib/domain-errors';
import { handleSendOffer } from '../../../../lib/worship/http';

export const prerender = false;

/**
 * Offer emails link to `/worship/offers/{token}` on the main site. Until that page (and its POST) exists
 * the link is a 404 and the token cannot be re-sent, so sending fails closed. Remove this switch in the same
 * change that adds `apps/web/src/pages/worship/offers/[token].astro` (`scripts/audit/offer-page-gate.test.ts` fails otherwise).
 */
const OFFER_PAGE_LIVE = false;

/**
 * POST /api/requests/{id}/offers (operationId `sendOffer`): creates a pending offer for the service request
 * and emails the musician a private link. Staff session and same origin are checked by `adminApi`. The
 * answer carries the offer id and expiry only; the link and token are never returned or logged.
 */
export const POST: APIRoute = async (context) => {
  try {
    const admin = await adminApi(context);
    if (!OFFER_PAGE_LIVE)
      return errorResponse(
        'UNAVAILABLE',
        'Offers cannot be sent yet: the musician response page is not live.',
        503,
      );
    return await handleSendOffer(admin, context.request, context.params.id ?? '');
  } catch (err) {
    return domainErrorResponse(err);
  }
};

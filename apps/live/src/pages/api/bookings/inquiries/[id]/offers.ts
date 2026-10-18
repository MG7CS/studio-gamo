import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  proposeBookingOfferSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import {
  requireProductAuth,
  hasOrgRole,
  hasEventPermission,
  hasRepresentationAuthority,
  AuthError,
} from '@gamo/auth';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const auth = await requireProductAuth(context.request, db, 'live', {
      secret: runtimeEnv.SESSION_SECRET,
      product: 'live',
      env: runtimeEnv,
    });
    const inquiryId = validateContract('Identifier', context.params.id) as string;

    const body = await readContract(context.request, 'ProposeBookingOfferInput');
    const validated = proposeBookingOfferSchema.parse(body);

    const liveService = new LiveService(db);
    const ctx = await liveService.getBookingInquiryContext(inquiryId);

    if (!ctx) {
      return handleApiError(new Error('NOT_FOUND: Booking inquiry not found.'));
    }

    const repAuth = await hasRepresentationAuthority(db, auth, ctx.inquiry.artistId, 'negotiation');
    let offeredByRole: 'organizer' | 'artist' | 'representative' | null = repAuth.actorKind;

    if (!offeredByRole) {
      const orgAllowed = ctx.organizer
        ? hasOrgRole(auth, ctx.organizer.organizationId, ['owner', 'admin'])
        : false;
      const eventAllowed = ctx.inquiry.eventId
        ? await hasEventPermission(db, auth, ctx.inquiry.eventId, 'negotiate_booking')
        : false;

      if (orgAllowed || eventAllowed) {
        offeredByRole = 'organizer';
      }
    }

    if (!offeredByRole) {
      throw new AuthError(
        'FORBIDDEN',
        'You do not have negotiation authority for this booking inquiry.',
        403,
      );
    }

    const result = await liveService.proposeBookingOffer(inquiryId, auth.user.id, offeredByRole, validated);

    return jsonResponse(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
};

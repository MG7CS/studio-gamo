import { validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import {
  requireVerifiedAuth,
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
    const offerId = validateContract('Identifier', context.params.id) as string;

    const auth = await requireVerifiedAuth(context.request, db, runtimeEnv.SESSION_SECRET);
    const liveService = new LiveService(db);
    const ctx = await liveService.getBookingOfferContext(offerId);

    if (!ctx) {
      return handleApiError(new Error('NOT_FOUND: Booking offer not found.'));
    }

    let actorRole: 'organizer' | 'artist' | 'representative' | null = null;
    let repContext: { representativeId?: string; authorizationId?: string } | undefined;

    if (ctx.offer.offeredByRole === 'organizer') {
      const repAuth = await hasRepresentationAuthority(db, auth, ctx.inquiry.artistId, 'negotiation');
      if (repAuth.authorized && repAuth.actorKind) {
        actorRole = repAuth.actorKind;
        repContext = {
          representativeId: repAuth.representativeId,
          authorizationId: repAuth.authorizationId,
        };
      }
    } else {
      const orgAllowed = ctx.organizer
        ? hasOrgRole(auth, ctx.organizer.organizationId, ['owner', 'admin'])
        : false;
      const eventAllowed = ctx.inquiry.eventId
        ? await hasEventPermission(db, auth, ctx.inquiry.eventId, 'negotiate_booking')
        : false;

      if (orgAllowed || eventAllowed) {
        actorRole = 'organizer';
      }
    }

    if (!actorRole) {
      throw new AuthError(
        'FORBIDDEN',
        'Only an authorized counterparty may accept this booking offer.',
        403
      );
    }

    const result = await liveService.acceptBookingOffer(
      offerId,
      auth.user.id,
      actorRole,
      repContext
    );

    return jsonResponse(result, 200);
  } catch (err) {
    return handleApiError(err);
  }
};

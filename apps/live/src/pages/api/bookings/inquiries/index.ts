import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  createBookingInquirySchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import { requireProductAuth, hasOrgRole, hasEventPermission, AuthError } from '@gamo/auth';

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

    const body = await readContract(context.request, 'CreateBookingInquiryInput');
    const validated = createBookingInquirySchema.parse(body);

    const orgAllowed = hasOrgRole(auth, validated.organizationId, ['owner', 'admin']);
    const eventAllowed = validated.eventId
      ? await hasEventPermission(db, auth, validated.eventId, 'negotiate_booking')
      : false;

    if (!orgAllowed && !eventAllowed) {
      throw new AuthError(
        'FORBIDDEN',
        'Organization or event booking negotiation authority is required.',
        403,
      );
    }

    const liveService = new LiveService(db);
    const result = await liveService.createBookingInquiry(auth.user.id, validated);

    return jsonResponse(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
};

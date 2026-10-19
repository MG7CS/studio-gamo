import type { APIRoute } from 'astro';
import { requireStaff, verifyStaffBoundaryIdentity } from '@gamo/auth';
import { getDb } from '@gamo/db';
import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import {
  ParticipationService,
  participationReviewSchema,
  getRuntimeEnv,
  handleApiError,
  jsonResponse,
} from '@gamo/domain';
export const prerender = false;
export const POST: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context);
    const db = getDb(env.DB);
    const auth = await requireStaff(context.request, db, env.SESSION_SECRET);
    await verifyStaffBoundaryIdentity(db, auth, context.locals);
    const input = participationReviewSchema.parse(
      await readContract(context.request, 'ParticipationReviewInput'),
    );
    return jsonResponse(
      {
        inquiry: await new ParticipationService(db).review(
          validateContract('Identifier', context.params.id) as string,
          auth.user.id,
          input,
        ),
      },
      200,
      undefined,
      { 'Cache-Control': 'no-store' },
    );
  } catch (error) {
    return handleApiError(error);
  }
};

import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  assignEventTeamMemberSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import { requireProductAuth, requireEventPermission, hasEventPermission } from '@gamo/auth';

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
    const eventId = validateContract('Identifier', context.params.id) as string;

    const body = await readContract(context.request, 'AssignEventTeamInput');
    const validated = assignEventTeamMemberSchema.parse(body);

    await requireEventPermission(db, auth, eventId, 'edit_content');

    // Only someone who already holds approve_refunds AND view_settlement (e.g. primary owner or superadmin)
    // can grant refund approval or settlement access to another team member.
    const actorCanGrantFinancialAuthority =
      (await hasEventPermission(db, auth, eventId, 'approve_refunds')) &&
      (await hasEventPermission(db, auth, eventId, 'view_settlement'));

    const liveService = new LiveService(db);
    const result = await liveService.assignEventTeamMember(
      eventId,
      auth.user.id,
      actorCanGrantFinancialAuthority,
      validated,
    );

    return jsonResponse(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
};

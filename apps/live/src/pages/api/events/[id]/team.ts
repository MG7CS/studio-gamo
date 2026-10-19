import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  assignEventTeamMemberSchema,
  revokeEventTeamMemberSchema,
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

    // Only someone who already holds approve_refunds AND view_settlement (e.g. the primary owner)
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
      await liveService.isOrgOwnerOrAdmin(auth, eventId),
    );

    return jsonResponse(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
};

/** DELETE /api/events/{id}/team — revoke a team member's role (owner/admin only). */
export const DELETE: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const auth = await requireProductAuth(context.request, db, 'live', {
      secret: runtimeEnv.SESSION_SECRET,
      product: 'live',
      env: runtimeEnv,
    });
    const eventId = validateContract('Identifier', context.params.id) as string;
    const body = await readContract(context.request, 'RevokeEventTeamInput');
    const validated = revokeEventTeamMemberSchema.parse(body);
    await requireEventPermission(db, auth, eventId, 'edit_content');
    const liveService = new LiveService(db);
    const result = await liveService.revokeEventTeamMember(
      eventId,
      auth.user.id,
      await liveService.isOrgOwnerOrAdmin(auth, eventId),
      validated,
    );
    return jsonResponse(result, 200);
  } catch (err) {
    return handleApiError(err);
  }
};

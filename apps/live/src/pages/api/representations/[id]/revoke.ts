import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  revokeRepresentationSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import { requireProductAuth } from '@gamo/auth';

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
    const authorizationId = validateContract('Identifier', context.params.id) as string;

    const body = await readContract(context.request, 'RevokeRepresentationInput');
    const validated = revokeRepresentationSchema.parse(body);

    const liveService = new LiveService(db);
    const result = await liveService.revokeRepresentation(authorizationId, auth.user.id, validated.reason);

    return jsonResponse(result, 200);
  } catch (err) {
    return handleApiError(err);
  }
};

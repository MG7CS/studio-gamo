import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  authorizeRepresentativeSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import { requireProductAuth, hasSystemRole } from '@gamo/auth';

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
    const artistId = validateContract('Identifier', context.params.id) as string;

    const body = await readContract(context.request, 'AuthorizeRepresentativeInput');
    const validated = authorizeRepresentativeSchema.parse(body);

    const isSuperadmin = hasSystemRole(auth, 'superadmin');

    const liveService = new LiveService(db);
    const result = await liveService.authorizeRepresentative(artistId, auth.user.id, isSuperadmin, validated);

    return jsonResponse(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
};

import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  createArtistProfileSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import { requireVerifiedAuth } from '@gamo/auth';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const liveService = new LiveService(db);

    const artists = await liveService.listArtists();
    return jsonResponse(artists, 200, { total: artists.length });
  } catch (err) {
    return handleApiError(err);
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);

    const body = await readContract(context.request, 'CreateArtistInput');
    const validated = createArtistProfileSchema.parse(body);

    const auth = await requireVerifiedAuth(context.request, db, {
      secret: runtimeEnv.SESSION_SECRET,
      product: 'live',
      env: runtimeEnv,
    });

    const liveService = new LiveService(db);
    const created = await liveService.createArtistProfile(auth.user.id, validated);

    return jsonResponse(created, 201);
  } catch (err) {
    return handleApiError(err);
  }
};

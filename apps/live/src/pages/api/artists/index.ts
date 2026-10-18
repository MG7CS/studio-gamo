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
import { requireProductAuth } from '@gamo/auth';

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
    const auth = await requireProductAuth(context.request, db, 'live', {
      secret: runtimeEnv.SESSION_SECRET,
      product: 'live',
      env: runtimeEnv,
    });

    const body = await readContract(context.request, 'CreateArtistInput');
    const validated = createArtistProfileSchema.parse(body);

    const liveService = new LiveService(db);
    const created = await liveService.createArtistProfile(auth.user.id, validated);

    return jsonResponse(created, 201);
  } catch (err) {
    return handleApiError(err);
  }
};

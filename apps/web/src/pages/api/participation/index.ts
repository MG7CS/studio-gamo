import type { APIRoute } from 'astro';
import { requireVerifiedAuth } from '@gamo/auth';
import { getDb } from '@gamo/db';
import { readContract } from '@gamo/api-contracts/runtime';
import { ParticipationService, participationInputSchema, getRuntimeEnv, handleApiError, jsonResponse } from '@gamo/domain';
export const prerender = false;
export const GET: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context); const db = getDb(env.DB);
    const auth = await requireVerifiedAuth(context.request, db, env.SESSION_SECRET);
    return jsonResponse({ inquiries: await new ParticipationService(db).list(auth.user.id) }, 200, undefined, { 'Cache-Control': 'no-store' });
  } catch (error) { return handleApiError(error); }
};
export const POST: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context); const db = getDb(env.DB);
    const auth = await requireVerifiedAuth(context.request, db, env.SESSION_SECRET);
    const input = participationInputSchema.parse(await readContract(context.request, 'ParticipationInput'));
    return jsonResponse({ inquiry: await new ParticipationService(db).create(auth.user.id, input) }, 201, undefined, { 'Cache-Control': 'no-store' });
  } catch (error) { return handleApiError(error); }
};

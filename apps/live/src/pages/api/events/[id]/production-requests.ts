import { readContract, validateContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  createEventProductionRequestSchema,
  jsonResponse,
  handleApiError,
  getRuntimeEnv,
} from '@gamo/domain';
import { requireProductAuth, requireEventPermission, hasEventPermission, AuthError } from '@gamo/auth';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);
    const auth = await requireProductAuth(context.request, db, 'live', {
      secret: runtimeEnv.SESSION_SECRET,
      product: 'live',
      env: runtimeEnv,
    });
    const eventId = validateContract('Identifier', context.params.id) as string;

    const canProd = await hasEventPermission(db, auth, eventId, 'coordinate_production');
    const canEdit = await hasEventPermission(db, auth, eventId, 'edit_content');
    if (!canProd && !canEdit) {
      throw new AuthError('FORBIDDEN', 'Production coordination permission required for this event.', 403);
    }

    const liveService = new LiveService(db);
    const items = await liveService.listEventProductionRequests(eventId);
    return jsonResponse(items, 200, { total: items.length });
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
    const eventId = validateContract('Identifier', context.params.id) as string;

    const body = await readContract(context.request, 'CreateEventProductionRequestInput');
    const validated = createEventProductionRequestSchema.parse(body);

    await requireEventPermission(db, auth, eventId, 'coordinate_production');

    const liveService = new LiveService(db);
    const created = await liveService.createEventProductionRequest(eventId, auth.user.id, validated);

    return jsonResponse(created, 201);
  } catch (err) {
    return handleApiError(err);
  }
};

import { readContract } from '@gamo/api-contracts/runtime';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { LiveService, ticketScanSchema, jsonResponse, handleApiError, getRuntimeEnv } from '@gamo/domain';
import { requireVerifiedAuth, requireEventPermission } from '@gamo/auth';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);

    const body = await readContract(context.request, 'TicketScanInput');
    const validated = ticketScanSchema.parse(body);

    const auth = await requireVerifiedAuth(context.request, db, {
      secret: runtimeEnv.SESSION_SECRET,
      product: 'live',
      env: runtimeEnv,
    });
    await requireEventPermission(db, auth, validated.eventId, 'scan_tickets');

    const liveService = new LiveService(db);
    const result = await liveService.scanTicketPass(auth.user.id, validated);

    return jsonResponse(result, 200);
  } catch (err) {
    return handleApiError(err);
  }
};

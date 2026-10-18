import { readContract } from '@gamo/api-contracts/runtime';
import { requireSameOrigin } from '@gamo/auth';
import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import { LiveService, ticketLookupSchema, jsonResponse, handleApiError, getRuntimeEnv } from '@gamo/domain';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  try {
    requireSameOrigin(context.request);
    const runtimeEnv = await getRuntimeEnv(context);
    const db = getDb(runtimeEnv.DB);

    const body = await readContract(context.request, 'TicketLookupInput');
    const validated = ticketLookupSchema.parse(body);

    const liveService = new LiveService(db);
    const result = await liveService.lookupVerifiedAttendeeRecords(
      validated.email,
      validated.verificationCode,
    );

    return jsonResponse(result, 200, undefined, { 'Cache-Control': 'private, no-store' });
  } catch (err) {
    return handleApiError(err);
  }
};

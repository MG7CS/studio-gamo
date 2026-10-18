import type { APIRoute } from 'astro';
import { errorResponse, jsonResponse } from '@gamo/domain';
import { eventHeadcount } from '@gamo/domain/scanner';
import {
  authenticateScanner,
  bindScannerToEvent,
  limitScanner,
  NO_STORE,
  scannerError,
} from '../../../lib/scanner-api';

export const prerender = false;

/** GET /api/scanner/headcount?eventId= — openapi/paths/scanner-headcount.yaml */
export const GET: APIRoute = async (context) => {
  try {
    const caller = await authenticateScanner(context);
    const eventId = new URL(context.request.url).searchParams.get('eventId') ?? '';
    if (eventId.length < 1 || eventId.length > 100)
      return errorResponse(
        'VALIDATION_ERROR',
        'Add the eventId of the event you are scanning.',
        400,
        undefined,
        NO_STORE,
      );
    await bindScannerToEvent(caller, eventId);
    await limitScanner(caller, 'live.scanner.headcount', 30);
    return jsonResponse(await eventHeadcount(caller.db, eventId, caller.now), 200, undefined, NO_STORE);
  } catch (err) {
    return scannerError(err);
  }
};

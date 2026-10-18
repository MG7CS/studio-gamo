import type { APIRoute } from 'astro';
import { readContract } from '@gamo/api-contracts/runtime';
import { jsonResponse } from '@gamo/domain';
import { lookupTickets } from '@gamo/domain/scanner';
import {
  authenticateScanner,
  bindScannerToEvent,
  callerIpHash,
  limitScanner,
  NO_STORE,
  sameOrigin,
  scannerError,
} from '../../../lib/scanner-api';

export const prerender = false;

/** POST /api/scanner/lookup — openapi/paths/scanner-lookup.yaml */
export const POST: APIRoute = async (context) => {
  try {
    const caller = await authenticateScanner(context);
    sameOrigin(context.request);
    const body = await readContract(context.request, 'ScannerLookupInput');
    await bindScannerToEvent(caller, body.eventId);
    await limitScanner(caller, 'live.scanner.lookup', 30);
    const found = await lookupTickets(caller.db, {
      eventId: body.eventId,
      query: body.query,
      actor: caller.actor,
      ipHash: await callerIpHash(caller.env, context.request),
      now: caller.now,
    });
    return jsonResponse(found, 200, undefined, NO_STORE);
  } catch (err) {
    return scannerError(err);
  }
};

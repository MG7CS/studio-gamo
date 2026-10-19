import type { APIRoute } from 'astro';
import { readContract } from '@gamo/api-contracts/runtime';
import { jsonResponse } from '@gamo/domain';
import { overrideAdmit } from '@gamo/domain/scanner';
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

/** POST /api/scanner/override — openapi/paths/scanner-override.yaml */
export const POST: APIRoute = async (context) => {
  try {
    const caller = await authenticateScanner(context);
    sameOrigin(context.request);
    const body = await readContract(context.request, 'ScannerOverrideInput');
    await bindScannerToEvent(caller, body.eventId);
    await limitScanner(caller, 'live.scanner.override', 60);
    const outcome = await overrideAdmit(caller.db, {
      eventId: body.eventId,
      ticketId: body.ticketId,
      reason: body.reason,
      actor: caller.actor,
      clientScanId: body.clientScanId ?? null,
      ipHash: await callerIpHash(caller.env, context.request),
      now: caller.now,
    });
    return jsonResponse(outcome, 200, undefined, NO_STORE);
  } catch (err) {
    return scannerError(err);
  }
};

import type { APIRoute } from 'astro';
import { readContract } from '@gamo/api-contracts/runtime';
import { jsonResponse } from '@gamo/domain';
import { scanTicket } from '@gamo/domain/scanner';
import {
  authenticateScanner,
  bindScannerToEvent,
  keyringFor,
  limitScanner,
  NO_STORE,
  sameOrigin,
  scannerError,
} from '../../../lib/scanner-api';

export const prerender = false;

/** POST /api/scanner/scan — openapi/paths/scanner-scan.yaml */
export const POST: APIRoute = async (context) => {
  try {
    const caller = await authenticateScanner(context);
    sameOrigin(context.request);
    const body = await readContract(context.request, 'ScannerScanInput');
    await bindScannerToEvent(caller, body.eventId);
    await limitScanner(caller, 'live.scanner.scan', 240);
    const outcome = await scanTicket(caller.db, {
      eventId: body.eventId,
      code: body.code,
      direction: body.direction,
      actor: caller.actor,
      keyring: keyringFor(caller.env),
      gate: body.gate ?? null,
      clientScanId: body.clientScanId ?? null,
      now: caller.now,
    });
    return jsonResponse(outcome, 200, undefined, NO_STORE);
  } catch (err) {
    return scannerError(err);
  }
};

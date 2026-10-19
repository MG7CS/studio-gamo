import type { APIRoute } from 'astro';
import { readContract } from '@gamo/api-contracts/runtime';
import { errorResponse, jsonResponse } from '@gamo/domain';
import { syncOfflineScans } from '@gamo/domain/scanner';
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

/** POST /api/scanner/sync — openapi/paths/scanner-sync.yaml (scanner devices only). */
export const POST: APIRoute = async (context) => {
  try {
    const caller = await authenticateScanner(context);
    sameOrigin(context.request);
    const body = await readContract(context.request, 'ScannerSyncInput');
    await bindScannerToEvent(caller, body.eventId);
    if (caller.actor.kind !== 'scanner')
      return errorResponse(
        'NOT_ALLOWED',
        'Offline sync is for scanner links. Scan online from your account, or create a scanner link for this device.',
        403,
        undefined,
        NO_STORE,
      );
    await limitScanner(caller, 'live.scanner.sync', 30);
    const synced = await syncOfflineScans(caller.db, {
      eventId: body.eventId,
      device: caller.actor.device,
      keyring: keyringFor(caller.env),
      scans: body.scans.map((s) => ({ ...s, localResult: s.localResult ?? null })),
      now: caller.now,
    });
    return jsonResponse(synced, 200, undefined, NO_STORE);
  } catch (err) {
    return scannerError(err);
  }
};

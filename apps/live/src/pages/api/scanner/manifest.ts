import type { APIRoute } from 'astro';
import { errorResponse, jsonResponse } from '@gamo/domain';
import { buildScannerManifest } from '@gamo/domain/scanner';
import {
  authenticateScanner,
  bindScannerToEvent,
  limitScanner,
  NO_STORE,
  scannerError,
} from '../../../lib/scanner-api';

export const prerender = false;

/** GET /api/scanner/manifest?eventId= — openapi/paths/scanner-manifest.yaml */
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
    await limitScanner(caller, 'live.scanner.manifest', 30);
    const { manifest, etag } = await buildScannerManifest(caller.db, eventId, caller.now);
    const headers = { ...NO_STORE, ETag: etag, Vary: 'Cookie' };
    if (context.request.headers.get('if-none-match') === etag)
      return new Response(null, { status: 304, headers });
    return jsonResponse(manifest, 200, undefined, headers);
  } catch (err) {
    return scannerError(err);
  }
};

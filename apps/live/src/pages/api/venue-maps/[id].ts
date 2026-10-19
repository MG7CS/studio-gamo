import type { APIRoute } from 'astro';
import { errorResponse, getRuntimeEnv } from '@gamo/domain';
import { asSqlDatabase } from '@gamo/domain/security';
import { readVenueMapImage } from '@gamo/domain/scanner';
import type { R2BucketLike } from '@studio-gamo/integrations';

export const prerender = false;

/**
 * GET /api/venue-maps/{id} — openapi/paths/venue-maps-id.yaml. Blueprints are served as images only:
 * Content-Type from the allow-list, nosniff, a sandboxing CSP (kept by the security-header middleware)
 * and long caching keyed by content hash (`?v=`). Never inlined into a page.
 */
export const GET: APIRoute = async (context) => {
  try {
    const env = await getRuntimeEnv(context);
    const bucket = env.MEDIA_BUCKET as R2BucketLike | undefined;
    if (!env.DB || !bucket || typeof bucket.get !== 'function')
      return errorResponse('UNAVAILABLE', 'Venue maps are temporarily unavailable.', 503);
    const image = await readVenueMapImage(asSqlDatabase(env.DB), bucket, String(context.params.id ?? ''));
    if (!image) return errorResponse('NOT_FOUND', 'That venue map was not found.', 404);
    const headers: Record<string, string> = {
      'Content-Type': image.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Disposition': 'inline',
      ETag: image.etag,
    };
    if (context.request.headers.get('if-none-match') === image.etag)
      return new Response(null, { status: 304, headers });
    return new Response(image.bytes as Uint8Array<ArrayBuffer>, { status: 200, headers });
  } catch {
    console.error('[venue-maps] image read failed');
    return errorResponse('UNAVAILABLE', 'Venue maps are temporarily unavailable.', 503);
  }
};

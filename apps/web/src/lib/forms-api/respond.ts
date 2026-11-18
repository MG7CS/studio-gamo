/**
 * Response helpers shared by the public form-upload and Stripe webhook routes.
 *
 * Success bodies of the upload endpoints are FLAT (not the success/data envelope) because the browser
 * uploader consumes them directly (openapi/paths/forms-upload*.yaml). Errors always use the standard
 * `errorResponse` body. Every answer carries `Cache-Control: no-store`.
 */
import { handleApiError, errorResponse } from '@gamo/domain';
import { isUploadError } from '@gamo/domain/forms';
import { SecretNotConfiguredError } from '@gamo/domain/security';

export function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** A flat JSON success body. */
export function flatJson(body: unknown, status = 200): Response {
  return noStore(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

/** 204 with no body. */
export function noContent(): Response {
  return noStore(new Response(null, { status: 204 }));
}

export function unavailable(): Response {
  return errorResponse('UNAVAILABLE', 'File uploads are temporarily unavailable.', 503);
}

/**
 * Maps a thrown value to the standard error body. Upload errors keep their own code and status (their
 * messages are generic by construction: never tokens, filenames or keys); a missing secret is a 503 that
 * names no variable; everything else goes through `handleApiError` (same-origin 403, unexpected 500).
 */
function errorToResponse(error: unknown): Response {
  if (isUploadError(error)) return errorResponse(error.code, error.message, error.status);
  if (error instanceof SecretNotConfiguredError) {
    console.error('[forms-api] a required secret is not configured');
    return unavailable();
  }
  return handleApiError(error);
}

/** Runs a route body; any throw becomes the standard error body; the answer is always no-store. */
export async function formsApi(handler: () => Promise<Response>): Promise<Response> {
  try {
    return noStore(await handler());
  } catch (error) {
    return noStore(errorToResponse(error));
  }
}

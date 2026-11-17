import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { getRuntimeEnv } from '@gamo/domain';
import {
  databaseOf,
  formsApi,
  limitByIp,
  noContent,
  tokenFromHeader,
  unavailable,
  UPLOAD_RATE_LIMITS,
  uploadServiceFor,
} from '../../../../../lib/forms-api';

export const prerender = false;

/**
 * DELETE /api/forms/uploads/{id} — abandons a pending upload (aborts the multipart upload or deletes the
 * object). Order: same-origin → per-IP limit → UploadService.delete (token; only the session's own,
 * unattached uploads). Deleting a missing upload answers 204.
 */
export const DELETE: APIRoute = (context) =>
  formsApi(async () => {
    requireSameOrigin(context.request);
    const env = await getRuntimeEnv(context);
    const db = databaseOf(env);
    if (!db) return unavailable();
    const limited = await limitByIp(
      context.request,
      env,
      db,
      'forms.upload-delete',
      UPLOAD_RATE_LIMITS.remove,
    );
    if (limited) return limited;
    await uploadServiceFor(db, env).delete(context.params.id ?? '', tokenFromHeader(context.request));
    return noContent();
  });

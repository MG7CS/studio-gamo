import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { getRuntimeEnv } from '@gamo/domain';
import {
  databaseOf,
  flatJson,
  formsApi,
  limitByIp,
  tokenFromHeader,
  unavailable,
  UPLOAD_RATE_LIMITS,
  uploadServiceFor,
} from '../../../../../lib/forms-api';

export const prerender = false;

/**
 * POST /api/forms/uploads/{id}/complete — completes the R2 multipart upload and verifies size and first bytes.
 * Order: same-origin → per-IP limit → UploadService.complete (token, ownership, state). Flat body
 * `{status, reason?}`; a rejected file answers 200 with status "rejected". Repeats return the stored result.
 */
export const POST: APIRoute = (context) =>
  formsApi(async () => {
    requireSameOrigin(context.request);
    const env = await getRuntimeEnv(context);
    const db = databaseOf(env);
    if (!db) return unavailable();
    const limited = await limitByIp(
      context.request,
      env,
      db,
      'forms.upload-complete',
      UPLOAD_RATE_LIMITS.complete,
    );
    if (limited) return limited;
    const result = await uploadServiceFor(db, env).complete(
      context.params.id ?? '',
      tokenFromHeader(context.request),
    );
    return flatJson(result);
  });

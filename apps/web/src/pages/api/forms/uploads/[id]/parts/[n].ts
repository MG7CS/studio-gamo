import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { errorResponse, getRuntimeEnv } from '@gamo/domain';
import { UPLOAD_LIMITS } from '@gamo/domain/forms';
import { readBoundedBody } from '@gamo/domain/public-form-guard';
import {
  databaseOf,
  flatJson,
  formsApi,
  limitByIp,
  sessionFormSlug,
  tokenFromHeader,
  unavailable,
  UPLOAD_RATE_LIMITS,
  uploadServiceFor,
} from '../../../../../../lib/forms-api';

export const prerender = false;

const PART_NUMBER = /^[1-9][0-9]{0,2}$/;

/**
 * PUT /api/forms/uploads/{id}/parts/{n} — one binary part (at most 8 MiB). Order: same-origin → per-IP limit →
 * live session token → Content-Length rules (required, ≤ part size) BEFORE any body byte is read → bounded
 * read → UploadService.putPart (ownership, state, part rules). Re-sending a part replaces it.
 */
export const PUT: APIRoute = (context) =>
  formsApi(async () => {
    const { request } = context;
    requireSameOrigin(request);
    const env = await getRuntimeEnv(context);
    const db = databaseOf(env);
    if (!db) return unavailable();
    const limited = await limitByIp(request, env, db, 'forms.upload-part', UPLOAD_RATE_LIMITS.part);
    if (limited) return limited;

    const token = tokenFromHeader(request);
    if (!(await sessionFormSlug(db, token)))
      return errorResponse('UPLOAD_TOKEN_INVALID', 'The upload session is not valid or has expired.', 401);
    const partNumber = Number(context.params.n);
    if (!PART_NUMBER.test(context.params.n ?? '') || partNumber > 1000)
      return errorResponse('BAD_REQUEST', 'The part number is not valid.', 400);

    const declared = request.headers.get('content-length')?.trim() ?? '';
    if (!/^\d+$/.test(declared))
      return errorResponse('LENGTH_REQUIRED', 'The part size must be sent in Content-Length.', 400);
    const length = Number(declared);
    if (length > UPLOAD_LIMITS.partSize)
      return errorResponse('PAYLOAD_TOO_LARGE', 'A part can be at most 8 MiB.', 413);

    const body = await readBoundedBody(request, UPLOAD_LIMITS.partSize);
    if (!body.ok)
      return body.reason === 'too_large'
        ? errorResponse('PAYLOAD_TOO_LARGE', 'A part can be at most 8 MiB.', 413)
        : errorResponse('BAD_REQUEST', 'The part could not be read.', 400);
    if (body.bytes.byteLength !== length)
      return errorResponse('BAD_REQUEST', 'The part length does not match Content-Length.', 400);

    const stored = await uploadServiceFor(db, env).putPart(
      context.params.id ?? '',
      token,
      partNumber,
      body.bytes,
    );
    return flatJson({ etag: stored.etag });
  });

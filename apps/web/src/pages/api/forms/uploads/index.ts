import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { errorResponse, getRuntimeEnv, guardPublicForm } from '@gamo/domain';
import { FormsService } from '@gamo/domain/forms';
import {
  databaseOf,
  findFileQuestion,
  flatJson,
  formsApi,
  questionAccepts,
  sessionFormSlug,
  unavailable,
  UPLOAD_RATE_LIMITS,
  uploadServiceFor,
} from '../../../../lib/forms-api';

export const prerender = false;

const KEYS = ['token', 'questionId', 'filename', 'size', 'contentType'];

/**
 * POST /api/forms/uploads — opens one upload (R2 multipart for files over one part). Order: same-origin →
 * body + per-IP limit (no Turnstile: the session token was Turnstile-gated) → shape → session token → the
 * question must be a file_upload of the session's PUBLISHED form version that accepts this type and size →
 * UploadService.start (caps, session file count). Flat body `{uploadId, partSize, parts}`.
 */
export const POST: APIRoute = (context) =>
  formsApi(async () => {
    requireSameOrigin(context.request);
    const env = await getRuntimeEnv(context);
    const guard = await guardPublicForm(
      { request: context.request, env, locals: context.locals },
      {
        route: 'forms.upload-start',
        requireTurnstile: false,
        limits: { perIp: UPLOAD_RATE_LIMITS.start },
        maxBytes: 8 * 1024,
      },
    );
    if (!guard.ok) return guard.response;
    const json = guard.body.json;
    const { token, questionId, filename, size, contentType } = (json ?? {}) as Record<string, unknown>;
    if (
      !json ||
      Object.keys(json).some((k) => !KEYS.includes(k)) ||
      typeof token !== 'string' ||
      typeof questionId !== 'string' ||
      typeof filename !== 'string' ||
      typeof size !== 'number' ||
      !Number.isInteger(size) ||
      typeof contentType !== 'string'
    )
      return errorResponse('BAD_REQUEST', 'The request is invalid.', 400);

    const db = databaseOf(env);
    if (!db) return unavailable();
    const slug = await sessionFormSlug(db, token);
    if (!slug)
      return errorResponse('UPLOAD_TOKEN_INVALID', 'The upload session is not valid or has expired.', 401);

    const published = await new FormsService(db).getPublished(slug);
    if (!published || !published.accepting)
      return errorResponse('FORM_CLOSED', 'This form is no longer accepting submissions.', 400);
    const question = findFileQuestion(published.version.schema, questionId);
    if (!question) return errorResponse('UPLOAD_INVALID', 'The upload request is not valid.', 400);
    if (!questionAccepts(question, contentType, size))
      return errorResponse('UPLOAD_TYPE', 'This file type or size is not accepted for this question.', 400);

    const started = await uploadServiceFor(db, env).start({ token, questionId, filename, size, contentType });
    return flatJson(started);
  });

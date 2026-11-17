import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { errorResponse, getRuntimeEnv, guardPublicForm } from '@gamo/domain';
import { FormsService } from '@gamo/domain/forms';
import {
  databaseOf,
  flatJson,
  formsApi,
  hasFileQuestion,
  turnstileRequest,
  unavailable,
  UPLOAD_RATE_LIMITS,
  uploadServiceFor,
} from '../../../../lib/forms-api';

export const prerender = false;

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * POST /api/forms/{slug}/upload-session — Turnstile-verified, per-IP limited signed session token for the
 * chunked uploader. Order: same-origin → body/rate limit/Turnstile → the form must be published, open and
 * have a file_upload question → token. Success body is flat `{token, expiresAt}` (OpenAPI forms-upload-session).
 */
export const POST: APIRoute = (context) =>
  formsApi(async () => {
    requireSameOrigin(context.request);
    const env = await getRuntimeEnv(context);
    const request = await turnstileRequest(context.request);
    if (request instanceof Response) return request;
    const guard = await guardPublicForm(
      { request, env, locals: context.locals },
      { route: 'forms.upload-session', limits: { perIp: UPLOAD_RATE_LIMITS.session } },
    );
    if (!guard.ok) return guard.response;
    const db = databaseOf(env);
    if (!db) return unavailable();

    const slug = context.params.slug ?? '';
    const published = SLUG.test(slug) ? await new FormsService(db).getPublished(slug) : null;
    if (!published) return errorResponse('NOT_FOUND', 'This form was not found.', 404);
    if (!published.accepting)
      return errorResponse('FORM_CLOSED', 'This form is no longer accepting submissions.', 404);
    if (!hasFileQuestion(published.version.schema))
      return errorResponse('NOT_FOUND', 'This form does not accept uploads.', 404);

    const session = await uploadServiceFor(db, env).startSession({ formSlug: slug, ipHash: guard.ipHash });
    return flatJson({ token: session.token, expiresAt: new Date(session.expiresAt * 1000).toISOString() });
  });

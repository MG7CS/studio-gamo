/**
 * The HTTP side of the builder's JSON/form endpoints (`/api/forms/**`). Each route file is one line that
 * names its action; this runs the staff gate, reads the bounded body, runs the shared action and answers
 * `jsonOrSee`: JSON clients get `{ success, data }` (or the standard error body with details), browsers
 * get the 303. Every route here is state-changing, so `adminApi` (staff session, Access identity, same
 * origin) always runs first.
 */
import type { APIContext } from 'astro';
import { errorResponse } from '@gamo/domain';
import { adminApi, jsonOrSee, readBody, see, wantsJson } from '../admin-page';
import { domainErrorResponse } from '../domain-errors';
import { runBuilderAction, type Body, type Outcome } from './actions';

type Failed = Extract<Outcome, { ok: false }>;

/** Where a browser goes after a refusal (it has no re-render to show details in). */
function failureLocation(action: string, formId: string | null): string {
  if (action === 'form.create') return '/forms/new';
  if (action === 'form.close' || action === 'form.reopen' || !formId) return '/forms';
  if (action === 'publish') return `/forms/${formId}/publish`;
  if (action === 'version.restore') return `/forms/${formId}/versions`;
  if (action === 'settings.save') return `/forms/${formId}/edit?view=settings`;
  return `/forms/${formId}/edit`;
}

function refusal(request: Request, action: string, formId: string | null, outcome: Failed): Response {
  if (!wantsJson(request)) return see(failureLocation(action, formId), outcome.notice);
  return errorResponse(outcome.code, outcome.message, outcome.status, {
    ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}),
    ...(outcome.dependents ? { dependents: outcome.dependents } : {}),
    ...(outcome.conflict
      ? { currentRevision: outcome.conflict.currentRevision, updatedAt: outcome.conflict.at }
      : {}),
    ...(outcome.publish ?? {}),
  });
}

export interface RouteOptions {
  /** URL parameters copied into the body under another name (the URL wins over anything posted). */
  params?: Record<string, string>;
  /** JSON clients never see the browser's confirmation step: treat the action as confirmed. */
  confirmForJson?: boolean;
}

/** Runs `action` for the request behind a builder API route. */
export async function builderRoute(
  context: APIContext,
  action: string,
  options: RouteOptions = {},
): Promise<Response> {
  try {
    const admin = await adminApi(context);
    const body: Body = await readBody(context.request);
    for (const [param, field] of Object.entries(options.params ?? {})) {
      const value = context.params[param];
      if (value !== undefined) body[field] = value;
    }
    if (options.confirmForJson && wantsJson(context.request)) body.confirm = '1';
    const formId = context.params.id ?? null;
    const outcome = await runBuilderAction(
      { db: admin.db, staff: { userId: admin.staff.userId } },
      formId,
      action,
      body,
    );
    if (!outcome.ok) return refusal(context.request, action, formId, outcome);
    return jsonOrSee(context.request, {
      data: outcome.data,
      location: outcome.location,
      notice: outcome.notice,
    });
  } catch (error) {
    return domainErrorResponse(error);
  }
}

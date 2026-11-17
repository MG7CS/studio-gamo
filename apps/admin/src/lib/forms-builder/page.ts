/**
 * What every builder page shares: reading a browser form post, running the action, and answering either
 * with the post-redirect-get 303 or with the data the page re-renders (status, messages, kept values).
 */
import type { AdminContext } from '../admin-page';
import { readBody, see } from '../admin-page';
import { domainErrorResponse } from '../domain-errors';
import { runBuilderAction, type Body, type Outcome } from './actions';

export type Failed = Extract<Outcome, { ok: false }>;

export interface PostResult {
  /** A 303 (or an error response) to return as is. */
  response?: Response;
  /** The refusal to render on this page. */
  failed?: Failed;
  /** What was posted (never trusted; the page uses it only to find the question to re-open). */
  body: Body;
}

/**
 * Handles a POST to a builder page. Returns null for any other method. `allowed` lists the actions this
 * page accepts. The caller has already passed `adminPage` (staff session, same origin).
 */
export async function handleBuilderPost(
  admin: AdminContext,
  request: Request,
  formId: string | null,
  allowed: readonly string[],
): Promise<PostResult | null> {
  if (request.method !== 'POST') return null;
  let body: Body;
  try {
    body = await readBody(request);
  } catch (error) {
    return { response: domainErrorResponse(error), body: {} };
  }
  const action = typeof body.action === 'string' ? body.action : '';
  if (!allowed.includes(action)) {
    return {
      failed: {
        ok: false,
        status: 400,
        code: 'INVALID_INPUT',
        notice: 'invalid',
        message: 'That action is not available on this page.',
      },
      body,
    };
  }
  // The forms list closes and reopens forms by the posted id; every other page names its form in the URL.
  const target = formId ?? (typeof body.id === 'string' ? body.id : null);
  let outcome: Outcome;
  try {
    outcome = await runBuilderAction(
      { db: admin.db, staff: { userId: admin.staff.userId } },
      target,
      action,
      body,
    );
  } catch (error) {
    return { response: domainErrorResponse(error), body };
  }
  if (outcome.ok) return { response: see(outcome.location, outcome.notice), body };
  return { failed: outcome, body };
}

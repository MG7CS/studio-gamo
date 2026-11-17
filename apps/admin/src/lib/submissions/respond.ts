/**
 * Answers for the submissions routes. Browser form posts get post-redirect-get with a generic notice key;
 * scripts (Accept or Content-Type JSON) get the standard JSON bodies. A failed authentication is never
 * turned into a redirect.
 */
import { AuthError } from '@gamo/auth';
import { domainErrorResponse } from '../domain-errors.ts';
import { see, wantsJson } from '../admin-page.ts';
import { submissionNoticeKey } from './notices.ts';

/** `location` is where a form post goes back to; JSON clients ignore it. */
export function failure(err: unknown, request: Request, location: string): Response {
  if (err instanceof Response) return err;
  if (err instanceof AuthError || wantsJson(request)) return domainErrorResponse(err);
  if (!(err instanceof Error)) return domainErrorResponse(err);
  const key = submissionNoticeKey(err);
  // A domain refusal is shown on the page; an unexpected error is logged (name only) and shown generically.
  if (key === 'error') console.error('[admin] submissions action failed:', err.name);
  return see(location, key);
}

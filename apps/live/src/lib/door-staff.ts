/**
 * The staff link page `/door/[token]` (docs/LIVE_SCREENS.md §I.2 P8): a POST with the PIN signs the device in (the
 * device cookie is set and the page reloads); "Leave" signs it out; a GET shows the PIN form, why the link no longer
 * works, or the dates to choose from (straight to the only one). The page calls `handleStaffLink` once.
 */
import { requireSameOrigin } from '@gamo/auth';
import { requesterHash, type PaidEnv, type SqlDatabase } from '@gamo/domain';
import { readCookie } from './organizer-session';
import {
  doorCookieHeader,
  doorCookieName,
  leaveDoor,
  staffDoorAccess,
  staffEntry,
  submitPin,
  type DoorAccess,
  type StaffEntry,
} from './door-access';

export interface StaffLinkRequest {
  request: Request;
  url: URL;
}

export type StaffLinkOutcome =
  { response: Response } | { response: null; entry: StaffEntry; pinError: string | null; status: number };

function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  if (setCookie) headers.append('set-cookie', setCookie);
  return new Response(null, { status: 303, headers });
}

export async function handleStaffLink(
  astro: StaffLinkRequest,
  live: { db: SqlDatabase; env: unknown },
  input: { token: string; now: number },
): Promise<StaffLinkOutcome> {
  const env = live.env as PaidEnv;
  const { token, now } = input;
  const cookieName = await doorCookieName(token);
  const cookieValue = readCookie(astro.request, cookieName);
  const secure = astro.url.protocol === 'https:';
  const self = astro.url.pathname;
  let pinError: string | null = null;
  if (astro.request.method === 'POST') {
    try {
      requireSameOrigin(astro.request);
    } catch {
      return { response: new Response('Forbidden', { status: 403 }) };
    }
    const form = await astro.request.formData().catch(() => null);
    if (form?.get('action') === 'leave') {
      await leaveDoor(live.db, cookieValue);
      return { response: redirect(self, doorCookieHeader(cookieName, '', 0, secure)) };
    }
    const outcome = await submitPin(live.db, env, {
      token,
      pin: form?.get('pin'),
      ipHash: await requesterHash(astro.request, env),
      now,
    });
    if (outcome.ok)
      return {
        response: redirect(
          self,
          doorCookieHeader(outcome.cookieName, outcome.cookieValue, outcome.maxAgeSeconds, secure),
        ),
      };
    pinError = outcome.message;
  }
  const entry = await staffEntry(live.db, env, { token, cookieValue, now });
  if (entry.kind === 'ready' && entry.redirect && astro.request.method !== 'POST')
    return { response: redirect(entry.redirect) };
  return {
    response: null,
    entry,
    pinError,
    status: entry.kind === 'invalid' ? 404 : entry.kind === 'closed' ? 410 : pinError ? 400 : 200,
  };
}

/** The door of one date for the device signed in on this link, or the way back to the PIN page. */
export async function staffDoorFor(
  astro: StaffLinkRequest,
  live: { db: SqlDatabase; env: unknown },
  input: { token: string; occurrenceId: string; now: number },
): Promise<{ access: DoorAccess } | { response: Response }> {
  const cookieValue = readCookie(astro.request, await doorCookieName(input.token));
  const access = await staffDoorAccess(live.db, live.env as PaidEnv, {
    token: input.token,
    cookieValue,
    occurrenceId: input.occurrenceId,
    now: input.now,
  });
  if (!access) return { response: redirect(`/door/${encodeURIComponent(input.token)}`) };
  return { access };
}

/** POST /account/signout: ends the organizer session and sends the browser to the signed-out page. */
import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { endOrganizerSession } from '@gamo/domain';
import { ORGANIZATION_COOKIE, SESSION_COOKIE, cookieHeader, readCookie } from '../../lib/organizer-session';
import { openLive } from '../../lib/registration';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, locals }) => {
  try {
    requireSameOrigin(request);
  } catch {
    return new Response('Forbidden', { status: 403 });
  }
  const secure = url.protocol === 'https:';
  try {
    const live = await openLive({ locals });
    await endOrganizerSession(live.db, readCookie(request, SESSION_COOKIE));
  } catch {
    // The cookie is cleared below either way.
  }
  const headers = new Headers({ location: '/account/signed-out' });
  headers.append('set-cookie', cookieHeader(SESSION_COOKIE, '', 0, secure));
  headers.append('set-cookie', cookieHeader(ORGANIZATION_COOKIE, '', 0, secure));
  return new Response(null, { status: 303, headers });
};

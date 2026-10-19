/** POST /organizer/switch: choose which of your organizations the pages act on. Membership is checked. */
import type { APIRoute } from 'astro';
import { requireSameOrigin } from '@gamo/auth';
import { listMemberships, resolveOrganizerSession } from '@gamo/domain';
import { ORGANIZATION_COOKIE, SESSION_COOKIE, cookieHeader, readCookie } from '../../lib/organizer-session';
import { openLive } from '../../lib/registration';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, locals, redirect }) => {
  try {
    requireSameOrigin(request);
  } catch {
    return new Response('Forbidden', { status: 403 });
  }
  const live = await openLive({ locals });
  const organizer = await resolveOrganizerSession(
    live.db,
    readCookie(request, SESSION_COOKIE),
    Math.floor(Date.now() / 1000),
  );
  if (!organizer) return redirect('/account/signin', 303);
  const wanted = String((await request.formData()).get('organization') ?? '');
  const memberships = await listMemberships(live.db, organizer.id);
  const headers = new Headers({ location: '/organizer' });
  if (memberships.some((m) => m.organizationId === wanted))
    headers.append(
      'set-cookie',
      cookieHeader(ORGANIZATION_COOKIE, wanted, 30 * 86400, url.protocol === 'https:'),
    );
  return new Response(null, { status: 303, headers });
};

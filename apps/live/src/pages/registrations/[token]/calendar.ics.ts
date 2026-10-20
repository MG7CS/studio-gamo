/**
 * GET /registrations/<token>/calendar.ics: the event as a calendar file for the guest whose signed link this is.
 * Same token check as the registration page; the file holds only the public event details (never the private link).
 */
import type { APIRoute } from 'astro';
import { requestSecurityHeaders } from '@gamo/domain';
import { openLive } from '../../../lib/registration';
import { loadTicket, ticketIcs } from '../../../lib/guest-registration';

export const prerender = false;

export const GET: APIRoute = async (astro) => {
  // The URL carries a secret: never leak it in a Referer header.
  requestSecurityHeaders(astro.locals, { noReferrer: true });
  const now = Math.floor(Date.now() / 1000);
  let ics: string | null;
  try {
    const live = await openLive(astro);
    const loaded = await loadTicket(live, astro.params.token ?? '', now);
    if (loaded.kind !== 'ready') return new Response('Not found', { status: 404 });
    ics = ticketIcs(loaded.page, astro.url.origin, now);
  } catch (error) {
    console.error('[live:calendar] failed', (error as Error)?.name);
    return new Response('Calendar file unavailable', { status: 503 });
  }
  if (!ics) return new Response('Not found', { status: 404 });
  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="gamo-live-event.ics"',
      'cache-control': 'no-store',
    },
  });
};

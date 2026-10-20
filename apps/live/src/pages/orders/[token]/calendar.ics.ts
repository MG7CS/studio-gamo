/**
 * GET /orders/<token>/calendar.ics: the event as a calendar file for the holder of a valid order or ticket link. Same
 * link check as the order page; the file holds only the public event details (never the private link).
 */
import type { APIRoute } from 'astro';
import { requestSecurityHeaders } from '@gamo/domain';
import { siteOrigin } from '@studio-gamo/ui/lib/sites';
import { openLive } from '../../../lib/registration';
import { orderCalendar } from '../../../lib/checkout-orders';

export const prerender = false;

export const GET: APIRoute = async (astro) => {
  // The URL carries a secret: never leak it in a Referer header.
  requestSecurityHeaders(astro.locals, { noReferrer: true });
  let ics: string | null;
  try {
    const live = await openLive(astro);
    ics = await orderCalendar(live, {
      token: astro.params.token ?? '',
      origin: siteOrigin('live'),
      now: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    console.error('[live:orders] calendar_failed', (error as Error)?.name);
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

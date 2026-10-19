import type { APIRoute } from 'astro';
import { loadEvent, loadOrder, orderCalendarFile, nowSeconds, ticketingDb } from '@gamo/domain';
import { DOWNLOAD_HEADERS, authorizeTicketDownload } from '../../../../lib/ticket-downloads';

export const prerender = false;

/** GET /tickets/orders/{id}/event.ics — calendar entry in the venue time zone (stable UID, rising SEQUENCE). */
export const GET: APIRoute = async (context) => {
  const r = await authorizeTicketDownload(context, { orderId: context.params.id }, 'view');
  if (r instanceof Response) return r;
  const db = ticketingDb(r.env);
  const order = await loadOrder(db, r.models[0].orderId);
  const event = order ? await loadEvent(db, order.event_id) : null;
  if (!order || !event) return new Response('Not found.', { status: 404, headers: DOWNLOAD_HEADERS });
  const ics = await orderCalendarFile(db, {
    order,
    event,
    origin: new URL(context.request.url).origin,
    now: nowSeconds(),
  });
  return new Response(ics, {
    headers: {
      ...DOWNLOAD_HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="event.ics"',
    },
  });
};

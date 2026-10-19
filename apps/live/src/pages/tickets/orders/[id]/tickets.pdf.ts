import type { APIRoute } from 'astro';
import { ticketsPdf } from '@gamo/domain';
import { DOWNLOAD_HEADERS, authorizeTicketDownload } from '../../../../lib/ticket-downloads';

export const prerender = false;

/** GET /tickets/orders/{id}/tickets.pdf — every ticket you hold in the order, one per page. */
export const GET: APIRoute = async (context) => {
  const r = await authorizeTicketDownload(context, { orderId: context.params.id }, 'download_pdf');
  if (r instanceof Response) return r;
  const pdf = await ticketsPdf(r.env, r.models, `${r.models[0].eventTitle} — tickets`);
  return new Response(pdf as BodyInit, {
    headers: {
      ...DOWNLOAD_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="gamo-live-tickets.pdf"',
    },
  });
};

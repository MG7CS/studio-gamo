import type { APIRoute } from 'astro';
import { renderTicketSvg } from '@gamo/domain';
import { DOWNLOAD_HEADERS, authorizeTicketDownload } from '../../../lib/ticket-downloads';

export const prerender = false;

/** GET /tickets/{id}/ticket.svg — the ticket image (current holder only). */
export const GET: APIRoute = async (context) => {
  const r = await authorizeTicketDownload(context, { ticketId: context.params.id }, 'view');
  if (r instanceof Response) return r;
  return new Response(renderTicketSvg(r.models[0]), {
    headers: {
      ...DOWNLOAD_HEADERS,
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
};

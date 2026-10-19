import type { APIRoute } from 'astro';
import { ticketsPdf } from '@gamo/domain';
import { DOWNLOAD_HEADERS, authorizeTicketDownload } from '../../../lib/ticket-downloads';

export const prerender = false;

/** GET /tickets/{id}/ticket.pdf — one ticket as a PDF (cached in R2 by id and version when bound). */
export const GET: APIRoute = async (context) => {
  const r = await authorizeTicketDownload(context, { ticketId: context.params.id }, 'download_pdf');
  if (r instanceof Response) return r;
  const pdf = await ticketsPdf(r.env, r.models, `${r.models[0].eventTitle} — ticket`);
  return new Response(pdf as BodyInit, {
    headers: {
      ...DOWNLOAD_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="gamo-live-ticket.pdf"',
    },
  });
};

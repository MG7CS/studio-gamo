import type { APIRoute } from 'astro';
import { renderQrPng } from '@gamo/domain';
import { DOWNLOAD_HEADERS, authorizeTicketDownload } from '../../../lib/ticket-downloads';

export const prerender = false;

/** GET /tickets/{id}/qr.png — the QR code alone as a PNG (valid tickets, current holder only). */
export const GET: APIRoute = async (context) => {
  const r = await authorizeTicketDownload(context, { ticketId: context.params.id }, 'download_png');
  if (r instanceof Response) return r;
  const model = r.models[0];
  if (!model.qrPayload)
    return new Response('This ticket is no longer valid.', { status: 410, headers: DOWNLOAD_HEADERS });
  return new Response((await renderQrPng(model.qrPayload, 8)) as BodyInit, {
    headers: {
      ...DOWNLOAD_HEADERS,
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="gamo-live-ticket-qr.png"',
    },
  });
};

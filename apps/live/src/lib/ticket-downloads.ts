/**
 * Shared authorisation for ticket download routes: the customer session must hold the ticket(s)
 * (current holder only). Everything else is a uniform 404 (401 without any session). Downloads are
 * written to `ticket_access_log`.
 */
import type { APIContext } from 'astro';
import {
  TicketingError,
  downloadableTickets,
  getRuntimeEnv,
  loadTicketRenderModels,
  logTicketAccess,
  nowSeconds,
  requestCustomer,
  ticketingDb,
  ticketingErrorResponse,
  type TicketRenderModel,
} from '@gamo/domain';
import type { AccessAction } from '@gamo/domain/types';

export interface TicketDownload {
  env: Record<string, unknown> & Awaited<ReturnType<typeof getRuntimeEnv>>;
  models: TicketRenderModel[];
}

const NOT_FOUND = () =>
  new Response('Ticket not found. Open the latest link from your ticket email.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });

export async function authorizeTicketDownload(
  context: APIContext,
  scope: { ticketId?: string; orderId?: string },
  action: AccessAction,
): Promise<TicketDownload | Response> {
  try {
    const env = (await getRuntimeEnv(context)) as TicketDownload['env'];
    const db = ticketingDb(env);
    const now = nowSeconds();
    const identity = await requestCustomer(db, env, context.request, now);
    if (!identity)
      return new Response('Open the link from your ticket email first.', {
        status: 401,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
      });
    const rows = await downloadableTickets(db, { session: identity, ...scope });
    if (rows.length === 0) return NOT_FOUND();
    const models = await loadTicketRenderModels(db, env, { ticketIds: rows.map((r) => r.id) });
    await logTicketAccess(db, { tickets: rows, action, actorId: identity.customerProfileId, now });
    return { env, models };
  } catch (err) {
    if (err instanceof TicketingError && err.code === 'NOT_FOUND') return NOT_FOUND();
    return ticketingErrorResponse(err);
  }
}

export const DOWNLOAD_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
} as const;

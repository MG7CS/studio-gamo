/** GET /organizer/events/<id>/orders.csv: this organization's paid event's orders, as filtered on the Orders tab. */
import type { APIRoute } from 'astro';
import { listTicketTypes } from '@gamo/domain';
import { paidEventPage } from '../../../../lib/event-page';
import { ordersCsvResponse } from '../../../../lib/orders-page';

export const prerender = false;

export const GET: APIRoute = async (astro) => {
  const ctx = await paidEventPage(astro as never);
  if (ctx instanceof Response) return ctx;
  const types = await listTicketTypes(ctx.live.db, ctx.active.organizationId, ctx.eventId);
  return ordersCsvResponse(ctx.live.db, {
    organizationId: ctx.active.organizationId,
    eventId: ctx.eventId,
    slug: ctx.event.slug,
    timeZone: ctx.event.values.timezone,
    types,
    params: astro.url.searchParams,
  });
};

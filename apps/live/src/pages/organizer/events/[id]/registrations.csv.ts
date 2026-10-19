/** GET /organizer/events/<id>/registrations.csv: the registration list for this organization's event. */
import type { APIRoute } from 'astro';
import { getOrganizerEvent, listEventRegistrations, registrationsCsv } from '@gamo/domain';
import { organizerPage } from '../../../../lib/organizer-session';

export const prerender = false;

export const GET: APIRoute = async (astro) => {
  const ctx = await organizerPage(astro as never);
  if (ctx instanceof Response) return ctx;
  if (!ctx.active) return new Response('Not found', { status: 404 });
  const id = astro.params.id ?? '';
  const event = await getOrganizerEvent(ctx.live.db, ctx.active.organizationId, id);
  if (!event) return new Response('Not found', { status: 404 });
  const rows = await listEventRegistrations(ctx.live.db, ctx.active.organizationId, id, {
    occurrenceId: astro.url.searchParams.get('occurrence') || undefined,
    q: astro.url.searchParams.get('q') ?? '',
  });
  const name = event.slug.replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'event';
  return new Response(registrationsCsv(rows, event.values.timezone), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="registrations-${name}.csv"`,
      'cache-control': 'no-store',
    },
  });
};

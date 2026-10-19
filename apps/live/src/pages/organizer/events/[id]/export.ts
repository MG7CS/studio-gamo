import type { APIRoute, AstroGlobal } from 'astro';
import { attendanceCsv, scanLogCsv } from '@gamo/domain/scanner';
import { resolveOrganizerEvent } from '../../../../lib/organizer-pages';

export const prerender = false;

/**
 * CSV export of attendance (`?kind=attendance`) or the scan log (`?kind=scans`, same filters as the
 * page). Behind the /organizer session guard plus `manage_ticketing`; emails only for owner/admin.
 */
export const GET: APIRoute = async (context) => {
  const eventId = context.params.id ?? '';
  const resolved = await resolveOrganizerEvent(
    context as unknown as AstroGlobal,
    eventId,
    'manage_ticketing',
  );
  if (!resolved.ok)
    return new Response(resolved.message, {
      status: resolved.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
    });
  const q = context.url.searchParams;
  const kind = q.get('kind') === 'scans' ? 'scans' : 'attendance';
  const csv =
    kind === 'scans'
      ? await scanLogCsv(resolved.ctx.db, eventId, {
          result: q.get('result') || null,
          gate: q.get('gate') || null,
          deviceId: q.get('device') || null,
          conflictsOnly: q.get('conflicts') === '1',
        })
      : await attendanceCsv(resolved.ctx.db, eventId, resolved.ctx.canSeePersonalData);
  const safeName = resolved.ctx.event.slug.replace(/[^a-z0-9-]/gi, '').slice(0, 60) || 'event';
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeName}-${kind}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

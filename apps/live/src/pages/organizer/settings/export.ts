/** GET /organizer/settings/export: the signed-in person's own data as a JSON download. Never cached, never about anyone else. */
import type { APIRoute } from 'astro';
import { exportOrganizerData } from '@gamo/domain';
import { organizerPage } from '../../../lib/organizer-session';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  let ctx;
  try {
    ctx = await organizerPage(context, { needOrganization: false });
  } catch {
    return new Response('Gamo Live is temporarily unavailable.', { status: 503 });
  }
  if (ctx instanceof Response) return ctx;
  const data = await exportOrganizerData(ctx.live.db, ctx.organizer.id, ctx.now);
  if (!data) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="gamo-live-my-data.json"',
      'cache-control': 'no-store',
    },
  });
};

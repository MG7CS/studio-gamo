/**
 * Gate for the organizer event pages under /promote/events/[id]/*: a signed-in Live user with the
 * event permission (resource-scoped, from D1 — never from UI state). Anything else is a redirect to
 * sign-in or a uniform "not yours" page via status 404 (no existence leak).
 */
import type { AstroGlobal } from 'astro';
import { getDb } from '@gamo/db';
import { resolveAuth, hasEventPermission, type EventPermission, type SessionData } from '@gamo/auth';
import { getRuntimeEnv, loadEvent, ticketingDb, type EventRow } from '@gamo/domain';
import type { SqlDatabase } from '@gamo/domain/security';

export interface OrganizerContext {
  auth: SessionData;
  env: Awaited<ReturnType<typeof getRuntimeEnv>> & Record<string, unknown>;
  db: SqlDatabase;
  event: EventRow;
}

export async function organizerEventGate(
  Astro: AstroGlobal,
  permissions: EventPermission[],
): Promise<OrganizerContext | Response> {
  const env = (await getRuntimeEnv(Astro)) as OrganizerContext['env'];
  const auth = await resolveAuth(Astro.request, getDb(env.DB), {
    secret: env.SESSION_SECRET,
    product: 'live',
    env,
  });
  const here = Astro.url.pathname + Astro.url.search;
  if (!auth)
    return new Response(null, {
      status: 303,
      headers: { Location: `/account/signin?next=${encodeURIComponent(here)}`, 'Cache-Control': 'no-store' },
    });
  const db = ticketingDb(env);
  const event = await loadEvent(db, Astro.params.id ?? '');
  if (event) {
    let allowed = true;
    for (const p of permissions) allowed &&= await hasEventPermission(getDb(env.DB), auth, event.id, p);
    if (allowed) return { auth, env, db, event };
  }
  return new Response('Event not found, or you do not manage it. Go back to your workspace.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

import type { APIRoute } from 'astro';
import { createSession, requireSameOrigin } from '@gamo/auth';
import { getDb } from '@gamo/db';
import {
  IdentityService,
  createOrganizerEvent,
  getRuntimeEnv,
  nowSeconds,
  ticketingDb,
  utcToZonedLocal,
} from '@gamo/domain';
import { allRows, newPrefixedId } from '@gamo/domain/security';

export const prerender = false;

/**
 * LOCAL-ONLY test fixtures (CLEANUP_LOG D-154): POST creates a fictional Sample organizer, user and an
 * approved event so browser tests have something to buy. `?kind=free|paid`, `&capacity=N`, `&price=15`,
 * `&names=1` (attendee names required), `&days=30`, `&session=1` (organizer session cookie, needs SESSION_SECRET). Answers 404 unless ENVIRONMENT=local.
 */
export const POST: APIRoute = async (context) => {
  const env = await getRuntimeEnv(context);
  if (env.ENVIRONMENT !== 'local') return new Response('Not found', { status: 404 });
  try {
    requireSameOrigin(context.request);
  } catch {
    return new Response('Forbidden', { status: 403 });
  }
  const q = new URL(context.request.url).searchParams;
  const kind = q.get('kind') === 'paid' ? 'paid' : 'free';
  const capacity = String(Math.min(500, Math.max(1, Number(q.get('capacity') ?? 20))));
  const price = kind === 'paid' ? String(q.get('price') ?? '15') : '0';
  const days = Math.min(300, Math.max(2, Number(q.get('days') ?? 30)));
  const db = ticketingDb(env as Record<string, unknown>);
  const now = nowSeconds();
  const suffix = newPrefixedId('x', 16).slice(2);
  const orgId = `org_sample_${suffix}`;
  const userId = `usr_sample_${suffix}`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO users (id, email, display_name, status, verified_email_at, created_at) VALUES (?1, ?2, 'Sample Organizer', 'active', ?3, ?3)",
      )
      .bind(userId, `organizer-${suffix}@example.org`, now),
    db
      .prepare(
        "INSERT INTO organizations (id, name, slug, type, status, created_at) VALUES (?1, 'Sample Church', ?2, 'church', 'active', ?3)",
      )
      .bind(orgId, `sample-church-${suffix}`, now),
    db
      .prepare(
        "INSERT INTO organization_members (id, organization_id, user_id, role, status, created_at) VALUES (?1, ?2, ?3, 'owner', 'active', ?4)",
      )
      .bind(`mem_${suffix}`, orgId, userId, now),
  ]);
  const start = utcToZonedLocal(now + days * 86400, 'America/Phoenix');
  const created = await createOrganizerEvent(db, {
    actorUserId: userId,
    now,
    event: {
      organizationId: orgId,
      title: `Sample ${kind === 'paid' ? 'Concert' : 'Worship Night'} ${suffix.slice(0, 4)}`,
      category: kind === 'paid' ? 'concert' : 'worship',
      description: 'A sample gathering created by the local test fixture. Not a real event.',
      venueName: 'Sample Fellowship Hall',
      address: '100 Sample Street',
      city: 'Phoenix',
      state: 'AZ',
      timezone: 'America/Phoenix',
      start: { date: start.date, time: '19:00' },
      admissionType: kind,
      categories: [{ name: 'General admission', kind: 'general', price, capacity }],
      policy: q.get('names') === '1' ? { attendeeNamesRequired: true } : {},
    },
  });
  await db.prepare("UPDATE events SET status = 'approved' WHERE id = ?1").bind(created.eventId).run();
  const cat = await allRows<{ id: string }>(db, {
    sql: 'SELECT id FROM ticket_tiers WHERE event_id = ?1 LIMIT 1',
    params: [created.eventId],
  });
  // Organizer session for browser tests of the organizer pages (only when SESSION_SECRET is configured).
  let sessionCookie: string | null = null;
  if (q.get('session') === '1' && typeof env.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32) {
    const gdb = getDb(env.DB);
    await new IdentityService(gdb).ensureProductAccount(userId, 'live');
    const session = await createSession(gdb, userId, env.SESSION_SECRET, { product: 'live' });
    sessionCookie = `__session=${encodeURIComponent(session.cookieValue)}`;
  }
  return Response.json({
    eventId: created.eventId,
    slug: created.slug,
    categoryId: cat[0]?.id,
    orgId,
    userId,
    sessionCookie,
  });
};

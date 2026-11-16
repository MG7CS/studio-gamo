// Test-only workerd adapter: real application route handlers + test fixtures, no deployed route.
// Public accounts were removed (2026-11-16); the only signed-in users are admin staff. `/test/staff-session`
// stands in for the admin gateway sign-in (Cloudflare Access + admin password, covered by
// tests/e2e/admin-signin.spec.ts) so the provisioning route can be exercised inside workerd against D1.
import { POST as provisionStaff } from '../../apps/admin/src/pages/api/staff/provision';
import { createSession } from '../../packages/auth/index';
import { getDb } from '../../packages/db/index';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity';
import { createR2StorageClient } from '../../packages/integrations/src/storage';

async function staffSession(request: Request, env: any): Promise<Response> {
  const { email, role } = (await request.json()) as { email: string; role?: string };
  const db = getDb(env.DB);
  const identity = new StaffIdentityService(db);
  const user = await identity.findOrCreateUser(email);
  await env.DB.prepare('UPDATE users SET verified_email_at = unixepoch() WHERE id = ?').bind(user.id).run();
  if (role) await identity.assignSystemRole(user.id, role);
  const session = await createSession(db, user.id, env.SESSION_SECRET);
  return Response.json(
    { data: { user: { id: user.id, email: user.email } } },
    { headers: { 'set-cookie': `__session=${encodeURIComponent(session.cookieValue)}; Path=/; HttpOnly` } },
  );
}

async function r2Check(env: any): Promise<Response> {
  const storage = createR2StorageClient(env.ASSETS, { signingSecret: env.SESSION_SECRET });
  await storage.putObject(
    'restricted_verification/sample/audit.pdf',
    new TextEncoder().encode('%PDF-1.7 fictional'),
    {
      scope: 'restricted_verification',
      accessPolicy: 'restricted',
      ownerUserId: 'sample',
      contentType: 'application/pdf',
    },
  );
  let denied = false;
  try {
    await storage.getObject('restricted_verification/sample/audit.pdf', { isStaff: true });
  } catch {
    denied = true;
  }
  return Response.json({
    denied,
    owner: !!(await storage.getObject('restricted_verification/sample/audit.pdf', { userId: 'sample' })),
  });
}

export default {
  async fetch(request: Request, env: any) {
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && path === '/test/staff-session') return staffSession(request, env);
    if (path === '/test/r2') return r2Check(env);
    if (path !== '/api/staff/provision') return new Response('Not found', { status: 404 });
    // What the admin middleware puts on locals after verifying the Cloudflare Access assertion.
    const locals: Record<string, any> = { runtime: { env } };
    const staffEmail = request.headers.get('cf-access-authenticated-user-email');
    const staffSubject = request.headers.get('cf-access-authenticated-user-id');
    if (staffEmail) locals.staffEmail = staffEmail;
    if (staffSubject) locals.staffSubject = staffSubject;
    return provisionStaff({ request, params: {}, locals } as any);
  },
};

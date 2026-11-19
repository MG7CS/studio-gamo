/**
 * Admin foundation (apps/admin/src/lib, data/nav.ts): the helper contract every admin screen builds on.
 * Pages cannot be compiled by node:test, so the page-level checks run the real admin middleware with a
 * stand-in handler that calls `adminPage` exactly as a page does, and read the page sources.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthError, createSession, buildAdminGateCookie, resolveAuth } from '../../packages/auth/index.ts';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity.ts';
import { createDb } from '../../packages/db/index.ts';
import { createMigratedD1 } from '../../packages/db/testing.ts';
import { adminApi, adminPage } from '../../apps/admin/src/lib/admin-page.ts';
import { domainErrorResponse } from '../../apps/admin/src/lib/domain-errors.ts';

const ORIGIN = 'https://admin.gamostudio.org';
const secret = 'admin-foundation-secret-0123456789abcdef';

async function bodyOf(res: Response) {
  return (await res.json()) as {
    success: boolean;
    error: { code: string; message: string; details?: unknown };
  };
}

test('domainErrorResponse: unknown errors are a generic 500 that leaks nothing', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const leaky = new Error(
      'SQLITE_ERROR: no such table: users at /Users/x/repo/file.ts sk_live_secret123 stack...',
    );
    for (const err of [leaky, 'a string', null, { message: 'x' }, new TypeError('boom')]) {
      const res = domainErrorResponse(err);
      assert.equal(res.status, 500);
      const text = JSON.stringify(await bodyOf(res));
      assert.ok(text.includes('INTERNAL_ERROR'));
      assert.ok(!/sqlite|sk_live|\/Users|stack|boom|table/i.test(text), text);
    }
    // A trusted-looking prefix on an unknown Error must not be echoed as a domain refusal.
    assert.equal(domainErrorResponse(new Error('NOT_FOUND: users row 42')).status, 500);
  } finally {
    console.error = originalError;
  }
});

async function adminFixture() {
  const d1 = await createMigratedD1();
  const db = createDb(d1);
  const identity = new StaffIdentityService(db);
  const staff = await identity.findOrCreateUser('reviewer@example.invalid', 'Sample Reviewer');
  await identity.assignSystemRole(staff.id, 'staff_reviewer');
  const session = await createSession(db, staff.id, secret);
  const gate = await buildAdminGateCookie(session.sessionId, staff.id, session.expiresAt, secret, {
    secure: true,
    sameSite: 'Lax',
    path: '/',
  });
  const cookie = [`__session=${encodeURIComponent(session.cookieValue)}`, gate.split(';')[0]].join('; ');
  return { d1, staff, cookie };
}

async function loadMiddleware() {
  const { onRequest } = await import('../../apps/admin/src/middleware.ts');
  return async (context: any, next: () => Promise<Response>): Promise<Response> => {
    const result = await onRequest(context, next);
    assert.ok(result instanceof Response);
    return result;
  };
}

/** The same two lines every admin page starts with. */
async function pageHandler(context: any): Promise<Response> {
  try {
    const admin = await adminPage(context);
    return Response.json({ staff: admin.staff, hasDb: typeof admin.db.prepare === 'function' });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

test('admin pages render through the middleware for a staff session and answer 401 without one', async () => {
  const onRequest = await loadMiddleware();
  const f = await adminFixture();
  try {
    const env = {
      DB: f.d1,
      ENVIRONMENT: 'production',
      REQUIRE_ADMIN_AUTH: 'true',
      SESSION_SECRET: secret,
      CF_ACCESS_AUD: 'aud-tag-123',
      CF_ACCESS_TEAM_NAME: 'gamoteam',
    };
    const run = async (path: string, headers: Record<string, string> = {}) => {
      const request = new Request(`${ORIGIN}${path}`, { headers });
      const context: any = {
        request,
        params: {},
        locals: { runtime: { env } },
      };
      return onRequest(context, async () => pageHandler(context));
    };
    for (const path of ['/', '/forms', '/submissions', '/roster', '/requests', '/invoices', '/security']) {
      const anon = await run(path);
      assert.equal(anon.status, 401, `${path} without a session`);
      assert.equal(anon.headers.get('Cache-Control'), 'no-store');

      const staff = await run(path, { cookie: f.cookie });
      assert.equal(staff.status, 200, `${path} with a staff session`);
      const body = (await staff.json()) as {
        staff: { userId: string; email: string; name: string };
        hasDb: boolean;
      };
      assert.equal(body.staff.email, 'reviewer@example.invalid');
      assert.equal(body.staff.userId, f.staff.id);
      assert.equal(body.hasDb, true);
    }
    // A forged cookie value is not a session.
    assert.equal((await run('/', { cookie: '__session=forged; __admin_gate=forged' })).status, 401);
  } finally {
    f.d1.sqlite.close();
  }
});

test('adminPage throws a 401 Response without a staff session and 403 for a cross-origin write', async () => {
  const d1 = await createMigratedD1();
  try {
    const env = { DB: d1, SESSION_SECRET: secret };
    const req = (method = 'GET', headers: Record<string, string> = {}) =>
      new Request(`${ORIGIN}/forms`, { method, headers });
    await assert.rejects(
      adminPage({ request: req(), locals: { runtime: { env } } as never }),
      (e: unknown) => e instanceof Response && e.status === 401,
    );
    const fixture = await adminFixture();
    try {
      // A validated session present in locals, a POST from another origin.
      const auth = await resolveAuth(
        new Request(`${ORIGIN}/`, { headers: { cookie: fixture.cookie } }),
        createDb(fixture.d1),
        secret,
      );
      assert.ok(auth);
      const locals = { runtime: { env: { DB: fixture.d1, SESSION_SECRET: secret } }, adminAuthSession: auth };
      const ok = await adminPage({ request: req(), locals: locals as never });
      assert.equal(ok.staff.email, 'reviewer@example.invalid');
      assert.equal(ok.auth.user.id, fixture.staff.id);
      await assert.rejects(
        adminPage({ request: req('POST', { origin: 'https://evil.invalid' }), locals: locals as never }),
        (e: unknown) => e instanceof Response && e.status === 403,
      );
      const okPost = await adminPage({
        request: req('POST', { origin: ORIGIN }),
        locals: locals as never,
      });
      assert.equal(okPost.staff.userId, fixture.staff.id);
      // Without a database binding the page gets a 503 Response, not a crash.
      await assert.rejects(
        adminPage({
          request: req(),
          locals: { runtime: { env: { SESSION_SECRET: secret } }, adminAuthSession: auth } as never,
        }),
        (e: unknown) => e instanceof Response && e.status === 503,
      );
    } finally {
      fixture.d1.sqlite.close();
    }
  } finally {
    d1.sqlite.close();
  }
});

test('adminApi runs the staff gate: unauthenticated and cross-origin requests are refused, staff pass', async () => {
  const f = await adminFixture();
  try {
    const env = { DB: f.d1, ENVIRONMENT: 'production', SESSION_SECRET: secret };
    const call = (method: string, headers: Record<string, string>) =>
      adminApi({
        request: new Request(`${ORIGIN}/api/forms`, { method, headers }),
        locals: { runtime: { env } },
        params: {},
      } as never);
    await assert.rejects(call('GET', {}), (e: unknown) => e instanceof AuthError && e.status === 401);
    await assert.rejects(
      call('POST', { cookie: f.cookie, origin: 'https://evil.invalid' }),
      (e: unknown) => e instanceof AuthError && e.status === 403,
    );
    const ok = await call('POST', { cookie: f.cookie, origin: ORIGIN });
    assert.equal(ok.staff.email, 'reviewer@example.invalid');
    assert.equal(ok.staff.userId, f.staff.id);
    assert.equal(typeof ok.db.prepare, 'function');
    assert.equal(ok.auth.user.id, f.staff.id);
    assert.deepEqual(Object.keys(ok).sort(), ['auth', 'db', 'env', 'staff']);
    // domainErrorResponse turns the refusal into the standard 401/403 body.
    const refused = await call('GET', {}).catch((e) => domainErrorResponse(e));
    assert.equal((refused as Response).status, 401);
  } finally {
    f.d1.sqlite.close();
  }
});

// ---------------------------------------------------------------------------------------------
// page sources
// ---------------------------------------------------------------------------------------------

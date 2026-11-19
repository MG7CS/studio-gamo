/**
 * Public accounts were removed (2026-11-16): the four public apps have no sign-in surface. Through the
 * real middleware and route handlers this checks that no session or Clerk state is established on a
 * public page (even with old Clerk variables or a session cookie present), and that no public source file links to sign-in, Clerk or the removed auth APIs.
 * Admin staff sign-in (Cloudflare Access + admin password) is covered by security.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { applicationPages } from '../../packages/domain/src/api/page-middleware.ts';

type PublicApp = 'web' | 'worship' | 'academy' | 'production';
const appMiddleware = (app: PublicApp) => applicationPages(app);
const APPS: PublicApp[] = ['web', 'worship', 'academy', 'production'];
const SECRET = 'auth-surface-test-session-secret-0123456789';
const pk = (host: string) => `pk_live_${Buffer.from(`${host}$`).toString('base64').replace(/=+$/, '')}`;

async function migratedD1() {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .map((n) => readFileSync(`packages/db/migrations/${n}`, 'utf8')),
  );
  return d1;
}

const pageContext = (
  app: PublicApp,
  path: string,
  env: Record<string, unknown>,
  headers: Record<string, string> = {},
) => {
  const url = new URL(`https://${app}.example.test${path}`);
  return {
    request: new Request(url, { headers }),
    url,
    locals: { runtime: { env } } as Record<string, any>,
    redirect: (location: string, status = 302) =>
      new Response(null, { status, headers: { Location: location } }),
  };
};

for (const app of APPS) {
  test(`${app}: a public page establishes no session or Clerk state, even with old Clerk variables set`, async () => {
    const suffix = app.toUpperCase();
    const env = {
      ENVIRONMENT: 'production',
      DB: await migratedD1(),
      SESSION_SECRET: SECRET,
      [`PUBLIC_CLERK_PUBLISHABLE_KEY_${suffix}`]: pk('clerk.example.org'),
      [`CLERK_SECRET_KEY_${suffix}`]: 'sk_live_x',
      [`CLERK_APP_ID_${suffix}`]: 'app_real_id',
    };
    const context = pageContext(app, '/', env, { cookie: '__session=forged; __client_uat=1' });
    let rendered = false;
    const response = await appMiddleware(app)(context as never, async () => {
      rendered = true;
      return new Response('page');
    });
    assert.equal(rendered, true);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null, `${app}: no cookie is set on a public page`);
    assert.equal(context.locals.auth ?? null, null, `${app}: no public session`);
    assert.ok(!context.locals.clerkConfig?.isConfigured, `${app}: Clerk is never wired in`);
    assert.doesNotMatch(response.headers.get('content-security-policy') ?? '', /clerk/i);
  });
}

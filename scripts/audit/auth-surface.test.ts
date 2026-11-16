/**
 * Public accounts were removed (2026-11-16): the four public apps have no sign-in surface. Through the
 * real middleware and route handlers this checks that no session or Clerk state is established on a
 * public page (even with old Clerk variables or a session cookie present), that retired account URLs only
 * redirect home, and that no public source file links to sign-in, Clerk or the removed auth APIs.
 * Admin staff sign-in (Cloudflare Access + admin password) is covered by security.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { applicationPages } from '../../packages/domain/src/api/page-middleware.ts';
import { legacyRedirects as webRedirects } from '../../apps/web/src/lib/legacy-redirects.ts';
import { legacyRedirects as worshipRedirects } from '../../apps/worship/src/lib/legacy-redirects.ts';
import { legacyRedirects as academyRedirects } from '../../apps/academy/src/lib/legacy-redirects.ts';
import { legacyRedirects as productionRedirects } from '../../apps/production/src/lib/legacy-redirects.ts';
import { siteOrigin } from '../../packages/ui/src/lib/sites.ts';

type PublicApp = 'web' | 'worship' | 'academy' | 'production';
/** The public-site middleware exactly as each app's src/middleware.ts configures it. */
const LEGACY = {
  web: webRedirects,
  worship: worshipRedirects,
  academy: academyRedirects,
  production: productionRedirects,
};
const appMiddleware = (app: PublicApp) => applicationPages(app, { legacyRedirects: LEGACY[app] });
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

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'dist' ? [] : walk(path);
    return /\.(astro|ts|tsx|mjs|js)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

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

  test(`${app}: retired sign-in and account URLs redirect home and are never cached`, async () => {
    const env = { ENVIRONMENT: 'production', DB: await migratedD1(), SESSION_SECRET: SECRET };
    for (const path of [
      '/account/signin',
      '/account/signup',
      '/account/verify',
      '/account/recover',
      '/account',
    ]) {
      const response = await appMiddleware(app)(
        pageContext(app, path, env) as never,
        async () => new Response('page'),
      );
      assert.equal(response.status, 302, `${app} ${path}`);
      assert.equal(response.headers.get('location'), '/', `${app} ${path}`);
      assert.equal(response.headers.get('cache-control'), 'no-store', `${app} ${path}`);
    }
  });

  test(`${app}: sitemap.xml lists no account page`, async () => {
    const { GET } = await import(`../../apps/${app}/src/pages/sitemap.xml.ts`);
    const url = `${siteOrigin(app)}/sitemap.xml`;
    const res: Response = await GET({ request: new Request(url), url: new URL(url), locals: {}, params: {} });
    assert.ok(!(await res.text()).includes('/account'));
  });
}

test('the Clerk integration, product Clerk variables and shared auth UI are gone', () => {
  for (const path of [
    'packages/auth/clerk.ts',
    'packages/config/clerk-env.ts',
    'packages/ui/src/components/auth',
    'packages/ui/src/components/account',
    'packages/ui/src/components/onboarding',
    'packages/ui/src/lib/auth-flow-client.ts',
    'packages/ui/src/lib/clerk-browser.ts',
    'scripts/set-clerk-secrets.sh',
    'scripts/clerk',
  ])
    assert.ok(!existsSync(path), `${path} still exists`);
});

test('no public app or shared UI source links to sign-in, Clerk or the removed auth APIs', () => {
  const sources = [
    ...APPS.flatMap((app) => walk(`apps/${app}/src`)),
    ...walk('packages/ui/src'),
    ...walk('packages/auth'),
    ...walk('packages/config'),
  ];
  assert.ok(sources.length > 0);
  const forbidden: [RegExp, string][] = [
    [/\/account\/(signin|signup|verify|recover|onboarding|profile|inquiries)/, 'account page link'],
    [/\/api\/(auth|account|organizations|participation)\b/, 'removed API'],
    [/@clerk\//, 'Clerk SDK'],
    [/CLERK_[A-Z_]+/, 'Clerk variable'],
    [/providerSignupUrl/, 'provider sign-up link'],
    [/GamoAuthExperience/, 'shared auth UI'],
  ];
  const hits: string[] = [];
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const [pattern, label] of forbidden) if (pattern.test(text)) hits.push(`${file}: ${label}`);
  }
  assert.deepEqual(hits, []);
});

test('web llms.txt does not point crawlers at account pages', async () => {
  const { GET } = await import('../../apps/web/src/pages/llms.txt.ts');
  const url = `${siteOrigin('web')}/llms.txt`;
  const res: Response = await GET({
    request: new Request(url),
    url: new URL(url),
    locals: {},
    params: {},
  } as never);
  assert.ok(!(await res.text()).includes('/account'));
});

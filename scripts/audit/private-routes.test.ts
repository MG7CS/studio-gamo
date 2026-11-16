/**
 * Every route in every app is either explicitly public or denies anonymous visitors.
 *
 * Pages: each file under apps/<app>/src/pages is classified. Public ones must be listed in
 * PUBLIC_PAGES (so a new private-looking page cannot ship public by accident); every other page
 * is run through the real `applicationPages()` middleware anonymously and must redirect to sign-in.
 * APIs: every exported method of every apps/<app>/src/pages/api route that is not in PUBLIC_API is
 * called anonymously and must answer 401 or 403. The admin app is checked through its middleware.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { applicationPages } from '../../packages/domain/src/api/page-middleware.ts';
import type { PublicApp } from '../../packages/auth/page-access.ts';

const SECRET = 'private-routes-test-session-secret-0123456789';
const PUBLIC_APPS: PublicApp[] = ['web', 'worship', 'academy', 'production'];
const AUTH_PAGES = [
  '/account/signin',
  '/account/signup',
  '/account/verify',
  '/account/recover',
  '/account/access-denied',
  '/account/signed-out',
  '/account/sso-callback',
];
const CRAWLER_FILES = ['/robots.txt', '/sitemap.xml'];
/** Error pages render for any path (Astro uses them for unmatched routes and server errors). */
const ERROR_PAGES = ['/404', '/500'];

/** Pages anyone may view. Anything not listed here must be private. */
const PUBLIC_PAGES: Record<PublicApp, string[]> = {
  web: [
    '/',
    '/mission',
    '/get-started',
    '/get-involved',
    '/support',
    '/faq',
    '/legal',
    '/legal/[slug]',
    '/contact',
    '/partners',
    '/partners/interest',
    '/llms.txt',
    ...AUTH_PAGES,
    ...CRAWLER_FILES,
    ...ERROR_PAGES,
  ],
  worship: ['/', '/opportunities', ...AUTH_PAGES, ...CRAWLER_FILES, ...ERROR_PAGES],
  academy: [
    '/',
    '/instruments',
    '/instruments/[slug]',
    '/lessons',
    '/lessons/[slug]',
    '/instructors/[slug]',
    '/sponsored',
    // Guest registration (no account, design §4.7): the receipt needs a signed reference and the manage
    // page a customer cookie from an emailed link; both are noindex and disallowed in robots.txt.
    '/register/[lesson]',
    '/registrations/find',
    '/registrations/open',
    '/registrations/receipt',
    '/registrations/manage',
    ...AUTH_PAGES,
    ...CRAWLER_FILES,
    ...ERROR_PAGES,
  ],
  production: [
    '/',
    '/services',
    '/services/[slug]',
    '/training',
    ...AUTH_PAGES,
    ...CRAWLER_FILES,
    ...ERROR_PAGES,
  ],
};

/** API methods anyone may call (each enforces its own gate: OTP, signature, local-only, etc.). */
const PUBLIC_API = new Set([
  'POST /api/auth/challenge',
  'POST /api/auth/verify',
  'POST /api/auth/session', // demo session: local + loopback only, 403 elsewhere
  'DELETE /api/auth/session', // signing out without a session is harmless
  'POST /api/auth/clerk-webhook', // Svix signature with this product's CLERK_WEBHOOK_SECRET_<APP>
  'POST /api/webhook/resend', // Svix signature; 503 without RESEND_WEBHOOK_SECRET
]);

function walk(dir: string, base = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const rel = `${base}/${name}`;
    if (statSync(path).isDirectory()) return walk(path, rel);
    return /\.(astro|ts)$/.test(name) ? [rel] : [];
  });
}
const toRoute = (file: string) => file.replace(/\.(astro|ts)$/, '').replace(/\/index$/, '') || '/';
const toSamplePath = (route: string) => route.replace(/\[(\.\.\.)?[a-z]+\]/g, 'sample');

async function migratedEnv() {
  const d1 = createInMemoryD1();
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .map((n) => readFileSync(`packages/db/migrations/${n}`, 'utf8')),
  );
  return {
    ENVIRONMENT: 'production',
    DB: d1,
    SESSION_SECRET: SECRET,
  };
}

function apiContext(
  url: string,
  method: string,
  env: Record<string, unknown>,
  params: Record<string, string>,
) {
  const origin = new URL(url).origin;
  const request = new Request(url, {
    method,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json', origin },
    body: method === 'GET' || method === 'DELETE' ? undefined : '{}',
  });
  return {
    request,
    url: new URL(url),
    params,
    locals: { runtime: { env } },
    redirect: (location: string, status = 302) => new Response(null, { status, headers: { location } }),
  };
}

for (const app of PUBLIC_APPS) {
  test(`${app}: every page is public by allowlist or redirects anonymous visitors to sign-in`, async () => {
    const env = await migratedEnv();
    const middleware = applicationPages(app);
    const routes = walk(`apps/${app}/src/pages`)
      .filter((f) => !f.startsWith('/api/'))
      .map(toRoute);
    const allow = new Set(PUBLIC_PAGES[app]);
    for (const listed of allow)
      assert.ok(routes.includes(listed), `${app}: allowlisted ${listed} has no page`);

    const privateRoutes = routes.filter((r) => !allow.has(r));
    assert.ok(privateRoutes.length > 0, `${app}: no private pages were exercised`);
    for (const route of privateRoutes) {
      const url = new URL(`https://${app}.example.test${toSamplePath(route)}`);
      const context = {
        request: new Request(url),
        url,
        locals: { runtime: { env } } as Record<string, unknown>,
        redirect: (path: string, status = 302) => new Response(null, { status, headers: { Location: path } }),
      };
      let rendered = false;
      const response = await middleware(context as never, async () => {
        rendered = true;
        return new Response('page body');
      });
      assert.equal(rendered, false, `${app} ${route} rendered for an anonymous visitor`);
      assert.equal(response.status, 303, `${app} ${route}`);
      assert.match(response.headers.get('location') ?? '', /^\/account\/signin\?next=/, `${app} ${route}`);
    }
  });

  test(`${app}: every non-public API method rejects anonymous callers with 401/403`, async () => {
    const env = await migratedEnv();
    let checked = 0;
    for (const file of walk(`apps/${app}/src/pages/api`)) {
      const route = `/api${toRoute(file)}`;
      const mod = (await import(`../../apps/${app}/src/pages/api${file}`)) as Record<string, unknown>;
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const handler = mod[method];
        if (typeof handler !== 'function' || PUBLIC_API.has(`${method} ${route}`)) continue;
        const url = `https://${app}.example.test${toSamplePath(route)}`;
        const params = Object.fromEntries(
          [...route.matchAll(/\[(?:\.\.\.)?([a-z]+)\]/g)].map((m) => [m[1], 'sample']),
        );
        const response = (await handler(apiContext(url, method, env, params))) as Response;
        assert.ok(
          [401, 403].includes(response.status),
          `${app} ${method} ${route} answered ${response.status}`,
        );
        checked++;
      }
    }
    // Every app has at least GET /api/auth/me and POST /api/organizations.
    assert.ok(checked >= 2, `${app}: only ${checked} private API methods exercised`);
  });
}

test('admin: pages and APIs reject anonymous requests through the admin middleware', async () => {
  const env = {
    ...(await migratedEnv()),
    REQUIRE_ADMIN_AUTH: 'true',
    CF_ACCESS_TEAM_NAME: 't',
    CF_ACCESS_AUD: 'a',
  };
  const { onRequest } = await import('../../apps/admin/src/middleware.ts');
  const routes = [...walk('apps/admin/src/pages').map((f) => toRoute(f)), '/__admin_auth/password'];
  for (const route of routes) {
    const url = new URL(`https://admin.example.test${toSamplePath(route)}`);
    for (const method of route.startsWith('/api/') ? ['GET', 'POST'] : ['GET']) {
      const context = apiContext(url.href, method, env, {});
      let rendered = false;
      const response = (await onRequest(context as never, async () => {
        rendered = true;
        return new Response('ok');
      })) as Response;
      assert.equal(rendered, false, `admin ${method} ${route} reached the page/handler anonymously`);
      assert.ok([401, 403].includes(response.status), `admin ${method} ${route} answered ${response.status}`);
      assert.equal(
        response.headers.get('cache-control'),
        'no-store',
        `admin ${method} ${route} is cacheable`,
      );
    }
  }
});

test('Resend webhook rejects unsigned and badly signed payloads before touching the database', async () => {
  const env = await migratedEnv();
  const { POST } = await import('../../apps/web/src/pages/api/webhook/resend.ts');
  const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 're_1' } });
  const post = async (e: Record<string, unknown>, headers: Record<string, string>) =>
    (
      await POST({
        request: new Request('https://web.example.test/api/webhook/resend', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body,
        }),
        locals: { runtime: { env: e } },
        params: {},
      } as never)
    ).status;
  const ts = String(Math.floor(Date.now() / 1000));
  const signed = { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': 'v1,deadbeef' };
  // Without RESEND_WEBHOOK_SECRET the route is unavailable (503), never a fake success.
  assert.equal(await post(env, signed), 503);
  const configured = { ...env, RESEND_WEBHOOK_SECRET: `whsec_${btoa('private-routes-resend-secret')}` };
  assert.equal(await post(configured, {}), 400, 'no Svix headers');
  assert.equal(await post(configured, signed), 400, 'bad signature');
});

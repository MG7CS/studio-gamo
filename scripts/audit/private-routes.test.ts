/**
 * Public apps have no accounts, sign-in or dashboards (removed 2026-11-16): every page is public by
 * allowlist and renders for an anonymous visitor, and the only
 * public-app API methods are allowlisted ones that enforce their own gate. The admin app stays fully
 * private through its middleware (Cloudflare Access + admin password).
 *
 * Pages: each file under apps/<app>/src/pages must be listed in PUBLIC_PAGES (so a page cannot ship
 * without someone deciding it is public) and is run through the real `applicationPages()` middleware
 * anonymously. APIs: every exported method of every apps/<app>/src/pages/api route must be listed in
 * PUBLIC_API. The admin app is checked through its middleware.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { applicationPages } from '../../packages/domain/src/api/page-middleware.ts';

type PublicApp = 'web' | 'worship' | 'academy' | 'production';
const appMiddleware = (app: PublicApp) => applicationPages(app);
const SECRET = 'private-routes-test-session-secret-0123456789';
const PUBLIC_APPS: PublicApp[] = ['web', 'worship', 'academy', 'production'];
const CRAWLER_FILES = ['/robots.txt', '/sitemap.xml'];
/** Error pages render for any path (Astro uses them for unmatched routes and server errors). */
const ERROR_PAGES = ['/404', '/500'];

/** Pages anyone may view. Every page of a public app must be listed here. */
const PUBLIC_PAGES: Record<PublicApp, string[]> = {
  web: [
    '/',
    '/preview/catalog',
    '/preview/dynamic-form',
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
    // The public forms (staff-edited; Worship and Production apply and request).
    '/worship/apply',
    '/worship/request',
    '/production/apply',
    '/production/request',
    // Emailed offer link: the token is the credential, noindex and disallowed in robots.txt.
    '/worship/offers/[token]',
    '/llms.txt',
    ...CRAWLER_FILES,
    ...ERROR_PAGES,
  ],
  worship: ['/', ...CRAWLER_FILES, ...ERROR_PAGES],
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
    ...CRAWLER_FILES,
    ...ERROR_PAGES,
  ],
  production: ['/', '/services', '/services/[slug]', '/training', ...CRAWLER_FILES, ...ERROR_PAGES],
};

/** API methods anyone may call (each enforces its own gate: signature, Turnstile, signed link, etc.). */
const PUBLIC_API = new Set([
  'web POST /api/webhook/resend', // Svix signature; 503 without RESEND_WEBHOOK_SECRET
  'web POST /api/webhook/stripe', // Stripe signature; 503 without STRIPE_WEBHOOK_SECRET
  'web POST /api/forms/[slug]/upload-session', // same-origin + Turnstile + per-IP limit
  'web POST /api/forms/uploads', // same-origin + live upload-session token + per-IP limit
  'web PUT /api/forms/uploads/[id]/parts/[n]', // same-origin + X-Upload-Token + Content-Length cap
  'web POST /api/forms/uploads/[id]/complete', // same-origin + X-Upload-Token
  'web DELETE /api/forms/uploads/[id]', // same-origin + X-Upload-Token
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

function pageContext(app: PublicApp, path: string, env: Record<string, unknown>) {
  const url = new URL(`https://${app}.example.test${path}`);
  return {
    request: new Request(url),
    url,
    locals: { runtime: { env } } as Record<string, unknown>,
    redirect: (location: string, status = 302) =>
      new Response(null, { status, headers: { Location: location } }),
  };
}

for (const app of PUBLIC_APPS) {
  test(`${app}: every page is allowlisted as public and renders for an anonymous visitor`, async () => {
    const env = await migratedEnv();
    const middleware = appMiddleware(app);
    const routes = walk(`apps/${app}/src/pages`)
      .filter((f) => !f.startsWith('/api/'))
      .map(toRoute);
    const allow = new Set(PUBLIC_PAGES[app]);
    for (const listed of allow)
      assert.ok(routes.includes(listed), `${app}: allowlisted ${listed} has no page`);
    for (const route of routes) {
      assert.ok(
        allow.has(route),
        `${app}: ${route} is not in PUBLIC_PAGES (public apps have no private pages)`,
      );
      let rendered = false;
      const response = await middleware(pageContext(app, toSamplePath(route), env) as never, async () => {
        rendered = true;
        return new Response('page body');
      });
      assert.equal(rendered, true, `${app} ${route} did not render for an anonymous visitor`);
      assert.equal(response.status, 200, `${app} ${route}`);
      assert.doesNotMatch(response.headers.get('location') ?? '', /\/account\//, `${app} ${route}`);
    }
  });

  test(`${app}: no account, auth or organization API routes remain; every API method is allowlisted`, async () => {
    for (const gone of ['auth', 'account', 'organizations', 'participation'])
      assert.ok(!existsSync(`apps/${app}/src/pages/api/${gone}`), `${app}: api/${gone} still exists`);
    if (!existsSync(`apps/${app}/src/pages/api`)) return;
    for (const file of walk(`apps/${app}/src/pages/api`)) {
      const route = `/api${toRoute(file)}`;
      const mod = (await import(`../../apps/${app}/src/pages/api${file}`)) as Record<string, unknown>;
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (typeof mod[method] !== 'function') continue;
        assert.ok(
          PUBLIC_API.has(`${app} ${method} ${route}`),
          `${app} ${method} ${route} is not allowlisted`,
        );
      }
    }
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

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
const PUBLIC_APPS: PublicApp[] = ['web', 'worship', 'academy', 'live', 'production'];
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
    '/live',
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
  live: [
    '/',
    '/events',
    '/events/[id]',
    // Free RSVP and email-verified ticket recovery are public by design.
    '/events/[id]/register',
    '/link',
    '/waitlist/confirm',
    '/tickets/find',
    '/tickets/confirm',
    '/tickets/manage',
    '/tickets/orders/[id]',
    '/tickets/orders/[id]/tickets.pdf',
    '/tickets/orders/[id]/event.ics',
    '/tickets/[id]/transfer',
    '/tickets/[id]/ticket.svg',
    '/tickets/[id]/ticket.pdf',
    '/tickets/[id]/qr.png',
    '/local-test/inbox',
    '/local-test/fixtures',
    '/local-test/stripe-checkout/[session]',
    '/venues',
    '/artists',
    '/artists/[slug]',
    // Door scanner (Agent C): gated by the scanner device cookie or an organizer session with
    // scan_tickets inside the page; anyone else sees "open the scanner link" (no account needed).
    '/scan',
    '/scan/[event]',
    '/scan/[event]/unlock',
    '/scan/[event]/lookup',
    '/scan/[event]/door',
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
  'GET /api/events',
  'GET /api/events/[id]',
  'GET /api/artists',
  'POST /api/events/[id]/register', // free RSVP (Turnstile + limits; tickets after email confirmation)
  'POST /api/tickets/lookup', // emails a link; same answer for every address
  'POST /api/checkout/session', // guest checkout; fails closed without Stripe
  'POST /api/webhook/stripe', // Stripe signature
  'POST /api/auth/clerk-webhook', // Svix signature with this product's CLERK_WEBHOOK_SECRET_<APP>
  'GET /api/venue-maps/[id]', // venue blueprint image (random id, sandboxed image response)
  'POST /api/webhook/resend', // Svix signature; 503 without RESEND_WEBHOOK_SECRET
  'POST /api/orders/confirm', // emailed one-time code, limited per order
  'POST /api/events/[id]/waitlist', // Turnstile + rate limits; same answer for every address
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
    STRIPE_WEBHOOK_SECRET: 'whsec_test_only',
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
    // Every app has at least GET /api/auth/me and POST /api/organizations; live has many more.
    assert.ok(checked >= (app === 'live' ? 13 : 2), `${app}: only ${checked} private API methods exercised`);
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
  const routes = [
    ...walk('apps/admin/src/pages').map((f) => toRoute(f)),
    '/live/submissions',
    '/__admin_auth/password',
  ];
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

test('Stripe webhook rejects unsigned and badly signed payloads before touching the database', async () => {
  const env = await migratedEnv();
  const { POST } = await import('../../apps/live/src/pages/api/webhook/stripe.ts');
  const body = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: {} },
  });
  for (const signature of [undefined, 't=1,v1=deadbeef']) {
    const request = new Request('https://live.example.test/api/webhook/stripe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(signature ? { 'stripe-signature': signature } : {}),
      },
      body,
    });
    const response = await POST({ request, locals: { runtime: { env } }, params: {} } as never);
    assert.equal(response.status, 400, `signature ${signature ?? '(none)'}`);
  }
});

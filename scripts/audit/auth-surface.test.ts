/**
 * The sign-in surface of the five public apps, through the real middleware and route handlers:
 * account pages stay out of search and caches, Clerk's browser origins are in the CSP only when Clerk is
 * on, unauthenticated API calls fail in the documented format, no local-only mode works outside local
 * development, and the emailed-code fallback is rate limited.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { applicationPages } from '../../packages/domain/src/api/page-middleware.ts';
import { createAuthHandlers, isLocalAuthSimulation } from '../../packages/domain/src/http/auth.ts';
import { handleApiError } from '../../packages/domain/src/api/response.ts';
import { IdentityService } from '../../packages/domain/src/services/identity.ts';
import { buildContentSecurityPolicy } from '../../packages/domain/src/http/security-headers.ts';
import { ClerkUnavailableError } from '../../packages/auth/clerk.ts';
import type { PublicApp } from '../../packages/auth/page-access.ts';
import { siteOrigin } from '../../packages/ui/src/lib/sites.ts';
import { GUARD_SECRETS, siteverifyPass } from './auth-test-kit.ts';

const APPS: PublicApp[] = ['web', 'worship', 'academy', 'live', 'production'];
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

const pageContext = (app: PublicApp, path: string, env: Record<string, unknown>) => {
  const url = new URL(`https://${app}.example.test${path}`);
  return {
    request: new Request(url),
    url,
    locals: { runtime: { env } } as Record<string, any>,
    redirect: (location: string, status = 302) =>
      new Response(null, { status, headers: { Location: location } }),
  };
};

for (const app of APPS) {
  test(`${app}: account pages are noindex and never cached`, async () => {
    const env = { ENVIRONMENT: 'production', DB: await migratedD1(), SESSION_SECRET: SECRET };
    const middleware = applicationPages(app);
    for (const path of [
      '/account/signin',
      '/account/signup',
      '/account/verify',
      '/account/recover',
      '/account/access-denied',
      '/account',
    ]) {
      const response = await middleware(
        pageContext(app, path, env) as never,
        async () => new Response('page'),
      );
      if (response.status === 303) continue; // /account itself asks anonymous visitors to sign in first
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', `${app} ${path}`);
      assert.match(response.headers.get('cache-control') ?? '', /no-store|private/, `${app} ${path}`);
    }
    const redirect = await middleware(
      pageContext(app, '/account', env) as never,
      async () => new Response('page'),
    );
    assert.equal(redirect.status, 303);
    assert.match(redirect.headers.get('location') ?? '', /^\/account\/signin\?next=%2Faccount$/);
  });

  test(`${app}: sitemap.xml lists no account page`, async () => {
    const { GET } = await import(`../../apps/${app}/src/pages/sitemap.xml.ts`);
    const url = `${siteOrigin(app)}/sitemap.xml`;
    const res: Response = await GET({ request: new Request(url), url: new URL(url), locals: {}, params: {} });
    assert.ok(!(await res.text()).includes('/account'));
  });

  test(`${app}: Clerk is wired into the page only when it is fully configured`, async () => {
    const d1 = await migratedD1();
    const suffix = app.toUpperCase();
    const run = async (extra: Record<string, unknown>) => {
      const context = pageContext(app, '/account/signin', {
        ENVIRONMENT: 'production',
        DB: d1,
        SESSION_SECRET: SECRET,
        ...extra,
      });
      await applicationPages(app)(context as never, async () => new Response('page'));
      return context.locals.clerkConfig as { isConfigured: boolean; issuer?: string };
    };
    const off = await run({});
    assert.equal(off.isConfigured, false);
    const partial = await run({ [`PUBLIC_CLERK_PUBLISHABLE_KEY_${suffix}`]: pk('clerk.example.org') });
    assert.equal(partial.isConfigured, false, 'a publishable key alone does not turn Clerk on');
    const generic = await run({
      PUBLIC_CLERK_PUBLISHABLE_KEY: pk('clerk.example.org'),
      CLERK_SECRET_KEY: 'sk_live_x',
    });
    assert.equal(generic.isConfigured, false, 'un-suffixed names are ignored when deployed');
    const on = await run({
      [`PUBLIC_CLERK_PUBLISHABLE_KEY_${suffix}`]: pk('clerk.example.org'),
      [`CLERK_SECRET_KEY_${suffix}`]: 'sk_live_x',
      [`CLERK_APP_ID_${suffix}`]: 'app_real_id',
    });
    assert.equal(on.isConfigured, true);
    assert.equal(on.issuer, 'https://clerk.example.org');
  });
}

test('CSP with Clerk allows exactly what Clerk’s components need, and nothing without Clerk', () => {
  const withClerk = buildContentSecurityPolicy({
    https: true,
    clerkFrontendApi: 'https://clerk.gamostudio.org',
  });
  const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `));
  assert.equal(
    directive(withClerk, 'script-src'),
    "script-src 'self' https://challenges.cloudflare.com https://clerk.gamostudio.org",
  );
  assert.equal(
    directive(withClerk, 'connect-src'),
    "connect-src 'self' https://clerk-telemetry.com https://clerk.gamostudio.org",
  );
  assert.equal(directive(withClerk, 'img-src'), "img-src 'self' data: blob: https://img.clerk.com");
  assert.equal(directive(withClerk, 'frame-src'), "frame-src 'self' https://challenges.cloudflare.com");
  assert.equal(directive(withClerk, 'worker-src'), "worker-src 'self' blob:");
  assert.ok(!/\*|unsafe-eval/.test(withClerk), 'no wildcard origin, no eval');
  assert.ok(!directive(withClerk, 'script-src')!.includes('unsafe-inline'));
  assert.equal(directive(withClerk, 'frame-ancestors'), "frame-ancestors 'none'");
  const without = buildContentSecurityPolicy({ https: true });
  assert.ok(!/clerk|cloudflare/.test(without));
});

test('Clerk being unreachable is a 503 with the standard error body, not a sign-in loop or a 500', async () => {
  const res = handleApiError(new ClerkUnavailableError());
  assert.equal(res.status, 503);
  assert.deepEqual(Object.keys(((await res.json()) as { error: object }).error).sort(), ['code', 'message']);
});

for (const app of APPS) {
  test(`${app}: API answers anonymous, cross-origin and cross-product calls in the standard error format`, async () => {
    const d1 = await migratedD1();
    const env = {
      ENVIRONMENT: 'preview',
      DB: d1,
      SESSION_SECRET: SECRET,
      RESEND_API_KEY: 're_real_key',
      EMAIL_FROM: 'Gamo <hello@gamostudio.org>',
      ...GUARD_SECRETS,
    };
    const handlers = createAuthHandlers(app);
    const ctx = (request: Request) => ({ request, locals: { runtime: { env }, product: app } });
    const origin = `https://${app}.example.test`;
    const body = (extra: object) =>
      JSON.stringify({ email: 'person@example.org', 'cf-turnstile-response': 'test-token', ...extra });
    const realFetch = globalThis.fetch;
    globalThis.fetch = siteverifyPass(realFetch);
    try {
      const me = await handlers.meGET(ctx(new Request(`${origin}/api/auth/me`)));
      assert.equal(me.status, 401);
      assert.equal(((await me.json()) as { error: { code: string } }).error.code, 'UNAUTHENTICATED');

      const crossOrigin = await handlers.challengePOST(
        ctx(
          new Request(`${origin}/api/auth/challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
            body: body({}),
          }),
        ),
      );
      assert.equal(crossOrigin.status, 403);
      assert.equal(((await crossOrigin.json()) as { error: { code: string } }).error.code, 'FORBIDDEN');

      const otherProduct = APPS.find((p) => p !== app)!;
      const hijack = await handlers.challengePOST(
        ctx(
          new Request(`${origin}/api/auth/challenge`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin },
            body: body({ product: otherProduct, intent: 'signup' }),
          }),
        ),
      );
      assert.equal(hijack.status, 403, 'a body product other than the serving app is refused');

      const verifyHijack = await handlers.verifyPOST(
        ctx(
          new Request(`${origin}/api/auth/verify`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin },
            body: JSON.stringify({
              email: 'person@example.org',
              code: '123456',
              product: otherProduct,
              intent: 'signup',
            }),
          }),
        ),
      );
      assert.equal(verifyHijack.status, 403);
      assert.equal(
        ((await d1.prepare('SELECT COUNT(*) AS n FROM product_accounts').first()) as { n: number } | null)?.n,
        0,
        'no account was created',
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });
}

test('no simulation or demo mode works outside local development', async () => {
  const loopback = new Request('http://127.0.0.1:4321/api/auth/session');
  const flags = { ALLOW_AUTH_SIMULATION: 'true', ALLOW_DEMO_SESSION: 'true' };
  assert.equal(
    isLocalAuthSimulation(loopback, { ENVIRONMENT: 'local', ALLOW_AUTH_SIMULATION: 'true' } as never),
    true,
  );
  for (const environment of ['preview', 'production', undefined]) {
    assert.equal(
      isLocalAuthSimulation(loopback, { ...flags, ENVIRONMENT: environment } as never),
      false,
      String(environment),
    );
  }
  assert.equal(
    isLocalAuthSimulation(new Request('https://gamostudio.org/'), {
      ...flags,
      ENVIRONMENT: 'local',
    } as never),
    false,
    'local flag on a real host',
  );

  const d1 = await migratedD1();
  for (const environment of ['preview', 'production']) {
    const env = { ENVIRONMENT: environment, DB: d1, SESSION_SECRET: SECRET, ...flags };
    const res = await createAuthHandlers('web').sessionPOST({
      request: new Request('http://127.0.0.1:4321/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:4321' },
        body: JSON.stringify({ email: 'a@b.org' }),
      }),
      locals: { runtime: { env }, product: 'web' },
    });
    assert.equal(res.status, 403, environment);
  }
});

test('emailed-code fallback: codes are rate limited per address and locked after repeated wrong guesses', async () => {
  const db = createDb(await migratedD1());
  const service = new IdentityService(db);
  const email = 'ratelimit@example.org';
  for (let i = 0; i < 5; i++)
    await service.issueEmailChallenge(email, { purpose: 'login', intent: 'signup', product: 'web' });
  // Product-scoped (HTTP) callers get the same answer as any request (the route's per-email limit tells
  // the visitor to wait); nothing is sent or stored past the limit, so a known address is not revealed.
  const sixth = await service.issueEmailChallenge(email, {
    purpose: 'login',
    intent: 'signup',
    product: 'web',
  });
  assert.equal(sixth.deliver, false);
  assert.equal(sixth.code, '');
  await assert.rejects(() => service.issueEmailChallenge(email, { purpose: 'login' }), /RATE_LIMITED/);

  const other = 'lockout@example.org';
  await service.issueEmailChallenge(other, { purpose: 'login', intent: 'signup', product: 'web' });
  for (let i = 0; i < 4; i++) {
    await assert.rejects(
      () =>
        service.verifyEmailChallenge(other, '000000', { purpose: 'login', intent: 'signup', product: 'web' }),
      /Invalid or expired/,
    );
  }
  await assert.rejects(
    () =>
      service.verifyEmailChallenge(other, '000000', { purpose: 'login', intent: 'signup', product: 'web' }),
    /RATE_LIMITED/,
  );
});

test('sign-in code email: sent from the verified domain with a reply-to; a failed send fails cleanly; no log line carries the code', async () => {
  const d1 = await migratedD1();
  const env = {
    ENVIRONMENT: 'preview',
    DB: d1,
    SESSION_SECRET: SECRET,
    RESEND_API_KEY: 're_real_key',
    EMAIL_FROM: 'Gamo Studios <hello@gamostudio.org>',
    ...GUARD_SECRETS,
  };
  const handlers = createAuthHandlers('web');
  const request = (email: string) =>
    new Request('https://gamostudio.org/api/auth/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://gamostudio.org' },
      body: JSON.stringify({ email, intent: 'signup', 'cf-turnstile-response': 'test-token' }),
    });

  const realFetch = globalThis.fetch;
  const logged: string[] = [];
  const consoleMethods = ['log', 'info', 'warn', 'error'] as const;
  const originals = consoleMethods.map((m) => console[m]);
  consoleMethods.forEach(
    (m) => (console[m] = (...args: unknown[]) => void logged.push(args.map(String).join(' '))),
  );
  let sent: { from: string; reply_to: string; to: string[]; html: string; text: string } | undefined;
  try {
    globalThis.fetch = siteverifyPass((async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ id: 'email_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch);
    const ok = await handlers.challengePOST({
      request: request('first@example.org'),
      locals: { runtime: { env }, product: 'web' },
    });
    assert.equal(ok.status, 200);
    assert.match(sent!.from, /<hello@gamostudio\.org>$/);
    assert.equal(sent!.reply_to, 'hello@gamostudio.org');
    const code = /\b(\d{6})\b/.exec(sent!.text)?.[1];
    assert.ok(code, 'the email carries the code');
    assert.ok(!(await ok.text()).includes(code), 'the API response does not echo the code');

    globalThis.fetch = siteverifyPass(
      (async () => new Response('{"message":"boom"}', { status: 500 })) as typeof fetch,
    );
    const failed = await handlers.challengePOST({
      request: request('second@example.org'),
      locals: { runtime: { env }, product: 'web' },
    });
    // A failed send is logged and answered exactly like a success (no timing/body oracle, D-119).
    assert.equal(failed.status, 200);
    assert.equal(((await failed.json()) as { data: { deliveryStatus: string } }).data.deliveryStatus, 'sent');
    const live = (await d1
      .prepare(
        "SELECT COUNT(*) AS n FROM auth_challenges WHERE email = 'second@example.org' AND consumed_at IS NULL",
      )
      .first()) as { n: number } | null;
    assert.equal(live?.n, 0, 'the unsent code was invalidated');

    assert.ok(!logged.some((line) => line.includes(code!)), 'no log line contains the code');
    assert.ok(
      !logged.some((line) => /first@example|second@example/.test(line)),
      'no log line contains the address',
    );
  } finally {
    globalThis.fetch = realFetch;
    consoleMethods.forEach((m, i) => (console[m] = originals[i]));
  }
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

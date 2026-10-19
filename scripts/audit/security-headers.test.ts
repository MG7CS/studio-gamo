import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContentSecurityPolicy,
  exactHttpsOrigins,
  generateCspNonce,
  requestSecurityHeaders,
  securityHeaders,
  withSecurityHeaders,
} from '../../packages/domain/src/http/security-headers.ts';
import {
  applicationPages,
  pageSecurityHeaderOptions,
} from '../../packages/domain/src/api/page-middleware.ts';

const directive = (csp: string, name: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `));

test('CSP forbids inline and third-party script, framing, plugins and foreign form targets', () => {
  const csp = buildContentSecurityPolicy({ https: true });
  assert.equal(directive(csp, 'script-src'), "script-src 'self'");
  assert.equal(directive(csp, 'frame-ancestors'), "frame-ancestors 'none'");
  assert.equal(directive(csp, 'object-src'), "object-src 'none'");
  assert.equal(directive(csp, 'base-uri'), "base-uri 'self'");
  assert.equal(directive(csp, 'form-action'), "form-action 'self'");
  assert.ok(csp.includes('upgrade-insecure-requests'));
  assert.ok(!buildContentSecurityPolicy({ https: false }).includes('upgrade-insecure-requests'));
});

test("Clerk adds its Frontend API and Cloudflare's bot-protection origin to script-src, and only when configured", () => {
  const csp = buildContentSecurityPolicy({
    https: true,
    clerkFrontendApi: 'https://clerk.example.com/v1/whatever',
  });
  assert.equal(
    directive(csp, 'script-src'),
    "script-src 'self' https://challenges.cloudflare.com https://clerk.example.com",
  );
  assert.match(directive(csp, 'connect-src')!, /https:\/\/clerk\.example\.com/);
  assert.match(directive(csp, 'frame-src')!, /challenges\.cloudflare\.com/);
  assert.equal(
    directive(buildContentSecurityPolicy({ https: true, clerkFrontendApi: 'not a url' }), 'script-src'),
    "script-src 'self'",
  );
});

test('baseline headers; HSTS only over HTTPS; geolocation only where requested', () => {
  const h = securityHeaders({ enforceCsp: true, https: true });
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(h['Strict-Transport-Security'], /max-age=31536000/);
  assert.match(h['Permissions-Policy'], /geolocation=\(\)/);
  assert.match(
    securityHeaders({ enforceCsp: true, https: true, allowGeolocation: true })['Permissions-Policy'],
    /geolocation=\(self\)/,
  );
  const dev = securityHeaders({ enforceCsp: false, https: false });
  assert.equal(dev['Strict-Transport-Security'], undefined);
  assert.equal(dev['Content-Security-Policy'], undefined);
});

test('headers are applied even to responses with immutable headers (e.g. Response.redirect)', () => {
  const redirected = withSecurityHeaders(Response.redirect('https://example.test/next', 302), {
    enforceCsp: true,
    https: true,
  });
  assert.equal(redirected.status, 302);
  assert.equal(redirected.headers.get('location'), 'https://example.test/next');
  assert.equal(redirected.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(redirected.headers.get('content-security-policy'));
});

test('Turnstile adds exactly its script and frame origin, and only when configured', () => {
  const csp = buildContentSecurityPolicy({ https: true, turnstile: true });
  assert.equal(directive(csp, 'script-src'), "script-src 'self' https://challenges.cloudflare.com");
  assert.equal(directive(csp, 'frame-src'), "frame-src 'self' https://challenges.cloudflare.com");
  assert.equal(directive(csp, 'connect-src'), "connect-src 'self'");
  assert.ok(!csp.includes('*'), 'no wildcard origin');
  const both = buildContentSecurityPolicy({
    https: true,
    turnstile: true,
    clerkFrontendApi: 'https://clerk.example.com',
  });
  assert.equal(
    directive(both, 'script-src'),
    "script-src 'self' https://challenges.cloudflare.com https://clerk.example.com",
    'the Cloudflare origin appears once with Clerk and Turnstile both on',
  );
  const off = buildContentSecurityPolicy({ https: true, turnstile: false });
  assert.ok(!off.includes('challenges.cloudflare.com'));
});

test('form-action accepts only exact https origins', () => {
  assert.deepEqual(
    exactHttpsOrigins([
      'https://checkout.stripe.com',
      'https://checkout.stripe.com/',
      'https://Checkout.Stripe.com',
      'https://*.stripe.com',
      'https://checkout.stripe.com/pay',
      'http://checkout.stripe.com',
      'https://user:pw@checkout.stripe.com',
      'javascript:alert(1)',
      '*',
      '',
    ]),
    ['https://checkout.stripe.com'],
  );
  const csp = buildContentSecurityPolicy({
    https: true,
    formActionOrigins: ['https://checkout.stripe.com', 'https://*.evil.test', "'unsafe-inline'"],
  });
  assert.equal(directive(csp, 'form-action'), "form-action 'self' https://checkout.stripe.com");
});

test('camera is off by default and (self) only when requested', () => {
  assert.match(securityHeaders({ enforceCsp: true, https: true })['Permissions-Policy'], /camera=\(\)/);
  assert.match(
    securityHeaders({ enforceCsp: true, https: true, camera: true })['Permissions-Policy'],
    /camera=\(self\)/,
  );
});

test('requestSecurityHeaders merges page requests and filters origins', () => {
  const locals: {
    securityRequest?: { formActionOrigins?: readonly string[]; camera?: boolean; noReferrer?: boolean };
  } = {};
  requestSecurityHeaders(locals, { formActionOrigins: ['https://checkout.stripe.com', 'https://*'] });
  requestSecurityHeaders(locals, { camera: true, formActionOrigins: ['https://checkout.stripe.com'] });
  requestSecurityHeaders(locals, { noReferrer: true });
  assert.deepEqual(locals.securityRequest, {
    formActionOrigins: ['https://checkout.stripe.com'],
    camera: true,
    noReferrer: true,
  });
  assert.equal(
    securityHeaders({ enforceCsp: false, https: true, noReferrer: true })['Referrer-Policy'],
    'no-referrer',
  );
  assert.equal(
    securityHeaders({ enforceCsp: false, https: true })['Referrer-Policy'],
    'strict-origin-when-cross-origin',
  );
});

test('page middleware: Turnstile origins follow PUBLIC_TURNSTILE_SITE_KEY; page requests reach the headers', async () => {
  const run = async (env: Record<string, unknown>, page: (locals: any) => void = () => {}) => {
    const url = new URL('https://live.example.test/events/sample');
    const locals: Record<string, any> = { runtime: { env: { ENVIRONMENT: 'production', ...env } } };
    const middleware = applicationPages('live');
    const response = await middleware(
      { request: new Request(url), url, locals, redirect: () => new Response(null) } as never,
      async () => {
        page(locals);
        return new Response('page');
      },
    );
    // The CSP header itself is only set in production builds (import.meta.env.PROD); its content is tested above.
    return { response, locals };
  };
  const without = await run({});
  assert.match(without.response.headers.get('permissions-policy') ?? '', /camera=\(\)/);
  const scanner = await run({ PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }, (locals) =>
    requestSecurityHeaders(locals, { camera: true, formActionOrigins: ['https://checkout.stripe.com'] }),
  );
  assert.match(scanner.response.headers.get('permissions-policy') ?? '', /camera=\(self\)/);
  assert.deepEqual(scanner.locals.securityRequest.formActionOrigins, ['https://checkout.stripe.com']);

  const url = new URL('https://live.example.test/scan');
  const csp = (env: Record<string, string>, locals: Record<string, any> = {}) =>
    securityHeaders(pageSecurityHeaderOptions('live', { url, locals }, env, true))['Content-Security-Policy'];
  assert.ok(!csp({}).includes('challenges.cloudflare.com'), 'no site key → no Turnstile origin');
  assert.ok(!csp({ PUBLIC_TURNSTILE_SITE_KEY: '  ' }).includes('challenges.cloudflare.com'));
  assert.equal(
    directive(csp({ PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' }), 'frame-src'),
    "frame-src 'self' https://challenges.cloudflare.com",
  );
  assert.equal(
    directive(csp({}, scanner.locals), 'form-action'),
    "form-action 'self' https://checkout.stripe.com",
  );
});

test('a per-request nonce is added to script-src only, never with unsafe-inline, and bad values are dropped', () => {
  const nonce = generateCspNonce();
  assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/);
  assert.notEqual(nonce, generateCspNonce(), 'every call is fresh');
  const csp = buildContentSecurityPolicy({ https: true, nonce });
  assert.equal(directive(csp, 'script-src'), `script-src 'self' 'nonce-${nonce}'`);
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp));
  assert.ok(!/style-src[^;]*nonce/.test(csp), 'the nonce is for scripts only');
  assert.equal(
    securityHeaders({ enforceCsp: true, https: true, nonce })['Content-Security-Policy'],
    csp,
    'securityHeaders passes it through',
  );
  for (const bad of ["x' 'unsafe-inline", 'short', 'abc def ghi jkl mnop', 'a;b-c-d-e-f-g-h-i-j-k', '']) {
    assert.equal(
      directive(buildContentSecurityPolicy({ https: true, nonce: bad }), 'script-src'),
      "script-src 'self'",
      `rejects ${JSON.stringify(bad)}`,
    );
  }
  assert.equal(directive(buildContentSecurityPolicy({ https: true }), 'script-src'), "script-src 'self'");
});

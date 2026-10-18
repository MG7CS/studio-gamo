import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContentSecurityPolicy,
  securityHeaders,
  withSecurityHeaders,
} from '../../packages/domain/src/http/security-headers.ts';

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

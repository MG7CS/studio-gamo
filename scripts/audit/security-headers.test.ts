import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContentSecurityPolicy,
  exactHttpsOrigins,
  generateCspNonce,
  securityHeaders,
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

test('baseline headers; HSTS only over HTTPS; camera and geolocation always off', () => {
  const h = securityHeaders({ enforceCsp: true, https: true });
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.match(h['Strict-Transport-Security'], /max-age=31536000/);
  assert.match(h['Permissions-Policy'], /geolocation=\(\)/);
  assert.match(h['Permissions-Policy'], /camera=\(\)/);
  const dev = securityHeaders({ enforceCsp: false, https: false });
  assert.equal(dev['Strict-Transport-Security'], undefined);
  assert.equal(dev['Content-Security-Policy'], undefined);
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

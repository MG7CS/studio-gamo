import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { matchLegacyRedirect, type LegacyRedirect } from '../../packages/domain/src/api/page-middleware';
import { legacyRedirects as web } from '../../apps/web/src/lib/legacy-redirects';
import { legacyRedirects as worship } from '../../apps/worship/src/lib/legacy-redirects';
import { legacyRedirects as academy } from '../../apps/academy/src/lib/legacy-redirects';
import { legacyRedirects as production } from '../../apps/production/src/lib/legacy-redirects';

const redirect = (rules: readonly LegacyRedirect[], path: string) => {
  const res = matchLegacyRedirect(rules, new URL(path, 'https://example.test'));
  return res && { status: res.status, location: res.headers.get('location') };
};

test('exact, prefix and trailing-slash matching', () => {
  const rules: LegacyRedirect[] = [
    { from: '/a', to: '/x' },
    { from: '/b/*', to: '/y', status: 301 },
  ];
  assert.deepEqual(redirect(rules, '/a'), { status: 302, location: '/x' });
  assert.deepEqual(redirect(rules, '/a/'), { status: 302, location: '/x' });
  assert.equal(redirect(rules, '/ab'), null);
  assert.deepEqual(redirect(rules, '/b'), { status: 301, location: '/y' });
  assert.deepEqual(redirect(rules, '/b/c/d'), { status: 301, location: '/y' });
  assert.equal(redirect(rules, '/bc'), null, 'prefix must stop at a path segment');
});

test('retired Gamo Live URLs on the global site go to the homepage', () => {
  assert.deepEqual(redirect(web, '/live'), { status: 302, location: '/' });
  assert.deepEqual(redirect(web, '/live/'), { status: 302, location: '/' });
  assert.deepEqual(redirect(web, '/live/events/abc-123'), { status: 302, location: '/' });
  assert.equal(redirect(web, '/lively'), null, 'prefix must stop at a path segment');
  // Retired Gamo Live legal drafts go to the legal index instead of a 404.
  assert.deepEqual(redirect(web, '/legal/ticket-terms'), { status: 302, location: '/legal' });
  assert.deepEqual(redirect(web, '/legal/organizer-terms'), { status: 302, location: '/legal' });
  assert.equal(redirect(web, '/legal/site-terms'), null);
});

test('program demo flows keep the original 303 status of their stubs', () => {
  for (const [rules, path] of [
    [worship, '/hire'],
    [academy, '/register'],
    [academy, '/host-apply'],
    [production, '/assessment'],
    [production, '/consultation'],
    [production, '/contact'],
  ] as const) {
    assert.equal(redirect(rules, path)?.status, 303, path);
  }
});

test('program demo flows go to the public apply/request forms, lessons or the homepage', () => {
  assert.equal(redirect(worship, '/hire/schedule')?.location, '/request');
  for (const path of ['/assessment', '/consultation', '/consultation/confirmation', '/contact'])
    assert.equal(redirect(production, path)?.location, '/request', path);
  // /apply and /request are real pages now: they must not redirect (no loop).
  for (const rules of [worship, production]) {
    assert.equal(redirect(rules, '/apply'), null);
    assert.equal(redirect(rules, '/request'), null);
  }
  assert.match(redirect(academy, '/register')!.location!, /\/lessons$/);
  assert.match(redirect(academy, '/host-apply')!.location!, /^https?:\/\/[^/]+\/contact$/);
  assert.equal(redirect(academy, '/dashboard')?.status, 301);
  assert.deepEqual(redirect(web, '/partner/overview'), { status: 302, location: '/' });
  assert.equal(redirect(production, '/services'), null);
  // Nothing points at the retired account pages any more.
  for (const [app, rules] of Object.entries({ web, worship, academy, production })) {
    for (const rule of rules) {
      if (typeof rule.from !== 'string') continue;
      const path = rule.from.replace(/\/\*$/, '/x');
      const location = redirect(rules, path)?.location ?? '';
      assert.doesNotMatch(location, /\/account(\/|\?|$)/, `${app}: ${rule.from} -> ${location}`);
    }
  }
});

test('retired account pages go to the homepage on every public site', () => {
  for (const [app, rules] of Object.entries({ web, worship, academy, production })) {
    for (const path of [
      '/account',
      '/account/signin',
      '/account/signup?role=musician',
      '/account/anything/deep',
    ]) {
      assert.deepEqual(redirect(rules, path), { status: 302, location: '/' }, `${app} ${path}`);
    }
    assert.equal(redirect(rules, '/accounting'), null, `${app}: prefix must stop at a path segment`);
  }
  assert.deepEqual(redirect(web, '/signin'), { status: 302, location: '/' });
  assert.deepEqual(redirect(web, '/signin?next=/account/inquiries'), { status: 302, location: '/' });
});

test('retired demo workspaces go to the matching public form or the homepage', () => {
  const cases = [
    [worship, '/musician', '/apply'],
    [worship, '/musician/x', '/apply'],
    [worship, '/church', '/request'],
    [worship, '/church/x', '/request'],
    [worship, '/church/roster', '/request'],
    [worship, '/opportunities', '/'],
    [worship, '/check-in/x', '/'],
    [worship, '/check-in/success', '/'],
    [production, '/crew', '/apply'],
    [production, '/crew/x', '/apply'],
    [production, '/client', '/request'],
    [production, '/client/x', '/request'],
    [academy, '/family', '/'],
    [academy, '/family/x', '/'],
    [academy, '/instructor/x', '/'],
    [academy, '/host/x', '/'],
    [academy, '/dashboard', '/'],
  ] as const;
  for (const [rules, path, location] of cases) {
    assert.equal(redirect(rules, path)?.location, location, path);
  }
  assert.equal(redirect(academy, '/hosting'), null, 'prefix must stop at a path segment');
});

test('same-app redirect targets resolve to a page that exists', () => {
  const pageExists = (app: string, path: string) => {
    const clean = path.split('?')[0].replace(/\/$/, '');
    const base = `apps/${app}/src/pages${clean}`;
    const segments = clean.split('/').filter(Boolean);
    const parent = `apps/${app}/src/pages/${segments.slice(0, -1).join('/')}`;
    return (
      existsSync(`${base}.astro`) ||
      existsSync(`${base}/index.astro`) ||
      existsSync(`${parent}/[...slug].astro`) ||
      existsSync(`apps/${app}/src/pages/${segments[0]}/[...slug].astro`)
    );
  };
  const tables = { web, worship, academy, production } as const;
  for (const [app, rules] of Object.entries(tables)) {
    for (const rule of rules) {
      if (typeof rule.to !== 'string') continue;
      assert.ok(pageExists(app, rule.to), `${app}: ${String(rule.from)} -> ${rule.to} has no page`);
    }
  }
});

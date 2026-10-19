import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { matchLegacyRedirect, type LegacyRedirect } from '../../packages/domain/src/api/page-middleware';
import { legacyRedirects as web } from '../../apps/web/src/lib/legacy-redirects';
import { legacyRedirects as worship } from '../../apps/worship/src/lib/legacy-redirects';
import { legacyRedirects as academy } from '../../apps/academy/src/lib/legacy-redirects';
import { legacyRedirects as live } from '../../apps/live/src/lib/legacy-redirects';
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

test('Gamo Live legacy routes keep working and never shadow real routes', () => {
  assert.equal(redirect(live, '/organizer/scan')?.location, '/workspaces');
  assert.equal(redirect(live, '/artist')?.location, '/workspaces');
  assert.equal(redirect(live, '/artists'), null);
  assert.equal(redirect(live, '/artists/some-artist'), null);
  assert.equal(redirect(live, '/promote')?.location, '/promote/create');
  assert.equal(redirect(live, '/promote/create'), null);
  assert.equal(redirect(live, '/events/abc-123/tickets')?.location, '/events/abc-123');
  assert.equal(redirect(live, '/events/abc-123'), null);
  assert.equal(redirect(live, '/organizers/grace-church')?.location, '/events?q=grace%20church');
  assert.equal(redirect(live, '/my-tickets')?.location, '/tickets/find');
  assert.equal(redirect(live, '/my-tickets')?.status, 301);
  assert.equal(redirect(live, '/checkout')?.location, '/events');
  assert.equal(redirect(live, '/tickets/find'), null);
});

test('program demo flows keep the original 303 status of their stubs', () => {
  for (const [rules, path] of [
    [worship, '/hire'],
    [worship, '/apply/profile'],
    [academy, '/register'],
    [academy, '/host-apply'],
    [production, '/assessment'],
    [production, '/consultation'],
    [production, '/contact'],
  ] as const) {
    assert.equal(redirect(rules, path)?.status, 303, path);
  }
});

test('program demo flows go to the matching provider sign-up, lessons or inquiry topic', () => {
  assert.match(redirect(worship, '/hire/schedule')!.location!, /\/account\/signup\?role=church$/);
  assert.match(redirect(worship, '/apply')!.location!, /\/account\/signup\?role=musician$/);
  assert.match(redirect(academy, '/register')!.location!, /\/lessons$/);
  assert.match(redirect(academy, '/host-apply')!.location!, /\/account\/signup\?role=church$/);
  // Production consultations come from client churches (not a provider role): still the inquiry form.
  assert.match(
    redirect(production, '/consultation/confirmation')!.location!,
    /interest=Production%20consultation$/,
  );
  assert.equal(redirect(production, '/services'), null);
});

test('web /signin keeps only a safe same-site return path', () => {
  assert.equal(
    redirect(web, '/signin?next=/account/inquiries')?.location,
    '/account/signin?next=%2Faccount%2Finquiries',
  );
  assert.equal(redirect(web, '/signin?next=//evil.example')?.location, '/account/signin?next=%2Faccount');
  assert.equal(redirect(web, '/signin')?.location, '/account/signin');
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
  const tables = { web, worship, academy, live, production } as const;
  for (const [app, rules] of Object.entries(tables)) {
    for (const rule of rules) {
      if (typeof rule.to !== 'string') continue;
      assert.ok(pageExists(app, rule.to), `${app}: ${String(rule.from)} -> ${rule.to} has no page`);
    }
  }
});

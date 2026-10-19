/**
 * robots.txt, sitemap.xml and llms.txt for every app, through each app's real route handler.
 * Robots rules are checked against the same private-route rules the page middleware enforces,
 * so a new private area cannot be added without also keeping crawlers out of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivatePage, type PublicApp } from '../../packages/auth/page-access.ts';
import { siteOrigin } from '../../packages/ui/src/lib/sites.ts';

const APPS: PublicApp[] = ['web', 'worship', 'academy', 'live', 'production'];
/** Private roots per app (mirrors packages/auth/page-access.ts; the test below keeps them honest). */
const PRIVATE_ROOTS: Record<PublicApp, string[]> = {
  web: ['/partner'],
  worship: ['/church', '/musician', '/check-in', '/admin'],
  academy: ['/family', '/instructor', '/host'],
  live: ['/organizer', '/artist', '/agent', '/me', '/workspaces', '/promote'],
  production: ['/client', '/crew'],
};
// Partial APIContext: the crawler routes only read request/url/locals.
const context = (url: string): any => ({
  request: new Request(url),
  url: new URL(url),
  locals: {},
  params: {},
});

/** robots.txt Disallow semantics: prefix match, `*` wildcard, `$` end anchor (kept as the regex anchor). */
function disallowed(rules: string[], path: string): boolean {
  return rules.some((rule) => {
    const pattern = rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${pattern}`).test(path);
  });
}

for (const app of APPS) {
  test(`${app}: robots.txt keeps crawlers out of every private area and points to the sitemap`, async () => {
    const { GET } = await import(`../../apps/${app}/src/pages/robots.txt.ts`);
    const res: Response = await GET(context(`${siteOrigin(app)}/robots.txt`));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/plain/);
    const body = await res.text();
    const groups = body.split(/\n\n+/).filter((g) => /User-agent:/.test(g));
    assert.ok(groups.length >= 3, 'search, AI answer and AI training groups');
    for (const group of groups) {
      const rules = [...group.matchAll(/^Disallow: (.+)$/gm)].map((m) => m[1].trim());
      for (const root of ['/api/', '/account', ...PRIVATE_ROOTS[app]]) {
        const sample = root.endsWith('/') ? `${root}x` : `${root}/x`;
        assert.ok(
          disallowed(rules, sample),
          `${app} robots allows ${sample} in group:\n${group.split('\n')[0]}`,
        );
      }
      assert.ok(!disallowed(rules, '/'), `${app} robots must allow the home page`);
    }
    assert.match(body, new RegExp(`Sitemap: ${siteOrigin(app)}/sitemap\\.xml`));
  });

  test(`${app}: the private roots listed here are really private`, () => {
    for (const root of PRIVATE_ROOTS[app]) {
      const sample = `${root}/x`;
      if (app === 'live' && root === '/promote') continue; // /promote itself redirects; /promote/create is private
      assert.ok(isPrivatePage(app, sample), `${app} ${sample} should be private`);
    }
  });

  test(`${app}: sitemap.xml is well-formed and lists only public, same-origin pages`, async () => {
    const { GET } = await import(`../../apps/${app}/src/pages/sitemap.xml.ts`);
    const res: Response = await GET(context(`${siteOrigin(app)}/sitemap.xml`));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/xml/);
    const xml = await res.text();
    assert.match(
      xml,
      /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
    );
    assert.match(xml, /<\/urlset>\n$/);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]));
    assert.ok(locs.length > 0);
    assert.equal(new Set(locs.map((u) => u.href)).size, locs.length, 'no duplicate URLs');
    for (const loc of locs) {
      assert.equal(loc.origin, siteOrigin(app), `${loc.href} is not on ${app}'s origin`);
      assert.ok(!isPrivatePage(app, loc.pathname), `${loc.pathname} is private`);
      assert.ok(!loc.pathname.startsWith('/account') && !loc.pathname.startsWith('/api/'));
    }
    assert.equal(xml.split('<url>').length - 1, locs.length, 'every <url> has a <loc>');
  });
}

test('web llms.txt uses the approved legal wording and links to every program', async () => {
  const { GET } = await import('../../apps/web/src/pages/llms.txt.ts');
  const res: Response = await GET(context(`${siteOrigin('web')}/llms.txt`));
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /^# Gamo Studios\n/);
  assert.match(body, /Christian, mission-driven Public Benefit Corporation/);
  assert.doesNotMatch(
    body,
    /non-?profit|not-for-profit|501\(c\)|tax-exempt|tax-deductible|\bcharit|\bdonat/i,
  );
  for (const app of ['worship', 'academy', 'live', 'production'] as const) {
    assert.ok(body.includes(siteOrigin(app)), `llms.txt links to ${app}`);
  }
});

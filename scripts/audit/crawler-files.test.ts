/**
 * robots.txt, sitemap.xml and llms.txt for every app, through each app's real route handler.
 * Public apps have no accounts or dashboards (removed 2026-11-16); robots.txt keeps crawlers out
 * of the API and of the transactional pages that carry signed links or personal records.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { siteOrigin } from '../../packages/ui/src/lib/sites.ts';

type PublicApp = 'web' | 'worship' | 'academy' | 'production';
const APPS: PublicApp[] = ['web', 'worship', 'academy', 'production'];
/** Paths crawlers must never fetch per app (guest registration receipts and manage links). */
const NO_CRAWL: Record<PublicApp, string[]> = {
  web: [],
  worship: [],
  academy: ['/registrations'],
  production: [],
};
/** Retired account and workspace roots: they only redirect now and must never be in a sitemap. */
const RETIRED_ROOTS = [
  '/account',
  '/partner',
  '/church',
  '/musician',
  '/check-in',
  '/opportunities',
  '/family',
  '/instructor',
  '/host',
  '/dashboard',
  '/client',
  '/crew',
];
const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
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
      for (const root of ['/api/', ...NO_CRAWL[app]]) {
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
      assert.ok(!loc.pathname.startsWith('/api/'), `${loc.pathname} is an API route`);
      for (const root of [...RETIRED_ROOTS, ...NO_CRAWL[app]])
        assert.ok(!within(loc.pathname, root), `${loc.pathname} is retired or private`);
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
  for (const app of ['worship', 'academy', 'production'] as const) {
    assert.ok(body.includes(siteOrigin(app)), `llms.txt links to ${app}`);
  }
});

/**
 * Smoke test of every public marketing page in every app (production build, see playwright.config.ts).
 *
 * Per page: HTTP 200, exactly one <h1>, no console errors or page errors (this includes CSP
 * violations), no broken images, valid JSON-LD, the page-cache header rule, no horizontal overflow
 * at 360 px, and no serious/critical axe (WCAG 2.2 AA) violations. Every same-site and cross-app
 * link found on any page is requested once and must not fail.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const APPS = {
  web: 'http://127.0.0.1:4321',
  worship: 'http://127.0.0.1:4322',
  academy: 'http://127.0.0.1:4323',
  live: 'http://127.0.0.1:4324',
  production: 'http://127.0.0.1:4325',
} as const;
/** Public pages that are intentionally not in a sitemap. */
const EXTRA_PAGES: Record<keyof typeof APPS, string[]> = {
  web: ['/account/signin', '/account/signup'],
  worship: ['/account/signin'],
  academy: ['/account/signin'],
  live: ['/my-tickets', '/account/signin'],
  production: ['/account/signin'],
};
const LOCAL_ORIGIN = /^http:\/\/127\.0\.0\.1:432[1-6]$/;

async function sitemapPaths(origin: string): Promise<string[]> {
  const xml = await (await fetch(`${origin}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

async function collectProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const h1 = document.querySelectorAll('h1').length;
    if (h1 !== 1) problems.push(`expected one <h1>, found ${h1}`);
    for (const img of Array.from(document.images)) {
      if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) {
        problems.push(`broken image ${img.currentSrc || img.src}`);
      }
    }
    for (const block of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
      try {
        const data = JSON.parse(block.textContent ?? '');
        for (const item of Array.isArray(data) ? data : [data]) {
          if (!String(item['@context'] ?? '').includes('schema.org') || !item['@type']) {
            problems.push('JSON-LD block without schema.org @context/@type');
          }
        }
      } catch {
        problems.push('JSON-LD block is not valid JSON');
      }
    }
    return problems;
  });
}

const checkedLinks = new Map<string, number>();

for (const [app, origin] of Object.entries(APPS) as Array<[keyof typeof APPS, string]>) {
  test(`${app}: every marketing page renders cleanly`, async ({ browser, request }) => {
    const paths = [...new Set([...(await sitemapPaths(origin)), ...EXTRA_PAGES[app]])];
    expect(paths.length).toBeGreaterThan(0);
    const failures: string[] = [];
    const links = new Set<string>();

    for (const path of paths) {
      const url = origin + path;
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text().slice(0, 200)}`));
      page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

      const response = await page.goto(url, { waitUntil: 'networkidle' });
      if (response?.status() !== 200) failures.push(`${path}: HTTP ${response?.status()}`);
      if (response?.headers()['cache-control'] !== 'private, no-store') {
        failures.push(`${path}: cache-control ${response?.headers()['cache-control']}`);
      }
      // Load lazy images before checking them.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 700) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        // <img> fires load or error (never loadend); cap the wait so a stalled image cannot hang the test.
        await Promise.race([
          Promise.all(
            Array.from(document.images).map((img) =>
              img.complete
                ? null
                : new Promise((r) => {
                    img.addEventListener('load', r, { once: true });
                    img.addEventListener('error', r, { once: true });
                  }),
            ),
          ),
          new Promise((r) => setTimeout(r, 5000)),
        ]);
      });
      for (const p of await collectProblems(page)) failures.push(`${path}: ${p}`);
      for (const e of errors) failures.push(`${path}: ${e}`);

      for (const href of await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).href))) {
        const u = new URL(href);
        if (LOCAL_ORIGIN.test(u.origin)) links.add(u.origin + u.pathname + u.search);
      }

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      for (const v of axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) {
        failures.push(`${path}: axe ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
      }

      await page.setViewportSize({ width: 360, height: 800 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) failures.push(`${path}: horizontal overflow ${overflow}px at 360px`);
      await context.close();
    }

    for (const link of links) {
      if (!checkedLinks.has(link)) {
        const res = await request.get(link, { maxRedirects: 0, failOnStatusCode: false });
        checkedLinks.set(link, res.status());
      }
      const status = checkedLinks.get(link)!;
      if (status >= 400) failures.push(`broken link ${link} (${status})`);
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });

  test(`${app}: unknown paths get the branded 404 page`, async ({ page }) => {
    const response = await page.goto(`${origin}/this-page-does-not-exist`);
    expect(response?.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText(/page not found/i);
  });

  test(`${app}: crawler files are public and cacheable`, async ({ request }) => {
    const robots = await request.get(`${origin}/robots.txt`);
    expect(robots.status()).toBe(200);
    expect(robots.headers()['cache-control']).toMatch(/^public, max-age=\d+/);
    const sitemap = await request.get(`${origin}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()['content-type']).toContain('application/xml');
  });
}

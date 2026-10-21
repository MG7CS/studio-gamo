/**
 * Screenshot baseline for the platform-layers work (docs/ARCHITECTURE.md, "Layers"): a full-page picture of every
 * public page of web, worship, academy, production and Live, plus the admin Overview and the Live organizer
 * Overview, at 1280 and 390 px wide. Later work orders move code around and must leave these pictures unchanged.
 *
 * It is opt-in: the pictures are rendered by this computer's browser, so they only mean something here, and
 * `pnpm check` (CI) must not compare them. Run it against the BUILT workers (`pnpm build` first):
 *
 *   E2E_APPS=web,worship,academy,production,admin,live-flow VISUAL_BASELINE=1 \
 *     pnpm exec playwright test tests/e2e/visual-baseline.spec.ts --workers=2 [--update-snapshots=missing]
 *
 * Without `--update-snapshots` it compares with the pictures in tests/e2e/__screenshots__/visual-baseline.spec.ts/.
 * Record again (`--update-snapshots`) only when the owner approves a visual change.
 *
 * Where each page comes from:
 * - web, worship, academy, production: their `astro preview` servers (ports 4321 to 4325), every path in the sitemap.
 * - Live: the Gamo Live flow server (scripts/e2e/live-flow-server.ts, port 4328), not the preview server on 4324,
 *   because it starts from an empty database plus the committed verified catalog, so the pictures do not depend on
 *   what is in this computer's local database. Detail pages of a collection (events, artists, venues, cities) are
 *   limited to the first two by name, to keep the number of pictures down.
 * - admin: the production-like admin server (port 4327), Overview only; Live organizer: Overview of a freshly
 *   created sample organization on the flow server.
 *
 * What changes between runs is masked (the pink boxes in a picture): every <time> element and, on the admin Overview,
 * the calendar and the day cards, because the sample rows are created relative to the moment the server starts. The
 * admin's "Waiting longest" list is left out of the picture: rows created at the same moment swap places between
 * runs. The catalog events keep their real dates, so a Live picture changes when an event passes; that is the only
 * expected drift.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import {
  ACCESS_KEY_FILE,
  ADMIN_E2E_ORIGIN,
  mintAccessJwt,
  ADMIN_EMAIL,
} from '../../scripts/e2e/admin-fixture.ts';
import { FLOW_LIVE_ORIGIN } from '../../scripts/e2e/live-flow-fixture.ts';

test.skip(
  process.env.VISUAL_BASELINE !== '1',
  'opt-in: run with VISUAL_BASELINE=1 (see the top of this file)',
);

const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
] as const;

const SITES = {
  web: 'http://127.0.0.1:4321',
  worship: 'http://127.0.0.1:4322',
  academy: 'http://127.0.0.1:4323',
  production: 'http://127.0.0.1:4325',
  live: FLOW_LIVE_ORIGIN,
} as const;

/** Public pages that are intentionally not in a sitemap. */
const EXTRA_PAGES: Record<keyof typeof SITES, string[]> = {
  web: ['/contact'],
  worship: [],
  academy: [],
  production: [],
  live: ['/account/signin', '/account/signup'],
};

/** How many detail pages of one collection get a picture (`/events/<slug>` is a detail page of `/events`). */
const DETAILS_PER_COLLECTION = 2;

async function sitemapPaths(origin: string): Promise<string[]> {
  const xml = await (await fetch(`${origin}/sitemap.xml`)).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

/** All sitemap paths, with each collection's detail pages cut to the first few by name. */
function limitDetails(paths: string[]): string[] {
  const sorted = [...new Set(paths)].sort();
  const parents = new Set(sorted.map((p) => p.replace(/\/[^/]+$/, '') || '/'));
  const seen = new Map<string, number>();
  return sorted.filter((path) => {
    const parent = path.replace(/\/[^/]+$/, '') || '/';
    const isDetail = parent !== '/' && parents.has(parent) && sorted.includes(parent) && path !== parent;
    if (!isDetail) return true;
    const count = seen.get(parent) ?? 0;
    seen.set(parent, count + 1);
    return count < DETAILS_PER_COLLECTION;
  });
}

const nameOf = (path: string) =>
  path === '/' ? 'home' : path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

/**
 * Load every image (lazy ones included), decode it, and let layout settle before the picture. Without the decode, a
 * photo far below the viewport is sometimes not painted yet when the full-page capture is taken.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    for (const img of images) img.loading = 'eager';
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    await Promise.race([
      Promise.all(
        images.map((img) =>
          img.complete
            ? null
            : new Promise((r) => {
                img.addEventListener('load', r, { once: true });
                img.addEventListener('error', r, { once: true });
              }),
        ),
      ),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    await Promise.race([
      Promise.all(images.map((img) => img.decode().catch(() => undefined))),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
}

async function picture(page: Page, name: string[], mask: Locator[] = []): Promise<void> {
  await settle(page);
  await expect.soft(page).toHaveScreenshot(name, {
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    // The browser resamples a few large photos slightly differently from one run to the next (soft edges, up to a few dozen
    // pixels) and rounded corners differ by a pixel or two. A higher colour threshold and a small pixel allowance
    // absorb that; a moved line or a changed word is a far larger colour change over more pixels.
    threshold: 0.3,
    maxDiffPixels: 100,
    mask: [page.locator('time'), ...mask],
  });
}

for (const [app, origin] of Object.entries(SITES) as Array<[keyof typeof SITES, string]>) {
  for (const viewport of VIEWPORTS) {
    test(`${app} public pages at ${viewport.width}px`, async ({ browser }) => {
      const paths = limitDetails([...(await sitemapPaths(origin)), ...EXTRA_PAGES[app]]);
      expect(paths.length).toBeGreaterThan(0);
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      for (const path of paths) {
        const response = await page.goto(origin + path, { waitUntil: 'networkidle' });
        expect(response?.status(), path).toBe(200);
        await picture(page, [app, `${nameOf(path)}-${viewport.width}.png`]);
      }
      await context.close();
    });
  }
}

async function organizerOverview(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORTS[0], reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${FLOW_LIVE_ORIGIN}/account/signin`);
  await page.getByLabel('Your name').fill('Sample Organizer');
  await page.getByLabel('Email address').fill('organizer@example.invalid');
  await page.getByRole('button', { name: 'Sign in locally' }).click();
  await expect(page).toHaveURL(/\/organizer\/start/);
  await page.getByLabel('Organization name').fill('Sample Grace Fellowship');
  await page.getByLabel('City').fill('Phoenix');
  await page.getByLabel('State').fill('AZ');
  await page.getByRole('button', { name: 'Next' }).click();
  await page
    .getByLabel('What does your organization do?')
    .fill('A sample organization that hosts worship nights.');
  await page.getByLabel('Website').fill('https://example.org');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/organizer$/);
  return page;
}

// One test, one organizer: the flow server keeps its database for the whole run, so both widths come from the same page.
test('Live organizer Overview at both widths', async ({ browser }) => {
  const page = await organizerOverview(browser);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${FLOW_LIVE_ORIGIN}/organizer`, { waitUntil: 'networkidle' });
    await picture(page, ['live-organizer', `overview-${viewport.width}.png`]);
  }
  await page.context().close();
});

for (const viewport of VIEWPORTS) {
  test(`admin Overview at ${viewport.width}px`, async ({ browser }) => {
    const jwt = mintAccessJwt(readFileSync(ACCESS_KEY_FILE, 'utf8'), ADMIN_EMAIL);
    const context = await browser.newContext({
      viewport,
      reducedMotion: 'reduce',
      extraHTTPHeaders: { 'cf-access-jwt-assertion': jwt },
    });
    const page = await context.newPage();
    const response = await page.goto(`${ADMIN_E2E_ORIGIN}/`, { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(200);
    await page.addStyleTag({ content: 'section[aria-labelledby="waiting-title"] { display: none; }' });
    await picture(
      page,
      ['admin', `overview-${viewport.width}.png`],
      [page.locator('#schedule'), page.locator('#schedule + div')],
    );
    await context.close();
  });
}

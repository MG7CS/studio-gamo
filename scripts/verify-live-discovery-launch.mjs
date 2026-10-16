import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(new URL('../apps/live/package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const SCREENSHOT_DIR = resolve(process.cwd(), 'artifacts/screenshots/live-launch-2026-10-15');
const BRAIN_DIR = '/Users/gamo/.gemini/antigravity-cli/brain/4d057e69-9012-4fbc-a7af-b6410c7b3b20';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const dir = mkdtempSync(join(tmpdir(), 'gamo-live-launch-verify-'));
const d1Dir = join(dir, 'd1');
const outfile = join(dir, 'live.mjs');
const webOutfile = join(dir, 'web.mjs');

await build({
  entryPoints: ['apps/live/dist/server/entry.mjs'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
  logLevel: 'error',
});

await build({
  entryPoints: ['apps/web/dist/server/entry.mjs'],
  outfile: webOutfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
  logLevel: 'error',
});

const clientRoot = join(process.cwd(), 'apps/live/dist/client');
const webClientRoot = join(process.cwd(), 'apps/web/dist/client');

function createAssetsBinding(rootDir) {
  return async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const candidates = [
      join(rootDir, normalize(rel)),
      join(rootDir, normalize(`${rel}.html`)),
      join(rootDir, normalize(join(rel, 'index.html'))),
    ];
    for (const candidate of candidates) {
      if (
        candidate.startsWith(rootDir) &&
        existsSync(candidate) &&
        statSync(candidate).isFile()
      ) {
        const ext = extname(candidate).toLowerCase();
        return new Response(readFileSync(candidate), {
          status: 200,
          headers: { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' },
        });
      }
    }
    return new Response('Not Found', { status: 404 });
  };
}

const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: 'router',
        modules: true,
        script: 'export default { async fetch() { return new Response("ok"); } };',
        compatibilityDate: '2024-09-23',
        d1Databases: { DB: 'live-launch-db' },
        serviceBindings: { APP_LIVE: 'app-live', APP_WEB: 'app-web' },
      },
      {
        name: 'app-live',
        modules: true,
        script: readFileSync(outfile, 'utf8'),
        compatibilityDate: '2024-09-23',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: 'live-launch-db' },
        kvNamespaces: { SESSION: 'live-session-kv', SESSION_KV: 'live-session-kv' },
        r2Buckets: { MEDIA_BUCKET: 'live-media-bucket' },
        serviceBindings: {
          ASSETS: createAssetsBinding(clientRoot),
        },
        bindings: {
          ENVIRONMENT: 'local',
          ALLOW_DEMO_SESSION: 'true',
          ALLOW_AUTH_SIMULATION: 'true',
          SESSION_SECRET: 'live-launch-verify-session-secret-0123456789abcdef',
        },
      },
      {
        name: 'app-web',
        modules: true,
        script: readFileSync(webOutfile, 'utf8'),
        compatibilityDate: '2024-09-23',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: 'live-launch-db' },
        kvNamespaces: { SESSION: 'live-session-kv', SESSION_KV: 'live-session-kv' },
        r2Buckets: { MEDIA_BUCKET: 'live-media-bucket' },
        serviceBindings: {
          ASSETS: createAssetsBinding(webClientRoot),
        },
        bindings: {
          ENVIRONMENT: 'local',
          ALLOW_DEMO_SESSION: 'true',
          ALLOW_AUTH_SIMULATION: 'true',
          SESSION_SECRET: 'live-launch-verify-session-secret-0123456789abcdef',
        },
      },
    ],
  }),
  resourcePersistencePath: d1Dir,
});

const WEB_PORT = 14398;
const PORT = 14399;
let server;
let webServer;
let browser;

function saveScreenshot(name, buffer) {
  const repoPath = join(SCREENSHOT_DIR, name);
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  require('node:fs').writeFileSync(repoPath, buffer);
  if (existsSync(BRAIN_DIR)) {
    copyFileSync(repoPath, join(BRAIN_DIR, name));
  }
  return repoPath;
}

function createWorkerHttpServer(worker, port, rootDir) {
  return createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
      const rel = decodeURIComponent(reqUrl.pathname);
      if (
        rel.startsWith('/_astro/') ||
        rel.startsWith('/images/') ||
        rel === '/favicon.svg' ||
        rel === '/favicon.ico'
      ) {
        const assetPath = join(rootDir, normalize(rel));
        if (
          assetPath.startsWith(rootDir) &&
          existsSync(assetPath) &&
          statSync(assetPath).isFile()
        ) {
          const ext = extname(assetPath).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
          res.end(readFileSync(assetPath));
          return;
        }
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const bodyBuf = Buffer.concat(chunks);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) v.forEach((item) => headers.append(k, item));
        else if (typeof v === 'string') headers.set(k, v);
      }

      const mfRes = await worker.fetch(`http://127.0.0.1:${port}${req.url}`, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuf : undefined,
        redirect: 'manual',
      });

      const resHeaders = {};
      mfRes.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });
      res.writeHead(mfRes.status, resHeaders);
      const arrayBuf = await mfRes.arrayBuffer();
      res.end(Buffer.from(arrayBuf));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(err?.stack || err));
    }
  });
}

try {
  await mf.ready;
  const db = await mf.getD1Database('DB');
  const migrations = readdirSync('packages/db/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrations) {
    const statements = readFileSync(`packages/db/migrations/${file}`, 'utf8').split(
      '--> statement-breakpoint'
    );
    for (const raw of statements) {
      const sql = raw.replace(/^\s*--.*$/gm, '').trim();
      if (sql) await db.exec(sql.replace(/\n/g, ' '));
    }
  }

  const worker = await mf.getWorker('app-live');
  const webWorker = await mf.getWorker('app-web');
  server = createWorkerHttpServer(worker, PORT, clientRoot);
  webServer = createWorkerHttpServer(webWorker, WEB_PORT, webClientRoot);

  server.listen(PORT, '127.0.0.1');
  await once(server, 'listening');
  webServer.listen(WEB_PORT, '127.0.0.1');
  await once(webServer, 'listening');
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const webBaseUrl = `http://127.0.0.1:${WEB_PORT}`;

  browser = await chromium.launch({ headless: true });

  // 1. Desktop 1440px Verification & Screenshots
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await desktopContext.newPage();

  console.log('0. Verifying Gamo Studios Homepage -> Gamo Live Marketing Page (/live) -> Standalone Marketplace...');
  const webHomeRes = await page.goto(`${webBaseUrl}/`, { waitUntil: 'networkidle' });
  assert.equal(webHomeRes.status(), 200);
  // Journey 1: Gamo Studios homepage -> Gamo Live marketing page (/live)
  const navLiveHref = await page.locator('header a', { hasText: /^Live$/ }).first().getAttribute('href');
  assert.ok(navLiveHref && navLiveHref.endsWith('/live'), `Expected Gamo Studios header Live link to point to /live, got ${navLiveHref}`);

  const mktRes = await page.goto(`${webBaseUrl}/live`, { waitUntil: 'networkidle' });
  assert.equal(mktRes.status(), 200);
  const mktText = await page.locator('body').innerText();
  assert.match(mktText, /Harvest Night of Gospel/i);
  assert.match(mktText, /Upcoming nearby/i);
  assert.match(mktText, /Built for every role in the room/i);
  assert.match(mktText, /Hosting or performing at a Christian event\?/i);
  const mktCanonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  assert.ok(mktCanonical && mktCanonical.endsWith('/live'), `Expected marketing canonical URL to end with /live, got ${mktCanonical}`);

  // Journey 2 & 6: Marketing page action links point to standalone Gamo Live marketplace & organizer onboarding
  const exploreEventsHref = await page.locator('a', { hasText: /Explore events/i }).first().getAttribute('href');
  assert.ok(exploreEventsHref && exploreEventsHref.includes('/events'), `Expected Explore events CTA to point to standalone /events, got ${exploreEventsHref}`);
  const listEventHref = await page.locator('a', { hasText: /List an event/i }).first().getAttribute('href');
  assert.ok(listEventHref && listEventHref.includes('/promote/create'), `Expected List an event CTA to point to standalone /promote/create, got ${listEventHref}`);
  const artistParticipationHref = await page.locator('a', { hasText: /Artist & agent participation/i }).first().getAttribute('href');
  assert.ok(artistParticipationHref && artistParticipationHref.includes('/artists'), `Expected Artist participation CTA to point to standalone /artists, got ${artistParticipationHref}`);

  const mktOverflow1440 = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  assert.equal(mktOverflow1440, false, 'Expected no horizontal overflow at 1440px on /live marketing page');
  saveScreenshot(
    'gamo-live-marketing-desktop-1440.png',
    await page.screenshot({ fullPage: true })
  );

  // Verify Journey 6: Navigating to standalone /promote/create redirects unauthenticated user to /account/signin?next=%2Fpromote%2Fcreate with GAMO LIVE logo
  await page.goto(`${baseUrl}/promote/create`, { waitUntil: 'networkidle' });
  assert.ok(page.url().includes('/account/signin?next=%2Fpromote%2Fcreate'), `Expected redirect to /account/signin?next=%2Fpromote%2Fcreate, got ${page.url()}`);
  assert.equal(await page.locator('[data-brand-logo="Gamo Live"]').count(), 1, 'Expected Gamo Live logo on /account/signin');

  console.log('1. Verifying Standalone Gamo Live Product Homepage (/) at 1440px...');
  const homeRes = await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  assert.equal(homeRes.status(), 200);
  const homeText = await page.locator('body').innerText();
  assert.match(homeText, /Find your next/i);
  assert.match(homeText, /live\s+experience/i);
  assert.match(homeText, /Upcoming events/i);
  assert.match(homeText, /CAIN Live and In Worship/i);
  assert.match(homeText, /Bring your next event to life/i);
  assert.doesNotMatch(homeText, /Kigali|Rwanda|RWF|Joel Iradukunda|Jordan Avery/i);

  // Check zero horizontal overflow at 1440px
  const overflow1440 = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  assert.equal(overflow1440, false, 'Expected no horizontal overflow at 1440px on /');

  // Test favorite button persistence in localStorage
  const firstFavBtn = page.locator('[data-favorite-btn]').first();
  await firstFavBtn.click();
  const isPressed = await firstFavBtn.getAttribute('aria-pressed');
  assert.equal(isPressed, 'true', 'Favorite button should toggle aria-pressed="true"');
  const savedStorage = await page.evaluate(() => localStorage.getItem('gamo_live_saved_events'));
  assert.ok(savedStorage && JSON.parse(savedStorage).length >= 1, 'Expected saved event in localStorage');

  saveScreenshot(
    'live-homepage-desktop-1440.png',
    await page.screenshot({ fullPage: true })
  );

  // Test filter chips on homepage
  const worshipChip = page.locator('[data-home-filter="worship"]');
  if ((await worshipChip.count()) > 0) {
    await worshipChip.click();
    await page.waitForTimeout(150);
  }
  const allChip = page.locator('[data-home-filter="all"]');
  if ((await allChip.count()) > 0) {
    await allChip.click();
    await page.waitForTimeout(150);
  }

  // 2. Verify /events Discovery Directory & Filters
  console.log('2. Verifying /events discovery directory & filters...');
  const eventsRes = await page.goto(`${baseUrl}/events`, { waitUntil: 'networkidle' });
  assert.equal(eventsRes.status(), 200);
  const eventsRawText = (await page.textContent('body')) || '';
  const eventsText = await page.locator('body').innerText();
  assert.ok(
    eventsRawText.includes('Find a gathering worth showing up for.'),
    'Expected accessible E2E heading on /events'
  );
  assert.equal(await page.locator('#events-search-q').isVisible(), true);
  assert.equal(await page.locator('#events-filter-metro').isVisible(), true);
  assert.equal(await page.locator('#events-filter-date').isVisible(), true);
  assert.equal(await page.locator('#events-filter-category').isVisible(), true);
  assert.equal(await page.locator('#toggle-more-filters-btn').isVisible(), true);
  assert.equal(await page.locator('#events-sort-select').isVisible(), true);
  assert.match(eventsText, /18 events/i, 'Expected 18 events count header on /events');
  assert.doesNotMatch(eventsText, /Pat Barrett/i, 'Held event must not appear on /events');
  assert.doesNotMatch(eventsText, /Steven Curtis Chapman/i, 'Held event must not appear on /events');
  saveScreenshot(
    'live-events-grid-viewport-1440.png',
    await page.screenshot({ fullPage: false })
  );
  saveScreenshot(
    'live-events-directory-desktop-1440.png',
    await page.screenshot({ fullPage: true })
  );

  // Test ?q=CeCe+Winans filter
  await page.goto(`${baseUrl}/events?metro=all&q=CeCe+Winans`, { waitUntil: 'networkidle' });
  const ceceCards = await page.locator('[data-event-card]').count();
  assert.equal(ceceCards, 4, 'Expected 4 CeCe Winans events across U.S. metros');

  // Test empty state
  await page.goto(`${baseUrl}/events?q=nonexistent-event-xyz-999`, { waitUntil: 'networkidle' });
  const emptyText = await page.locator('body').innerText();
  assert.match(emptyText, /No verified events match/i);

  // 3. Verify Metro City Landing Page (/events/phoenix-az & /events/nashville-tn)
  console.log('3. Verifying Metro City Landing Pages (/events/phoenix-az, /events/nashville-tn)...');
  const phxRes = await page.goto(`${baseUrl}/events/phoenix-az`, { waitUntil: 'networkidle' });
  assert.equal(phxRes.status(), 200);
  const phxTitle = await page.title();
  assert.match(phxTitle, /Phoenix, AZ/i);
  const phxCards = await page.locator('[data-event-card]').count();
  assert.equal(phxCards, 4, 'Expected 4 published events in Phoenix, AZ');
  saveScreenshot(
    'live-metro-phoenix-desktop-1440.png',
    await page.screenshot({ fullPage: true })
  );

  const nashRes = await page.goto(`${baseUrl}/events/nashville-tn`, { waitUntil: 'networkidle' });
  assert.equal(nashRes.status(), 200);
  const nashCards = await page.locator('[data-event-card]').count();
  assert.equal(nashCards, 4, 'Expected 4 published events in Nashville, TN');

  // 4. Verify Individual Event Detail Page (/events/cain-phoenix-2026-11-07)
  console.log('4. Verifying Event Detail Page (/events/cain-phoenix-2026-11-07)...');
  const detailRes = await page.goto(`${baseUrl}/events/cain-phoenix-2026-11-07`, {
    waitUntil: 'networkidle',
  });
  assert.equal(detailRes.status(), 200);
  const detailText = await page.locator('body').innerText();
  assert.match(detailText, /CAIN Live and In Worship Tour with bodie/i);
  assert.match(detailText, /Dream City Church/i);
  assert.match(detailText, /13613 N Cave Creek Rd, Phoenix, AZ 85022/i);
  assert.match(detailText, /Gamo Live Listings/i);
  assert.match(detailText, /Independent/i);
  assert.match(detailText, /TicketWeb/i);

  // Verify JSON-LD structured data
  const jsonLdRaw = await page.locator('script[type="application/ld+json"]').first().textContent();
  assert.ok(jsonLdRaw, 'Expected JSON-LD script on event detail page');
  const jsonLd = JSON.parse(jsonLdRaw);
  assert.equal(jsonLd['@type'], 'Event');
  assert.equal(jsonLd.name, 'CAIN Live and In Worship Tour with bodie');
  assert.equal(jsonLd.location.name, 'Dream City Church');
  assert.match(jsonLd.offers.url, /^https:\/\/www\.ticketweb\.com\//);

  saveScreenshot(
    'live-event-detail-cain-desktop-1440.png',
    await page.screenshot({ fullPage: true })
  );

  // Verify /events/cain-phoenix-2026-11-07/register blocks internal checkout and shows external referral
  const regRes = await page.goto(`${baseUrl}/events/cain-phoenix-2026-11-07/register`, {
    waitUntil: 'networkidle',
  });
  assert.equal(regRes.status(), 200);
  const regText = await page.locator('body').innerText();
  assert.match(regText, /TicketWeb/i);
  assert.equal(
    await page.locator('form[action*="/register"]').count(),
    0,
    'External discovery event must not render internal registration form'
  );

  // Verify held and rejected events return 404
  const heldRes = await page.goto(`${baseUrl}/events/pat-barrett-atlanta-2026-11-22`, {
    waitUntil: 'networkidle',
  });
  assert.equal(heldRes.status(), 404, 'Held event must return 404');

  const rejectedRes = await page.goto(`${baseUrl}/events/josiah-queen-duluth-2027-04-18`, {
    waitUntil: 'networkidle',
  });
  assert.equal(rejectedRes.status(), 404, 'Rejected event must return 404');

  // 5. Verify /venues, /artists, /promote redirect, /sitemap.xml, and /robots.txt
  console.log('5. Verifying /venues, /artists, /promote redirect, /sitemap.xml, and /robots.txt...');
  const venuesRes = await page.goto(`${baseUrl}/venues`, { waitUntil: 'networkidle' });
  assert.equal(venuesRes.status(), 200);
  const venuesText = await page.locator('body').innerText();
  assert.match(venuesText, /Dream City Church/i);
  assert.match(venuesText, /Bridgestone Arena/i);
  assert.match(venuesText, /Barclays Center/i);
  saveScreenshot(
    'live-venues-desktop-1440.png',
    await page.screenshot({ fullPage: true })
  );

  // Verify functional /artists directory & direct artist onboarding
  const artistsRes = await page.goto(`${baseUrl}/artists`, { waitUntil: 'networkidle' });
  assert.equal(artistsRes.status(), 200);
  const artistsText = await page.locator('body').innerText();
  assert.match(artistsText, /Artists on tour & artist onboarding/i);
  assert.match(artistsText, /CeCe Winans/i);
  assert.match(artistsText, /CAIN/i);
  assert.match(artistsText, /Elevation Worship/i);
  assert.ok((await page.locator('[data-artist-card]').count()) >= 15, 'Expected real artist directory cards on /artists');
  saveScreenshot(
    'live-artists-desktop-1440.png',
    await page.screenshot({ fullPage: true })
  );

  // Verify legacy promotional /promote redirects directly into event creation (/promote/create -> /account/signin?next=%2Fpromote%2Fcreate)
  const promoteManualRes = await fetch(`${baseUrl}/promote`, { redirect: 'manual' });
  assert.equal(promoteManualRes.status, 303, 'Expected /promote to 303 redirect to /promote/create');
  assert.match(promoteManualRes.headers.get('location') || '', /\/promote\/create$/);
  await page.goto(`${baseUrl}/promote`, { waitUntil: 'networkidle' });
  assert.ok(
    page.url().includes('/account/signin?next=%2Fpromote%2Fcreate'),
    `Expected /promote to lead unauthenticated visitor to /account/signin?next=%2Fpromote%2Fcreate, got ${page.url()}`
  );

  const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemapRes.status, 200);
  const sitemapXml = await sitemapRes.text();
  assert.match(sitemapXml, /\/events\/phoenix-az<\/loc>/);
  assert.match(sitemapXml, /\/events\/cain-phoenix-2026-11-07<\/loc>/);
  assert.match(sitemapXml, /\/artists<\/loc>/);
  assert.doesNotMatch(sitemapXml, /\/promote<\/loc>/);
  assert.doesNotMatch(sitemapXml, /pat-barrett-atlanta-2026-11-22/);
  assert.doesNotMatch(sitemapXml, /josiah-queen-duluth-2027-04-18/);

  const robotsRes = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robotsRes.status, 200);
  const robotsTxt = await robotsRes.text();
  assert.match(robotsTxt, /Allow: \/events\//);
  assert.match(robotsTxt, /Disallow: \/api\//);
  assert.match(robotsTxt, /Disallow: \/promote/);

  await desktopContext.close();

  // 6. Mobile 390px Verification & Screenshots
  console.log('6. Verifying Mobile 390px layouts & capturing screenshots...');
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileContext.newPage();

  for (const [fullUrl, filename] of [
    [`${webBaseUrl}/live`, 'gamo-live-marketing-mobile-390.png'],
    [`${baseUrl}/`, 'live-homepage-mobile-390.png'],
    [`${baseUrl}/events`, 'live-events-directory-mobile-390.png'],
    [`${baseUrl}/artists`, 'live-artists-mobile-390.png'],
    [`${baseUrl}/events/phoenix-az`, 'live-metro-phoenix-mobile-390.png'],
    [`${baseUrl}/events/cain-phoenix-2026-11-07`, 'live-event-detail-cain-mobile-390.png'],
  ]) {
    await mobilePage.goto(fullUrl, { waitUntil: 'networkidle' });
    await mobilePage.evaluate(async () => {
      const step = 400;
      for (let y = 0; y <= document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 30));
      }
      window.scrollTo(0, 0);
      await Promise.all(
        Array.from(document.querySelectorAll('img')).map((img) =>
          img.decode ? img.decode().catch(() => {}) : Promise.resolve()
        )
      );
    });
    const hasOverflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    assert.equal(hasOverflow, false, `Expected no horizontal overflow at 390px on ${fullUrl}`);
    saveScreenshot(filename, await mobilePage.screenshot({ fullPage: true }));
  }

  await mobileContext.close();

  console.log('PASS: All Gamo Live Marketing + Product Concert Discovery user journeys and responsive screenshots verified.');
} finally {
  if (browser) await browser.close();
  if (server) server.close();
  if (webServer) webServer.close();
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = 'http://127.0.0.1:4325';
const artifacts = new URL('../../../docs/screenshots/2026-refresh/production-resume/', import.meta.url).pathname;
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('response', (response) => { if (response.status() >= 400 && response.url().startsWith(base)) errors.push(`${response.status()} ${response.url()}`); });
const routes = ['/', '/services', '/services/audio', '/services/livestream-video', '/services/lighting-media', '/services/training', '/services/event-support', '/services/facility-guidance', '/training', '/assessment', '/consultation', '/consultation/confirmation'];
try {
  const legacy = await page.request.get(base + '/contact', { maxRedirects: 0 });
  assert.equal(legacy.status(), 301);
  assert.equal(legacy.headers().location, '/consultation');
  for (const width of [390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, route);
      assert.equal(await page.locator('main h1').count(), 1, route);
      await page.locator('img').evaluateAll(async (images) => {
        await Promise.all(images.filter((image) => image.getClientRects().length).map(async (image) => { image.loading = 'eager'; await image.decode(); }));
      });
      assert.deepEqual(await page.locator('img').evaluateAll((images) => images.filter((image) => image.getClientRects().length && image.naturalWidth === 0).map((image) => image.src)), [], `images ${route}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${width} ${route}`);
      if (width === 390 || width === 1440) {
        await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
        for (const section of await page.locator('[data-reveal]').all()) await section.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${artifacts}${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-${width}.png`, fullPage: true });
      }
    }
  }
  await page.goto(base + '/assessment');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.locator('[data-status]').textContent(), 'Step 1 of 5');
  await page.getByLabel('Church or ministry name').fill('Sample Church <script>');
  await page.getByLabel('City & state').fill('Sample City, AZ');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Sound system & mixer', { exact: true }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel('Church Audio', { exact: true }).check();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.match(await page.locator('[data-review]').textContent(), /Sample Church <script>/);
  assert.match(await page.locator('[data-review]').textContent(), /Church Audio/);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  assert.equal(await page.locator('[data-status]').textContent(), 'Step 4 of 5');
  await page.goto(base + '/consultation');
  await page.getByRole('button', { name: 'Preview submission', exact: true }).click();
  assert.equal(page.url(), base + '/consultation');
  await page.getByLabel('Your name').fill('Sample Contact');
  await page.locator('#f-email').fill('invalid');
  await page.getByLabel('Church or ministry', { exact: false }).fill('Sample Church');
  await page.getByLabel('Primary area of interest').selectOption({ label: 'Church Audio' });
  await page.getByRole('button', { name: 'Preview submission', exact: true }).click();
  assert.equal(page.url(), base + '/consultation');
  await page.locator('#f-email').fill('sample@example.test');
  await page.getByRole('button', { name: 'Preview submission', exact: true }).click();
  await page.waitForURL(base + '/consultation/confirmation');
  assert.equal(new URL(page.url()).search, '');
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const fallback = await noJs.newPage();
  await fallback.goto(base + '/consultation');
  assert.equal(await fallback.getByRole('button', { name: 'Preview submission', exact: true }).isVisible(), false);
  assert.equal(await fallback.getByRole('link', { name: 'View the sample confirmation' }).isVisible(), true);
  await noJs.close();
  assert.deepEqual(errors, []);
  console.log(`PASS: ${routes.length} routes × 5 viewports + legacy contact redirect; images, overflow, h1, validation, assessment review/back, safe confirmation and no-JS fallback. 24 screenshots: ${artifacts}`);
} finally { await browser.close(); }

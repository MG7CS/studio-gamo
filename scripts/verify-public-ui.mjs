import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const routes = [
  '/',
  '/mission',
  '/get-involved',
  '/partners',
  '/partners/interest',
  '/support',
  '/contact',
  '/faq',
  '/legal',
  '/signin',
  '/get-started',
  '/preview/hero-2026',
];
const widths = [390, 768, 1024, 1440, 1920];
const output = 'docs/screenshots/2026-refresh/web';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const links = new Set();
const checks = [];
try {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const route of routes) {
      const response = await page.goto(`http://localhost:4321${route}`, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, `${route} response`);
      const state = await page.evaluate(async () => {
        for (const image of document.querySelectorAll('img')) {
          image.loading = 'eager';
          try {
            await image.decode();
          } catch {
            /* reported below */
          }
        }
        return {
          title: document.title,
          h1: document.querySelectorAll('main h1').length,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          broken: [...document.querySelectorAll('img')]
            .filter((image) => !image.complete || !image.naturalWidth)
            .map((image) => image.currentSrc),
          links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
        };
      });
      assert.equal(state.h1, 1, `${route} one main h1`);
      assert.equal(state.overflow, false, `${route} overflow at ${width}`);
      assert.deepEqual(state.broken, [], `${route} images at ${width}`);
      await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
      state.links.forEach((href) => links.add(href));
      checks.push({ route, width, title: state.title, status: 'passed' });
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `${output}/${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-${width}.png`,
          fullPage: true,
        });
    }
  }
  // Negative validation, positive local preview, clearing and zero transmission.
  await page.goto('http://localhost:4321/contact');
  let transmitted = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST') transmitted++;
  });
  await page.getByRole('button', { name: 'Send inquiry', exact: true }).click();
  assert.equal(await page.locator('[data-inquiry-result]').isVisible(), false);
  await page.getByLabel('Your name').fill('Grace Visitor');
  await page.getByLabel('Email address').fill('not-an-email');
  await page.getByLabel('What would you like to explore?').selectOption('Volunteering');
  await page.getByLabel('Your idea or question').fill('An idea for volunteering.');
  await page.getByRole('button', { name: 'Send inquiry', exact: true }).click();
  assert.equal(await page.locator('[data-inquiry-result]').isVisible(), false);
  await page.getByLabel('Email address').fill('visitor@example.com');
  await page.getByRole('button', { name: 'Send inquiry', exact: true }).click();
  assert.equal(await page.locator('[data-inquiry-result]').isVisible(), true);
  assert.equal(transmitted, 0);
  await page.getByRole('button', { name: 'Send another message' }).click();
  assert.equal(await page.getByLabel('Your name').inputValue(), '');
  assert.equal(await page.locator('[data-inquiry-result]').isVisible(), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  assert.equal(await page.getByRole('button', { name: 'Close menu' }).getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Open menu' }).getAttribute('aria-expanded'), 'false');
  await page.goto('http://localhost:4321/faq');
  await page.getByText('How can our church or family participate?', { exact: true }).click();
  assert.equal(await page.locator('details[open]').count(), 1);
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noJs.newPage();
  await plain.goto('http://localhost:4321/contact');
  assert.equal(await plain.getByLabel('Your name').isDisabled(), true);
  await noJs.close();
  const badLinks = [];
  for (const href of links) {
    const url = new URL(href);
    if (url.hostname !== 'localhost' || url.hash) continue;
    const response = await context.request.get(href);
    if (response.status() >= 400) badLinks.push({ href, status: response.status() });
  }
  assert.deepEqual(badLinks, [], 'all linked local destinations');
  assert.deepEqual(errors, [], 'console and uncaught errors');
  const report = {
    checks,
    linksChecked: links.size,
    interactions: [
      'empty fields',
      'invalid email',
      'local inquiry preview',
      'zero POST requests',
      'clear details',
      'mobile menu Escape',
      'FAQ expansion',
      'no-JS form disabled',
    ],
    errors,
    badLinks,
  };
  await fs.writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `Passed ${checks.length} responsive route checks and 8 interaction checks; ${links.size} links inspected.`,
  );
} finally {
  await browser.close();
}

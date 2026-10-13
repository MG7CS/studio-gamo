/** Real browser evidence for the Worship / Academy design previews. Run with their local servers. */
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const worship = process.env.WORSHIP_URL ?? 'http://localhost:4322';
const academy = process.env.ACADEMY_URL ?? 'http://localhost:4323';
const evidence = 'docs/screenshots/2026-refresh/resume';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(15000);
await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = 'astro-dev-toolbar { display: none !important; }'; document.head.append(style); }); });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const report = [];
try {
  for (const [name, base, paths] of [
    ['worship', worship, ['/', '/apply', '/apply/profile', '/apply/audition', '/apply/status', '/hire', '/hire/repertoire', '/hire/schedule', '/hire/summary', '/opportunities', '/church/roster', '/check-in/sample', '/check-in/success', '/check-in/standby-notified']],
    ['academy', academy, ['/', '/instruments', '/lessons', '/register', '/dashboard', '/sponsored', '/host-apply', '/instruments/piano', '/lessons/first-piano-steps', '/instructors/maya-thompson']],
  ]) {
    for (const path of paths) {
      const response = await page.goto(base + path, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, `${name}${path} HTTP status`);
      assert.equal(await page.locator('main h1').count(), 1, `${name}${path} single h1`);
      await page.locator('main img').evaluateAll(async (images) => { await Promise.all(images.map(async (img) => { img.loading = 'eager'; try { await img.decode(); } catch {} })); });
      const broken = await page.locator('main img').evaluateAll((images) => images.filter((i) => !i.complete || !i.naturalWidth).map((i) => i.src));
      assert.deepEqual(broken, [], `${name}${path} image paths`);
      for (const width of [390, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}${path} overflow at ${width}`);
        if ([390, 1440].includes(width) && ['/hire/summary', '/church/roster', '/opportunities', '/instruments/piano', '/lessons/first-piano-steps', '/register', '/dashboard'].includes(path)) {
          await page.screenshot({ path: `${evidence}/${name}-${path.slice(1).replaceAll('/', '-')}-${width}.png`, fullPage: true });
        }
      }
      report.push(`${name}${path}: 200, one h1, no broken images, no overflow at all five widths`);
    }
    await page.goto(base, { waitUntil: 'networkidle' });
    const hrefs = await page.locator('main a[href^="/"]').evaluateAll((links) => [...new Set(links.map((l) => l.getAttribute('href')))]);
    for (const href of hrefs) {
      const result = await page.request.get(base + href);
      assert.equal(result.status(), 200, `${name} home destination ${href}`);
    }
    for (const width of [390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(base, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `${name} overflow at ${width}`);
      if ([390,1440].includes(width)) {
        await page.locator('main img').evaluateAll(async (images) => { await Promise.all(images.map(async (img) => { img.loading = 'eager'; try { await img.decode(); } catch {} })); });
        await page.screenshot({ path: `${evidence}/${name}-home-${width}.png`, fullPage: true });
        await page.locator('main section').first().screenshot({ path: `${evidence}/${name}-hero-${width}.png` });
      }
      report.push(`${name}: no horizontal overflow at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log('Testing Worship local application');
  await page.goto(worship + '/apply');
  await page.getByRole('button', { name: 'Continue' }).click();
  assert.equal(new URL(page.url()).pathname, '/apply', 'empty application stays on form');
  await page.getByLabel('First name').fill('Sample');
  await page.getByLabel('Last name').fill('Learner');
  await page.getByLabel('Email').fill('sample@example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/apply/profile');
  await page.goto(worship + '/opportunities');
  await page.getByLabel('Filter by instrument').selectOption('Keys');
  assert.equal(await page.locator('[data-opportunity]:visible').count(), 1);
  await page.screenshot({ path: `${evidence}/worship-opportunities-1440.png`, fullPage: true });
  await page.goto(worship + '/church/roster');
  await page.screenshot({ path: `${evidence}/worship-roster-1440.png`, fullPage: true });
  console.log('Testing Academy registration');
  await page.goto(academy + '/register');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.locator('[data-step="0"]').isVisible(), true, 'empty registration stays on contact');
  await page.getByLabel('Full name').fill('Sample Guardian');
  await page.locator('input[name="email"]').fill('sample@example.com');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  assert.equal(await page.locator('[data-step="1"]').isVisible(), true);
  await page.getByLabel("Learner's first name").fill('Sample');
  await page.locator('input[name="age"]').fill('12');
  for (let i=0;i<3;i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Finish preview' }).click();
  assert.equal(await page.locator('[data-done]').isVisible(), true);
  await page.goto(academy + '/lessons');
  await page.locator('select[name="instrument"]').selectOption('piano');
  assert.equal(await page.locator('[data-lesson]:visible').count(), 1);
  await page.locator('select[name="level"]').selectOption('Advancing');
  assert.equal(await page.locator('#lesson-empty').isVisible(), true);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-lesson]:visible')).toHaveCount(6);
  assert.deepEqual(errors, [], 'no browser page errors');
  report.push('Passed: invalid-form negative paths, valid step navigation, opportunity role filter, Academy registration completion, lesson filter empty and reset states, no browser page errors.');
  await writeFile(`${evidence}/worship-academy-checks.txt`, report.join('\n') + '\n');
  console.log(report.join('\n'));
} finally { await browser.close(); }

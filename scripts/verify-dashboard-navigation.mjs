import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:4331';
const output = 'docs/screenshots/dashboard-navigation';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const route of ['/church', '/musician']) {
    for (const width of [390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal((await page.goto(`${base}${route}`)).status(), 200);
      const drawer = page.locator('#dash-drawer');
      assert.equal(await drawer.isVisible(), false, 'Closed drawer must not cover dashboard');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (width >= 1024) {
        const sidebar = await page.locator('aside').boundingBox();
        const main = await page.locator('main').boundingBox();
        assert.ok(main.x >= sidebar.x + sidebar.width, 'Content reserves sidebar space');
      } else {
        const toggle = page.getByRole('button', { name: 'Open workspace menu' });
        await toggle.click();
        assert.equal(await drawer.isVisible(), true);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
        await page.keyboard.press('Shift+Tab');
        assert.ok(await drawer.evaluate(el => el.contains(document.activeElement)), 'Focus stays in drawer');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('[data-drawer-open]').getAttribute('aria-expanded') === 'false');
        assert.equal(await toggle.evaluate(el => document.activeElement === el), true);
        await toggle.click();
        await page.getByRole('button', { name: 'Close menu', exact: true }).click();
        assert.equal(await drawer.isVisible(), false);
        await page.getByRole('button', { name: 'More', exact: true }).click();
        await page.screenshot({ path: `${output}/${route.slice(1)}-${width}-drawer.png` });
        await page.mouse.click(width - 4, 400);
        assert.equal(await drawer.isVisible(), false);
        await toggle.click();
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.waitForFunction(() => !document.querySelector('#dash-drawer').open);
        assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflow), 'hidden');
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await drawer.isVisible(), false);
      }
      await page.screenshot({ path: `${output}/${route.slice(1)}-${width}.png`, fullPage: true });
      console.log(`PASS ${route} ${width}: layout and navigation`);
    }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }

/**
 * Header mega menu (docs/DECISIONS.md, 2026-11-18): W3C APG Disclosure Navigation with photo tiles.
 * Runs against the web preview (4321) plus one check on academy (4323):
 *   E2E_APPS=web,academy pnpm exec playwright test tests/e2e/mega-menu.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WEB = 'http://127.0.0.1:4321/';
const ACADEMY = 'http://127.0.0.1:4323/';
const TILES = { Academy: 6, Worship: 8, Production: 7 } as const;

const button = (page: Page, name: string) => page.getByRole('button', { name: `${name} menu` });
const panel = (page: Page, name: string) =>
  page.locator(`#${'site-menu-' + ['Academy', 'Worship', 'Production'].indexOf(name)}`);

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('chevron opens the panel with the tiles, Escape closes it and returns focus', async ({ page }) => {
    await page.goto(WEB);
    for (const name of Object.keys(TILES) as (keyof typeof TILES)[]) {
      await expect(button(page, name)).toHaveAttribute('aria-expanded', 'false');
      await expect(panel(page, name)).toBeHidden();
      await button(page, name).click();
      await expect(button(page, name)).toHaveAttribute('aria-expanded', 'true');
      await expect(panel(page, name)).toBeVisible();
      await expect(panel(page, name).locator('ul').first().locator('li a')).toHaveCount(TILES[name]);
      await expect(panel(page, name).getByRole('link', { name: `All of ${name}` })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(panel(page, name)).toBeHidden();
      await expect(button(page, name)).toBeFocused();
      await expect(button(page, name)).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('opening one panel closes the other; outside click and backdrop close', async ({ page }) => {
    await page.goto(WEB);
    await button(page, 'Academy').click();
    await button(page, 'Worship').click();
    await expect(panel(page, 'Academy')).toBeHidden();
    await expect(panel(page, 'Worship')).toBeVisible();
    await page.mouse.click(640, 700); // the backdrop below the panel
    await expect(panel(page, 'Worship')).toBeHidden();
    await button(page, 'Production').click();
    await expect(panel(page, 'Production')).toBeVisible();
    await page.mouse.click(5, 780);
    await expect(panel(page, 'Production')).toBeHidden();
  });

  test('ArrowDown on the button opens the panel and focuses the first tile', async ({ page }) => {
    await page.goto(WEB);
    await button(page, 'Academy').focus();
    await page.keyboard.press('ArrowDown');
    await expect(panel(page, 'Academy')).toBeVisible();
    await expect(panel(page, 'Academy').getByRole('link', { name: 'Piano' })).toBeFocused();
  });

  test('tabbing out of the open panel closes it', async ({ page }) => {
    await page.goto(WEB);
    await button(page, 'Production').click();
    await page.getByRole('link', { name: 'All of Production' }).focus();
    await page.keyboard.press('Tab');
    await expect(panel(page, 'Production')).toBeHidden();
  });

  test('hover opens after a short delay and closes after a longer one; the panel is hoverable', async ({
    page,
  }) => {
    await page.goto(WEB);
    const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Academy' });
    await link.hover();
    await expect(panel(page, 'Academy')).toBeVisible({ timeout: 2000 });
    await expect(button(page, 'Academy')).toHaveAttribute('aria-expanded', 'true');
    // Moving down into the panel keeps it open (WCAG 1.4.13 hoverable).
    await panel(page, 'Academy').getByRole('link', { name: 'Drums' }).hover();
    await page.waitForTimeout(600);
    await expect(panel(page, 'Academy')).toBeVisible();
    await page.mouse.move(640, 790);
    await expect(panel(page, 'Academy')).toBeHidden({ timeout: 3000 });
  });

  test('tile images load only after the panel opens', async ({ page }) => {
    await page.goto(WEB, { waitUntil: 'networkidle' });
    const img = panel(page, 'Academy').locator('img').first();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(false);
    await button(page, 'Academy').click();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    // The illustration tile is a plain image with a fixed square.
    await button(page, 'Production').click();
    const art = panel(page, 'Production').locator('img[src$="/illustrations/church-email.svg"]');
    await expect.poll(() => art.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test('top items are links, Mission is a plain link, tile images are decorative', async ({ page }) => {
    await page.goto(WEB);
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Academy', exact: true })).toHaveAttribute('href', /\/$/);
    const mission = nav.getByRole('link', { name: 'Mission', exact: true });
    await expect(mission).toHaveAttribute('href', /\/mission$/);
    await expect(nav.getByRole('button', { name: /Mission/ })).toHaveCount(0);
    await expect(page.locator('[data-mega-panel] img:not([alt=""])')).toHaveCount(0);
    await expect(page.locator('[data-mega-button]').first()).not.toHaveAttribute('aria-haspopup', /.*/);
    await expect(page.getByRole('link', { name: 'Get Involved' }).first()).toBeVisible();
  });

  test('a top link navigates to the program site', async ({ page }) => {
    await page.goto(WEB);
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Academy', exact: true })
      .click();
    await expect(page).toHaveURL(/127\.0\.0\.1:4323\//);
  });

  test('open panel has no axe violations and no horizontal overflow', async ({ page }) => {
    await page.goto(WEB);
    for (const name of Object.keys(TILES) as (keyof typeof TILES)[]) {
      await button(page, name).click();
      await expect(panel(page, name)).toBeVisible();
      // The panel fades in; axe must not measure contrast against a half-transparent panel.
      await expect(panel(page, name)).toHaveCSS('opacity', '1');
      await page.evaluate(async () => {
        for (const img of Array.from(document.images)) img.loading = 'eager';
        await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
      });
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const serious = axe.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} ${v.nodes[0]?.target.join(' ')}`);
      expect(serious, `${name} panel: axe`).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      await page.keyboard.press('Escape');
    }
  });

  test('academy shows its own panel with instrument pages', async ({ page }) => {
    await page.goto(ACADEMY);
    await button(page, 'Academy').click();
    await expect(panel(page, 'Academy').getByRole('link', { name: 'Acoustic guitar' })).toHaveAttribute(
      'href',
      /\/instruments\/acoustic-guitar$/,
    );
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Academy', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('mobile 360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('hamburger opens the drawer; accordions list rows of at least 44 px', async ({ page }) => {
    await page.goto(WEB);
    await expect(page.locator('[data-mega-button]').first()).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('navigation', { name: 'Mobile primary' });
    const accordion = drawer.getByRole('button', { name: 'Worship' });
    await expect(accordion).toHaveAttribute('aria-expanded', 'false');
    await accordion.click();
    await expect(accordion).toHaveAttribute('aria-expanded', 'true');
    const rows = drawer.locator('#site-mobile-section-1 a');
    await expect(rows).toHaveCount(8 + 2 + 1);
    for (const row of await rows.all()) {
      const box = await row.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(drawer.getByRole('link', { name: 'Mission' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await accordion.click();
    await expect(accordion).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('without JavaScript', () => {
  test.use({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });

  test('top links exist and the panels stay hidden', async ({ page }) => {
    await page.goto(WEB);
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const name of Object.keys(TILES))
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Mission', exact: true })).toBeVisible();
    await expect(page.locator('[data-mega-button]').first()).toBeHidden();
    await expect(page.locator('[data-mega-panel]').first()).toBeHidden();
  });
});

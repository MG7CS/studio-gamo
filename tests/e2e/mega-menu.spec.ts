/**
 * Header mega menu (docs/DECISIONS.md, 2026-11-18): W3C APG Disclosure Navigation with photo tiles.
 *  * One check on the web preview (4321): every panel opens with its tiles, closes with Escape and passes axe; top
 * items are real links. Lazy tile images, the phone drawer, no-JavaScript, hover, arrow-key and tab-out checks were
 * removed on 2026-11-18 (AGENTS.md "Minimal testing").
 *   E2E_APPS=web pnpm exec playwright test tests/e2e/mega-menu.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const WEB = 'http://127.0.0.1:4321/';
const TILES = { Academy: 6, Worship: 8, Production: 7 } as const;

const button = (page: Page, name: string) => page.getByRole('button', { name: `${name} menu` });
const panel = (page: Page, name: string) =>
  page.locator(`#${'site-menu-' + ['Academy', 'Worship', 'Production'].indexOf(name)}`);

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('each panel opens with its tiles, closes with Escape, and is accessible', async ({ page }) => {
    await page.goto(WEB);
    const nav = page.getByRole('navigation', { name: 'Primary' });
    // Top items are real links; the header has no Mission link (it lives in the footer); tile images are decorative.
    await expect(nav.getByRole('link', { name: 'Academy', exact: true })).toHaveAttribute('href', /\/$/);
    await expect(nav.getByRole('link', { name: 'Mission', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-mega-panel] img:not([alt=""])')).toHaveCount(0);

    for (const name of Object.keys(TILES) as (keyof typeof TILES)[]) {
      await expect(button(page, name)).toHaveAttribute('aria-expanded', 'false');
      await expect(panel(page, name)).toBeHidden();
      await button(page, name).click();
      await expect(button(page, name)).toHaveAttribute('aria-expanded', 'true');
      await expect(panel(page, name)).toBeVisible();
      await expect(panel(page, name).locator('ul').first().locator('li a')).toHaveCount(TILES[name]);
      await expect(panel(page, name).getByRole('link', { name: `All of ${name}` })).toBeVisible();

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

      await page.keyboard.press('Escape');
      await expect(panel(page, name)).toBeHidden();
      await expect(button(page, name)).toBeFocused();
    }
  });
});

/**
 * Shared-component regression gate: the private catalog at web /preview/catalog renders every shared
 * layout, content and form primitive (docs/FRONTEND_ARCHITECTURE.md, rule 12).
 *
 * Checks: HTTP 200, noindex, /preview/ disallowed in robots.txt, one <h1>, no console/page errors,
 * axe WCAG 2.2 AA (no serious/critical), no horizontal overflow at 360 px and 1280 px, every checkbox
 * and radio has a ≥ 44 × 44 px hit area, and full-page screenshot baselines at both widths.
 *
 * Run: build apps/web, then `E2E_APPS=web pnpm exec playwright test tests/e2e/catalog.spec.ts`
 * (add `--update-snapshots` after an intended visual change).
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { watchErrors } from './helpers/a11y';

/** Overridable only to run against a preview on another port when 4321 is busy. */
const ORIGIN = process.env.CATALOG_ORIGIN ?? 'http://127.0.0.1:4321';
const URL = `${ORIGIN}/preview/catalog`;
const WIDTHS = [360, 1280] as const;

/** Load the page with images decoded, so overflow and screenshots measure the final layout. */
async function open(page: Page) {
  const response = await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    for (const img of Array.from(document.images)) img.loading = 'eager';
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)));
  });
  return response;
}

test('catalog is private: noindex and disallowed in robots.txt', async ({ request }) => {
  const robots = await (await request.get(`${ORIGIN}/robots.txt`)).text();
  expect(robots).toMatch(/^Disallow: \/preview\/$/m);
});

for (const width of WIDTHS) {
  test.describe(`catalog at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('renders, is accessible and does not overflow', async ({ page }) => {
      const errors = watchErrors(page);
      const response = await open(page);
      expect(response?.status()).toBe(200);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      expect(await page.locator('h1').count()).toBe(1);

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const serious = axe.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map(
          (v) =>
            `${v.id} (${v.nodes.length}) ${v.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 5)
              .join(', ')}`,
        );
      expect(serious, 'axe serious/critical violations').toEqual([]);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow at ${width} px`).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });

    test('every checkbox and radio has a 44 × 44 px hit area', async ({ page }) => {
      await open(page);
      const small = await page.evaluate(() => {
        const problems: { id: string; size: string }[] = [];
        for (const input of Array.from(
          document.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]'),
        )) {
          // The hit area is the input plus every label that activates it; take the largest target.
          const targets = [input, ...Array.from(input.labels ?? [])].map((el) => el.getBoundingClientRect());
          const w = Math.max(...targets.map((r) => r.width));
          const h = Math.max(...targets.map((r) => r.height));
          if (w < 44 || h < 44) problems.push({ id: input.id, size: `${Math.round(w)}×${Math.round(h)}` });
        }
        return problems;
      });
      expect(
        small.map((p) => `#${p.id} ${p.size}`),
        'checkbox/radio hit areas under 44 × 44 px',
      ).toEqual([]);
    });

    test('matches the screenshot baseline', async ({ page }) => {
      await open(page);
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        // The site header is position: fixed; pin it to the top so a full-page capture shows it once.
        const header = document.getElementById('site-header');
        if (header) header.style.position = 'absolute';
        window.scrollTo(0, 0);
      });
      await expect(page).toHaveScreenshot(`catalog-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.01,
      });
    });
  });
}

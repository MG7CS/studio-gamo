/**
 * axe WCAG 2.2 AA (serious/critical), one h1, and no horizontal overflow at 360 and 390 px, the pattern of
 * smoke.spec.ts. With `E2E_SCREENSHOTS=<folder>` it also saves a desktop and a 390 px screenshot of each page it checks
 * (for the owner's visual review; real screenshots of the running page).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const shots = process.env.E2E_SCREENSHOTS;
const fileOf = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

export async function expectAccessible(page: Page, label: string) {
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = axe.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
  expect(serious, `${label}: axe`).toEqual([]);
  expect(await page.locator('h1').count(), `${label}: one h1`).toBe(1);
  const size = page.viewportSize();
  if (shots) {
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, `${fileOf(label)}-desktop.png`), fullPage: true });
  }
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${label}: horizontal overflow at ${width} px`).toBeLessThanOrEqual(0);
    if (shots && width === 390)
      await page.screenshot({ path: join(shots, `${fileOf(label)}-390.png`), fullPage: true });
  }
  if (size) await page.setViewportSize(size);
}

/** Collects console errors and page errors (CSP violations included). */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  return errors;
}

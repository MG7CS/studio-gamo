/**
 * The private dynamic form fixture at web /preview/dynamic-form must stay out of search engines (noindex and
 * disallowed in robots.txt). The renderer's other behaviour (question types, show-if, counters, error view,
 * chunked uploads) is no longer covered by browser tests (removed 2026-11-18, AGENTS.md "Minimal testing"); the
 * upload limits and validation are covered by the domain tests.
 *
 * Run: build apps/web, then `E2E_APPS=web pnpm exec playwright test tests/e2e/dynamic-form.spec.ts`.
 */
import { test, expect } from '@playwright/test';

const ORIGIN = process.env.CATALOG_ORIGIN ?? 'http://127.0.0.1:4321';
const URL = `${ORIGIN}/preview/dynamic-form`;

test('the preview is private: noindex and disallowed in robots.txt', async ({ page, request }) => {
  const robots = await (await request.get(`${ORIGIN}/robots.txt`)).text();
  expect(robots).toMatch(/^Disallow: \/preview\/$/m);
  await page.goto(URL);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

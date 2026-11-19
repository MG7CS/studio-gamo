/**
 * The private component catalog at web /preview/catalog must stay out of search engines (noindex and disallowed in
 * robots.txt). Its layout, accessibility, hit-area, ratio and screenshot checks were removed on 2026-11-18
 * (AGENTS.md "Minimal testing"): look at the page after a visual change.
 *
 * Run: build apps/web, then `E2E_APPS=web pnpm exec playwright test tests/e2e/catalog.spec.ts`.
 */
import { test, expect } from '@playwright/test';

const ORIGIN = process.env.CATALOG_ORIGIN ?? 'http://127.0.0.1:4321';

test('catalog is private: noindex and disallowed in robots.txt', async ({ request }) => {
  const robots = await (await request.get(`${ORIGIN}/robots.txt`)).text();
  expect(robots).toMatch(/^Disallow: \/preview\/$/m);
  const response = await request.get(`${ORIGIN}/preview/catalog`);
  expect(response.status()).toBe(200);
  expect(await response.text()).toMatch(/<meta[^>]+name="robots"[^>]+noindex/);
});

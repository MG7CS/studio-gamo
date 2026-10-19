/**
 * Browser smoke tests (tests/e2e) against PRODUCTION builds served by `astro preview`, so the
 * enforced Content-Security-Policy and the built assets are what gets tested. Run `pnpm build`
 * first (pnpm check does), then `pnpm test:e2e`.
 *
 * Each server first applies the D1 migrations to that app's local state (idempotent), so a fresh
 * clone or CI runner has real tables instead of answering 503 on database-backed pages.
 * `env -u …` keeps Astro from detaching into the background when it detects an AI agent shell.
 */
import { defineConfig } from '@playwright/test';

const apps = [
  ['web', 4321],
  ['worship', 4322],
  ['academy', 4323],
  ['live', 4324],
  ['production', 4325],
] as const;

// `E2E_APPS=live,web pnpm test:e2e tests/e2e/live-tickets.spec.ts` starts only the listed apps' preview
// servers (default: all five), so a single spec does not pay for five servers.
const wanted = (process.env.E2E_APPS ?? '')
  .split(',')
  .map((a) => a.trim())
  .filter(Boolean);
const selectedApps = wanted.length ? apps.filter(([app]) => wanted.includes(app)) : apps;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  // One test covers every page of an app (sitemap-driven), so allow several minutes each.
  timeout: 600_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4321' },
  webServer: selectedApps.map(([app, port]) => ({
    // A local DB made by the old editorial CLI has tables but no migration records; the apply then
    // fails, so warn instead of blocking (fix once with `pnpm db:reset:local`).
    command:
      `(pnpm --filter apps-${app} exec wrangler d1 migrations apply gamo-db-local --local >/dev/null 2>&1 || ` +
      `echo "[e2e] ${app}: local D1 migrations could not be applied; run pnpm db:reset:local" >&2); ` +
      `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT ASTRO_TELEMETRY_DISABLED=1 pnpm --filter apps-${app} exec astro preview`,
    url: `http://127.0.0.1:${port}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  })),
});

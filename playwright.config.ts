/**
 * Browser smoke tests (tests/e2e) against PRODUCTION builds served by `astro preview`, so the
 * enforced Content-Security-Policy and the built assets are what gets tested. Run `pnpm build`
 * first (pnpm check does), then `pnpm test:e2e`.
 *
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

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  // One test covers every page of an app (sitemap-driven), so allow several minutes each.
  timeout: 600_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4321' },
  webServer: apps.map(([app, port]) => ({
    command: `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT ASTRO_TELEMETRY_DISABLED=1 pnpm --filter apps-${app} exec astro preview`,
    url: `http://127.0.0.1:${port}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  })),
});

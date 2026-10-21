/**
 * Browser smoke tests (tests/e2e) against PRODUCTION builds served by `astro preview`, so the
 * enforced Content-Security-Policy and the built assets are what gets tested. Run `pnpm build`
 * first (pnpm check does), then `pnpm test:e2e`.
 *
 * Each server first applies the D1 migrations to that app's local state (idempotent), so a fresh
 * clone or CI runner has real tables instead of answering 503 on database-backed pages.
 * `env -u …` keeps Astro from detaching into the background when it detects an AI agent shell.
 *
 * Clerk is always off for these servers: scripts/e2e/test-servers.ts blanks every Clerk variable in the
 * build's dist/server/.dev.vars before `astro preview` starts, and GAMO_TEST_SERVER=1 drops Clerk values
 * from local files. Servers already running on the ports are never reused (they could carry real keys).
 * A live key (pk_live_/sk_live_/rk_live_) in a local env file stops the run here with an explanation.
 * Clerk switched on is covered with fake keys by scripts/audit/clerk-configured-fake-keys-e2e.test.mjs.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { describeLiveKeyFindings, findLiveKeysInLocalEnv } from './packages/config/env-loader.ts';
import { ADMIN_E2E_PORT } from './scripts/e2e/admin-fixture.ts';
import { FLOW_LIVE_PORT } from './scripts/e2e/live-flow-fixture.ts';

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
// Admin is served differently: scripts/e2e/admin-server.ts runs the BUILT admin worker as production does
// (ENVIRONMENT=production, Cloudflare Access verified, enforced CSP) with labeled sample rows, on port 4327
// (never 4326, the dev server). `E2E_APPS=admin` starts only it.
const withAdmin = wanted.length === 0 || wanted.includes('admin');
// The Gamo Live flow (tests/e2e/live-flow.spec.ts) runs the BUILT live and admin workers together on ports 4328 and
// 4329 (scripts/e2e/live-flow-server.ts). `E2E_APPS=live-flow` starts only that.
const withFlow = wanted.length === 0 || wanted.includes('live-flow');

/** web, live and admin keep their local database in one shared folder (packages/config/env-loader.ts). */
const persist = (app: string) =>
  ['web', 'live'].includes(app) ? ' --persist-to ../../.wrangler/shared-state' : '';

const liveKeys = selectedApps.flatMap(([app]) =>
  findLiveKeysInLocalEnv({ app, appDir: fileURLToPath(new URL(`apps/${app}`, import.meta.url)) }),
);
if (liveKeys.length > 0) {
  const unique = [...new Map(liveKeys.map((f) => [`${f.file}:${f.name}`, f])).values()];
  throw new Error(
    `pnpm test:e2e refuses to start.\n${describeLiveKeyFindings(unique)}\n` +
      'Move those keys out of the local files (tests never need them), then run the tests again.',
  );
}

export default defineConfig({
  testDir: 'tests/e2e',
  // Pictures of tests/e2e/visual-baseline.spec.ts, one folder per spec and no platform suffix: the baseline is
  // recorded and compared on the owner's computer only (the spec is opt-in).
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  // One test covers every page of an app (sitemap-driven), so allow several minutes each.
  timeout: 600_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:4321' },
  webServer: [
    ...(withFlow
      ? [
          {
            command: 'pnpm exec tsx scripts/e2e/live-flow-server.ts',
            url: `http://127.0.0.1:${FLOW_LIVE_PORT}/robots.txt`,
            reuseExistingServer: false,
            timeout: 180_000,
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
          },
        ]
      : []),
    ...(withAdmin
      ? [
          {
            command: 'pnpm exec tsx scripts/e2e/admin-server.ts',
            // Without an Access assertion the admin answers 401; Playwright accepts that as "up".
            url: `http://127.0.0.1:${ADMIN_E2E_PORT}/`,
            reuseExistingServer: false,
            timeout: 120_000,
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
          },
        ]
      : []),
    ...selectedApps.map(([app, port]) => ({
      // A local DB made by the old editorial CLI has tables but no migration records; the apply then
      // fails, so warn instead of blocking (fix once with `pnpm db:reset:local`).
      command:
        `pnpm exec tsx scripts/e2e/test-servers.ts prepare ${app} && ` +
        `(pnpm --filter apps-${app} exec wrangler d1 migrations apply gamo-db-local --local${persist(app)} >/dev/null 2>&1 || ` +
        `echo "[e2e] ${app}: local D1 migrations could not be applied; run pnpm db:reset:local" >&2); ` +
        // web and live also read Gamo Live's own database (shared local state with the admin).
        (app === 'web' || app === 'live'
          ? `(pnpm --filter apps-${app} exec wrangler d1 migrations apply LIVE_DB --local${persist(app)} >/dev/null 2>&1 || ` +
            `echo "[e2e] ${app}: Live database migrations could not be applied; run make live-db" >&2); `
          : '') +
        `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT ASTRO_TELEMETRY_DISABLED=1 GAMO_TEST_SERVER=1 pnpm --filter apps-${app} exec astro preview`,
      url: `http://127.0.0.1:${port}/robots.txt`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore' as const,
      stderr: 'pipe' as const,
    })),
  ],
});

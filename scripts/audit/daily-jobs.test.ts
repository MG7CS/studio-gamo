/**
 * The daily job is wired the way the approved design says (2026-11-16 "Daily cron (approved)"): one cron
 * trigger, on the web Worker only, in preview and production, served by a custom entry that exports both
 * Astro's `fetch` and a `scheduled` handler. Static checks only; the jobs themselves are tested in
 * packages/domain/src/jobs. A trigger without a handler (or a handler on the wrong app) fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
/** TOML without comment lines, so commented-out blocks do not count. */
const live = (toml: string) =>
  toml
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

const web = live(read('apps/web/wrangler.toml'));

test('web wrangler.toml points main at the custom entry and the entry file exists', () => {
  assert.match(web, /^main = "src\/worker\.ts"$/m);
  assert.ok(existsSync(resolve(root, 'apps/web/src/worker.ts')));
  // `main` belongs to the top-level worker, before the first table.
  assert.ok(web.indexOf('main = ') < web.indexOf('['));
});

test('web has exactly one cron, 06:00 UTC daily, in preview and production only', () => {
  assert.deepEqual(web.match(/^\[env\.[a-z]+\.triggers\]$/gm), [
    '[env.preview.triggers]',
    '[env.production.triggers]',
  ]);
  assert.deepEqual(web.match(/^crons = .*$/gm), ['crons = ["0 6 * * *"]', 'crons = ["0 6 * * *"]']);
  assert.ok(!/^\[triggers\]$/m.test(web), 'no cron on the local (top-level) environment');
});

test('no other app has a cron trigger or a custom Worker entry', () => {
  for (const app of ['academy', 'admin', 'production', 'worship']) {
    const toml = live(read(`apps/${app}/wrangler.toml`));
    assert.ok(!/triggers\]/.test(toml), `${app} has a triggers table`);
    assert.ok(!/^crons\s*=/m.test(toml), `${app} has crons`);
    assert.ok(!/^main\s*=/m.test(toml), `${app} has a custom main`);
  }
});

test('the custom entry exports fetch and scheduled and runs the daily jobs without throwing', () => {
  const source = read('apps/web/src/worker.ts');
  assert.match(source, /from '@astrojs\/cloudflare\/handler'/);
  assert.match(source, /from '@gamo\/domain\/jobs'/);
  assert.match(source, /export default \{\s*fetch: handle,\s*scheduled\(/);
  assert.match(source, /ctx\.waitUntil\(\s*runDailyJobs\(/);
  assert.match(source, /controller\.scheduledTime \/ 1000/);
  assert.match(source, /\.catch\(/);
  assert.ok(
    !/console\.(log|info|error|warn)\([^)]*\b(error|err)\.message/.test(source),
    'logs error messages',
  );
});

test('the domain package exports the jobs entry the Worker imports', () => {
  const pkg = JSON.parse(read('packages/domain/package.json')) as { exports: Record<string, string> };
  assert.equal(pkg.exports['./jobs'], './src/jobs/index.ts');
});

test('the runbook describes an enabled trigger, not a commented-out one', () => {
  const runbook = read('docs/RUNBOOK.md');
  assert.ok(
    !/commented out/.test(
      runbook.slice(runbook.indexOf('**Daily job.**'), runbook.indexOf('**Daily job.**') + 3000),
    ),
  );
  assert.match(runbook, /src\/worker\.ts/);
});

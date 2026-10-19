#!/usr/bin/env tsx
/**
 * Gamo Live catalog import (docs/LIVE_DATA_MODEL.md §6).
 *
 *   pnpm db:migrate:live:local                         create/upgrade the local Live database
 *   pnpm live:catalog:import                           import into the local database, queued for admin review
 *   pnpm live:catalog:import --publish-approved        also publish the records that pass every editorial rule
 *   pnpm live:catalog:import --env preview --dry-run   evaluate only (preview/production are never written here)
 *
 * Local only: the target is the Miniflare SQLite file that `astro dev` for apps/live uses (the one holding
 * the Live schema). Preview and production are changed by the owner, never by this script.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSqliteD1 } from '../../packages/db/testing.ts';
import { importCatalog } from '../../packages/domain/src/live/catalog-import.ts';
import type { SeedCatalogDocument } from '../../packages/domain/src/services/live-external-discovery.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const command = args[0];
const env = value('--env') ?? 'local';
const dryRun = flag('--dry-run');
const file = resolve(value('--file') ?? 'data/gamo_live_verified_events_2026-10-15.json');

if (command !== 'import') {
  console.error(
    'usage: live:catalog:import [--file <json>] [--publish-approved] [--env local|preview|production --dry-run]',
  );
  process.exit(2);
}
if (env !== 'local' && !dryRun) {
  console.error(
    `Refusing to write to ${env}: only the owner changes preview and production. Use --dry-run to evaluate.`,
  );
  process.exit(2);
}

const doc = JSON.parse(readFileSync(file, 'utf8')) as SeedCatalogDocument;
const now = Math.floor(Date.now() / 1000);

function localLiveDatabase(): string {
  const dir = resolve('apps/live/.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const candidates = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
    : [];
  for (const name of candidates) {
    const path = resolve(dir, name);
    const d1 = createSqliteD1(path);
    try {
      const row = d1.sqlite
        .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'event_occurrences'")
        .get();
      if (row) return path;
    } finally {
      d1.sqlite.close();
    }
  }
  throw new Error('No local Live database found. Run `pnpm db:migrate:live:local` first.');
}

const d1 = createSqliteD1(dryRun ? ':memory:' : localLiveDatabase());
if (dryRun) {
  const migrations = resolve('packages/db/live/migrations');
  for (const name of readdirSync(migrations)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    d1.sqlite.exec(readFileSync(resolve(migrations, name), 'utf8'));
}

const report = await importCatalog(d1 as never, doc, {
  now,
  publishApproved: flag('--publish-approved'),
  revalidateUnfetched: flag('--revalidate-unfetched'),
});
for (const r of report)
  console.log(`${r.result.padEnd(9)} ${r.status.padEnd(14)} ${r.importKey}  ${r.reason}`);
console.log(
  `${dryRun ? 'Evaluated (nothing written)' : 'Done'}: ${report.filter((r) => r.result === 'imported').length} imported, ` +
    `${report.filter((r) => r.result === 'unchanged').length} unchanged, ` +
    `${report.filter((r) => r.status === 'published').length} published, ` +
    `${report.filter((r) => r.status === 'pending_review').length} waiting for review, ` +
    `${report.filter((r) => r.status === 'rejected').length} rejected.`,
);
d1.sqlite.close();

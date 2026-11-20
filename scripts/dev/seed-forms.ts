#!/usr/bin/env tsx
/**
 * Publishes the ten default forms in the LOCAL development databases (what the admin Forms page does on
 * its first visit), so the public form pages work locally without a staff account.
 *
 *   pnpm forms:seed:local
 *
 * Local only, fail closed: it opens only the miniflare SQLite files under
 * `apps/<app>/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/` of this checkout (each app has its own
 * database). It takes no option, reads no environment file, uses no credential and makes no network call.
 * Run `pnpm db:migrate:local` first. Idempotent: forms that already exist are left untouched.
 */
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedDefaultForms } from '../../packages/domain/src/forms/seeds.ts';
import { createSqliteD1 } from '../../packages/db/testing.ts';

export const LOCAL_APPS = ['web', 'worship', 'academy', 'production', 'admin'] as const;
const STATE_SUBDIR = join('.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

/** The only directory an app's local D1 file may live in. */
export function localStateDir(repoRoot: string, app: string): string {
  return join(repoRoot, 'apps', app, STATE_SUBDIR);
}

/**
 * True only when `file` is a SQLite file directly inside one app's local wrangler state directory of this
 * checkout (symlinks resolved by the caller). Anything else - a remote path, another checkout, `..`
 * tricks, the metadata file - is refused.
 */
export function isLocalD1File(repoRoot: string, file: string): boolean {
  const root = resolve(repoRoot);
  const target = resolve(file);
  if (!target.endsWith('.sqlite') || target.endsWith(`${sep}metadata.sqlite`)) return false;
  return LOCAL_APPS.some((app) => {
    const dir = resolve(localStateDir(root, app));
    const rel = relative(dir, target);
    return rel !== '' && !rel.startsWith('..') && !rel.includes(sep) && resolve(dir, rel) === target;
  });
}

/** Finds an app's local database file, or null when the app has none yet. Refuses anything not local. */
export function findLocalD1File(repoRoot: string, app: string): string | null {
  const dir = localStateDir(repoRoot, app);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (files.length === 0) return null;
  if (files.length > 1) throw new Error(`multiple-databases:${app}`);
  const file = realpathSync(join(dir, files[0]!));
  if (!isLocalD1File(realpathSync(repoRoot), file)) throw new Error(`not-local:${app}`);
  return file;
}

async function main(): Promise<number> {
  const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
  const lines: string[] = [];
  const missingTables: string[] = [];
  let opened = 0;

  for (const app of LOCAL_APPS) {
    const file = findLocalD1File(repoRoot, app);
    if (!file) {
      lines.push(`${app}: no local database yet`);
      continue;
    }
    const db = createSqliteD1(file);
    try {
      db.sqlite.exec('PRAGMA busy_timeout=5000');
      const table = db.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='forms'")
        .get();
      if (!table) {
        missingTables.push(app);
        continue;
      }
      const result = await seedDefaultForms(db, Math.floor(Date.now() / 1000));
      opened++;
      lines.push(`${app}: created [${result.created.join(', ')}] existing [${result.skipped.join(', ')}]`);
    } finally {
      db.sqlite.close();
    }
  }

  if (missingTables.length > 0 || opened === 0) {
    const where = missingTables.length > 0 ? ` (${missingTables.join(', ')})` : '';
    console.error(`forms-tables-missing${where}: run "pnpm db:migrate:local" first, then run this again.`);
    return 1;
  }
  console.log(lines.join('; '));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      const code = error instanceof Error ? error.message.split(/[\s:]/)[0] : 'unknown';
      console.error(`forms-seed-failed: ${code}`);
      process.exit(1);
    },
  );
}

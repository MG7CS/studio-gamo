/**
 * Publishes the default forms (worship/production apply and request, contact, partner interest) into an app's
 * LOCAL D1 file, the way the admin app does on its first load, so the public form pages exist in browser tests.
 * Local state only: it opens the Miniflare SQLite file under apps/<app>/.wrangler and never talks to Cloudflare.
 * Idempotent (existing slugs are skipped). Run after the migrations: `pnpm exec tsx scripts/e2e/seed-forms.ts web`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSqliteD1 } from '../../packages/db/testing.ts';
import { seedDefaultForms } from '../../packages/domain/src/forms/seeds.ts';
import type { SqlDatabase } from '../../packages/domain/src/security/sql-database.ts';

const app = process.argv[2] ?? 'web';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const dir = join(root, 'apps', app, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

if (!existsSync(dir)) {
  console.error(`[e2e] seed-forms: no local D1 state for ${app} (run the migrations first)`);
  process.exit(0);
}
const file = readdirSync(dir).find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
if (!file) {
  console.error(`[e2e] seed-forms: no local database file for ${app}`);
  process.exit(0);
}
const db = createSqliteD1(join(dir, file));
db.sqlite.exec('PRAGMA busy_timeout = 15000');
const result = await seedDefaultForms(db as unknown as SqlDatabase, Math.floor(Date.now() / 1000));
db.sqlite.close();
console.log(`[e2e] seed-forms ${app}: created ${result.created.length}, skipped ${result.skipped.length}`);

#!/usr/bin/env tsx
/**
 * Gamo Live — Editorial Publisher & External Event Catalog CLI
 *
 * Commands:
 *   pnpm live:publisher:provision --env local --dry-run
 *   pnpm live:publisher:provision --env local --apply
 *   pnpm live:events:import --file data/gamo_live_verified_events_2026-10-15.json --env local --dry-run
 *   pnpm live:events:import --file data/gamo_live_verified_events_2026-10-15.json --env local --apply
 *   pnpm live:events:publish --env local --only-approved --dry-run
 *   pnpm live:events:publish --env local --only-approved --apply
 *
 * Safety & Governance:
 * - Defaults to `--dry-run` unless `--apply` is explicitly supplied.
 * - Rejects `--env production --apply` unless `--confirm-production` is also explicitly supplied.
 * - Applies tracked D1 migrations idempotently to the local Wrangler D1 state (`apps/live/.wrangler/state/v3`)
 *   so `astro dev` and local verification immediately serve the curated catalog.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDb } from '../../packages/db/index.ts';
import { createInMemoryD1 } from '../../packages/db/testing.ts';
import {
  LiveService,
  type SeedCatalogDocument,
} from '../../packages/domain/index.ts';

interface CliArgs {
  command: 'provision' | 'import' | 'publish' | 'review';
  env: 'local' | 'staging' | 'production';
  dryRun: boolean;
  apply: boolean;
  onlyApproved: boolean;
  confirmProduction: boolean;
  file?: string;
  importKey?: string;
  decision?: 'approved' | 'verified' | 'published' | 'archived' | 'canceled' | 'rejected';
  notes?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  const positional: string[] = [];
  let env: 'local' | 'staging' | 'production' = 'local';
  let dryRun = false;
  let apply = false;
  let onlyApproved = false;
  let confirmProduction = false;
  let file: string | undefined;
  let importKey: string | undefined;
  let decision: CliArgs['decision'];
  let notes: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--env' && argv[i + 1]) {
      const val = argv[++i];
      if (val !== 'local' && val !== 'staging' && val !== 'production') {
        throw new Error(`Invalid --env value '${val}'. Expected local | staging | production.`);
      }
      env = val;
    } else if (arg.startsWith('--env=')) {
      const val = arg.slice('--env='.length);
      if (val !== 'local' && val !== 'staging' && val !== 'production') {
        throw new Error(`Invalid --env value '${val}'. Expected local | staging | production.`);
      }
      env = val as CliArgs['env'];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--only-approved') {
      onlyApproved = true;
    } else if (arg === '--confirm-production') {
      confirmProduction = true;
    } else if (arg === '--file' && argv[i + 1]) {
      file = argv[++i];
    } else if (arg.startsWith('--file=')) {
      file = arg.slice('--file='.length);
    } else if (arg === '--import-key' && argv[i + 1]) {
      importKey = argv[++i];
    } else if (arg === '--decision' && argv[i + 1]) {
      decision = argv[++i] as CliArgs['decision'];
    } else if (arg === '--notes' && argv[i + 1]) {
      notes = argv[++i];
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  const rawCmd = positional[0] || 'import';
  if (
    rawCmd !== 'provision' &&
    rawCmd !== 'import' &&
    rawCmd !== 'publish' &&
    rawCmd !== 'review'
  ) {
    throw new Error(
      `Unknown command '${rawCmd}'. Expected provision | import | publish | review.`
    );
  }

  // Default to dry-run if --apply was not explicitly passed
  if (!apply) {
    dryRun = true;
  }
  if (dryRun && apply) {
    throw new Error('Cannot specify both --dry-run and --apply.');
  }

  if (env === 'production' && apply && !confirmProduction) {
    throw new Error(
      'SAFETY GATE: Refusing to run with --env production --apply without explicit --confirm-production approval flag.'
    );
  }

  return {
    command: rawCmd,
    env,
    dryRun,
    apply,
    onlyApproved,
    confirmProduction,
    file,
    importKey,
    decision,
    notes,
  };
}

/**
 * Applies all tracked D1 migrations idempotently to a D1 database instance,
 * tolerating already-applied tables/columns/triggers/indexes on persistent local state.
 */
async function ensureMigrationsApplied(d1: any, migrationsDir: string): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const rawSql = readFileSync(resolve(migrationsDir, file), 'utf8');
    const statements = rawSql
      .split('--> statement-breakpoint')
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await d1.exec(stmt.replace(/\n/g, ' '));
      } catch (err) {
        const msg = String((err as Error)?.message ?? err).toLowerCase();
        // Ignore benign idempotency errors when re-running on already-migrated persistent local D1
        if (
          msg.includes('already exists') ||
          msg.includes('duplicate column name') ||
          msg.includes('unique constraint failed')
        ) {
          continue;
        }
        throw err;
      }
    }
  }
}

import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

function createSqliteBackedD1(sqlitePath: string): any {
  const sqlite = new DatabaseSync(sqlitePath);
  sqlite.exec('PRAGMA foreign_keys=ON');

  const createStatement = (query: string) => {
    let boundParams: any[] = [];
    const stmtObj = {
      bind(...params: any[]) {
        boundParams = params;
        return stmtObj;
      },
      async all() {
        const stmt = sqlite.prepare(query);
        const rows = stmt.all(...boundParams);
        return { results: rows, success: true };
      },
      async run() {
        const stmt = sqlite.prepare(query);
        const info = stmt.run(...boundParams);
        return {
          success: true,
          meta: {
            changes: info.changes,
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
      async first(col?: string) {
        const stmt = sqlite.prepare(query);
        const row = stmt.get(...boundParams) as any;
        if (!row) return null;
        return col ? row[col] : row;
      },
      async raw() {
        const stmt = sqlite.prepare(query);
        const rows = stmt.all(...boundParams);
        return rows.map((r) => Object.values(r as any));
      },
    };
    return stmtObj;
  };

  return {
    sqlite,
    prepare(query: string) {
      return createStatement(query);
    },
    async batch(statements: any[]) {
      const results = [];
      sqlite.exec('BEGIN');
      try {
        for (const s of statements) results.push(await s.all());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
  };
}

async function openTargetD1(env: 'local' | 'staging' | 'production', dryRun: boolean): Promise<{
  d1: any;
  dispose: () => Promise<void>;
  storageDescription: string;
}> {
  const migrationsDir = resolve(process.cwd(), 'packages/db/migrations');

  if (dryRun && env !== 'local') {
    const d1 = createInMemoryD1();
    await ensureMigrationsApplied(d1, migrationsDir);
    return {
      d1,
      dispose: async () => {
        d1.sqlite?.close?.();
      },
      storageDescription: `isolated in-memory D1 simulation (--env ${env} --dry-run)`,
    };
  }

  if (env !== 'local') {
    throw new Error(
      `Remote D1 mutation for --env ${env} requires authenticated Cloudflare Wrangler D1 execution and owner release sign-off.`
    );
  }

  const d1ObjectDir = resolve(
    process.cwd(),
    'apps/live/.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
  );
  mkdirSync(d1ObjectDir, { recursive: true });

  const existingSqliteFiles = readdirSync(d1ObjectDir)
    .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
    .sort();

  const targetSqliteFile =
    existingSqliteFiles[0] ??
    'a36f84ea60804f30bb0c7f7cad9f5336a6cca0165abdab8b9241d93dbf0b6006.sqlite';
  const targetSqlitePath = resolve(d1ObjectDir, targetSqliteFile);

  const d1 = createSqliteBackedD1(targetSqlitePath);
  await ensureMigrationsApplied(d1, migrationsDir);

  return {
    d1,
    dispose: async () => {
      d1.sqlite?.close?.();
    },
    storageDescription: `local Wrangler D1 SQLite (${targetSqlitePath})`,
  };
}

function resolveCatalogPath(inputPath?: string): string {
  const candidates = [
    inputPath ? resolve(process.cwd(), inputPath) : null,
    resolve(process.cwd(), 'data/gamo_live_verified_events_2026-10-15.json'),
  ].filter((p): p is string => Boolean(p));

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    `Could not locate verified event catalog JSON. Checked: ${candidates.join(', ')}`
  );
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const { d1, dispose, storageDescription } = await openTargetD1(args.env, args.dryRun);

  try {
    const db = createDb(d1);
    const liveService = new LiveService(db);

    console.log(
      `\n[Gamo Live Editorial CLI] command=${args.command} env=${args.env} mode=${args.dryRun ? 'DRY-RUN' : 'APPLY'} target=${storageDescription}`
    );

    if (args.command === 'provision') {
      const result = await liveService.provisionListingsPublisher({
        dryRun: args.dryRun,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (args.command === 'import') {
      const filePath = resolveCatalogPath(args.file);
      const rawJson = readFileSync(filePath, 'utf8');
      const catalog = JSON.parse(rawJson) as SeedCatalogDocument;

      const report = await liveService.importExternalDiscoveryCatalog(catalog, {
        dryRun: args.dryRun,
      });

      console.log(
        `\nImport Summary (${filePath}):\n` +
          `  Total Candidates:      ${report.totalCandidates}\n` +
          `  Approved for Publish:  ${report.approvedForPublishCount}\n` +
          `  Held for Review:       ${report.heldForReviewCount}\n` +
          `  Rejected / Incomplete: ${report.rejectedCount}\n` +
          `  DB Created / Updated:  ${report.importedCount} created, ${report.updatedCount} updated\n`
      );

      for (const entry of report.entries) {
        const badge =
          entry.editorialDecision === 'approved'
            ? 'APPROVED'
            : entry.editorialDecision === 'held_for_review'
              ? 'HELD    '
              : 'REJECTED';
        console.log(
          `  [${badge}] ${entry.importKey.padEnd(36)} | ${entry.metroSlug.padEnd(16)} | ${(entry.venueName ?? 'MISSING VENUE').padEnd(32)} | ${entry.reason}`
        );
      }

      if (!args.dryRun) {
        const outJsonPath = resolve(
          process.cwd(),
          'docs/GAMO_LIVE_IMPORT_REPORT_2026-10-15.json'
        );
        writeFileSync(outJsonPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`\nWrote structured import report to ${outJsonPath}`);
      }
      return;
    }

    if (args.command === 'review') {
      if (!args.importKey || !args.decision) {
        throw new Error('review command requires --import-key <key> and --decision <status>.');
      }
      if (args.dryRun) {
        console.log(
          `[DRY-RUN] Would transition ${args.importKey} -> ${args.decision} (${args.notes ?? 'no notes'})`
        );
        return;
      }
      const updated = await liveService.reviewExternalListing(args.importKey, args.decision, {
        notes: args.notes,
      });
      console.log(
        `Updated ${updated.importKey} (${updated.slug}): editorialStatus=${updated.editorialStatus}, publicStatus=${updated.status}`
      );
      return;
    }

    if (args.command === 'publish') {
      const result = await liveService.publishApprovedExternalListings({
        dryRun: args.dryRun,
        onlyApproved: args.onlyApproved,
      });

      console.log(
        `\nPublish Summary:\n` +
          `  Newly Published:    ${result.publishedCount}\n` +
          `  Already Published:  ${result.alreadyPublishedCount}\n` +
          `  Skipped / Held:     ${result.skippedHeldCount}\n` +
          `  Active Public Slugs (${result.publishedSlugs.length}): ${result.publishedSlugs.join(', ')}\n`
      );

      if (result.skippedSlugs.length > 0) {
        console.log('  Held / Unapproved Records:');
        for (const item of result.skippedSlugs) {
          console.log(`    - ${item.slug} (${item.editorialStatus}): ${item.reason}`);
        }
      }
      return;
    }
  } finally {
    await dispose();
  }
}

main().catch((err) => {
  console.error(`\n[Gamo Live Editorial CLI Error] ${(err as Error)?.message ?? err}`);
  process.exit(1);
});

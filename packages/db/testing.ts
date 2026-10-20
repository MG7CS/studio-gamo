/** Test-only SQLite D1 adapter. Never import into Workers. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AnyD1Database } from 'drizzle-orm/d1';
type SqlValue = null | number | bigint | string | Uint8Array;

export interface SqliteD1Statement {
  bind(...params: SqlValue[]): SqliteD1Statement;
  /** Runs the statement synchronously (used by `batch()` so a batch never interleaves with another). */
  allSync(): { results: Record<string, SqlValue>[]; success: true };
  all(): Promise<{ results: Record<string, SqlValue>[]; success: true }>;
  run(): Promise<{ success: true; meta: { changes: number | bigint; last_row_id: number } }>;
  first(col?: string): Promise<unknown>;
  raw(): Promise<SqlValue[][]>;
}

/** A D1-compatible facade over node:sqlite, usable with `drizzle()` via `asD1()`. */
export interface SqliteD1 {
  sqlite: DatabaseSync;
  prepare(query: string): SqliteD1Statement;
  batch(statements: SqliteD1Statement[]): Promise<unknown[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

/**
 * Creates a D1-compatible database on Node's native SQLite (`:memory:` by default, or a file path).
 * Used by tests, migration verification and the editorial CLI.
 */
export function createSqliteD1(path = ':memory:'): SqliteD1 {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys=ON');

  const createStatement = (query: string): SqliteD1Statement => {
    // Like D1, which limits a compound SELECT to five terms (node:sqlite has no limit to set): fail here, not in a
    // deployed Worker. Counted over the whole statement, so it is stricter than D1 for nested compounds.
    if ((query.match(/\b(UNION|INTERSECT|EXCEPT)\b/gi) ?? []).length > 4)
      throw new Error('D1_ERROR: too many terms in compound SELECT (D1 allows at most 5)');
    let boundParams: SqlValue[] = [];

    const stmtObj: SqliteD1Statement = {
      bind(...params) {
        boundParams = params;
        return stmtObj;
      },
      allSync() {
        const rows = sqlite.prepare(query).all(...boundParams) as Record<string, SqlValue>[];
        return { results: rows, success: true };
      },
      async all() {
        return stmtObj.allSync();
      },
      async run() {
        const info = sqlite.prepare(query).run(...boundParams);
        return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
      },
      async first(col) {
        const row = sqlite.prepare(query).get(...boundParams) as Record<string, SqlValue> | undefined;
        if (!row) return null;
        return col ? row[col] : row;
      },
      async raw() {
        const rows = sqlite.prepare(query).all(...boundParams) as Record<string, SqlValue>[];
        return rows.map((r) => Object.values(r));
      },
    };

    return stmtObj;
  };

  return {
    sqlite,
    prepare: createStatement,
    // Like D1: a batch is one transaction, applied whole or not at all, and never interleaved with
    // another batch (statements run synchronously between BEGIN and COMMIT).
    async batch(statements) {
      const results: unknown[] = [];
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const s of statements) results.push(s.allSync());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(query) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
  };
}

/** In-memory database for tests. */
export function createInMemoryD1(): SqliteD1 {
  return createSqliteD1(':memory:');
}

/** The facade implements the subset of D1 that Drizzle calls; this is the one place that is asserted. */
export function asD1(d1: SqliteD1): AnyD1Database {
  return d1 as unknown as AnyD1Database;
}

/**
 * Applies SQL migration scripts to a database instance.
 */
export async function applyMigrations(d1: Pick<SqliteD1, 'exec'>, migrationSqls: string[]): Promise<void> {
  for (const sqlText of migrationSqls) {
    const stmts = sqlText
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of stmts) {
      if (stmt) {
        await d1.exec(stmt);
      }
    }
  }
}

/** Absolute path of `packages/db/migrations`. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/** Migration file names in apply order (Wrangler applies them by name). */
export function migrationFileNames(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** SQL text of every migration, optionally only those whose file name sorts before `beforeFile` (e.g. '0012'). */
export function readMigrations(beforeFile?: string): string[] {
  return migrationFileNames()
    .filter((f) => beforeFile === undefined || f < beforeFile)
    .map((f) => readFileSync(`${MIGRATIONS_DIR}${f}`, 'utf8'));
}

/** A database with every migration applied (`:memory:` by default). */
export async function createMigratedD1(path = ':memory:'): Promise<SqliteD1> {
  const d1 = createSqliteD1(path);
  await applyMigrations(d1, readMigrations());
  return d1;
}

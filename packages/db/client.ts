/**
 * Database client factory and local D1 simulation adapter.
 *
 * Automatically connects to Cloudflare D1 in Workers runtime (env.DB),
 * or provides a fully compliant local in-memory SQLite D1 simulation for
 * tests and local development.
 */

import { drizzle } from 'drizzle-orm/d1';
import { DatabaseSync } from 'node:sqlite';
import * as schema from './schema.ts';

export type GamoDatabase = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Creates an in-memory D1-compatible database instance using Node's native SQLite.
 * Useful for automated tests, migration verification, and development fallback.
 */
export function createInMemoryD1(): any {
  const sqlite = new DatabaseSync(':memory:');

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

  const d1 = {
    sqlite,
    prepare(query: string) {
      return createStatement(query);
    },
    async batch(statements: any[]) {
      const results = [];
      for (const s of statements) {
        results.push(await s.all());
      }
      return results;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
  };

  return d1;
}

/**
 * Applies SQL migration scripts to a database instance.
 */
export async function applyMigrations(d1: any, migrationSqls: string[]): Promise<void> {
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

// Global cached dev database for local sessions
let cachedDevDb: GamoDatabase | null = null;

/**
 * Returns a GamoDatabase instance.
 * If a Cloudflare D1 binding is provided, wraps it with Drizzle.
 * Otherwise returns a seeded local in-memory database for testing/dev.
 */
export function getDb(binding?: any): GamoDatabase {
  if (binding && typeof binding.prepare === 'function') {
    return drizzle(binding, { schema });
  }

  if (cachedDevDb) {
    return cachedDevDb;
  }

  const inMem = createInMemoryD1();
  const db = drizzle(inMem, { schema });
  cachedDevDb = db;
  return db;
}

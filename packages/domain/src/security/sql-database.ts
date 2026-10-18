/**
 * The subset of the Cloudflare D1 API the security repositories and SQL statement builders use.
 * A Worker's `env.DB`, `db.$client` of a Drizzle D1 database, and the node:sqlite test adapter
 * (`@gamo/db/testing`) all satisfy it.
 */

export type SqlParam = string | number | null;

export interface SqlStatement {
  bind(...values: SqlParam[]): SqlStatement;
  first(): Promise<unknown>;
  all(): Promise<{ results?: unknown[] }>;
  run(): Promise<{ meta?: { changes?: number | bigint } }>;
}

export interface SqlDatabase {
  prepare(query: string): SqlStatement;
  /** One transaction: every statement or none (D1 `batch`). */
  batch(statements: SqlStatement[]): Promise<unknown[]>;
}

/** A SQL text plus its positional parameters; build with the `packages/domain/src/ticketing/sql.ts` builders. */
export interface SqlStatementSpec {
  sql: string;
  params: SqlParam[];
}

export function isSqlDatabase(binding: unknown): binding is SqlDatabase {
  const b = binding as { prepare?: unknown; batch?: unknown } | null;
  return typeof b?.prepare === 'function' && typeof b?.batch === 'function';
}

/** Validates an untyped binding (e.g. `env.DB`). Throws when it is not a D1 database. */
export function asSqlDatabase(binding: unknown): SqlDatabase {
  if (!isSqlDatabase(binding)) throw new Error('Database binding unavailable.');
  return binding;
}

export function prepareSpec(db: SqlDatabase, spec: SqlStatementSpec): SqlStatement {
  return db.prepare(spec.sql).bind(...spec.params);
}

/** Runs specs as one D1 batch (one transaction) and returns each statement's result rows. */
export async function runBatch(db: SqlDatabase, specs: SqlStatementSpec[]): Promise<unknown[][]> {
  const results = await db.batch(specs.map((s) => prepareSpec(db, s)));
  return results.map((r) => ((r as { results?: unknown[] } | null)?.results ?? []) as unknown[]);
}

/** Runs one spec and returns its rows (use with `RETURNING`). */
export async function allRows<T = Record<string, unknown>>(
  db: SqlDatabase,
  spec: SqlStatementSpec,
): Promise<T[]> {
  const r = await prepareSpec(db, spec).all();
  return (r.results ?? []) as T[];
}

export function changesOf(result: { meta?: { changes?: number | bigint } }): number {
  return Number(result.meta?.changes ?? 0);
}

import { drizzle, type AnyD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.ts';
export type GamoDatabase = ReturnType<typeof drizzle<typeof schema>>;
/** Validates an untyped Worker binding (e.g. `env.DB`) and wraps it in Drizzle. */
export function getDb(binding?: unknown): GamoDatabase {
  if (!isD1Binding(binding)) throw new Error('Database binding unavailable.');
  return drizzle(binding, { schema });
}

export function isD1Binding(binding: unknown): binding is AnyD1Database {
  return typeof (binding as { prepare?: unknown } | null)?.prepare === 'function';
}

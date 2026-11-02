import { drizzle, type AnyD1Database } from 'drizzle-orm/d1';
import * as legacy from '@gamo/db/legacy-schema';
import * as platform from './schema.ts';

/** The whole D1 schema: the platform tables and, until phase 8, the old shared tables. */
const schema = { ...legacy, ...platform };
export type GamoDatabase = ReturnType<typeof drizzle<typeof schema>>;
/** Validates an untyped Worker binding (e.g. `env.DB`) and wraps it in Drizzle. */
export function getDb(binding?: unknown): GamoDatabase {
  if (!isD1Binding(binding)) throw new Error('Database binding unavailable.');
  return drizzle(binding, { schema });
}

export function isD1Binding(binding: unknown): binding is AnyD1Database {
  return typeof (binding as { prepare?: unknown } | null)?.prepare === 'function';
}

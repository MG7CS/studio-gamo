import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.ts';
export type GamoDatabase = ReturnType<typeof drizzle<typeof schema>>;
export function getDb(binding?: any): GamoDatabase {
  if (!binding || typeof binding.prepare !== 'function') throw new Error('Database binding unavailable.');
  return drizzle(binding, { schema });
}

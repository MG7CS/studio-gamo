import { allRows, type SqlDatabase } from '@gamo/domain/security';

/** Display names (or emails) of staff users by id, for "published by" columns. Unknown ids are omitted. */
export async function staffNames(db: SqlDatabase, ids: (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {};
  const rows = await allRows<{ id: string; display_name: string | null; email: string }>(db, {
    sql: `SELECT id, display_name, email FROM users WHERE id IN (${unique.map(() => '?').join(', ')})`,
    params: unique,
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.display_name?.trim() || r.email]));
}

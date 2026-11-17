/**
 * Sequential submission references such as `GW-2026-0001` (design 2026-11-16, Task 2.2).
 *
 * The prefix comes from the form's program (worship GW, production GP, web GS, academy GA) and the year is the
 * UTC year of the submission, so the numbering restarts every 1 January (UTC). `form_reference_counters`
 * holds one row per `prefix_year` (`GW-2026`); `next_value` is the next number to hand out.
 *
 * Atomicity: the number is taken by an upsert that is part of the same D1 batch as the insert of the
 * submission (`counterUpsertSpec` + `referenceSql`). A batch is one transaction that never interleaves with
 * another, so two submissions can never receive the same number, and a failed insert rolls the counter back
 * (no gaps). `allocateReference` takes a number on its own for callers that insert elsewhere.
 */
import { allRows, type SqlDatabase, type SqlParam, type SqlStatementSpec } from '../security/sql-database.ts';

export type FormProgram = 'web' | 'worship' | 'academy' | 'production';

export const REFERENCE_PREFIXES: Record<FormProgram, string> = {
  worship: 'GW',
  production: 'GP',
  web: 'GS',
  academy: 'GA',
};

export function referencePrefixFor(program: FormProgram): string {
  return REFERENCE_PREFIXES[program];
}

/** UTC calendar year of an epoch-seconds instant. */
export function referenceYear(now: number): number {
  return new Date(now * 1000).getUTCFullYear();
}

/** The counter row key, e.g. `GW-2026`. */
export function referenceCounterKey(program: FormProgram, now: number): string {
  return `${referencePrefixFor(program)}-${referenceYear(now)}`;
}

/** `GW-2026-0001`; numbers past 9999 simply grow a digit. */
export function formatReference(counterKey: string, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('formatReference: n must be a positive integer');
  return `${counterKey}-${String(n).padStart(4, '0')}`;
}

/**
 * Upsert that claims the next number of `counterKey`. The first claim stores 2 (the next to hand out), later
 * ones add 1. With a `guard` (a `WHERE`-condition SQL fragment plus its parameters) nothing is claimed when the
 * condition is false, so a refused insert does not burn a number.
 */
export function counterUpsertSpec(
  counterKey: string,
  guard?: { sql: string; params: SqlParam[] },
): SqlStatementSpec {
  return {
    sql: `INSERT INTO form_reference_counters (prefix_year, next_value)
          SELECT ?, 2 WHERE ${guard ? guard.sql : '1 = 1'}
          ON CONFLICT(prefix_year) DO UPDATE SET next_value = next_value + 1`,
    params: [counterKey, ...(guard?.params ?? [])],
  };
}

/**
 * SQL expression (one `?` parameter: the counter key) that yields the reference claimed by the preceding
 * `counterUpsertSpec` statement of the same batch. Use it inside the `INSERT … SELECT` of the submission.
 */
export const REFERENCE_SQL = `(? || '-' || printf('%04d', (SELECT next_value - 1 FROM form_reference_counters WHERE prefix_year = ?)))`;
/** Parameters of `REFERENCE_SQL`, in order. */
export const referenceParams = (counterKey: string): SqlParam[] => [counterKey, counterKey];

/** Claims and returns the next reference on its own (not tied to another insert). */
export async function allocateReference(db: SqlDatabase, program: FormProgram, now: number): Promise<string> {
  const key = referenceCounterKey(program, now);
  const rows = await allRows<{ n: number }>(db, {
    sql: `INSERT INTO form_reference_counters (prefix_year, next_value) VALUES (?, 2)
          ON CONFLICT(prefix_year) DO UPDATE SET next_value = next_value + 1
          RETURNING next_value - 1 AS n`,
    params: [key],
  });
  const n = Number(rows[0]?.n);
  return formatReference(key, n);
}

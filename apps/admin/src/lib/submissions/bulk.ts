/**
 * Bulk status changes on the rows a staff member ticked on one inbox page.
 *
 * Scope is the posted ids and nothing else: a filter, a page or "select all matching" never widens it.
 * Decided applications (approved, declined) are skipped: their decision created a roster row or sent an
 * email and is changed only through the application itself. Unknown ids are ignored.
 */
import { allRows, type SqlDatabase } from '@gamo/domain/security';
import type { FormsService, SubmissionStatus } from '@gamo/domain/forms';
import { BULK_PROTECTED_STATUSES, type BulkAction } from './statuses.ts';

export interface BulkTargets {
  /** Ids that exist and may change. */
  eligible: string[];
  /** Existing ids left alone because they are decided applications. */
  skipped: number;
}

export async function bulkTargets(db: SqlDatabase, ids: string[]): Promise<BulkTargets> {
  const eligible: string[] = [];
  let skipped = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = await allRows<{ id: string; status: SubmissionStatus }>(db, {
      sql: `SELECT id, status FROM form_submissions WHERE id IN (${chunk.map(() => '?').join(', ')})`,
      params: chunk,
    });
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    for (const id of chunk) {
      const status = byId.get(id);
      if (status === undefined) continue;
      if ((BULK_PROTECTED_STATUSES as readonly string[]).includes(status)) skipped += 1;
      else eligible.push(id);
    }
  }
  return { eligible, skipped };
}

export async function applyBulk(
  forms: FormsService,
  targets: BulkTargets,
  action: BulkAction,
  staffId: string,
): Promise<{ changed: number; unchanged: number; skipped: number }> {
  let changed = 0;
  let unchanged = 0;
  for (const id of targets.eligible) {
    const result = await forms.setStatus({ submissionId: id, status: action.status, staffId });
    if (result.changed) changed += 1;
    else unchanged += 1;
  }
  return { changed, unchanged, skipped: targets.skipped };
}

/** The current status of one submission, or null (used to report `changed` on approve and decline). */
export async function statusOf(db: SqlDatabase, id: string): Promise<SubmissionStatus | null> {
  const rows = await allRows<{ status: SubmissionStatus }>(db, {
    sql: 'SELECT status FROM form_submissions WHERE id = ?',
    params: [id],
  });
  return rows[0]?.status ?? null;
}

/** Display names of staff by user id, for "who did it" lines (staff-only screens). */
export async function actorNames(db: SqlDatabase, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))].slice(0, 50);
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const rows = await allRows<{ id: string; display_name: string | null; email: string }>(db, {
    sql: `SELECT id, display_name, email FROM users WHERE id IN (${unique.map(() => '?').join(', ')})`,
    params: unique,
  });
  for (const r of rows) names.set(r.id, r.display_name?.trim() || r.email);
  return names;
}

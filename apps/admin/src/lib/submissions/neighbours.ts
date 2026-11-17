/**
 * Previous and next submission inside the current inbox filter, for the detail page. The inbox order is
 * `submitted_at DESC, id DESC` (newest first). "Newer" is the nearest row before the current one in that
 * order, "Older" the nearest after it. `FormsService` only pages forward, so the nearest-newer lookup needs
 * its own query; `neighbours.test` (scripts/audit/admin-submissions.test.ts) checks it against
 * `listSubmissions` so the two cannot drift apart.
 */
import { allRows, type SqlDatabase, type SqlParam } from '@gamo/domain/security';
import type { SubmissionFilter } from '@gamo/domain/forms';

export interface Neighbour {
  id: string;
  reference: string;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function filterSql(filter: SubmissionFilter): { where: string[]; params: SqlParam[] } {
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (filter.formId) {
    where.push('s.form_id = ?');
    params.push(filter.formId);
  }
  if (filter.version !== undefined) {
    where.push('v.version = ?');
    params.push(filter.version);
  }
  const statuses =
    filter.status === undefined ? [] : Array.isArray(filter.status) ? filter.status : [filter.status];
  if (statuses.length > 0) {
    where.push(`s.status IN (${statuses.map(() => '?').join(', ')})`);
    params.push(...statuses);
  }
  if (filter.from !== undefined) {
    where.push('s.submitted_at >= ?');
    params.push(filter.from);
  }
  if (filter.to !== undefined) {
    where.push('s.submitted_at < ?');
    params.push(filter.to);
  }
  if (filter.hasAttachments !== undefined) {
    where.push(
      `${filter.hasAttachments ? '' : 'NOT '}EXISTS (SELECT 1 FROM form_uploads u WHERE u.submission_id = s.id AND u.status NOT IN ('rejected', 'deleted'))`,
    );
  }
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where.push(
      `(lower(coalesce(s.submitter_name, '')) LIKE ? ESCAPE '\\' OR coalesce(s.submitter_email_normalized, '') LIKE ? ESCAPE '\\' OR lower(s.reference) LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like);
  }
  return { where, params };
}

async function pick(
  db: SqlDatabase,
  filter: SubmissionFilter,
  at: { submittedAt: number; id: string },
  direction: 'newer' | 'older',
): Promise<Neighbour | null> {
  const { where, params } = filterSql(filter);
  const older = direction === 'older';
  where.push(
    older
      ? '(s.submitted_at < ? OR (s.submitted_at = ? AND s.id < ?))'
      : '(s.submitted_at > ? OR (s.submitted_at = ? AND s.id > ?))',
  );
  params.push(at.submittedAt, at.submittedAt, at.id);
  const rows = await allRows<{ id: string; reference: string }>(db, {
    sql: `SELECT s.id, s.reference FROM form_submissions s
          JOIN form_versions v ON v.id = s.form_version_id
          WHERE ${where.join(' AND ')}
          ORDER BY s.submitted_at ${older ? 'DESC' : 'ASC'}, s.id ${older ? 'DESC' : 'ASC'}
          LIMIT 1`,
    params,
  });
  const row = rows[0];
  return row ? { id: row.id, reference: row.reference } : null;
}

export async function findNeighbours(
  db: SqlDatabase,
  filter: SubmissionFilter,
  at: { submittedAt: number; id: string },
): Promise<{ newer: Neighbour | null; older: Neighbour | null }> {
  const [newer, older] = await Promise.all([pick(db, filter, at, 'newer'), pick(db, filter, at, 'older')]);
  return { newer, older };
}

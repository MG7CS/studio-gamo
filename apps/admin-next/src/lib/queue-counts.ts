/**
 * Sidebar counts. Every number comes from one read-only D1 query run for the signed-in staff user; there is no
 * fallback value. When the query fails the counts are `null` and the sidebar shows no badges at all.
 */
import { allRows, asSqlDatabase } from '@gamo/domain/security';
import { CHURCH_ROLES, OPEN_PROFILE_STATUSES, PROVIDER_REVIEW_ROLES } from './review-scope';

export interface QueueCounts {
  /** Inquiries still `pending`, not counting the staff user's own (self-review is refused). */
  participation: number;
  /** Church profiles waiting for staff. */
  churches: number;
  /** Musician, technician, teacher, artist and agent profiles waiting for staff. */
  providers: number;
  /** Events in `pending_review`. */
  events: number;
}

const statusList = OPEN_PROFILE_STATUSES.map((s) => `'${s}'`).join(', ');

/** One round trip. Row key: 'participation' | 'events' | a provider role. */
export const QUEUE_COUNTS_SQL = `
SELECT 'participation' AS k, COUNT(*) AS n FROM participation_inquiries WHERE status = 'pending' AND user_id <> ?1
UNION ALL
SELECT role AS k, COUNT(*) AS n FROM provider_profiles WHERE status IN (${statusList}) GROUP BY role
UNION ALL
SELECT 'events' AS k, COUNT(*) AS n FROM events e
  JOIN organizer_profiles o ON o.id = e.organizer_id
  JOIN organizations g ON g.id = o.organization_id
 WHERE e.status = 'pending_review'`;

export function tallyQueueCounts(rows: readonly { k: string; n: number | string }[]): QueueCounts {
  const counts: QueueCounts = { participation: 0, churches: 0, providers: 0, events: 0 };
  for (const { k, n } of rows) {
    const value = Number(n);
    if (!Number.isFinite(value)) continue;
    if (k === 'participation') counts.participation += value;
    else if (k === 'events') counts.events += value;
    else if ((CHURCH_ROLES as readonly string[]).includes(k)) counts.churches += value;
    else if ((PROVIDER_REVIEW_ROLES as readonly string[]).includes(k)) counts.providers += value;
  }
  return counts;
}

export async function loadQueueCounts(binding: unknown, staffUserId: string): Promise<QueueCounts | null> {
  try {
    const rows = await allRows<{ k: string; n: number }>(asSqlDatabase(binding), {
      sql: QUEUE_COUNTS_SQL,
      params: [staffUserId],
    });
    return tallyQueueCounts(rows);
  } catch (error) {
    console.error(`[admin] queue counts unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

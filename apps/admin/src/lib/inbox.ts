/**
 * Inbox data. Every number and row is a read-only D1 query; there is no fallback value. When a query fails the
 * result is `null` and the page says the data is unavailable instead of showing zeros.
 */
import { allRows, asSqlDatabase } from '@gamo/domain/security';
import { CHURCH_ROLES, OPEN_PROFILE_STATUSES, PROVIDER_REVIEW_ROLES } from './review-scope';

export interface QueueCounts {
  /** Participation inquiries still `pending`. */
  participation: number;
  /** Church profiles waiting for the admin. */
  churches: number;
  /** Musician, technician, teacher, artist and agent profiles waiting for the admin. */
  providers: number;
  /** Events in `pending_review`. */
  events: number;
}

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');
const OPEN = list(OPEN_PROFILE_STATUSES);
const REVIEWED_ROLES = list([...CHURCH_ROLES, ...PROVIDER_REVIEW_ROLES]);

/** One round trip. Row key: 'participation' | 'events' | a provider role. */
export const COUNTS_SQL = `
SELECT 'participation' AS k, COUNT(*) AS n FROM participation_inquiries WHERE status = 'pending'
UNION ALL
SELECT role AS k, COUNT(*) AS n FROM provider_profiles WHERE status IN (${OPEN}) GROUP BY role
UNION ALL
SELECT 'events' AS k, COUNT(*) AS n FROM events e
  JOIN organizer_profiles o ON o.id = e.organizer_id
  JOIN organizations g ON g.id = o.organization_id
 WHERE e.status = 'pending_review'`;

export function tallyCounts(rows: readonly { k: string; n: number | string }[]): QueueCounts {
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

export type WaitingKind =
  'Participation request' | 'Church verification' | 'Provider review' | 'Event review';

export interface WaitingItem {
  kind: WaitingKind;
  /** The queue page for this item, once it has one. */
  href: string | null;
  title: string;
  /** Epoch seconds the item started waiting. */
  since: number;
}

/** The items that have waited longest, across the four queues. */
export const OLDEST_SQL = `
SELECT 'participation' AS k, id, interest || ' · ' || name AS title, created_at AS since
  FROM participation_inquiries WHERE status = 'pending'
UNION ALL
SELECT role AS k, id, display_name AS title, updated_at AS since
  FROM provider_profiles WHERE status IN (${OPEN}) AND role IN (${REVIEWED_ROLES})
UNION ALL
SELECT 'events' AS k, e.id AS id, e.title AS title, e.created_at AS since FROM events e
  JOIN organizer_profiles o ON o.id = e.organizer_id
  JOIN organizations g ON g.id = o.organization_id
 WHERE e.status = 'pending_review'
 ORDER BY since ASC, title ASC LIMIT ?1`;

function kindOf(key: string): WaitingKind {
  if (key === 'participation') return 'Participation request';
  if (key === 'events') return 'Event review';
  return (CHURCH_ROLES as readonly string[]).includes(key) ? 'Church verification' : 'Provider review';
}

/** Every queue has a page. */
function hrefOf(key: string, id: string): string | null {
  if (key === 'participation') return `/participation#inquiry-${encodeURIComponent(id)}`;
  if (key === 'events') return `/events#event-${encodeURIComponent(id)}`;
  if ((CHURCH_ROLES as readonly string[]).includes(key)) return `/churches/${encodeURIComponent(id)}`;
  if ((PROVIDER_REVIEW_ROLES as readonly string[]).includes(key))
    return `/providers/${encodeURIComponent(id)}`;
  return null;
}

export async function loadCounts(binding: unknown): Promise<QueueCounts | null> {
  try {
    return tallyCounts(
      await allRows<{ k: string; n: number }>(asSqlDatabase(binding), { sql: COUNTS_SQL, params: [] }),
    );
  } catch (error) {
    console.error(`[admin] counts unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

export interface Inbox {
  counts: QueueCounts;
  oldest: WaitingItem[];
}

export async function loadInbox(binding: unknown, limit = 5): Promise<Inbox | null> {
  try {
    const db = asSqlDatabase(binding);
    const [countRows, oldestRows] = await Promise.all([
      allRows<{ k: string; n: number }>(db, { sql: COUNTS_SQL, params: [] }),
      allRows<{ k: string; id: string; title: string; since: number }>(db, {
        sql: OLDEST_SQL,
        params: [limit],
      }),
    ]);
    return {
      counts: tallyCounts(countRows),
      oldest: oldestRows.map((r) => ({
        kind: kindOf(r.k),
        href: hrefOf(r.k, r.id),
        title: r.title,
        since: Number(r.since),
      })),
    };
  } catch (error) {
    console.error(`[admin] inbox unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

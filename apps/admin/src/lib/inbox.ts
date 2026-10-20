/**
 * Inbox data. Every number and row is a read-only D1 query; there is no fallback value. The worship, academy and
 * production queues come from the shared database, the Gamo Live queues from Live's own database. When a query
 * fails its result is not shown (the page says so) instead of showing zeros.
 */
import { liveOldestWaiting, liveQueueCounts, type LiveQueueCounts } from '@gamo/domain';
import { allRows, asSqlDatabase } from '@gamo/domain/security';
import { CHURCH_ROLES, OPEN_PROFILE_STATUSES, PROVIDER_REVIEW_ROLES } from './review-scope';

export interface QueueCounts {
  /** Participation inquiries still `pending`. */
  participation: number;
  /** Church profiles waiting for the admin. */
  churches: number;
  /** Musician, technician, teacher, artist and agent profiles waiting for the admin. */
  providers: number;
  /** Gamo Live events in `pending_review`. */
  events: number;
  /** Gamo Live organizations whose verification needs the admin: `verifications + meetingsToDecide`. */
  organizations: number;
  /** Gamo Live catalog listings waiting for approval. */
  catalog: number;
  /** Verification requested, meeting to schedule (`/organizations?filter=to_schedule`). */
  verifications: number;
  /** Meeting held, verify or decline (`/organizations?filter=to_decide`). */
  meetingsToDecide: number;
  /** Open disputes (`/payments?tab=disputes`). */
  disputes: number;
  /** Refunds requested on orders Gamo sold (`/payments?tab=refunds`). */
  refundRequests: number;
  /** The Payments tab's queues together: `refundRequests + disputes`. */
  payments: number;
}

/**
 * How many items are waiting, each counted once: `organizations` already holds the verifications and meetings to
 * decide, and `payments` the refund requests and disputes, so those parts are not added again.
 */
export function waitingTotal(counts: QueueCounts): number {
  return (
    counts.participation +
    counts.churches +
    counts.providers +
    counts.events +
    counts.organizations +
    counts.catalog +
    counts.payments
  );
}

/** The bindings the admin reads (the Worker environment satisfies this). */
export interface AdminBindings {
  DB?: unknown;
  LIVE_DB?: unknown;
}

const NO_LIVE: LiveQueueCounts = {
  events: 0,
  organizations: 0,
  catalog: 0,
  verifications: 0,
  meetingsToDecide: 0,
  disputes: 0,
  refundRequests: 0,
};

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');
const OPEN = list(OPEN_PROFILE_STATUSES);
const REVIEWED_ROLES = list([...CHURCH_ROLES, ...PROVIDER_REVIEW_ROLES]);

/** One round trip on the shared database. Row key: 'participation' | a provider role. */
export const COUNTS_SQL = `
SELECT 'participation' AS k, COUNT(*) AS n FROM participation_inquiries WHERE status = 'pending'
UNION ALL
SELECT role AS k, COUNT(*) AS n FROM provider_profiles WHERE status IN (${OPEN}) GROUP BY role`;

export function tallyCounts(
  rows: readonly { k: string; n: number | string }[],
  live: LiveQueueCounts = NO_LIVE,
): QueueCounts {
  const counts: QueueCounts = {
    participation: 0,
    churches: 0,
    providers: 0,
    events: live.events,
    organizations: live.organizations,
    catalog: live.catalog,
    verifications: live.verifications,
    meetingsToDecide: live.meetingsToDecide,
    disputes: live.disputes,
    refundRequests: live.refundRequests,
    payments: live.disputes + live.refundRequests,
  };
  for (const { k, n } of rows) {
    const value = Number(n);
    if (!Number.isFinite(value)) continue;
    if (k === 'participation') counts.participation += value;
    else if ((CHURCH_ROLES as readonly string[]).includes(k)) counts.churches += value;
    else if ((PROVIDER_REVIEW_ROLES as readonly string[]).includes(k)) counts.providers += value;
  }
  return counts;
}

export type WaitingKind =
  | 'Participation request'
  | 'Church verification'
  | 'Provider review'
  | 'Event review'
  | 'Organization verification'
  | 'Catalog listing';

export interface WaitingItem {
  kind: WaitingKind;
  /** The queue page for this item. */
  href: string | null;
  title: string;
  /** Epoch seconds the item started waiting. */
  since: number;
}

/** The items on the shared database that have waited longest. */
export const OLDEST_SQL = `
SELECT 'participation' AS k, id, interest || ' · ' || name AS title, created_at AS since
  FROM participation_inquiries WHERE status = 'pending'
UNION ALL
SELECT role AS k, id, display_name AS title, updated_at AS since
  FROM provider_profiles WHERE status IN (${OPEN}) AND role IN (${REVIEWED_ROLES})
 ORDER BY since ASC, title ASC LIMIT ?1`;

function kindOf(key: string): WaitingKind {
  if (key === 'participation') return 'Participation request';
  return (CHURCH_ROLES as readonly string[]).includes(key) ? 'Church verification' : 'Provider review';
}

function hrefOf(key: string, id: string): string | null {
  if (key === 'participation') return `/participation#inquiry-${encodeURIComponent(id)}`;
  if ((CHURCH_ROLES as readonly string[]).includes(key)) return `/churches/${encodeURIComponent(id)}`;
  if ((PROVIDER_REVIEW_ROLES as readonly string[]).includes(key))
    return `/providers/${encodeURIComponent(id)}`;
  return null;
}

const LIVE_HREF: Record<string, (id: string) => string> = {
  'Event review': (id) => `/events#event-${encodeURIComponent(id)}`,
  'Organization verification': (id) => `/organizations/${encodeURIComponent(id)}`,
  'Catalog listing': (id) => `/catalog#listing-${encodeURIComponent(id)}`,
};

async function liveCounts(bindings: AdminBindings): Promise<{ ok: boolean; counts: LiveQueueCounts }> {
  try {
    return { ok: true, counts: await liveQueueCounts(asSqlDatabase(bindings.LIVE_DB)) };
  } catch (error) {
    console.error(`[admin] live counts unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return { ok: false, counts: NO_LIVE };
  }
}

export async function loadCounts(bindings: AdminBindings): Promise<QueueCounts | null> {
  try {
    const rows = await allRows<{ k: string; n: number }>(asSqlDatabase(bindings.DB), {
      sql: COUNTS_SQL,
      params: [],
    });
    return tallyCounts(rows, (await liveCounts(bindings)).counts);
  } catch (error) {
    console.error(`[admin] counts unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

export interface Inbox {
  counts: QueueCounts;
  oldest: WaitingItem[];
  /** False when Gamo Live's database could not be read; its cards and rows are left out. */
  liveAvailable: boolean;
}

export async function loadInbox(bindings: AdminBindings, limit = 5): Promise<Inbox | null> {
  try {
    const db = asSqlDatabase(bindings.DB);
    const [countRows, oldestRows, live] = await Promise.all([
      allRows<{ k: string; n: number }>(db, { sql: COUNTS_SQL, params: [] }),
      allRows<{ k: string; id: string; title: string; since: number }>(db, {
        sql: OLDEST_SQL,
        params: [limit],
      }),
      liveCounts(bindings),
    ]);
    const liveItems: WaitingItem[] = live.ok
      ? (await liveOldestWaiting(asSqlDatabase(bindings.LIVE_DB), limit).catch(() => [])).map((i) => ({
          kind: i.kind,
          href: LIVE_HREF[i.kind](i.id),
          title: i.title,
          since: i.since,
        }))
      : [];
    const oldest: WaitingItem[] = [
      ...oldestRows.map((r) => ({
        kind: kindOf(r.k),
        href: hrefOf(r.k, r.id),
        title: r.title,
        since: Number(r.since),
      })),
      ...liveItems,
    ]
      .sort((a, b) => a.since - b.since || a.title.localeCompare(b.title))
      .slice(0, limit);
    return { counts: tallyCounts(countRows, live.counts), oldest, liveAvailable: live.ok };
  } catch (error) {
    console.error(`[admin] inbox unavailable: ${error instanceof Error ? error.name : 'unknown'}`);
    return null;
  }
}

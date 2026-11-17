/**
 * The numbers on the admin home page: how much waits for staff. Counts only, no personal data. Each
 * count is read on its own, so one failing query shows "Unavailable" for that card (null) instead of
 * taking the page down.
 */
import { FormsService } from '@gamo/domain/forms';
import { allRows, type SqlDatabase } from '@gamo/domain/security';

export interface HomeCounts {
  /** Submissions nobody has opened yet. */
  newSubmissions: number | null;
  /** Service requests that are new, being matched or have offers out. */
  openRequests: number | null;
  /** Offers sent and not yet answered or expired. */
  pendingOffers: number | null;
  /** Invoices sent and not yet paid. */
  unpaidInvoices: number | null;
  /** Forms (not closed) whose draft differs from the published version, or was never published. */
  draftsWithChanges: number | null;
}

async function countOf(db: SqlDatabase, sql: string, params: (string | number)[] = []): Promise<number> {
  const rows = await allRows<{ total: number }>(db, { sql, params });
  return Number(rows[0]?.total ?? 0);
}

async function safely(name: string, read: () => Promise<number>): Promise<number | null> {
  try {
    return await read();
  } catch (error) {
    // Name only: never SQL text or row data.
    console.warn(`[admin-home] ${name} unavailable: ${error instanceof Error ? error.name : 'Error'}`);
    return null;
  }
}

/** `now` is epoch seconds (an offer past its expiry is no longer pending). */
export async function getHomeCounts(
  db: SqlDatabase,
  now = Math.floor(Date.now() / 1000),
): Promise<HomeCounts> {
  const [newSubmissions, openRequests, pendingOffers, unpaidInvoices, draftsWithChanges] = await Promise.all([
    safely('new submissions', () =>
      countOf(db, "SELECT count(*) AS total FROM form_submissions WHERE status = 'new'"),
    ),
    safely('open requests', () =>
      countOf(
        db,
        "SELECT count(*) AS total FROM service_requests WHERE status IN ('new', 'matching', 'offered')",
      ),
    ),
    safely('pending offers', () =>
      countOf(db, "SELECT count(*) AS total FROM offers WHERE status = 'pending' AND expires_at > ?", [now]),
    ),
    safely('unpaid invoices', () =>
      countOf(db, "SELECT count(*) AS total FROM invoices WHERE status = 'open'"),
    ),
    safely('drafts with changes', async () => {
      const forms = await new FormsService(db).listForms();
      return forms.filter((f) => f.status !== 'closed' && f.hasUnpublishedChanges).length;
    }),
  ]);
  return { newSubmissions, openRequests, pendingOffers, unpaidInvoices, draftsWithChanges };
}

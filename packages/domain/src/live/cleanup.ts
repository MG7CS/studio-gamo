/**
 * The admin-run cleanup (docs/LIVE_DATA_MODEL.md, retention): removes what Gamo Live no longer needs and reports how
 * many rows went. There is no silent background job; the admin presses "Run cleanup".
 */
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';
import { purgeRateLimitCounters } from '../security/rate-limit.ts';
import { releaseExpiredHolds } from './registration.ts';

/** Registrant personal data is deleted this long after an event's last date has ended. */
export const REGISTRANT_RETENTION_SECONDS = 90 * 86400;
/** Used and expired invitations and sessions are kept this long for support questions, then deleted. */
const SHORT_RETENTION_SECONDS = 30 * 86400;

export interface CleanupReport {
  registrationsRemoved: number;
  occurrencesSummarized: number;
  emailCodesRemoved: number;
  sessionsRemoved: number;
  invitationsRemoved: number;
  rateLimitCountersRemoved: number;
}

const count = async (db: SqlDatabase, sql: string, params: (string | number)[]) =>
  Number((await allRows<{ n: number }>(db, { sql, params }))[0]?.n ?? 0);

/** Occurrences whose whole event is old enough that its registrants' data is due for deletion. */
const DUE_OCCURRENCES = `
  SELECT o.id FROM event_occurrences o
   WHERE o.event_id IN (
           SELECT event_id FROM event_occurrences
            GROUP BY event_id HAVING MAX(COALESCE(ends_at, starts_at)) < ?1)
     AND EXISTS (SELECT 1 FROM registrations r WHERE r.occurrence_id = o.id)`;

export async function runLiveCleanup(db: SqlDatabase, now: number): Promise<CleanupReport> {
  await releaseExpiredHolds(db, now);
  const cutoff = now - REGISTRANT_RETENTION_SECONDS;
  const short = now - SHORT_RETENTION_SECONDS;

  const registrations = await count(
    db,
    `SELECT COUNT(*) AS n FROM registrations WHERE occurrence_id IN (${DUE_OCCURRENCES})`,
    [cutoff],
  );
  const occurrences = await count(db, `SELECT COUNT(*) AS n FROM (${DUE_OCCURRENCES})`, [cutoff]);
  const codes = await count(db, 'SELECT COUNT(*) AS n FROM email_codes WHERE expires_at < ?1', [now]);
  const sessions = await count(db, 'SELECT COUNT(*) AS n FROM organizer_sessions WHERE expires_at < ?1', [
    short,
  ]);
  const invitations = await count(
    db,
    'SELECT COUNT(*) AS n FROM invitations WHERE expires_at < ?1 OR (accepted_at IS NOT NULL AND accepted_at < ?1)',
    [short],
  );

  // Totals are written onto each date before its registrations go, so the aggregate numbers outlive the people.
  // The deletes are in the same batch, after the summary, so a failure keeps both or neither.
  await runBatch(db, [
    {
      sql: `UPDATE event_occurrences
               SET registered_total = COALESCE((SELECT SUM(party_size) FROM registrations
                     WHERE occurrence_id = event_occurrences.id AND status = 'confirmed'), 0),
                   checked_in_total = COALESCE((SELECT SUM(party_size) FROM registrations
                     WHERE occurrence_id = event_occurrences.id AND status = 'confirmed' AND checked_in_at IS NOT NULL), 0)
             WHERE id IN (${DUE_OCCURRENCES})`,
      params: [cutoff],
    },
    {
      sql: `DELETE FROM registrations WHERE occurrence_id IN (${DUE_OCCURRENCES})`,
      params: [cutoff],
    },
    { sql: 'DELETE FROM email_codes WHERE expires_at < ?1', params: [now] },
    { sql: 'DELETE FROM organizer_sessions WHERE expires_at < ?1', params: [short] },
    {
      sql: 'DELETE FROM invitations WHERE expires_at < ?1 OR (accepted_at IS NOT NULL AND accepted_at < ?1)',
      params: [short],
    },
  ]);
  const rateLimitCountersRemoved = await purgeRateLimitCounters(db, now);
  return {
    registrationsRemoved: registrations,
    occurrencesSummarized: occurrences,
    emailCodesRemoved: codes,
    sessionsRemoved: sessions,
    invitationsRemoved: invitations,
    rateLimitCountersRemoved,
  };
}

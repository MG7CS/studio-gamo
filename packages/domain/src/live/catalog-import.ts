/**
 * Imports the verified external catalog (data/gamo_live_verified_events_2026-10-15.json) into the Live
 * database. Imported events are catalog listings: `external_tickets` admission, a source link, no organization.
 * Gamo never sells these tickets; the event page sends people to the official destination.
 *
 * Status on import: complete, verified records are `pending_review` for the admin to approve (or `published`
 * with `publishApproved`, used for local seeding); records held for link revalidation are `pending_review`;
 * records failing the editorial rules are `rejected`. Re-importing an `import_key` never changes it.
 */
import {
  buildFactualEditorialSummary,
  evaluateCandidateForEditorialImport,
  inferExternalProviderName,
  type SeedCatalogDocument,
} from '../services/live-external-discovery.ts';
import { newPrefixedId } from '../security/ids.ts';
import { allRows, runBatch, type SqlDatabase } from '../security/sql-database.ts';

export interface CatalogImportOptions {
  /** Epoch seconds used for timestamps. */
  now: number;
  /** Publish records that pass every editorial rule instead of queueing them for review (local seeding). */
  publishApproved?: boolean;
  /** Treat "link could not be fetched" notes as revalidated. */
  revalidateUnfetched?: boolean;
  /** Reference time for "is in the future" (defaults to `now`). */
  referenceNow?: Date;
}

export interface CatalogImportEntry {
  importKey: string;
  result: 'imported' | 'unchanged';
  status: 'published' | 'pending_review' | 'rejected';
  reason: string;
}

export async function importCatalog(
  db: SqlDatabase,
  doc: SeedCatalogDocument,
  options: CatalogImportOptions,
): Promise<CatalogImportEntry[]> {
  const report: CatalogImportEntry[] = [];
  for (const candidate of doc.events) {
    const evaluation = evaluateCandidateForEditorialImport(candidate, {
      referenceNow: options.referenceNow ?? new Date(options.now * 1000),
      revalidateUnfetched: options.revalidateUnfetched,
    });
    const status: CatalogImportEntry['status'] =
      evaluation.editorialDecision === 'rejected'
        ? 'rejected'
        : evaluation.editorialDecision === 'approved' && options.publishApproved
          ? 'published'
          : 'pending_review';

    const existing = await allRows(db, {
      sql: 'SELECT 1 AS ok FROM catalog_sources WHERE import_key = ?1',
      params: [candidate.import_key],
    });
    if (existing.length > 0) {
      report.push({
        importKey: candidate.import_key,
        result: 'unchanged',
        status,
        reason: 'Already imported.',
      });
      continue;
    }

    const venue = candidate.venue;
    const venueName = (venue.name ?? '').trim() || `${venue.city}, ${venue.state}`;
    const address = venue.street_address ?? venue.address ?? null;
    const url = candidate.external_destination.url ?? '';
    const eventId = newPrefixedId('evt');
    const startsAt = Math.floor(evaluation.startsAt.getTime() / 1000);
    const sources = candidate.source_urls ?? candidate.verification?.source_urls ?? [];
    const checkedAt = candidate.external_destination.last_checked_at
      ? Math.floor(new Date(candidate.external_destination.last_checked_at).getTime() / 1000)
      : null;

    await runBatch(db, [
      {
        sql: `INSERT INTO venues (id, name, address, city, state, metro_slug, timezone)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT (name, city, state) DO NOTHING`,
        params: [
          newPrefixedId('ven'),
          venueName,
          address,
          venue.city,
          venue.state,
          candidate.metro_slug,
          candidate.timezone,
        ],
      },
      {
        sql: `INSERT INTO events (id, organization_id, origin, slug, title, category, description, venue_id, timezone,
                                  admission, external_url, status, published_at, created_at, updated_at)
              SELECT ?1, NULL, 'catalog', ?2, ?3, ?4, ?5, v.id, ?6, 'external_tickets', ?7, ?8, ?9, ?10, ?10
                FROM venues v WHERE v.name = ?11 AND v.city = ?12 AND v.state = ?13`,
        params: [
          eventId,
          evaluation.slug,
          candidate.title,
          evaluation.normalizedCategory,
          buildFactualEditorialSummary(candidate).description,
          candidate.timezone,
          url,
          status,
          status === 'published' ? options.now : null,
          options.now,
          venueName,
          venue.city,
          venue.state,
        ],
      },
      {
        sql: 'INSERT INTO event_occurrences (id, event_id, starts_at) VALUES (?1, ?2, ?3)',
        params: [newPrefixedId('occ'), eventId, startsAt],
      },
      ...candidate.performers.map((name, position) => ({
        sql: 'INSERT INTO event_performers (event_id, position, name, role) VALUES (?1, ?2, ?3, ?4)',
        params: [eventId, position, name, position === 0 ? 'Headliner' : 'Performer'] as (
          string | number | null
        )[],
      })),
      {
        sql: `INSERT INTO catalog_sources (event_id, import_key, source_urls, provider, destination_kind, last_verified_at, original_organizer_name)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
        params: [
          eventId,
          candidate.import_key,
          JSON.stringify(sources),
          inferExternalProviderName(url, candidate.external_destination.provider_name),
          candidate.external_destination.kind,
          checkedAt,
          candidate.original_organizer_name ?? candidate.organizer?.original_organizer_name ?? null,
        ],
      },
    ]);
    report.push({ importKey: candidate.import_key, result: 'imported', status, reason: evaluation.reason });
  }
  return report;
}

/** Admin decision on a catalog listing: publish it or hide it. Returns false when it is not a catalog event. */
export async function setCatalogStatus(
  db: SqlDatabase,
  eventId: string,
  status: 'published' | 'hidden',
  now: number,
): Promise<boolean> {
  const rows = await allRows(db, {
    sql: `UPDATE events SET status = ?2, published_at = CASE WHEN ?2 = 'published' THEN COALESCE(published_at, ?3) ELSE published_at END,
                 updated_at = ?3
           WHERE id = ?1 AND origin = 'catalog' RETURNING id`,
    params: [eventId, status, now],
  });
  return rows.length === 1;
}

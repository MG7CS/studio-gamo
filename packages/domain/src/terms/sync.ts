/**
 * Keeps `terms_documents` consistent with the registry (design §4.5): one row per (slug, current version),
 * inserted idempotently. `recordTermsAcceptance` also inserts a document row on first use; this lets staff
 * pages (admin /legal) show every current version before anyone has accepted it. Rows are never updated:
 * `content_hash` is immutable per version (trigger `terms_documents_content_immutable`).
 */
import { newPrefixedId } from '../security/ids.ts';
import { runBatch, type SqlDatabase, type SqlStatementSpec } from '../security/sql-database.ts';
import { TERMS_DOCUMENTS, termsContentHash, type TermsDocumentEntry } from './registry.ts';

/** `INSERT … ON CONFLICT(slug, version) DO NOTHING` for one registry entry (shared with acceptance.ts). */
export async function termsDocumentInsertStatement(
  doc: TermsDocumentEntry,
  now: number,
): Promise<SqlStatementSpec> {
  return {
    sql: "INSERT INTO terms_documents (id, slug, version, title, status, content_hash, legal_review_status, created_at) VALUES (?1, ?2, ?3, ?4, 'draft', ?5, 'draft_requires_review', ?6) ON CONFLICT(slug, version) DO NOTHING",
    params: [newPrefixedId('tdoc'), doc.slug, doc.version, doc.title, await termsContentHash(doc), now],
  };
}

/** Inserts every current registry version that is missing (one batch). `now` is epoch seconds. */
export async function syncTermsDocuments(db: SqlDatabase, now: number): Promise<void> {
  const specs: SqlStatementSpec[] = [];
  for (const doc of TERMS_DOCUMENTS) specs.push(await termsDocumentInsertStatement(doc, now));
  await runBatch(db, specs);
}

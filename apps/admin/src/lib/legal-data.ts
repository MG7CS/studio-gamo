/**
 * Legal document registry for the admin. Read-only: the registry (`TERMS_DOCUMENTS`) is code, the acceptance
 * counts are a `COUNT(*)` over `terms_acceptances`. When the count query fails every count is reported as
 * unavailable rather than zero.
 */
import { TERMS_DOCUMENTS, type TermsDocumentEntry } from '@gamo/domain/terms';
import { allRows, asSqlDatabase } from '@gamo/domain/security';

export type AcceptanceCounts = ReadonlyMap<string, number>;

const key = (slug: string, version: string) => `${slug}@${version}`;

/** Acceptances per `slug@version`, or null when D1 could not be read. */
export async function loadAcceptanceCounts(binding: unknown): Promise<AcceptanceCounts | null> {
  try {
    const rows = await allRows<{ slug: string; version: string; total: number }>(asSqlDatabase(binding), {
      sql: 'SELECT document_slug AS slug, document_version AS version, COUNT(*) AS total FROM terms_acceptances GROUP BY document_slug, document_version',
      params: [],
    });
    return new Map(rows.map((r) => [key(r.slug, r.version), Number(r.total)]));
  } catch (error) {
    console.error(
      `[admin] acceptance counts unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
    );
    return null;
  }
}

export interface LegalDocumentRow {
  doc: TermsDocumentEntry;
  /** Acceptances of this exact version; null when unavailable. */
  accepted: number | null;
}

export interface LegalSummary {
  documents: number;
  /** Documents whose legal review is complete. */
  reviewed: number;
  /** Acceptances across every version; null when unavailable. */
  totalAcceptances: number | null;
  rows: LegalDocumentRow[];
}

export function summarizeLegal(
  docs: readonly TermsDocumentEntry[],
  counts: AcceptanceCounts | null,
): LegalSummary {
  return {
    documents: docs.length,
    reviewed: docs.filter((d) => (d.legalReviewStatus as string) === 'reviewed').length,
    totalAcceptances: counts ? [...counts.values()].reduce((sum, n) => sum + n, 0) : null,
    rows: docs.map((doc) => ({
      doc,
      accepted: counts ? (counts.get(key(doc.slug, doc.version)) ?? 0) : null,
    })),
  };
}

export const registrySummary = (counts: AcceptanceCounts | null) => summarizeLegal(TERMS_DOCUMENTS, counts);

/**
 * Structured text of the draft legal documents (design §4.5). Plain data — no markup — so the exact text
 * people are asked to accept can be hashed: `terms_documents.content_hash` and the registry's `contentHash`
 * (`packages/domain/src/terms/registry.ts`) are the SHA-256 hex of `legalDocumentCanonicalText(doc)`.
 *
 * Changing any string here changes the hash: bump the document's version in the registry and update its
 * `contentHash` (`scripts/audit/legal-drafts.test.ts` fails until both are done).
 */

export interface LegalSectionContent {
  /** Stable anchor id (lower-case, hyphenated), unique within the document. */
  id: string;
  heading: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
}

export interface LegalDocumentContent {
  /** Matches a `TERMS_SLUGS` entry. */
  slug: string;
  title: string;
  /** One or two plain sentences shown under the title. */
  intro: string;
  sections: readonly LegalSectionContent[];
}

/** The canonical serialization that is hashed (key order fixed here, not by the source object). */
export function legalDocumentCanonicalText(doc: LegalDocumentContent): string {
  return JSON.stringify({
    slug: doc.slug,
    title: doc.title,
    intro: doc.intro,
    sections: doc.sections.map((s) => ({
      id: s.id,
      heading: s.heading,
      paragraphs: s.paragraphs ?? [],
      items: s.items ?? [],
    })),
  });
}

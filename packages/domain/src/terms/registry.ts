/**
 * The terms documents the products ask people to accept (design §4.5). Every document is a **draft that
 * requires legal review**; pages render "DRAFT — requires legal review" and the version.
 *
 * Public URL: `siteUrl('web', doc.path)` from `@studio-gamo/ui/lib/sites` (gamostudio.org/legal/<slug>).
 *
 * Versioning: bump `version` whenever a document's text changes (acceptances reference slug + version, and
 * `terms_documents.content_hash` is immutable per version). `contentHash` is the SHA-256 hex of the
 * published text (`legalDocumentCanonicalText` in `@studio-gamo/ui/components/legal/content`); a null hash
 * falls back to SHA-256 of `terms|<slug>|<version>` (`termsContentHash`). Text edits need both a new
 * version and a new hash (enforced by `scripts/audit/legal-drafts.test.ts`).
 */
import type { LegalReviewStatus, TermsSlug, TermsStatus } from '../types/enums.ts';
import { TERMS_SLUGS } from '../types/enums.ts';
import { sha256Hex } from '../security/crypto.ts';

/**
 * draft.5: the public email address replaced by the contact form in every text.
 * draft.4: public accounts removed (site, privacy and provider texts revised for forms and email links).
 * draft.3: Gamo Live removed (ticket and organizer terms retired; site, privacy and provider texts revised).
 * draft.2 was the first full set of draft texts (packages/ui/src/components/legal/content).
 */
export const TERMS_DRAFT_VERSION = '2026-11-19-draft.5';

export interface TermsDocumentEntry {
  slug: TermsSlug;
  /** Current version people must accept (`[A-Za-z0-9.-]`, ≤ 32 chars). */
  version: string;
  title: string;
  /** Path on the web app (gamostudio.org). */
  path: `/legal/${TermsSlug}`;
  status: Extract<TermsStatus, 'draft'>;
  legalReviewStatus: Extract<LegalReviewStatus, 'draft_requires_review'>;
  /** SHA-256 hex of the published text, once written (see header). */
  contentHash: string | null;
  /** One line for links and summaries. */
  summary: string;
}

/**
 * SHA-256 hex of `legalDocumentCanonicalText()` of each draft text (packages/ui/src/components/legal/content).
 * `scripts/audit/legal-drafts.test.ts` recomputes them: edit a text → bump the version and update its hash.
 */
const DRAFT_CONTENT_HASHES: Readonly<Record<TermsSlug, string>> = {
  'site-terms': '5769c476b7e537f5547b9cb01c18e886e48634f417cec79540b3108f703a678b',
  'privacy-policy': '84e7dd4e116ebb5dc965b7abce909667c295b4db1a4dcc9672cc0cbcd549f98d',
  'provider-terms': '70b4bf7b5aaf77b1b8072f9b05c83290c8c18f8ef35a6227f51cf9f8615eb735',
  'academy-enrollment-terms': 'c310032735fd6e33329af2edb49fa638995f1985ddb54fadbb681fdc91814c79',
  'academy-guardian-consent': '1180601159d5850bafe2faa981078aa8334fff48bf504fe66dd165d5aa7f422c',
  'academy-child-safety-consent': '4875f18cbb747ce9c5efeee4124120fec7d0aa049116e75ed931e968a5cca05b',
};

const entry = (slug: TermsSlug, title: string, summary: string): TermsDocumentEntry => ({
  slug,
  version: TERMS_DRAFT_VERSION,
  title,
  path: `/legal/${slug}`,
  status: 'draft',
  legalReviewStatus: 'draft_requires_review',
  contentHash: DRAFT_CONTENT_HASHES[slug],
  summary,
});

/** Keyed by slug; covers every `TERMS_SLUGS` entry (checked in tests). */
export const TERMS_REGISTRY: Readonly<Record<TermsSlug, TermsDocumentEntry>> = Object.freeze({
  'site-terms': entry('site-terms', 'Site Terms', 'Using the Gamo Studios websites.'),
  'privacy-policy': entry(
    'privacy-policy',
    'Privacy Policy',
    'What we collect, why, how long we keep it and your choices.',
  ),
  'provider-terms': entry(
    'provider-terms',
    'Provider and Church Terms with Code of Conduct',
    'Musicians, technicians, teachers and churches serving through Gamo Studios.',
  ),
  'academy-enrollment-terms': entry(
    'academy-enrollment-terms',
    'Academy Enrollment Terms',
    'Registering a student for Gamo Academy lessons.',
  ),
  'academy-guardian-consent': entry(
    'academy-guardian-consent',
    'Academy Guardian Consent',
    'A parent or guardian registering a student under 18.',
  ),
  'academy-child-safety-consent': entry(
    'academy-child-safety-consent',
    'Academy Child-Safety Consent',
    'How lessons with students under 18 are supervised and kept safe.',
  ),
});

/** Every document in `TERMS_SLUGS` order. */
export const TERMS_DOCUMENTS: readonly TermsDocumentEntry[] = TERMS_SLUGS.map((slug) => TERMS_REGISTRY[slug]);

export function isTermsSlug(value: unknown): value is TermsSlug {
  return typeof value === 'string' && (TERMS_SLUGS as readonly string[]).includes(value);
}

export function getTermsDocument(slug: string): TermsDocumentEntry | null {
  return isTermsSlug(slug) ? TERMS_REGISTRY[slug] : null;
}

/** The documents for a form, in the order given (for `TermsConsent` props: slug, label, href, version). */
export function termsDocumentsFor(slugs: readonly TermsSlug[]): TermsDocumentEntry[] {
  return slugs.map((slug) => TERMS_REGISTRY[slug]);
}

/** Value stored in `terms_documents.content_hash` for this version. */
export async function termsContentHash(
  doc: Pick<TermsDocumentEntry, 'slug' | 'version' | 'contentHash'>,
): Promise<string> {
  return doc.contentHash ?? sha256Hex(`terms|${doc.slug}|${doc.version}`);
}

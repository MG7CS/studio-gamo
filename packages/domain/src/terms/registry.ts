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
 * draft.4: public accounts removed (site, privacy and provider texts revised for forms and email links).
 * draft.3: Gamo Live removed (ticket and organizer terms retired; site, privacy and provider texts revised).
 * draft.2 was the first full set of draft texts (packages/ui/src/components/legal/content).
 */
export const TERMS_DRAFT_VERSION = '2026-11-16-draft.4';

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
  'site-terms': '3288a7716e76ba9e567534086109f86f162fbae3149fde1eaa0928d4a6999cab',
  'privacy-policy': '09ed0bbdbc5c63b713a013f31d89cfac5d0feb14f6eeed19c628031c76831906',
  'provider-terms': 'edcc187be6cc10dde84891b7ab9c9c09bf5cb5d01dbdef432fd28ea7d3dbc426',
  'academy-enrollment-terms': '828e9d4ec877cbb186d55572dccb92510e67f328897612fc07085b4b5afc89ae',
  'academy-guardian-consent': '7e825c193a223b647672ba33423765c4fa0c23e6d3d68520cc00e05694274fdf',
  'academy-child-safety-consent': 'e83055c744bbc5e1468b7fc7511b4a5012909c7119ef3b1e13b0af9f663715a2',
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

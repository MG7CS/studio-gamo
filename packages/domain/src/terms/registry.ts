/**
 * The terms documents the products ask people to accept (design §4.5). Every document is a **draft that
 * requires legal review**; pages render "DRAFT — requires legal review" and the version.
 *
 * Public URL: `siteUrl('web', doc.path)` from `@studio-gamo/ui/lib/sites` (gamostudio.org/legal/<slug>).
 *
 * Versioning: bump `version` whenever a document's text changes (acceptances reference slug + version, and
 * `terms_documents.content_hash` is immutable per version). `contentHash` is the SHA-256 hex of the
 * published text once it exists; while it is null, the stored hash is SHA-256 of `terms|<slug>|<version>`
 * (`termsContentHash`). When the drafts land, set `contentHash` **and** bump the version.
 */
import type { LegalReviewStatus, TermsSlug, TermsStatus } from '../types/enums.ts';
import { TERMS_SLUGS } from '../types/enums.ts';
import { sha256Hex } from '../security/crypto.ts';

export const TERMS_DRAFT_VERSION = '2026-10-18-draft.1';

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

const entry = (slug: TermsSlug, title: string, summary: string): TermsDocumentEntry => ({
  slug,
  version: TERMS_DRAFT_VERSION,
  title,
  path: `/legal/${slug}`,
  status: 'draft',
  legalReviewStatus: 'draft_requires_review',
  contentHash: null,
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
  'ticket-terms': entry(
    'ticket-terms',
    'Ticket Terms',
    'Gamo Live tickets and registrations: no resale, transfers, refunds per event policy, first scan wins.',
  ),
  'organizer-terms': entry(
    'organizer-terms',
    'Organizer Terms',
    'Publishing and running events on Gamo Live.',
  ),
  'provider-terms': entry(
    'provider-terms',
    'Provider and Church Terms with Code of Conduct',
    'Musicians, technicians, teachers, artists, agents and churches serving through Gamo Studios.',
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

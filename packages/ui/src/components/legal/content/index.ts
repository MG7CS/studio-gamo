/**
 * All draft legal documents, keyed by terms slug (see `types.ts` for the hashing rule). The slugs mirror
 * `TERMS_SLUGS` in `@gamo/domain/types`; `scripts/audit/legal-drafts.test.ts` checks they agree.
 */
import type { LegalDocumentContent } from './types.ts';
import { siteTerms } from './site-terms.ts';
import { privacyPolicy } from './privacy-policy.ts';
import { ticketTerms } from './ticket-terms.ts';
import { organizerTerms } from './organizer-terms.ts';
import { providerTerms } from './provider-terms.ts';
import { academyEnrollmentTerms } from './academy-enrollment-terms.ts';
import { academyGuardianConsent } from './academy-guardian-consent.ts';
import { academyChildSafetyConsent } from './academy-child-safety-consent.ts';

export type { LegalDocumentContent, LegalSectionContent } from './types.ts';
export { legalDocumentCanonicalText } from './types.ts';

export const LEGAL_DOCUMENT_CONTENT: Readonly<Record<string, LegalDocumentContent>> = Object.freeze({
  'site-terms': siteTerms,
  'privacy-policy': privacyPolicy,
  'ticket-terms': ticketTerms,
  'organizer-terms': organizerTerms,
  'provider-terms': providerTerms,
  'academy-enrollment-terms': academyEnrollmentTerms,
  'academy-guardian-consent': academyGuardianConsent,
  'academy-child-safety-consent': academyChildSafetyConsent,
});

export function getLegalDocumentContent(slug: string): LegalDocumentContent | null {
  return Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENT_CONTENT, slug)
    ? (LEGAL_DOCUMENT_CONTENT[slug] ?? null)
    : null;
}

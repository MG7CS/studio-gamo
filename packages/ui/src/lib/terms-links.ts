/**
 * Turns terms registry entries (`TERMS_REGISTRY` / `termsDocumentsFor()` in `@gamo/domain/terms`) into
 * `TermsConsent` props with absolute links to gamostudio.org/legal/<slug> (`siteUrl('web', path)`).
 * Structural input so this package does not depend on the domain package.
 */
import { siteUrl } from './sites.ts';

export interface TermsLinkSource {
  slug: string;
  title: string;
  path: string;
  version: string;
}

export interface TermsConsentDocument {
  slug: string;
  label: string;
  href: string;
  version: string;
}

export function termsConsentDocuments(docs: readonly TermsLinkSource[]): TermsConsentDocument[] {
  return docs.map((d) => ({
    slug: d.slug,
    label: d.title,
    href: siteUrl('web', d.path),
    version: d.version,
  }));
}

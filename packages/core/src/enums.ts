/**
 * The enums current code shares across products: products, partner roles and statuses, and the terms
 * documents. Each list matches a SQL CHECK in the platform migrations; `packages/db/enums.test.ts`
 * asserts that every value is present in the migration SQL.
 */

export const PRODUCTS = ['web', 'worship', 'academy', 'live', 'production'] as const;
export type Product = (typeof PRODUCTS)[number];

// --- Partners --------------------------------------------------------------------------------

export const PROVIDER_ROLES = [
  'musician',
  'technician',
  'church',
  'agent',
  'organizer',
  'teacher',
  'artist',
] as const;
export type ProviderRole = (typeof PROVIDER_ROLES)[number];
/** Roles that always need staff review before publishing (owner decision 4; a CHECK enforces it). */
export const STAFF_REVIEW_REQUIRED_ROLES = [
  'church',
  'musician',
  'technician',
] as const satisfies readonly ProviderRole[];

export const PROVIDER_STATUSES = [
  'draft',
  'submitted',
  'meeting_scheduled',
  'in_review',
  'changes_requested',
  'verified',
  'rejected',
  'suspended',
] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

// --- Terms -----------------------------------------------------------------------------------

/** Terms documents (slugs are free-form `[a-z0-9-]` in SQL; these are the ones the product uses). */
export const TERMS_SLUGS = [
  'site-terms',
  'privacy-policy',
  'ticket-terms',
  'organizer-terms',
  'provider-terms',
  'academy-enrollment-terms',
  'academy-guardian-consent',
  'academy-child-safety-consent',
] as const;
export type TermsSlug = (typeof TERMS_SLUGS)[number];

export const TERMS_STATUSES = ['draft', 'active', 'retired'] as const;
export type TermsStatus = (typeof TERMS_STATUSES)[number];
export const LEGAL_REVIEW_STATUSES = ['draft_requires_review', 'reviewed'] as const;
export type LegalReviewStatus = (typeof LEGAL_REVIEW_STATUSES)[number];

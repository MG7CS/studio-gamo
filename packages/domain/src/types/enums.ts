/**
 * Every status and enum the identity, email and Academy schema stores (migrations 0012/0013).
 * Each list matches a SQL CHECK or validation trigger; `packages/domain/src/types/types.test.ts`
 * asserts that every value is present in the migration SQL.
 */

/** Narrowing helper: `isOneOf(PROVIDER_STATUSES, value)`. */
export function isOneOf<const T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

export const PRODUCTS = ['web', 'worship', 'academy', 'live', 'production'] as const;
export type Product = (typeof PRODUCTS)[number];

// --- Identity -------------------------------------------------------------------------------

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

export const VERIFICATION_SUBJECT_TYPES = ['provider_profile', 'event', 'organizer'] as const;
export type VerificationSubjectType = (typeof VERIFICATION_SUBJECT_TYPES)[number];

export const VERIFICATION_ACTIONS = [
  'submit',
  'schedule_meeting',
  'start_review',
  'verify',
  'request_changes',
  'reject',
  'suspend',
  'reinstate',
  'approve_event',
  'reject_event',
  'note',
] as const;
export type VerificationAction = (typeof VERIFICATION_ACTIONS)[number];

/** Terms documents (slugs are free-form `[a-z0-9-]` in SQL; these are the ones the product uses). */
export const TERMS_SLUGS = [
  'site-terms',
  'privacy-policy',
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

/**
 * Link-token scope kinds and purposes the database CHECKs allow. Code now issues only `customer:all` and
 * `registration:<id>` (see `security/link-tokens.ts`, `CustomerScope`); the rest are retired Live values.
 */
export const TOKEN_SCOPE_KINDS = ['customer', 'order', 'ticket', 'registration', 'transfer'] as const;
export type TokenScopeKind = (typeof TOKEN_SCOPE_KINDS)[number];
export const TOKEN_PURPOSES = [
  'recovery',
  'order',
  'verification',
  'ticket',
  'registration',
  'transfer',
] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

// --- Email ----------------------------------------------------------------------------------

export const EMAIL_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'delivery_delayed',
  'bounced',
  'complained',
  'failed',
  'suppressed',
  'not_configured',
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** `email_log.kind` (SQL accepts any `[a-z0-9_]`; these are the kinds in use). */
export const EMAIL_KINDS = [
  'auth_code',
  'academy_receipt',
  'academy_reminder',
  'provider_status',
  'staff_alert',
  'academy_recovery',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const SUPPRESSION_REASONS = ['hard_bounce', 'complaint', 'manual'] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

// --- Academy (§4.7) -------------------------------------------------------------------------

export const ACADEMY_REGISTRATION_STATUSES = [
  'reserved',
  'pending_payment',
  'paid',
  'cancelled',
  'waitlisted',
] as const;
export type AcademyRegistrationStatus = (typeof ACADEMY_REGISTRATION_STATUSES)[number];

/** Age bands instead of birth dates. Every band except `18_plus` requires a guardian and both consents. */
export const STUDENT_AGE_BANDS = ['under_6', '6_9', '10_12', '13_15', '16_17', '18_plus'] as const;
export type StudentAgeBand = (typeof STUDENT_AGE_BANDS)[number];

/**
 * The platform tables: people, partner profiles and verification, participation inquiries, terms, rate limits
 * and the email log (migration 0012 in packages/db/migrations; migrations are never edited). Moved unchanged
 * from the old shared schema (`@gamo/db/legacy-schema`). Three columns point at old tables (`users`,
 * `organizations`) that stay in the legacy schema until phase 5; their foreign keys are enforced by the migration
 * SQL and are not declared here, so this file imports nothing from the legacy schema.
 */
import { sql } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  foreignKey,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

/** Mission participation inquiries are review requests, never approved partnerships. */
export const participationInquiries = sqliteTable(
  'participation_inquiries',
  {
    id: text('id').primaryKey(),
    /** FK to the old `users` table (enforced in 0012 SQL; the table moves in phase 5). */
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    interest: text('interest').notNull(),
    name: text('name').notNull(),
    organization: text('organization'),
    message: text('message').notNull(),
    status: text('status').notNull().default('pending'),
    reviewNotes: text('review_notes'),
    reviewedByUserId: text('reviewed_by_user_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('participation_user_idx').on(t.userId, t.createdAt),
    index('participation_status_idx').on(t.status, t.createdAt),
  ],
);
/** One row per verified normalised email, linked from each product's `users.person_id`. */
export const persons = sqliteTable('persons', {
  id: text('id').primaryKey(),
  emailNormalized: text('email_normalized').notNull().unique(),
  emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp' }).notNull(),
  displayName: text('display_name'),
  erasedAt: integer('erased_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
/** Every provider role a person holds; publishing needs `verified` when staff review is required (trigger). */
export const providerProfiles = sqliteTable(
  'provider_profiles',
  {
    id: text('id').primaryKey(),
    personId: text('person_id')
      .notNull()
      .references(() => persons.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // ProviderRole
    productOrigin: text('product_origin').notNull(), // Product
    /** FK to the old `organizations` table (enforced in 0012 SQL; the table moves in phase 5). */
    organizationId: text('organization_id'),
    displayName: text('display_name').notNull(),
    slug: text('slug').unique(),
    profileJson: text('profile_json').notNull().default('{}'),
    status: text('status').notNull().default('draft'), // ProviderStatus
    publishedAt: integer('published_at', { mode: 'timestamp' }),
    requiresStaffReview: integer('requires_staff_review', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    uniqueIndex('provider_profiles_person_role_org_unique').on(
      t.personId,
      t.role,
      sql`coalesce(${t.organizationId}, '')`,
    ),
    index('provider_profiles_queue_idx').on(t.status, t.role, t.updatedAt),
    index('provider_profiles_org_idx')
      .on(t.organizationId)
      .where(sql`organization_id IS NOT NULL`),
  ],
);
/** Append-only staff verification log (UPDATE and DELETE are refused by triggers). */
export const verificationRecords = sqliteTable(
  'verification_records',
  {
    id: text('id').primaryKey(),
    subjectType: text('subject_type').notNull(), // VerificationSubjectType
    subjectId: text('subject_id').notNull(),
    action: text('action').notNull(), // VerificationAction
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    staffUserId: text('staff_user_id'),
    staffName: text('staff_name'),
    meetingAt: integer('meeting_at', { mode: 'timestamp' }),
    meetingLocation: text('meeting_location'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('verification_records_subject_idx').on(t.subjectType, t.subjectId, t.createdAt),
    index('verification_records_staff_idx').on(t.staffUserId, t.createdAt),
  ],
);
export const termsDocuments = sqliteTable(
  'terms_documents',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(), // TermsSlug
    version: text('version').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'), // TermsStatus
    contentHash: text('content_hash').notNull(),
    effectiveAt: integer('effective_at', { mode: 'timestamp' }),
    legalReviewStatus: text('legal_review_status').notNull().default('draft_requires_review'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    uniqueIndex('terms_documents_slug_version_unique').on(t.slug, t.version),
    uniqueIndex('terms_documents_one_active_unique')
      .on(t.slug)
      .where(sql`status = 'active'`),
  ],
);
export const termsAcceptances = sqliteTable(
  'terms_acceptances',
  {
    id: text('id').primaryKey(),
    documentSlug: text('document_slug').notNull(),
    documentVersion: text('document_version').notNull(),
    personId: text('person_id').references(() => persons.id, { onDelete: 'set null' }),
    userId: text('user_id'),
    customerProfileId: text('customer_profile_id'),
    emailNormalized: text('email_normalized'),
    context: text('context').notNull(), // e.g. 'order:<id>', 'signup:live', 'registration:<id>'
    ipHash: text('ip_hash'),
    acceptedAt: integer('accepted_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.documentSlug, t.documentVersion],
      foreignColumns: [termsDocuments.slug, termsDocuments.version],
    }),
    index('terms_acceptances_person_idx')
      .on(t.personId, t.documentSlug)
      .where(sql`person_id IS NOT NULL`),
    index('terms_acceptances_user_idx')
      .on(t.userId, t.documentSlug)
      .where(sql`user_id IS NOT NULL`),
    index('terms_acceptances_customer_idx')
      .on(t.customerProfileId, t.documentSlug)
      .where(sql`customer_profile_id IS NOT NULL`),
    index('terms_acceptances_email_idx')
      .on(t.emailNormalized, t.documentSlug)
      .where(sql`email_normalized IS NOT NULL`),
    index('terms_acceptances_context_idx').on(t.context),
  ],
);
/** Opt-in marketing consent, separate from terms; the latest row per (email, product) wins. */
export const marketingConsents = sqliteTable(
  'marketing_consents',
  {
    id: text('id').primaryKey(),
    emailNormalized: text('email_normalized').notNull(),
    product: text('product').notNull(), // Product
    granted: integer('granted', { mode: 'boolean' }).notNull(),
    source: text('source').notNull(),
    ipHash: text('ip_hash'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('marketing_consents_email_idx').on(t.emailNormalized, t.product, t.createdAt)],
);
export const rateLimitCounters = sqliteTable(
  'rate_limit_counters',
  {
    bucket: text('bucket').notNull(),
    windowStart: integer('window_start').notNull(), // epoch seconds
    count: integer('count').notNull().default(0),
    expiresAt: integer('expires_at').notNull(), // epoch seconds
  },
  (t) => [
    primaryKey({ columns: [t.bucket, t.windowStart] }),
    index('rate_limit_counters_expires_idx').on(t.expiresAt),
  ],
);
/** One outbox for every email (idempotency key unique). `recipient_email` is nulled after 180 days. */
export const emailLog = sqliteTable(
  'email_log',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // EmailKind
    product: text('product'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    recipientEmail: text('recipient_email'),
    recipientHash: text('recipient_hash').notNull(), // hashEmail()
    subject: text('subject'),
    relatedType: text('related_type'),
    relatedId: text('related_id'),
    status: text('status').notNull().default('queued'), // EmailStatus
    providerMessageId: text('provider_message_id'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp' }),
    lastErrorCode: text('last_error_code'),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('email_log_retry_idx').on(t.status, t.nextAttemptAt),
    index('email_log_related_idx').on(t.relatedType, t.relatedId),
    index('email_log_recipient_idx').on(t.recipientHash, t.createdAt),
    index('email_log_provider_idx')
      .on(t.providerMessageId)
      .where(sql`provider_message_id IS NOT NULL`),
    index('email_log_created_idx').on(t.createdAt),
  ],
);
export const emailSuppressions = sqliteTable('email_suppressions', {
  emailHash: text('email_hash').primaryKey(), // hashEmail()
  reason: text('reason').notNull(), // SuppressionReason
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export type ParticipationInquiry = InferSelectModel<typeof participationInquiries>;
export type NewParticipationInquiry = InferInsertModel<typeof participationInquiries>;
export type Person = InferSelectModel<typeof persons>;
export type NewPerson = InferInsertModel<typeof persons>;
export type ProviderProfile = InferSelectModel<typeof providerProfiles>;
export type NewProviderProfile = InferInsertModel<typeof providerProfiles>;
export type VerificationRecord = InferSelectModel<typeof verificationRecords>;
export type NewVerificationRecord = InferInsertModel<typeof verificationRecords>;
export type TermsDocument = InferSelectModel<typeof termsDocuments>;
export type NewTermsDocument = InferInsertModel<typeof termsDocuments>;
export type TermsAcceptance = InferSelectModel<typeof termsAcceptances>;
export type NewTermsAcceptance = InferInsertModel<typeof termsAcceptances>;
export type MarketingConsent = InferSelectModel<typeof marketingConsents>;
export type NewMarketingConsent = InferInsertModel<typeof marketingConsents>;
export type RateLimitCounter = InferSelectModel<typeof rateLimitCounters>;
export type NewRateLimitCounter = InferInsertModel<typeof rateLimitCounters>;
export type EmailLogEntry = InferSelectModel<typeof emailLog>;
export type NewEmailLogEntry = InferInsertModel<typeof emailLog>;
export type EmailSuppression = InferSelectModel<typeof emailSuppressions>;
export type NewEmailSuppression = InferInsertModel<typeof emailSuppressions>;

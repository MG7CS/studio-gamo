import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

// ============================================================================
// 1. IDENTITY, ACCOUNTS & ACCESS
// ============================================================================

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    displayName: text('display_name'),
    verifiedEmailAt: integer('verified_email_at', { mode: 'timestamp' }),
    status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'archived'
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    // 0012: shared person record (set only from a verified email; never grants product access)
    personId: text('person_id').references((): AnySQLiteColumn => persons.id, { onDelete: 'set null' }),
    personLinkOptOutAt: integer('person_link_opt_out_at', { mode: 'timestamp' }),
  },
  (t) => [index('users_person_idx').on(t.personId)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    product: text('product'), // 'web' | 'worship' | 'academy' | 'live' | 'production'
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    clerkSessionId: text('clerk_session_id'), // 0012: Clerk `sid`, revoked by the Clerk webhook
  },
  (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_clerk_session_idx')
      .on(t.clerkSessionId)
      .where(sql`clerk_session_id IS NOT NULL`),
  ],
);

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(), // 'superadmin' | 'staff_reviewer' | 'finance_manager' | 'worship_leader' | 'musician' | 'instructor' | 'student' | 'organizer'
  description: text('description'),
});

export const userRoles = sqliteTable(
  'user_roles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    scopeType: text('scope_type'), // 'global' | 'organization' | 'program'
    scopeId: text('scope_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('user_roles_user_idx').on(t.userId)],
);

export const externalIdentities = sqliteTable(
  'external_identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'cloudflare_access' | 'email_otp'
    providerSubject: text('provider_subject').notNull(),
    providerEmail: text('provider_email').notNull(),
    provisionedByUserId: text('provisioned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: integer('verified_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    uniqueIndex('ext_id_provider_sub_unique').on(t.provider, t.providerSubject),
    uniqueIndex('ext_id_user_provider_unique').on(t.userId, t.provider),
    index('ext_id_user_idx').on(t.userId),
  ],
);

export const adminCredentials = sqliteTable('admin_credentials', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Sections 2 (Worship demo: musicians, churches, gigs, standby, check-ins), 3 (Academy demo: instructors,
// classes, enrollments), 6 (church partnerships, sponsorships), 10 (participation inquiries), product
// accounts, Clerk links, organizations, sign-in challenges, provider profiles and verification records were
// dropped by migration 0019 (public accounts removed, 2026-11-16). Sections 4, 5 and 7 went with 0018.

// ============================================================================
// 8. MEDIA STORAGE METADATA & ACCESS POLICIES
// ============================================================================

export const mediaFiles = sqliteTable(
  'media_files',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scopeType: text('scope_type').notNull(), // 'event_poster' | 'musician_audition' | 'academy_sheet_music' | 'org_verification'
    scopeId: text('scope_id'),
    r2Key: text('r2_key').notNull().unique(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    accessPolicy: text('access_policy').notNull().default('private'), // 'public_read' | 'private' | 'audition' | 'restricted'
    status: text('status').notNull().default('confirmed'), // 'pending_upload' | 'confirmed' | 'deleted'
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('media_owner_idx').on(t.ownerUserId), index('media_scope_idx').on(t.scopeType, t.scopeId)],
);

// ============================================================================
// 9. AUDIT LOGS & STAFF REVIEWS
// ============================================================================

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // e.g. 'event.approved', 'ticket.scanned', 'payout.scheduled'
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    payloadJson: text('payload_json'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('audit_actor_idx').on(t.actorUserId), index('audit_entity_idx').on(t.entityType, t.entityId)],
);

export const moderationReviews = sqliteTable(
  'moderation_reviews',
  {
    id: text('id').primaryKey(),
    reviewerUserId: text('reviewer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(), // 'event' | 'organizer' | 'audition' | 'instructor'
    targetId: text('target_id').notNull(),
    decision: text('decision').notNull(), // 'approved' | 'rejected' | 'revision_requested'
    notes: text('notes'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('mod_reviewer_idx').on(t.reviewerUserId),
    index('mod_target_idx').on(t.targetType, t.targetId),
  ],
);

// ============================================================================
// 0012. SHARED PERSON, GUEST CUSTOMERS, TERMS, RATE LIMITS, EMAIL
// (docs/design/identity-and-ticketing.md §4, §5.1; docs/DATABASE.md)
// ============================================================================

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

/** Guests (ticket buyers, parents, students): email is identity; `person_id` only once the email is proven. */
export const customerProfiles = sqliteTable(
  'customer_profiles',
  {
    id: text('id').primaryKey(),
    emailNormalized: text('email_normalized').notNull().unique(),
    personId: text('person_id').references(() => persons.id, { onDelete: 'set null' }),
    displayName: text('display_name'),
    phone: text('phone'),
    emailVerifiedAt: integer('email_verified_at', { mode: 'timestamp' }),
    erasedAt: integer('erased_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('customer_profiles_person_idx')
      .on(t.personId)
      .where(sql`person_id IS NOT NULL`),
  ],
);

/** Emailed manage/recovery links; only the HMAC of the token is stored. */
export const customerAccessTokens = sqliteTable(
  'customer_access_tokens',
  {
    product: text('product'),
    id: text('id').primaryKey(),
    customerProfileId: text('customer_profile_id')
      .notNull()
      .references(() => customerProfiles.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    scope: text('scope').notNull(), // CustomerScope
    purpose: text('purpose').notNull(), // TokenPurpose
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
    useCount: integer('use_count').notNull().default(0),
    maxUses: integer('max_uses'),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    createdIpHash: text('created_ip_hash'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('customer_tokens_profile_scope_idx').on(t.customerProfileId, t.scope),
    index('customer_tokens_scope_idx').on(t.scope, t.revokedAt),
    index('customer_tokens_expires_idx').on(t.expiresAt),
  ],
);

export const customerSessions = sqliteTable(
  'customer_sessions',
  {
    product: text('product'),
    id: text('id').primaryKey(),
    customerProfileId: text('customer_profile_id')
      .notNull()
      .references(() => customerProfiles.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    tokenId: text('token_id').references(() => customerAccessTokens.id, { onDelete: 'set null' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('customer_sessions_profile_idx').on(t.customerProfileId),
    index('customer_sessions_token_idx').on(t.tokenId),
    index('customer_sessions_expires_idx').on(t.expiresAt),
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
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    customerProfileId: text('customer_profile_id').references(() => customerProfiles.id, {
      onDelete: 'set null',
    }),
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

/** Guest Academy registration (no account; an age band, never a birth date). */
export const academyRegistrations = sqliteTable(
  'academy_registrations',
  {
    id: text('id').primaryKey(),
    refundRequestedAt: integer('refund_requested_at', { mode: 'timestamp' }),
    stripeCustomerId: text('stripe_customer_id'),
    reference: text('reference').unique(),
    programSlug: text('program_slug').notNull(),
    lessonSlug: text('lesson_slug'),
    location: text('location').notNull(),
    scheduleText: text('schedule_text'),
    studentFirstName: text('student_first_name').notNull(),
    studentAgeBand: text('student_age_band').notNull(), // StudentAgeBand
    level: text('level'), // LevelId (0022): beginner | developing | advancing
    lessonFormat: text('lesson_format'), // 0022: private (one-on-one) | group
    zip: text('zip'), // 0022: five digits; personal data, never in emails or logs
    guardianName: text('guardian_name'),
    guardianEmail: text('guardian_email'),
    guardianPhone: text('guardian_phone'),
    customerProfileId: text('customer_profile_id')
      .notNull()
      .references(() => customerProfiles.id),
    status: text('status').notNull().default('reserved'), // AcademyRegistrationStatus
    termsAcceptanceId: text('terms_acceptance_id')
      .notNull()
      .references(() => termsAcceptances.id),
    guardianConsentAcceptanceId: text('guardian_consent_acceptance_id').references(() => termsAcceptances.id),
    childSafetyAcceptanceId: text('child_safety_acceptance_id').references(() => termsAcceptances.id),
    amountCents: integer('amount_cents').notNull().default(0),
    currency: text('currency').notNull().default('usd'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    paidAt: integer('paid_at', { mode: 'timestamp' }),
    cancelledAt: integer('cancelled_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('academy_registrations_customer_idx').on(t.customerProfileId, t.createdAt),
    index('academy_registrations_program_idx').on(t.programSlug, t.status),
    index('academy_registrations_status_idx').on(t.status, t.createdAt),
  ],
);

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

export const productAccounts = sqliteTable(
  'product_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    product: text('product').notNull(), // 'web' | 'worship' | 'academy' | 'live' | 'production'
    status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'archived'
    onboardingStatus: text('onboarding_status').notNull().default('pending'), // 'pending' | 'completed'
    clerkAppId: text('clerk_app_id'),
    clerkUserId: text('clerk_user_id'),
    clerkIssuer: text('clerk_issuer'),
    clerkLinkedAt: integer('clerk_linked_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    uniqueIndex('product_account_user_product_unique').on(t.userId, t.product),
    index('product_account_user_idx').on(t.userId),
    index('product_account_product_idx').on(t.product),
    index('product_account_clerk_user_idx').on(t.clerkUserId),
  ],
);

export const clerkIdentityLinks = sqliteTable(
  'clerk_identity_links',
  {
    id: text('id').primaryKey(),
    product: text('product').notNull(), // 'web' | 'worship' | 'academy' | 'live' | 'production'
    clerkAppId: text('clerk_app_id').notNull(),
    clerkIssuer: text('clerk_issuer').notNull(),
    clerkUserId: text('clerk_user_id').notNull(),
    clerkEmail: text('clerk_email').notNull(),
    clerkEmailVerified: integer('clerk_email_verified', { mode: 'boolean' }).notNull().default(true),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    productAccountId: text('product_account_id')
      .notNull()
      .references(() => productAccounts.id, { onDelete: 'cascade' }),
    migrationSource: text('migration_source').notNull().default('clerk_registration'), // 'clerk_registration' | 'verified_domain_claim' | 'admin_migration'
    status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'revoked'
    linkedAt: integer('linked_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    uniqueIndex('clerk_identity_product_user_unique').on(t.product, t.clerkUserId),
    uniqueIndex('clerk_identity_issuer_user_unique').on(t.clerkIssuer, t.clerkUserId),
    uniqueIndex('clerk_identity_product_account_unique').on(t.productAccountId),
    index('clerk_identity_user_idx').on(t.userId, t.product),
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

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull(), // 'church' | 'ministry' | 'school' | 'event_producer' | 'sponsor'
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const organizationMembers = sqliteTable(
  'organization_members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // 'owner' | 'admin' | 'member' | 'coordinator'
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    uniqueIndex('org_member_unique').on(t.organizationId, t.userId),
    index('org_member_user_idx').on(t.userId),
  ],
);

export const authChallenges = sqliteTable(
  'auth_challenges',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: text('purpose').notNull().default('signin'), // 'signin' | 'verify_email'
    attempts: integer('attempts').notNull().default(0),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    consumedAt: integer('consumed_at', { mode: 'timestamp' }),
    ipHash: text('ip_hash'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [
    index('auth_challenges_email_idx').on(t.email, t.createdAt),
    index('auth_challenges_expires_idx').on(t.expiresAt),
  ],
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

// ============================================================================
// 2. GAMO WORSHIP (Musicians, Churches, Gigs, Standby, Check-ins)
// ============================================================================

export const musicianProfiles = sqliteTable(
  'musician_profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected' | 'inactive'
    bio: text('bio'),
    homeZone: text('home_zone'),
    travelRadiusMiles: integer('travel_radius_miles'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('musician_user_idx').on(t.userId)],
);

export const musicianSkills = sqliteTable(
  'musician_skills',
  {
    id: text('id').primaryKey(),
    musicianId: text('musician_id')
      .notNull()
      .references(() => musicianProfiles.id, { onDelete: 'cascade' }),
    instrument: text('instrument').notNull(),
    proficiency: text('proficiency').notNull().default('intermediate'), // 'intermediate' | 'advanced' | 'professional'
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('musician_skills_idx').on(t.musicianId)],
);

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  musicianId: text('musician_id').references(() => musicianProfiles.id, { onDelete: 'set null' }),
  step: text('step').notNull().default('identity'),
  status: text('status').notNull().default('draft'), // 'draft' | 'submitted' | 'approved' | 'rejected'
  submittedAt: integer('submitted_at', { mode: 'timestamp' }),
  reviewNotes: text('review_notes'),
});

export const churches = sqliteTable('churches', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  serviceZone: text('service_zone'),
  contactUserId: text('contact_user_id')
    .notNull()
    .references(() => users.id),
  address: text('address'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const gigs = sqliteTable(
  'gigs',
  {
    id: text('id').primaryKey(),
    churchId: text('church_id')
      .notNull()
      .references(() => churches.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull(), // 'spot_fill' | 'monthly' | 'quarterly'
    startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
    endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
    rehearsalAt: integer('rehearsal_at', { mode: 'timestamp' }),
    status: text('status').notNull().default('draft'), // 'draft' | 'requested' | 'confirmed' | 'completed' | 'canceled'
    locationZone: text('location_zone'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('gigs_church_idx').on(t.churchId), index('gigs_starts_at_idx').on(t.startsAt)],
);

export const gigPositions = sqliteTable(
  'gig_positions',
  {
    id: text('id').primaryKey(),
    gigId: text('gig_id')
      .notNull()
      .references(() => gigs.id, { onDelete: 'cascade' }),
    instrument: text('instrument').notNull(),
    agreedPayCents: integer('agreed_pay_cents').notNull().default(0), // Musician pay (third_party_payable)
    adminAllocationCents: integer('admin_allocation_cents').notNull().default(0), // Gamo administrative allocation
    status: text('status').notNull().default('open'), // 'open' | 'filled' | 'standby_ready' | 'canceled'
  },
  (t) => [index('gig_pos_gig_idx').on(t.gigId)],
);

export const gigAssignments = sqliteTable(
  'gig_assignments',
  {
    id: text('id').primaryKey(),
    positionId: text('position_id')
      .notNull()
      .references(() => gigPositions.id, { onDelete: 'cascade' }),
    musicianId: text('musician_id')
      .notNull()
      .references(() => musicianProfiles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'primary' | 'standby'
    status: text('status').notNull().default('assigned'), // 'assigned' | 'confirmed' | 'en_route' | 'checked_in' | 'missed' | 'canceled'
    confirmationDeadline: integer('confirmation_deadline', { mode: 'timestamp' }),
    assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('gig_assign_pos_idx').on(t.positionId), index('gig_assign_musician_idx').on(t.musicianId)],
);

export const checkins = sqliteTable(
  'checkins',
  {
    id: text('id').primaryKey(),
    assignmentId: text('assignment_id')
      .notNull()
      .references(() => gigAssignments.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // 'confirmed' | 'missed' | 'late' | 'manual_override'
    recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
    notes: text('notes'),
  },
  (t) => [index('checkins_assignment_idx').on(t.assignmentId)],
);

export const standbyDispatches = sqliteTable('standby_dispatches', {
  id: text('id').primaryKey(),
  gigId: text('gig_id')
    .notNull()
    .references(() => gigs.id, { onDelete: 'cascade' }),
  failedAssignmentId: text('failed_assignment_id')
    .notNull()
    .references(() => gigAssignments.id),
  standbyAssignmentId: text('standby_assignment_id')
    .notNull()
    .references(() => gigAssignments.id),
  status: text('status').notNull().default('alerted'), // 'alerted' | 'accepted' | 'declined' | 'en_route' | 'arrived'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// 3. GAMO ACADEMY (Instructors, Classes, Enrollments)
// ============================================================================

export const instructorProfiles = sqliteTable(
  'instructor_profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bio: text('bio'),
    specialties: text('specialties'),
    backgroundCheckStatus: text('background_check_status').notNull().default('pending'), // 'pending' | 'cleared' | 'flagged'
    clearedAt: integer('cleared_at', { mode: 'timestamp' }),
    status: text('status').notNull().default('active'),
  },
  (t) => [index('instructor_user_idx').on(t.userId)],
);

export const classes = sqliteTable(
  'classes',
  {
    id: text('id').primaryKey(),
    instructorId: text('instructor_id')
      .notNull()
      .references(() => instructorProfiles.id, { onDelete: 'cascade' }),
    hostOrgId: text('host_org_id').references(() => organizations.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    instrument: text('instrument').notNull(),
    level: text('level').notNull().default('beginner'), // 'beginner' | 'intermediate' | 'advanced'
    capacity: integer('capacity').notNull().default(1),
    durationMinutes: integer('duration_minutes').notNull().default(45),
    suggestedTuitionCents: integer('suggested_tuition_cents').notNull().default(0),
    status: text('status').notNull().default('active'), // 'active' | 'full' | 'completed' | 'canceled'
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('classes_instructor_idx').on(t.instructorId)],
);

export const enrollments = sqliteTable(
  'enrollments',
  {
    id: text('id').primaryKey(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    studentUserId: text('student_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guardianUserId: text('guardian_user_id').references(() => users.id, { onDelete: 'set null' }),
    fundingSource: text('funding_source').notNull().default('tuition'), // 'tuition' | 'sliding_scale' | 'sponsor' | 'scholarship'
    agreedTuitionCents: integer('agreed_tuition_cents').notNull().default(0),
    status: text('status').notNull().default('active'), // 'pending' | 'active' | 'completed' | 'withdrawn'
    enrolledAt: integer('enrolled_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('enrollments_class_idx').on(t.classId), index('enrollments_student_idx').on(t.studentUserId)],
);

// Sections 4 (Gamo Live events), 5 (production requests/projects) and 7 (payment ledger and Stripe
// webhooks) were dropped by migration 0018 (Gamo Live removed, 2026-11-16).

// ============================================================================
// 6. CHURCH PARTNERSHIPS & SPONSORSHIPS
// ============================================================================

export const churchPartnerships = sqliteTable('church_partnerships', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  program: text('program').notNull(), // 'worship' | 'academy' | 'live' | 'production' | 'ecosystem'
  participationKind: text('participation_kind').notNull(), // 'host_facility' | 'resource_partner' | 'network_church'
  status: text('status').notNull().default('active'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  notes: text('notes'),
});

export const sponsorships = sqliteTable('sponsorships', {
  id: text('id').primaryKey(),
  sponsorOrgId: text('sponsor_org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  program: text('program').notNull(), // 'academy' | 'live' | 'worship' | 'general'
  targetType: text('target_type'), // 'class' | 'event' | 'student' | 'fund'
  targetId: text('target_id'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

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
// 10. MISSION PARTICIPATION INQUIRIES (the rest of the 0006 Live platform was dropped by 0018)
// ============================================================================

/** Mission participation inquiries are review requests, never approved partnerships. */
export const participationInquiries = sqliteTable(
  'participation_inquiries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    interest: text('interest').notNull(),
    name: text('name').notNull(),
    organization: text('organization'),
    message: text('message').notNull(),
    status: text('status').notNull().default('pending'),
    reviewNotes: text('review_notes'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('participation_user_idx').on(t.userId, t.createdAt),
    index('participation_status_idx').on(t.status, t.createdAt),
  ],
);

// ============================================================================
// 0012. SHARED PERSON, GUEST CUSTOMERS, PROVIDERS, TERMS, RATE LIMITS, EMAIL
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
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
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

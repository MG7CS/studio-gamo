import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ============================================================================
// 1. IDENTITY, ACCOUNTS & ACCESS
// ============================================================================

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  verifiedEmailAt: integer('verified_email_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'archived'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  product: text('product'), // 'web' | 'worship' | 'academy' | 'live' | 'production'
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('sessions_user_idx').on(t.userId),
]);

export const productAccounts = sqliteTable('product_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  product: text('product').notNull(), // 'web' | 'worship' | 'academy' | 'live' | 'production'
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'archived'
  onboardingStatus: text('onboarding_status').notNull().default('pending'), // 'pending' | 'completed'
  clerkAppId: text('clerk_app_id'),
  clerkUserId: text('clerk_user_id'),
  clerkIssuer: text('clerk_issuer'),
  clerkLinkedAt: integer('clerk_linked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('product_account_user_product_unique').on(t.userId, t.product),
  index('product_account_user_idx').on(t.userId),
  index('product_account_product_idx').on(t.product),
  index('product_account_clerk_user_idx').on(t.clerkUserId),
]);

export const clerkIdentityLinks = sqliteTable('clerk_identity_links', {
  id: text('id').primaryKey(),
  product: text('product').notNull(), // 'web' | 'worship' | 'academy' | 'live' | 'production'
  clerkAppId: text('clerk_app_id').notNull(),
  clerkIssuer: text('clerk_issuer').notNull(),
  clerkUserId: text('clerk_user_id').notNull(),
  clerkEmail: text('clerk_email').notNull(),
  clerkEmailVerified: integer('clerk_email_verified', { mode: 'boolean' }).notNull().default(true),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  productAccountId: text('product_account_id').notNull().references(() => productAccounts.id, { onDelete: 'cascade' }),
  migrationSource: text('migration_source').notNull().default('clerk_registration'), // 'clerk_registration' | 'verified_domain_claim' | 'admin_migration'
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'revoked'
  linkedAt: integer('linked_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('clerk_identity_product_user_unique').on(t.product, t.clerkUserId),
  uniqueIndex('clerk_identity_issuer_user_unique').on(t.clerkIssuer, t.clerkUserId),
  uniqueIndex('clerk_identity_product_account_unique').on(t.productAccountId),
  index('clerk_identity_user_idx').on(t.userId, t.product),
]);

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(), // 'superadmin' | 'staff_reviewer' | 'finance_manager' | 'worship_leader' | 'musician' | 'instructor' | 'student' | 'organizer'
  description: text('description'),
});

export const userRoles = sqliteTable('user_roles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  scopeType: text('scope_type'), // 'global' | 'organization' | 'program'
  scopeId: text('scope_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('user_roles_user_idx').on(t.userId),
]);

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull(), // 'church' | 'ministry' | 'school' | 'event_producer' | 'sponsor'
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const organizationMembers = sqliteTable('organization_members', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'owner' | 'admin' | 'member' | 'coordinator'
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('org_member_unique').on(t.organizationId, t.userId),
  index('org_member_user_idx').on(t.userId),
]);

export const authChallenges = sqliteTable('auth_challenges', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  codeHash: text('code_hash').notNull(),
  purpose: text('purpose').notNull().default('signin'), // 'signin' | 'verify_email'
  attempts: integer('attempts').notNull().default(0),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }),
  ipHash: text('ip_hash'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('auth_challenges_email_idx').on(t.email, t.createdAt),
  index('auth_challenges_expires_idx').on(t.expiresAt),
]);

export const externalIdentities = sqliteTable('external_identities', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'cloudflare_access' | 'email_otp'
  providerSubject: text('provider_subject').notNull(),
  providerEmail: text('provider_email').notNull(),
  provisionedByUserId: text('provisioned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('ext_id_provider_sub_unique').on(t.provider, t.providerSubject),
  uniqueIndex('ext_id_user_provider_unique').on(t.userId, t.provider),
  index('ext_id_user_idx').on(t.userId),
]);

export const adminCredentials = sqliteTable('admin_credentials', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
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

export const musicianProfiles = sqliteTable('musician_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected' | 'inactive'
  bio: text('bio'),
  homeZone: text('home_zone'),
  travelRadiusMiles: integer('travel_radius_miles'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('musician_user_idx').on(t.userId),
]);

export const musicianSkills = sqliteTable('musician_skills', {
  id: text('id').primaryKey(),
  musicianId: text('musician_id').notNull().references(() => musicianProfiles.id, { onDelete: 'cascade' }),
  instrument: text('instrument').notNull(),
  proficiency: text('proficiency').notNull().default('intermediate'), // 'intermediate' | 'advanced' | 'professional'
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
}, (t) => [
  index('musician_skills_idx').on(t.musicianId),
]);

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
  contactUserId: text('contact_user_id').notNull().references(() => users.id),
  address: text('address'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const gigs = sqliteTable('gigs', {
  id: text('id').primaryKey(),
  churchId: text('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  plan: text('plan').notNull(), // 'spot_fill' | 'monthly' | 'quarterly'
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
  rehearsalAt: integer('rehearsal_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('draft'), // 'draft' | 'requested' | 'confirmed' | 'completed' | 'canceled'
  locationZone: text('location_zone'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('gigs_church_idx').on(t.churchId),
  index('gigs_starts_at_idx').on(t.startsAt),
]);

export const gigPositions = sqliteTable('gig_positions', {
  id: text('id').primaryKey(),
  gigId: text('gig_id').notNull().references(() => gigs.id, { onDelete: 'cascade' }),
  instrument: text('instrument').notNull(),
  agreedPayCents: integer('agreed_pay_cents').notNull().default(0), // Musician pay (third_party_payable)
  adminAllocationCents: integer('admin_allocation_cents').notNull().default(0), // Gamo administrative allocation
  status: text('status').notNull().default('open'), // 'open' | 'filled' | 'standby_ready' | 'canceled'
}, (t) => [
  index('gig_pos_gig_idx').on(t.gigId),
]);

export const gigAssignments = sqliteTable('gig_assignments', {
  id: text('id').primaryKey(),
  positionId: text('position_id').notNull().references(() => gigPositions.id, { onDelete: 'cascade' }),
  musicianId: text('musician_id').notNull().references(() => musicianProfiles.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'primary' | 'standby'
  status: text('status').notNull().default('assigned'), // 'assigned' | 'confirmed' | 'en_route' | 'checked_in' | 'missed' | 'canceled'
  confirmationDeadline: integer('confirmation_deadline', { mode: 'timestamp' }),
  assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('gig_assign_pos_idx').on(t.positionId),
  index('gig_assign_musician_idx').on(t.musicianId),
]);

export const checkins = sqliteTable('checkins', {
  id: text('id').primaryKey(),
  assignmentId: text('assignment_id').notNull().references(() => gigAssignments.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'confirmed' | 'missed' | 'late' | 'manual_override'
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
  notes: text('notes'),
}, (t) => [
  index('checkins_assignment_idx').on(t.assignmentId),
]);

export const standbyDispatches = sqliteTable('standby_dispatches', {
  id: text('id').primaryKey(),
  gigId: text('gig_id').notNull().references(() => gigs.id, { onDelete: 'cascade' }),
  failedAssignmentId: text('failed_assignment_id').notNull().references(() => gigAssignments.id),
  standbyAssignmentId: text('standby_assignment_id').notNull().references(() => gigAssignments.id),
  status: text('status').notNull().default('alerted'), // 'alerted' | 'accepted' | 'declined' | 'en_route' | 'arrived'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// 3. GAMO ACADEMY (Instructors, Classes, Enrollments)
// ============================================================================

export const instructorProfiles = sqliteTable('instructor_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bio: text('bio'),
  specialties: text('specialties'),
  backgroundCheckStatus: text('background_check_status').notNull().default('pending'), // 'pending' | 'cleared' | 'flagged'
  clearedAt: integer('cleared_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'),
}, (t) => [
  index('instructor_user_idx').on(t.userId),
]);

export const classes = sqliteTable('classes', {
  id: text('id').primaryKey(),
  instructorId: text('instructor_id').notNull().references(() => instructorProfiles.id, { onDelete: 'cascade' }),
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
}, (t) => [
  index('classes_instructor_idx').on(t.instructorId),
]);

export const enrollments = sqliteTable('enrollments', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  studentUserId: text('student_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  guardianUserId: text('guardian_user_id').references(() => users.id, { onDelete: 'set null' }),
  fundingSource: text('funding_source').notNull().default('tuition'), // 'tuition' | 'sliding_scale' | 'sponsor' | 'scholarship'
  agreedTuitionCents: integer('agreed_tuition_cents').notNull().default(0),
  status: text('status').notNull().default('active'), // 'pending' | 'active' | 'completed' | 'withdrawn'
  enrolledAt: integer('enrolled_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('enrollments_class_idx').on(t.classId),
  index('enrollments_student_idx').on(t.studentUserId),
]);

// ============================================================================
// 4. GAMO LIVE (Organizers, Events, Occurrences, Tiers, Registrations)
// ============================================================================

export const organizerProfiles = sqliteTable('organizer_profiles', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('church'), // 'church' | 'choir' | 'ministry' | 'conference_organizer'
  verificationStatus: text('verification_status').notNull().default('unverified'), // 'unverified' | 'submitted' | 'verified' | 'rejected'
  ticketingAuthorizedAt: integer('ticketing_authorized_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('organizer_org_idx').on(t.organizationId),
]);

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  organizerId: text('organizer_id').notNull().references(() => organizerProfiles.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category').notNull(), // 'concert' | 'worship' | 'bible' | 'conference' | 'youth'
  tagline: text('tagline'),
  description: text('description').notNull(),
  venueName: text('venue_name').notNull(),
  address: text('address'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }),
  timezone: text('timezone').notNull().default('America/Phoenix'),
  admissionType: text('admission_type').notNull().default('free'), // 'free' | 'paid' | 'external'
  photoKey: text('photo_key'),
  externalUrl: text('external_url'),
  status: text('status').notNull().default('pending_review'), // 'draft' | 'pending_review' | 'approved' | 'rejected' | 'canceled'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  listingType: text('listing_type').notNull().default('organizer_submitted'), // 'organizer_submitted' | 'external_discovery'
  importKey: text('import_key'),
  metroSlug: text('metro_slug'),
  startDateLocal: text('start_date_local'),
  startTimeLocal: text('start_time_local'),
  publishedByLabel: text('published_by_label'),
  publishedByUserId: text('published_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  originalOrganizerName: text('original_organizer_name'),
  externalDestinationKind: text('external_destination_kind'), // 'official_ticket_page' | 'organizer_event_page' | 'venue_event_page' | 'publisher_event_page'
  externalTicketProvider: text('external_ticket_provider'),
  externalOnly: integer('external_only', { mode: 'boolean' }).notNull().default(false),
  priceMinCents: integer('price_min_cents'),
  currency: text('currency').notNull().default('USD'),
  ticketAvailability: text('ticket_availability').notNull().default('unverified'),
  sourceUrlsJson: text('source_urls_json'),
  lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp' }),
  artworkUrl: text('artwork_url'),
  artworkRightsVerified: integer('artwork_rights_verified', { mode: 'boolean' }).notNull().default(false),
  artworkLicenseCredit: text('artwork_license_credit'),
  editorialStatus: text('editorial_status').notNull().default('draft'), // 'draft' | 'verified' | 'approved' | 'published' | 'archived' | 'canceled' | 'rejected'
  editorialNotes: text('editorial_notes'),
  independentDisclosure: text('independent_disclosure'),
  isFeatured: integer('is_featured', { mode: 'boolean' }).notNull().default(false),
}, (t) => [
  index('events_organizer_idx').on(t.organizerId),
  index('events_status_idx').on(t.status),
  index('events_starts_at_idx').on(t.startsAt),
  uniqueIndex('events_import_key_unique').on(t.importKey),
  index('events_metro_slug_idx').on(t.metroSlug, t.status, t.startsAt),
  index('events_listing_type_idx').on(t.listingType, t.editorialStatus, t.status),
]);

export const eventOccurrences = sqliteTable('event_occurrences', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('scheduled'),
}, (t) => [
  index('occurrences_event_idx').on(t.eventId),
]);

export const ticketTiers = sqliteTable('ticket_tiers', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull().default(0),
  capacity: integer('capacity').notNull().default(100),
  reservedCount: integer('reserved_count').notNull().default(0),
  note: text('note'),
}, (t) => [
  index('ticket_tiers_event_idx').on(t.eventId),
]);

export const eventRegistrations = sqliteTable('event_registrations', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  tierId: text('tier_id').references(() => ticketTiers.id, { onDelete: 'set null' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  attendeeName: text('attendee_name').notNull(),
  attendeeEmail: text('attendee_email').notNull(),
  quantity: integer('quantity').notNull().default(1),
  qrToken: text('qr_token').notNull().unique(),
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'checked_in' | 'canceled'
  checkedInAt: integer('checked_in_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('reg_event_idx').on(t.eventId),
  index('reg_email_idx').on(t.attendeeEmail),
  uniqueIndex('reg_event_email_unique').on(t.eventId, t.attendeeEmail),
]);

// ============================================================================
// 5. GAMO PRODUCTION (Inquiries & Technical Projects)
// ============================================================================

export const productionRequests = sqliteTable('production_requests', {
  id: text('id').primaryKey(),
  churchOrgId: text('church_org_id').references(() => organizations.id, { onDelete: 'set null' }),
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  contactUserId: text('contact_user_id').notNull().references(() => users.id),
  category: text('category').notNull(), // 'audio' | 'livestream' | 'lighting' | 'acoustic' | 'training'
  scopeSummary: text('scope_summary').notNull(),
  status: text('status').notNull().default('submitted'), // 'submitted' | 'in_review' | 'scheduled' | 'in_progress' | 'completed' | 'archived'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('production_requests_event_idx').on(t.eventId),
]);

export const productionProjects = sqliteTable('production_projects', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().references(() => productionRequests.id, { onDelete: 'cascade' }),
  leadEngineerUserId: text('lead_engineer_user_id').references(() => users.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'on_hold' | 'completed'
  startDate: integer('start_date', { mode: 'timestamp' }),
  targetCompletionDate: integer('target_completion_date', { mode: 'timestamp' }),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// 6. CHURCH PARTNERSHIPS & SPONSORSHIPS
// ============================================================================

export const churchPartnerships = sqliteTable('church_partnerships', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  program: text('program').notNull(), // 'worship' | 'academy' | 'live' | 'production' | 'ecosystem'
  participationKind: text('participation_kind').notNull(), // 'host_facility' | 'resource_partner' | 'network_church'
  status: text('status').notNull().default('active'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  notes: text('notes'),
});

export const sponsorships = sqliteTable('sponsorships', {
  id: text('id').primaryKey(),
  sponsorOrgId: text('sponsor_org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  program: text('program').notNull(), // 'academy' | 'live' | 'worship' | 'general'
  targetType: text('target_type'), // 'class' | 'event' | 'student' | 'fund'
  targetId: text('target_id'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ============================================================================
// 7. FINANCIAL LEDGER & STRIPE WEBHOOKS (Nonprofit Categories)
// ============================================================================

export const stripeWebhookEvents = sqliteTable('stripe_webhook_events', {
  id: text('id').primaryKey(), // Stripe event id (e.g. evt_1...)
  eventType: text('event_type').notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }).notNull(),
  status: text('status').notNull().default('processed'), // 'processed' | 'failed' | 'ignored'
  errorMessage: text('error_message'),
});

export const paymentRecords = sqliteTable('payment_records', {
  id: text('id').primaryKey(),
  sessionId: text('session_id'), // Stripe Checkout Session ID
  paymentIntentId: text('payment_intent_id'),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('usd'),
  status: text('status').notNull().default('pending'), // 'pending' | 'succeeded' | 'failed' | 'refunded'
  sourceType: text('source_type').notNull(), // 'event_ticket' | 'academy_tuition' | 'church_gig'
  sourceId: text('source_id').notNull(),
  customerEmail: text('customer_email'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('payment_session_idx').on(t.sessionId),
  index('payment_intent_idx').on(t.paymentIntentId),
]);

export const ledgerEntries = sqliteTable('ledger_entries', {
  id: text('id').primaryKey(),
  category: text('category').notNull(), // 'charitable_contribution' | 'sponsorship' | 'program_service_receipt' | 'third_party_payable' | 'processing_cost' | 'refund'
  program: text('program').notNull(), // 'worship' | 'academy' | 'live' | 'production' | 'general'
  fundId: text('fund_id'), // Restricted vs unrestricted fund tracking
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('usd'),
  sourceType: text('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('ledger_category_idx').on(t.category),
  index('ledger_program_idx').on(t.program),
]);

// ============================================================================
// 8. MEDIA STORAGE METADATA & ACCESS POLICIES
// ============================================================================

export const mediaFiles = sqliteTable('media_files', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  scopeType: text('scope_type').notNull(), // 'event_poster' | 'musician_audition' | 'academy_sheet_music' | 'org_verification'
  scopeId: text('scope_id'),
  r2Key: text('r2_key').notNull().unique(),
  contentType: text('content_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  accessPolicy: text('access_policy').notNull().default('private'), // 'public_read' | 'private' | 'audition' | 'restricted'
  status: text('status').notNull().default('confirmed'), // 'pending_upload' | 'confirmed' | 'deleted'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('media_owner_idx').on(t.ownerUserId),
  index('media_scope_idx').on(t.scopeType, t.scopeId),
]);

// ============================================================================
// 9. AUDIT LOGS & STAFF REVIEWS
// ============================================================================

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // e.g. 'event.approved', 'ticket.scanned', 'payout.scheduled'
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  payloadJson: text('payload_json'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('audit_actor_idx').on(t.actorUserId),
  index('audit_entity_idx').on(t.entityType, t.entityId),
]);

export const moderationReviews = sqliteTable('moderation_reviews', {
  id: text('id').primaryKey(),
  reviewerUserId: text('reviewer_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(), // 'event' | 'organizer' | 'audition' | 'instructor'
  targetId: text('target_id').notNull(),
  decision: text('decision').notNull(), // 'approved' | 'rejected' | 'revision_requested'
  notes: text('notes'),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('mod_reviewer_idx').on(t.reviewerUserId),
  index('mod_target_idx').on(t.targetType, t.targetId),
]);

// Registration counters, immutable fields and outbox insertion are enforced by SQL triggers in migration 0003.
export const notificationJobs = sqliteTable('notification_jobs', {
  id: text('id').primaryKey(),
  registrationId: text('registration_id').notNull().unique().references(() => eventRegistrations.id, {onDelete: 'cascade'}),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: integer('created_at', {mode:'timestamp'}).notNull(),
  nextAttemptAt: integer('next_attempt_at', {mode:'timestamp'}).notNull(),
  sentAt: integer('sent_at', {mode:'timestamp'}),
  lastError: text('last_error'),
  providerMessageId: text('provider_message_id'),
});

// ============================================================================
// 10. GAMO LIVE STANDALONE PLATFORM (Artists, Agents, Bookings, Multi-Role Teams, Orders, Passes)
// ============================================================================

export const artistProfiles = sqliteTable('artist_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  musicianProfileId: text('musician_profile_id').references(() => musicianProfiles.id, { onDelete: 'set null' }),
  stageName: text('stage_name').notNull(),
  slug: text('slug').notNull().unique(),
  genre: text('genre').notNull().default('worship'),
  bio: text('bio'),
  homeCity: text('home_city'),
  homeState: text('home_state'),
  repertoireSummary: text('repertoire_summary'),
  mediaLinksJson: text('media_links_json'),
  availabilityStatus: text('availability_status').notNull().default('open'), // 'open' | 'limited' | 'unavailable'
  verificationStatus: text('verification_status').notNull().default('pending'), // 'pending' | 'verified' | 'rejected' | 'suspended'
  allowSelfBooking: integer('allow_self_booking', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('artist_user_idx').on(t.userId),
  index('artist_verification_idx').on(t.verificationStatus),
]);

export const artistRepresentatives = sqliteTable('artist_representatives', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  agencyName: text('agency_name').notNull(),
  roleKind: text('role_kind').notNull().default('booking_agent'), // 'booking_agent' | 'manager' | 'ministry_coordinator'
  verificationStatus: text('verification_status').notNull().default('pending'), // 'pending' | 'verified' | 'rejected' | 'suspended'
  contactEmail: text('contact_email').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('artist_rep_user_idx').on(t.userId),
]);

export const representationAuthorizations = sqliteTable('representation_authorizations', {
  id: text('id').primaryKey(),
  artistId: text('artist_id').notNull().references(() => artistProfiles.id, { onDelete: 'cascade' }),
  representativeId: text('representative_id').notNull().references(() => artistRepresentatives.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull().default('booking_and_negotiation'), // 'booking_only' | 'booking_and_negotiation' | 'full_management'
  exclusivity: text('exclusivity').notNull().default('non_exclusive'), // 'non_exclusive' | 'exclusive'
  territory: text('territory').notNull().default('US'),
  canViewFinancials: integer('can_view_financials', { mode: 'boolean' }).notNull().default(false),
  commissionRateBps: integer('commission_rate_bps').notNull().default(0),
  status: text('status').notNull().default('pending_artist_approval'), // 'pending_artist_approval' | 'active' | 'revoked' | 'expired'
  approvedByUserId: text('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  effectiveFrom: integer('effective_from', { mode: 'timestamp' }).notNull(),
  effectiveUntil: integer('effective_until', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  revokedByUserId: text('revoked_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  revocationReason: text('revocation_reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('rep_auth_artist_idx').on(t.artistId, t.status),
  index('rep_auth_rep_idx').on(t.representativeId, t.status),
]);

export const bookingInquiries = sqliteTable('booking_inquiries', {
  id: text('id').primaryKey(),
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  organizerId: text('organizer_id').notNull().references(() => organizerProfiles.id, { onDelete: 'cascade' }),
  artistId: text('artist_id').notNull().references(() => artistProfiles.id, { onDelete: 'cascade' }),
  targetRepresentativeId: text('target_representative_id').references(() => artistRepresentatives.id, { onDelete: 'set null' }),
  requestedByUserId: text('requested_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  proposedStartsAt: integer('proposed_starts_at', { mode: 'timestamp' }).notNull(),
  proposedEndsAt: integer('proposed_ends_at', { mode: 'timestamp' }),
  venueName: text('venue_name').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  performanceScope: text('performance_scope').notNull(),
  proposedArtistFeeCents: integer('proposed_artist_fee_cents').notNull().default(0),
  notes: text('notes'),
  status: text('status').notNull().default('open'), // 'open' | 'negotiating' | 'accepted' | 'declined' | 'expired' | 'canceled'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('booking_inq_artist_idx').on(t.artistId, t.status),
  index('booking_inq_organizer_idx').on(t.organizerId, t.status),
  index('booking_inq_rep_idx').on(t.targetRepresentativeId, t.status),
]);

export const bookingOffers = sqliteTable('booking_offers', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').notNull().references(() => bookingInquiries.id, { onDelete: 'cascade' }),
  offeredByUserId: text('offered_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  offeredByRole: text('offered_by_role').notNull(), // 'organizer' | 'artist' | 'representative'
  artistFeeCents: integer('artist_fee_cents').notNull(),
  agentCommissionCents: integer('agent_commission_cents').notNull().default(0),
  platformAdminAllocationCents: integer('platform_admin_allocation_cents').notNull().default(0),
  travelStipendCents: integer('travel_stipend_cents').notNull().default(0),
  performanceMinutes: integer('performance_minutes').notNull().default(60),
  termsSummary: text('terms_summary').notNull(),
  status: text('status').notNull().default('proposed'), // 'proposed' | 'countered' | 'accepted' | 'rejected' | 'withdrawn'
  acceptedByUserId: text('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  acceptedAt: integer('accepted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('booking_offers_inquiry_idx').on(t.inquiryId),
]);

export const performanceEngagements = sqliteTable('performance_engagements', {
  id: text('id').primaryKey(),
  inquiryId: text('inquiry_id').notNull().unique().references(() => bookingInquiries.id, { onDelete: 'cascade' }),
  acceptedOfferId: text('accepted_offer_id').notNull().unique().references(() => bookingOffers.id, { onDelete: 'restrict' }),
  eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
  organizerId: text('organizer_id').notNull().references(() => organizerProfiles.id, { onDelete: 'cascade' }),
  artistId: text('artist_id').notNull().references(() => artistProfiles.id, { onDelete: 'cascade' }),
  representativeId: text('representative_id').references(() => artistRepresentatives.id, { onDelete: 'set null' }),
  authorizationId: text('authorization_id').references(() => representationAuthorizations.id, { onDelete: 'set null' }),
  artistFeeCents: integer('artist_fee_cents').notNull(),
  agentCommissionCents: integer('agent_commission_cents').notNull().default(0),
  platformAdminAllocationCents: integer('platform_admin_allocation_cents').notNull().default(0),
  depositCollectionStatus: text('deposit_collection_status').notNull().default('disabled_pending_policy'),
  status: text('status').notNull().default('confirmed'), // 'confirmed' | 'completed' | 'disputed' | 'canceled'
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (t) => [
  index('engagements_artist_idx').on(t.artistId, t.status),
  index('engagements_event_idx').on(t.eventId),
]);

export const eventOrganizations = sqliteTable('event_organizations', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  participationRole: text('participation_role').notNull(), // 'owner' | 'lead_promoter' | 'host_venue' | 'co_organizer' | 'production_partner' | 'sponsor'
  isSponsoredLabelRequired: integer('is_sponsored_label_required', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('active'), // 'invited' | 'active' | 'revoked'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('event_org_role_unique').on(t.eventId, t.organizationId, t.participationRole),
  index('event_org_event_idx').on(t.eventId),
]);

export const eventTeamMembers = sqliteTable('event_team_members', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  role: text('role').notNull(), // 'event_owner' | 'lead_promoter' | 'host_venue' | 'co_organizer' | 'booking_agent' | 'production_coordinator' | 'ticketing_admin' | 'finance_contact' | 'door_scanner'
  canEditContent: integer('can_edit_content', { mode: 'boolean' }).notNull().default(false),
  canManageTicketing: integer('can_manage_ticketing', { mode: 'boolean' }).notNull().default(false),
  canApproveRefunds: integer('can_approve_refunds', { mode: 'boolean' }).notNull().default(false),
  canViewSettlement: integer('can_view_settlement', { mode: 'boolean' }).notNull().default(false),
  canNegotiateBooking: integer('can_negotiate_booking', { mode: 'boolean' }).notNull().default(false),
  canCoordinateProduction: integer('can_coordinate_production', { mode: 'boolean' }).notNull().default(false),
  canScanTickets: integer('can_scan_tickets', { mode: 'boolean' }).notNull().default(false),
  grantedByUserId: text('granted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('active'), // 'active' | 'revoked'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  uniqueIndex('event_team_user_role_unique').on(t.eventId, t.userId, t.role),
  index('event_team_event_idx').on(t.eventId, t.status),
  index('event_team_user_idx').on(t.userId, t.status),
]);

export const eventPerformers = sqliteTable('event_performers', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  artistId: text('artist_id').references(() => artistProfiles.id, { onDelete: 'set null' }),
  instructorId: text('instructor_id').references(() => instructorProfiles.id, { onDelete: 'set null' }),
  engagementId: text('engagement_id').references(() => performanceEngagements.id, { onDelete: 'set null' }),
  displayName: text('display_name').notNull(),
  billingOrder: integer('billing_order').notNull().default(1),
  roleLabel: text('role_label').notNull().default('Headliner'),
  setStartsAt: integer('set_starts_at', { mode: 'timestamp' }),
  setDurationMinutes: integer('set_duration_minutes'),
  isMinorShowcase: integer('is_minor_showcase', { mode: 'boolean' }).notNull().default(false),
  guardianConsentVerified: integer('guardian_consent_verified', { mode: 'boolean' }).notNull().default(false),
  guardianUserId: text('guardian_user_id').references(() => users.id, { onDelete: 'set null' }),
  safeguardingCleared: integer('safeguarding_cleared', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('confirmed'), // 'invited' | 'confirmed' | 'canceled'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('event_perf_event_idx').on(t.eventId, t.billingOrder),
  index('event_perf_artist_idx').on(t.artistId),
]);

export const ticketHolds = sqliteTable('ticket_holds', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  tierId: text('tier_id').notNull().references(() => ticketTiers.id, { onDelete: 'cascade' }),
  purchaserEmail: text('purchaser_email').notNull(),
  quantity: integer('quantity').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status').notNull().default('held'), // 'held' | 'converted' | 'expired' | 'released'
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('ticket_holds_event_tier_idx').on(t.eventId, t.tierId, t.status),
  index('ticket_holds_expires_idx').on(t.expiresAt, t.status),
]);

export const ticketOrders = sqliteTable('ticket_orders', {
  id: text('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  tierId: text('tier_id').references(() => ticketTiers.id, { onDelete: 'set null' }),
  holdId: text('hold_id').references(() => ticketHolds.id, { onDelete: 'set null' }),
  purchaserUserId: text('purchaser_user_id').references(() => users.id, { onDelete: 'set null' }),
  purchaserName: text('purchaser_name').notNull(),
  purchaserEmail: text('purchaser_email').notNull(),
  quantity: integer('quantity').notNull().default(1),
  orderKind: text('order_kind').notNull().default('free'), // 'free' | 'paid' | 'invitation'
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  processingFeeCents: integer('processing_fee_cents').notNull().default(0),
  platformAdminAllocationCents: integer('platform_admin_allocation_cents').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  organizerProceedsCents: integer('organizer_proceeds_cents').notNull().default(0),
  currency: text('currency').notNull().default('usd'),
  stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status').notNull().default('pending_payment'), // 'pending_payment' | 'pending_approval' | 'confirmed' | 'refunded' | 'partially_refunded' | 'disputed' | 'canceled'
  confirmedAt: integer('confirmed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('ticket_orders_event_idx').on(t.eventId, t.status),
  index('ticket_orders_email_idx').on(t.purchaserEmail),
  index('ticket_orders_session_idx').on(t.stripeCheckoutSessionId),
]);

export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => ticketOrders.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  tierId: text('tier_id').references(() => ticketTiers.id, { onDelete: 'set null' }),
  registrationId: text('registration_id').references(() => eventRegistrations.id, { onDelete: 'set null' }),
  holderName: text('holder_name').notNull(),
  holderEmail: text('holder_email').notNull(),
  qrToken: text('qr_token').notNull().unique(),
  qrSignatureHash: text('qr_signature_hash').notNull(),
  status: text('status').notNull().default('valid'), // 'valid' | 'checked_in' | 'refunded' | 'voided'
  checkedInAt: integer('checked_in_at', { mode: 'timestamp' }),
  checkedInByUserId: text('checked_in_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('tickets_order_idx').on(t.orderId),
  index('tickets_event_idx').on(t.eventId, t.status),
  index('tickets_email_idx').on(t.holderEmail),
]);

export const ticketScans = sqliteTable('ticket_scans', {
  id: text('id').primaryKey(),
  ticketId: text('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  registrationId: text('registration_id').references(() => eventRegistrations.id, { onDelete: 'set null' }),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  scannedByUserId: text('scanned_by_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  qrTokenHash: text('qr_token_hash').notNull(),
  outcome: text('outcome').notNull(), // 'admitted' | 'replay_blocked' | 'invalid_token' | 'wrong_event' | 'refunded_or_void'
  gateLabel: text('gate_label'),
  notes: text('notes'),
  scannedAt: integer('scanned_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('ticket_scans_event_idx').on(t.eventId, t.scannedAt),
  index('ticket_scans_ticket_idx').on(t.ticketId),
]);

export const refundRecords = sqliteTable('refund_records', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => ticketOrders.id, { onDelete: 'cascade' }),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  requestedByEmail: text('requested_by_email').notNull(),
  approvedByUserId: text('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason').notNull(),
  stripeRefundId: text('stripe_refund_id'),
  status: text('status').notNull().default('requested'), // 'requested' | 'approved' | 'processed' | 'rejected'
  processedAt: integer('processed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('refund_records_order_idx').on(t.orderId),
  index('refund_records_event_idx').on(t.eventId, t.status),
]);

export const settlementRecords = sqliteTable('settlement_records', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  organizerId: text('organizer_id').notNull().references(() => organizerProfiles.id, { onDelete: 'cascade' }),
  grossReceiptsCents: integer('gross_receipts_cents').notNull().default(0),
  refundsCents: integer('refunds_cents').notNull().default(0),
  processingFeesCents: integer('processing_fees_cents').notNull().default(0),
  platformAdminAllocationCents: integer('platform_admin_allocation_cents').notNull().default(0),
  taxWithheldCents: integer('tax_withheld_cents').notNull().default(0),
  performerPayablesCents: integer('performer_payables_cents').notNull().default(0),
  agentCommissionsCents: integer('agent_commissions_cents').notNull().default(0),
  netOrganizerProceedsCents: integer('net_organizer_proceeds_cents').notNull().default(0),
  status: text('status').notNull().default('draft'), // 'draft' | 'reconciled' | 'disputed' | 'settled_sandbox'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('settlement_event_idx').on(t.eventId),
]);

/** Mission participation inquiries are review requests, never approved partnerships. */
export const participationInquiries = sqliteTable('participation_inquiries', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
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
}, (t) => [index('participation_user_idx').on(t.userId, t.createdAt), index('participation_status_idx').on(t.status, t.createdAt)]);

export const externalListingRevisions = sqliteTable('external_listing_revisions', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  importKey: text('import_key').notNull(),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // 'imported' | 'reimported' | 'reviewed' | 'approved' | 'published' | 'archived' | 'canceled' | 'rejected'
  previousEditorialStatus: text('previous_editorial_status'),
  nextEditorialStatus: text('next_editorial_status').notNull(),
  externalUrl: text('external_url'),
  sourceUrlsJson: text('source_urls_json'),
  notes: text('notes'),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('external_revisions_event_idx').on(t.eventId, t.createdAt),
  index('external_revisions_import_key_idx').on(t.importKey, t.createdAt),
]);

export const externalOutboundClicks = sqliteTable('external_outbound_clicks', {
  id: text('id').primaryKey(),
  eventId: text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  metroSlug: text('metro_slug'),
  providerName: text('provider_name'),
  destinationKind: text('destination_kind'),
  referrerSurface: text('referrer_surface').notNull().default('event_detail'),
  clickedAt: integer('clicked_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('external_clicks_event_idx').on(t.eventId, t.clickedAt),
]);


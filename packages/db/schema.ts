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
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (t) => [
  index('sessions_user_idx').on(t.userId),
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
}, (t) => [
  index('events_organizer_idx').on(t.organizerId),
  index('events_status_idx').on(t.status),
  index('events_starts_at_idx').on(t.startsAt),
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
  contactUserId: text('contact_user_id').notNull().references(() => users.id),
  category: text('category').notNull(), // 'audio' | 'livestream' | 'lighting' | 'acoustic' | 'training'
  scopeSummary: text('scope_summary').notNull(),
  status: text('status').notNull().default('submitted'), // 'submitted' | 'in_review' | 'scheduled' | 'in_progress' | 'completed' | 'archived'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

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

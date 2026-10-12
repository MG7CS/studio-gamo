import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  verifiedEmailAt: integer('verified_email_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
});

export const userRoles = sqliteTable('user_roles', {
  userId: text('user_id').notNull().references(() => users.id),
  roleId: text('role_id').notNull().references(() => roles.id),
  scopeType: text('scope_type'),
  scopeId: text('scope_id'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
});

export const musicianProfiles = sqliteTable('musician_profiles', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  status: text('status').notNull().default('pending'), // pending, approved, rejected
  bio: text('bio'),
  homeZone: text('home_zone'),
  travelRadiusMiles: integer('travel_radius_miles'),
});

export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  musicianId: text('musician_id').references(() => musicianProfiles.id),
  step: text('step').notNull().default('identity'),
  status: text('status').notNull().default('draft'),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }),
});

export const churches = sqliteTable('churches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  serviceZone: text('service_zone'),
  contactUserId: text('contact_user_id').notNull().references(() => users.id),
});

export const gigs = sqliteTable('gigs', {
  id: text('id').primaryKey(),
  churchId: text('church_id').notNull().references(() => churches.id),
  plan: text('plan').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }).notNull(),
  rehearsalAt: integer('rehearsal_at', { mode: 'timestamp' }),
  status: text('status').notNull().default('draft'),
  locationZone: text('location_zone'),
});

export const gigPositions = sqliteTable('gig_positions', {
  id: text('id').primaryKey(),
  gigId: text('gig_id').notNull().references(() => gigs.id),
  instrument: text('instrument').notNull(),
  status: text('status').notNull().default('open'),
});

export const gigAssignments = sqliteTable('gig_assignments', {
  id: text('id').primaryKey(),
  positionId: text('position_id').notNull().references(() => gigPositions.id),
  musicianId: text('musician_id').notNull().references(() => musicianProfiles.id),
  kind: text('kind').notNull(), // 'primary' | 'standby'
  status: text('status').notNull().default('assigned'), // assigned, confirmed, check-in_failed
  confirmationDeadline: integer('confirmation_deadline', { mode: 'timestamp' }),
});

export const checkins = sqliteTable('checkins', {
  id: text('id').primaryKey(),
  assignmentId: text('assignment_id').notNull().references(() => gigAssignments.id),
  status: text('status').notNull(),
  recordedAt: integer('recorded_at', { mode: 'timestamp' }).notNull(),
});

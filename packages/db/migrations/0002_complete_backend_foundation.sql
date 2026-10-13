-- Gamo Studios D1 Migration 0002: Complete Backend Foundation
-- Adds missing columns, creates organizations, academy, live events, production, ledger, and audit entities.

-- 1. Updates to existing core tables
ALTER TABLE `users` ADD COLUMN `display_name` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `ip_hash` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `user_agent` text;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `created_at` integer NOT NULL DEFAULT (unixepoch());
--> statement-breakpoint
ALTER TABLE `roles` ADD COLUMN `description` text;
--> statement-breakpoint
ALTER TABLE `user_roles` ADD COLUMN `id` text;
--> statement-breakpoint
ALTER TABLE `user_roles` ADD COLUMN `created_at` integer NOT NULL DEFAULT (unixepoch());
--> statement-breakpoint
ALTER TABLE `musician_profiles` ADD COLUMN `created_at` integer NOT NULL DEFAULT (unixepoch());
--> statement-breakpoint
ALTER TABLE `applications` ADD COLUMN `review_notes` text;
--> statement-breakpoint
ALTER TABLE `churches` ADD COLUMN `organization_id` text REFERENCES `organizations`(`id`);
--> statement-breakpoint
ALTER TABLE `churches` ADD COLUMN `address` text;
--> statement-breakpoint
ALTER TABLE `churches` ADD COLUMN `created_at` integer NOT NULL DEFAULT (unixepoch());
--> statement-breakpoint
ALTER TABLE `gigs` ADD COLUMN `notes` text;
--> statement-breakpoint
ALTER TABLE `gigs` ADD COLUMN `created_at` integer NOT NULL DEFAULT (unixepoch());
--> statement-breakpoint
ALTER TABLE `gig_positions` ADD COLUMN `agreed_pay_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `gig_positions` ADD COLUMN `admin_allocation_cents` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `gig_assignments` ADD COLUMN `assigned_at` integer NOT NULL DEFAULT (unixepoch());
--> statement-breakpoint
ALTER TABLE `checkins` ADD COLUMN `notes` text;
--> statement-breakpoint

-- 2. Organizations & Memberships
CREATE TABLE IF NOT EXISTS `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`type` text NOT NULL,
	`verified_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `org_member_unique` ON `organization_members` (`organization_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `org_member_user_idx` ON `organization_members` (`user_id`);
--> statement-breakpoint

-- 3. Worship Skills & Standby Dispatches
CREATE TABLE IF NOT EXISTS `musician_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`musician_id` text NOT NULL,
	`instrument` text NOT NULL,
	`proficiency` text DEFAULT 'intermediate' NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`musician_id`) REFERENCES `musician_profiles`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `musician_skills_idx` ON `musician_skills` (`musician_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `standby_dispatches` (
	`id` text PRIMARY KEY NOT NULL,
	`gig_id` text NOT NULL,
	`failed_assignment_id` text NOT NULL,
	`standby_assignment_id` text NOT NULL,
	`status` text DEFAULT 'alerted' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`gig_id`) REFERENCES `gigs`(`id`) ON DELETE cascade,
	FOREIGN KEY (`failed_assignment_id`) REFERENCES `gig_assignments`(`id`),
	FOREIGN KEY (`standby_assignment_id`) REFERENCES `gig_assignments`(`id`)
);
--> statement-breakpoint

-- 4. Gamo Academy
CREATE TABLE IF NOT EXISTS `instructor_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bio` text,
	`specialties` text,
	`background_check_status` text DEFAULT 'pending' NOT NULL,
	`cleared_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `instructor_user_idx` ON `instructor_profiles` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`instructor_id` text NOT NULL,
	`host_org_id` text,
	`title` text NOT NULL,
	`description` text,
	`instrument` text NOT NULL,
	`level` text DEFAULT 'beginner' NOT NULL,
	`capacity` integer DEFAULT 1 NOT NULL,
	`duration_minutes` integer DEFAULT 45 NOT NULL,
	`suggested_tuition_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instructor_id`) REFERENCES `instructor_profiles`(`id`) ON DELETE cascade,
	FOREIGN KEY (`host_org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `classes_instructor_idx` ON `classes` (`instructor_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`student_user_id` text NOT NULL,
	`guardian_user_id` text,
	`funding_source` text DEFAULT 'tuition' NOT NULL,
	`agreed_tuition_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`enrolled_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade,
	FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
	FOREIGN KEY (`guardian_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `enrollments_class_idx` ON `enrollments` (`class_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `enrollments_student_idx` ON `enrollments` (`student_user_id`);
--> statement-breakpoint

-- 5. Gamo Live
CREATE TABLE IF NOT EXISTS `organizer_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text DEFAULT 'church' NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`ticketing_authorized_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `organizer_org_idx` ON `organizer_profiles` (`organization_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `events` (
	`id` text PRIMARY KEY NOT NULL,
	`organizer_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`category` text NOT NULL,
	`tagline` text,
	`description` text NOT NULL,
	`venue_name` text NOT NULL,
	`address` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`timezone` text DEFAULT 'America/Phoenix' NOT NULL,
	`admission_type` text DEFAULT 'free' NOT NULL,
	`photo_key` text,
	`external_url` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organizer_id`) REFERENCES `organizer_profiles`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `events_organizer_idx` ON `events` (`organizer_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `events_status_idx` ON `events` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `events_starts_at_idx` ON `events` (`starts_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `event_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `occurrences_event_idx` ON `event_occurrences` (`event_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ticket_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`capacity` integer DEFAULT 100 NOT NULL,
	`reserved_count` integer DEFAULT 0 NOT NULL,
	`note` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ticket_tiers_event_idx` ON `ticket_tiers` (`event_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `event_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`tier_id` text,
	`user_id` text,
	`attendee_name` text NOT NULL,
	`attendee_email` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`qr_token` text NOT NULL UNIQUE,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`checked_in_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade,
	FOREIGN KEY (`tier_id`) REFERENCES `ticket_tiers`(`id`) ON DELETE SET NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reg_event_idx` ON `event_registrations` (`event_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `reg_email_idx` ON `event_registrations` (`attendee_email`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `reg_event_email_unique` ON `event_registrations` (`event_id`, `attendee_email`);
--> statement-breakpoint

-- 6. Gamo Production
CREATE TABLE IF NOT EXISTS `production_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`church_org_id` text,
	`contact_user_id` text NOT NULL,
	`category` text NOT NULL,
	`scope_summary` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`church_org_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL,
	FOREIGN KEY (`contact_user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `production_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`lead_engineer_user_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`start_date` integer,
	`target_completion_date` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `production_requests`(`id`) ON DELETE cascade,
	FOREIGN KEY (`lead_engineer_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint

-- 7. Church Partnerships & Sponsorships
CREATE TABLE IF NOT EXISTS `church_partnerships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`program` text NOT NULL,
	`participation_kind` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sponsorships` (
	`id` text PRIMARY KEY NOT NULL,
	`sponsor_org_id` text NOT NULL,
	`program` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sponsor_org_id`) REFERENCES `organizations`(`id`) ON DELETE cascade
);
--> statement-breakpoint

-- 8. Financial Ledger & Webhooks
CREATE TABLE IF NOT EXISTS `stripe_webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`processed_at` integer NOT NULL,
	`status` text DEFAULT 'processed' NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `payment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`payment_intent_id` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`customer_email` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_session_idx` ON `payment_records` (`session_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_intent_idx` ON `payment_records` (`payment_intent_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`program` text NOT NULL,
	`fund_id` text,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ledger_category_idx` ON `ledger_entries` (`category`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ledger_program_idx` ON `ledger_entries` (`program`);
--> statement-breakpoint

-- 9. Media Files
CREATE TABLE IF NOT EXISTS `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text,
	`r2_key` text NOT NULL UNIQUE,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`access_policy` text DEFAULT 'private' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_owner_idx` ON `media_files` (`owner_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_scope_idx` ON `media_files` (`scope_type`, `scope_id`);
--> statement-breakpoint

-- 10. Audit Logs & Moderation Reviews
CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`payload_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_actor_idx` ON `audit_logs` (`actor_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_entity_idx` ON `audit_logs` (`entity_type`, `entity_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `moderation_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`decision` text NOT NULL,
	`notes` text,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mod_reviewer_idx` ON `moderation_reviews` (`reviewer_user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `mod_target_idx` ON `moderation_reviews` (`target_type`, `target_id`);

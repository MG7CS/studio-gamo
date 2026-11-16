-- 0019: remove public accounts and legacy demo tables (owner-approved 2026-11-16, destructive; production
-- holds only test data). Plan: docs/superpowers/plans/2026-11-16-forms-emails-invoices.md, Task 1.4.
-- Public sign-in (emailed codes, Clerk), product accounts, organizations, provider profiles and their
-- staff review, participation inquiries and the never-used 0000/0001 demo tables (musicians, gigs,
-- check-ins, standby, instructors, classes, enrollments, churches, partnerships, sponsorships) go away.
--
-- Kept on purpose:
--   persons             users.person_id, customer_profiles.person_id and terms_acceptances.person_id
--                       reference it (SQLite cannot drop a foreign-key column without a table rebuild);
--   external_identities binds the Cloudflare Access subject of staff (provisioning, boundary check);
--   customer_sessions, marketing_consents, moderation_reviews, media_files: read by kept code.
--
-- Order matters because D1 enforces foreign keys and DROP TABLE runs an implicit DELETE first:
-- (1) drop every trigger on the doomed tables (verification_records refuses DELETE; provider_profiles
--     guards updates); no trigger on a kept table reads a dropped table;
-- (2) drop tables children-first (no kept table references any of them).
-- Indexes go with their tables. Each statement is on one line (Wrangler remote splitter rule).
DROP TRIGGER IF EXISTS provider_publish_gate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS provider_publish_gate_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS provider_identity_immutable;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_records_no_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS verification_records_no_delete;
--> statement-breakpoint
DROP TABLE IF EXISTS checkins;
--> statement-breakpoint
DROP TABLE IF EXISTS standby_dispatches;
--> statement-breakpoint
DROP TABLE IF EXISTS gig_assignments;
--> statement-breakpoint
DROP TABLE IF EXISTS gig_positions;
--> statement-breakpoint
DROP TABLE IF EXISTS gigs;
--> statement-breakpoint
DROP TABLE IF EXISTS applications;
--> statement-breakpoint
DROP TABLE IF EXISTS musician_skills;
--> statement-breakpoint
DROP TABLE IF EXISTS musician_profiles;
--> statement-breakpoint
DROP TABLE IF EXISTS enrollments;
--> statement-breakpoint
DROP TABLE IF EXISTS classes;
--> statement-breakpoint
DROP TABLE IF EXISTS instructor_profiles;
--> statement-breakpoint
DROP TABLE IF EXISTS churches;
--> statement-breakpoint
DROP TABLE IF EXISTS church_partnerships;
--> statement-breakpoint
DROP TABLE IF EXISTS sponsorships;
--> statement-breakpoint
DROP TABLE IF EXISTS participation_inquiries;
--> statement-breakpoint
DROP TABLE IF EXISTS verification_records;
--> statement-breakpoint
DROP TABLE IF EXISTS provider_profiles;
--> statement-breakpoint
DROP TABLE IF EXISTS organization_members;
--> statement-breakpoint
DROP TABLE IF EXISTS organizations;
--> statement-breakpoint
DROP TABLE IF EXISTS clerk_identity_links;
--> statement-breakpoint
DROP TABLE IF EXISTS product_accounts;
--> statement-breakpoint
DROP TABLE IF EXISTS auth_challenges;

-- ============================================================================
-- Migration 0006: Gamo Live Standalone Platform Schema & Integrity Triggers
-- ============================================================================

-- 1. Artist Profiles (linked optionally to musician_profiles without coupling rankings)
CREATE TABLE `artist_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `musician_profile_id` text REFERENCES `musician_profiles`(`id`) ON DELETE SET NULL,
  `stage_name` text NOT NULL,
  `slug` text NOT NULL UNIQUE,
  `genre` text NOT NULL DEFAULT 'worship',
  `bio` text,
  `home_city` text,
  `home_state` text,
  `repertoire_summary` text,
  `media_links_json` text,
  `availability_status` text NOT NULL DEFAULT 'open',
  `verification_status` text NOT NULL DEFAULT 'pending',
  `allow_self_booking` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL
);
CREATE INDEX `artist_user_idx` ON `artist_profiles` (`user_id`);
CREATE INDEX `artist_verification_idx` ON `artist_profiles` (`verification_status`);

-- 2. Artist Representatives (Booking Agents & Managers)
CREATE TABLE `artist_representatives` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `organization_id` text REFERENCES `organizations`(`id`) ON DELETE SET NULL,
  `agency_name` text NOT NULL,
  `role_kind` text NOT NULL DEFAULT 'booking_agent',
  `verification_status` text NOT NULL DEFAULT 'pending',
  `contact_email` text NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `artist_rep_user_idx` ON `artist_representatives` (`user_id`);

-- 3. Representation Authorizations (Scoped, Audited, Conflict-Checked)
CREATE TABLE `representation_authorizations` (
  `id` text PRIMARY KEY NOT NULL,
  `artist_id` text NOT NULL REFERENCES `artist_profiles`(`id`) ON DELETE CASCADE,
  `representative_id` text NOT NULL REFERENCES `artist_representatives`(`id`) ON DELETE CASCADE,
  `scope` text NOT NULL DEFAULT 'booking_and_negotiation',
  `exclusivity` text NOT NULL DEFAULT 'non_exclusive',
  `territory` text NOT NULL DEFAULT 'US',
  `can_view_financials` integer NOT NULL DEFAULT 0,
  `commission_rate_bps` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'pending_artist_approval',
  `approved_by_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `effective_from` integer NOT NULL,
  `effective_until` integer,
  `revoked_at` integer,
  `revoked_by_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `revocation_reason` text,
  `created_at` integer NOT NULL
);
CREATE INDEX `rep_auth_artist_idx` ON `representation_authorizations` (`artist_id`, `status`);
CREATE INDEX `rep_auth_rep_idx` ON `representation_authorizations` (`representative_id`, `status`);

CREATE TRIGGER `rep_auth_exclusive_conflict_insert`
BEFORE INSERT ON `representation_authorizations`
WHEN NEW.`status` = 'active'
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM `representation_authorizations` existing
      WHERE existing.`artist_id` = NEW.`artist_id`
        AND existing.`status` = 'active'
        AND (existing.`exclusivity` = 'exclusive' OR NEW.`exclusivity` = 'exclusive')
        AND (existing.`territory` = NEW.`territory` OR existing.`territory` = 'US' OR NEW.`territory` = 'US')
    )
    THEN RAISE(ABORT, 'REP_EXCLUSIVE_CONFLICT')
  END;
END;

CREATE TRIGGER `rep_auth_exclusive_conflict_update`
BEFORE UPDATE ON `representation_authorizations`
WHEN NEW.`status` = 'active'
BEGIN
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM `representation_authorizations` existing
      WHERE existing.`artist_id` = NEW.`artist_id`
        AND existing.`id` != NEW.`id`
        AND existing.`status` = 'active'
        AND (existing.`exclusivity` = 'exclusive' OR NEW.`exclusivity` = 'exclusive')
        AND (existing.`territory` = NEW.`territory` OR existing.`territory` = 'US' OR NEW.`territory` = 'US')
    )
    THEN RAISE(ABORT, 'REP_EXCLUSIVE_CONFLICT')
  END;
END;

-- 4. Booking Inquiries
CREATE TABLE `booking_inquiries` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text REFERENCES `events`(`id`) ON DELETE SET NULL,
  `organizer_id` text NOT NULL REFERENCES `organizer_profiles`(`id`) ON DELETE CASCADE,
  `artist_id` text NOT NULL REFERENCES `artist_profiles`(`id`) ON DELETE CASCADE,
  `target_representative_id` text REFERENCES `artist_representatives`(`id`) ON DELETE SET NULL,
  `requested_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `proposed_starts_at` integer NOT NULL,
  `proposed_ends_at` integer,
  `venue_name` text NOT NULL,
  `city` text NOT NULL,
  `state` text NOT NULL,
  `performance_scope` text NOT NULL,
  `proposed_artist_fee_cents` integer NOT NULL DEFAULT 0,
  `notes` text,
  `status` text NOT NULL DEFAULT 'open',
  `created_at` integer NOT NULL
);
CREATE INDEX `booking_inq_artist_idx` ON `booking_inquiries` (`artist_id`, `status`);
CREATE INDEX `booking_inq_organizer_idx` ON `booking_inquiries` (`organizer_id`, `status`);
CREATE INDEX `booking_inq_rep_idx` ON `booking_inquiries` (`target_representative_id`, `status`);

-- 5. Booking Offers & Counteroffers (Separating Artist Fee, Agent Commission, Platform Allocation)
CREATE TABLE `booking_offers` (
  `id` text PRIMARY KEY NOT NULL,
  `inquiry_id` text NOT NULL REFERENCES `booking_inquiries`(`id`) ON DELETE CASCADE,
  `offered_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `offered_by_role` text NOT NULL,
  `artist_fee_cents` integer NOT NULL,
  `agent_commission_cents` integer NOT NULL DEFAULT 0,
  `platform_admin_allocation_cents` integer NOT NULL DEFAULT 0,
  `travel_stipend_cents` integer NOT NULL DEFAULT 0,
  `performance_minutes` integer NOT NULL DEFAULT 60,
  `terms_summary` text NOT NULL,
  `status` text NOT NULL DEFAULT 'proposed',
  `accepted_by_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `accepted_at` integer,
  `created_at` integer NOT NULL
);
CREATE INDEX `booking_offers_inquiry_idx` ON `booking_offers` (`inquiry_id`);

CREATE TRIGGER `booking_offer_immutable_accepted`
BEFORE UPDATE ON `booking_offers`
WHEN OLD.`status` = 'accepted'
BEGIN
  SELECT RAISE(ABORT, 'BOOKING_OFFER_IMMUTABLE');
END;

-- 6. Confirmed Performance Engagements (Deposits disabled until policy gate approved)
CREATE TABLE `performance_engagements` (
  `id` text PRIMARY KEY NOT NULL,
  `inquiry_id` text NOT NULL UNIQUE REFERENCES `booking_inquiries`(`id`) ON DELETE CASCADE,
  `accepted_offer_id` text NOT NULL UNIQUE REFERENCES `booking_offers`(`id`) ON DELETE RESTRICT,
  `event_id` text REFERENCES `events`(`id`) ON DELETE SET NULL,
  `organizer_id` text NOT NULL REFERENCES `organizer_profiles`(`id`) ON DELETE CASCADE,
  `artist_id` text NOT NULL REFERENCES `artist_profiles`(`id`) ON DELETE CASCADE,
  `representative_id` text REFERENCES `artist_representatives`(`id`) ON DELETE SET NULL,
  `authorization_id` text REFERENCES `representation_authorizations`(`id`) ON DELETE SET NULL,
  `artist_fee_cents` integer NOT NULL,
  `agent_commission_cents` integer NOT NULL DEFAULT 0,
  `platform_admin_allocation_cents` integer NOT NULL DEFAULT 0,
  `deposit_collection_status` text NOT NULL DEFAULT 'disabled_pending_policy',
  `status` text NOT NULL DEFAULT 'confirmed',
  `confirmed_at` integer NOT NULL,
  `completed_at` integer
);
CREATE INDEX `engagements_artist_idx` ON `performance_engagements` (`artist_id`, `status`);
CREATE INDEX `engagements_event_idx` ON `performance_engagements` (`event_id`);

CREATE TRIGGER `engagement_deposit_gate_insert`
BEFORE INSERT ON `performance_engagements`
WHEN NEW.`deposit_collection_status` != 'disabled_pending_policy'
BEGIN
  SELECT RAISE(ABORT, 'DEPOSIT_COLLECTION_DISABLED');
END;

CREATE TRIGGER `engagement_deposit_gate_update`
BEFORE UPDATE ON `performance_engagements`
WHEN NEW.`deposit_collection_status` != 'disabled_pending_policy'
BEGIN
  SELECT RAISE(ABORT, 'DEPOSIT_COLLECTION_DISABLED');
END;

-- 7. Event Organizations (Many-to-Many Co-Organizers, Venues, Promoters, Sponsors)
CREATE TABLE `event_organizations` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `participation_role` text NOT NULL,
  `is_sponsored_label_required` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `event_org_role_unique` ON `event_organizations` (`event_id`, `organization_id`, `participation_role`);
CREATE INDEX `event_org_event_idx` ON `event_organizations` (`event_id`);

-- 8. Event Team Members (Granular Role-Scoped Permissions per Event)
CREATE TABLE `event_team_members` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `organization_id` text REFERENCES `organizations`(`id`) ON DELETE SET NULL,
  `role` text NOT NULL,
  `can_edit_content` integer NOT NULL DEFAULT 0,
  `can_manage_ticketing` integer NOT NULL DEFAULT 0,
  `can_approve_refunds` integer NOT NULL DEFAULT 0,
  `can_view_settlement` integer NOT NULL DEFAULT 0,
  `can_negotiate_booking` integer NOT NULL DEFAULT 0,
  `can_coordinate_production` integer NOT NULL DEFAULT 0,
  `can_scan_tickets` integer NOT NULL DEFAULT 0,
  `granted_by_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `status` text NOT NULL DEFAULT 'active',
  `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `event_team_user_role_unique` ON `event_team_members` (`event_id`, `user_id`, `role`);
CREATE INDEX `event_team_event_idx` ON `event_team_members` (`event_id`, `status`);
CREATE INDEX `event_team_user_idx` ON `event_team_members` (`user_id`, `status`);

-- 9. Event Performers (Lineup & Academy Youth Recital Safeguarding)
CREATE TABLE `event_performers` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `artist_id` text REFERENCES `artist_profiles`(`id`) ON DELETE SET NULL,
  `instructor_id` text REFERENCES `instructor_profiles`(`id`) ON DELETE SET NULL,
  `engagement_id` text REFERENCES `performance_engagements`(`id`) ON DELETE SET NULL,
  `display_name` text NOT NULL,
  `billing_order` integer NOT NULL DEFAULT 1,
  `role_label` text NOT NULL DEFAULT 'Headliner',
  `set_starts_at` integer,
  `set_duration_minutes` integer,
  `is_minor_showcase` integer NOT NULL DEFAULT 0,
  `guardian_consent_verified` integer NOT NULL DEFAULT 0,
  `guardian_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `safeguarding_cleared` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'confirmed',
  `created_at` integer NOT NULL
);
CREATE INDEX `event_perf_event_idx` ON `event_performers` (`event_id`, `billing_order`);
CREATE INDEX `event_perf_artist_idx` ON `event_performers` (`artist_id`);

CREATE TRIGGER `event_performer_minor_safeguarding_insert`
BEFORE INSERT ON `event_performers`
WHEN NEW.`is_minor_showcase` = 1
  AND (NEW.`guardian_consent_verified` != 1 OR NEW.`guardian_user_id` IS NULL OR NEW.`safeguarding_cleared` != 1)
BEGIN
  SELECT RAISE(ABORT, 'MINOR_SAFEGUARDING_REQUIRED');
END;

CREATE TRIGGER `event_performer_minor_safeguarding_update`
BEFORE UPDATE ON `event_performers`
WHEN NEW.`is_minor_showcase` = 1
  AND (NEW.`guardian_consent_verified` != 1 OR NEW.`guardian_user_id` IS NULL OR NEW.`safeguarding_cleared` != 1)
BEGIN
  SELECT RAISE(ABORT, 'MINOR_SAFEGUARDING_REQUIRED');
END;

-- 10. Ticket Holds (Expiring Inventory Holds for Atomic Reservation)
CREATE TABLE `ticket_holds` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `tier_id` text NOT NULL REFERENCES `ticket_tiers`(`id`) ON DELETE CASCADE,
  `purchaser_email` text NOT NULL,
  `quantity` integer NOT NULL,
  `idempotency_key` text NOT NULL UNIQUE,
  `status` text NOT NULL DEFAULT 'held',
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `ticket_holds_event_tier_idx` ON `ticket_holds` (`event_id`, `tier_id`, `status`);
CREATE INDEX `ticket_holds_expires_idx` ON `ticket_holds` (`expires_at`, `status`);

-- 11. Ticket Orders (Durable Orders with Explicit Line-Item Separation)
CREATE TABLE `ticket_orders` (
  `id` text PRIMARY KEY NOT NULL,
  `order_number` text NOT NULL UNIQUE,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `tier_id` text REFERENCES `ticket_tiers`(`id`) ON DELETE SET NULL,
  `hold_id` text REFERENCES `ticket_holds`(`id`) ON DELETE SET NULL,
  `purchaser_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `purchaser_name` text NOT NULL,
  `purchaser_email` text NOT NULL,
  `quantity` integer NOT NULL DEFAULT 1,
  `order_kind` text NOT NULL DEFAULT 'free',
  `subtotal_cents` integer NOT NULL DEFAULT 0,
  `processing_fee_cents` integer NOT NULL DEFAULT 0,
  `platform_admin_allocation_cents` integer NOT NULL DEFAULT 0,
  `tax_cents` integer NOT NULL DEFAULT 0,
  `total_cents` integer NOT NULL DEFAULT 0,
  `organizer_proceeds_cents` integer NOT NULL DEFAULT 0,
  `currency` text NOT NULL DEFAULT 'usd',
  `stripe_checkout_session_id` text UNIQUE,
  `stripe_payment_intent_id` text,
  `idempotency_key` text NOT NULL UNIQUE,
  `status` text NOT NULL DEFAULT 'pending_payment',
  `confirmed_at` integer,
  `created_at` integer NOT NULL
);
CREATE INDEX `ticket_orders_event_idx` ON `ticket_orders` (`event_id`, `status`);
CREATE INDEX `ticket_orders_email_idx` ON `ticket_orders` (`purchaser_email`);
CREATE INDEX `ticket_orders_session_idx` ON `ticket_orders` (`stripe_checkout_session_id`);

-- 12. Tickets (Tamper-Resistant QR Credentials)
CREATE TABLE `tickets` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL REFERENCES `ticket_orders`(`id`) ON DELETE CASCADE,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `tier_id` text REFERENCES `ticket_tiers`(`id`) ON DELETE SET NULL,
  `registration_id` text REFERENCES `event_registrations`(`id`) ON DELETE SET NULL,
  `holder_name` text NOT NULL,
  `holder_email` text NOT NULL,
  `qr_token` text NOT NULL UNIQUE,
  `qr_signature_hash` text NOT NULL,
  `status` text NOT NULL DEFAULT 'valid',
  `checked_in_at` integer,
  `checked_in_by_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL
);
CREATE INDEX `tickets_order_idx` ON `tickets` (`order_id`);
CREATE INDEX `tickets_event_idx` ON `tickets` (`event_id`, `status`);
CREATE INDEX `tickets_email_idx` ON `tickets` (`holder_email`);

-- 13. Ticket Scans (Audit Trail & Replay Prevention)
CREATE TABLE `ticket_scans` (
  `id` text PRIMARY KEY NOT NULL,
  `ticket_id` text REFERENCES `tickets`(`id`) ON DELETE SET NULL,
  `registration_id` text REFERENCES `event_registrations`(`id`) ON DELETE SET NULL,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `scanned_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `qr_token_hash` text NOT NULL,
  `outcome` text NOT NULL,
  `gate_label` text,
  `notes` text,
  `scanned_at` integer NOT NULL
);
CREATE INDEX `ticket_scans_event_idx` ON `ticket_scans` (`event_id`, `scanned_at`);
CREATE INDEX `ticket_scans_ticket_idx` ON `ticket_scans` (`ticket_id`);

-- 14. Refund Records
CREATE TABLE `refund_records` (
  `id` text PRIMARY KEY NOT NULL,
  `order_id` text NOT NULL REFERENCES `ticket_orders`(`id`) ON DELETE CASCADE,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `requested_by_email` text NOT NULL,
  `approved_by_user_id` text REFERENCES `users`(`id`) ON DELETE SET NULL,
  `amount_cents` integer NOT NULL,
  `reason` text NOT NULL,
  `stripe_refund_id` text,
  `status` text NOT NULL DEFAULT 'requested',
  `processed_at` integer,
  `created_at` integer NOT NULL
);
CREATE INDEX `refund_records_order_idx` ON `refund_records` (`order_id`);
CREATE INDEX `refund_records_event_idx` ON `refund_records` (`event_id`, `status`);

-- 15. Settlement Records (Distinguishing Proceeds, Payables, Commissions, Fees, Refunds, Taxes)
CREATE TABLE `settlement_records` (
  `id` text PRIMARY KEY NOT NULL,
  `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
  `organizer_id` text NOT NULL REFERENCES `organizer_profiles`(`id`) ON DELETE CASCADE,
  `gross_receipts_cents` integer NOT NULL DEFAULT 0,
  `refunds_cents` integer NOT NULL DEFAULT 0,
  `processing_fees_cents` integer NOT NULL DEFAULT 0,
  `platform_admin_allocation_cents` integer NOT NULL DEFAULT 0,
  `tax_withheld_cents` integer NOT NULL DEFAULT 0,
  `performer_payables_cents` integer NOT NULL DEFAULT 0,
  `agent_commissions_cents` integer NOT NULL DEFAULT 0,
  `net_organizer_proceeds_cents` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'draft',
  `created_at` integer NOT NULL
);
CREATE INDEX `settlement_event_idx` ON `settlement_records` (`event_id`);

-- 16. Link Gamo Production Requests directly to Live Events without duplicating event identity
ALTER TABLE `production_requests` ADD COLUMN `event_id` text REFERENCES `events`(`id`) ON DELETE SET NULL;
CREATE INDEX `production_requests_event_idx` ON `production_requests` (`event_id`);

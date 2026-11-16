-- 0018: remove Gamo Live (owner-approved, destructive; production holds only test data).
-- Design: docs/superpowers/specs/2026-11-16-remove-gamo-live-design.md. Gamo Studios now runs Academy,
-- Worship and Production only, so the Live tables (events, ticketing, scanner, venues, artists/bookings,
-- organizer profiles, external listings), production_requests/production_projects (only ever linked to
-- events) and the never-used payment_records, ledger_entries and stripe_webhook_events go away.
-- notification_jobs goes too: it only held Live registration emails and references event_registrations.
--
-- Order matters because D1 enforces foreign keys and DROP TABLE runs an implicit DELETE first:
-- (1) drop every trigger on the doomed tables, so the cascades of that implicit DELETE cannot fire
--     ticketing guards; also drop moderation_pending, the one trigger on a kept table
--     (moderation_reviews) that reads `events` and would otherwise fail every future insert;
-- (2) drop tables children-first. The events/venues/orders cycle only has SET NULL/CASCADE edges once
--     tickets, holds and order items are gone first.
-- Indexes go with their tables. Kept tables are not rebuilt: CHECK constraints that still list 'live'
-- stay (harmless value, risky rebuilds). Each statement is on one line (Wrangler remote splitter rule).
DROP TRIGGER IF EXISTS moderation_pending;
--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_validate_input;
--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_validate;
--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_reserve;
--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_immutable;
--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_cancel;
--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_delete;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tier_validate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tier_validate_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS rep_auth_exclusive_conflict_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS rep_auth_exclusive_conflict_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS booking_offer_immutable_accepted;
--> statement-breakpoint
DROP TRIGGER IF EXISTS engagement_deposit_gate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS engagement_deposit_gate_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_performer_minor_safeguarding_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS event_performer_minor_safeguarding_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_validate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_validate_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_block_tiers;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_block_holds;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_block_orders;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_block_tickets;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_block_settlements;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tier_validate_category_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tier_validate_category_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_block_sections;
--> statement-breakpoint
DROP TRIGGER IF EXISTS section_validate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS section_validate_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS order_validate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS order_validate_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS order_refund_bounds;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_event_block_order_items;
--> statement-breakpoint
DROP TRIGGER IF EXISTS order_item_validate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS order_item_immutable;
--> statement-breakpoint
DROP TRIGGER IF EXISTS hold_status_validate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS hold_status_validate_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS hold_validate_managed_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS hold_transition_guard;
--> statement-breakpoint
DROP TRIGGER IF EXISTS hold_reserve;
--> statement-breakpoint
DROP TRIGGER IF EXISTS hold_release;
--> statement-breakpoint
DROP TRIGGER IF EXISTS hold_convert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ticket_status_validate_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ticket_status_validate_update;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ticket_terminal_guard;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ticket_managed_immutable;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ticket_release;
--> statement-breakpoint
DROP TRIGGER IF EXISTS ticket_issue_validate;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tier_seats_per_ticket_locked;
--> statement-breakpoint
DROP TABLE IF EXISTS notification_jobs;
--> statement-breakpoint
DROP TABLE IF EXISTS production_projects;
--> statement-breakpoint
DROP TABLE IF EXISTS external_listing_revisions;
--> statement-breakpoint
DROP TABLE IF EXISTS external_outbound_clicks;
--> statement-breakpoint
DROP TABLE IF EXISTS ticket_access_log;
--> statement-breakpoint
DROP TABLE IF EXISTS ticket_presence;
--> statement-breakpoint
DROP TABLE IF EXISTS ticket_scan_events;
--> statement-breakpoint
DROP TABLE IF EXISTS ticket_scans;
--> statement-breakpoint
DROP TABLE IF EXISTS waitlist_entries;
--> statement-breakpoint
DROP TABLE IF EXISTS refund_records;
--> statement-breakpoint
DROP TABLE IF EXISTS settlement_records;
--> statement-breakpoint
DROP TABLE IF EXISTS event_changes;
--> statement-breakpoint
DROP TABLE IF EXISTS event_occurrences;
--> statement-breakpoint
DROP TABLE IF EXISTS event_organizations;
--> statement-breakpoint
DROP TABLE IF EXISTS event_performers;
--> statement-breakpoint
DROP TABLE IF EXISTS event_policies;
--> statement-breakpoint
DROP TABLE IF EXISTS event_team_members;
--> statement-breakpoint
DROP TABLE IF EXISTS payment_records;
--> statement-breakpoint
DROP TABLE IF EXISTS ledger_entries;
--> statement-breakpoint
DROP TABLE IF EXISTS stripe_webhook_events;
--> statement-breakpoint
DROP TABLE IF EXISTS performance_engagements;
--> statement-breakpoint
DROP TABLE IF EXISTS production_requests;
--> statement-breakpoint
DROP TABLE IF EXISTS scanner_devices;
--> statement-breakpoint
DROP TABLE IF EXISTS tickets;
--> statement-breakpoint
DROP TABLE IF EXISTS booking_offers;
--> statement-breakpoint
DROP TABLE IF EXISTS event_registrations;
--> statement-breakpoint
DROP TABLE IF EXISTS representation_authorizations;
--> statement-breakpoint
DROP TABLE IF EXISTS scanner_sessions;
--> statement-breakpoint
DROP TABLE IF EXISTS booking_inquiries;
--> statement-breakpoint
DROP TABLE IF EXISTS artist_profiles;
--> statement-breakpoint
DROP TABLE IF EXISTS artist_representatives;
--> statement-breakpoint
DROP TABLE IF EXISTS ticket_holds;
--> statement-breakpoint
DROP TABLE IF EXISTS ticket_orders;
--> statement-breakpoint
DROP TABLE IF EXISTS order_items;
--> statement-breakpoint
DROP TABLE IF EXISTS venue_seats;
--> statement-breakpoint
DROP TABLE IF EXISTS venue_sections;
--> statement-breakpoint
DROP TABLE IF EXISTS venue_maps;
--> statement-breakpoint
DROP TABLE IF EXISTS ticket_tiers;
--> statement-breakpoint
DROP TABLE IF EXISTS events;
--> statement-breakpoint
DROP TABLE IF EXISTS venues;
--> statement-breakpoint
DROP TABLE IF EXISTS organizer_profiles;

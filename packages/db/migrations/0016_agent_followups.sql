-- 0016: columns the Phase 2 agents asked for (additive, nullable).
ALTER TABLE ticket_orders ADD COLUMN attendees_json TEXT CHECK (attendees_json IS NULL OR json_valid(attendees_json));
--> statement-breakpoint
ALTER TABLE users ADD COLUMN person_link_opt_out_at INTEGER;
--> statement-breakpoint
ALTER TABLE academy_registrations ADD COLUMN refund_requested_at INTEGER;
--> statement-breakpoint
ALTER TABLE academy_registrations ADD COLUMN stripe_customer_id TEXT;
--> statement-breakpoint
ALTER TABLE ticket_scan_events ADD COLUMN reviewed_at INTEGER;
--> statement-breakpoint
ALTER TABLE ticket_scan_events ADD COLUMN reviewed_by_user_id TEXT;

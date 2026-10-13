-- Additive safety migration. Existing invalid rows must be reconciled, never silently deleted.
CREATE TABLE notification_jobs (
 id TEXT PRIMARY KEY NOT NULL,
 registration_id TEXT NOT NULL UNIQUE REFERENCES event_registrations(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER registration_validate_input BEFORE INSERT ON event_registrations
WHEN NEW.quantity < 1 OR NEW.quantity > 10 OR typeof(NEW.quantity) != 'integer'
 OR NEW.attendee_email != lower(trim(NEW.attendee_email)) OR NEW.user_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'REGISTRATION_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER registration_validate BEFORE INSERT ON event_registrations
WHEN NOT EXISTS (
 SELECT 1 FROM events e JOIN ticket_tiers t ON t.event_id=e.id
 WHERE e.id=NEW.event_id AND e.status='approved' AND e.admission_type='free'
  AND e.starts_at > unixepoch() AND t.id=NEW.tier_id AND t.price_cents=0
  AND t.reserved_count + NEW.quantity <= t.capacity
)
BEGIN SELECT RAISE(ABORT, 'REGISTRATION_UNAVAILABLE'); END;
--> statement-breakpoint
CREATE TRIGGER registration_reserve AFTER INSERT ON event_registrations
BEGIN
 UPDATE ticket_tiers SET reserved_count=reserved_count + NEW.quantity WHERE id=NEW.tier_id;
 INSERT INTO notification_jobs(id,registration_id,created_at) VALUES ('notice_' || NEW.id,NEW.id,unixepoch());
END;
--> statement-breakpoint
CREATE TRIGGER registration_immutable BEFORE UPDATE ON event_registrations
WHEN NEW.quantity != OLD.quantity OR NEW.tier_id IS NOT OLD.tier_id OR NEW.event_id != OLD.event_id
 OR NEW.attendee_email != OLD.attendee_email OR NEW.user_id IS NOT OLD.user_id
 OR (OLD.status='canceled' AND NEW.status!='canceled')
BEGIN SELECT RAISE(ABORT, 'REGISTRATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER registration_cancel AFTER UPDATE OF status ON event_registrations
WHEN NEW.status='canceled' AND OLD.status!='canceled'
BEGIN UPDATE ticket_tiers SET reserved_count=reserved_count-OLD.quantity WHERE id=OLD.tier_id; END;
--> statement-breakpoint
CREATE TRIGGER registration_delete AFTER DELETE ON event_registrations
WHEN OLD.status!='canceled'
BEGIN UPDATE ticket_tiers SET reserved_count=reserved_count-OLD.quantity WHERE id=OLD.tier_id; END;
--> statement-breakpoint
CREATE TRIGGER tier_validate_insert BEFORE INSERT ON ticket_tiers
WHEN NEW.capacity < 1 OR NEW.price_cents < 0 OR NEW.reserved_count < 0 OR NEW.reserved_count > NEW.capacity
BEGIN SELECT RAISE(ABORT, 'TIER_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER tier_validate_update BEFORE UPDATE ON ticket_tiers
WHEN NEW.capacity < 1 OR NEW.price_cents < 0 OR NEW.reserved_count < 0 OR NEW.reserved_count > NEW.capacity
BEGIN SELECT RAISE(ABORT, 'TIER_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER moderation_pending BEFORE INSERT ON moderation_reviews
WHEN NEW.target_type='event' AND NOT EXISTS(SELECT 1 FROM events WHERE id=NEW.target_id AND status='pending_review')
BEGIN SELECT RAISE(ABORT, 'REVIEW_CONFLICT'); END;

--> statement-breakpoint
UPDATE sessions SET created_at=unixepoch() WHERE created_at=0;
--> statement-breakpoint
UPDATE user_roles SET created_at=unixepoch() WHERE created_at=0;
--> statement-breakpoint
UPDATE musician_profiles SET created_at=unixepoch() WHERE created_at=0;
--> statement-breakpoint
UPDATE churches SET created_at=unixepoch() WHERE created_at=0;
--> statement-breakpoint
UPDATE gigs SET created_at=unixepoch() WHERE created_at=0;
--> statement-breakpoint
UPDATE gig_assignments SET assigned_at=unixepoch() WHERE assigned_at=0;
--> statement-breakpoint

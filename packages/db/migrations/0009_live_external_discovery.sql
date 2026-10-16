ALTER TABLE events ADD COLUMN listing_type TEXT NOT NULL DEFAULT 'organizer_submitted';
--> statement-breakpoint
ALTER TABLE events ADD COLUMN import_key TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN metro_slug TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN start_date_local TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN start_time_local TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN published_by_label TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN published_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN original_organizer_name TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN external_destination_kind TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN external_ticket_provider TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN external_only INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN price_min_cents INTEGER;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
--> statement-breakpoint
ALTER TABLE events ADD COLUMN ticket_availability TEXT NOT NULL DEFAULT 'unverified';
--> statement-breakpoint
ALTER TABLE events ADD COLUMN source_urls_json TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN last_verified_at INTEGER;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN artwork_url TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN artwork_rights_verified INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN artwork_license_credit TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN editorial_status TEXT NOT NULL DEFAULT 'draft';
--> statement-breakpoint
ALTER TABLE events ADD COLUMN editorial_notes TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN independent_disclosure TEXT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE UNIQUE INDEX events_import_key_unique ON events(import_key);
--> statement-breakpoint
CREATE INDEX events_metro_slug_idx ON events(metro_slug, status, starts_at);
--> statement-breakpoint
CREATE INDEX events_listing_type_idx ON events(listing_type, editorial_status, status);
--> statement-breakpoint
CREATE TABLE external_listing_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  import_key TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  previous_editorial_status TEXT,
  next_editorial_status TEXT NOT NULL,
  external_url TEXT,
  source_urls_json TEXT,
  notes TEXT,
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX external_revisions_event_idx ON external_listing_revisions(event_id, created_at);
--> statement-breakpoint
CREATE INDEX external_revisions_import_key_idx ON external_listing_revisions(import_key, created_at);
--> statement-breakpoint
CREATE TABLE external_outbound_clicks (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  metro_slug TEXT,
  provider_name TEXT,
  destination_kind TEXT,
  referrer_surface TEXT NOT NULL DEFAULT 'event_detail',
  clicked_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX external_clicks_event_idx ON external_outbound_clicks(event_id, clicked_at);
--> statement-breakpoint
CREATE TRIGGER external_event_validate_insert BEFORE INSERT ON events
WHEN NEW.listing_type = 'external_discovery' OR NEW.external_only = 1
BEGIN SELECT CASE WHEN NEW.admission_type != 'external' THEN RAISE(ABORT, 'EXTERNAL_DISCOVERY_ADMISSION_TYPE_INVALID') WHEN NEW.artwork_url IS NOT NULL AND NEW.artwork_rights_verified != 1 THEN RAISE(ABORT, 'EXTERNAL_ARTWORK_RIGHTS_UNVERIFIED') WHEN NEW.external_url IS NOT NULL AND NEW.external_url NOT LIKE 'https://%' THEN RAISE(ABORT, 'EXTERNAL_URL_HTTPS_REQUIRED') WHEN NEW.status = 'approved' AND (NEW.editorial_status != 'published' OR NEW.external_url IS NULL OR NEW.external_url NOT LIKE 'https://%' OR trim(NEW.venue_name) = '') THEN RAISE(ABORT, 'EXTERNAL_LISTING_NOT_PUBLISH_ELIGIBLE') END; END;
--> statement-breakpoint
CREATE TRIGGER external_event_validate_update BEFORE UPDATE ON events
WHEN NEW.listing_type = 'external_discovery' OR NEW.external_only = 1
BEGIN SELECT CASE WHEN NEW.admission_type != 'external' THEN RAISE(ABORT, 'EXTERNAL_DISCOVERY_ADMISSION_TYPE_INVALID') WHEN NEW.artwork_url IS NOT NULL AND NEW.artwork_rights_verified != 1 THEN RAISE(ABORT, 'EXTERNAL_ARTWORK_RIGHTS_UNVERIFIED') WHEN NEW.external_url IS NOT NULL AND NEW.external_url NOT LIKE 'https://%' THEN RAISE(ABORT, 'EXTERNAL_URL_HTTPS_REQUIRED') WHEN NEW.status = 'approved' AND (NEW.editorial_status != 'published' OR NEW.external_url IS NULL OR NEW.external_url NOT LIKE 'https://%' OR trim(NEW.venue_name) = '') THEN RAISE(ABORT, 'EXTERNAL_LISTING_NOT_PUBLISH_ELIGIBLE') END; END;
--> statement-breakpoint
CREATE TRIGGER external_event_block_tiers BEFORE INSERT ON ticket_tiers
WHEN EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND (listing_type = 'external_discovery' OR external_only = 1))
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EVENT_NO_TIERS'); END;
--> statement-breakpoint
CREATE TRIGGER external_event_block_holds BEFORE INSERT ON ticket_holds
WHEN EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND (listing_type = 'external_discovery' OR external_only = 1))
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EVENT_NO_HOLDS'); END;
--> statement-breakpoint
CREATE TRIGGER external_event_block_orders BEFORE INSERT ON ticket_orders
WHEN EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND (listing_type = 'external_discovery' OR external_only = 1))
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EVENT_NO_ORDERS'); END;
--> statement-breakpoint
CREATE TRIGGER external_event_block_tickets BEFORE INSERT ON tickets
WHEN EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND (listing_type = 'external_discovery' OR external_only = 1))
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EVENT_NO_TICKETS'); END;
--> statement-breakpoint
CREATE TRIGGER external_event_block_settlements BEFORE INSERT ON settlement_records
WHEN EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND (listing_type = 'external_discovery' OR external_only = 1))
BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EVENT_NO_SETTLEMENTS'); END;

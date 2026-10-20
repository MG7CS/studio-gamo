-- Paid ticketing (docs/LIVE_DATA_MODEL.md section 8). Adds the admission mode paid_tickets and lets paid events carry
-- QR codes. SQLite cannot change a CHECK in place, and D1 always enforces foreign keys, so dropping events would
-- cascade-delete its dates, registrations and codes. Every dependent table is therefore copied aside first and
-- restored unchanged after the rebuild, all in this one migration. Back up the database before applying it remotely.
-- No semicolons inside comments: the test harness splits this file on them.
PRAGMA defer_foreign_keys = on;

CREATE TABLE keep_event_occurrences AS SELECT * FROM event_occurrences;
CREATE TABLE keep_event_performers AS SELECT * FROM event_performers;
CREATE TABLE keep_catalog_sources AS SELECT * FROM catalog_sources;
CREATE TABLE keep_event_revisions AS SELECT * FROM event_revisions;
CREATE TABLE keep_registrations AS SELECT * FROM registrations;
CREATE TABLE keep_email_codes AS SELECT * FROM email_codes;

CREATE TABLE events_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations (id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('organizer', 'catalog')),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  venue_id TEXT NOT NULL REFERENCES venues (id),
  timezone TEXT NOT NULL,
  admission TEXT NOT NULL
    CHECK (admission IN ('free_open', 'free_registration', 'external_tickets', 'paid_tickets')),
  external_url TEXT,
  price_text TEXT,
  refund_policy_text TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  max_party_size INTEGER NOT NULL DEFAULT 6 CHECK (max_party_size BETWEEN 1 AND 20),
  qr_checkin INTEGER NOT NULL DEFAULT 0 CHECK (qr_checkin IN (0, 1)),
  image_key TEXT,
  image_rights_confirmed_at INTEGER,
  recurrence TEXT,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'changes_requested', 'published', 'rejected', 'canceled', 'hidden')),
  published_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  venue_name TEXT,
  venue_address TEXT,
  checkin_opens_hours INTEGER NOT NULL DEFAULT 3 CHECK (checkin_opens_hours BETWEEN 1 AND 72),
  CHECK (origin = 'catalog' OR organization_id IS NOT NULL),
  CHECK (admission <> 'external_tickets' OR external_url IS NOT NULL),
  CHECK (qr_checkin = 0 OR admission IN ('free_registration', 'paid_tickets')),
  CHECK (admission <> 'paid_tickets' OR origin = 'organizer')
);
INSERT INTO events_new (
  id, organization_id, origin, slug, title, category, description, venue_id, timezone, admission, external_url,
  price_text, refund_policy_text, capacity, max_party_size, qr_checkin, image_key, image_rights_confirmed_at,
  recurrence, featured, status, published_at, created_at, updated_at, venue_name, venue_address, checkin_opens_hours
)
SELECT
  id, organization_id, origin, slug, title, category, description, venue_id, timezone, admission, external_url,
  price_text, refund_policy_text, capacity, max_party_size, qr_checkin, image_key, image_rights_confirmed_at,
  recurrence, featured, status, published_at, created_at, updated_at, venue_name, venue_address, checkin_opens_hours
FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;
CREATE INDEX events_status ON events (status, published_at);
CREATE INDEX events_organization ON events (organization_id, status);
CREATE INDEX events_venue ON events (venue_id);

INSERT INTO event_occurrences SELECT * FROM keep_event_occurrences WHERE id NOT IN (SELECT id FROM event_occurrences);
INSERT INTO event_performers SELECT * FROM keep_event_performers
  WHERE NOT EXISTS (SELECT 1 FROM event_performers p
                    WHERE p.event_id = keep_event_performers.event_id AND p.position = keep_event_performers.position);
INSERT INTO catalog_sources SELECT * FROM keep_catalog_sources WHERE event_id NOT IN (SELECT event_id FROM catalog_sources);
INSERT INTO event_revisions SELECT * FROM keep_event_revisions WHERE event_id NOT IN (SELECT event_id FROM event_revisions);
INSERT INTO registrations SELECT * FROM keep_registrations WHERE id NOT IN (SELECT id FROM registrations);
INSERT INTO email_codes SELECT * FROM keep_email_codes WHERE id NOT IN (SELECT id FROM email_codes);

DROP TABLE keep_event_occurrences;
DROP TABLE keep_event_performers;
DROP TABLE keep_catalog_sources;
DROP TABLE keep_event_revisions;
DROP TABLE keep_registrations;
DROP TABLE keep_email_codes;

-- The policies the organizer chooses for a paid event. Each order copies them into orders.policy_snapshot.
CREATE TABLE event_ticketing (
  event_id TEXT PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  fee_payer TEXT NOT NULL DEFAULT 'buyer' CHECK (fee_payer IN ('buyer', 'organizer')),
  refund_policy TEXT NOT NULL DEFAULT 'none' CHECK (refund_policy IN ('none', 'until_hours_before', 'until_start')),
  refund_hours INTEGER CHECK (refund_hours IS NULL OR refund_hours IN (24, 48, 72, 168)),
  transfers_allowed INTEGER NOT NULL DEFAULT 1 CHECK (transfers_allowed IN (0, 1)),
  transfer_cutoff_hours INTEGER NOT NULL DEFAULT 0 CHECK (transfer_cutoff_hours BETWEEN 0 AND 168),
  reentry_allowed INTEGER NOT NULL DEFAULT 0 CHECK (reentry_allowed IN (0, 1)),
  entry_notes TEXT CHECK (entry_notes IS NULL OR length(entry_notes) <= 280),
  names_required INTEGER NOT NULL DEFAULT 0 CHECK (names_required IN (0, 1)),
  gifts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (gifts_enabled IN (0, 1)),
  gift_presets TEXT,
  door_sales_enabled INTEGER NOT NULL DEFAULT 0 CHECK (door_sales_enabled IN (0, 1)),
  max_tickets_per_order INTEGER NOT NULL DEFAULT 10 CHECK (max_tickets_per_order BETWEEN 1 AND 50),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (refund_policy <> 'until_hours_before' OR refund_hours IS NOT NULL)
);

CREATE TABLE ticket_types (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  description TEXT CHECK (description IS NULL OR length(description) <= 200),
  kind TEXT NOT NULL DEFAULT 'general'
    CHECK (kind IN ('general', 'vip', 'child', 'student', 'group', 'day_pass', 'other')),
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 1000000),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  people_per_ticket INTEGER NOT NULL DEFAULT 1 CHECK (people_per_ticket BETWEEN 1 AND 20),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  door_allocation INTEGER NOT NULL DEFAULT 0 CHECK (door_allocation >= 0),
  door_uses_online INTEGER NOT NULL DEFAULT 1 CHECK (door_uses_online IN (0, 1)),
  per_order_limit INTEGER NOT NULL DEFAULT 10 CHECK (per_order_limit BETWEEN 1 AND 50),
  sales_start_at INTEGER,
  sales_end_at INTEGER,
  status TEXT NOT NULL DEFAULT 'on_sale' CHECK (status IN ('on_sale', 'hidden', 'ended')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (capacity IS NULL OR door_allocation <= capacity),
  CHECK (sales_start_at IS NULL OR sales_end_at IS NULL OR sales_end_at > sales_start_at)
);
CREATE INDEX ticket_types_event ON ticket_types (event_id, position);

-- Early-bird prices: the first deadline still ahead applies, then the type's own price.
CREATE TABLE price_deadlines (
  id TEXT PRIMARY KEY,
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL CHECK (price_cents BETWEEN 0 AND 1000000),
  ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (ticket_type_id, ends_at)
);

-- Promo codes (discounts) and presale access codes (unlock hidden ticket types).
CREATE TABLE event_codes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (length(code) BETWEEN 3 AND 32 AND code = upper(code)),
  kind TEXT NOT NULL CHECK (kind IN ('promo', 'access')),
  discount_kind TEXT CHECK (discount_kind IS NULL OR discount_kind IN ('percent', 'amount')),
  percent_off INTEGER CHECK (percent_off IS NULL OR percent_off BETWEEN 1 AND 100),
  amount_off_cents INTEGER CHECK (amount_off_cents IS NULL OR amount_off_cents > 0),
  ticket_type_ids TEXT,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  starts_at INTEGER,
  ends_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (event_id, code),
  CHECK (max_uses IS NULL OR uses <= max_uses),
  CHECK (kind <> 'promo' OR (discount_kind = 'percent' AND percent_off IS NOT NULL)
         OR (discount_kind = 'amount' AND amount_off_cents IS NOT NULL)),
  CHECK (kind <> 'access' OR (discount_kind IS NULL AND ticket_type_ids IS NOT NULL))
);

-- Inventory per ticket type and date. Taken counts include unpaid orders that still hold seats. A CHECK failure
-- makes the whole reservation batch roll back, so a multi-line order is all or nothing.
CREATE TABLE ticket_inventory (
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id) ON DELETE CASCADE,
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences (id) ON DELETE CASCADE,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  door_allocation INTEGER NOT NULL DEFAULT 0 CHECK (door_allocation >= 0),
  door_uses_online INTEGER NOT NULL DEFAULT 1 CHECK (door_uses_online IN (0, 1)),
  online_taken INTEGER NOT NULL DEFAULT 0 CHECK (online_taken >= 0),
  door_taken INTEGER NOT NULL DEFAULT 0 CHECK (door_taken >= 0),
  PRIMARY KEY (ticket_type_id, occurrence_id),
  CHECK (capacity IS NULL OR online_taken + MAX(door_allocation, door_taken) <= capacity),
  CHECK (door_uses_online = 1 OR door_taken <= door_allocation)
);

-- The event-wide cap for paid events, in people, per date.
CREATE TABLE occurrence_inventory (
  occurrence_id TEXT PRIMARY KEY REFERENCES event_occurrences (id) ON DELETE CASCADE,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  people_taken INTEGER NOT NULL DEFAULT 0 CHECK (people_taken >= 0),
  CHECK (capacity IS NULL OR people_taken <= capacity)
);

ALTER TABLE organizations ADD COLUMN first_paid_event_approved_at INTEGER;

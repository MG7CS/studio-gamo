-- Gamo Live core schema (docs/LIVE_DATA_MODEL.md). Own D1 database (LIVE_DB); nothing here touches the old tables.
-- Times are UTC epoch seconds; events carry an IANA time zone for display. Codes, QR tokens and manage links are stored as hashes.

CREATE TABLE organizers (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('church', 'ministry', 'artist', 'organizer')),
  city TEXT,
  state TEXT,
  website TEXT,
  contact_email TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  verified_at INTEGER,
  review_every_event INTEGER NOT NULL DEFAULT 0 CHECK (review_every_event IN (0, 1)),
  first_event_approved_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE memberships (
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  organizer_id TEXT NOT NULL REFERENCES organizers (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (organization_id, organizer_id)
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  email_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE venues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  metro_slug TEXT,
  timezone TEXT NOT NULL,
  lat REAL,
  lng REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX venues_identity ON venues (name, city, state);
CREATE INDEX venues_metro ON venues (metro_slug);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations (id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('organizer', 'catalog')),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  venue_id TEXT NOT NULL REFERENCES venues (id),
  timezone TEXT NOT NULL,
  admission TEXT NOT NULL CHECK (admission IN ('free_open', 'free_registration', 'external_tickets')),
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
  CHECK (origin = 'catalog' OR organization_id IS NOT NULL),
  CHECK (admission <> 'external_tickets' OR external_url IS NOT NULL),
  CHECK (qr_checkin = 0 OR admission = 'free_registration')
);
CREATE INDEX events_status ON events (status, published_at);
CREATE INDEX events_organization ON events (organization_id, status);
CREATE INDEX events_venue ON events (venue_id);

CREATE TABLE event_occurrences (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'canceled')),
  seats_taken INTEGER NOT NULL DEFAULT 0 CHECK (seats_taken >= 0),
  registered_total INTEGER NOT NULL DEFAULT 0,
  checked_in_total INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX occurrences_event ON event_occurrences (event_id, starts_at);
CREATE INDEX occurrences_start ON event_occurrences (starts_at);

CREATE TABLE event_performers (
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  PRIMARY KEY (event_id, position)
);
CREATE INDEX event_performers_name ON event_performers (name);

CREATE TABLE catalog_sources (
  event_id TEXT PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  import_key TEXT NOT NULL UNIQUE,
  source_urls TEXT NOT NULL,
  provider TEXT,
  destination_kind TEXT,
  last_verified_at INTEGER,
  original_organizer_name TEXT
);

CREATE TABLE registrations (
  id TEXT PRIMARY KEY,
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'canceled', 'expired')),
  checkin_code TEXT,
  terms_version TEXT NOT NULL,
  expires_at INTEGER,
  confirmed_at INTEGER,
  canceled_at INTEGER,
  checked_in_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
-- One live registration per person per occurrence.
CREATE UNIQUE INDEX registrations_one_active ON registrations (occurrence_id, email_hash)
  WHERE status IN ('pending', 'confirmed');
-- The check-in code exists only for events with QR codes on; it is derived (HMAC) at confirmation.
CREATE UNIQUE INDEX registrations_checkin ON registrations (occurrence_id, checkin_code) WHERE checkin_code IS NOT NULL;
CREATE INDEX registrations_pending_expiry ON registrations (occurrence_id, expires_at) WHERE status = 'pending';

CREATE TABLE email_codes (
  id TEXT PRIMARY KEY,
  registration_id TEXT NOT NULL REFERENCES registrations (id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX email_codes_registration ON email_codes (registration_id);

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  to_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  provider_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX email_outbox_due ON email_outbox (status, next_attempt_at);

CREATE TABLE review_decisions (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('event', 'organization')),
  subject_id TEXT NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN ('approved', 'changes_requested', 'rejected', 'verified', 'unverified', 'suspended', 'reinstated')),
  note TEXT,
  decided_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX review_decisions_subject ON review_decisions (subject_type, subject_id, decided_at);

CREATE TABLE terms_acceptances (
  organizer_id TEXT NOT NULL REFERENCES organizers (id) ON DELETE CASCADE,
  document TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (organizer_id, document, version)
);

CREATE TABLE rate_limit_counters (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limit_expiry ON rate_limit_counters (expires_at);

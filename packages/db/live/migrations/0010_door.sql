-- Door sales: event-scoped staff links with a PIN, their devices, cash drawers and Stripe Terminal readers
-- (docs/LIVE_DATA_MODEL.md section 8). Link tokens and device cookies are stored only as keyed hashes, PINs with
-- PBKDF2 and a pepper. No semicolons inside comments: the test harness splits this file on them.
CREATE TABLE staff_links (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  token_hash TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  can_check_in INTEGER NOT NULL DEFAULT 1 CHECK (can_check_in IN (0, 1)),
  can_sell INTEGER NOT NULL DEFAULT 0 CHECK (can_sell IN (0, 1)),
  can_comp INTEGER NOT NULL DEFAULT 0 CHECK (can_comp IN (0, 1)),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_pin_attempts >= 0),
  locked_until INTEGER,
  created_by TEXT,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (can_check_in = 1 OR can_sell = 1),
  CHECK (can_comp = 0 OR can_sell = 1)
);
CREATE INDEX staff_links_event ON staff_links (event_id, created_at);

CREATE TABLE staff_devices (
  id TEXT PRIMARY KEY,
  staff_link_id TEXT NOT NULL REFERENCES staff_links (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER
);
CREATE INDEX staff_devices_link ON staff_devices (staff_link_id);

-- One open drawer per staff link (or signed-in organizer) per date. Expected = float + cash sales - cash refunds,
-- stored at close. A closed session is never changed.
CREATE TABLE cash_sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events (id),
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences (id),
  staff_link_id TEXT REFERENCES staff_links (id),
  organizer_id TEXT REFERENCES organizers (id),
  float_cents INTEGER NOT NULL CHECK (float_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  expected_cents INTEGER,
  counted_cents INTEGER CHECK (counted_cents IS NULL OR counted_cents >= 0),
  close_note TEXT CHECK (close_note IS NULL OR length(close_note) <= 500),
  opened_at INTEGER NOT NULL,
  closed_at INTEGER,
  CHECK ((staff_link_id IS NULL) <> (organizer_id IS NULL)),
  CHECK (status = 'open' OR (expected_cents IS NOT NULL AND counted_cents IS NOT NULL AND closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX cash_sessions_open_link ON cash_sessions (occurrence_id, staff_link_id)
  WHERE status = 'open' AND staff_link_id IS NOT NULL;
CREATE UNIQUE INDEX cash_sessions_open_organizer ON cash_sessions (occurrence_id, organizer_id)
  WHERE status = 'open' AND organizer_id IS NOT NULL;

CREATE TABLE cash_movements (
  id TEXT PRIMARY KEY,
  cash_session_id TEXT NOT NULL REFERENCES cash_sessions (id),
  kind TEXT NOT NULL CHECK (kind IN ('sale', 'refund')),
  order_id TEXT REFERENCES orders (id),
  refund_id TEXT REFERENCES refunds (id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  received_cents INTEGER CHECK (received_cents IS NULL OR received_cents >= 0),
  change_cents INTEGER CHECK (change_cents IS NULL OR change_cents >= 0),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 200),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (kind = 'sale' OR reason IS NOT NULL),
  CHECK (kind = 'refund' OR (received_cents IS NOT NULL AND received_cents >= amount_cents))
);
CREATE INDEX cash_movements_session ON cash_movements (cash_session_id, created_at);

CREATE TABLE terminal_locations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  stripe_location_id TEXT NOT NULL UNIQUE,
  stripe_account_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE readers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES terminal_locations (id),
  event_id TEXT REFERENCES events (id) ON DELETE SET NULL,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  stripe_reader_id TEXT NOT NULL UNIQUE,
  stripe_account_id TEXT,
  device_type TEXT,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'unknown')),
  action_status TEXT NOT NULL DEFAULT 'idle' CHECK (action_status IN ('idle', 'in_progress', 'succeeded', 'failed')),
  action_order_id TEXT REFERENCES orders (id),
  action_failure TEXT,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  removed_at INTEGER
);
CREATE INDEX readers_organization ON readers (organization_id, removed_at);

-- Payment settings (funds-flow mode, door sales, the Gamo fee with its history), each organization's Stripe readiness,
-- and verification through a meeting (docs/LIVE_DATA_MODEL.md section 8). No semicolons inside comments: the test
-- harness splits this file on them.
CREATE TABLE payment_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  funds_flow_default TEXT NOT NULL DEFAULT 'not_chosen'
    CHECK (funds_flow_default IN ('not_chosen', 'organizer_account', 'gamo_collects')),
  door_sales_enabled INTEGER NOT NULL DEFAULT 1 CHECK (door_sales_enabled IN (0, 1)),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO payment_settings (id, funds_flow_default, door_sales_enabled) VALUES (1, 'not_chosen', 1);

-- Only the connected account id and its readiness flags, read from Stripe. Nothing else about the account is stored.
CREATE TABLE organization_payments (
  organization_id TEXT PRIMARY KEY REFERENCES organizations (id) ON DELETE CASCADE,
  funds_flow_override TEXT CHECK (funds_flow_override IS NULL OR funds_flow_override IN ('organizer_account', 'gamo_collects')),
  connected_account_id TEXT UNIQUE,
  charges_enabled INTEGER NOT NULL DEFAULT 0 CHECK (charges_enabled IN (0, 1)),
  payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payouts_enabled IN (0, 1)),
  details_submitted INTEGER NOT NULL DEFAULT 0 CHECK (details_submitted IN (0, 1)),
  requirements_due INTEGER NOT NULL DEFAULT 0 CHECK (requirements_due >= 0),
  livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1)),
  checked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- The Gamo fee, per ticket: fixed_cents + percent_bps of the discounted price. The newest row in force applies.
-- Orders copy it (orders.fee_snapshot), so a change never affects tickets already sold.
CREATE TABLE fee_settings (
  id TEXT PRIMARY KEY,
  fixed_cents INTEGER NOT NULL DEFAULT 0 CHECK (fixed_cents BETWEEN 0 AND 10000),
  percent_bps INTEGER NOT NULL DEFAULT 0 CHECK (percent_bps BETWEEN 0 AND 2000),
  currency TEXT NOT NULL DEFAULT 'usd',
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  effective_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO fee_settings (id, fixed_cents, percent_bps, reason, effective_at)
  VALUES ('fee_initial', 0, 0, 'Starting setting: no Gamo fee (owner decision 2026-10-19).', 0);

CREATE TABLE payment_decisions (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL CHECK (subject IN ('funds_flow_default', 'organization_override', 'door_sales', 'fee', 'payout')),
  organization_id TEXT REFERENCES organizations (id) ON DELETE CASCADE,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  decided_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX payment_decisions_time ON payment_decisions (decided_at);

ALTER TABLE organizations ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'none'
  CHECK (verification_status IN ('none', 'requested', 'meeting_scheduled', 'meeting_held', 'verified', 'declined'));
ALTER TABLE organizations ADD COLUMN verification_requested_at INTEGER;
UPDATE organizations SET verification_status = 'verified' WHERE verified_at IS NOT NULL;

-- A meeting with Gamo (video call or in person) before verification. subject_type leaves room for churches and
-- providers when their data moves to this model.
CREATE TABLE verification_meetings (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('organization')),
  subject_id TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('video', 'in_person')),
  location TEXT NOT NULL CHECK (length(location) BETWEEN 1 AND 300),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'held', 'canceled')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  held_at INTEGER,
  canceled_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX verification_meetings_subject ON verification_meetings (subject_type, subject_id, created_at);
CREATE UNIQUE INDEX verification_meetings_one_open ON verification_meetings (subject_type, subject_id)
  WHERE status = 'scheduled';

-- The organizer sees one decision history: add the verification steps to review_decisions (nothing references it).
CREATE TABLE review_decisions_new (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('event', 'organization')),
  subject_id TEXT NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN ('approved', 'changes_requested', 'rejected', 'verified', 'unverified', 'suspended', 'reinstated',
                        'hidden', 'restored', 'verification_requested', 'meeting_scheduled', 'meeting_held',
                        'meeting_canceled', 'declined')),
  note TEXT,
  decided_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO review_decisions_new (id, subject_type, subject_id, decision, note, decided_at)
  SELECT id, subject_type, subject_id, decision, note, decided_at FROM review_decisions;
DROP TABLE review_decisions;
ALTER TABLE review_decisions_new RENAME TO review_decisions;
CREATE INDEX review_decisions_subject ON review_decisions (subject_type, subject_id, decided_at);

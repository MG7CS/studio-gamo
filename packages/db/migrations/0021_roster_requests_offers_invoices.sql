-- 0021: roster, service requests, offers and invoices (additive). Plan: docs/superpowers/plans/
-- 2026-11-16-forms-emails-invoices.md, Tasks 3.1-3.3. Money is integer cents (USD); times are epoch seconds;
-- service_date and due_date are ISO calendar dates ('YYYY-MM-DD') and start_time is 'HH:MM', because a church
-- books a local date and time, not an instant. Staff attribution columns (*_user_id) have no foreign key to
-- users so financial and review history survives staff removal. Musician pay and Gamo administrative lines
-- stay separate invoice_lines kinds ('gamo_admin' is refused by the service unless the owner approved it).
CREATE TABLE IF NOT EXISTS roster_members (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL UNIQUE REFERENCES form_submissions(id),
  program TEXT NOT NULL CHECK (program IN ('web', 'worship', 'academy', 'production')),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  email_normalized TEXT NOT NULL CHECK (email_normalized = lower(trim(email_normalized)) AND length(email_normalized) > 0),
  phone TEXT,
  roles_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(roles_json)),
  city TEXT,
  can_teach INTEGER NOT NULL DEFAULT 0 CHECK (can_teach IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'removed')),
  w9_received_at INTEGER,
  approved_by_user_id TEXT,
  approved_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS roster_members_status_idx ON roster_members(program, status, city);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS roster_members_email_idx ON roster_members(email_normalized);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL UNIQUE REFERENCES form_submissions(id),
  program TEXT NOT NULL CHECK (program IN ('web', 'worship', 'academy', 'production')),
  church_name TEXT NOT NULL CHECK (length(trim(church_name)) BETWEEN 1 AND 200),
  contact_name TEXT,
  contact_email_normalized TEXT NOT NULL CHECK (contact_email_normalized = lower(trim(contact_email_normalized)) AND length(contact_email_normalized) > 0),
  contact_phone TEXT,
  service_date TEXT NOT NULL CHECK (length(service_date) = 10 AND coalesce(date(service_date) = service_date, 0)),
  start_time TEXT CHECK (start_time IS NULL OR (length(start_time) = 5 AND time(start_time) IS NOT NULL)),
  address TEXT,
  roles_needed_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(roles_needed_json)),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'matching', 'offered', 'confirmed', 'completed', 'cancelled')),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_requests_status_date_idx ON service_requests(status, service_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_requests_email_idx ON service_requests(contact_email_normalized);
--> statement-breakpoint
-- Only the SHA-256 of the emailed token is stored. responded_at is set whenever the musician answered.
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES service_requests(id),
  roster_member_id TEXT NOT NULL REFERENCES roster_members(id),
  role TEXT NOT NULL CHECK (length(trim(role)) BETWEEN 1 AND 60),
  pay_cents INTEGER NOT NULL CHECK (typeof(pay_cents) = 'integer' AND pay_cents >= 0),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  sent_at INTEGER NOT NULL,
  responded_at INTEGER,
  CHECK (status NOT IN ('accepted', 'declined') OR responded_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS offers_request_idx ON offers(request_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS offers_member_idx ON offers(roster_member_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS offers_status_expires_idx ON offers(status, expires_at);
--> statement-breakpoint
-- Two staff or two musicians racing for one slot: the second acceptance fails on this index.
CREATE UNIQUE INDEX IF NOT EXISTS offers_one_accepted_per_role ON offers(request_id, role) WHERE status = 'accepted';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY NOT NULL,
  number TEXT NOT NULL UNIQUE CHECK (length(number) BETWEEN 1 AND 30),
  source_type TEXT NOT NULL CHECK (source_type IN ('service_request', 'academy_registration', 'manual')),
  source_id TEXT,
  bill_to_name TEXT NOT NULL CHECK (length(trim(bill_to_name)) BETWEEN 1 AND 200),
  bill_to_email_normalized TEXT NOT NULL CHECK (bill_to_email_normalized = lower(trim(bill_to_email_normalized)) AND length(bill_to_email_normalized) > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paid', 'void')),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (typeof(total_cents) = 'integer' AND total_cents >= 0),
  due_date TEXT CHECK (due_date IS NULL OR (length(due_date) = 10 AND coalesce(date(due_date) = due_date, 0))),
  stripe_invoice_id TEXT UNIQUE,
  hosted_url TEXT,
  paid_at INTEGER,
  paid_method TEXT CHECK (paid_method IS NULL OR paid_method IN ('stripe', 'check', 'zelle', 'ach', 'cash', 'other')),
  paid_reference TEXT,
  created_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK (source_type = 'manual' OR source_id IS NOT NULL),
  CHECK (status != 'paid' OR (paid_at IS NOT NULL AND paid_method IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoices_status_created_idx ON invoices(status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoices_email_idx ON invoices(bill_to_email_normalized);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoices_source_idx ON invoices(source_type, source_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoices_due_idx ON invoices(due_date) WHERE status = 'open';
--> statement-breakpoint
-- Lines cascade with a draft invoice; a recorded payout (musician_payouts) blocks deleting its invoice.
CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('musician_pay', 'lesson', 'production', 'other', 'gamo_admin')),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 300),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (typeof(quantity) = 'integer' AND quantity >= 1),
  unit_amount_cents INTEGER NOT NULL CHECK (typeof(unit_amount_cents) = 'integer' AND unit_amount_cents >= 0),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents = quantity * unit_amount_cents),
  payee_roster_member_id TEXT REFERENCES roster_members(id),
  CHECK (kind != 'musician_pay' OR payee_roster_member_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx ON invoice_lines(invoice_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS invoice_lines_payee_idx ON invoice_lines(payee_roster_member_id) WHERE payee_roster_member_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS musician_payouts (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_line_id TEXT NOT NULL UNIQUE REFERENCES invoice_lines(id),
  roster_member_id TEXT NOT NULL REFERENCES roster_members(id),
  amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents >= 0),
  paid_at INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('stripe', 'check', 'zelle', 'ach', 'cash', 'other')),
  reference TEXT,
  recorded_by_user_id TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS musician_payouts_member_idx ON musician_payouts(roster_member_id, paid_at);
--> statement-breakpoint
-- Invoice numbers GS-YYYY-NNNN: next_value is the next number to hand out for that year.
CREATE TABLE IF NOT EXISTS invoice_number_counters (
  year INTEGER PRIMARY KEY NOT NULL CHECK (year BETWEEN 2000 AND 9999),
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value >= 1)
);

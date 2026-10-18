-- Migration 0012: shared person record, guest customers, provider profiles and staff verification,
-- terms and consents, rate limits, email log, ticket access log, guest Academy registration.
-- Design of record: docs/design/identity-and-ticketing.md §4, §5.1. Additive only.
-- Times are epoch seconds (UTC); money is integer minor units; emails are stored normalised
-- (trim + lower-case, dots and plus-tags kept). Hashes are HMAC-SHA256 hex (PII_HASH_SECRET).
-- Every trigger stays on one line (docs/DATABASE.md rule 3).

-- 1. persons: one row per VERIFIED normalised email, shared across products (T-11, §4.6).
CREATE TABLE IF NOT EXISTS persons (
  id TEXT PRIMARY KEY NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE CHECK (email_normalized = lower(trim(email_normalized)) AND length(email_normalized) BETWEEN 3 AND 320),
  email_verified_at INTEGER NOT NULL,
  display_name TEXT,
  erased_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
ALTER TABLE users ADD COLUMN person_id TEXT REFERENCES persons(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS users_person_idx ON users(person_id);
--> statement-breakpoint
ALTER TABLE sessions ADD COLUMN clerk_session_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sessions_clerk_session_idx ON sessions(clerk_session_id) WHERE clerk_session_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE organizer_profiles ADD COLUMN first_event_approved_at INTEGER;
--> statement-breakpoint
ALTER TABLE organizer_profiles ADD COLUMN always_review INTEGER NOT NULL DEFAULT 0 CHECK (always_review IN (0, 1));
--> statement-breakpoint
-- 2. customer_profiles: guests (ticket buyers, parents, students). Email is identity; person link only once the email is proven.
CREATE TABLE IF NOT EXISTS customer_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE CHECK (email_normalized = lower(trim(email_normalized)) AND length(email_normalized) BETWEEN 3 AND 320),
  person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  display_name TEXT,
  phone TEXT,
  email_verified_at INTEGER,
  erased_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (person_id IS NULL OR email_verified_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_profiles_person_idx ON customer_profiles(person_id) WHERE person_id IS NOT NULL;
--> statement-breakpoint
-- 3. customer_access_tokens: emailed manage/recovery links. Only the HMAC of the token is stored (T-07).
CREATE TABLE IF NOT EXISTS customer_access_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  customer_profile_id TEXT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  scope TEXT NOT NULL CHECK (scope = 'customer:all' OR ((scope GLOB 'order:?*' OR scope GLOB 'ticket:?*' OR scope GLOB 'registration:?*' OR scope GLOB 'transfer:?*') AND scope NOT GLOB '*[^A-Za-z0-9:_-]*')),
  purpose TEXT NOT NULL CHECK (purpose IN ('recovery', 'order', 'verification', 'ticket', 'registration', 'transfer')),
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses >= 1),
  revoked_at INTEGER,
  created_ip_hash TEXT,
  created_at INTEGER NOT NULL,
  CHECK (expires_at > created_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_tokens_profile_scope_idx ON customer_access_tokens(customer_profile_id, scope);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_tokens_scope_idx ON customer_access_tokens(scope, revoked_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_tokens_expires_idx ON customer_access_tokens(expires_at);
--> statement-breakpoint
-- 4. customer_sessions: short-lived cookie sessions opened from a token.
CREATE TABLE IF NOT EXISTS customer_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  customer_profile_id TEXT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope = 'customer:all' OR ((scope GLOB 'order:?*' OR scope GLOB 'ticket:?*' OR scope GLOB 'registration:?*' OR scope GLOB 'transfer:?*') AND scope NOT GLOB '*[^A-Za-z0-9:_-]*')),
  token_id TEXT REFERENCES customer_access_tokens(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_sessions_profile_idx ON customer_sessions(customer_profile_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_sessions_token_idx ON customer_sessions(token_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customer_sessions_expires_idx ON customer_sessions(expires_at);
--> statement-breakpoint
-- 5. provider_profiles: every provider role a person holds, shared across products (§4.3, §4.6).
CREATE TABLE IF NOT EXISTS provider_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('musician', 'technician', 'church', 'agent', 'organizer', 'teacher', 'artist')),
  product_origin TEXT NOT NULL CHECK (product_origin IN ('web', 'worship', 'academy', 'live', 'production')),
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  slug TEXT UNIQUE CHECK (slug IS NULL OR (length(slug) BETWEEN 2 AND 80 AND slug NOT GLOB '*[^a-z0-9-]*')),
  profile_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(profile_json)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'meeting_scheduled', 'in_review', 'changes_requested', 'verified', 'rejected', 'suspended')),
  published_at INTEGER,
  requires_staff_review INTEGER NOT NULL DEFAULT 1 CHECK (requires_staff_review IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (role NOT IN ('church', 'musician', 'technician') OR requires_staff_review = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS provider_profiles_person_role_org_unique ON provider_profiles(person_id, role, coalesce(organization_id, ''));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS provider_profiles_queue_idx ON provider_profiles(status, role, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS provider_profiles_org_idx ON provider_profiles(organization_id) WHERE organization_id IS NOT NULL;
--> statement-breakpoint
-- Publish gate: a profile that needs staff review is public only while it is verified. Suspending or un-verifying must clear published_at in the same UPDATE.
CREATE TRIGGER IF NOT EXISTS provider_publish_gate_insert BEFORE INSERT ON provider_profiles WHEN NEW.published_at IS NOT NULL AND NEW.requires_staff_review = 1 AND NEW.status != 'verified' BEGIN SELECT RAISE(ABORT, 'PROVIDER_NOT_VERIFIED'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS provider_publish_gate_update BEFORE UPDATE ON provider_profiles WHEN NEW.published_at IS NOT NULL AND NEW.requires_staff_review = 1 AND NEW.status != 'verified' BEGIN SELECT RAISE(ABORT, 'PROVIDER_NOT_VERIFIED'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS provider_identity_immutable BEFORE UPDATE ON provider_profiles WHEN NEW.person_id != OLD.person_id OR NEW.role != OLD.role OR NEW.created_at != OLD.created_at BEGIN SELECT RAISE(ABORT, 'PROVIDER_IMMUTABLE'); END;
--> statement-breakpoint
-- 6. verification_records: append-only staff workflow log (§4.4).
CREATE TABLE IF NOT EXISTS verification_records (
  id TEXT PRIMARY KEY NOT NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('provider_profile', 'event', 'organizer')),
  subject_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('submit', 'schedule_meeting', 'start_review', 'verify', 'request_changes', 'reject', 'suspend', 'reinstate', 'approve_event', 'reject_event', 'note')),
  from_status TEXT,
  to_status TEXT,
  staff_user_id TEXT,
  staff_name TEXT,
  meeting_at INTEGER,
  meeting_location TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  CHECK (action NOT IN ('verify', 'reject', 'suspend', 'request_changes', 'approve_event', 'reject_event') OR (staff_user_id IS NOT NULL AND trim(coalesce(staff_name, '')) != '')),
  CHECK (action != 'verify' OR trim(coalesce(notes, '')) != ''),
  CHECK (action != 'schedule_meeting' OR meeting_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS verification_records_subject_idx ON verification_records(subject_type, subject_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS verification_records_staff_idx ON verification_records(staff_user_id, created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS verification_records_no_update BEFORE UPDATE ON verification_records BEGIN SELECT RAISE(ABORT, 'VERIFICATION_RECORD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS verification_records_no_delete BEFORE DELETE ON verification_records BEGIN SELECT RAISE(ABORT, 'VERIFICATION_RECORD_IMMUTABLE'); END;
--> statement-breakpoint
-- 7. terms_documents / terms_acceptances (§4.5). Texts are drafts until legal review.
CREATE TABLE IF NOT EXISTS terms_documents (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL CHECK (length(slug) BETWEEN 2 AND 64 AND slug NOT GLOB '*[^a-z0-9-]*'),
  version TEXT NOT NULL CHECK (length(version) BETWEEN 1 AND 32 AND version NOT GLOB '*[^A-Za-z0-9.-]*'),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  effective_at INTEGER,
  legal_review_status TEXT NOT NULL DEFAULT 'draft_requires_review' CHECK (legal_review_status IN ('draft_requires_review', 'reviewed')),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS terms_documents_slug_version_unique ON terms_documents(slug, version);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS terms_documents_one_active_unique ON terms_documents(slug) WHERE status = 'active';
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS terms_documents_content_immutable BEFORE UPDATE ON terms_documents WHEN NEW.slug != OLD.slug OR NEW.version != OLD.version OR NEW.content_hash != OLD.content_hash BEGIN SELECT RAISE(ABORT, 'TERMS_DOCUMENT_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id TEXT PRIMARY KEY NOT NULL,
  document_slug TEXT NOT NULL,
  document_version TEXT NOT NULL,
  person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_profile_id TEXT REFERENCES customer_profiles(id) ON DELETE SET NULL,
  email_normalized TEXT CHECK (email_normalized IS NULL OR email_normalized = lower(trim(email_normalized))),
  context TEXT NOT NULL CHECK (length(context) BETWEEN 1 AND 200),
  ip_hash TEXT,
  accepted_at INTEGER NOT NULL,
  FOREIGN KEY (document_slug, document_version) REFERENCES terms_documents(slug, version),
  CHECK (person_id IS NOT NULL OR user_id IS NOT NULL OR customer_profile_id IS NOT NULL OR email_normalized IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS terms_acceptances_person_idx ON terms_acceptances(person_id, document_slug) WHERE person_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS terms_acceptances_user_idx ON terms_acceptances(user_id, document_slug) WHERE user_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS terms_acceptances_customer_idx ON terms_acceptances(customer_profile_id, document_slug) WHERE customer_profile_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS terms_acceptances_email_idx ON terms_acceptances(email_normalized, document_slug) WHERE email_normalized IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS terms_acceptances_context_idx ON terms_acceptances(context);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS terms_acceptances_immutable BEFORE UPDATE ON terms_acceptances WHEN NEW.document_slug != OLD.document_slug OR NEW.document_version != OLD.document_version OR NEW.accepted_at != OLD.accepted_at OR NEW.context != OLD.context BEGIN SELECT RAISE(ABORT, 'TERMS_ACCEPTANCE_IMMUTABLE'); END;
--> statement-breakpoint
-- 8. marketing_consents: separate, opt-in, never pre-ticked. The latest row per (email, product) wins.
CREATE TABLE IF NOT EXISTS marketing_consents (
  id TEXT PRIMARY KEY NOT NULL,
  email_normalized TEXT NOT NULL CHECK (email_normalized = lower(trim(email_normalized))),
  product TEXT NOT NULL CHECK (product IN ('web', 'worship', 'academy', 'live', 'production')),
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  source TEXT NOT NULL,
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS marketing_consents_email_idx ON marketing_consents(email_normalized, product, created_at);
--> statement-breakpoint
-- 9. rate_limit_counters: fixed-window counters (T-08). Purged after expires_at.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket TEXT NOT NULL CHECK (length(bucket) BETWEEN 1 AND 200),
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rate_limit_counters_expires_idx ON rate_limit_counters(expires_at);
--> statement-breakpoint
-- 10. email_log / email_suppressions: one outbox for every email (T-12).
CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64 AND kind NOT GLOB '*[^a-z0-9_]*'),
  product TEXT CHECK (product IS NULL OR product IN ('web', 'worship', 'academy', 'live', 'production', 'admin')),
  idempotency_key TEXT NOT NULL UNIQUE,
  recipient_email TEXT,
  recipient_hash TEXT NOT NULL CHECK (length(recipient_hash) = 64),
  subject TEXT,
  related_type TEXT,
  related_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed', 'not_configured')),
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER,
  last_error_code TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_log_retry_idx ON email_log(status, next_attempt_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_log_related_idx ON email_log(related_type, related_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_log_recipient_idx ON email_log(recipient_hash, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_log_provider_idx ON email_log(provider_message_id) WHERE provider_message_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log(created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS email_suppressions (
  email_hash TEXT PRIMARY KEY NOT NULL CHECK (length(email_hash) = 64),
  reason TEXT NOT NULL CHECK (reason IN ('hard_bounce', 'complaint', 'manual')),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
-- 11. ticket_access_log: every view, download, lookup, resend, reissue, transfer and override. No FKs so the log outlives the rows.
CREATE TABLE IF NOT EXISTS ticket_access_log (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT,
  ticket_id TEXT,
  order_id TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'organizer', 'staff', 'scanner')),
  actor_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('view', 'download_pdf', 'download_png', 'lookup', 'resend', 'reissue', 'transfer', 'override')),
  ip_hash TEXT,
  created_at INTEGER NOT NULL,
  CHECK (ticket_id IS NOT NULL OR order_id IS NOT NULL OR event_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_access_log_ticket_idx ON ticket_access_log(ticket_id, created_at) WHERE ticket_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_access_log_order_idx ON ticket_access_log(order_id, created_at) WHERE order_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_access_log_event_idx ON ticket_access_log(event_id, created_at) WHERE event_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_access_log_created_idx ON ticket_access_log(created_at);
--> statement-breakpoint
-- 12. academy_registrations: guest Academy registration (§4.7). No birth dates: an age band only.
CREATE TABLE IF NOT EXISTS academy_registrations (
  id TEXT PRIMARY KEY NOT NULL,
  reference TEXT UNIQUE,
  program_slug TEXT NOT NULL CHECK (length(program_slug) BETWEEN 1 AND 120),
  lesson_slug TEXT,
  location TEXT NOT NULL,
  schedule_text TEXT,
  student_first_name TEXT NOT NULL CHECK (length(trim(student_first_name)) BETWEEN 1 AND 80),
  student_age_band TEXT NOT NULL CHECK (student_age_band IN ('under_6', '6_9', '10_12', '13_15', '16_17', '18_plus')),
  guardian_name TEXT,
  guardian_email TEXT CHECK (guardian_email IS NULL OR guardian_email = lower(trim(guardian_email))),
  guardian_phone TEXT,
  customer_profile_id TEXT NOT NULL REFERENCES customer_profiles(id),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'pending_payment', 'paid', 'cancelled', 'waitlisted')),
  terms_acceptance_id TEXT NOT NULL REFERENCES terms_acceptances(id),
  guardian_consent_acceptance_id TEXT REFERENCES terms_acceptances(id),
  child_safety_acceptance_id TEXT REFERENCES terms_acceptances(id),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (length(currency) = 3 AND currency = lower(currency)),
  stripe_checkout_session_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  paid_at INTEGER,
  cancelled_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (student_age_band = '18_plus' OR (trim(coalesce(guardian_name, '')) != '' AND guardian_email IS NOT NULL AND trim(coalesce(guardian_phone, '')) != '' AND guardian_consent_acceptance_id IS NOT NULL AND child_safety_acceptance_id IS NOT NULL)),
  CHECK (status != 'paid' OR paid_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS academy_registrations_customer_idx ON academy_registrations(customer_profile_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS academy_registrations_program_idx ON academy_registrations(program_slug, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS academy_registrations_status_idx ON academy_registrations(status, created_at);

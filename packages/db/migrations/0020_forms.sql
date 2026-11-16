-- 0020: forms engine and chunked uploads (additive). Plan: docs/superpowers/plans/2026-11-16-forms-emails-invoices.md,
-- Tasks 2.2 and 2.4. Staff edit a draft schema; Publish snapshots an immutable form_versions row; every
-- submission cites the version it answered. Times are epoch seconds. Each statement is on one line where it is
-- a trigger (Wrangler remote splitter rule).
--
-- Deliberate gaps in referential integrity (the service owns them):
--   forms.current_version_id            no FK: forms <-> form_versions would be a cycle; the publish batch sets it.
--   *_user_id columns                   no FK to users: staff attribution survives staff removal, like audit_logs.
--   form_uploads.submission_id          no FK: files upload before the submission exists; attach() sets it and the
--                                       retention job deletes files before the submission row.
--   form_uploads.session_id             nullable, ON DELETE SET NULL: purging a 48 h upload session must never
--                                       delete files already attached to a submission.
-- form_submissions.form_version_id must belong to form_id (composite foreign key). Tables are never dropped
-- here, so this migration is safe to re-run (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE CHECK (length(slug) BETWEEN 1 AND 80 AND slug = lower(slug) AND slug = trim(slug)),
  program TEXT NOT NULL CHECK (program IN ('web', 'worship', 'academy', 'production')),
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 60),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  draft_schema_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(draft_schema_json)),
  current_version_id TEXT,
  confirmation_message TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  retention_months INTEGER CHECK (retention_months IS NULL OR retention_months >= 1),
  updated_by_user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS forms_program_status_idx ON forms(program, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS form_versions (
  id TEXT PRIMARY KEY NOT NULL,
  form_id TEXT NOT NULL REFERENCES forms(id),
  version INTEGER NOT NULL CHECK (version >= 1),
  schema_json TEXT NOT NULL CHECK (json_valid(schema_json)),
  published_by_user_id TEXT,
  published_at INTEGER NOT NULL,
  change_note TEXT,
  content_hash TEXT,
  UNIQUE (form_id, version),
  UNIQUE (id, form_id)
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS form_versions_immutable BEFORE UPDATE OF form_id, version, schema_json, content_hash, published_at ON form_versions BEGIN SELECT RAISE(ABORT, 'form_versions rows are immutable'); END;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  form_id TEXT NOT NULL REFERENCES forms(id),
  form_version_id TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE CHECK (length(reference) BETWEEN 1 AND 40),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'handled', 'spam', 'archived', 'approved', 'declined')),
  submitter_name TEXT,
  submitter_email_normalized TEXT CHECK (submitter_email_normalized IS NULL OR submitter_email_normalized = lower(trim(submitter_email_normalized))),
  submitter_phone TEXT,
  answers_json TEXT NOT NULL CHECK (json_valid(answers_json)),
  binds_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(binds_json)),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  ip_hash TEXT,
  submitted_at INTEGER NOT NULL,
  reviewed_by_user_id TEXT,
  reviewed_at INTEGER,
  staff_notes TEXT,
  delete_after INTEGER,
  FOREIGN KEY (form_version_id, form_id) REFERENCES form_versions(id, form_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_submissions_form_status_idx ON form_submissions(form_id, status, submitted_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_submissions_status_idx ON form_submissions(status, submitted_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_submissions_email_idx ON form_submissions(submitter_email_normalized);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_submissions_delete_after_idx ON form_submissions(delete_after) WHERE delete_after IS NOT NULL;
--> statement-breakpoint
-- Append-only history and internal notes of a submission (status changes, staff notes, exports). Rows are
-- never rewritten (trigger); they go away only with their submission (retention purge, ON DELETE CASCADE).
CREATE TABLE IF NOT EXISTS form_submission_events (
  id TEXT PRIMARY KEY NOT NULL,
  submission_id TEXT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('status', 'note', 'export')),
  actor_user_id TEXT,
  body TEXT,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_submission_events_submission_idx ON form_submission_events(submission_id, created_at);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS form_submission_events_immutable BEFORE UPDATE ON form_submission_events BEGIN SELECT RAISE(ABORT, 'form_submission_events rows are immutable'); END;
--> statement-breakpoint
-- Idempotent builder actions: the client sends an op_id per click, so a double click or retry is a no-op.
CREATE TABLE IF NOT EXISTS form_operations (
  op_id TEXT PRIMARY KEY NOT NULL CHECK (length(op_id) BETWEEN 1 AND 100),
  form_id TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 60),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_operations_form_idx ON form_operations(form_id, created_at);
--> statement-breakpoint
-- Sequential references such as GW-2026-0001: prefix_year = 'GW-2026'; next_value is the next number to hand out.
CREATE TABLE IF NOT EXISTS form_reference_counters (
  prefix_year TEXT PRIMARY KEY NOT NULL CHECK (length(prefix_year) BETWEEN 1 AND 20),
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  form_slug TEXT NOT NULL CHECK (length(form_slug) BETWEEN 1 AND 80),
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS upload_sessions_expires_idx ON upload_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS upload_sessions_ip_idx ON upload_sessions(ip_hash, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS form_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT REFERENCES upload_sessions(id) ON DELETE SET NULL,
  submission_id TEXT,
  question_id TEXT NOT NULL CHECK (length(question_id) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video', 'pdf', 'other')),
  content_type TEXT NOT NULL,
  original_name TEXT,
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  r2_key TEXT NOT NULL UNIQUE,
  multipart_upload_id TEXT,
  parts_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(parts_json)),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'uploaded', 'verified', 'rejected', 'deleted')),
  reject_reason TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_uploads_session_idx ON form_uploads(session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_uploads_submission_idx ON form_uploads(submission_id) WHERE submission_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS form_uploads_status_idx ON form_uploads(status, created_at);

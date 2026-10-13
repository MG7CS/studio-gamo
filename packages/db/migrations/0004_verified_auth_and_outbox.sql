-- Migration 0004: Verified authentication challenges, external staff identity bindings, outbox delivery state, and sensitive document prohibition.
CREATE TABLE auth_challenges (
 id TEXT PRIMARY KEY NOT NULL,
 email TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 purpose TEXT NOT NULL DEFAULT 'signin' CHECK(purpose IN ('signin','verify_email')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0 AND attempts <= 10),
 expires_at INTEGER NOT NULL,
 consumed_at INTEGER,
 ip_hash TEXT,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX auth_challenges_email_idx ON auth_challenges(email, created_at);
--> statement-breakpoint
CREATE INDEX auth_challenges_expires_idx ON auth_challenges(expires_at);
--> statement-breakpoint
CREATE TABLE external_identities (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider TEXT NOT NULL CHECK(provider IN ('cloudflare_access','email_otp')),
 provider_subject TEXT NOT NULL,
 provider_email TEXT NOT NULL,
 provisioned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 verified_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX ext_id_provider_sub_unique ON external_identities(provider, provider_subject);
--> statement-breakpoint
CREATE UNIQUE INDEX ext_id_user_provider_unique ON external_identities(user_id, provider);
--> statement-breakpoint
CREATE INDEX ext_id_user_idx ON external_identities(user_id);
--> statement-breakpoint
ALTER TABLE notification_jobs ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE notification_jobs ADD COLUMN sent_at INTEGER;
--> statement-breakpoint
ALTER TABLE notification_jobs ADD COLUMN last_error TEXT;
--> statement-breakpoint
ALTER TABLE notification_jobs ADD COLUMN provider_message_id TEXT;
--> statement-breakpoint
CREATE TRIGGER media_prohibit_sensitive_docs BEFORE INSERT ON media_files
WHEN NEW.scope_type IN ('identity_document','government_id','student_document','minor_record')
 OR lower(NEW.r2_key) LIKE '%passport%'
 OR lower(NEW.r2_key) LIKE '%driver_license%'
 OR lower(NEW.r2_key) LIKE '%drivers_license%'
 OR lower(NEW.r2_key) LIKE '%government_id%'
 OR lower(NEW.r2_key) LIKE '%student_id%'
 OR lower(NEW.r2_key) LIKE '%birth_certificate%'
BEGIN
 SELECT RAISE(ABORT, 'SENSITIVE_DOCUMENT_PROHIBITED');
END;

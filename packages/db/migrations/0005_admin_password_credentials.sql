-- Migration 0005: Admin password credentials for staff/superadmin gateway login and self-service password rotation.
CREATE TABLE admin_credentials (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 password_hash TEXT NOT NULL,
 must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0, 1)),
 failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0),
 locked_until INTEGER,
 updated_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);

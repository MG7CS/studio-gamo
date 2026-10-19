-- Organizer sign-in sessions. The cookie holds a random token; only its SHA-256 hash is stored here.
CREATE TABLE organizer_sessions (
  id TEXT PRIMARY KEY,
  organizer_id TEXT NOT NULL REFERENCES organizers (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX organizer_sessions_organizer ON organizer_sessions (organizer_id);
CREATE INDEX organizer_sessions_expiry ON organizer_sessions (expires_at);

-- Pending invitations show the invited address to the organization's owners.
ALTER TABLE invitations ADD COLUMN email TEXT;

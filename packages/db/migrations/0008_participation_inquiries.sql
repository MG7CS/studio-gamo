CREATE TABLE participation_inquiries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('general', 'partnership')),
  interest TEXT NOT NULL,
  name TEXT NOT NULL,
  organization TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'closed')),
  review_notes TEXT,
  reviewed_by_user_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX participation_user_idx ON participation_inquiries(user_id, created_at);
CREATE INDEX participation_status_idx ON participation_inquiries(status, created_at);

-- A published event whose organization is reviewed on every event keeps its current version live while a change to
-- when, where or how people get in waits for Gamo. The proposed values wait here; approval applies them, any other
-- decision discards them. At most one proposal per event (a newer edit replaces the older one).
CREATE TABLE event_revisions (
  event_id TEXT PRIMARY KEY REFERENCES events (id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

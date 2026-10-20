-- Gamo can hide a published event and restore it; both are recorded as decisions like every other review action.
-- SQLite cannot change a CHECK constraint in place, so the table is rebuilt with the two new decision words.
CREATE TABLE review_decisions_new (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('event', 'organization')),
  subject_id TEXT NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN ('approved', 'changes_requested', 'rejected', 'verified', 'unverified', 'suspended', 'reinstated', 'hidden', 'restored')),
  note TEXT,
  decided_at INTEGER NOT NULL DEFAULT (unixepoch())
);
INSERT INTO review_decisions_new (id, subject_type, subject_id, decision, note, decided_at)
  SELECT id, subject_type, subject_id, decision, note, decided_at FROM review_decisions;
DROP TABLE review_decisions;
ALTER TABLE review_decisions_new RENAME TO review_decisions;
CREATE INDEX review_decisions_subject ON review_decisions (subject_type, subject_id, decided_at);

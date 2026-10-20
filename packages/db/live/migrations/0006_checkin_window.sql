-- Check-in is not tied to one fixed clock window. The organizer chooses how long before a date check-in opens
-- (events.checkin_opens_hours, default 3) and can also open a date by hand at any time, for early doors or a dry run
-- (event_occurrences.checkin_opened_at, set when they press "Open check-in now", cleared by "Close check-in").
ALTER TABLE events ADD COLUMN checkin_opens_hours INTEGER NOT NULL DEFAULT 3 CHECK (checkin_opens_hours BETWEEN 1 AND 72);
ALTER TABLE event_occurrences ADD COLUMN checkin_opened_at INTEGER;

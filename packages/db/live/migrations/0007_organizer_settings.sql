-- Organizer settings: a default time zone for new events, and a flag that keeps a name the person typed themselves
-- (sign-in otherwise refreshes the name from the identity provider).
ALTER TABLE organizers ADD COLUMN timezone TEXT;
ALTER TABLE organizers ADD COLUMN name_edited INTEGER NOT NULL DEFAULT 0;

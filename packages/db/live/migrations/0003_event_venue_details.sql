-- Each event keeps the venue name and address its organizer typed, so a typo can be fixed and one organization's
-- address never shows on another organization's event at a same-named venue. `venues` stays the shared grouping key.
ALTER TABLE events ADD COLUMN venue_name TEXT;
ALTER TABLE events ADD COLUMN venue_address TEXT;
UPDATE events SET venue_name = (SELECT name FROM venues WHERE venues.id = events.venue_id),
                  venue_address = (SELECT address FROM venues WHERE venues.id = events.venue_id);

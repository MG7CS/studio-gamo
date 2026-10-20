-- Attendee names, when an event requires them, are given at checkout and used for the tickets once the order is
-- paid. A JSON array in ticket order, personal data removed with the buyer's name and email (90-day retention).
ALTER TABLE orders ADD COLUMN attendee_names TEXT;

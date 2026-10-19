-- 0017: hardening from the independent reviews.
-- (1) Customer link tokens and sessions belong to one product (Live or Academy): no link or cookie works in two products.
-- Existing rows keep NULL = unscoped and are refused by the code once it requires a product.
ALTER TABLE customer_access_tokens ADD COLUMN product TEXT CHECK (product IS NULL OR product IN ('web', 'worship', 'academy', 'live', 'production'));
--> statement-breakpoint
ALTER TABLE customer_sessions ADD COLUMN product TEXT CHECK (product IS NULL OR product IN ('web', 'worship', 'academy', 'live', 'production'));
--> statement-breakpoint
-- (2) A category's seats_per_ticket cannot change while it has live holds or tickets (units would mix).
CREATE TRIGGER IF NOT EXISTS tier_seats_per_ticket_locked BEFORE UPDATE OF seats_per_ticket ON ticket_tiers WHEN NEW.seats_per_ticket != OLD.seats_per_ticket AND (OLD.reserved_count > 0 OR OLD.sold_count > 0) BEGIN SELECT RAISE(ABORT, 'TIER_SEATS_LOCKED'); END;

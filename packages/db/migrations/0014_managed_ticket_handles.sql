-- 0014: a managed ticket's qr_token is a random, unpublished handle ('tkm_' + 32 hex), never its id.
-- The id appears in the GL1 QR payload; the legacy token path must not be able to find a managed ticket by it.
DROP TRIGGER IF EXISTS ticket_issue_validate;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS ticket_issue_validate BEFORE INSERT ON tickets WHEN NEW.order_item_id IS NOT NULL BEGIN SELECT CASE WHEN NEW.status != 'valid' OR NEW.seq IS NULL OR NEW.qr_salt IS NULL OR NEW.qr_key_id IS NULL OR NEW.qr_token NOT LIKE 'tkm\_%' ESCAPE '\' OR length(NEW.qr_token) != 36 OR NEW.released_on_void != 0 THEN RAISE(ABORT, 'TICKET_ISSUE_INVALID') WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = NEW.order_item_id AND oi.order_id = NEW.order_id AND oi.event_id = NEW.event_id AND oi.tier_id IS NEW.tier_id AND oi.section_id IS NEW.section_id AND oi.seat_id IS NEW.seat_id AND NEW.seq <= oi.quantity) THEN RAISE(ABORT, 'TICKET_ORDER_ITEM_MISMATCH') WHEN (SELECT coalesce(sum(h.quantity), 0) FROM ticket_holds h WHERE h.order_item_id = NEW.order_item_id AND h.status = 'converted') < NEW.seq THEN RAISE(ABORT, 'TICKET_NOT_SOLD') END; END;
--> statement-breakpoint
UPDATE tickets SET qr_token = 'tkm_' || lower(hex(randomblob(16))) WHERE order_item_id IS NOT NULL AND qr_token = id;

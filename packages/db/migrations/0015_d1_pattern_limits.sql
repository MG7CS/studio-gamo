-- 0015: D1 caps LIKE/GLOB patterns at 50 bytes; 0013's order_reference CHECK used a 68-byte GLOB, so every
-- managed order insert failed on real D1 ("LIKE or GLOB pattern too complex") while node:sqlite accepted it.
-- The column is rebuilt with the same rule written without a long pattern (no managed orders exist yet).
DROP INDEX IF EXISTS ticket_orders_reference_unique;
--> statement-breakpoint
ALTER TABLE ticket_orders DROP COLUMN order_reference;
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN order_reference TEXT CHECK (order_reference IS NULL OR (length(order_reference) = 12 AND substr(order_reference, 1, 3) = 'GL-' AND substr(order_reference, 8, 1) = '-' AND substr(order_reference, 4, 4) GLOB '[0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]' AND substr(order_reference, 9, 4) GLOB '[0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ticket_orders_reference_unique ON ticket_orders(order_reference) WHERE order_reference IS NOT NULL;

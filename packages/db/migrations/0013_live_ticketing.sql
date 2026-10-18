-- Migration 0013: Gamo Live ticketing — categories, venues, sections, order items, policies, scanning.
-- Design of record: docs/design/identity-and-ticketing.md §5 (T-01 inventory authority, T-02 table reuse).
-- Additive only. Times are epoch seconds (UTC); money is integer minor units; currency ISO lower-case.
-- Every trigger stays on one line (docs/DATABASE.md rule 3).
--
-- Inventory model ("units" = tickets × seats_per_ticket):
--   ticket_tiers.reserved_count / venue_sections.reserved_count = units held + sold (unchanged meaning)
--   ticket_tiers.sold_count     / venue_sections.sold_count     = units sold
-- Trigger-managed rows are the ones linked to an order item (ticket_holds.order_item_id / tickets.order_item_id
-- NOT NULL). Older rows written by the pre-0013 code keep their own bookkeeping and are never touched here.

-- 1. Ticket categories (table ticket_tiers; "TicketCategory" in code).
ALTER TABLE ticket_tiers ADD COLUMN kind TEXT NOT NULL DEFAULT 'general' CHECK (kind IN ('general', 'vip', 'child', 'companion', 'accessible', 'group', 'table', 'day_pass', 'multi_day'));
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN description TEXT;
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN sold_count INTEGER NOT NULL DEFAULT 0 CHECK (sold_count >= 0);
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN per_order_limit INTEGER CHECK (per_order_limit IS NULL OR per_order_limit BETWEEN 1 AND 20);
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN min_age INTEGER CHECK (min_age IS NULL OR min_age BETWEEN 0 AND 120);
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN max_age INTEGER CHECK (max_age IS NULL OR max_age BETWEEN 0 AND 120);
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN seats_per_ticket INTEGER NOT NULL DEFAULT 1 CHECK (seats_per_ticket BETWEEN 1 AND 50);
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN zone_codes_json TEXT CHECK (zone_codes_json IS NULL OR json_valid(zone_codes_json));
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN valid_days_json TEXT CHECK (valid_days_json IS NULL OR json_valid(valid_days_json));
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN sales_start_at INTEGER;
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN sales_end_at INTEGER;
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN requires_companion_of TEXT REFERENCES ticket_tiers(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN currency TEXT NOT NULL DEFAULT 'usd' CHECK (length(currency) = 3 AND currency = lower(currency));
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE ticket_tiers ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'sold_out', 'closed'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_tiers_event_sort_idx ON ticket_tiers(event_id, status, sort_order);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS tier_validate_category_insert BEFORE INSERT ON ticket_tiers WHEN NEW.sold_count < 0 OR NEW.sold_count > NEW.reserved_count OR (NEW.min_age IS NOT NULL AND NEW.max_age IS NOT NULL AND NEW.min_age > NEW.max_age) OR (NEW.sales_start_at IS NOT NULL AND NEW.sales_end_at IS NOT NULL AND NEW.sales_start_at >= NEW.sales_end_at) OR NEW.requires_companion_of = NEW.id OR (NEW.requires_companion_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ticket_tiers c WHERE c.id = NEW.requires_companion_of AND c.event_id = NEW.event_id)) BEGIN SELECT RAISE(ABORT, 'TIER_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS tier_validate_category_update BEFORE UPDATE ON ticket_tiers WHEN NEW.sold_count < 0 OR NEW.sold_count > NEW.reserved_count OR (NEW.min_age IS NOT NULL AND NEW.max_age IS NOT NULL AND NEW.min_age > NEW.max_age) OR (NEW.sales_start_at IS NOT NULL AND NEW.sales_end_at IS NOT NULL AND NEW.sales_start_at >= NEW.sales_end_at) OR NEW.requires_companion_of = NEW.id OR (NEW.requires_companion_of IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ticket_tiers c WHERE c.id = NEW.requires_companion_of AND c.event_id = NEW.event_id)) OR NEW.event_id != OLD.event_id BEGIN SELECT RAISE(ABORT, 'TIER_INVALID'); END;
--> statement-breakpoint
-- 2. Venues and blueprints (§5.6).
CREATE TABLE IF NOT EXISTS venues (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT NOT NULL DEFAULT 'US' CHECK (length(country) = 2 AND country = upper(country)),
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 64),
  accessibility_notes TEXT,
  latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS venues_org_idx ON venues(organization_id) WHERE organization_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS venue_maps (
  id TEXT PRIMARY KEY NOT NULL,
  venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL,
  event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
  media_key TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size > 0),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 20000),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 20000),
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (venue_id IS NOT NULL OR event_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS venue_maps_event_idx ON venue_maps(event_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS venue_maps_venue_idx ON venue_maps(venue_id);
--> statement-breakpoint
-- 3. Events (additive).
ALTER TABLE events ADD COLUMN venue_id TEXT REFERENCES venues(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN venue_map_id TEXT REFERENCES venue_maps(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN first_event_review INTEGER NOT NULL DEFAULT 0 CHECK (first_event_review IN (0, 1));
--> statement-breakpoint
ALTER TABLE events ADD COLUMN cancelled_at INTEGER;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN rescheduled_from_starts_at INTEGER;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN door_sales_cash_enabled INTEGER NOT NULL DEFAULT 0 CHECK (door_sales_cash_enabled IN (0, 1));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS events_venue_idx ON events(venue_id) WHERE venue_id IS NOT NULL;
--> statement-breakpoint
-- 4. Sections on a blueprint: price, capacity and category per section.
CREATE TABLE IF NOT EXISTS venue_sections (
  id TEXT PRIMARY KEY NOT NULL,
  venue_map_id TEXT REFERENCES venue_maps(id) ON DELETE SET NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id TEXT NOT NULL REFERENCES ticket_tiers(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 32 AND code NOT GLOB '*[^A-Za-z0-9_-]*'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  capacity INTEGER NOT NULL CHECK (capacity >= 1),
  reserved_count INTEGER NOT NULL DEFAULT 0,
  sold_count INTEGER NOT NULL DEFAULT 0,
  shape_json TEXT CHECK (shape_json IS NULL OR json_valid(shape_json)),
  zone_code TEXT,
  gate_label TEXT,
  accessible INTEGER NOT NULL DEFAULT 0 CHECK (accessible IN (0, 1)),
  companion_seats INTEGER NOT NULL DEFAULT 0 CHECK (companion_seats IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'closed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (reserved_count >= 0 AND reserved_count <= capacity),
  CHECK (sold_count >= 0 AND sold_count <= reserved_count)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS venue_sections_event_code_unique ON venue_sections(event_id, code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS venue_sections_tier_idx ON venue_sections(tier_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS venue_sections_map_idx ON venue_sections(venue_map_id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS external_event_block_sections BEFORE INSERT ON venue_sections WHEN EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND (listing_type = 'external_discovery' OR external_only = 1)) BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EVENT_NO_SECTIONS'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS section_validate_insert BEFORE INSERT ON venue_sections WHEN NEW.reserved_count < 0 OR NEW.reserved_count > NEW.capacity OR NEW.sold_count < 0 OR NEW.sold_count > NEW.reserved_count OR NOT EXISTS (SELECT 1 FROM ticket_tiers t WHERE t.id = NEW.tier_id AND t.event_id = NEW.event_id) OR (NEW.venue_map_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM venue_maps m WHERE m.id = NEW.venue_map_id AND (m.event_id IS NULL OR m.event_id = NEW.event_id))) BEGIN SELECT RAISE(ABORT, 'SECTION_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS section_validate_update BEFORE UPDATE ON venue_sections WHEN NEW.reserved_count < 0 OR NEW.reserved_count > NEW.capacity OR NEW.sold_count < 0 OR NEW.sold_count > NEW.reserved_count OR NEW.event_id != OLD.event_id OR (NEW.tier_id != OLD.tier_id AND OLD.reserved_count > 0) OR NOT EXISTS (SELECT 1 FROM ticket_tiers t WHERE t.id = NEW.tier_id AND t.event_id = NEW.event_id) BEGIN SELECT RAISE(ABORT, 'SECTION_INVALID'); END;
--> statement-breakpoint
-- 5. Individual seats: Phase 2 placeholder (stays empty in Phase 1).
CREATE TABLE IF NOT EXISTS venue_seats (
  id TEXT PRIMARY KEY NOT NULL,
  section_id TEXT NOT NULL REFERENCES venue_sections(id) ON DELETE CASCADE,
  row_label TEXT NOT NULL,
  seat_label TEXT NOT NULL,
  accessible INTEGER NOT NULL DEFAULT 0 CHECK (accessible IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'blocked')),
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS venue_seats_label_unique ON venue_seats(section_id, row_label, seat_label);
--> statement-breakpoint
-- 6. Orders (table ticket_orders; additive). New orders: tier_id/hold_id NULL, order_number = order_reference.
ALTER TABLE ticket_orders ADD COLUMN customer_profile_id TEXT REFERENCES customer_profiles(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN order_reference TEXT CHECK (order_reference IS NULL OR order_reference GLOB 'GL-[0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]-[0-9A-Z][0-9A-Z][0-9A-Z][0-9A-Z]');
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN hold_expires_at INTEGER;
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN stripe_checkout_expires_at INTEGER;
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN amount_refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_refunded_cents >= 0);
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN payment_status TEXT CHECK (payment_status IS NULL OR payment_status IN ('unpaid', 'paid', 'no_payment_required'));
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('none', 'stripe_checkout', 'cash_recorded'));
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN disputed_at INTEGER;
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN cancelled_at INTEGER;
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN policy_snapshot_json TEXT CHECK (policy_snapshot_json IS NULL OR json_valid(policy_snapshot_json));
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN source TEXT NOT NULL DEFAULT 'online' CHECK (source IN ('online', 'door', 'organizer_issue'));
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN verification_required INTEGER NOT NULL DEFAULT 0 CHECK (verification_required IN (0, 1));
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN email_verified_at INTEGER;
--> statement-breakpoint
ALTER TABLE ticket_orders ADD COLUMN updated_at INTEGER;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ticket_orders_reference_unique ON ticket_orders(order_reference) WHERE order_reference IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_orders_customer_idx ON ticket_orders(customer_profile_id, created_at) WHERE customer_profile_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_orders_hold_sweep_idx ON ticket_orders(status, hold_expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_orders_payment_intent_idx ON ticket_orders(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS order_validate_insert BEFORE INSERT ON ticket_orders WHEN NEW.status NOT IN ('pending_verification', 'pending_payment', 'pending_approval', 'paid', 'confirmed', 'partially_refunded', 'refunded', 'cancelled', 'canceled', 'expired', 'disputed', 'paid_unfulfillable') OR NEW.amount_refunded_cents > NEW.total_cents OR NEW.total_cents < 0 OR NEW.quantity < 0 BEGIN SELECT RAISE(ABORT, 'ORDER_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS order_validate_update BEFORE UPDATE ON ticket_orders WHEN NEW.status NOT IN ('pending_verification', 'pending_payment', 'pending_approval', 'paid', 'confirmed', 'partially_refunded', 'refunded', 'cancelled', 'canceled', 'expired', 'disputed', 'paid_unfulfillable') OR NEW.total_cents < 0 OR NEW.quantity < 0 OR NEW.event_id != OLD.event_id BEGIN SELECT RAISE(ABORT, 'ORDER_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS order_refund_bounds BEFORE UPDATE ON ticket_orders WHEN NEW.amount_refunded_cents > NEW.total_cents OR NEW.amount_refunded_cents < OLD.amount_refunded_cents BEGIN SELECT RAISE(ABORT, 'REFUND_EXCEEDS_TOTAL'); END;
--> statement-breakpoint
-- 7. Order items: one row per category/section in an order; prices are snapshots.
CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL REFERENCES ticket_orders(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id TEXT NOT NULL REFERENCES ticket_tiers(id),
  section_id TEXT REFERENCES venue_sections(id),
  seat_id TEXT REFERENCES venue_seats(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  seats_per_ticket INTEGER NOT NULL DEFAULT 1 CHECK (seats_per_ticket BETWEEN 1 AND 50),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  subtotal_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (length(currency) = 3 AND currency = lower(currency)),
  refunded_quantity INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (subtotal_cents = quantity * unit_price_cents),
  CHECK (refunded_quantity >= 0 AND refunded_quantity <= quantity),
  CHECK (seat_id IS NULL OR (section_id IS NOT NULL AND quantity = 1))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS order_items_event_tier_idx ON order_items(event_id, tier_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS order_items_section_idx ON order_items(section_id) WHERE section_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS external_event_block_order_items BEFORE INSERT ON order_items WHEN EXISTS (SELECT 1 FROM events WHERE id = NEW.event_id AND (listing_type = 'external_discovery' OR external_only = 1)) BEGIN SELECT RAISE(ABORT, 'EXTERNAL_EVENT_NO_ORDERS'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS order_item_validate_insert BEFORE INSERT ON order_items WHEN NOT EXISTS (SELECT 1 FROM ticket_orders o WHERE o.id = NEW.order_id AND o.event_id = NEW.event_id) OR NOT EXISTS (SELECT 1 FROM ticket_tiers t WHERE t.id = NEW.tier_id AND t.event_id = NEW.event_id AND t.seats_per_ticket = NEW.seats_per_ticket AND t.currency = NEW.currency) OR (NEW.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM venue_sections s WHERE s.id = NEW.section_id AND s.event_id = NEW.event_id AND s.tier_id = NEW.tier_id)) OR (NEW.seat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM venue_seats st WHERE st.id = NEW.seat_id AND st.section_id = NEW.section_id)) BEGIN SELECT RAISE(ABORT, 'ORDER_ITEM_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS order_item_immutable BEFORE UPDATE ON order_items WHEN NEW.order_id != OLD.order_id OR NEW.event_id != OLD.event_id OR NEW.tier_id != OLD.tier_id OR NEW.section_id IS NOT OLD.section_id OR NEW.seat_id IS NOT OLD.seat_id OR NEW.quantity != OLD.quantity OR NEW.seats_per_ticket != OLD.seats_per_ticket OR NEW.unit_price_cents != OLD.unit_price_cents OR NEW.currency != OLD.currency OR NEW.refunded_quantity < OLD.refunded_quantity BEGIN SELECT RAISE(ABORT, 'ORDER_ITEM_IMMUTABLE'); END;
--> statement-breakpoint
-- 8. Holds (table ticket_holds; additive) and the inventory triggers (T-01).
ALTER TABLE ticket_holds ADD COLUMN order_id TEXT REFERENCES ticket_orders(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ticket_holds ADD COLUMN order_item_id TEXT REFERENCES order_items(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE ticket_holds ADD COLUMN section_id TEXT REFERENCES venue_sections(id);
--> statement-breakpoint
ALTER TABLE ticket_holds ADD COLUMN seat_id TEXT REFERENCES venue_seats(id);
--> statement-breakpoint
ALTER TABLE ticket_holds ADD COLUMN customer_profile_id TEXT REFERENCES customer_profiles(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE ticket_holds ADD COLUMN stripe_checkout_session_id TEXT;
--> statement-breakpoint
ALTER TABLE ticket_holds ADD COLUMN released_at INTEGER;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_holds_order_idx ON ticket_holds(order_id, status) WHERE order_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_holds_order_item_idx ON ticket_holds(order_item_id, status) WHERE order_item_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_holds_event_sweep_idx ON ticket_holds(event_id, status, expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_holds_checkout_idx ON ticket_holds(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ticket_holds_seat_unique ON ticket_holds(event_id, seat_id) WHERE status = 'held' AND seat_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS hold_status_validate_insert BEFORE INSERT ON ticket_holds WHEN NEW.status NOT IN ('held', 'converted', 'expired', 'released') BEGIN SELECT RAISE(ABORT, 'HOLD_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS hold_status_validate_update BEFORE UPDATE ON ticket_holds WHEN NEW.status NOT IN ('held', 'converted', 'expired', 'released') BEGIN SELECT RAISE(ABORT, 'HOLD_INVALID'); END;
--> statement-breakpoint
-- A managed hold must match its order item, be on sale, and fit in both the category and the section; otherwise the whole statement (and batch) aborts.
CREATE TRIGGER IF NOT EXISTS hold_validate_managed_insert BEFORE INSERT ON ticket_holds WHEN NEW.order_item_id IS NOT NULL BEGIN SELECT CASE WHEN NEW.status != 'held' OR typeof(NEW.quantity) != 'integer' OR NEW.quantity < 1 THEN RAISE(ABORT, 'HOLD_INVALID') WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = NEW.order_item_id AND oi.order_id IS NEW.order_id AND oi.event_id = NEW.event_id AND oi.tier_id = NEW.tier_id AND oi.section_id IS NEW.section_id AND oi.seat_id IS NEW.seat_id) THEN RAISE(ABORT, 'HOLD_ORDER_ITEM_MISMATCH') WHEN (SELECT coalesce(sum(h.quantity), 0) FROM ticket_holds h WHERE h.order_item_id = NEW.order_item_id AND h.status IN ('held', 'converted')) + NEW.quantity > (SELECT oi.quantity FROM order_items oi WHERE oi.id = NEW.order_item_id) THEN RAISE(ABORT, 'HOLD_EXCEEDS_ITEM') WHEN NOT EXISTS (SELECT 1 FROM events e WHERE e.id = NEW.event_id AND e.status = 'approved' AND e.cancelled_at IS NULL AND e.admission_type IN ('free', 'paid')) THEN RAISE(ABORT, 'EVENT_NOT_ON_SALE') WHEN NOT EXISTS (SELECT 1 FROM ticket_tiers t WHERE t.id = NEW.tier_id AND t.event_id = NEW.event_id AND t.status = 'active') THEN RAISE(ABORT, 'CATEGORY_NOT_ON_SALE') WHEN NEW.section_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM venue_sections s WHERE s.id = NEW.section_id AND s.event_id = NEW.event_id AND s.tier_id = NEW.tier_id AND s.status = 'active') THEN RAISE(ABORT, 'SECTION_NOT_ON_SALE') WHEN NEW.seat_id IS NOT NULL AND (NEW.quantity != 1 OR NOT EXISTS (SELECT 1 FROM venue_seats st WHERE st.id = NEW.seat_id AND st.section_id = NEW.section_id AND st.status = 'available')) THEN RAISE(ABORT, 'SEAT_INVALID') WHEN NEW.seat_id IS NOT NULL AND EXISTS (SELECT 1 FROM tickets tk WHERE tk.event_id = NEW.event_id AND tk.seat_id = NEW.seat_id AND tk.status NOT IN ('voided', 'refunded')) THEN RAISE(ABORT, 'SEAT_TAKEN') WHEN (SELECT t.reserved_count + NEW.quantity * oi.seats_per_ticket > t.capacity FROM ticket_tiers t, order_items oi WHERE t.id = NEW.tier_id AND oi.id = NEW.order_item_id) THEN RAISE(ABORT, 'SOLD_OUT') WHEN NEW.section_id IS NOT NULL AND (SELECT s.reserved_count + NEW.quantity * oi.seats_per_ticket > s.capacity FROM venue_sections s, order_items oi WHERE s.id = NEW.section_id AND oi.id = NEW.order_item_id) THEN RAISE(ABORT, 'SECTION_SOLD_OUT') END; END;
--> statement-breakpoint
-- Managed holds: only held → converted | expired | released, and their inventory fields never change. A legacy hold can never become managed.
CREATE TRIGGER IF NOT EXISTS hold_transition_guard BEFORE UPDATE ON ticket_holds WHEN NEW.order_item_id IS NOT OLD.order_item_id OR (OLD.order_item_id IS NOT NULL AND (NEW.quantity != OLD.quantity OR NEW.tier_id != OLD.tier_id OR NEW.event_id != OLD.event_id OR NEW.order_id IS NOT OLD.order_id OR NEW.section_id IS NOT OLD.section_id OR NEW.seat_id IS NOT OLD.seat_id OR (NEW.status != OLD.status AND NOT (OLD.status = 'held' AND NEW.status IN ('converted', 'expired', 'released'))))) BEGIN SELECT RAISE(ABORT, 'HOLD_TRANSITION_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS hold_reserve AFTER INSERT ON ticket_holds WHEN NEW.order_item_id IS NOT NULL AND NEW.status = 'held' BEGIN UPDATE ticket_tiers SET reserved_count = reserved_count + NEW.quantity * (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = NEW.order_item_id) WHERE id = NEW.tier_id; UPDATE venue_sections SET reserved_count = reserved_count + NEW.quantity * (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = NEW.order_item_id), updated_at = unixepoch() WHERE id = NEW.section_id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS hold_release AFTER UPDATE OF status ON ticket_holds WHEN OLD.order_item_id IS NOT NULL AND OLD.status = 'held' AND NEW.status IN ('expired', 'released') BEGIN UPDATE ticket_tiers SET reserved_count = reserved_count - OLD.quantity * (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = OLD.order_item_id) WHERE id = OLD.tier_id; UPDATE venue_sections SET reserved_count = reserved_count - OLD.quantity * (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = OLD.order_item_id), updated_at = unixepoch() WHERE id = OLD.section_id; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS hold_convert AFTER UPDATE OF status ON ticket_holds WHEN OLD.order_item_id IS NOT NULL AND OLD.status = 'held' AND NEW.status = 'converted' BEGIN UPDATE ticket_tiers SET sold_count = sold_count + OLD.quantity * (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = OLD.order_item_id) WHERE id = OLD.tier_id; UPDATE venue_sections SET sold_count = sold_count + OLD.quantity * (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = OLD.order_item_id), updated_at = unixepoch() WHERE id = OLD.section_id; END;
--> statement-breakpoint
-- 9. Tickets (additive). New tickets: qr_token = id (a handle, not a credential); qr_signature_hash = sha256(current MAC).
ALTER TABLE tickets ADD COLUMN order_item_id TEXT REFERENCES order_items(id);
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN section_id TEXT REFERENCES venue_sections(id);
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN seat_id TEXT REFERENCES venue_seats(id);
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN customer_profile_id TEXT REFERENCES customer_profiles(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 999999);
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN qr_salt TEXT;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN qr_key_id TEXT CHECK (qr_key_id IS NULL OR qr_key_id GLOB 'GL[1-9]');
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN seq INTEGER CHECK (seq IS NULL OR seq >= 1);
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN zone_code TEXT;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN gate_label TEXT;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN transferred_from_ticket_email TEXT;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN transfer_count INTEGER NOT NULL DEFAULT 0 CHECK (transfer_count BETWEEN 0 AND 3);
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN voided_at INTEGER;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN void_reason TEXT CHECK (void_reason IS NULL OR void_reason IN ('event_cancelled', 'dispute', 'organizer', 'staff', 'unfulfillable'));
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN refunded_at INTEGER;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN issued_at INTEGER;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN updated_at INTEGER;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN released_on_void INTEGER NOT NULL DEFAULT 0 CHECK (released_on_void IN (0, 1));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tickets_order_item_seq_unique ON tickets(order_item_id, seq) WHERE order_item_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tickets_seat_unique ON tickets(event_id, seat_id) WHERE seat_id IS NOT NULL AND status NOT IN ('voided', 'refunded');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tickets_customer_idx ON tickets(customer_profile_id) WHERE customer_profile_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tickets_section_idx ON tickets(section_id) WHERE section_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS ticket_status_validate_insert BEFORE INSERT ON tickets WHEN NEW.status NOT IN ('valid', 'checked_in', 'voided', 'refunded') BEGIN SELECT RAISE(ABORT, 'TICKET_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS ticket_status_validate_update BEFORE UPDATE ON tickets WHEN NEW.status NOT IN ('valid', 'checked_in', 'voided', 'refunded') BEGIN SELECT RAISE(ABORT, 'TICKET_INVALID'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS ticket_terminal_guard BEFORE UPDATE OF status ON tickets WHEN OLD.status IN ('voided', 'refunded') AND NEW.status NOT IN ('voided', 'refunded') BEGIN SELECT RAISE(ABORT, 'TICKET_TERMINAL'); END;
--> statement-breakpoint
-- A managed ticket is issued only for a converted (sold) hold of its order item, at most one per seq, seq ≤ quantity.
CREATE TRIGGER IF NOT EXISTS ticket_issue_validate BEFORE INSERT ON tickets WHEN NEW.order_item_id IS NOT NULL BEGIN SELECT CASE WHEN NEW.status != 'valid' OR NEW.seq IS NULL OR NEW.qr_salt IS NULL OR NEW.qr_key_id IS NULL OR NEW.qr_token != NEW.id OR NEW.released_on_void != 0 THEN RAISE(ABORT, 'TICKET_ISSUE_INVALID') WHEN NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.id = NEW.order_item_id AND oi.order_id = NEW.order_id AND oi.event_id = NEW.event_id AND oi.tier_id IS NEW.tier_id AND oi.section_id IS NEW.section_id AND oi.seat_id IS NEW.seat_id AND NEW.seq <= oi.quantity) THEN RAISE(ABORT, 'TICKET_ORDER_ITEM_MISMATCH') WHEN (SELECT coalesce(sum(h.quantity), 0) FROM ticket_holds h WHERE h.order_item_id = NEW.order_item_id AND h.status = 'converted') < NEW.seq THEN RAISE(ABORT, 'TICKET_NOT_SOLD') END; END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS ticket_managed_immutable BEFORE UPDATE ON tickets WHEN NEW.order_item_id IS NOT OLD.order_item_id OR NEW.version < OLD.version OR NEW.released_on_void < OLD.released_on_void OR (OLD.order_item_id IS NOT NULL AND (NEW.seq IS NOT OLD.seq OR NEW.order_id != OLD.order_id OR NEW.event_id != OLD.event_id OR NEW.section_id IS NOT OLD.section_id OR NEW.seat_id IS NOT OLD.seat_id OR NEW.status = 'checked_in')) BEGIN SELECT RAISE(ABORT, 'TICKET_IMMUTABLE'); END;
--> statement-breakpoint
-- valid → voided | refunded gives back seats_per_ticket units (category + section) exactly once.
CREATE TRIGGER IF NOT EXISTS ticket_release AFTER UPDATE OF status ON tickets WHEN NEW.order_item_id IS NOT NULL AND OLD.status NOT IN ('voided', 'refunded') AND NEW.status IN ('voided', 'refunded') AND OLD.released_on_void = 0 BEGIN UPDATE ticket_tiers SET reserved_count = reserved_count - (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = NEW.order_item_id), sold_count = sold_count - (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = NEW.order_item_id) WHERE id = (SELECT oi.tier_id FROM order_items oi WHERE oi.id = NEW.order_item_id); UPDATE venue_sections SET reserved_count = reserved_count - (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = NEW.order_item_id), sold_count = sold_count - (SELECT oi.seats_per_ticket FROM order_items oi WHERE oi.id = NEW.order_item_id), updated_at = unixepoch() WHERE id = (SELECT oi.section_id FROM order_items oi WHERE oi.id = NEW.order_item_id); UPDATE tickets SET released_on_void = 1 WHERE id = NEW.id; END;
--> statement-breakpoint
-- 10. Event policies (§5.4): bounds are CHECKs; defaults match EVENT_POLICY_DEFAULTS in packages/domain/src/types.
CREATE TABLE IF NOT EXISTS event_policies (
  event_id TEXT PRIMARY KEY NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reentry_allowed INTEGER NOT NULL DEFAULT 1 CHECK (reentry_allowed IN (0, 1)),
  reentry_limit INTEGER CHECK (reentry_limit IS NULL OR reentry_limit BETWEEN 1 AND 20),
  refund_policy TEXT NOT NULL DEFAULT 'until_48h' CHECK (refund_policy IN ('none', 'until_start', 'until_24h', 'until_48h', 'until_7d', 'organizer_discretion')),
  refund_cutoff_hours INTEGER CHECK (refund_cutoff_hours IS NULL OR refund_cutoff_hours BETWEEN 0 AND 168),
  transfer_allowed INTEGER NOT NULL DEFAULT 1 CHECK (transfer_allowed IN (0, 1)),
  transfer_cutoff_hours INTEGER NOT NULL DEFAULT 0 CHECK (transfer_cutoff_hours BETWEEN 0 AND 168),
  max_transfers_per_ticket INTEGER NOT NULL DEFAULT 3 CHECK (max_transfers_per_ticket BETWEEN 0 AND 3),
  attendee_names_required INTEGER NOT NULL DEFAULT 0 CHECK (attendee_names_required IN (0, 1)),
  max_tickets_per_order INTEGER NOT NULL DEFAULT 10 CHECK (max_tickets_per_order BETWEEN 1 AND 20),
  door_sales_enabled INTEGER NOT NULL DEFAULT 0 CHECK (door_sales_enabled IN (0, 1)),
  door_sales_methods_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(door_sales_methods_json)),
  age_policy TEXT NOT NULL DEFAULT 'all_ages' CHECK (age_policy IN ('all_ages', 'min_age')),
  min_age INTEGER CHECK (min_age IS NULL OR min_age BETWEEN 1 AND 21),
  scan_opens_minutes_before INTEGER NOT NULL DEFAULT 120 CHECK (scan_opens_minutes_before BETWEEN 0 AND 720),
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((age_policy = 'all_ages' AND min_age IS NULL) OR (age_policy = 'min_age' AND min_age IS NOT NULL)),
  CHECK (reentry_allowed = 1 OR reentry_limit IS NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS event_changes (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cancelled', 'rescheduled', 'venue_changed', 'details')),
  before_json TEXT NOT NULL CHECK (json_valid(before_json)),
  after_json TEXT NOT NULL CHECK (json_valid(after_json)),
  notified_at INTEGER,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS event_changes_event_idx ON event_changes(event_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  tier_id TEXT REFERENCES ticket_tiers(id) ON DELETE CASCADE,
  customer_profile_id TEXT NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'converted', 'removed')),
  notified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_unique ON waitlist_entries(event_id, coalesce(tier_id, ''), customer_profile_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS waitlist_entries_queue_idx ON waitlist_entries(event_id, tier_id, status, created_at);
--> statement-breakpoint
-- 11. Door staff: scanner sessions (link + PIN, no account) and the devices that unlocked them (T-09).
CREATE TABLE IF NOT EXISTS scanner_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  link_token_hash TEXT NOT NULL UNIQUE CHECK (length(link_token_hash) = 64),
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  allowed_directions TEXT NOT NULL DEFAULT 'in' CHECK (allowed_directions IN ('in', 'out', 'both')),
  allowed_zones_json TEXT CHECK (allowed_zones_json IS NULL OR json_valid(allowed_zones_json)),
  can_override INTEGER NOT NULL DEFAULT 0 CHECK (can_override IN (0, 1)),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  failed_pin_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_pin_attempts >= 0),
  locked_until INTEGER,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK (expires_at > created_at)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scanner_sessions_event_idx ON scanner_sessions(event_id, revoked_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scanner_sessions_expires_idx ON scanner_sessions(expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS scanner_devices (
  id TEXT PRIMARY KEY NOT NULL,
  scanner_session_id TEXT NOT NULL REFERENCES scanner_sessions(id) ON DELETE CASCADE,
  device_label TEXT,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_seen_at INTEGER,
  last_sync_at INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scanner_devices_session_idx ON scanner_devices(scanner_session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scanner_devices_expires_idx ON scanner_devices(expires_at);
--> statement-breakpoint
-- 12. Scans: every attempt (including unknown codes) and the per-ticket, per-day presence state (§5.3).
CREATE TABLE IF NOT EXISTS ticket_scan_events (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  ticket_version INTEGER,
  scanner_session_id TEXT REFERENCES scanner_sessions(id) ON DELETE SET NULL,
  scanner_device_id TEXT REFERENCES scanner_devices(id) ON DELETE SET NULL,
  scanned_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  gate TEXT,
  result TEXT NOT NULL CHECK (result IN ('admitted', 'exited', 'already_inside', 'already_used', 'reentry_denied', 'not_inside', 'wrong_event', 'wrong_zone', 'voided', 'refunded', 'stale_version', 'invalid', 'not_found', 'not_open_yet', 'event_cancelled', 'override_admitted')),
  override_reason TEXT,
  client_scan_id TEXT CHECK (client_scan_id IS NULL OR length(client_scan_id) BETWEEN 1 AND 64),
  device_scanned_at INTEGER,
  received_at INTEGER NOT NULL,
  offline INTEGER NOT NULL DEFAULT 0 CHECK (offline IN (0, 1)),
  conflict TEXT NOT NULL DEFAULT 'none' CHECK (conflict IN ('none', 'duplicate_offline', 'superseded')),
  day_key TEXT CHECK (day_key IS NULL OR day_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CHECK (result != 'override_admitted' OR trim(coalesce(override_reason, '')) != '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ticket_scan_events_client_unique ON ticket_scan_events(scanner_session_id, client_scan_id) WHERE scanner_session_id IS NOT NULL AND client_scan_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_scan_events_event_idx ON ticket_scan_events(event_id, received_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_scan_events_ticket_idx ON ticket_scan_events(ticket_id, received_at) WHERE ticket_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_scan_events_conflict_idx ON ticket_scan_events(event_id, conflict) WHERE conflict != 'none';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ticket_presence (
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL CHECK (day_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('outside', 'inside')),
  entry_count INTEGER NOT NULL DEFAULT 0 CHECK (entry_count >= 0),
  exit_count INTEGER NOT NULL DEFAULT 0 CHECK (exit_count >= 0 AND exit_count <= entry_count),
  first_entry_at INTEGER,
  last_scan_at INTEGER NOT NULL,
  last_gate TEXT,
  last_scan_event_id TEXT,
  PRIMARY KEY (ticket_id, day_key)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ticket_presence_event_idx ON ticket_presence(event_id, day_key, state);

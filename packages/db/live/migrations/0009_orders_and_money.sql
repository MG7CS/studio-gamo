-- Orders, tickets, payments, refunds, disputes, transfers, Stripe webhook events, the ledger and payouts
-- (docs/LIVE_DATA_MODEL.md section 8, docs/LIVE_PAYMENTS.md). Money is integer cents with its currency.
-- A pending order is the hold: its quantities stay counted in ticket_inventory until it is paid or expires.
-- No semicolons inside comments: the test harness splits this file on them.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL REFERENCES events (id),
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences (id),
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  channel TEXT NOT NULL CHECK (channel IN ('online', 'door')),
  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('card_online', 'phone_qr', 'card_reader', 'cash', 'comp', 'free')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'paid_unfulfilled', 'canceled', 'expired', 'refunded', 'partially_refunded', 'voided')),
  disputed INTEGER NOT NULL DEFAULT 0 CHECK (disputed IN (0, 1)),
  is_preview INTEGER NOT NULL DEFAULT 0 CHECK (is_preview IN (0, 1)),
  funds_flow TEXT CHECK (funds_flow IS NULL OR funds_flow IN ('organizer_account', 'gamo_collects')),
  seller TEXT NOT NULL CHECK (seller IN ('organization', 'gamo')),
  stripe_account_id TEXT,
  livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1)),
  buyer_name TEXT,
  buyer_email TEXT,
  email_hash TEXT,
  currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  fee_payer TEXT NOT NULL DEFAULT 'buyer' CHECK (fee_payer IN ('buyer', 'organizer')),
  gift_cents INTEGER NOT NULL DEFAULT 0 CHECK (gift_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  amount_refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_refunded_cents >= 0),
  code_id TEXT REFERENCES event_codes (id),
  policy_snapshot TEXT NOT NULL,
  fee_snapshot TEXT NOT NULL,
  terms_version TEXT,
  comp_reason TEXT CHECK (comp_reason IS NULL OR length(comp_reason) <= 200),
  hold_expires_at INTEGER,
  checkout_session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  staff_link_id TEXT,
  cash_session_id TEXT,
  reader_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  paid_at INTEGER,
  canceled_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (discount_cents <= subtotal_cents),
  CHECK (total_cents = subtotal_cents - discount_cents + (CASE fee_payer WHEN 'buyer' THEN fee_cents ELSE 0 END) + gift_cents),
  CHECK (amount_refunded_cents <= total_cents),
  CHECK (payment_method <> 'comp' OR (comp_reason IS NOT NULL AND total_cents = 0)),
  CHECK (funds_flow IS NOT NULL OR payment_method IN ('cash', 'comp', 'free')),
  CHECK (channel = 'door' OR payment_method IN ('card_online', 'comp', 'free'))
);
CREATE INDEX orders_occurrence ON orders (occurrence_id, status);
CREATE INDEX orders_event ON orders (event_id, created_at);
CREATE INDEX orders_organization ON orders (organization_id, created_at);
CREATE INDEX orders_email ON orders (email_hash);
CREATE INDEX orders_pending_expiry ON orders (occurrence_id, hold_expires_at) WHERE status = 'pending';

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id),
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  people_per_ticket INTEGER NOT NULL DEFAULT 1 CHECK (people_per_ticket BETWEEN 1 AND 20),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  CHECK (discount_cents <= unit_price_cents * quantity)
);
CREATE INDEX order_items_order ON order_items (order_id);

-- One ticket per seat (a group pack is one ticket for several people). The QR credential is derived with a keyed
-- HMAC over the ticket id, credential_version and credential_salt, so bumping both invalidates every old image.
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  order_item_id TEXT NOT NULL REFERENCES order_items (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL CHECK (seq >= 1),
  event_id TEXT NOT NULL REFERENCES events (id),
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences (id),
  ticket_type_id TEXT NOT NULL REFERENCES ticket_types (id),
  holder_name TEXT,
  holder_email TEXT,
  email_hash TEXT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'refunded', 'voided', 'canceled')),
  credential_version INTEGER NOT NULL DEFAULT 1 CHECK (credential_version >= 1),
  credential_salt TEXT NOT NULL,
  checked_in_at INTEGER,
  checked_in_by TEXT,
  transfer_count INTEGER NOT NULL DEFAULT 0 CHECK (transfer_count >= 0),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (order_item_id, seq)
);
CREATE INDEX tickets_order ON tickets (order_id);
CREATE INDEX tickets_occurrence ON tickets (occurrence_id, status);
CREATE INDEX tickets_email ON tickets (email_hash);

-- Every attempt to collect money for an order (Checkout Session, card-present PaymentIntent, cash, comp).
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('checkout_session', 'card_present', 'cash', 'comp')),
  provider_ref TEXT UNIQUE,
  stripe_account_id TEXT,
  reader_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'expired')),
  failure_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX payments_order ON payments (order_id);

-- Stripe webhook events: claim, process, mark. The claim token is checked when marking so a stale claim that was
-- taken over cannot overwrite the newer result.
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  account_id TEXT,
  livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  claim_token TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  processed_at INTEGER,
  error_code TEXT,
  stripe_created_at INTEGER,
  received_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX stripe_events_status ON stripe_events (status, claimed_at);

CREATE TABLE refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  ticket_ids TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  gift_cents INTEGER NOT NULL DEFAULT 0 CHECK (gift_cents >= 0),
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  method TEXT NOT NULL CHECK (method IN ('stripe', 'cash', 'none')),
  requested_by TEXT NOT NULL CHECK (requested_by IN ('buyer', 'organizer', 'admin', 'system')),
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'declined', 'pending', 'succeeded', 'failed', 'canceled')),
  stripe_refund_id TEXT UNIQUE,
  cash_session_id TEXT,
  decided_note TEXT CHECK (decided_note IS NULL OR length(decided_note) <= 500),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  decided_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (gift_cents + fee_cents <= amount_cents)
);
CREATE INDEX refunds_order ON refunds (order_id);
CREATE INDEX refunds_status ON refunds (status, created_at);

CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  stripe_dispute_id TEXT NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  reason TEXT,
  status TEXT NOT NULL,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('won', 'lost', 'warning_closed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  closed_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX disputes_open ON disputes (closed_at, created_at);

-- A transfer never carries a price (no resale).
CREATE TABLE ticket_transfers (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  from_name TEXT,
  from_email_hash TEXT,
  to_name TEXT,
  to_email_hash TEXT NOT NULL,
  version_from INTEGER NOT NULL,
  version_to INTEGER NOT NULL CHECK (version_to = version_from + 1),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX ticket_transfers_ticket ON ticket_transfers (ticket_id, created_at);

-- Append-only ledger. held_by says who holds the money: the organization (its own Stripe account, or cash) or Gamo
-- (Gamo collects). source_key makes every write idempotent. Categories come from GAMO_NONPROFIT_MODEL.md section 5.3.
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  event_id TEXT REFERENCES events (id),
  order_id TEXT REFERENCES orders (id),
  refund_id TEXT REFERENCES refunds (id),
  dispute_id TEXT REFERENCES disputes (id),
  payout_id TEXT,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('ticket_sale', 'gift', 'gamo_fee', 'processing_cost', 'refund', 'gift_refund', 'fee_refund',
                          'dispute', 'dispute_reversal', 'payout', 'cash_sale', 'cash_refund')),
  category TEXT NOT NULL
    CHECK (category IN ('program_service_receipt', 'third_party_payable', 'processing_cost', 'refund', 'dispute')),
  held_by TEXT NOT NULL CHECK (held_by IN ('organization', 'gamo')),
  funds_flow TEXT CHECK (funds_flow IS NULL OR funds_flow IN ('organizer_account', 'gamo_collects')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  source_key TEXT NOT NULL UNIQUE,
  stripe_balance_transaction_id TEXT,
  occurred_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX ledger_organization ON ledger_entries (organization_id, occurred_at);
CREATE INDEX ledger_event ON ledger_entries (event_id, occurred_at);
CREATE INDEX ledger_order ON ledger_entries (order_id);

-- Mode B only. Prepared in the admin, sent only with the owner's explicit approval (test mode only).
CREATE TABLE payouts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations (id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'approved', 'sent', 'failed', 'canceled')),
  stripe_transfer_id TEXT UNIQUE,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  prepared_at INTEGER NOT NULL DEFAULT (unixepoch()),
  approved_at INTEGER,
  sent_at INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX payouts_organization ON payouts (organization_id, prepared_at);

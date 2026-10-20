# Gamo Live — data model (2026-10-19)

Implements [`LIVE_REQUIREMENTS.md`](LIVE_REQUIREMENTS.md). Sections 1–6 describe migrations `0001`–`0007` (built). Section 8 adds paid ticketing, door sales, payments and verification meetings (migrations `0008`–`0012`, built as proposals for the owner's approval). How money moves is in [`LIVE_PAYMENTS.md`](LIVE_PAYMENTS.md).

## 1. Where it lives (owner approved 2026-10-19)

**Recommendation: a new D1 database owned by Gamo Live** (`gamo-live-db-preview`, `gamo-live-db-production`), with its own migrations folder (`packages/db/live/migrations`) and its own Drizzle schema. Reasons: products stay independent (AGENTS.md rebuild scope); no collision with the old `events`/`organizations` tables; the old database is retired by simply not binding it; the admin binds both databases only where it needs to. Binding name `LIVE_DB` in `apps/live` and `apps/admin`. Creating the databases is an owner-run Cloudflare action (`docs/RUNBOOK.md`). Alternative: new `live_*` tables in the shared database (fewer resources, but the old schema stays in the way). Production data is never reset or dropped without your approval.

## 2. Conventions

- Ids are prefixed random text (`evt_…`, `org_…`). Times are UTC epoch seconds plus an IANA zone on the event; display always uses the event's own zone. Money is integer minor units (cents) with a currency (`usd` only for now). Free and external events keep the organizer's price text; paid events store prices on their ticket types (section 8).
- Emails are stored once, lower-cased, for the registrant (needed to send their confirmation); lookups and rate limits use a keyed hash (`PII_HASH_SECRET`). Email codes are stored only as keyed hashes; manage links are signed, expiring values (nothing stored); the check-in code is derived from the registration with a secret.
- Every table has `created_at`; mutable ones have `updated_at`. Enumerations are `CHECK` constraints. Foreign keys are on.
- Review decisions are a **decision history shown to the organizer** (not an audit log; the admin is a single person behind Cloudflare Access).

## 3. Tables

**People and organizations**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `organizers` | `id`, `clerk_user_id` unique, `email`, `display_name` | One row per signed-in organizer, created on first sign-in from the verified Clerk identity. Live's own Clerk application only. |
| `organizations` | `id`, `name`, `slug` unique, `kind` (`church`,`ministry`,`artist`,`organizer`), `city`, `state`, `website`, `contact_email`, `description`, `status` (`active`,`suspended`), `verified_at`, `review_every_event` (0/1), `first_event_approved_at` | `verified_at` is set only by an admin decision. `suspended` hides the organization's events everywhere. |
| `memberships` | `organization_id`, `organizer_id`, `role` (`owner`,`member`) | Unique pair. Owners invite by email; v1 members can do everything except edit membership and the organization profile. |
| `invitations` | `id`, `organization_id`, `email_hash`, `token_hash`, `expires_at`, `accepted_at` | Emailed accept link; the accepting person must be signed in with that email. |

**Places and events**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `venues` | `id`, `name`, `address`, `city`, `state`, `metro_slug`, `timezone`, `lat`, `lng` | A grouping key shared by events (unique on name, city, state); the venues page lists only venues with a published occurrence. The name and address an organizer typed are kept on the event itself (`events.venue_name`, `events.venue_address`, migration 0003), so a typo can be fixed and one organization's address never shows on another's event. |
| `events` | `id`, `organization_id` (null for catalog listings), `origin` (`organizer`,`catalog`), `slug` unique, `title`, `category`, `description`, `venue_id`, `timezone`, `admission` (`free_open`,`free_registration`,`external_tickets`,`paid_tickets`; the last added by migration 0008), `external_url`, `price_text`, `refund_policy_text`, `capacity`, `max_party_size`, `qr_checkin` (0/1, default 0), `image_key`, `image_rights_confirmed_at`, `recurrence` (JSON: `weekly`/`monthly`, interval, until), `featured` (editorial, set only by the admin, always labeled), `status`, `published_at`, `venue_name`, `venue_address`, `checkin_opens_hours` (1, 3, 12 or 24; default 3) | `status`: `draft`, `pending_review`, `changes_requested`, `published`, `rejected`, `canceled`, `hidden`. `qr_checkin` may be 1 only when `admission` is `free_registration` or `paid_tickets` (paid tickets always carry a QR code). `capacity` null means unlimited; for paid events it caps the people admitted per date across all ticket types. |
| `event_occurrences` | `id`, `event_id`, `starts_at`, `ends_at`, `status` (`scheduled`,`canceled`), `seats_taken`, `registered_total`, `checked_in_total`, `checkin_opened_at` (set when the organizer opens check-in by hand) | A one-time event has one row. Recurring events are expanded at save time, at most **52 occurrences** and never beyond the "until" date (no scheduled jobs needed; the organizer extends a series by editing it). Capacity is per occurrence. |
| `event_performers` | `event_id`, `position`, `name`, `role` | Feeds the artists pages. |
| `catalog_sources` | `event_id`, `source_url`, `provider`, `destination_kind`, `last_verified_at`, `import_key` unique | Provenance of editorial listings; the 20-event import maps here. Catalog events are `admission = external_tickets`. |

**Registration (free events, no attendee account)**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `registrations` | `id`, `occurrence_id`, `name`, `email`, `email_hash`, `party_size`, `status` (`pending`,`confirmed`,`canceled`,`expired`), `checkin_code` (only when the event has QR on; derived with an HMAC at confirmation, never guessable), `terms_version`, `expires_at` (pending hold), `confirmed_at`, `canceled_at`, `checked_in_at`, `checked_in_party` | Unique (`occurrence_id`, `email_hash`) among `pending`/`confirmed`. |
| `email_codes` | `id`, `registration_id`, `code_hash`, `expires_at`, `attempts`, `consumed_at` | 6-digit code, 10-minute expiry, 5 attempts, one use. |
| `rate_limit_counters` | `bucket`, `window_start`, `count`, `expires_at` | Fixed-window limits on registration and code attempts. |
| `email_outbox` | `id`, `kind`, `to_hash`, `payload` (no full body), `status`, `attempts`, `next_attempt_at`, `provider_id` | Retry with backoff; the confirmation email carries the manage link. |

**Review and legal**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `event_revisions` | `event_id` (primary key), `payload` (JSON of the proposed venue, address, time zone, schedule, admission, external URL, capacity, QR), `created_at` | A published event whose organization is reviewed on every event, or that sends people to another site for tickets, keeps its current version live while a change to when, where or how people get in waits here for Gamo (migration 0004). Approval applies it (dates only while nobody holds a registration); any other decision discards it. Wording, price notes and performers save straight away. One proposal per event; a newer edit replaces it, and editing back to the live values withdraws it. |
| `review_decisions` | `id`, `subject_type` (`event`,`organization`), `subject_id`, `decision` (`approved`,`changes_requested`,`rejected`,`verified`,`unverified`,`suspended`,`reinstated`, `hidden`, `restored`), `note`, `decided_at` | The organizer sees the note. Concurrent decisions: only the first on a given `pending_review` version wins (conditional update on `status`). |
| `terms_acceptances` | `organizer_id`, `document`, `version`, `accepted_at` | Organizer terms; registrant consent is on the registration row. |

## 4. Rules the database enforces

- **No overselling:** registering runs one batch: release this occurrence's expired `pending` holds, then `UPDATE event_occurrences SET seats_taken = seats_taken + :party WHERE id = :id AND (capacity-check)`; the registration insert happens only if one row changed. Cancel and expiry subtract the same party size. Pending holds last 15 minutes.
- **Past is closed:** an occurrence whose `starts_at` has passed accepts no registration (checked on the server, not only hidden in the page); lists show **Past · Closed** and sort after upcoming ones.
- **First scan wins:** check-in is `UPDATE … SET checked_in_at = :now WHERE id = :id AND checked_in_at IS NULL`; zero rows means "already admitted" and the screen shows when.
- **Review gate:** a first event (no `first_event_approved_at`) or an organization with `review_every_event` goes to `pending_review`; edits to a published event of such an organization return it to `pending_review`, other organizations' edits publish at once. Only an admin decision sets `published`/`verified_at`.
- **Suspended organizations and `hidden` events** never appear in any public query.
- **Public queries select only** `published` events of `active` organizations (and catalog events approved by the admin).

## 5. Privacy and retention (proposals)

- Registrant name, email and party size are visible only to the organizing organization's members and the admin; exports are for the organizer's own event.
- **Owner decision:** registrant personal data (name, email, party details, hashes) is deleted 90 days after the event's last occurrence, by an admin-run cleanup that reports how many rows it removed (no silent job). Non-personal facts about past events stay: title, date, venue, organization, performers, and aggregate counts (registered, checked in). Counts are stored on the occurrence before deletion (`registered_total`, `checked_in_total`).
- Gamo never sells or shares registrant data; the organizer terms say what organizers may do with it (draft for counsel).

## 6. Seeding and import

`scripts/live/editorial-cli.ts` is rewritten to import `data/gamo_live_verified_events_2026-10-15.json` into `events`, `venues`, `event_performers`, `catalog_sources` (status `hidden` until the admin approves). Local only; `--env preview|production` supports `--dry-run`, never `--apply`.

## 7. What each screen reads and writes

See [`LIVE_SCREENS.md`](LIVE_SCREENS.md).

## 8. Paid ticketing, door sales, payments and verification (migrations 0008–0012, proposal built 2026-10-19)

Same conventions as section 2: prefixed random ids, UTC epoch seconds with the event's IANA zone, integer cents with `currency`, `CHECK` enumerations, keyed hashes for email lookups, no plain secrets (link tokens, PINs and credentials are stored only as keyed hashes or derived on demand). No triggers: every multi-row rule is a conditional update in one D1 batch, or a `CHECK` that makes the whole batch roll back.

**Migration 0008 rebuilds `events`** to add `paid_tickets` to `admission` and relax the QR rule. D1 always enforces foreign keys and `DROP TABLE` cascades, so the migration copies every dependent table (occurrences, performers, catalog sources, revisions, registrations, email codes) aside, rebuilds `events`, and restores them unchanged in the same migration. Back up the database before applying it remotely (`docs/RUNBOOK.md`).

**Event setup**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `event_ticketing` | `event_id` (PK), `currency`, `fee_payer` (`buyer` = pass on, `organizer` = absorb), `refund_policy` (`none`,`until_hours_before`,`until_start`), `refund_hours` (24, 48, 72 or 168), `transfers_allowed`, `transfer_cutoff_hours` (0–168), `reentry_allowed`, `entry_notes` (≤ 280), `names_required`, `gifts_enabled`, `gift_presets` (JSON cents), `door_sales_enabled`, `max_tickets_per_order` | One row per paid event. These are the policies the organizer chooses; each order copies them (`orders.policy_snapshot`). |
| `ticket_types` | `id` (`tty_`), `event_id`, `name`, `description`, `kind` (`general`,`vip`,`child`,`student`,`group`,`day_pass`,`other`), `price_cents`, `currency`, `people_per_ticket` (group/family packs), `capacity` (tickets per date, null = only the event cap), `door_allocation` (held back for the door), `door_uses_online` (door may also sell the online pool), `per_order_limit`, `sales_start_at`, `sales_end_at`, `status` (`on_sale`,`hidden`,`ended`), `position` | "Sold out" is never stored: it is computed from inventory. A `hidden` type is shown only with an access code that names it (presale). A price-0 type is allowed so free registration could move onto ticket types later (not migrated). |
| `price_deadlines` | `id` (`tpd_`), `ticket_type_id`, `price_cents`, `ends_at` | Early-bird prices: the first deadline still ahead applies, then the type's own price. |
| `event_codes` | `id` (`cod_`), `event_id`, `code` (upper case, unique per event), `kind` (`promo`,`access`), `discount_kind` (`percent`,`amount`), `percent_off`, `amount_off_cents`, `ticket_type_ids` (JSON, null = all), `max_uses`, `uses`, `starts_at`, `ends_at`, `status` (`active`,`disabled`) | `CHECK (uses <= max_uses)` makes a use atomic. One use per order, given back when an unpaid order expires or is canceled. |
| `ticket_inventory` | `ticket_type_id` + `occurrence_id` (PK), `capacity`, `door_allocation`, `door_uses_online`, `online_taken`, `door_taken` | Per type and date. `CHECK (capacity IS NULL OR online_taken + MAX(door_allocation, door_taken) <= capacity)` and `CHECK (door_uses_online = 1 OR door_taken <= door_allocation)`. "Taken" includes unpaid orders that still hold seats. |
| `occurrence_inventory` | `occurrence_id` (PK), `capacity` (people), `people_taken` | The event-wide cap for paid events, `CHECK (capacity IS NULL OR people_taken <= capacity)`. |

**Orders, tickets and money**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `orders` | `id` (`ord_`), `reference` (`GL-XXXX-XXXX`), `event_id`, `occurrence_id`, `organization_id`, `channel` (`online`,`door`), `payment_method` (`card_online`,`phone_qr`,`card_reader`,`cash`,`comp`,`free`), `status` (`pending`,`paid`,`paid_unfulfilled`,`canceled`,`expired`,`refunded`,`partially_refunded`,`voided`), `disputed`, `is_preview`, `funds_flow` (`organizer_account`,`gamo_collects`, null for cash, comp and free), `seller` (`organization`,`gamo`), `stripe_account_id` (null = Gamo's account), `livemode`, `buyer_name`, `buyer_email`, `email_hash`, `currency`, `subtotal_cents`, `discount_cents`, `fee_cents`, `fee_payer`, `gift_cents`, `total_cents`, `amount_refunded_cents`, `code_id`, `policy_snapshot` (JSON), `fee_snapshot` (JSON), `terms_version`, `comp_reason`, `hold_expires_at`, `checkout_session_id`, `payment_intent_id`, `staff_link_id`, `cash_session_id`, `reader_id`, `paid_at` | **A pending order is the hold**: its items' quantities are counted in `ticket_inventory` until it is paid or `hold_expires_at` passes. `CHECK (total_cents = subtotal_cents - discount_cents + fee if the buyer pays it + gift_cents)`; refunded never above total. The mode, seller, account, prices, fee and policies are snapshotted here at creation. `is_preview` marks an organizer's test order (voidable, never counted in reports). |
| `orders.attendee_names` (0012) | JSON array of names in ticket order | Only when the event asks for attendee names; used when the tickets are issued, removed at 90 days. |
| `order_items` | `id` (`oit_`), `order_id`, `ticket_type_id`, `name`, `unit_price_cents`, `quantity`, `people_per_ticket`, `discount_cents`, `fee_cents`, `line_total_cents` | Prices are copied, never re-read. |
| `tickets` | `id` (`tkt_`), `order_id`, `order_item_id`, `seq`, `event_id`, `occurrence_id`, `ticket_type_id`, `holder_name`, `holder_email`, `email_hash`, `status` (`valid`,`refunded`,`voided`,`canceled`), `credential_version`, `credential_salt`, `checked_in_at`, `checked_in_by`, `transfer_count` | One ticket per seat (a group pack is one ticket for N people). The QR credential is derived with a keyed HMAC over id, version and salt; a transfer or reissue bumps the version and the salt, so old images stop working. First scan wins (`checked_in_at IS NULL` in the update). |
| `payments` | `id` (`pay_`), `order_id`, `kind` (`checkout_session`,`card_present`,`cash`,`comp`), `provider_ref` (Checkout Session or PaymentIntent id), `stripe_account_id`, `reader_id`, `amount_cents`, `currency`, `status` (`pending`,`succeeded`,`failed`,`canceled`,`expired`) | Every attempt to collect money for an order. |
| `stripe_events` | `id` (Stripe event id, PK), `type`, `account_id`, `livemode`, `status` (`processing`,`processed`,`ignored`,`failed`), `claim_token`, `claimed_at`, `processed_at`, `error_code`, `stripe_created_at` | Claim → process → mark, with the claim token checked when marking. |
| `refunds` | `id` (`rfd_`), `order_id`, `ticket_ids` (JSON), `amount_cents`, `gift_cents`, `fee_cents`, `currency`, `method` (`stripe`,`cash`), `requested_by` (`buyer`,`organizer`,`admin`,`system`), `reason`, `status` (`requested`,`declined`,`pending`,`succeeded`,`failed`,`canceled`), `stripe_refund_id`, `cash_session_id` | A buyer's request is a `requested` row; the amount is computed on the server from the snapshot. |
| `disputes` | `id` (`dsp_`), `order_id`, `stripe_dispute_id`, `amount_cents`, `currency`, `reason`, `status`, `outcome` (`won`,`lost`,`warning_closed`) | Opened and closed by webhooks. |
| `ticket_transfers` | `id` (`trf_`), `ticket_id`, `from_name`, `from_email_hash`, `to_name`, `to_email_hash`, `version_from`, `version_to` | No price column: a transfer can never carry one. |
| `ledger_entries` | `id` (`led_`), `organization_id`, `event_id`, `order_id`, `refund_id`, `dispute_id`, `payout_id`, `entry_type` (`ticket_sale`,`gift`,`gamo_fee`,`processing_cost`,`refund`,`gift_refund`,`fee_refund`,`dispute`,`dispute_reversal`,`payout`,`cash_sale`,`cash_refund`), `category` (`program_service_receipt`,`third_party_payable`,`processing_cost`,`refund`,`dispute`), `held_by` (`organization`,`gamo`), `funds_flow`, `amount_cents` (signed), `currency`, `source_key` (unique), `stripe_balance_transaction_id`, `occurred_at` | Append-only; `source_key` makes every write idempotent. `held_by` says who holds the money: the organization (Mode A and cash) or Gamo (Mode B). What Gamo owes an organization is the sum of its `held_by = gamo` payable entries minus payouts. |
| `payouts` | `id` (`pyo_`), `organization_id`, `amount_cents`, `currency`, `status` (`prepared`,`approved`,`sent`,`failed`,`canceled`), `stripe_transfer_id`, `prepared_at`, `approved_at`, `sent_at` | Mode B only. Prepared by the admin; sending needs the owner's explicit approval (test mode only). |

**Door**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `staff_links` | `id` (`stf_`), `organization_id`, `event_id`, `label`, `token_hash`, `pin_hash`, `pin_salt`, `can_check_in`, `can_sell`, `can_comp`, `expires_at`, `revoked_at`, `failed_pin_attempts`, `locked_until`, `created_by`, `last_used_at` | Event-scoped. The link token is kept only as a keyed hash, the PIN with PBKDF2 and a pepper. Five wrong PINs lock it for 15 minutes. Expires 12 hours after the event's last date. |
| `staff_devices` | `id` (hash of the device cookie), `staff_link_id`, `expires_at`, `last_seen_at` | A device that entered the right PIN. Revoking the link ends every device. |
| `cash_sessions` | `id` (`csh_`), `event_id`, `occurrence_id`, `staff_link_id` or `organizer_id`, `float_cents`, `currency`, `status` (`open`,`closed`), `expected_cents`, `counted_cents`, `opened_at`, `closed_at` | One open drawer per link (or organizer) per date. Expected = float + cash sales − cash refunds, stored at close; closed sessions are never changed. |
| `cash_movements` | `id` (`cmv_`), `cash_session_id`, `kind` (`sale`,`refund`), `order_id`, `refund_id`, `amount_cents`, `received_cents`, `change_cents`, `reason` | Refunds need a reason. |
| `terminal_locations` | `id` (`tml_`), `organization_id`, `stripe_location_id`, `stripe_account_id` (null = Gamo's account) | One per organization and account. |
| `readers` | `id` (`rdr_`), `organization_id`, `location_id`, `event_id`, `label`, `stripe_reader_id`, `stripe_account_id`, `device_type`, `status` (`online`,`offline`,`unknown`), `action_status` (`idle`,`in_progress`,`succeeded`,`failed`), `action_order_id`, `action_failure`, `last_seen_at`, `removed_at` | Paired with the reader's one-time registration code. |

**Settings and verification**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `payment_settings` | single row: `funds_flow_default` (`not_chosen`,`organizer_account`,`gamo_collects`), `door_sales_enabled` | Starts `not_chosen`: card sales fail closed until the owner chooses. |
| `organization_payments` | `organization_id` (PK), `funds_flow_override`, `connected_account_id`, `charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements_due`, `livemode`, `checked_at` | Only the account id and its readiness flags, read from Stripe; nothing else about the account is stored. |
| `fee_settings` | `id` (`fee_`), `fixed_cents`, `percent_bps`, `reason`, `effective_at` | History of the Gamo fee; the newest row in force applies. Starts with one row of 0 and 0. |
| `payment_decisions` | `id` (`pdc_`), `subject` (`funds_flow_default`,`organization_override`,`door_sales`,`fee`), `organization_id`, `old_value`, `new_value`, `reason`, `decided_at` | Every settings change, with its reason. |
| `organizations` (new columns) | `verification_status` (`none`,`requested`,`meeting_scheduled`,`meeting_held`,`verified`,`declined`), `verification_requested_at`, `first_paid_event_approved_at` | `verified_at` stays the source of the Verified label. |
| `verification_meetings` | `id` (`vmt_`), `subject_type` (`organization`), `subject_id`, `starts_at`, `timezone`, `format` (`video`,`in_person`), `location` (link or place), `note`, `status` (`scheduled`,`held`,`canceled`), `held_at`, `canceled_at` | Verifying needs a held meeting. `subject_type` leaves room for churches and providers when their data moves. |
| `review_decisions` (rebuilt) | adds `verification_requested`, `meeting_scheduled`, `meeting_held`, `declined` | The organizer sees one decision history. |

**Rules the database enforces (paid)**

- **No overselling:** an order reserves in one batch: release this date's expired pending orders (subtract their quantities), add each item's quantity to `ticket_inventory` and the people to `occurrence_inventory`, take a code use, insert the order and its items. Any `CHECK` failure rolls the whole batch back ("sold out").
- **Paid only by the webhook:** `pending → paid` is a conditional update that also checks the amount and currency; tickets are inserted in the same batch (`UNIQUE (order_item_id, seq)`).
- **First scan wins** and **one transfer at a time**: conditional updates on `checked_in_at IS NULL` and on `credential_version`.
- **Refunds never exceed the payment:** `CHECK (amount_refunded_cents <= total_cents)`.

**Retention (proposal):** buyer names and emails, ticket holder names and emails, transfer names and email hashes are removed 90 days after the event's last date, as for registrations. Orders, amounts, references, payments, refunds, disputes, payouts and the ledger are kept as accounting requires (the owner and an accountant decide how long).

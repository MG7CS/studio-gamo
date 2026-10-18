# Database (Cloudflare D1)

All six Workers bind **one** D1 database per environment as `DB`:

| Environment | Database | Where it lives |
| --- | --- | --- |
| local | `gamo-db-local` | `apps/<app>/.wrangler/state/v3/d1/` — **one copy per app** (see below) |
| preview | `gamo-db-preview` | Cloudflare, shared by the six preview Workers |
| production | `gamo-db-production` | Cloudflare, shared by the six production Workers |

The schema is defined twice and the two must agree:

- **`packages/db/migrations/*.sql`** — what actually runs (applied by Wrangler, tracked in the `d1_migrations` table).
- **`packages/db/schema.ts`** — the Drizzle model the code queries through (`getDb(env.DB)` in `@gamo/db`).

## Tables by area (83)

| Area | Tables |
| --- | --- |
| Identity & access | `users`, `sessions`, `product_accounts`, `clerk_identity_links`, `roles`, `user_roles`, `organizations`, `organization_members`, `auth_challenges`, `external_identities`, `admin_credentials` |
| Shared person, guests, providers (0012) | `persons`, `customer_profiles`, `customer_access_tokens`, `customer_sessions`, `provider_profiles`, `verification_records` |
| Terms, consent, abuse, email (0012) | `terms_documents`, `terms_acceptances`, `marketing_consents`, `rate_limit_counters`, `email_log`, `email_suppressions`, `ticket_access_log` |
| Gamo Worship | `musician_profiles`, `musician_skills`, `applications`, `churches`, `gigs`, `gig_positions`, `gig_assignments`, `checkins`, `standby_dispatches` |
| Gamo Academy | `instructor_profiles`, `classes`, `enrollments`, `academy_registrations` (0012, guests) |
| Gamo Live — events | `organizer_profiles`, `events`, `event_occurrences`, `ticket_tiers`, `event_registrations`, `event_organizations`, `event_team_members`, `event_performers`, `external_listing_revisions`, `external_outbound_clicks` |
| Gamo Live — tickets & payments | `ticket_holds`, `ticket_orders`, `order_items` (0013), `tickets`, `ticket_scans` (legacy), `refund_records`, `settlement_records`, `payment_records`, `ledger_entries`, `stripe_webhook_events` |
| Gamo Live — venues, policies, scanning (0013) | `venues`, `venue_maps`, `venue_sections`, `venue_seats` (Phase 2, empty), `event_policies`, `event_changes`, `waitlist_entries`, `scanner_sessions`, `scanner_devices`, `ticket_scan_events`, `ticket_presence` |
| Gamo Live — artists & bookings | `artist_profiles`, `artist_representatives`, `representation_authorizations`, `booking_inquiries`, `booking_offers`, `performance_engagements` |
| Gamo Production | `production_requests`, `production_projects` |
| Organization | `church_partnerships`, `sponsorships`, `participation_inquiries`, `media_files`, `audit_logs`, `moderation_reviews`, `notification_jobs` |

Integrity rules live in **triggers** (55; 31 added by 0012/0013 — see "Identity and ticketing" below), e.g. `registration_reserve` (capacity), `registration_immutable`, `tier_validate_*`, `external_event_block_*` (external listings can never sell tickets), `media_prohibit_sensitive_docs`, `moderation_pending`. Money is always an integer number of cents.

## Migrations

| File | Purpose |
| --- | --- |
| `0000_cooing_lilandra.sql` | users, roles, sessions, user roles |
| `0001_perpetual_caretaker.sql` | Worship: churches, gigs, positions, assignments, check-ins, applications, musician profiles |
| `0002_complete_backend_foundation.sql` | organizations, Academy, events/tiers/registrations, production, partnerships, payments, ledger, media, audit, moderation |
| `0003_registration_integrity.sql` | `notification_jobs` outbox, registration/tier triggers |
| `0004_verified_auth_and_outbox.sql` | email challenges, external identities, outbox columns, sensitive-media trigger |
| `0005_admin_password_credentials.sql` | admin gateway credentials |
| `0006_live_standalone_platform.sql` | artists, representation, bookings, event teams/performers, holds, orders, tickets, scans, refunds, settlements |
| — | `0007` was never created (numbering gap; harmless — files apply in name order) |
| `0008_participation_inquiries.sql` | participation inquiries |
| `0009_live_external_discovery.sql` | external (editorial) event listings, revisions, click log, ticketing blocks |
| `0010_product_accounts.sql` | per-product accounts (+ backfill) |
| `0011_clerk_product_identities.sql` | Clerk identity links |
| `0012_identity_terms_customers.sql` | shared person record, guest customers + link tokens, provider profiles + staff verification log, terms/consents, rate limits, email log/suppressions, ticket access log, guest Academy registrations; `users.person_id`, `sessions.clerk_session_id`, `organizer_profiles.first_event_approved_at`/`always_review` |
| `0013_live_ticketing.sql` | ticket categories (`ticket_tiers` columns), venues/blueprints/sections/seats, order items, policies, event changes, waitlist, scanner sessions/devices, scan events, presence; order/hold/ticket columns; inventory triggers |

**Rules for new migrations**

1. Never edit a migration that has been applied anywhere; add a new file (`00NN_short_name.sql`).
2. Additive only (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`). Anything destructive (drops, table rebuilds, data deletes) needs owner approval and a backup.
3. Keep each trigger on one statement line (`BEGIN SELECT RAISE(…); END;`) — Wrangler's remote SQL splitter requires it.
4. Update `packages/db/schema.ts` in the same commit; tests (`pnpm test`) apply every migration in order to an in-memory database on every run.

**Known drift** between `schema.ts` and the migrated database (`docs/CLEANUP_LOG.md` F-15), left as is because fixing it needs SQLite table rebuilds:

- `user_roles.id` is a primary key in `schema.ts` but a nullable column in the database.
- 11 foreign keys declare `onDelete: cascade/set null` in `schema.ts` but are `NO ACTION` in the database (`sessions.user_id`, `user_roles.user_id`/`role_id`, `musician_profiles.user_id`, `gigs.church_id`, `gig_positions.gig_id`, `gig_assignments.position_id`/`musician_id`, `checkins.assignment_id`, `applications.musician_id`, `churches.organization_id`). Code must not rely on cascading deletes.
- 9 indexes exist only in `schema.ts`; the partial unique index `product_account_clerk_product_user_unique` exists only in the database.
- CHECK constraints and triggers (including all of 0012/0013's) exist only in the SQL; `schema.ts` models tables, columns, defaults, foreign keys and indexes.
- `packages/db/migrations/meta/_journal.json` (drizzle-kit) only knows `0000`–`0002`. **Do not run `drizzle-kit generate`**; write migrations by hand.

## Identity and ticketing (0012/0013)

Design of record: [`docs/design/identity-and-ticketing.md`](design/identity-and-ticketing.md) §5.1. Code-side names: **TicketCategory = table `ticket_tiers`**, Order = `ticket_orders`, OrderItem = `order_items`, Section = `venue_sections`, Hold = `ticket_holds`. Typed enums, the policy bounds and the shapes are in `packages/domain/src/types` (`@gamo/domain/types`); the SQL that moves inventory or admits people is built only by `packages/domain/src/ticketing/sql.ts` (`@gamo/domain/ticketing`); the HMAC/QR/link/rate-limit primitives are in `@gamo/domain/security`.

**Inventory model.** Counts are *units* = tickets × `seats_per_ticket` (group/table tickets). `reserved_count` = units held + sold (meaning unchanged since 0002), `sold_count` = units sold. Rows linked to an order item (`ticket_holds.order_item_id` / `tickets.order_item_id` NOT NULL) are **trigger-managed**; older rows written by the pre-0013 code (no order item) keep their own bookkeeping and are never touched by the new triggers, so nothing is counted twice.

| Trigger | Guarantees |
| --- | --- |
| `hold_validate_managed_insert` (BEFORE INSERT on holds) | a managed hold matches its order item (event, category, section, seat), fits the item quantity, the event is approved and not cancelled, the category and section are `active`, a seat is free and the hold is 1 ticket; and `reserved + units ≤ capacity` for the category (`SOLD_OUT`) **and** the section (`SECTION_SOLD_OUT`). Aborting the statement aborts the whole `db.batch`. |
| `hold_reserve` (AFTER INSERT) | adds the units to category and section in the same statement — there is no separate "reserve" UPDATE to forget. |
| `hold_release` (`held → expired\|released`) / `hold_convert` (`held → converted`) | give units back / move them to `sold_count`, once, in the statement that changes the state. `hold_transition_guard` allows only those three transitions and freezes a managed hold's inventory fields; a legacy hold can never become managed. |
| `ticket_issue_validate` | a managed ticket exists only for a converted hold of its item, with `seq ≤ quantity`, `qr_token = id`, salt and key id set. Unique `(order_item_id, seq)` makes issuance idempotent. |
| `ticket_release` (`valid → voided\|refunded`) | gives back `seats_per_ticket` units (category + section) and sets `released_on_void = 1`, so a later `voided → refunded` never releases again. `ticket_terminal_guard`: voided/refunded never become valid again (all tickets). `ticket_managed_immutable`: seq, order, event, section, seat fixed; version only increases. |
| `tier_validate_category_*`, `section_validate_*` (+ CHECKs) | `0 ≤ sold ≤ reserved ≤ capacity`; capacity can't drop below what is reserved; companion category on the same event; age and sales windows ordered. |
| `order_validate_*`, `order_refund_bounds` | order status in the allowed set (new + legacy spellings `canceled`, `pending_approval`); `0 ≤ amount_refunded_cents ≤ total_cents`, never decreasing. |
| `order_item_validate_insert`, `order_item_immutable` | item belongs to the order's event; `seats_per_ticket`/currency equal the category's at insert; price/quantity frozen; `refunded_quantity` only grows. |
| `external_event_block_sections`, `external_event_block_order_items` | external listings get no sections or order items (the 0009 blocks on tiers, holds, orders, tickets and settlements still apply). |
| `provider_publish_gate_*`, `provider_identity_immutable` | a profile needing staff review is public only while `verified` (suspending must clear `published_at`); church/musician/technician always need review (CHECK). |
| `verification_records_no_update/no_delete`, `terms_*_immutable` | the staff verification log is append-only; terms texts and acceptances can't be rewritten (erasure may null emails/IP hashes). |

**Never delete** orders, items, holds or tickets (and never delete an event that has them): the triggers react to status changes, not deletes, so a delete would leave units counted. Cancel, expire, release, void or refund instead.

Partial unique indexes: one held hold per seat (`ticket_holds_seat_unique`), one live ticket per seat (`tickets_seat_unique`), one scan per (scanner session, client scan id), one active terms version per slug, unique order reference. Seat rows (`venue_seats`) are a Phase 2 placeholder and stay empty.

**Concurrency.** D1 is a single-writer SQLite database: each statement and each `db.batch` is atomic and serialized. Admission is one conditional upsert on `ticket_presence (ticket_id, day_key)`, so racing scanners produce exactly one `admitted`. Tests: `packages/db/migrations.test.ts` (schema, legacy upgrade, 0003/0009 triggers) and `packages/domain/src/ticketing/sql.test.ts` (rollback on oversell, 50 concurrent holds for 10 units, release/convert/void exactly once, seats, presence races — also across 8 real connections in worker threads).

**Retention (to be enforced by the owner-enabled cron, O-19; helpers exist):** link tokens deleted 30 days after expiry (`CustomerLinkTokens.purgeExpired`); `rate_limit_counters` purged once the window ends (`purgeRateLimitCounters`); `email_log.recipient_email` nulled after 180 days (hash kept); `ticket_scan_events` kept 13 months then aggregated; `ticket_access_log` and `verification_records` are audit records. Erasure: `persons`/`customer_profiles.erased_at`, email replaced by a hash, holder names "Erased", financial rows keep amounts only.

**Never stored in clear:** customer link tokens (HMAC with `CUSTOMER_LINK_SECRET`), scanner link tokens and PINs (hash / PBKDF2 + pepper), QR MACs (`qr_signature_hash` = SHA-256 of the MAC; the MAC is recomputed from id, version, event and salt). IPs and emails in logs, buckets and suppressions are HMAC hashes with `PII_HASH_SECRET` (`hashIp`, `hashEmail`).

**Public API.** Services still return Drizzle rows for events, categories and users, and the OpenAPI responses are closed, so `@gamo/db` `toContractEvent` / `toContractTicketTier` / `toContractUser` drop the 0012/0013 columns until their owner adds them to `openapi/root.yaml` (and `users.person_id` is never exposed).

## Local development

Each app runs its own Worker with its own local state (`persistState` in `@gamo/config/env-loader`), so **local databases are not shared between apps**: an event created in Gamo Live does not appear in the admin app's local database. Production and preview share one database.

```sh
pnpm db:migrate:local   # apply all migrations to every app's local D1 (wrangler, tracked in d1_migrations)
pnpm db:seed:local      # optional: import + publish the bundled Gamo Live catalog into apps/live's local D1
pnpm db:reset:local     # delete every app's LOCAL D1 state, then migrate again
```

- With `ENVIRONMENT=local`, Live pages also seed the bundled catalog into an empty local database on first visit (`LiveService.seedCatalogIfAllowed`). This never happens in preview/production unless `LIVE_CATALOG_AUTOSEED=true` is set deliberately.
- Databases created by older versions of the editorial CLI have no `d1_migrations` table; `db:migrate:local` then fails with "table already exists". Run `pnpm db:reset:local` once.
- The editorial CLI (`scripts/live/editorial-cli.ts`) refuses to touch a local database that Wrangler has not fully migrated, and cannot write to remote databases at all.

## Preview / production (owner or operator only)

```sh
# from apps/live (any app works — they share the database)
pnpm exec wrangler d1 migrations list gamo-db-production --remote
pnpm exec wrangler d1 migrations apply gamo-db-production --remote
```

Back up first (`wrangler d1 export gamo-db-production --remote --output backup.sql`) and apply to `gamo-db-preview` before production. See `docs/RUNBOOK.md`.

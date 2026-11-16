# Database (Cloudflare D1)

All five app Workers (web, worship, academy, production, admin) bind **one** D1 database per environment as `DB`:

| Environment | Database | Where it lives |
| --- | --- | --- |
| local | `gamo-db-local` | `apps/<app>/.wrangler/state/v3/d1/` — **one copy per app** (see below) |
| preview | `gamo-db-preview` | Cloudflare, shared by the preview Workers |
| production | `gamo-db-production` | Cloudflare, shared by the production Workers |

The schema is defined twice and the two must agree:

- **`packages/db/migrations/*.sql`** — what actually runs (applied by Wrangler, tracked in the `d1_migrations` table).
- **`packages/db/schema.ts`** — the Drizzle model the code queries through (`getDb(env.DB)` in `@gamo/db`).

## Tables by area (42)

| Area | Tables |
| --- | --- |
| Identity & access | `users`, `sessions`, `product_accounts`, `clerk_identity_links`, `roles`, `user_roles`, `organizations`, `organization_members`, `auth_challenges`, `external_identities`, `admin_credentials` |
| Shared person, guests, providers (0012) | `persons`, `customer_profiles`, `customer_access_tokens`, `customer_sessions`, `provider_profiles`, `verification_records` |
| Terms, consent, abuse, email (0012) | `terms_documents`, `terms_acceptances`, `marketing_consents`, `rate_limit_counters`, `email_log`, `email_suppressions` |
| Gamo Worship | `musician_profiles`, `musician_skills`, `applications`, `churches`, `gigs`, `gig_positions`, `gig_assignments`, `checkins`, `standby_dispatches` |
| Gamo Academy | `instructor_profiles`, `classes`, `enrollments`, `academy_registrations` (0012, guests) |
| Organization | `church_partnerships`, `sponsorships`, `participation_inquiries`, `media_files`, `audit_logs`, `moderation_reviews` |

Integrity rules live in **triggers** (8): `media_prohibit_sensitive_docs`, `provider_publish_gate_insert/update`, `provider_identity_immutable`, `verification_records_no_update/no_delete`, `terms_documents_content_immutable`, `terms_acceptances_immutable`. Money is always an integer number of cents.

## Gamo Live removal (0018)

On 2026-11-16 the owner narrowed Gamo Studios to Academy, Worship and Production (design: [`docs/superpowers/specs/2026-11-16-remove-gamo-live-design.md`](superpowers/specs/2026-11-16-remove-gamo-live-design.md)). Migration `0018_remove_gamo_live.sql` is a **destructive, owner-approved** forward migration (production held only test data). It drops 41 tables:

- **Events:** `organizer_profiles`, `events`, `event_occurrences`, `ticket_tiers`, `event_registrations`, `event_organizations`, `event_team_members`, `event_performers`, `event_policies`, `event_changes`, `external_listing_revisions`, `external_outbound_clicks`, `notification_jobs` (Live registration emails; it referenced `event_registrations`).
- **Tickets & scanning:** `ticket_holds`, `ticket_orders`, `order_items`, `tickets`, `ticket_scans`, `ticket_scan_events`, `ticket_presence`, `ticket_access_log`, `refund_records`, `settlement_records`, `waitlist_entries`, `scanner_sessions`, `scanner_devices`.
- **Venues:** `venues`, `venue_maps`, `venue_sections`, `venue_seats`.
- **Artists & bookings:** `artist_profiles`, `artist_representatives`, `representation_authorizations`, `booking_inquiries`, `booking_offers`, `performance_engagements`.
- **Production links to events:** `production_requests`, `production_projects` (no code used them).
- **Never-used payment tables:** `payment_records`, `ledger_entries`, `stripe_webhook_events`.

It first drops the 47 triggers on those tables (so the cascades of DROP TABLE's implicit delete cannot fire ticketing guards) and `moderation_pending`, the one trigger on a kept table (`moderation_reviews`) that read `events` and would otherwise have failed every later insert. Tables are then dropped children-first. No kept table has a foreign key into a dropped one, and no kept table was rebuilt: CHECK constraints that still list `'live'` as a product value (`customer_access_tokens.product`, `customer_sessions.product`, `provider_profiles.product_origin`, …) stay — a harmless value, not worth risky table rebuilds. The four-program state is preserved at tag `four-programs-snapshot`.

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
| `0012_identity_terms_customers.sql` | shared person record, guest customers + link tokens, provider profiles + staff verification log, terms/consents, rate limits, email log/suppressions, ticket access log, guest Academy registrations; `users.person_id`, `sessions.clerk_session_id` |
| `0013_live_ticketing.sql` | Live ticketing: venues, sections, order items, policies, scanning, inventory triggers |
| `0014_managed_ticket_handles.sql` | managed ticket QR handles |
| `0015_d1_pattern_limits.sql` | order reference CHECK rewritten for D1's pattern limit |
| `0016_agent_followups.sql` | `ticket_orders.attendees_json`, `users.person_link_opt_out_at` |
| `0017_review_hardening.sql` | product scope on customer link tokens and sessions; seats-per-ticket lock |
| `0018_remove_gamo_live.sql` | **drops every Gamo Live table** (see above) |

Tables created by 0002–0016 for Live no longer exist after 0018; the files stay because applied migrations are never edited.

**Rules for new migrations**

1. Never edit a migration that has been applied anywhere; add a new file (`00NN_short_name.sql`).
2. Additive only (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`). Anything destructive (drops, table rebuilds, data deletes) needs owner approval and a backup.
3. Keep each trigger on one statement line (`BEGIN SELECT RAISE(…); END;`) — Wrangler's remote SQL splitter requires it.
4. Update `packages/db/schema.ts` in the same commit; tests (`pnpm test`) apply every migration in order to an in-memory database on every run.

**Known drift** between `schema.ts` and the migrated database (`docs/CLEANUP_LOG.md` F-15), left as is because fixing it needs SQLite table rebuilds:

- `user_roles.id` is a primary key in `schema.ts` but a nullable column in the database.
- 11 foreign keys declare `onDelete: cascade/set null` in `schema.ts` but are `NO ACTION` in the database (`sessions.user_id`, `user_roles.user_id`/`role_id`, `musician_profiles.user_id`, `gigs.church_id`, `gig_positions.gig_id`, `gig_assignments.position_id`/`musician_id`, `checkins.assignment_id`, `applications.musician_id`, `churches.organization_id`). Code must not rely on cascading deletes.
- Some indexes exist only in `schema.ts`; the partial unique index `product_account_clerk_product_user_unique` exists only in the database.
- CHECK constraints and triggers exist only in the SQL; `schema.ts` models tables, columns, defaults, foreign keys and indexes.
- `packages/db/migrations/meta/_journal.json` (drizzle-kit) only knows `0000`–`0002`. **Do not run `drizzle-kit generate`**; write migrations by hand.

## Identity (0012)

Design of record: [`docs/design/identity-and-ticketing.md`](design/identity-and-ticketing.md) §4 (its ticketing parts are historical since 0018).

| Trigger | Guarantees |
| --- | --- |
| `provider_publish_gate_*`, `provider_identity_immutable` | a profile needing staff review is public only while `verified` (suspending must clear `published_at`); church/musician/technician always need review (CHECK). |
| `verification_records_no_update/no_delete`, `terms_*_immutable` | the staff verification log is append-only; terms texts and acceptances can't be rewritten (erasure may null emails/IP hashes). |

Partial unique indexes: one active terms version per slug, one provider role per (person, role, organization). Tests: `packages/db/migrations.test.ts` (kept schema, identity/consent constraints, and 0018 applied from scratch and over a database still holding Live rows).

**Retention (to be enforced by the owner-enabled cron, O-19; helpers exist):** link tokens deleted 30 days after expiry (`CustomerLinkTokens.purgeExpired`); `rate_limit_counters` purged once the window ends (`purgeRateLimitCounters`); `email_log.recipient_email` nulled after 180 days (hash kept); `verification_records` is an audit record. Erasure: `persons`/`customer_profiles.erased_at`, email replaced by a hash.

**Never stored in clear:** customer link tokens (HMAC with `CUSTOMER_LINK_SECRET`). IPs and emails in logs, buckets and suppressions are HMAC hashes with `PII_HASH_SECRET` (`hashIp`, `hashEmail`).

**Public API.** Services return Drizzle user rows and the OpenAPI responses are closed, so `@gamo/db` `toContractUser` drops `person_id` and `person_link_opt_out_at` (never exposed).

## Local development

Each app runs its own Worker with its own local state (`persistState` in `@gamo/config/env-loader`), so **local databases are not shared between apps**. Production and preview share one database.

```sh
pnpm db:migrate:local   # apply all migrations to every app's local D1 (wrangler, tracked in d1_migrations)
pnpm db:reset:local     # delete every app's LOCAL D1 state, then migrate again
```

## Preview / production (owner or operator only)

```sh
# from apps/web (any app works — they share the database)
pnpm exec wrangler d1 migrations list gamo-db-production --remote
pnpm exec wrangler d1 migrations apply gamo-db-production --remote
```

Back up first (`wrangler d1 export gamo-db-production --remote --output backup.sql`) and apply to `gamo-db-preview` before production. `0018` is destructive: take the backup before applying it. See `docs/RUNBOOK.md`.

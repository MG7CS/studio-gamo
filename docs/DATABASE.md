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

## Tables by area (57)

| Area | Tables |
| --- | --- |
| Identity & access | `users`, `sessions`, `product_accounts`, `clerk_identity_links`, `roles`, `user_roles`, `organizations`, `organization_members`, `auth_challenges`, `external_identities`, `admin_credentials` |
| Gamo Worship | `musician_profiles`, `musician_skills`, `applications`, `churches`, `gigs`, `gig_positions`, `gig_assignments`, `checkins`, `standby_dispatches` |
| Gamo Academy | `instructor_profiles`, `classes`, `enrollments` |
| Gamo Live — events | `organizer_profiles`, `events`, `event_occurrences`, `ticket_tiers`, `event_registrations`, `event_organizations`, `event_team_members`, `event_performers`, `external_listing_revisions`, `external_outbound_clicks` |
| Gamo Live — tickets & payments | `ticket_holds`, `ticket_orders`, `tickets`, `ticket_scans`, `refund_records`, `settlement_records`, `payment_records`, `ledger_entries`, `stripe_webhook_events` |
| Gamo Live — artists & bookings | `artist_profiles`, `artist_representatives`, `representation_authorizations`, `booking_inquiries`, `booking_offers`, `performance_engagements` |
| Gamo Production | `production_requests`, `production_projects` |
| Organization | `church_partnerships`, `sponsorships`, `participation_inquiries`, `media_files`, `audit_logs`, `moderation_reviews`, `notification_jobs` |

Integrity rules live in **triggers** (24), e.g. `registration_reserve` (capacity), `registration_immutable`, `tier_validate_*`, `external_event_block_*` (external listings can never sell tickets), `media_prohibit_sensitive_docs`, `moderation_pending`. Money is always an integer number of cents.

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

**Rules for new migrations**

1. Never edit a migration that has been applied anywhere; add a new file (`00NN_short_name.sql`).
2. Additive only (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`). Anything destructive (drops, table rebuilds, data deletes) needs owner approval and a backup.
3. Keep each trigger on one statement line (`BEGIN SELECT RAISE(…); END;`) — Wrangler's remote SQL splitter requires it.
4. Update `packages/db/schema.ts` in the same commit; tests (`pnpm test`) apply every migration in order to an in-memory database on every run.

**Known drift** between `schema.ts` and the migrated database (`docs/CLEANUP_LOG.md` F-15), left as is because fixing it needs SQLite table rebuilds:

- `user_roles.id` is a primary key in `schema.ts` but a nullable column in the database.
- 11 foreign keys declare `onDelete: cascade/set null` in `schema.ts` but are `NO ACTION` in the database (`sessions.user_id`, `user_roles.user_id`/`role_id`, `musician_profiles.user_id`, `gigs.church_id`, `gig_positions.gig_id`, `gig_assignments.position_id`/`musician_id`, `checkins.assignment_id`, `applications.musician_id`, `churches.organization_id`). Code must not rely on cascading deletes.
- 9 indexes exist only in `schema.ts`; the partial unique index `product_account_clerk_product_user_unique` exists only in the database.
- `packages/db/migrations/meta/_journal.json` (drizzle-kit) only knows `0000`–`0002`. **Do not run `drizzle-kit generate`**; write migrations by hand.

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

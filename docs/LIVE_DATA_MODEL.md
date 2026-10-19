# Gamo Live — data model (draft for owner approval, 2026-10-19)

Implements [`LIVE_REQUIREMENTS.md`](LIVE_REQUIREMENTS.md). Nothing here is built or applied. It replaces the old Live tables; no old data is migrated except the 20-event catalog, which is re-imported from the repository file.

## 1. Where it lives (owner approved 2026-10-19)

**Recommendation: a new D1 database owned by Gamo Live** (`gamo-live-db-preview`, `gamo-live-db-production`), with its own migrations folder (`packages/db/live/migrations`) and its own Drizzle schema. Reasons: products stay independent (AGENTS.md rebuild scope); no collision with the old `events`/`organizations` tables; the old database is retired by simply not binding it; the admin binds both databases only where it needs to. Binding name `LIVE_DB` in `apps/live` and `apps/admin`. Creating the databases is an owner-run Cloudflare action (`docs/RUNBOOK.md`). Alternative: new `live_*` tables in the shared database (fewer resources, but the old schema stays in the way). Production data is never reset or dropped without your approval.

## 2. Conventions

- Ids are prefixed random text (`evt_…`, `org_…`). Times are UTC epoch seconds plus an IANA zone on the event; display always uses the event's own zone. Money is integer minor units with a currency (v1 only stores the price text and an optional minimum for external listings).
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
| `venues` | `id`, `name`, `address`, `city`, `state`, `metro_slug`, `timezone`, `lat`, `lng` | Shared by events; the venues page lists only venues with a published occurrence. |
| `events` | `id`, `organization_id` (null for catalog listings), `origin` (`organizer`,`catalog`), `slug` unique, `title`, `category`, `description`, `venue_id`, `timezone`, `admission` (`free_open`,`free_registration`,`external_tickets`), `external_url`, `price_text`, `refund_policy_text`, `capacity`, `max_party_size`, `qr_checkin` (0/1, default 0), `image_key`, `image_rights_confirmed_at`, `recurrence` (JSON: `weekly`/`monthly`, interval, until), `featured` (editorial, set only by the admin, always labeled), `status`, `published_at` | `status`: `draft`, `pending_review`, `changes_requested`, `published`, `rejected`, `canceled`, `hidden`. `qr_checkin` may be 1 only when `admission = free_registration`. `capacity` null means unlimited. |
| `event_occurrences` | `id`, `event_id`, `starts_at`, `ends_at`, `status` (`scheduled`,`canceled`), `seats_taken`, `registered_total`, `checked_in_total` | A one-time event has one row. Recurring events are expanded at save time, at most **52 occurrences** and never beyond the "until" date (no scheduled jobs needed; the organizer extends a series by editing it). Capacity is per occurrence. |
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
| `review_decisions` | `id`, `subject_type` (`event`,`organization`), `subject_id`, `decision` (`approved`,`changes_requested`,`rejected`,`verified`,`unverified`,`suspended`,`reinstated`), `note`, `decided_at` | The organizer sees the note. Concurrent decisions: only the first on a given `pending_review` version wins (conditional update on `status`). |
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

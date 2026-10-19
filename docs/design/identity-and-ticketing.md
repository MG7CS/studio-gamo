# Identity, registration and Gamo Live ticketing — design

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Removed since: the admin-password and gate-cookie code, `requireStaff`/`requireSuperadmin`/`verifyStaffBoundaryIdentity`, `provisionStaffIdentity`, the review form handlers and the break-glass variables. Still in the repo until the rebuild: `isStaffOrAdmin`, the `superadmin`/`staff_reviewer` role checks, `AdminService`, `ParticipationService.review`, `provider-review.ts`, `audit_logs` writes, the `admin_credentials` table (migration 0005) and the admin Cloudflare resources.


Status: **design of record** for the 2026-10-18 identity-and-ticketing change (branch `cleanup/foundation-pass`, local only). Owner product decisions 1–7 from the brief are final and are restated in §2. Where this document and older docs disagree, this document wins for identity, registration, ticketing and scanning; `docs/IDENTITY.md` and `docs/TICKETING.md` describe what was built.

Rules that bind every part of it (AGENTS.md): Gamo Studios is a Christian, mission-driven **Public Benefit Corporation** (never nonprofit, tax-exempt, charity or donation language); fictional examples are labelled *Sample*; integrations fail closed outside `ENVIRONMENT=local`; **Stripe test mode only and paid checkout answers 503** except on a path explicitly marked test; nothing is deployed or pushed; no remote Cloudflare, Clerk, Resend or Stripe command is run; legal texts are drafts marked **"DRAFT — requires legal review"**.

---

## 1. Current state (Phase 0 inventory, 2026-10-18)

### 1.1 Accounts and sign-in (all five public apps)

- One emailed-code flow (`packages/domain/src/http/auth.ts`, `IdentityService` in `packages/domain/src/services/identity.ts`), optionally Clerk per product (`packages/auth/clerk.ts`, token exchanged once for a 7-day D1 session). Shared screens: `packages/ui/src/components/auth/GamoAuthExperience.astro`.
- **Sign-in, sign-up and recover are the same operation**: `verifyEmailChallenge` always calls `findOrCreateUser` + `ensureProductAccount`, so "sign in" with an unknown email silently creates an account.
- **Enumeration**: sign-in answers 403 "No <Product> account was found…" when the address exists in another product; Clerk error text is shown verbatim; the Live RSVP answers 201 vs 200 for new vs duplicate.
- **Rate limits are per address only** (5 codes / 15 min, 5 guesses / code). `ipHash` is plumbed but never filled. No Turnstile except Clerk's own sign-up widget.
- **No terms or privacy consent** anywhere; no Terms of Service or Privacy Policy page (only a short `/legal` page, not marked draft). Admin's legal registry lists all documents as drafts.
- **Accessibility gaps**: auth field labels `sr-only` below `lg` (placeholders only on mobile), errors not tied to fields (`aria-invalid`/`aria-describedby` missing), opacity-0 code input overlay.
- **Social login**: `googleAuthUrl` prop exists, nothing passes it; no callback route.
- **Verification is missing or bypassed**: organizations are created `active` and that alone opens the Worship church workspace; Live artist profiles are written `verificationStatus: 'verified'` on creation; nothing ever sets `organizer_profiles.verification_status='verified'` or `ticketing_authorized_at`; admin verification screens are static demo data.
- **Provider flows outside Live do not exist**: musician application, church request, academy enrollment, host application and production booking all link to the web `/contact` free-text inquiry, which needs a *separate* web account. Tables meant for them (`applications`, `musician_profiles`, `churches`, `gigs*`, `instructor_profiles`, `classes`, `enrollments`) are never written. `enrollments.student_user_id` is `NOT NULL`, so it cannot hold a guest enrollment.
- Known gap from the Phase 11 security review: a Gamo session outlives a Clerk session ended in Clerk (no webhook, no stored Clerk `sid`).

### 1.2 Gamo Live ticketing

| Area | Finding |
| --- | --- |
| Transactions | `live.ts` never uses `db.batch`; every multi-table flow is separate statements (partial writes on failure). |
| Free RSVP | Capacity is safe (SQL triggers on `event_registrations`, `0003`), but registration → order → ticket are three separate inserts; quantity N yields **one** ticket; no rate limit or bot check; 201/200 leaks duplicates. |
| Paid holds | `createPaidTicketHoldAndOrder` reads `reserved_count` then writes an **absolute** value → lost update / oversell under concurrency; a reused idempotency key leaks capacity. One tier per order, no order items. |
| Webhook | Handles only `checkout.session.completed`; never checks amount, currency, payment status or hold expiry; status update is unconditional; a crash after the status update leaves a confirmed order **without tickets forever** (retry dedups on "confirmed"); idempotency row written only after fulfillment; every other event type answers 503 so Stripe retries forever. |
| Refunds | No Stripe call (fake `re_test_mock_*`); a partial refund voids **all** tickets and releases all capacity; refunds don't accumulate. |
| QR | `gamt_<event8>_<hex32>` stored **plaintext** in two tables and emailed as text; `qr_signature_hash` is an unkeyed SHA-256 nothing verifies; no QR image is ever rendered. |
| Recovery | `/my-tickets` uses the sign-in challenge (a recovery code is also a Live sign-in code) and **creates a `users` row** on every lookup; returns raw tokens. |
| Scanning | `scanTicketPass` admit UPDATE has no `WHERE status='valid'` → concurrent double admit; unknown tokens leave no scan row; no time window; **no scanner page**; scanners must be full Live accounts. |
| Email | No email for paid orders; `notification_jobs` is keyed to registrations; no email log, no bounce handling; queued retries are never processed (no cron/queue). Resend wrapper has no attachments. |
| Missing | venues, venue maps/sections, order items, terms/consents, scanner sessions, check-in UI, organizer sales/attendee views, Stripe refund/retrieve APIs, job runner. |
| Time | `starts_at`/`ends_at` UTC epoch seconds + IANA `timezone`; `isEventPast` uses `ends_at` while registration closes at `starts_at` (UI shows "Register" while API answers 409 during the event). |

Full inventories: Phase 0 agent reports, summarised in `docs/CLEANUP_LOG.md` Phase 12.

---

## 2. Owner decisions (final) and how they are realised

1. **Three kinds of people.** *Customers* (ticket buyers, parents, students): no account; email is identity. *Providers* (musicians, technicians, churches, agents, organizers, teachers): full accounts (emailed code or Clerk, Google where Clerk is configured). *Door staff*: event-scoped scanner link + PIN, no account.
2. **Customers manage through signed emailed links**, no password. After purchase they may claim an account with the same verified email; the account attaches to the existing customer record.
3. **Shared person record.** One Clerk application per product stays. A D1 `persons` row keyed by **verified** normalised email links a provider's per-product users, so profile and provider roles carry across products, and signing in with the same email or Google account (verified email) resolves to the same person. Feasibility: works with separate Clerk apps because linking happens in D1 *after* each product verifies the email independently; no Clerk-side linking, no shared cookie, no SSO. Product accounts, sessions and staff/authorization roles stay per product. AGENTS.md "Product Account Independence" is amended to record this owner-approved exception precisely (§4.6).
4. **Church verification in person**: `submitted → meeting_scheduled → verified (staff name, date, notes) → listed`. Churches draft freely; publishing requires `verified`. Same staff gates for musicians and technicians; manual review of every new organizer's **first** event.
5. **Event policies** set by the event creator within platform defaults and bounds (§5.4).
6. **No resale; transfers allowed.** Wallet passes later: the ticket model carries `version` and a stable id so a pass can be issued later; nothing is built.
7. **Seating**: Phase 1 = general admission + clickable sections on an uploaded blueprint (image or SVG), each with price, capacity, category. Phase 2 individual seats not built; schema carries nullable `seat_id`, a `venue_seats` table and seat-hold uniqueness.

---

## 3. Key technical decisions

| ID | Decision | Alternatives | Reason |
| --- | --- | --- | --- |
| T-01 | **Inventory authority = atomic D1 statements + triggers**, not Durable Objects. | Durable Object per event; KV counters. | D1 is a single-writer SQLite database; one `UPDATE … SET reserved_count = reserved_count + ?` is atomic, and `db.batch()` is a transaction that rolls back entirely when any statement fails. Existing `BEFORE UPDATE` triggers already abort when `reserved_count > capacity`, so a hold batch (category +q, section +q, hold rows, order, items) either commits whole or fails with `SOLD_OUT`. Hold release and sale conversion run in `AFTER UPDATE OF status` triggers so the counter moves in the same statement as the state change — no read-then-write anywhere. A DO would add a second source of truth, a new binding/migration class per Worker and cross-object consistency problems for no throughput need (church events sell hundreds, not millions). Revisit only if a single event needs > ~100 writes/s. |
| T-02 | **Reuse and extend** `ticket_tiers` (= ticket categories), `ticket_holds`, `ticket_orders` (= orders), `tickets`; **new** `order_items`, venues/maps/sections/seats, and **new** `ticket_scan_events` (+ `ticket_presence`). | All-new tables; rename. | Their constraints fit (`reserved_count ≤ capacity` trigger, nullable `tier_id`/`hold_id`), external-event triggers keep protecting them, and existing free RSVPs stay valid. `ticket_scans.scanned_by_user_id` is `NOT NULL` → users only, so door-staff scans need a new table. Renames would break code running between migrate and deploy. In code the concept is **TicketCategory** over table `ticket_tiers` (documented in `docs/DATABASE.md`). |
| T-03 | **QR = signed, versioned, PII-free payload; HMAC with a per-ticket salt**, no plaintext token stored. | Random token stored plaintext (today); per-ticket random secret stored; JWT. | Server can re-render any ticket from `(id, version, salt)` + key; a database leak alone cannot forge a code; bumping `version` kills every old image/screenshot. Short alphanumeric payload → small, robust QR (§6). |
| T-04 | **Paid payments = Stripe Checkout (hosted, test mode)**, not Payment Element. | Payment Element on page. | No Stripe script on our pages (CSP stays `script-src 'self'`), Apple Pay / Google Pay appear automatically where Stripe supports them, card data never touches us, works with almost no JS. Checkout `expires_at` is set to the hold (Stripe minimum 30 min) so a session can't outlive inventory. |
| T-05 | **Paid checkout gate**: `POST /api/checkout` answers **503** unless `ENVIRONMENT ∈ {local, preview}` **and** `STRIPE_TEST_CHECKOUT=true` **and** the key is `sk_test_`/`rk_test_`. Production: always 503 (code path, not config). | Config-only gate. | "Fail closed unless a code path is explicitly marked test." Turning on production sales is a future owner decision + code change. |
| T-06 | **Ticket rendering**: canonical **server SVG** ticket (text + vector QR) → on-page `<img>`; **PDF via `pdf-lib`** (vector QR, Helvetica, WinAnsi-safe names with a transliteration fallback); **QR-only PNG** for email via a tiny pure-JS PNG encoder (`CompressionStream('deflate')`); **full-ticket PNG** produced in the browser from the SVG (canvas) by a small island so long-press on iPhone saves a PNG; without JS the SVG image and PDF still work. PDFs cached in R2 by `ticket_id@version`. | satori + resvg-wasm on the Worker. | resvg-wasm adds ~2.5 MB wasm and tens-of-ms CPU per render (Workers Free has a 10 ms CPU limit); pdf-lib and a QR encoder are pure JS, small, and need no fonts for the QR. Server-side PNG text rendering would need a rasteriser + font. Dependencies: a QR encoder (`uqr`, MIT, zero deps) and `pdf-lib` (MIT) — free local libraries, not services; pinned exact versions ≥ 2 weeks old (D-24 policy). |
| T-07 | **Customer links = random 256-bit token, stored as HMAC-SHA256 with `CUSTOMER_LINK_SECRET`** (separate from `SESSION_SECRET` and `TICKET_QR_SECRET`), scoped, expiring, revocable, rate-limited. Opening a link sets a short-lived, path-scoped, HttpOnly customer cookie and 303-redirects to a token-free URL. | Stateless signed links. | Revocable (stateful) **and** keyed; link pages send `Referrer-Policy: no-referrer`; the token leaves the address bar immediately; email security scanners that prefetch GETs don't consume anything (links are multi-use until expiry). |
| T-08 | **Rate limiting in D1** (`rate_limit_counters`, fixed window, atomic upsert `… ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`), keyed by route + hashed IP and route + hashed email; plus **Turnstile** server verification on public forms. | Workers Rate Limiting binding; KV. | Testable locally and in node tests, no new binding; owner can add Cloudflare WAF rate rules on top (documented). Turnstile is **required outside local** (fail closed: form answers 503 "temporarily unavailable" without keys) — owner action to create widgets. |
| T-09 | **Scanner auth = scanner session**: organizer creates a gate session (label, allowed zones/directions) → unguessable link + 6-digit PIN (PBKDF2-hashed; 5 wrong PINs lock 15 min); a correct PIN issues an HttpOnly scanner cookie (HMAC, ≤ 12 h, never past the session's `expires_at` = event end + 6 h). Revocable by the organizer. | Full Live accounts for door staff. | Decision 1(c). |
| T-10 | **Offline scanning**: the scanner PWA (service worker, app-shell cache) downloads a **manifest** (ticket id, version, SHA-256 of the current QR MAC, category, section/zone, status, presence, holder initials only) for its event; scans are verified locally against the manifest, queued in IndexedDB with a client scan id, synced with `POST /api/scanner/sync`; the server replays them in device-time order, and flags conflicts (same ticket admitted by two offline devices) as `duplicate_offline` for review. **First scan wins** (server receipt order for online; earliest device time for offline, flagged). | No offline. | Venues have poor signal; the manifest contains no email or full names, so a lost device leaks little. |
| T-11 | **Shared person**: `persons(email_normalized UNIQUE)`; `users.person_id`; `customer_profiles.person_id`. A person is linked only from a **verified** email (product sign-in code, Clerk verified email, or a customer link that proves inbox control). | Link by any email. | Prevents taking over someone's history by typing their address. |
| T-12 | **Emails** go through one outbox: `email_log` (idempotency key unique, status, provider id, attempts) + `email_suppressions` (hard bounce, complaint). Sent inline on the request (as today); retries happen on the next relevant request and via an owner-enabled cron later (O-19 stays an owner decision). Resend webhooks (`/api/webhook/resend`, Svix signature with `RESEND_WEBHOOK_SECRET`) update status and suppressions. The on-screen ticket download never depends on email. | Queue binding. | No new binding; honest about delivery. |

---

## 4. Identity and registration

### 4.1 Kinds of people and their records

```
persons (one per verified email, cross-product)
  ├─ users (per product, existing; users.person_id)  ── product_accounts / sessions / clerk_identity_links (per product, unchanged)
  ├─ provider_profiles (role, status, profile data; publish gates)
  │     └─ verification_records (append-only staff workflow)
  └─ customer_profiles (email identity for guests; person_id set once email is proven)
        ├─ customer_access_tokens (signed emailed links)
        ├─ ticket_orders / tickets (Live)
        └─ academy_registrations (Academy)
terms_documents / terms_acceptances (guests by customer_profile + email; providers by person/user)
marketing_consents (separate, opt-in, never pre-ticked)
```

### 4.2 Target flows — customers (no account)

**Live free RSVP / paid checkout / Academy registration (guest)**

1. Form asks only what the event needs: name, email, **confirm email** (paste allowed, compared case-insensitively), typo suggestion ("Did you mean …@gmail.com?" — never auto-corrected), quantity/categories, attendee names if the event requires them, terms consent (Ticket Terms + Privacy, links open the draft pages) and a separate, **unticked** marketing checkbox. Turnstile widget.
2. Server: Turnstile → rate limits → validation → `customer_profiles` upsert by normalised email (no `persons` link yet: the email is unproven) → terms acceptance rows (document, version, customer, email, hashed IP, context `order:<id>`) → hold/order.
3. Free events: **email verification is required before tickets issue** (decision: free-event spam). The order is created `pending_verification` with a hold (30 min); the email contains a 6-digit code **and** a "confirm" link; confirming issues the tickets. Confirming proves inbox control → `customer_profiles.email_verified_at` + person link.
4. Paid events: Stripe Checkout (test) → webhook issues tickets → confirmation page (polls order state; works from the Checkout `success_url` even if the webhook is late — shows "Payment received, issuing your tickets…" and refreshes with a meta refresh, no JS needed).
5. Confirmation page: **"Save your tickets to your phone"** primary action, per-ticket image (long-press), PNG, PDF, "download all" (one PDF), calendar `.ics`, map link to the venue, screenshot tip, and the manage link.
6. Email: ticket email (manage link, inline QR PNG per ticket — first 10, rest via link — PDF attachment, `.ics`, plain-text part).

**Manage / recover (no password)**

- `/tickets/find` (Live) and `/registrations/find` (Academy): enter email → Turnstile + rate limits → **always the same response** ("If we have tickets for that address, we've emailed a link. It expires in 30 minutes.") → email with a `scope=customer:all` link (30 min) → customer cookie (2 h) → list and download tickets. **Re-sends the same tickets** (same version); never issues new ones.
- Per-order link in every confirmation email: `scope=order:<id>`, valid until event end + 30 days.
- Changed email: a customer can request "send my tickets to another address" only via transfer (per ticket) or by organizer/staff reissue; the order's purchaser email is not editable by the customer (prevents hijack).
- **Claim an account** (optional): after a verified purchase, "Create a Gamo Live account with this email" → standard sign-up with the same verified email → `users.person_id` = the customer's person → the account page lists the customer's orders (read through `customer_profiles.person_id`).

### 4.3 Target flows — providers (accounts)

- **Sign-up** asks email, name and role only (role chips per product: Worship = musician, technician, church; Live = organizer, artist, agent, church; Academy = teacher, church host; Production = technician, client org). Sign-up and sign-in become **distinct**: sign-in with an unknown address answers the same generic "We've sent a code if…" message and the code step then says "No account yet — create one" without revealing other products (fixes enumeration and silent creation). Recover = sign-in (no passwords by design).
- **Onboarding stepper** (shared component): role-specific steps; everything saves as **draft**; progress shown; every step reachable by keyboard; works without JS (each step is a form POST + 303).
- **Publish gates** (a profile/event goes public only when all hold): verified email; profile complete for the role; current Provider/Organizer Terms accepted; staff review where required (church, musician, technician; organizer's first event); payout details for paid events (Stripe Connect is **not** built — paid events stay fail-closed, so the gate reads "payout setup not available yet").
- **Social login**: "Continue with Google" through each product's own Clerk app (`authenticateWithRedirect`, shared `/account/sso-callback` page, then the existing token exchange). Shown only when that product's Clerk is configured **and** `CLERK_GOOGLE_ENABLED_<APP>=true` (owner enables Google in that Clerk app). Account linking = person linking by verified email (§4.6).
- **Clerk session revocation** (Phase 11 review): store Clerk `sid` on the D1 session; `POST /api/webhook/clerk` (Svix-signed, `CLERK_WEBHOOK_SECRET_<APP>`) revokes matching Gamo sessions on `session.ended|revoked|removed`, `user.deleted`, `user.banned`; without the secret the route answers 503 and the 7-day gap remains documented.

### 4.4 Staff review (admin app)

- **Church verification queue**: list by state; actions `schedule_meeting` (date/time, location, staff), `verify` (staff name auto from the signed-in staff user, meeting date, notes required), `request_changes`, `reject`, `suspend`. Every action appends a `verification_records` row and an `audit_logs` row; self-review blocked. `verified` + complete profile → church may publish; listing happens on publish.
- **Provider review queue** (musician, technician, teacher, artist, agent): same states minus the in-person meeting (optional `meeting_scheduled` allowed).
- **First-event review**: an organizer's first event goes to `pending_review` (existing `AdminService.reviewEvent`, now with a page); later events publish directly once the organizer is verified, unless staff set `always_review`.
- Existing self-verification bugs are closed: Live artist profiles start `draft`; organization creation no longer opens the Worship church workspace by itself (requires a verified church profile).

### 4.5 Terms (drafts)

Documents (each page shows **"DRAFT — requires legal review"** and its version): Site Terms, Privacy Policy, Ticket Terms (incl. no resale, transfers, refunds per event policy, first-scan-wins), Organizer Terms, Provider and Church Terms with Code of Conduct, Academy Enrollment Terms with guardian consent and child-safety consent. Stored as `terms_documents(slug, version, content_hash, status)`; content lives in `packages/ui` (rendered pages on gamostudio.org `/legal/<slug>`). Acceptance rows record document, version, timestamp, hashed IP (HMAC with `SESSION_SECRET`-independent `PII_HASH_SECRET`), context, and either user/person or customer + email. A new version requires re-acceptance at the next gated action.

### 4.6 Cross-product person (AGENTS.md amendment)

- Linking happens **only** from a verified email, inside D1, after the product has authenticated the person on its own.
- What is shared: `persons` (display name, verified email), `provider_profiles` (all roles), terms acceptances. What stays per product: users, product accounts, sessions, Clerk apps/links, staff and program roles, workspaces, onboarding status.
- A person can see in each product's account page which other products know them ("Also on Gamo Worship") and may **unlink** a product (sets `users.person_id = NULL`, audit row).
- No cookie, token or session is ever valid in two products.

### 4.7 Academy registration (guest)

`academy_registrations` (new; `enrollments` needs a user): program/lesson slug, location, schedule text, student first name + age band (no birth date), guardian name/email/phone (required when the student is under 18), `customer_profile_id`, status (`reserved`, `pending_payment`, `paid`, `cancelled`, `waitlisted`), terms + guardian + child-safety consent ids, manage link. "Pay" uses Stripe Checkout test path with the same gate as Live (503 in production); "Reserve" (no payment) works everywhere and sends a receipt with location and a manage link. Reminders: `email_log` kind `academy_reminder`, sent by the future cron (documented, not scheduled). Recurring billing: customer-portal link, fail-closed until Stripe is live.

---

## 5. Gamo Live ticketing

### 5.1 Data model (migration `0012`+; owned by the schema agent)

New tables (all `IF NOT EXISTS`, ids `TEXT` with prefixes, times epoch seconds, money integer minor units, currency ISO lowercase):

| Table | Purpose / key columns |
| --- | --- |
| `persons` | `id`, `email_normalized` UNIQUE, `email_verified_at`, `display_name`, `erased_at`, timestamps |
| `customer_profiles` | `id`, `email_normalized` UNIQUE, `person_id` FK NULL, `display_name`, `phone` NULL, `email_verified_at`, `erased_at`, timestamps |
| `customer_access_tokens` | `id`, `customer_profile_id`, `token_hash` UNIQUE (HMAC), `scope` (`customer:all` \| `order:<id>` \| `ticket:<id>` \| `registration:<id>` \| `transfer:<id>`), `purpose`, `expires_at`, `last_used_at`, `use_count`, `revoked_at`, `created_ip_hash`, `created_at` |
| `customer_sessions` | short-lived cookie sessions created from a token: `id`, `customer_profile_id`, `scope`, `token_id`, `expires_at`, `revoked_at` |
| `provider_profiles` | `id`, `person_id`, `role` (`musician` `technician` `church` `agent` `organizer` `teacher` `artist`), `product_origin`, `organization_id` NULL, `display_name`, `slug` UNIQUE NULL, `profile_json`, `status` (`draft` `submitted` `meeting_scheduled` `in_review` `changes_requested` `verified` `rejected` `suspended`), `published_at`, `requires_staff_review`, timestamps; unique (`person_id`, `role`, `organization_id`) |
| `verification_records` | append-only: `id`, `subject_type` (`provider_profile` `event` `organizer`), `subject_id`, `action`, `from_status`, `to_status`, `staff_user_id`, `staff_name`, `meeting_at`, `meeting_location`, `notes`, `created_at` |
| `terms_documents` | `id`, `slug`, `version`, `title`, `status` (`draft` `active` `retired`), `content_hash`, `effective_at`, `legal_review_status` (`draft_requires_review`); unique (`slug`, `version`) |
| `terms_acceptances` | `id`, `document_slug`, `document_version`, `person_id` NULL, `user_id` NULL, `customer_profile_id` NULL, `email_normalized` NULL, `context`, `ip_hash`, `accepted_at`; CHECK at least one subject |
| `marketing_consents` | `id`, `email_normalized`, `product`, `granted` 0/1, `source`, `ip_hash`, `created_at` |
| `venues` | `id`, `organization_id` NULL, `name`, `address`, `city`, `state`, `country`, `timezone`, `accessibility_notes`, `latitude`/`longitude` NULL |
| `venue_maps` | `id`, `venue_id` NULL, `event_id` NULL, `media_key` (R2), `media_type` (`image/png` `image/jpeg` `image/webp` `image/svg+xml`), `width`, `height`, `alt_text`, `status` |
| `venue_sections` | `id`, `venue_map_id`, `event_id`, `tier_id` (category), `code`, `name`, `price_cents`, `capacity`, `reserved_count`, `sold_count`, `shape_json` (polygon in map units), `zone_code`, `gate_label`, `accessible` 0/1, `companion_seats` 0/1, `sort_order`; trigger `0 ≤ reserved ≤ capacity` |
| `venue_seats` | Phase 2 placeholder: `id`, `section_id`, `row_label`, `seat_label`, `accessible`, `status` (empty table now) |
| `order_items` | `id`, `order_id`, `tier_id`, `section_id` NULL, `seat_id` NULL, `quantity`, `unit_price_cents`, `subtotal_cents`, `refunded_quantity`, `created_at` |
| `ticket_scan_events` | `id`, `event_id`, `ticket_id` NULL, `ticket_version` NULL, `scanner_session_id` NULL, `scanned_by_user_id` NULL, `direction` (`in` `out`), `gate`, `result`, `override_reason`, `client_scan_id`, `device_scanned_at`, `received_at`, `offline` 0/1, `conflict` (`none` `duplicate_offline` `superseded`), `day_key`; unique (`scanner_session_id`, `client_scan_id`) |
| `ticket_presence` | PK (`ticket_id`, `day_key`): `state` (`outside` `inside`), `entry_count`, `exit_count`, `first_entry_at`, `last_scan_at`, `last_gate`, `last_scan_event_id` |
| `scanner_sessions` | `id`, `event_id`, `label`, `link_token_hash` UNIQUE, `pin_hash`, `pin_salt`, `allowed_directions`, `allowed_zones_json`, `created_by_user_id`, `expires_at`, `revoked_at`, `failed_pin_attempts`, `locked_until`, `last_seen_at` |
| `scanner_devices` | cookie sessions after PIN: `id`, `scanner_session_id`, `device_label`, `expires_at`, `revoked_at`, `last_sync_at` |
| `event_policies` | PK `event_id`: `reentry_allowed`, `reentry_limit` NULL, `refund_policy`, `refund_cutoff_hours`, `transfer_allowed`, `transfer_cutoff_hours`, `attendee_names_required`, `max_tickets_per_order`, `door_sales_enabled`, `door_sales_methods_json`, `age_policy`, `min_age` NULL, `scan_opens_minutes_before`, `updated_by_user_id`, timestamps |
| `event_changes` | `id`, `event_id`, `kind` (`cancelled` `rescheduled` `venue_changed` `details`), `before_json`, `after_json`, `notified_at`, `created_by_user_id`, `created_at` |
| `waitlist_entries` | `id`, `event_id`, `tier_id` NULL, `customer_profile_id`, `quantity`, `status` (`waiting` `notified` `converted` `removed`), `notified_at`, `created_at`; unique (`event_id`, `tier_id`, `customer_profile_id`) |
| `email_log` | `id`, `kind`, `idempotency_key` UNIQUE, `recipient_email` (retention-limited), `recipient_hash`, `subject`, `related_type`, `related_id`, `status` (`queued` `sent` `delivered` `delivery_delayed` `bounced` `complained` `failed` `suppressed` `not_configured`), `provider_message_id`, `attempts`, `next_attempt_at`, `last_error_code`, timestamps |
| `email_suppressions` | PK `email_hash`: `reason` (`hard_bounce` `complaint` `manual`), `created_at` |
| `rate_limit_counters` | PK (`bucket`, `window_start`): `count`, `expires_at` |
| `ticket_access_log` | who looked up or downloaded which ticket: `id`, `ticket_id` NULL, `order_id` NULL, `actor_type` (`customer` `organizer` `staff` `scanner`), `actor_id`, `action` (`view` `download_pdf` `download_png` `lookup` `resend` `reissue` `transfer` `override`), `ip_hash`, `created_at` |

Altered (additive `ALTER TABLE … ADD COLUMN`, nullable or defaulted):

- `users`: `person_id`.
- `sessions`: `clerk_session_id`.
- `ticket_tiers` (categories): `kind` (`general` `vip` `child` `companion` `accessible` `group` `table` `day_pass` `multi_day`), `description`, `sold_count`, `per_order_limit`, `min_age`/`max_age`, `seats_per_ticket` (group/table, default 1), `zone_codes_json`, `valid_days_json` (multi-day), `sales_start_at`/`sales_end_at`, `requires_companion_of`, `currency`, `sort_order`, `status` (`active` `hidden` `sold_out` `closed`). `reserved_count` = held + sold (unchanged meaning, guarded by the existing trigger).
- `ticket_holds`: `order_id`, `order_item_id`, `section_id`, `seat_id`, `customer_profile_id`, `stripe_checkout_session_id`, `released_at`. Partial unique index (`event_id`, `seat_id`) WHERE `status='held' AND seat_id IS NOT NULL`. Triggers: `held → expired|released` gives back category + section counts; `held → converted` moves held→sold (`sold_count += qty`).
- `ticket_orders`: `customer_profile_id`, `order_reference` (human: `GL-7K4M-92QX`), `hold_expires_at`, `stripe_checkout_expires_at`, `amount_refunded_cents`, `payment_status`, `disputed_at`, `cancelled_at`, `policy_snapshot_json`, `source` (`online` `door` `organizer_issue`), `verification_required`, `email_verified_at`, `updated_at`. Status set extends to `pending_verification` `pending_payment` `paid` `confirmed` `partially_refunded` `refunded` `cancelled` `expired` `disputed` `paid_unfulfillable`.
- `tickets`: `order_item_id`, `tier_id` (exists), `section_id`, `seat_id`, `customer_profile_id`, `version` (default 1), `qr_salt`, `qr_key_id`, `seq` (position in item), `zone_code`, `gate_label`, `transferred_from_ticket_email`, `transfer_count`, `voided_at`, `void_reason`, `refunded_at`, `issued_at`, `updated_at`. New tickets store a random, unpublished `qr_token` handle (`tkm_…`, migration 0014; the legacy plaintext-token scan path refuses managed tickets) and `qr_signature_hash = sha256(current MAC)`. Unique (`order_item_id`, `seq`); partial unique (`event_id`, `seat_id`) WHERE `seat_id IS NOT NULL AND status NOT IN ('voided','refunded')`. **Uniqueness** ("unique per event, holder, category and section"): every ticket is its own row for one (event, category, section, holder) with its own id and QR; issuance is unique per (`order_item_id`, `seq`), and when the event requires attendee names the names within an order must be distinct. A database-wide unique index on (event, holder email, category, section) is deliberately **not** used: it would stop a parent buying three GA tickets with one address. Trigger: `valid → voided|refunded` gives back `seats_per_ticket` units to category/section (`released_on_void` flag so a voided-and-reissued ticket doesn't double-release).
- `events`: `venue_id`, `venue_map_id`, `first_event_review` 0/1, `cancelled_at`, `rescheduled_from_starts_at`, `door_sales_cash_enabled`.
- `organizer_profiles`: `first_event_approved_at`, `always_review` 0/1.

Legacy rows: existing `event_registrations` tokens (`gamt_…`) stay scannable via the legacy path (read-only, atomic admit fixed); no new rows are written there.

### 5.2 Holds and checkout (atomic)

```
POST /api/checkout  (or /api/events/:id/rsvp for free)
  Turnstile → rate limits → validate (policy bounds, per-order limit, categories on sale, age/companion rules)
  release expired holds for this event (UPDATE ticket_holds SET status='expired' WHERE event_id=? AND status='held'
                                        AND expires_at<=now AND (stripe session expired or none))  → triggers give back counts
  db.batch([
    INSERT ticket_orders (status pending_payment | pending_verification, idempotency_key UNIQUE),
    for each item: INSERT order_items,
                   UPDATE ticket_tiers   SET reserved_count = reserved_count + q*seats  WHERE id=?   (trigger aborts if > capacity)
                   UPDATE venue_sections SET reserved_count = reserved_count + q*seats  WHERE id=?   (trigger aborts if > capacity)
                   INSERT ticket_holds (expires_at = now + 30 min)
  ])                                         → any overflow aborts the whole batch → 409 SOLD_OUT (with remaining counts)
  same idempotency key again → returns the existing order (no second hold)
  paid: create Stripe Checkout (test) with expires_at = hold expiry, idempotency key checkout_<orderId>
```

Webhook (`/api/webhook/stripe`): signature → `livemode === false` → **claim** (`INSERT INTO stripe_webhook_events … status='processing'`; existing `processed` → 200 dedupe; `processing` older than 5 min → reclaim) → dispatch:

- `checkout.session.completed` (+ `async_payment_succeeded`): verify `payment_status='paid'`, `amount_total`, `currency`, `metadata.orderId`; `db.batch` [order `paid` WHERE status IN (`pending_payment`,`expired`), holds `converted`, `INSERT OR IGNORE` tickets with deterministic ids `tkt_<itemId>_<seq>`, payment record] — fully idempotent. If the hold had already expired and inventory is gone: order `paid_unfulfillable` → staff alert + automatic full refund via Stripe test API (or flagged when the refund call fails).
- `checkout.session.expired`: holds `released`, order `expired`.
- `charge.refunded` / `refund.updated`: reconcile `amount_refunded_cents`.
- `charge.dispute.created`: order `disputed`; tickets not yet scanned are voided (configurable), organizer notified.
- Unknown types: record `ignored`, 200 (no retry storms).
- Mark `processed`; on error mark `failed` and answer 500 so Stripe retries.

Refunds (organizer/staff): choose tickets → Stripe refund (test) for their amount → only those tickets `refunded`, `order_items.refunded_quantity` += n, `amount_refunded_cents` accumulates (CHECK ≤ total), counts released by trigger. Free orders: "cancel tickets" instead.

### 5.3 Ticket state machine

```
                 (free: email confirmed / paid: webhook paid / door: organizer issue)
   [hold] ─────────────────────────────────────────────────────────▶ VALID (version v)
     │  expiry / cancel                                               │   │   │
     ▼                                                                │   │   └─ transfer (policy) ─▶ VALID (v+1, new holder; old QR dead)
  released                                                            │   └──── reissue (organizer/staff) ─▶ VALID (v+1; old QR dead)
                                                                      ├─ refund ─▶ REFUNDED (terminal; QR dead)
                                                                      └─ void / dispute / event cancelled ─▶ VOIDED (terminal; QR dead)

Presence per ticket per day_key (independent of status, only while VALID):
   outside ──scan in──▶ inside ──scan out (re-entry allowed)──▶ outside ──scan in (entry_count < limit)──▶ inside
   inside ──scan in──▶ "already inside" (no change)          outside(after exit, re-entry not allowed) ──scan in──▶ "already used"
```

Scan results (shown large, colour + icon + text, never colour alone): `admitted`, `exited`, `already_inside` (when/where), `already_used` (when/where), `reentry_denied`, `wrong_event` (that event's name only), `wrong_zone` (allowed zones), `voided`, `refunded`, `stale_version` ("this ticket was transferred or reissued"), `invalid` (bad signature), `not_found`, `not_open_yet`, `event_cancelled`, `override_admitted`. Admission is one conditional statement (`INSERT … ON CONFLICT(ticket_id, day_key) DO UPDATE … WHERE state='outside' AND entry_count < limit RETURNING`) so two scanners racing on the same ticket produce exactly one `admitted`. Repeat scans of the same code on the same device within 4 s are ignored client-side and deduplicated server-side by `client_scan_id`.

Scan results expose **only** holder first name + last initial, category, section/zone and the result — never email, order total or other tickets (manual lookup shows more to authorised organizers only, and every lookup is written to `ticket_access_log`).

### 5.4 Event policies (defaults → bounds)

| Policy | Default | Bounds |
| --- | --- | --- |
| Re-entry | allowed, unlimited | allowed/not; limit 1–20 |
| Refunds | until 48 h before start | none · until start · 24 h · 48 h · 7 d · organizer discretion |
| Transfers | allowed until start | allowed/not; cutoff 0–168 h before start; max 3 transfers per ticket |
| Attendee names | not required | required/not |
| Tickets per order | 10 | 1–20 |
| Door sales | off | free issue · cash recorded (no card at the door) |
| Age | all ages | all ages · min age 1–21 (ID check note on ticket) |
| Scanning opens | 120 min before start | 0–720 min |
| Hold duration | 30 min (platform, not editable) | — |

A policy snapshot is copied to each order (`policy_snapshot_json`) so later edits don't change bought tickets' terms; refund and transfer decisions read the snapshot, tightened only in the buyer's favour.

### 5.5 Event changes

Cancel → all valid tickets voided with reason `event_cancelled`, paid orders refunded in full (test API; production fail-closed means staff refunds), every ticket email notified, event page shows "Cancelled". Reschedule → tickets stay valid, version unchanged, email with new date + `.ics` update (same `UID`, higher `SEQUENCE`), refund window opens per policy ("can't make the new date"). Venue change → same, with new map link. All in `event_changes` + `email_log`.

### 5.6 Venue blueprint

Organizer uploads PNG/JPEG/WebP (≤ 5 MB) or SVG (≤ 1 MB; **sanitised server-side**: no script, foreignObject, event handlers, external references; served as an image with `Content-Security-Policy: sandbox` and `nosniff`, never inline). Sections drawn as polygons over the image in a small editor island (click to add points, keyboard alternative: numeric coordinates), each with name, category, price, capacity, zone, gate, accessible flag. Buyers see an `<svg>` overlay with focusable `<a>`/`<button>` polygons labelled "Section B — VIP — $40 — 12 left", **plus an equivalent list** (the list is the primary control on small screens and for assistive tech).

---

## 6. QR format

```
GL1.<TICKET>.<V>.<MAC>
GL1     format + key id ("GL" Gamo Live, "1" = key generation 1; rotation adds GL2 with a new key while GL1 is still accepted)
TICKET  26 chars Crockford base32 (upper case) = the random 130-bit part of the ticket id  (tickets.id = 'tkt_' + lower-case form)
V       version, base-10, starting at 1 (bumped by transfer, reissue)
MAC     26 chars base32 of the first 128 bits of HMAC-SHA256(TICKET_QR_SECRET_GL1, "GL1|" + ticketId + "|" + V + "|" + eventId + "|" + qr_salt)
```

- Only QR alphanumeric characters (`0-9 A-Z . `) → QR alphanumeric mode, ~58 characters → version 4, error correction **M**, 4-module quiet zone, black on white, ≥ 35 mm printed / ≥ 240 CSS px on screen.
- No personal data in the code. The server is the source of truth for status, category, zone and section.
- Verification: parse → constant-time compare MAC → load ticket → compare version → status/presence/zone/time checks.
- Offline manifest carries `sha256(MAC)` per ticket so a device can verify a scan without holding the signing key.
- Legacy `gamt_…` tokens remain accepted for already-issued free RSVPs.

---

## 7. Edge cases and how each is handled

| Area | Case | Handling |
| --- | --- | --- |
| Payment | Paid but webhook late | Success page shows "Payment received — issuing tickets" and refreshes; hold kept until Stripe session expiry + 5 min grace; webhook fulfils whenever it arrives. |
| | Webhook retries / replays | Claim row in `stripe_webhook_events`; deterministic ticket ids + `INSERT OR IGNORE`; conditional order transitions. |
| | Double click / double submit | Client disables the button; server idempotency key (form-rendered UUID) → same order returned. |
| | Partial refund | Per-ticket refund; only those tickets `refunded`; cumulative amount CHECK. |
| | Chargeback | `disputed`; unscanned tickets voided; organizer + staff notified. |
| | Abandoned hold | Expiry 30 min; released lazily on every hold attempt and on order view; Stripe session expiry webhook releases too. |
| | Sold out | Batch aborts → 409 with remaining counts; category shows "Sold out"; waitlist offered. |
| | Waitlist | `waitlist_entries`; when holds release, earliest entries are emailed "tickets available" (first come, no reservation); never auto-charged. |
| | Paid after hold expired and stock gone | `paid_unfulfillable` → automatic refund (test) or staff queue. |
| | Amount/currency mismatch in webhook | Not fulfilled; order flagged; staff alert. |
| | Live Stripe key present | Refused at runtime (existing). |
| Email | Typo | Confirm-email field + typo suggestion; free orders require verification so a typo can't produce tickets for a stranger. |
| | Bounce / complaint | Resend webhook → `email_suppressions`; confirmation page shows "We couldn't deliver to …, download your tickets now"; organizer sees the bounce. |
| | Spam folder | Confirmation page tells the buyer to check spam and offers download; sender is the verified domain with plain-text part. |
| | Shared family / church address | Many orders per email allowed; per-ticket holder names; recovery lists all orders for that address. |
| | Changed email | Per-ticket transfer to the new address, or organizer reissue; purchaser email immutable for customers. |
| Tickets | Lost | Recovery by email (same tickets re-sent). |
| | Stolen / leaked | Organizer reissue → version+1, old QR dead. |
| | Shared screenshot | First scan wins; second shows "already inside since 19:02 at Gate A". |
| | Transfer | Per ticket, within policy; recipient gets an email with a manage link; old QR dead; audit + access log. |
| | Name mismatch at the door | Names are informational unless the event requires them; scanner shows first name + initial; staff may override with a reason. |
| | Dead phone | Manual lookup by name, email or order reference → admit with logged override. |
| | Offline venue | Manifest + queued scans + later sync (T-10). |
| Door | Two scanners offline admit the same ticket | Both accepted locally; on sync the later one is flagged `duplicate_offline`; dashboard lists duplicates. |
| | Duplicate scan | 4 s client debounce + server `client_scan_id` uniqueness. |
| | Supervisor override | Only from an organizer account or a scanner session with `can_override`; reason required; logged. |
| | Cash sale | Door sales (policy) record `source='door'`, payment method `cash_recorded`, amount; ticket issued immediately; no card at the door. |
| | Exit and re-entry | Per-event policy; presence per `day_key`. |
| | Multi-day passes | Category `valid_days_json`; presence keyed by local date in the venue time zone; entry allowed only on valid days. |
| | Time zones | All instants UTC; all display in the event's IANA zone with the zone abbreviation; scanning window computed in UTC; `day_key` = venue-local date. DST-safe conversion helper replaces the one-pass offset. |
| | Event in progress | Registration closes at `starts_at` everywhere (UI and API agree). |
| Access | Wheelchair seating + companion | Accessible sections/categories; companion category bound via `requires_companion_of` (companion tickets only with an accessible ticket, 1:1). |
| | Child / age-restricted | Child category with `max_age`; event `min_age` shown on ticket and at purchase; no birth dates collected. |
| | Group / table tickets | `seats_per_ticket` > 1 consumes that many units; one QR admits the group (scanner shows "Table of 8"); per-person names optional. |
| Abuse | Bot purchases | Turnstile, per-IP and per-email limits, per-order and per-event-per-email caps. |
| | Free-event spam | Email verification before issue; per-email cap; Turnstile. |
| | Token guessing | 130-bit ticket ids, 128-bit MACs, 256-bit link tokens; constant-time compares; rate-limited endpoints; uniform 404s. |
| | Scanner PIN brute force | 5 wrong PINs → 15 min lock per session + per-IP limit. |
| | Enumeration | Recovery, RSVP and sign-in answer identically whether or not the address exists. |
| Data | Retention | Link tokens deleted 30 days after expiry; `email_log.recipient_email` nulled after 180 days (hash kept); scan events kept 13 months then aggregated; `rate_limit_counters` purged on expiry. |
| | Erasure on request | Staff action: customer profile + person anonymised (`erased_at`, email replaced by hash, holder names "Erased"), financial rows kept (amounts only), audit row. |
| | Audit of lookups | `ticket_access_log` for every view, download, lookup, resend, reissue, transfer, override. |
| More | Event cancelled after scans | Tickets voided; scanner shows `event_cancelled`. |
| | Organizer edits price after sales | Existing orders keep their price (order items store unit price). |
| | Capacity lowered below sold | Rejected by trigger; UI explains the minimum. |
| | Clock skew on scanner devices | Server stores both device time and receipt time; reconciliation orders by device time only within one device. |
| | Category hidden mid-sale | Existing holds complete; new holds refused. |
| | Email to many recipients after a change | Chunked sends with idempotency keys per ticket email; partial failures retried on next organizer action. |
| | Customer opens an old manage link after transfer | Shows the ticket as "transferred to j•••@…" without the QR. |

---

## 8. What we will **not** do (now)

- Individual seat selection (Phase 2) — schema only.
- Apple/Google Wallet passes — design hook only (stable id + version).
- Resale or any secondary market; price changes for bought tickets.
- Live (real-money) payments, Stripe Connect payouts, card payments at the door, mobile money or other processors.
- Turning on the production paid-checkout path (always 503 in production).
- Scheduled jobs (cron) — designed and documented, owner enables (O-19).
- Deploying, pushing, or running any remote Cloudflare/Clerk/Resend/Stripe command; creating Turnstile widgets or webhooks.
- Shared SSO, cross-product cookies, or automatic grants of product access or staff roles via the person record.
- Collecting birth dates, ID documents or full addresses of children.
- Final legal text (drafts only).

---

## 9. Work split (Phase 2 ownership)

| Owner | Owns (may edit) | Must not edit |
| --- | --- | --- |
| Schema agent (Phase 1) | `packages/db/**` (migrations `0012`+, schema, testing), `packages/domain/src/types/**`, shared primitives in `packages/domain/src/security/**` (QR codec + signer, link tokens, rate limiter, Turnstile verifier, PII hasher, base32), `packages/config/env.ts` + `env-validation.ts` + `.dev.vars.example` for all new variables, `docs/DATABASE.md` | app pages |
| Agent A — identity | `packages/ui/src/components/{auth,onboarding,forms,legal}/**`, `packages/domain/src/services/{identity,persons,providers,customers,terms,academy}*.ts`, `packages/auth/**` (person link, Clerk sid/webhook), all apps' `account/**` pages + auth APIs, `apps/academy` registration, `apps/admin` review queues, `apps/web` legal pages, `docs/IDENTITY.md` | ticketing services, `apps/live` ticket/scanner pages |
| Agent B — ticketing | `packages/domain/src/services/ticketing/{checkout,issuance,orders,refunds,transfers,recovery,event-changes,render,email}*.ts`, `packages/integrations` (Stripe Checkout/refund, Resend attachments + webhook), `apps/live` event, checkout, tickets, manage, webhook pages/APIs, `docs/TICKETING.md` | scanner, venue map |
| Agent C — scanner & maps | `packages/domain/src/services/ticketing/{scanning,manifest,venue-maps,dashboard}*.ts`, `apps/live` `/scan/**`, `/organizer/**` pages + APIs, scanner service worker | checkout/issuance |
| Lead | `openapi/root.yaml` merges + regeneration, `page-access.ts`, `robots.txt`, `security-headers.ts`, AGENTS/ARCHITECTURE/RUNBOOK, CLEANUP_LOG | — |

Each agent adds its own `openapi/paths/*.yaml` files and the `root.yaml` lines for them (merge conflicts in `root.yaml` are resolved by the lead and the generated files regenerated after merge). Schema changes after Phase 1 go through the lead (new migration file), never by editing `0012`.

## 10. New configuration (names only)

| Name | Apps | Kind | Without it (outside local) |
| --- | --- | --- | --- |
| `TICKET_QR_SECRET_GL1` | live | secret ≥ 32 chars | ticket issue and scan answer 503 |
| `CUSTOMER_LINK_SECRET` | live, academy | secret ≥ 32 chars | manage/recovery links 503 |
| `PII_HASH_SECRET` | all public apps | secret ≥ 32 chars | consent recording 503 (forms that need it) |
| `SCANNER_SESSION_SECRET` | live | secret ≥ 32 chars | scanner 503 |
| `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | all public apps | var + secret | protected public forms 503 |
| `STRIPE_TEST_CHECKOUT` | live, academy | var (`true` only in local/preview) | paid checkout 503 (production: always 503) |
| `RESEND_WEBHOOK_SECRET` | live (+ academy) | secret | `/api/webhook/resend` 503 |
| `CLERK_WEBHOOK_SECRET_<APP>` | public apps | secret | `/api/webhook/clerk` 503 |
| `CLERK_GOOGLE_ENABLED_<APP>` | public apps | var | Google button hidden |

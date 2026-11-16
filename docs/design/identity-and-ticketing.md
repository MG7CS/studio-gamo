# Identity and registration — design (ticketing removed)

> [!WARNING]
> **Retired 2026-11-16 (owner decision).** The identity, onboarding, provider-profile and shared person record design below was removed with public accounts. The file name and section numbers are kept only because older code comments and migrations cite them. Customer link tokens (Academy manage links) remain in use. Current model: [forms, emails and invoices spec](../superpowers/specs/2026-11-16-forms-emails-invoices-design.md); rules in `AGENTS.md` ("Forms, emails and admin"). Kept as a historical record only; do not build from it.

> [!NOTE]
> **2026-11-16 — Gamo Live dropped.** The owner narrowed Gamo Studios to three programs (Gamo Academy, Gamo Worship, Gamo Production). Everything this document designed for Gamo Live ticketing — holds and checkout for events, ticket state machine, event policies, venue blueprints, the `GL1` QR format, door scanning and offline scanner manifests — was removed together with `apps/live`, and its database tables were dropped in migration `0018`. The full original design is preserved at tag `four-programs-snapshot` (branch `archive/four-programs-2026-11-16`, commit `1f764d6`), path `docs/design/identity-and-ticketing.md`. The file name and the section numbers below are kept because code comments and migrations cite `§4`, `§5.1` and `§10`. A second cleanup (designed separately, later) will simplify the remaining programs into forms, emails and invoices.

Status: **design of record** for the 2026-10-18 identity change (originally `cleanup/foundation-pass`). Where this document and older docs disagree, this document wins for identity and registration; `docs/IDENTITY.md` describes what was built.

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

Removed 2026-11-16 (see the note at the top). The 2026-10-18 ticketing inventory is in the snapshot.

---

## 2. Owner decisions (final) and how they are realised

1. **Kinds of people.** *Customers* (parents, students): no account; email is identity. *Providers* (musicians, technicians, churches, teachers): full accounts (emailed code or Clerk, Google where Clerk is configured). (The 2026-10-18 decision also covered ticket buyers, Live organizers/agents/artists and door staff; those parts lapsed with Gamo Live.)
2. **Customers manage through signed emailed links**, no password. They may later claim an account with the same verified email; the account attaches to the existing customer record.
3. **Shared person record.** One Clerk application per product stays. A D1 `persons` row keyed by **verified** normalised email links a provider's per-product users, so profile and provider roles carry across products, and signing in with the same email or Google account (verified email) resolves to the same person. Feasibility: works with separate Clerk apps because linking happens in D1 *after* each product verifies the email independently; no Clerk-side linking, no shared cookie, no SSO. Product accounts, sessions and staff/authorization roles stay per product. AGENTS.md "Product Account Independence" is amended to record this owner-approved exception precisely (§4.6).
4. **Church verification in person**: `submitted → meeting_scheduled → verified (staff name, date, notes) → listed`. Churches draft freely; publishing requires `verified`. Same staff gates for musicians and technicians.
5–7. *(Event policies, no-resale/transfer rules and seating applied to Gamo Live ticketing; withdrawn 2026-11-16.)*

---

## 3. Key technical decisions

T-01 (event inventory authority), T-02 (ticket table reuse), T-03 (ticket QR), T-06 (ticket rendering), T-09 (scanner sessions) and T-10 (offline scanning) were ticketing decisions and were withdrawn with Gamo Live on 2026-11-16; see the snapshot for their text.

| ID | Decision | Alternatives | Reason |
| --- | --- | --- | --- |
| T-04 | **Paid payments = Stripe Checkout (hosted, test mode)**, not Payment Element. | Payment Element on page. | No Stripe script on our pages (CSP stays `script-src 'self'`), Apple Pay / Google Pay appear automatically where Stripe supports them, card data never touches us, works with almost no JS. Checkout `expires_at` is set to the hold (Stripe minimum 30 min) so a session can't outlive inventory. |
| T-05 | **Paid checkout gate**: `POST /api/checkout` answers **503** unless `ENVIRONMENT ∈ {local, preview}` **and** `STRIPE_TEST_CHECKOUT=true` **and** the key is `sk_test_`/`rk_test_`. Production: always 503 (code path, not config). | Config-only gate. | "Fail closed unless a code path is explicitly marked test." Turning on production sales is a future owner decision + code change. |
| T-07 | **Customer links = random 256-bit token, stored as HMAC-SHA256 with `CUSTOMER_LINK_SECRET`** (separate from `SESSION_SECRET`), scoped, expiring, revocable, rate-limited. Opening a link sets a short-lived, path-scoped, HttpOnly customer cookie and 303-redirects to a token-free URL. | Stateless signed links. | Revocable (stateful) **and** keyed; link pages send `Referrer-Policy: no-referrer`; the token leaves the address bar immediately; email security scanners that prefetch GETs don't consume anything (links are multi-use until expiry). |
| T-08 | **Rate limiting in D1** (`rate_limit_counters`, fixed window, atomic upsert `… ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`), keyed by route + hashed IP and route + hashed email; plus **Turnstile** server verification on public forms. | Workers Rate Limiting binding; KV. | Testable locally and in node tests, no new binding; owner can add Cloudflare WAF rate rules on top (documented). Turnstile is **required outside local** (fail closed: form answers 503 "temporarily unavailable" without keys) — owner action to create widgets. |
| T-11 | **Shared person**: `persons(email_normalized UNIQUE)`; `users.person_id`; `customer_profiles.person_id`. A person is linked only from a **verified** email (product sign-in code, Clerk verified email, or a customer link that proves inbox control). | Link by any email. | Prevents taking over someone's history by typing their address. |
| T-12 | **Emails** go through one outbox: `email_log` (idempotency key unique, status, provider id, attempts) + `email_suppressions` (hard bounce, complaint). Sent inline on the request; retries happen on the next relevant request and via an owner-enabled cron later (O-19 stays an owner decision). The Resend webhook (`/api/webhook/resend` on the global site `apps/web`, Svix signature with `RESEND_WEBHOOK_SECRET`) updates status and suppressions. | Queue binding. | No new binding; honest about delivery. |

T-04 and T-05 now apply to the Academy registration payment path (formerly shared with Live ticket checkout).

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
        └─ academy_registrations (Academy)
terms_documents / terms_acceptances (guests by customer_profile + email; providers by person/user)
marketing_consents (separate, opt-in, never pre-ticked)
```

### 4.2 Target flows — customers (no account)

**Academy registration (guest)**

1. Form asks only what the registration needs: name, email, **confirm email** (paste allowed, compared case-insensitively), typo suggestion ("Did you mean …@gmail.com?" — never auto-corrected), terms consent (links open the draft pages) and a separate, **unticked** marketing checkbox. Turnstile widget.
2. Server: Turnstile → rate limits → validation → `customer_profiles` upsert by normalised email (no `persons` link yet: the email is unproven) → terms acceptance rows (document, version, customer, email, hashed IP, context) → registration.
3. Proving inbox control (a confirm link or code) sets `customer_profiles.email_verified_at` and the person link.
4. Email: receipt with location and the manage link (plain-text part included).

**Manage / recover (no password)**

- `/registrations/find` (Academy): enter email → Turnstile + rate limits → **always the same response** ("If we have registrations for that address, we've emailed a link. It expires in 30 minutes.") → email with a `scope=customer:all` link (30 min) → customer cookie (2 h) → list registrations.
- Per-registration link in every confirmation email: `scope=registration:<id>`.
- **Claim an account** (optional): after a verified registration, standard sign-up with the same verified email → `users.person_id` = the customer's person → the account page lists the customer's registrations (read through `customer_profiles.person_id`).

### 4.3 Target flows — providers (accounts)

- **Sign-up** asks email, name and role only (role chips per product: Worship = musician, technician, church; Academy = teacher, church host; Production = technician, client org). Sign-up and sign-in become **distinct**: sign-in with an unknown address answers the same generic "We've sent a code if…" message and the code step then says "No account yet — create one" without revealing other products (fixes enumeration and silent creation). Recover = sign-in (no passwords by design).
- **Onboarding stepper** (shared component): role-specific steps; everything saves as **draft**; progress shown; every step reachable by keyboard; works without JS (each step is a form POST + 303).
- **Publish gates** (a profile goes public only when all hold): verified email; profile complete for the role; current Provider Terms accepted; staff review where required (church, musician, technician).
- **Social login**: "Continue with Google" through each product's own Clerk app (`authenticateWithRedirect`, shared `/account/sso-callback` page, then the existing token exchange). Shown only when that product's Clerk is configured **and** `CLERK_GOOGLE_ENABLED_<APP>=true` (owner enables Google in that Clerk app). Account linking = person linking by verified email (§4.6).
- **Clerk session revocation** (Phase 11 review): store Clerk `sid` on the D1 session; `POST /api/webhook/clerk` (Svix-signed, `CLERK_WEBHOOK_SECRET_<APP>`) revokes matching Gamo sessions on `session.ended|revoked|removed`, `user.deleted`, `user.banned`; without the secret the route answers 503 and the 7-day gap remains documented.

### 4.4 Staff review (admin app)

- **Church verification queue**: list by state; actions `schedule_meeting` (date/time, location, staff), `verify` (staff name auto from the signed-in staff user, meeting date, notes required), `request_changes`, `reject`, `suspend`. Every action appends a `verification_records` row and an `audit_logs` row; self-review blocked. `verified` + complete profile → church may publish; listing happens on publish.
- **Provider review queue** (musician, technician, teacher): same states minus the in-person meeting (optional `meeting_scheduled` allowed).
- Existing self-verification bugs are closed: organization creation no longer opens the Worship church workspace by itself (requires a verified church profile).

### 4.5 Terms (drafts)

Documents (each page shows **"DRAFT — requires legal review"** and its version): Site Terms, Privacy Policy, Provider and Church Terms with Code of Conduct, Academy Enrollment Terms with guardian consent and child-safety consent. (Ticket Terms and Organizer Terms were Gamo Live documents and are no longer offered.) Stored as `terms_documents(slug, version, content_hash, status)`; content lives in `packages/ui` (rendered pages on gamostudio.org `/legal/<slug>`). Acceptance rows record document, version, timestamp, hashed IP (HMAC with `SESSION_SECRET`-independent `PII_HASH_SECRET`), context, and either user/person or customer + email. A new version requires re-acceptance at the next gated action.

### 4.6 Cross-product person (AGENTS.md amendment)

- Linking happens **only** from a verified email, inside D1, after the product has authenticated the person on its own.
- What is shared: `persons` (display name, verified email), `provider_profiles` (all roles), terms acceptances. What stays per product: users, product accounts, sessions, Clerk apps/links, staff and program roles, workspaces, onboarding status.
- A person can see in each product's account page which other products know them ("Also on Gamo Worship") and may **unlink** a product (sets `users.person_id = NULL`, audit row).
- No cookie, token or session is ever valid in two products.

### 4.7 Academy registration (guest)

`academy_registrations` (new; `enrollments` needs a user): program/lesson slug, location, schedule text, student first name + age band (no birth date), guardian name/email/phone (required when the student is under 18), `customer_profile_id`, status (`reserved`, `pending_payment`, `paid`, `cancelled`, `waitlisted`), terms + guardian + child-safety consent ids, manage link. "Pay" uses the Stripe Checkout test path with the T-05 gate (503 in production); "Reserve" (no payment) works everywhere and sends a receipt with location and a manage link. Reminders: `email_log` kind `academy_reminder`, sent by the future cron (documented, not scheduled). Recurring billing: customer-portal link, fail-closed until Stripe is live.

---

## 5. Data model

The 2026-10-18 change also designed Gamo Live ticketing (holds, orders, scanning, venues). Those tables were dropped in migration `0018` on 2026-11-16; their design is in the snapshot. The identity tables below remain.

### 5.1 Data model (migration `0012`; identity tables)

All `IF NOT EXISTS`, ids `TEXT` with prefixes, times epoch seconds:

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
| `email_log` | `id`, `kind`, `idempotency_key` UNIQUE, `recipient_email` (retention-limited), `recipient_hash`, `subject`, `related_type`, `related_id`, `status` (`queued` `sent` `delivered` `delivery_delayed` `bounced` `complained` `failed` `suppressed` `not_configured`), `provider_message_id`, `attempts`, `next_attempt_at`, `last_error_code`, timestamps |
| `email_suppressions` | PK `email_hash`: `reason` (`hard_bounce` `complaint` `manual`), `created_at` |
| `rate_limit_counters` | PK (`bucket`, `window_start`): `count`, `expires_at` |

`provider_profiles.role` and `verification_records.subject_type` still accept the former Live values (`agent`, `organizer`, `artist`, `event`, `organizer`) at the database level; CHECK constraints were not rebuilt (decision in `docs/DECISIONS.md`, 2026-11-16).

Altered (additive `ALTER TABLE … ADD COLUMN`, nullable or defaulted):

- `users`: `person_id`.
- `sessions`: `clerk_session_id`.

---

## 6. QR format

Removed 2026-11-16 with Gamo Live ticketing (snapshot has the `GL1` format).

---

## 7. Edge cases and how each is handled

| Area | Case | Handling |
| --- | --- | --- |
| Email | Typo | Confirm-email field + typo suggestion. |
| | Bounce / complaint | Resend webhook (on `apps/web`) → `email_suppressions`. |
| | Spam folder | Confirmation page tells the person to check spam; sender is the verified domain with plain-text part. |
| | Shared family / church address | Many registrations per email allowed; recovery lists all of them for that address. |
| Abuse | Bot submissions | Turnstile, per-IP and per-email limits. |
| | Token guessing | 256-bit link tokens; constant-time compares; rate-limited endpoints; uniform 404s. |
| | Enumeration | Recovery and sign-in answer identically whether or not the address exists. |
| Data | Retention | Link tokens deleted 30 days after expiry; `email_log.recipient_email` nulled after 180 days (hash kept); `rate_limit_counters` purged on expiry. |
| | Erasure on request | Staff action: customer profile + person anonymised (`erased_at`, email replaced by hash), financial rows kept (amounts only), audit row. |

---

## 8. What we will **not** do (now)

- Live (real-money) payments, Stripe Connect payouts, mobile money or other processors.
- Turning on the production paid-checkout path (always 503 in production).
- Scheduled jobs (cron) — designed and documented, owner enables (O-19).
- Deploying, pushing, or running any remote Cloudflare/Clerk/Resend/Stripe command; creating Turnstile widgets or webhooks.
- Shared SSO, cross-product cookies, or automatic grants of product access or staff roles via the person record.
- Collecting birth dates, ID documents or full addresses of children.
- Final legal text (drafts only).

---

## 9. Work split (Phase 2 ownership)

Historical (2026-10-18 phase plan, including the ticketing and scanner agents); see the snapshot.

## 10. New configuration (names only)

| Name | Apps | Kind | Without it (outside local) |
| --- | --- | --- | --- |
| `CUSTOMER_LINK_SECRET` | academy | secret ≥ 32 chars | manage/recovery links 503 |
| `PII_HASH_SECRET` | all public apps | secret ≥ 32 chars | consent recording 503 (forms that need it) |
| `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | all public apps | var + secret | protected public forms 503 |
| `STRIPE_TEST_CHECKOUT` | academy | var (`true` only in local/preview) | paid checkout 503 (production: always 503) |
| `RESEND_WEBHOOK_SECRET` | web | secret | `/api/webhook/resend` 503 |
| `CLERK_WEBHOOK_SECRET_<APP>` | public apps | secret | `/api/webhook/clerk` 503 |
| `CLERK_GOOGLE_ENABLED_<APP>` | public apps | var | Google button hidden |

`TICKET_QR_SECRET_GL1` and `SCANNER_SESSION_SECRET` were Live-only and are no longer used.

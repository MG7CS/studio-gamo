# Gamo Studios — Cloudflare Backend & API Architecture

<!-- status-banner: 2026-10 foundation pass -->
> **Design notes.** For what the code does today see [ARCHITECTURE.md](ARCHITECTURE.md) and `openapi/root.yaml`.

**Status:** Authoritative Backend & API Architecture  
**Author:** Gamo Studios Engineering Team  
**Updated:** 2026-10-13  
**Nonprofit Reference:** [`docs/GAMO_NONPROFIT_MODEL.md`](GAMO_NONPROFIT_MODEL.md)  
**Security Reference:** [`SECURITY.md`](../SECURITY.md)

---

## 1. Executive Summary & Architectural Principles

Gamo Studios operates as a Christian nonprofit organization supporting interconnected programs: Gamo Worship, Gamo Academy, Gamo Live, and Gamo Production, coordinated by Gamo Web and administered via Gamo Admin.

The backend infrastructure is **Cloudflare-native**, leveraging:
- **Cloudflare D1**: Serverless SQLite relational database for structured entities, ACID transactions, foreign keys, and durable ledger records.
- **Cloudflare R2**: S3-compatible, zero-egress object storage for media, auditions, resources, and restricted verification artifacts.
- **Cloudflare Workers (Astro SSR)**: Lightweight, geographically distributed server-rendered applications and thin API route handlers.
- **Cloudflare KV**: Ultra-low latency distributed key-value store for session caching and rate-limiting counters.
- **External Integrations**: Stripe Test Mode (restricted sandbox) and Resend (transactional email delivery via standard `fetch`).

### Core Design Rules:
1. **Mission Over Commercialization**: All transactions must distinguish program receipts, third-party payables (musician/instructor pay), processing costs, and charitable contributions. Never pool or net musician pay against Gamo administrative allocations.
2. **Server-Side Authorization Authority**: Client-side persona switchers or form inputs are never trusted for authorization. All mutations verify authenticated identity, active organization memberships, and role capabilities on the server.
3. **Thin API Routes & Rich Domain Repositories**: Astro API routes (`src/pages/api/*`) handle request parsing, invoke typed domain services, and return standard responses. Business rules live in shared packages (`@gamo/domain`, `@gamo/db`, `@gamo/auth`, `@gamo/integrations`).
4. **Strict Sandbox Enforcement**: Live payment keys are actively blocked by code-level gates (`assertStripeTestMode`).

---

## 2. Infrastructure Topology & Cloudflare Bindings

```
                              Internet / Cloudflare CDN
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             ▼                          ▼                          ▼
      gamostudio.org           worship/academy/live/             admin.
       (apps/web)                production apps               (apps/admin)
   [Worker + Astro SSR]       [Workers + Astro SSR]         [CF Zero Trust +
                                                              Worker + Astro]
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        │
                        Shared Package Architecture
       ┌──────────────────┬─────────────┴───────┬──────────────────┐
       ▼                  ▼                     ▼                  ▼
  @gamo/domain        @gamo/db             @gamo/auth       @gamo/integrations
 (Services, Logic) (D1 Drizzle Repos)   (Sessions, RBAC)   (Stripe, Resend, R2)
       │                  │                     │                  │
       └──────────────────┼─────────────────────┼──────────────────┘
                          │                     │
                          ▼                     ▼
                 Cloudflare D1 (DB)      Cloudflare R2 (STORAGE)
                 Cloudflare KV (SESSION) Cloudflare Zero Trust
```

### Worker Bindings Matrix

| Binding Type | Binding Name | Purpose | Applications |
| :--- | :--- | :--- | :--- |
| `d1_database` | `DB` | Primary relational database | All 6 apps (`web`, `worship`, `academy`, `live`, `production`, `admin`) |
| `r2_bucket` | `MEDIA_BUCKET` | Public & restricted media storage | `live`, `worship`, `production`, `academy`, `admin` |
| `kv_namespace`| `SESSION_KV` | Session lookup and rate-limiting | All 6 apps |
| `secret` | `SESSION_SECRET` | 32+ char secret for HMAC cookie signing | All 6 apps |
| `secret` | `STRIPE_SECRET_KEY` | Stripe test secret key (`sk_test_...`) | `live`, `worship`, `academy` |
| `secret` | `STRIPE_WEBHOOK_SECRET`| Stripe webhook secret (`whsec_...`) | `live`, `worship`, `academy` |
| `secret` | `RESEND_API_KEY` | Resend transactional email API key | All 6 apps |
| `var` | `ENVIRONMENT` | `local` \| `preview` \| `production` | All 6 apps |

---

## 3. Relational Data Architecture (D1)

The relational model is managed via Drizzle ORM with explicit SQLite migrations executed through Wrangler. It enforces referential integrity, indexes on frequent query paths, strict enum text checks, and timestamp defaults.

### 3.1 Entity Domains & Relationships

1. **Identity & Access**:
   - `users`: Universal human identity across all apps (`id`, `email`, `display_name`, `status`, `created_at`).
   - `sessions`: Active authenticated user sessions (`id`, `user_id`, `expires_at`, `revoked_at`, `ip_hash`, `user_agent`).
   - `organizations`: Churches, ministries, bands, production companies (`id`, `name`, `slug`, `type`, `verified_at`).
   - `organization_members`: Memberships with tenant roles (`id`, `org_id`, `user_id`, `role`, `status`).
   - `user_roles`: System-wide capabilities (`id`, `user_id`, `role_code`, `scope_type`, `scope_id`).

2. **Gamo Worship**:
   - `musician_profiles`: Musician bio, home zone, travel radius, vetting status (`id`, `user_id`, `status`, `bio`, `home_zone`, `travel_radius_miles`).
   - `musician_skills`: Instruments played and proficiency level (`id`, `musician_id`, `instrument`, `proficiency`).
   - `musician_auditions`: Audition media link, instrument, evaluation state (`id`, `musician_id`, `instrument`, `media_url`, `status`).
   - `churches`: Church profile linked to an organization (`id`, `org_id`, `service_zone`, `address`, `primary_contact_user_id`).
   - `gigs`: Worship service booking requests (`id`, `church_id`, `plan`, `starts_at`, `ends_at`, `status`).
   - `gig_positions`: Instrument slots for a gig (`id`, `gig_id`, `instrument`, `agreed_pay_cents`, `admin_allocation_cents`, `status`).
   - `gig_assignments`: Primary and standby musician assignments (`id`, `position_id`, `musician_id`, `kind`, `status`, `confirmation_deadline`).
   - `checkins`: Sunday check-in records (`id`, `assignment_id`, `status`, `recorded_at`, `lat`, `lng`).

3. **Gamo Academy**:
   - `instructor_profiles`: Vetted instructors (`id`, `user_id`, `bio`, `background_check_status`).
   - `classes`: Group classes, clinics, or private lesson offerings (`id`, `instructor_id`, `host_org_id`, `title`, `duration_minutes`, `capacity`, `suggested_tuition_cents`).
   - `enrollments`: Student registrations (`id`, `class_id`, `student_user_id`, `guardian_user_id`, `funding_source`, `status`).

4. **Gamo Live**:
   - `organizer_profiles`: Event producers (`id`, `org_id`, `kind`, `verification_status`, `ticketing_authorized_at`).
   - `events`: Christian concerts, conferences, worship nights (`id`, `organizer_id`, `title`, `slug`, `category`, `description`, `venue_name`, `city`, `state`, `starts_at`, `ends_at`, `timezone`, `admission_type`, `status`).
   - `event_occurrences`: Recurring or single dates (`id`, `event_id`, `starts_at`, `ends_at`).
   - `ticket_tiers`: Pricing and capacity (`id`, `event_id`, `name`, `price_cents`, `capacity`, `reserved_count`).
   - `event_registrations`: Attendee registrations for free/paid events (`id`, `event_id`, `tier_id`, `user_id`, `attendee_name`, `attendee_email`, `status`, `qr_token`).

5. **Gamo Production**:
   - `production_requests`: Ministry technical consultation intakes (`id`, `church_org_id`, `contact_user_id`, `category`, `scope_summary`, `status`).
   - `production_projects`: Active technical projects (`id`, `request_id`, `lead_engineer_user_id`, `status`, `start_date`).

6. **Nonprofit Financial Ledger & Stripe**:
   - `stripe_webhook_events`: Durable idempotency store (`event_id`, `event_type`, `processed_at`, `status`, `error`).
   - `payment_records`: Authoritative payment intentions and completions (`id`, `session_id`, `payment_intent_id`, `amount_cents`, `currency`, `status`, `source_type`, `source_id`).
   - `ledger_entries`: Nonprofit accounting records separating categories (`id`, `category`, `program`, `fund_id`, `amount_cents`, `currency`, `source_type`, `source_id`, `notes`).
     - *Categories*: `charitable_contribution`, `sponsorship`, `program_service_receipt`, `third_party_payable`, `processing_cost`, `refund`.
     - *Programs*: `worship`, `academy`, `live`, `production`, `general`.

7. **Media & Assets**:
   - `media_files`: File metadata and permissions (`id`, `owner_user_id`, `scope_type`, `scope_id`, `r2_key`, `content_type`, `byte_size`, `access_policy`, `status`).

8. **Audit & Staff Reviews**:
   - `audit_logs`: Immutable trail of administrative and sensitive actions (`id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `payload_json`, `created_at`).
   - `moderation_reviews`: Staff review decisions (`id`, `reviewer_user_id`, `target_type`, `target_id`, `decision`, `notes`, `created_at`).

---

## 4. Authentication & Authorization Architecture

### 4.1 Evaluation of Authentication Approaches
1. **Lucia v3**: Previously initialized in `packages/auth`. However, Lucia was officially deprecated by its creator in 2024 in favor of native Web Crypto patterns. While functional, long-term maintenance relies on unmaintained code.
2. **Third-Party Auth Providers (Clerk, Auth0, Supabase)**: Introduce external dependencies, potential vendor lock-in, and recurring costs incompatible with lean nonprofit stewardship.
3. **Chosen Architecture: Lightweight Native D1 + Web Crypto Session Manager (`@gamo/auth`)**:
   - Zero external runtime dependencies.
   - Built directly on standard Web Crypto API (`crypto.subtle`, `crypto.getRandomValues`).
   - Sessions stored in D1 `sessions` table (with optional KV fast-path read caching).
   - High-security HTTP-only, `SameSite=Lax`, `Secure` session cookies named `__session` or `gamo_session`.
   - Cookie value format: `<sessionId>.<hmacSignature>` signed with `SESSION_SECRET` to prevent tampering.
   - Server-side validation parses user identity, active organization memberships, and role assignments in every request.

### 4.2 Permission & Role Model
Authorization is structured around **Subject-Action-Resource** tuples:
- `SystemRole`: `superadmin`, `staff_reviewer`, `finance_manager`, `user`.
- `OrgRole`: `org_owner`, `org_admin`, `org_member`, `worship_leader`, `event_organizer`.

Every sensitive mutation performs an explicit check:
```typescript
const auth = await requireAuth(context);
await requireOrgPermission(auth, orgId, 'events:create');
```

---

## 5. Cloudflare R2 Storage Abstraction

The storage adapter (`@gamo/integrations/storage`) manages file lifecycles with strict privacy controls.

### 5.1 Storage Categories & Access Policies
1. **Public Assets (`public-read`)**: Approved event posters, organization logos, public instructor photos. Served via public CDN or Cloudflare Worker image optimizer.
2. **Private Program Documents (`private`)**: Church charts, technical specs, production equipment riders. Signed, short-lived download URLs only.
3. **Audition Media (`audition`)**: Unlisted audition recordings submitted by musicians. Restricted to staff reviewers and worship leaders.
4. **Restricted Verification Material (`restricted`)**: Ministry verification documents, 501(c)(3) determination letters. Explicit audit logged staff access only.

### 5.2 Direct Upload Flow
To keep Workers lightweight and avoid memory bottlenecks:
1. Client calls `POST /api/media/upload-ticket` with requested filename, content type, and byte size.
2. Server validates user permissions, size limits (max 25MB for docs/images, 200MB for media), and acceptable MIME types.
3. Server generates an unpredictable object key: `uploads/{scope}/{uuid}/{sanitizedFilename}` and records a pending `media_files` entry.
4. Server issues a presigned `PUT` URL (or signed upload token) valid for 15 minutes.
5. Client uploads directly to R2.
6. Client invokes `POST /api/media/confirm` to verify upload completion.

---

## 6. API Conventions & Standards

All endpoints across Gamo Studios adhere to unified specifications:

1. **URL Patterns**:
   - RESTful entity endpoints: `/api/<resource>` (GET list, POST create).
   - Member endpoints: `/api/<resource>/<id>` (GET detail, PUT update, DELETE remove).
   - Action endpoints: `/api/<resource>/<id>/<action>` (e.g. `/api/events/123/approve`).
2. **Request Validation**:
   - All input bodies, query parameters, and route parameters are validated using **Zod** schemas.
   - Validation errors return `400 Bad Request` with structured field-level error messages.
3. **Response Envelope**:
   ```json
   {
     "success": true,
     "data": { ... },
     "meta": { "total": 42, "page": 1, "pageSize": 20 }
   }
   ```
   Errors:
   ```json
   {
     "success": false,
     "error": {
       "code": "PERMISSION_DENIED",
       "message": "User is not authorized to publish events for this organization."
     }
   }
   ```
4. **Idempotency**:
   - Financial and state-changing mutations accept an `Idempotency-Key` header.
   - Webhooks persist incoming event IDs to D1 before executing handlers.

---

## 7. Stripe Integration & Webhook Durability

Stripe integration strictly adheres to nonprofit policies:
1. **Test Mode Enforcement**: Only `sk_test_` and `pk_test_` keys are accepted.
2. **Authoritative Pricing**: Ticket and lesson prices are resolved from the authoritative D1 database, never from client-provided POST payloads.
3. **Durable Webhook Processing**:
   - Signature verified via HMAC-SHA256.
   - Event stored in `stripe_webhook_events` with status `pending`.
   - Handled events:
     - `checkout.session.completed`: Record payment, issue tickets, allocate ledger entries.
     - `checkout.session.async_payment_succeeded`: Fulfill delayed payment method orders.
     - `checkout.session.async_payment_failed`: Release reserved ticket holds.
     - `charge.refunded`: Invalidate tickets and create reversing ledger entries.
   - Marked `processed` upon successful database transaction.

---

## 8. First End-to-End Functional Slice: Gamo Live

The first vertical slice connects real D1 persistence across the Gamo Live lifecycle:
1. **Organizer Event Creation**: Organizer submits an event via `POST /api/live/events`. Persisted to D1 with status `pending_review`.
2. **Staff Moderation**: Authorized staff reviews via `POST /api/admin/events/[id]/review` (`approved` or `rejected`).
3. **Event Discovery**: Approved events appear in `GET /api/live/events` and on the Explore page.
4. **Free Attendee Registration**: Attendee registers via `POST /api/live/events/[id]/register`.
   - Validates event state is `approved` and capacity is available.
   - Prevents duplicate registration for the same email/event.
   - Generates cryptographically secure `qr_token`.
   - Records attendee registration in D1.
   - Sends transactional confirmation email via Resend client (with safe mock fallback).
5. **Dashboard Analytics**: Organizer dashboard queries live D1 counts for registration totals and capacity.

## Contract reconciliation, independent audit & backend stabilization update — 2026-10-13

[OPENAPI_ARCHITECTURE.md](OPENAPI_ARCHITECTURE.md), [API_INVENTORY.md](API_INVENTORY.md), [BACKEND_INDEPENDENT_AUDIT.md](BACKEND_INDEPENDENT_AUDIT.md), [BACKEND_TEST_MATRIX.md](BACKEND_TEST_MATRIX.md), and [BACKEND_RELEASE_READINESS.md](BACKEND_RELEASE_READINESS.md) supersede older completion claims in §§2–8 above. `openapi/root.yaml` (`v1.2.0`) is authoritative for all 17 HTTP operations, authentication, payloads, and responses. Actual Live routes use `/api/events`; actual Admin routes use `/api/events/...` and `/api/staff/provision` on the admin origin, not `/api/live` or `/api/admin` prefixes. Gamo Studios' organizational architecture is **legal-structure-neutral** (Christian and mission-driven while final incorporation and tax status remain undecided).

### Authoritative Implementation State vs. Target Architecture

1. **Database & Migrations (`@gamo/db`, `0000`–`0004`)**:
   - Tracked migrations `0000`–`0004` apply cleanly on empty and populated databases in Node SQLite, `workerd`/Miniflare D1, and remote Cloudflare D1 (`gamo-db-preview`, `d7e12797-cc6c-4fa3-91c7-c192863e4812`).
   - Migration `0003_registration_integrity.sql` creates `notification_jobs` and installs SQLite triggers enforcing atomic registration validation (`registration_validate`), capacity reservation (`registration_reserve`), cancellation capacity release (`registration_cancel`), immutable registration fields (`registration_immutable`), tier capacity bounds (`tier_validate_*`), and one-time pending moderation transitions (`moderation_pending`).
   - Migration `0004_verified_auth_and_outbox.sql` creates `auth_challenges` (SHA-256 hashed 6-digit OTP challenges with 10-minute expiry and 5-attempt lockout) and `external_identities` (binding immutable Cloudflare Access `sub` values to D1 `users.id`), adds retry/delivery tracking columns (`next_attempt_at`, `sent_at`, `last_error`, `provider_message_id`) to `notification_jobs`, and installs trigger `media_prohibit_sensitive_docs`.
2. **Verified Authentication, Organization Onboarding & Staff Identity Provisioning (`@gamo/auth`, `apps/web`, `apps/admin`)**:
   - `POST /api/auth/challenge` and `POST /api/auth/verify` implement verified email OTP authentication, setting `users.verified_email_at`, rotating any existing session cookie, and issuing a signed host-only `HttpOnly` `__session` cookie.
   - `GET /api/auth/me` returns the authenticated user profile, `verifiedEmailAt`, global `roles`, and active organization `memberships`.
   - `POST /api/organizations` requires a verified email session (`requireVerifiedAuth`) and atomically creates an organization, `owner` membership, `organizer_profiles` entry, and `audit_logs` record.
   - `POST /api/staff/provision` allows an active `superadmin` to provision `staff_reviewer`, `finance_manager`, or `superadmin` roles and bind the staff member's immutable Cloudflare Access `sub` in `external_identities`.
   - `apps/admin/src/middleware.ts` and `verifyStaffBoundaryIdentity` enforce RS256 Access JWT verification, active D1 staff session, email match, and immutable Access `sub` binding in `external_identities`.
   - `POST /api/auth/session` remains strictly gated to local loopback demo mode (`ENVIRONMENT=local`, `ALLOW_DEMO_SESSION=true`, loopback hostname).
3. **Gamo Live Free Registration & Durable Outbox Consumer (`apps/live`, `@gamo/domain`)**:
   - `POST /api/events/{id}/register` rejects client-supplied `userId`, enforces atomic capacity via D1 triggers, inserts a `notification_jobs` row in the same SQLite transaction, and invokes `NotificationService.processRegistrationJob()` (which escapes all HTML fields via `escapeHtml`, dispatches via Resend or safe local/preview mock, and records `sent` or exponential retry backoff up to 5 attempts).
4. **Protective Payment Gates (`apps/live`, `@gamo/domain`)**:
   - `POST /api/checkout/session` validates `CheckoutInput` (`400`) and returns `503 Service Unavailable`.
   - `POST /api/webhook/stripe` verifies raw-body HMAC signatures and a 300-second timestamp window, rejects `livemode: true`, and returns `503 Service Unavailable` for all financial event types (`checkout.*`, `charge.*`, `payment_intent.*`, `refund.*`) without marking them processed.
5. **R2 Storage Quarantine & Sensitive Document Prohibition (`@studio-gamo/integrations`, `@gamo/domain`)**:
   - Sensitive student and identity document scopes (`restricted_verification`, `student_record`, `identity_document`) are hard-blocked across `authorizeUpload`, `putObject`, `MediaService.recordMediaUpload`, and D1 trigger `media_prohibit_sensitive_docs` (`SENSITIVE_DOCUMENT_PROHIBITED`).
6. **Isolated Cloudflare Environments & Release Gate**:
   - All 6 `wrangler.toml` files define isolated default (`local`), `[env.preview]` (bound to verified remote `gamo-db-preview` and `gamo-media-preview` in account `gamostudios`), and `[env.production]` (non-deployable placeholder IDs) configurations. Public production deployment remains **NO-GO** until all 5 gates in [BACKEND_RELEASE_READINESS.md](BACKEND_RELEASE_READINESS.md) pass.

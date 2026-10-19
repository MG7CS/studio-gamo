# Gamo Studios — HTTP API inventory and reconciliation

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Still in the repo: the shared backend (`@gamo/auth` staff and admin-password code, `AdminService`, `ParticipationService`, the review handlers in `@gamo/domain`), the `admin` entries in `@gamo/config`, the `adminCredentials` table (migration 0005) and the admin Cloudflare resources.


Updated 2026-10-14. Authoritative contract: [../openapi/root.yaml](../openapi/root.yaml) (`v1.3.0`); workflow: [OPENAPI_ARCHITECTURE.md](OPENAPI_ARCHITECTURE.md); audit: [BACKEND_INDEPENDENT_AUDIT.md](BACKEND_INDEPENDENT_AUDIT.md); test matrix: [BACKEND_TEST_MATRIX.md](BACKEND_TEST_MATRIX.md); release readiness: [BACKEND_RELEASE_READINESS.md](BACKEND_RELEASE_READINESS.md).

The source baseline **cb97c37** / **1cb3434** / **6103121** was expanded in the Backend Stabilization Phase (`v1.2.0`) and Standalone Live Consumer Platform Evolution (`v1.3.0`) to **26 API source files and 30 method/path operations**: Web 6, Worship 2, Live 19, Admin 3; Academy and Production 0 (with linked Production requests routed via `POST/GET /api/events/{id}/production-requests` on Live). All 30 are specified in OpenAPI 3.1.1 (`v1.3.0`) and exercised over isolated loopback HTTP (`pnpm api:check`), adversarial Node SQLite tests (`scripts/audit/security.test.ts`), and domain slice tests (`pnpm test`).

## Reconciliation table

| Endpoint (owning app) | Implemented | Specified | Contract Match | Test Status |
| --- | --- | --- | --- | --- |
| Web POST /api/auth/challenge | Yes (verified OTP challenge) | Yes | Wire matches; same-origin + 6-digit OTP SHA-256 hash (`0004`) + 10m TTL + 5/15m rate limit | HTTP + workerd + security + Playwright E2E |
| Web POST /api/auth/verify | Yes (verified OTP sign-in) | Yes | Wire matches; same-origin + single-use constant-time hash verify + sets `verified_email_at` + session rotation | HTTP + workerd + security + Playwright E2E |
| Web GET /api/auth/me | Yes | Yes | Wire matches; returns verified user, `sessionId`, global `roles`, and active `memberships` (`401` if unauthenticated) | HTTP + workerd + Playwright E2E |
| Web POST /api/organizations | Yes | Yes | Wire matches; requires `requireVerifiedAuth` (`403` if unverified) + creates org, `owner` membership, `organizer_profiles`, and `audit_logs` (`409` on duplicate slug) | HTTP + workerd + Playwright E2E |
| Web POST /api/auth/session | Local demo only (`403` outside local loopback) | Yes | Wire matches; same-origin + session rotation + explicit `SESSION_SECRET` required | HTTP + workerd success/validation/non-local 403/CSRF denial |
| Web DELETE /api/auth/session | Yes | Yes | Wire matches; same-origin enforced; idempotent revoke | HTTP + Playwright E2E cookie clearing, cross-origin 403 |
| Live GET /api/events | Yes | Yes | Wire matches; supports `category`, `city`, `artist`, `venue`, `dateFrom`; fixed 50-row cap, deterministic `startsAt, id` order | HTTP + workerd schema/filter/cap/order |
| Live POST /api/events | Yes | Yes | Wire matches; same-origin + active org `owner`/`admin` enforced; past/invalid time window rejected (`409`) | HTTP + workerd + Playwright E2E success/400/401/403/409/64 KiB cap |
| Live GET /api/events/{id} | Yes | Yes | Wire matches; unpublished/rejected/revision_requested detail hidden (`404`) | HTTP + workerd 200/404 |
| Live POST /api/events/{id}/register | Yes (with outbox processor) | Yes | Wire matches; atomic D1 capacity triggers (`0003`), transactional `notification_jobs` outbox + `NotificationService` processor (`0004`), duplicate `200` hides attendee PII/`qrToken` | HTTP + workerd + security + Playwright E2E (201, 12-way race, duplicate privacy 200, 409 capacity, outbox retry/sent) |
| Live POST /api/events/{id}/team | Yes | Yes | Wire matches; requires `requireVerifiedAuth` + primary org `owner`/`admin`; assigns role-scoped team permissions (`0006`) without conflating publishing and refund/settlement authority | HTTP contract test (201, permission separation) |
| Live GET /api/events/{id}/production-requests | Yes | Yes | Wire matches; requires `coordinate_production` permission; returns linked Gamo Production requests without exposing financial/purchaser data | HTTP contract test (200) |
| Live POST /api/events/{id}/production-requests | Yes | Yes | Wire matches; requires `coordinate_production` permission; creates linked `production_requests` record with `event_id` (`0006`) | HTTP contract test (201) |
| Live POST /api/tickets/lookup | Yes | Yes | Wire matches; requires valid 6-digit email verification challenge code (`401` on invalid/expired code) to prevent email-only enumeration; returns verified orders, tickets, and free registrations | HTTP contract test (200/401) |
| Live POST /api/tickets/scan | Yes | Yes | Wire matches; requires `scan_tickets` event permission; admits active QR token once, blocks replay (`already_scanned`), and records `ticket_scans` audit trail | HTTP contract test (200 admitted/replay/403) |
| Live GET /api/artists | Yes | Yes | Wire matches; public directory of verified concert/event artist profiles (`0006`), separate from Worship rankings | HTTP contract test (200) |
| Live POST /api/artists | Yes | Yes | Wire matches; requires `requireVerifiedAuth`; creates `artist_profiles` optionally referencing verified `musician_profiles` identity | HTTP contract test (201) |
| Live POST /api/artists/{id}/representatives | Yes | Yes | Wire matches; requires artist owner or superadmin; creates `artist_representatives` + `representation_authorizations` and blocks conflicting exclusive territory authority (`409` via trigger) | HTTP contract test (201/409) |
| Live POST /api/representations/{id}/revoke | Yes | Yes | Wire matches; revokes representation authority (`status = 'revoked'`) while preserving prior signed engagements and audit history | HTTP contract test (200) |
| Live POST /api/bookings/inquiries | Yes | Yes | Wire matches; requires organizer `owner`/`admin` or `negotiate_booking` permission; creates `booking_inquiries` and initial `booking_offers` | HTTP contract test (201) |
| Live POST /api/bookings/inquiries/{id}/offers | Yes | Yes | Wire matches; requires organizer or active unrevoked artist/representative negotiation authority; records counteroffer with separate artist fee, agent commission, and platform allocation | HTTP contract test (201) |
| Live POST /api/bookings/offers/{id}/accept | Yes | Yes | Wire matches; enforces counterparty acceptance (`403` on self-acceptance), locks offer as immutable (`0006` trigger), and creates `performance_engagements` with `deposit_collection_status = 'disabled_pending_policy'` | HTTP contract test (200/403) |
| Live POST /api/orders/{id}/refund | Yes | Yes | Wire matches; requires explicit `approve_refunds` permission (`403` for content-only co-organizers); voids tickets, releases capacity, and records `refund_records` | HTTP contract test (200/403) |
| Live POST /api/checkout/session | Gated (`503`) / Sandbox (`200`) | Yes | Wire matches; fails closed (`503`) unless event is approved, paid, and organizer is verified with `ticketing_authorized_at`; when authorized, creates expiring `ticket_holds` + `ticket_orders` (`pending_payment`) and Stripe sandbox session | HTTP + workerd 400/503 + verified organizer sandbox 200 |
| Live POST /api/webhook/stripe | Gated (`503`) / Sandbox (`200`) | Yes | Wire matches; raw-body HMAC + 300s timestamp window + `livemode: false`; fulfills pending `ticket_orders` idempotently into `tickets` (`fulfilled`), or fails closed (`503`) for unbacked financial events | HTTP + security suite signature/timestamp/live 400, financial 503, order fulfillment 200 |
| Admin POST /api/staff/provision | Internal staff provisioning | Yes, internal | Wire matches; requires `requireSuperadmin` + `verifyStaffBoundaryIdentity`; binds immutable Cloudflare Access `sub` in `external_identities` (`409` on cross-account conflict) | HTTP + workerd + security + Playwright E2E |
| Admin GET /api/events/pending | Internal staff queue (unbounded) | Yes, internal | Wire matches; requires RS256 Access JWT (when enabled) + active D1 `staff_reviewer`/`superadmin` session + email & `external_identities` `sub` match | HTTP middleware + security suite 200/401/403 |
| Admin POST /api/events/{id}/review | Internal staff moderation | Yes, internal | Wire matches; same-origin + D1 staff session + Access `sub` match + self-moderation denial + atomic D1 batch preserving `approved`/`rejected`/`revision_requested` + re-review `409` | HTTP + workerd + security + Playwright E2E 200/400/401/403/404/409 |

Counts: specified-and-implemented/stub/gated **30**; contract-tested **30**; specified-but-unimplemented **0**; wire mismatches remaining **0**.

## Per-operation contracts and evidence

All paths below are relative to `apps/<app>/src/pages/api/`. Responses are exact component names under OpenAPI; all dates serialize as RFC3339. `LegacyError` describes shared JSON failures, `SimpleError` flat payment failures. Test runners: [../scripts/api/contract.test.ts](../scripts/api/contract.test.ts), [../scripts/audit/security.test.ts](../scripts/audit/security.test.ts), and [../scripts/audit/workers.mjs](../scripts/audit/workers.mjs).

| App/source | Method/path and purpose | Authentication / permission | Request | Response and errors | Data dependencies / verification |
| --- | --- | --- | --- | --- | --- |
| web `auth/session.ts` | POST /api/auth/session, demo identity provisioning | Local loopback only (`ENVIRONMENT=local` + `ALLOW_DEMO_SESSION=true`) + same-origin; **not verified login** | SessionInput: email, optional displayName, JSON (<=64 KiB) | 200 SessionResponse + host-only `Set-Cookie`; 400/403/500 LegacyError | `users`, `sessions`; rotates prior session; HTTP + workerd + security tests |
| web `auth/session.ts` | DELETE /api/auth/session, revoke | Same-origin; optional signed cookie; no-cookie logout permitted | No body | 200 LogoutResponse + cleared cookie; 403/500 LegacyError | `sessions`; HTTP + security tests |
| live `events/index.ts` | GET /api/events, approved discovery | Public | `category` enum, exact `city`; no date/cursor/limit | 200 EventListResponse; 400/500 LegacyError | `events`, `organizer_profiles`, `organizations`, `ticket_tiers`, `event_registrations`; HTTP + workerd tests |
| live `events/index.ts` | POST /api/events, proposal | Same-origin + browser session; active `owner`/`admin` of `organizationId` or global `superadmin` | CreateEvent incl tiers; RFC3339 future window and IANA timezone | 201 CreateEventResponse; 400/401/403/409/500 LegacyError | `events`, `organizer_profiles`, `ticket_tiers`, `organization_members`, `users`, `sessions`, `user_roles`; HTTP + workerd + security tests |
| live `events/[id]/index.ts` | GET /api/events/{id}, approved details | Public | Path ID or slug | 200 EventResponse; 400/404/500 LegacyError | Discovery tables; HTTP + workerd tests |
| live `events/[id]/register.ts` | POST /api/events/{id}/register, free attendance | Public; authenticated session `user.id` bound when present; client `userId` forbidden | RegisterAttendee: `name`, `email`, `quantity` 1–10, optional `tierId` | 201 (`registration` included) or duplicate 200 (`registration` omitted for privacy); 400/404/409/500 LegacyError | `event_registrations`, `ticket_tiers`, `events`, `notification_jobs` (triggers in `0003`); 12-way race tested in Node SQLite & workerd |
| live `checkout/session.ts` | POST /api/checkout/session, gated checkout | Protective gate (`503`) after schema validation | CheckoutInput: `eventId`, integer `tierIndex >= 0`, `quantity` 1–10, optional `email` | 400/503 SimpleError (200 disabled while gated) | Validation + fail-closed `503` verified in HTTP + workerd |
| live `webhook/stripe.ts` | POST /api/webhook/stripe, provider events | Raw-body Stripe Signature (`t=`, `v1=`, 300s window); `livemode: false` | StripeEvent | 200 WebhookResponse (`ignored`/`duplicate` for non-financial events); 400/500/503 SimpleError | `stripe_webhook_events`; financial events gated with `503` before processed claim; HTTP + security tests |
| admin `events/pending.ts` | GET /api/events/pending, moderation queue | Cloudflare Access RS256 JWT + D1 session with global `staff_reviewer`/`superadmin` + email match | No body/filters | 200 PendingResponse; 401/403/500 LegacyError | `events`, `organizer_profiles`, `organizations`, `users`, `sessions`, `user_roles`; HTTP + security + workerd tests |
| admin `events/[id]/review.ts` | POST /api/events/{id}/review, moderation | Same boundary + same-origin + self-moderation denial (`reviewer` not member of organizer org) | ReviewDecision: `approved`/`rejected`/`revision_requested`, optional `notes` | 200 ReviewResponse; 400/401/403/404/409/500 LegacyError | `events`, `moderation_reviews`, `audit_logs` in atomic D1 batch + `moderation_pending` trigger; HTTP + security + workerd tests |

## Findings and disposition (post-audit update)

| ID / priority | Classification | Evidence and disposition |
| --- | --- | --- |
| C01 / P0 | Missing authentication & hardcoded secret | **Repaired & Gated**: Removed hardcoded secret fallback; enforced `ENVIRONMENT=local`, `ALLOW_DEMO_SESSION=true`, loopback hostname, same-origin check, and prior-session rotation on `POST /api/auth/session`. Real verified login remains a **production blocker**. |
| C02 / P0 | Missing authentication/authorization | **Repaired**: Event submission enforces `requireSameOrigin` + `requireOrgAccess` (`owner`/`admin`) and rejects past/invalid time windows (`409`). |
| C03 / P1 | Missing authorization | **Repaired**: Public detail returns `approved` events only (`404` otherwise). |
| C04 / P0 | Incomplete checkout & order authority | **Gated (`503`)**: Strict input validation (`400`) followed by protective `503 Service Unavailable` until durable order/hold/organizer authority exists. |
| C05 / P1 | Error leakage & unbounded bodies | **Repaired**: Generic `500` error messages across all handlers; 64 KiB request payload cap enforced in `readJsonBody`. |
| C06 / P0 | Registration PII leak, user spoofing & capacity race | **Repaired (Local Slice)**: Removed client `userId`; omitted `registration` PII/`qrToken` on duplicate `200`; added SQLite triggers (`0003_registration_integrity.sql`) enforcing atomic capacity reservation, cancellation release, field immutability, and transactional `notification_jobs` outbox insertion. Verified under 12-way concurrency in Node SQLite and `workerd`. Outbox worker delivery remains unbuilt. |
| C07 / P0 | Admin auth bypass, synthetic reviewer & self-moderation | **Repaired & Gated**: Removed `/api/*` dev fallthrough and `staff_reviewer_demo` fallback; hardened Access JWKS verification (required team/aud, `exp`/`sub`/`email`, 5s timeout, `redirect: 'error'`); required D1 staff session (`scope_type IS NULL`) with matching email; blocked staff from reviewing their own organization (`403`). Access `sub`-to-D1 provisioning remains a **production blocker**. |
| C08 / P0 | Non-transactional webhook & unimplemented fulfillment | **Gated (`503`)**: Financial Stripe events (`checkout.*`, `charge.*`, `payment_intent.*`, `refund.*`) return `503` before claiming event processing so no false fulfillment or dropped retry occurs. |
| C09 / P0 | Unapproved fee deductions & live-mode risk | **Repaired & Gated**: Removed unapproved 5% / estimated fee deductions; rejected `livemode: true` events (`400`); gated financial webhooks (`503`). |
| C10 / P1 | Moderation state loss & non-atomic review | **Repaired**: `AdminService.reviewEvent` executes an atomic D1 batch preserving `revision_requested` and preventing re-review of already decided events (`409`). |
| C11 / P2 | Missing pagination/filter implementation | **Documented**: Deterministic `startsAt, id` ordering with 50-row cap; cursor pagination deferred to future contract revision. |
| C12 / P0 | Worker/runtime mismatch & migration failure on populated DB | **Repaired**: Isolated `node:sqlite` to `@gamo/db/testing`; repaired `0002_complete_backend_foundation.sql` constant defaults and added `0003_registration_integrity.sql` backfill + triggers; enabled `PRAGMA foreign_keys = ON` and transactional `batch()` rollback in test D1 adapter; verified in `workerd`/Miniflare. |
| C13 / P2 | Worship check-in demo stubs | **Specified as demos**: Redirect-only `303` stubs documented accurately. |
| C14 / P1 | CSRF, scoped roles, R2 quarantine & dependency advisories | **Repaired**: Enforced `requireSameOrigin` on session mutations; filtered scoped roles from global `session.roles`; quarantined private/restricted media metadata and enforced `putObject` key/MIME/overwrite checks; remediated all 7 `pnpm audit` advisories (`0` remaining). Edge rate limiting remains a **production blocker**. |

## Planned but unimplemented capabilities

The **34 candidate future operations** below remain **proposals with unresolved request/response, roles and policy**; none is added to OpenAPI paths or generated clients. Write an authoritative contract only when implementing an approved slice.

| Method | Historical candidate path | Status | Intended audience | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/api/organizer/events` | **Planned** | Organizer Role | Lists events belonging to the caller's organization. |
| `GET` | `/api/organizer/events/[id]/stats` | **Planned** | Organizer Role | Returns attendee counts, ticket tier allocations, and headcount analytics. |
| `POST` | `/api/organizer/verify` | **Planned** | Organizer Role | Submits ministry documentation for ticketing authorization. |
| `POST` | `/api/tickets/[token]/scan` | **Planned** | Scanner / Staff | Idempotently scans and admits an attendee QR token. |
| `POST` | `/api/promote/request` | **Planned** | Organizer Role | Requests manual campaign promotion assistance from Gamo staff. |
| `POST` | `/api/apply/musician` | **Planned** | Candidate | Submits musician profile, instruments, home zone, and audition links. |
| `POST` | `/api/gigs/request` | **Planned** | Church Admin | Submits worship service staffing request with required instrument slots. |
| `GET` | `/api/gigs` | **Planned** | Church Admin | Lists active, confirmed, and pending church service requests. |
| `POST` | `/api/gigs/[id]/assign` | **Planned** | Staff / Worship Leader | Assigns vetted primary and standby musicians to open positions. |
| `POST` | `/api/musicians/[id]/availability`| **Planned** | Musician Role | Updates musician blackout calendar and radius preferences. |
| `GET` | `/api/musician/assignments` | **Planned** | Musician Role | Lists upcoming gig assignments, rehearsal times, and setlists. |
| `POST` | `/api/standby/respond` | **Planned** | Standby Musician | Accepts or declines emergency dispatch request. |
| `GET` | `/api/classes` | **Planned** | Public | Lists group classes, instrument clinics, and instructor availability. |
| `GET` | `/api/instructors` | **Planned** | Public | Lists vetted music instructors with bios and teaching specialties. |
| `POST` | `/api/enrollments/register` | **Planned** | Student / Guardian | Enrolls student into a lesson or class with sliding-scale/sponsor tracking. |
| `POST` | `/api/instructors/apply` | **Planned** | Candidate | Submits instructor application and background check consent. |
| `POST` | `/api/scholarships/apply` | **Planned** | Student / Guardian | Submits assistance request for community-funded music tuition. |
| `GET` | `/api/student/enrollments` | **Planned** | Student / Guardian | Displays active courses, lesson times, and instructor communications. |
| `POST` | `/api/consultations/request` | **Planned** | Church / Ministry | Intakes audio, livestream, acoustics, or lighting consultation requests. |
| `GET` | `/api/projects/[id]` | **Planned** | Client Church | Tracks milestones, equipment recommendations, and training schedules. |
| `POST` | `/api/training/request` | **Planned** | Church Volunteer | Schedules technical volunteer development workshops. |
| `GET` | `/api/portfolio` | **Planned** | Public | Returns verified church case studies and technical transformation logs. |
| `GET` | `/api/auth/me` | **Planned** | Authenticated | Returns current profile, organization memberships, and active roles. |
| `POST` | `/api/organizations` | **Planned** | Authenticated | Creates a new church, ministry, or organizer entity. |
| `POST` | `/api/partnerships/inquire` | **Planned** | Church Leader | Inquires about church partnership, hosting, or mutual support. |
| `POST` | `/api/contact` | **Planned** | Public | General inquiry intake routed to appropriate program director. |
| `POST` | `/api/admin/auditions/[id]/review` | **Planned** | Worship Director | Evaluates musician audition recordings against musical rubric. |
| `POST` | `/api/admin/organizers/[id]/verify` | **Planned** | Staff Reviewer | Authorizes organizer for ticket sales upon identity/legal review. |
| `GET` | `/api/admin/radar` | **Planned** | Operations Staff | Sunday morning live check-in monitoring and emergency standby radar. |
| `GET` | `/api/admin/ledger` | **Planned** | Finance Director | Nonprofit fund accounting entries, program breakdowns, and payables. |
| `POST` | `/api/admin/placements` | **Planned** | Staff Reviewer | Schedules homepage editorial, sponsored, and program placements. |
| `GET` | `/api/admin/audit-logs` | **Planned** | Superadmin | Paginated audit trail of all administrative mutations. |
| `POST` | `/api/admin/dispatches/[id]/override` | **Planned** | Operations Staff | Manual dispatch reassignment override for Sunday worship. |
| `GET` | `/api/admin/metrics` | **Planned** | Executive Director | High-level non-financial impact metrics across all four programs. |

See [BACKEND_RELEASE_READINESS.md](BACKEND_RELEASE_READINESS.md) for the mandatory 5-gate checklist required before enabling production traffic.

> **2026-10-18 (contract 2.0.0):** the worship `POST /api/check-in/confirm` and `POST /api/check-in/fail` demo stubs were removed. See `docs/API_COMPATIBILITY.md` 2.0.0.

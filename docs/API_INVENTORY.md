# Gamo Studios — HTTP API inventory and reconciliation

Updated 2026-11-16. Authoritative contract: [../openapi/root.yaml](../openapi/root.yaml) (`v3.0.0`); workflow: [OPENAPI_ARCHITECTURE.md](OPENAPI_ARCHITECTURE.md); compatibility: [API_COMPATIBILITY.md](API_COMPATIBILITY.md); audit: [BACKEND_INDEPENDENT_AUDIT.md](BACKEND_INDEPENDENT_AUDIT.md); test matrix: [BACKEND_TEST_MATRIX.md](BACKEND_TEST_MATRIX.md); release readiness: [BACKEND_RELEASE_READINESS.md](BACKEND_RELEASE_READINESS.md).

**2026-11-16 (contract 3.0.0): Gamo Live was removed** (owner decision; design: [superpowers/specs/2026-11-16-remove-gamo-live-design.md](superpowers/specs/2026-11-16-remove-gamo-live-design.md)). Every `apps/live` operation (events, registration, orders, checkout, tickets, scanner, venue maps, artists, representations, bookings, Stripe webhook) and the four admin event/organizer review operations are gone from the contract and the code; the Resend webhook moved to the global site (`apps/web`). The contract now has **17 method/path operations**: Web 11, Worship 1, Admin 4, plus 29 replicated copies of the shared auth/account operations in Worship, Academy and Production (46 implemented handlers, matched one-to-one by `scripts/api/check.mjs`). Contract tests cover 30 application operations over isolated loopback HTTP (`pnpm api:check`).

## Reconciliation table

| Endpoint (owning app) | Implemented | Specified | Contract Match | Test Status |
| --- | --- | --- | --- | --- |
| Web POST /api/auth/challenge | Yes (verified OTP challenge) | Yes | Wire matches; same-origin + 6-digit OTP SHA-256 hash (`0004`) + 10m TTL + 5/15m rate limit | HTTP + workerd + security + Playwright E2E |
| Web POST /api/auth/verify | Yes (verified OTP sign-in) | Yes | Wire matches; same-origin + single-use constant-time hash verify + sets `verified_email_at` + session rotation | HTTP + workerd + security + Playwright E2E |
| Web GET /api/auth/me | Yes | Yes | Wire matches; returns verified user, `sessionId`, global `roles`, and active `memberships` (`401` if unauthenticated) | HTTP + workerd + Playwright E2E |
| Web POST /api/organizations | Yes | Yes | Wire matches; requires `requireVerifiedAuth` (`403` if unverified) + creates org, `owner` membership, `organizer_profiles`, and `audit_logs` (`409` on duplicate slug) | HTTP + workerd + Playwright E2E |
| Web POST /api/auth/session | Local demo only (`403` outside local loopback) | Yes | Wire matches; same-origin + session rotation + explicit `SESSION_SECRET` required | HTTP + workerd success/validation/non-local 403/CSRF denial |
| Web DELETE /api/auth/session | Yes | Yes | Wire matches; same-origin enforced; idempotent revoke | HTTP + Playwright E2E cookie clearing, cross-origin 403 |
| Web POST /api/auth/clerk-session | Yes (optional Clerk; replicated in Worship, Academy, Production) | Yes | Exchanges this product's own Clerk session for a Gamo session; `503` when Clerk is not configured | HTTP + auth suites |
| Web POST /api/auth/clerk-webhook | Yes (replicated) | Yes | Svix-signed events from this product's own Clerk application | Auth suites |
| Web POST /api/account/person-link | Yes (replicated) | Yes | Links/unlinks this product's user to the shared person record (verified email only) | Identity suites |
| Worship POST /api/account/providers | Yes (replicated in Academy, Production) | Yes | Provider profile form (303 redirect) | Identity suites |
| Web GET/POST /api/participation | Yes | Yes | Own participation inquiries; verified account | HTTP contract test |
| Web POST /api/webhook/resend | Yes (moved from Live, 3.0.0) | Yes | Svix-signed Resend events update `email_log` and `email_suppressions` for every program's mail; `200 {received, applied}`, `400`/`503` `LegacyError` | HTTP contract test (200/400/503) |
| Admin POST /api/staff/provision | Internal staff provisioning | Yes, internal | Wire matches; requires `requireSuperadmin` + `verifyStaffBoundaryIdentity`; binds immutable Cloudflare Access `sub` in `external_identities` (`409` on cross-account conflict) | HTTP + workerd + security + Playwright E2E |
| Admin GET /api/participation/review-queue, POST /api/participation/{id}/review | Internal staff review | Yes, internal | Staff boundary + staff session | HTTP contract test |
| Admin POST /api/review/providers/{id} | Internal provider review (303 form) | Yes, internal | Staff boundary + `staff_reviewer`/`superadmin` session; conditional on `expected_status` | Provider review suites |

Counts: specified-and-implemented **17** operations (46 handlers with replicas); contract-tested over HTTP **30** application operations; specified-but-unimplemented **0**; wire mismatches remaining **0**.

## Per-operation contracts and evidence

All paths below are relative to `apps/<app>/src/pages/api/`. Responses are exact component names under OpenAPI; all dates serialize as RFC3339. `LegacyError` describes shared JSON failures, `SimpleError` flat payment failures. Test runners: [../scripts/api/contract.test.ts](../scripts/api/contract.test.ts), [../scripts/audit/security.test.ts](../scripts/audit/security.test.ts), and [../scripts/audit/workers.mjs](../scripts/audit/workers.mjs).

| App/source | Method/path and purpose | Authentication / permission | Request | Response and errors | Data dependencies / verification |
| --- | --- | --- | --- | --- | --- |
| web `auth/session.ts` | POST /api/auth/session, demo identity provisioning | Local loopback only (`ENVIRONMENT=local` + `ALLOW_DEMO_SESSION=true`) + same-origin; **not verified login** | SessionInput: email, optional displayName, JSON (<=64 KiB) | 200 SessionResponse + host-only `Set-Cookie`; 400/403/500 LegacyError | `users`, `sessions`; rotates prior session; HTTP + workerd + security tests |
| web `auth/session.ts` | DELETE /api/auth/session, revoke | Same-origin; optional signed cookie; no-cookie logout permitted | No body | 200 LogoutResponse + cleared cookie; 403/500 LegacyError | `sessions`; HTTP + security tests |

## Findings and disposition (post-audit update)

> Findings C02–C04, C06, C08, C10 and C11 concerned Gamo Live event, registration, checkout and moderation endpoints that were removed in contract 3.0.0 (2026-11-16); they are kept below as history.

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

The **28 candidate future operations** below remain **proposals with unresolved request/response, roles and policy**; none is added to OpenAPI paths or generated clients. Write an authoritative contract only when implementing an approved slice.

| Method | Historical candidate path | Status | Intended audience | Purpose |
| --- | --- | --- | --- | --- |
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
| `GET` | `/api/admin/radar` | **Planned** | Operations Staff | Sunday morning live check-in monitoring and emergency standby radar. |
| `GET` | `/api/admin/ledger` | **Planned** | Finance Director | Nonprofit fund accounting entries, program breakdowns, and payables. |
| `POST` | `/api/admin/placements` | **Planned** | Staff Reviewer | Schedules homepage editorial, sponsored, and program placements. |
| `GET` | `/api/admin/audit-logs` | **Planned** | Superadmin | Paginated audit trail of all administrative mutations. |
| `POST` | `/api/admin/dispatches/[id]/override` | **Planned** | Operations Staff | Manual dispatch reassignment override for Sunday worship. |
| `GET` | `/api/admin/metrics` | **Planned** | Executive Director | High-level non-financial impact metrics across all three programs. |

See [BACKEND_RELEASE_READINESS.md](BACKEND_RELEASE_READINESS.md) for the mandatory 5-gate checklist required before enabling production traffic.

> **2026-10-18 (contract 2.0.0):** the worship `POST /api/check-in/confirm` and `POST /api/check-in/fail` demo stubs were removed. See `docs/API_COMPATIBILITY.md` 2.0.0.

> **2026-11-16 (contract 3.0.0):** all Gamo Live operations and the admin event/organizer review operations were removed; `POST /api/webhook/resend` moved to `apps/web`. See `docs/API_COMPATIBILITY.md` 3.0.0.

# Gamo Studios — HTTP API inventory and reconciliation

Updated 2026-11-16. Authoritative contract: [../openapi/root.yaml](../openapi/root.yaml) (`v4.1.0`); workflow: [OPENAPI_ARCHITECTURE.md](OPENAPI_ARCHITECTURE.md); compatibility: [API_COMPATIBILITY.md](API_COMPATIBILITY.md); audit: [BACKEND_INDEPENDENT_AUDIT.md](BACKEND_INDEPENDENT_AUDIT.md); test matrix: [BACKEND_TEST_MATRIX.md](BACKEND_TEST_MATRIX.md); release readiness: [BACKEND_RELEASE_READINESS.md](BACKEND_RELEASE_READINESS.md).

**2026-11-16 (contract 4.1.0): forms, uploads, offers and invoicing are specified as planned.** The contract now holds **30 method/path operations**: 2 implemented (Web `POST /api/webhook/resend`, Admin `POST /api/staff/provision`) and **28 planned** (`x-status: planned`; no route exists yet): Web 8 (`POST /api/forms/{slug}/upload-session`, `POST /api/forms/uploads`, `PUT /api/forms/uploads/{id}/parts/{n}`, `POST /api/forms/uploads/{id}/complete`, `DELETE /api/forms/uploads/{id}`, `POST /api/webhook/stripe`, `GET|POST /worship/offers/{token}`) and Admin 20 (forms builder, submissions, application decisions, roster, offers, invoices, payouts, `GET /files/{id}`). Planned operations are not counted as specified-but-unimplemented defects: `scripts/api/check.mjs` skips them until the route file exists. Details and evidence in [API_COMPATIBILITY.md](API_COMPATIBILITY.md) 4.1.0. The tables below describe the implemented operations only until each planned route ships.

**2026-11-16 (contract 4.0.0): public accounts were removed** (owner decision; plan: [superpowers/plans/2026-11-16-forms-emails-invoices.md](superpowers/plans/2026-11-16-forms-emails-invoices.md), "Account removal (Phase 1)"). People reach Gamo through forms and emailed links; only staff sign in, to the admin app. Every public sign-in and account operation (`/api/auth/*`, `/api/account/*`, `/api/organizations`, `/api/participation`) and the admin participation and provider review operations are gone from the contract and the code. The contract now has **2 method/path operations**: Web 1 (`POST /api/webhook/resend`) and Admin 1 (`POST /api/staff/provision`), with no replicated copies (2 implemented handlers, matched one-to-one by `scripts/api/check.mjs`). Contract tests cover both over isolated loopback HTTP (`pnpm api:check`).

**2026-11-16 (contract 3.0.0, history): Gamo Live was removed** (owner decision; design: [superpowers/specs/2026-11-16-remove-gamo-live-design.md](superpowers/specs/2026-11-16-remove-gamo-live-design.md)). Every `apps/live` operation (events, registration, orders, checkout, tickets, scanner, venue maps, artists, representations, bookings, Stripe webhook) and the four admin event/organizer review operations are gone from the contract and the code; the Resend webhook moved to the global site (`apps/web`). The contract then had **17 method/path operations**: Web 11, Worship 1, Admin 4, plus 29 replicated copies of the shared auth/account operations in Worship, Academy and Production (46 implemented handlers, matched one-to-one by `scripts/api/check.mjs`). Contract tests covered 30 application operations.

## Reconciliation table

| Endpoint (owning app) | Implemented | Specified | Contract Match | Test Status |
| --- | --- | --- | --- | --- |
| Web POST /api/webhook/resend | Yes (moved from Live, 3.0.0) | Yes | Svix-signed Resend events update `email_log` and `email_suppressions` for every program's mail; `200 {received, applied}`, `400`/`503` `LegacyError` | HTTP contract test (200/400/503) |
| Admin POST /api/staff/provision | Internal staff provisioning | Yes, internal | Wire matches; requires `requireSuperadmin` + `verifyStaffBoundaryIdentity`; binds immutable Cloudflare Access `sub` in `external_identities` (`409` on cross-account conflict) | HTTP + workerd + security + Playwright E2E |

Counts: specified-and-implemented **2** operations (2 handlers, no replicas); contract-tested over HTTP **2** application operations; specified-but-unimplemented **0**; wire mismatches remaining **0**.

## Per-operation contracts and evidence

All paths below are relative to `apps/<app>/src/pages/api/`. Responses are exact component names under OpenAPI; all dates serialize as RFC3339. `LegacyError` describes shared JSON failures, `SimpleError` flat payment failures. Test runners: [../scripts/api/contract.test.ts](../scripts/api/contract.test.ts), [../scripts/audit/security.test.ts](../scripts/audit/security.test.ts), and [../scripts/audit/workers.mjs](../scripts/audit/workers.mjs).

| App/source | Method/path and purpose | Authentication / permission | Request | Response and errors | Data dependencies / verification |
| --- | --- | --- | --- | --- | --- |
| web `webhook/resend.ts` | POST /api/webhook/resend, provider delivery events | Public; Svix signature with `RESEND_WEBHOOK_SECRET` (`503` without it) | `ResendEvent`, raw JSON body | 200 `ResendWebhookResponse` `{received, applied}`; 400/503 LegacyError | `email_log`, `email_suppressions`; HTTP contract test (200/400/503) |
| admin `staff/provision.ts` | POST /api/staff/provision, staff role + Access subject binding | Admin Access boundary (or configured break-glass) AND D1 superadmin session | `ProvisionStaffInput`, JSON | 200 `ProvisionStaffResponse`; 400/403/409/500 LegacyError; 401 middleware | `users`, `roles`, `user_roles`, `external_identities`, `audit_logs`; HTTP contract test (401/403/200/409) |

## Planned in 4.1.0 (forms, offers, invoicing; contract first, not built)

Sources are relative to `apps/<app>/src/pages/`. All admin rows are internal (not in the public bundle), require a staff session (`BrowserSession`) and `requireSameOrigin` on mutations; role scoping beyond any staff role is not specified or enforced yet.

| App | Method and path | Purpose | Auth and guards | Idempotency / notes |
| --- | --- | --- | --- | --- |
| web | POST /api/forms/{slug}/upload-session | Turnstile-verified 2 h upload token | Public, same-origin, Turnstile, per-IP limit | Flat `{token, expiresAt}` |
| web | POST /api/forms/uploads | Start R2 multipart (`{uploadId, partSize, parts}`) | Upload token in body | Per-kind caps, 10 files/session |
| web | PUT /api/forms/uploads/{id}/parts/{n} | Upload one 8 MiB part | `X-Upload-Token` | Retrying a part number overwrites it |
| web | POST /api/forms/uploads/{id}/complete | Verify size and magic bytes (`verified`/`rejected`) | `X-Upload-Token` | Repeats return the stored result |
| web | DELETE /api/forms/uploads/{id} | Abandon a pending upload | `X-Upload-Token` | Naturally repeatable (204) |
| web | POST /api/webhook/stripe | `invoice.paid`, `invoice.payment_failed` | Stripe signature; 200/400/503; test mode only | Keyed on event id and invoice state |
| web | GET, POST /worship/offers/{token} | Offer page (GET shows, POST accept/decline) | Token credential; POST same-origin and rate limited | GET never mutates; POST is one conditional update |
| admin | GET, POST /api/forms; GET, PUT /api/forms/{id}; POST /api/forms/{id}/publish | Form builder and versions | Staff | Publish refused when required bind keys are missing |
| admin | GET /api/submissions, GET /api/submissions/{id}, POST .../status, .../approve, .../decline | Inbox and application decisions | Staff | Approve and decline repeat as no-ops |
| admin | GET /api/roster | Private roster search | Staff | Keyset paging |
| admin | POST /api/requests/{id}/offers, POST /api/offers/{id}/withdraw | Send and withdraw offers | Staff | Token hash stored only |
| admin | GET, POST /api/invoices; POST /api/invoices/{id}/{send,mark-paid,void}; POST /api/invoice-lines/{id}/payout | Invoices and musician payouts | Staff | `gamo_admin` lines refused unless `GAMO_ADMIN_FEE_APPROVED=true`; one payout per line |
| admin | GET /files/{id} | Staff-only file stream (Range, attachment, nosniff, CSP sandbox) | Staff | Rejected uploads answer 404 |

## Findings and disposition (post-audit update)

> Finding C01 concerned the local demo session route removed with public accounts in contract 4.0.0 (2026-11-16). Findings C02–C04, C06, C08, C10 and C11 concerned Gamo Live event, registration, checkout and moderation endpoints that were removed in contract 3.0.0 (2026-11-16); they are kept below as history.

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

The **26 candidate future operations** below remain **proposals with unresolved request/response, roles and policy**; none is added to OpenAPI paths or generated clients. Write an authoritative contract only when implementing an approved slice.

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

> **2026-11-16 (contract 4.0.0):** all public sign-in/account operations, organizations, participation and the admin participation/provider review operations were removed. See `docs/API_COMPATIBILITY.md` 4.0.0.

> **2026-11-16 (contract 4.1.0):** 28 operations for forms, uploads, offers and invoicing were added as `x-status: planned`. See `docs/API_COMPATIBILITY.md` 4.1.0.

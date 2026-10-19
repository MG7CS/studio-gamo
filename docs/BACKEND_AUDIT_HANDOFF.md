# Backend independent audit handoff

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Removed since: the admin-password and gate-cookie code, `requireStaff`/`requireSuperadmin`/`verifyStaffBoundaryIdentity`, `provisionStaffIdentity`, the review form handlers and the break-glass variables. Still in the repo until the rebuild: `isStaffOrAdmin`, the `superadmin`/`staff_reviewer` role checks, `AdminService`, `ParticipationService.review`, `provider-review.ts`, `audit_logs` writes, the `admin_credentials` table (migration 0005) and the admin Cloudflare resources.


**Prepared:** 2026-10-13  
**Branch:** `main`  
**Base commit:** `6103121` (`main` includes `1cb3434` and requested baseline `cb97c37`)  
**Worktree:** Audit fixes and documentation are uncommitted. No commit, push, deployment, production resource access, or real provider request was performed.

## What was accomplished

I independently confirmed the baseline in local history and inspected the authentication, authorization, Admin Access middleware, Live API routes and domain services, D1 schema/migrations, R2 abstraction, Stripe client and webhook, Resend client, OpenAPI operations, and the existing tests. The original suite passed 39/39 at the start. It contained persistence tests using Node SQLite, route contract tests over loopback HTTP, cryptographic unit tests, and adapter/provider mock tests. It did not exercise routes in workerd or prove real payment fulfillment, email delivery, uploads, or browser API flows.

I created [BACKEND_INDEPENDENT_AUDIT.md](BACKEND_INDEPENDENT_AUDIT.md) with confirmed findings and the initial repair map. Main fixes and protective changes in the current worktree:

- Removed the known hardcoded session signing secret fallback; malformed percent-encoded cookies now fail closed. Sessions still require verified identity login, which does not exist.
- Added same-origin checks to authenticated mutations and the demo session endpoint, required demo sessions to use an explicitly local runtime on loopback, and rotated an existing session when creating a new one.
- Hardened Cloudflare Access JWT checks: configuration must include trusted team and audience, token expiry and subject/email are required, and JWKS requests use the configured team host with a timeout and redirect rejection.
- Removed the Admin middleware’s development fallthrough for API requests. Admin operations now require a D1 staff session, an active global `staff_reviewer` or `superadmin` role, and (when Access supplied an identity) a matching email. Removed the synthetic reviewer fallback and prevent staff from moderating their own organization.
- Removed client-supplied `userId` from registration. Duplicate responses no longer return attendee records or QR tokens. Added D1 triggers for approved/free/future event state, bounded quantity, valid free tier, capacity, counter reservation, notification outbox insertion, cancellation release, immutable registration fields, and review-state checks.
- Added a durable notification job table and changed registration wording so it no longer claims an email was sent. The outbox has no worker or delivery retry loop yet.
- Made staff moderation a D1 batch operation and preserved `revision_requested` as its own state. Error responses now suppress raw database/provider details, request bodies are capped at 64 KiB, and the Node test D1 adapter now turns on foreign keys and rolls back failed batches.
- Reproduced and repaired the populated-database migration failure: SQLite rejects `ALTER TABLE ... ADD COLUMN ... DEFAULT (unixepoch())`. Migration 0002 now uses constant defaults; migration 0003 backfills timestamp columns and adds the registration/outbox integrity rules.
- Disabled checkout requests with a `503` while order, inventory, organizer authorization, and fulfillment authority are absent. Financial Stripe webhooks now return `503` without claiming them processed. Unsupported nonfinancial events can be recorded idempotently. This is a protective gate; ticket fulfillment/refunds have not been implemented.
- Moved private/restricted media metadata to `quarantined` and narrowed blanket staff access to private media. R2 upload validation, object lifecycle, and authorized download endpoints are still incomplete.
- Reconciled the OpenAPI contract for privacy-safe registration responses, staff authorization, review outcomes, and the payment gates; regenerated the tracked bundles, types, and validators.

The project’s nonprofit model remains authoritative. No fees, donations, deductions from musician pay, Connect payouts, escrow claims, legal status claims, or payment processing were added or authorized.

### Verification actually completed

| Verification | Result | What it proves and limits |
|---|---|---|
| Baseline `pnpm test` | **Pass (39/39, exit 0)** | Cryptographic session cookies, multi-tenant role helpers, Gamo Live 9-step service slice, D1 webhook idempotency (ignored events), R2 storage ticket/policy rules, Stripe test-mode gate & HMAC verification, image optimization policy. |
| `node --import tsx --test scripts/audit/security.test.ts` | **Pass (12/12, exit 0)** | D1 Node SQLite migrations, auth/session expiry/revocation/disable/role refresh, scoped-role denial, cross-origin rejection, Access RS256 JWKS verification + staff email matching through `apps/admin/src/middleware.ts`, 12-way registration race/capacity, duplicate privacy, transactional outbox rollback, cancellation release, migration of existing user/session rows, constraints, bounded contract input, Stripe webhook timestamp replay & 503 financial gate, and R2 `putObject` key scope, expiry, MIME/magic-byte spoofing, and overwrite denial. |
| `pnpm api:check` (`api:lint` + `generate --check` + `check` + `api:test`) | **Pass (9 groups; 12/12 operations, exit 0)** | Actual route handler modules over loopback HTTP using isolated Node SQLite and provider mocks. Includes registration response privacy, Admin Access + staff session verification, and payment fail-closed behavior. Does not exercise Astro’s edge router. |
| `node scripts/audit/workers.mjs` | **Pass (exit 0)** | Actual route handler bundle in `workerd`/Miniflare v4 against local D1 and R2 bindings. Covers sessions, event creation/review/discovery, normal-user denial, 12 concurrent registrations, capacity, dedupe privacy, outbox, foreign-key check, R2 private-read denial, and checkout gate. `PRAGMA integrity_check` is rejected by this D1 runtime (`SQLITE_AUTH`); Node SQLite passed integrity checks. |
| Migration compatibility regression | **Pass (included in 12-test audit suite)** | Upgrades populated legacy core tables through migrations 0000–0003 while retaining the existing user and session. |
| `pnpm api:types` | **Pass (exit 0)** | Generated OpenAPI artifacts refreshed (`v1.1.0`). `api:lint` passed with two existing redirect-only 2xx warnings. |
| `pnpm typecheck` | **Pass (exit 0)** | Astro sync and TypeScript checks completed across all 6 apps + `@gamo/api-contracts` with `WRANGLER_LOG_PATH=/tmp/wrangler-logs` and `XDG_CONFIG_HOME=/tmp/xdg-config`. |
| All-app `pnpm build` | **Pass (6/6 apps, exit 0)** | Astro production Cloudflare SSR builds for all six apps (`web`, `worship`, `academy`, `live`, `production`, `admin`) completed with exit code `0`. |
| Minimal workerd+D1 probe (`scripts/audit/runtime-probe.mjs`) | **Pass (exit 0)** | The installed worker runtime starts and queries a local D1 instance. |
| Stripe/Resend live sandbox | **Not run (gated)** | Stripe CLI is unavailable; no external credentials or provider calls were used. Checkout and financial webhook paths are deliberately gated (`503`). |
| Browser/Playwright lifecycle | **Not run** | The Live pages explicitly label forms as previews and do not call persistence APIs. |
| `pnpm audit` | **Pass (0 advisories, exit 0)** | Upgraded `pnpm` (`11.6.0` → `11.28.5`) and overrode `@esbuild-kit/core-utils>esbuild` to `0.28.2`, resolving all 6 high and 1 moderate advisories. |

All test fixtures use fictional `.invalid` identities and sample organization/event names. They contain no personal identity documents or real payment credentials.

## Confirmed critical findings and remaining production blockers

1. **Verified login is absent.** The only session-creation route issues an email-only identity in explicit local demo mode (`403` outside local loopback). No password verification, verified email challenge, account recovery, real login rate limiting, or global sign-in/session experience across the six subdomains exists.
2. **Staff identity binding needs an owner-level design and verification.** The middleware requires a D1 staff session and compares the Access email when available, but there is no account provisioning/verified-email process to reliably map immutable Access `sub` identifiers to D1 accounts.
3. **Stripe is not a working ticketing system.** Both `/api/checkout/session` and financial events on `/api/webhook/stripe` now fail closed with `503 Service Unavailable`. Design durable orders, inventory holds/reservations, organizer authorization, authoritative Stripe state retrieval, transaction/retry recovery, idempotent ticket issuance, and refund reconciliation before enabling these routes. Never treat the ledger as escrow.
4. **R2 uploads are not production-ready.** There is no HTTP upload/download path in the inventory. Library methods quarantine non-public files and check key prefix, ticket expiry, MIME/magic-byte spoofing, and no-overwrite rules, but HTTP upload/confirm routes, streaming scans, and signed download endpoints remain unbuilt.
5. **Notification outbox is queued but not delivered.** The registration job (`notification_jobs`) is durable and written in the same SQLite/D1 transaction as registration. No Cloudflare Queue/consumer, retry/backoff worker, or template renderer is active yet. The API accurately states delivery is queued (`emailSent: false`).
6. **Event lifecycle is incomplete.** No recurrence expansion, event-change/cancellation attendee communication, registration closing policy, organizer dashboard HTTP endpoint, payment inventory, or real browser flow.
7. **Deployment bindings are missing.** `wrangler.toml` files do not bind a named D1 database or R2 bucket. Do not deploy until isolated preview/production resources and secrets are explicitly configured.
8. **Rate limiting and abuse controls remain absent.** Auth demo, event creation, public registration, and webhook resource limits need edge/runtime throttling.
9. **Migration rollout safety needs operations work.** Execute a Wrangler D1 CLI migration and backup/restore rehearsal against an isolated staging database before any remote rollout. Because migration `0002` was repaired in-place during pre-production development, inspect `d1_migrations` state on any existing remote environment before applying `0002`/`0003`.

## Key Audit Artifacts

- [`docs/BACKEND_INDEPENDENT_AUDIT.md`](BACKEND_INDEPENDENT_AUDIT.md) — Complete P0–P2 finding register with file/line citations and repair notes.
- [`docs/BACKEND_TEST_MATRIX.md`](BACKEND_TEST_MATRIX.md) — Per-domain positive/negative test coverage and runtime evidence register.
- [`docs/BACKEND_RELEASE_READINESS.md`](BACKEND_RELEASE_READINESS.md) — Subsystem readiness table and mandatory 5-gate production checklist.
- [`docs/API_INVENTORY.md`](API_INVENTORY.md) & [`docs/API_COMPATIBILITY.md`](API_COMPATIBILITY.md) — Reconciled OpenAPI `v1.1.0` operation inventory and contract changelog.
- [`scripts/audit/security.test.ts`](../scripts/audit/security.test.ts) — 12 Node SQLite + route/middleware adversarial regression suites.
- [`scripts/audit/worker.ts`](../scripts/audit/worker.ts) & [`scripts/audit/workers.mjs`](../scripts/audit/workers.mjs) — `workerd`/Miniflare v4 route/D1/R2 harness.
- [`packages/db/migrations/0003_registration_integrity.sql`](../packages/db/migrations/0003_registration_integrity.sql) & repaired [`0002_complete_backend_foundation.sql`](../packages/db/migrations/0002_complete_backend_foundation.sql) — Migration compatibility repair and atomic SQLite triggers.

**Release recommendation: NO-GO for production backend, Admin, uploads, registration email delivery, and ticket payments.** Local persistence and a gated free-event slice have verified Node SQLite and `workerd` evidence; real identity, staff provisioning, provider fulfillment, notification delivery, storage finalization, rate limiting, and deployment bindings must satisfy [`docs/BACKEND_RELEASE_READINESS.md`](BACKEND_RELEASE_READINESS.md) before production rollout.

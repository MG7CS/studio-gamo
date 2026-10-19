# Gamo Studios — Backend Release Readiness Assessment

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Still in the repo: the shared backend (`@gamo/auth` staff and admin-password code, `AdminService`, `ParticipationService`, the review handlers in `@gamo/domain`), the `admin` entries in `@gamo/config`, the `adminCredentials` table (migration 0005) and the admin Cloudflare resources.


**Prepared:** 2026-10-13  
**Branch:** `main`  
**Audit Reference:** [`docs/BACKEND_INDEPENDENT_AUDIT.md`](BACKEND_INDEPENDENT_AUDIT.md)  
**Test Matrix:** [`docs/BACKEND_TEST_MATRIX.md`](BACKEND_TEST_MATRIX.md)  
**Overall Recommendation:** **NO-GO FOR PUBLIC PRODUCTION DEPLOYMENT**

---

## 1. Executive Release Decision

Following the independent backend security audit and the **Backend Stabilization Phase**, Gamo Studios has implemented and verified:
- Legal-structure-neutral organizational architecture (Christian and mission-driven while final incorporation and tax status remain undecided).
- Isolated `local`, `preview`, and `production` Cloudflare configurations across all 6 `wrangler.toml` files, with remote preview D1 (`gamo-db-preview`, `d7e12797-cc6c-4fa3-91c7-c192863e4812`) and remote preview R2 (`gamo-media-preview`) provisioned and tested in the `gamostudios` Cloudflare account (`ebae7bded6ab45950aeba1d6cf51eb7f`).
- Verified user authentication (`POST /api/auth/challenge`, `POST /api/auth/verify`), session inspection (`GET /api/auth/me`), organization onboarding (`POST /api/organizations`), and staff identity provisioning (`POST /api/staff/provision`) binding immutable Cloudflare Access `sub` values to D1 `users.id` in `external_identities`.
- Complete free-event registration workflow (`POST /api/events/{id}/register`) with atomic D1 capacity triggers, durable `notification_jobs` outbox processing (`NotificationService` with HTML escaping and exponential retry backoff), and Playwright browser E2E verification against `workerd` and isolated D1.
- Strict prohibition of sensitive student and identity documents (`restricted_verification`, `student_record`, `identity_document`) in code and D1 triggers (`SENSITIVE_DOCUMENT_PROHIBITED`).

However, **public production deployment remains NO-GO** until all remaining release gates (live email provider credentials and domain verification, paid ticketing order/hold/webhook fulfillment, R2 HTTP upload/quarantine promotion, edge rate limiting, and legal/entity governance sign-off) pass and a separate production release-readiness review is completed.

| Subsystem / Surface | Readiness Status | Gate / Disposition |
| :--- | :--- | :--- |
| **D1 Schema (`0000`–`0004`), Triggers & Preview D1/R2** | **VERIFIED (LOCAL + REMOTE PREVIEW)** | Applied and tested in Node SQLite, `workerd`/Miniflare D1, and remote Cloudflare preview D1 (`gamo-db-preview`) + R2 (`gamo-media-preview`). |
| **Verified Email Auth, Session Lifecycle & Org Onboarding** | **VERIFIED (LOCAL / SANDBOX)** | `POST /api/auth/challenge`, `POST /api/auth/verify`, `GET /api/auth/me`, and `POST /api/organizations` verified in unit, contract, `workerd`, and Playwright browser E2E tests. Requires live `RESEND_API_KEY` + verified sender domain before production. |
| **Gamo Admin & Staff Identity Provisioning (`apps/admin`)** | **VERIFIED (LOCAL / SANDBOX)** | Protected by RS256 Access JWT verification + D1 staff session + email & immutable Access `sub` match (`external_identities`) + self-moderation denial. Requires production Cloudflare Zero Trust Access application policy before production. |
| **Gamo Live Free Registration & Notification Outbox** | **VERIFIED (LOCAL / SANDBOX)** | Atomic D1 capacity triggers + `NotificationService` outbox processor (`sent` / `pending` with backoff / `failed` after 5 attempts) verified. Requires live Resend credentials and scheduled retry worker for production email delivery. |
| **Paid Ticketing & Stripe Webhooks (`/api/checkout/session`, `/api/webhook/stripe`)** | **NO-GO (GATED `503`)** | Both routes return `503 Service Unavailable` for financial flows. Order authority, inventory holds, organizer payout separation, and refund reconciliation remain gated. |
| **R2 Media Uploads & Sensitive Document Prohibition** | **NO-GO (GATED / PROHIBITED)** | Sensitive student and identity documents are hard-blocked (`SENSITIVE_DOCUMENT_PROHIBITED`). HTTP upload/download routes and magic-byte quarantine promotion are not yet enabled. |
| **Public Production Deployment (`wrangler.toml` `[env.production]`)** | **NO-GO (HOLD)** | Production resource IDs remain unprovisioned placeholders (`REPLACE_BEFORE_PRODUCTION_DEPLOY`) so no accidental production deployment can occur without explicit release-readiness sign-off. |

---

## 2. Remaining Mandatory Gates Before Public Production Deployment

### Gate 1 — Live Email Delivery & Cloudflare Zero Trust Configuration (Owner + Operations)
1. **Verified Transactional Email Domain**: Configure SPF, DKIM, and DMARC for Gamo Studios' sender domain and provision `RESEND_API_KEY` and `EMAIL_FROM` secrets so `POST /api/auth/challenge` and `NotificationService` send real emails rather than local/preview mock deliveries.
2. **Cloudflare Zero Trust Access Policy**: Configure the production Cloudflare Access application for `admin.gamostudio.org`, set `CF_ACCESS_TEAM_NAME` and `CF_ACCESS_AUD` in Worker secrets, and provision initial `superadmin` and `staff_reviewer` `external_identities` (`sub`) in D1.

### Gate 2 — Ticketing, Order Authority & Financial Governance (Owner + Legal + Engineering)
1. **Legal & Entity Prerequisites**: Complete the entity formation, governance, and banking steps in [`docs/NONPROFIT_TRANSITION_CHECKLIST.md`](NONPROFIT_TRANSITION_CHECKLIST.md) before enabling any live payment, donation, sponsorship, or membership collection.
2. **Authoritative Order & Hold Model**:
   - Introduce an `orders` table tracking state (`pending_payment`, `paid`, `expired`, `refunded`, `canceled`) and reserving `ticket_tiers` capacity with a bounded expiration hold before redirecting to Stripe Checkout.
   - Verify organizer `ticketing_authorized_at` and `verification_status = 'verified'` before permitting paid tier creation or checkout.
3. **Transactional Webhook Fulfillment**:
   - Process `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, and `charge.refunded` inside an atomic D1 batch that transitions `stripe_webhook_events`, `orders`, `payment_records`, `event_registrations`, and `ledger_entries` together.

### Gate 3 — Scheduled Notification Outbox Sweep (Engineering)
1. **Scheduled Retry Consumer**: Wire `NotificationService.processPendingJobs()` to a Cloudflare Worker `scheduled()` Cron Trigger so transient Resend failures are retried automatically in the background according to `next_attempt_at`.

### Gate 4 — R2 HTTP Media Pipeline & Safeguarding (Owner + Engineering)
1. **Upload/Download Endpoints**: Specify OpenAPI contracts and implement authenticated upload-ticket and confirmation routes for non-sensitive program media (`public_asset`, `private_document`, `audition_media`).
2. **Safeguarding Prohibition Preserved**: Keep sensitive student and identity document collection (`restricted_verification`, `student_record`, `identity_document`) prohibited until formal legal and child-safeguarding controls are ratified.

### Gate 5 — Production Cloudflare Infrastructure & Edge Rate Limiting (Operations)
1. **Production D1 & R2 Provisioning**: Provision dedicated production D1 (`gamo-db-prod`) and R2 (`gamo-media-prod`) resources in the `gamostudios` account only after formal release-readiness approval.
2. **Edge Rate Limiting**: Configure Cloudflare WAF / Workers Rate Limiting rules on `/api/auth/*`, `/api/organizations`, `/api/events`, `/api/events/*/register`, and `/api/webhook/stripe`.

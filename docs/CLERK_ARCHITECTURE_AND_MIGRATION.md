# Gamo Studios — Independent Clerk Authentication Architecture & Migration Guide

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Removed since: the admin-password and gate-cookie code, `requireStaff`/`requireSuperadmin`/`verifyStaffBoundaryIdentity`, `provisionStaffIdentity`, the review form handlers and the break-glass variables. Still in the repo until the rebuild: `isStaffOrAdmin`, the `superadmin`/`staff_reviewer` role checks, `AdminService`, `ParticipationService.review`, `provider-review.ts`, `audit_logs` writes, the `admin_credentials` table (migration 0005) and the admin Cloudflare resources.


## 1. Architectural Mandate

Every Gamo Studios product operates its own **independent Clerk application, authentication lifecycle, sessions, and user accounts**, while reusing the single approved Gamo shared authentication UI (`@studio-gamo/ui/components/auth/*`).

1. **Product Account Independence**:
   - Registering on Gamo Live (`apps/live`) creates an account **only** in Gamo Live. It never creates or links an account in Gamo Academy, Gamo Worship, Gamo Production, or Gamo Studios (`apps/web`).
   - Users may register with the same email address across multiple Gamo products; each product maintains an isolated Clerk user ID and an isolated D1 `product_accounts` + `clerk_identity_links` record.
   - Cross-product session tokens (`__session` cookie or `Authorization: Bearer <jwt>`) are cryptographically rejected (`401`/`403`) via product-specific RSA keys (`CLERK_JWT_KEY_<PRODUCT>` / `CLERK_SECRET_KEY_<PRODUCT>`), issuer (`iss`) validation, and `authorizedParties` (`azp`) checks.
2. **Internal Admin Boundary (`apps/admin`)**:
   - `apps/admin` does **not** use public product Clerk accounts.
   - Administrative access requires Cloudflare Zero Trust Access RS256 JWT verification (`cf-access-jwt-assertion`) or the isolated PBKDF2-SHA256 Admin Gateway password session (`__admin_gate` + `sessionProduct === null` + `staff_reviewer` / `superadmin` role in D1).
3. **Authentication vs. Domain Authorization**:
   - Clerk authenticates the person's identity for that specific product.
   - Gamo D1 domain tables (`organization_members`, `event_team_members`, `artist_representatives`, `representation_authorizations`, `user_roles`, `product_accounts`) determine what the user is authorized to do.

---

## 2. Clerk Application Configuration Matrix & Monorepo Environment Layout

### Directory & File Convention

```text
studio-gamo/
│
├── .env                        # Shared local development config (gitignored)
├── .env.example                # Safe shared local template (tracked)
├── .gitignore                  # Ignores all .env and .dev.vars files; tracks *.example
│
├── apps/
│   ├── web/
│   │   ├── .env                # Gamo Studios Clerk keys (gitignored)
│   │   ├── .env.example        # Gamo Studios Clerk template (tracked)
│   │   ├── .dev.vars           # Optional local Worker secret overrides (gitignored)
│   │   └── .dev.vars.example   # Local Worker secret template (tracked)
│   │
│   ├── live/
│   │   ├── .env                # Gamo Live Clerk keys (gitignored)
│   │   ├── .env.example        # Gamo Live Clerk template (tracked)
│   │   ├── .dev.vars           # Optional local Worker secret overrides (gitignored)
│   │   └── .dev.vars.example   # Local Worker secret template (tracked)
│   │
│   ├── academy/
│   │   ├── .env                # Gamo Academy Clerk keys (gitignored)
│   │   ├── .env.example        # Gamo Academy Clerk template (tracked)
│   │   ├── .dev.vars           # Optional local Worker secret overrides (gitignored)
│   │   └── .dev.vars.example   # Local Worker secret template (tracked)
│   │
│   ├── worship/
│   │   ├── .env                # Gamo Worship Clerk keys (gitignored)
│   │   ├── .env.example        # Gamo Worship Clerk template (tracked)
│   │   ├── .dev.vars           # Optional local Worker secret overrides (gitignored)
│   │   └── .dev.vars.example   # Local Worker secret template (tracked)
│   │
│   ├── production/
│   │   ├── .env                # Gamo Production Clerk keys (gitignored)
│   │   ├── .env.example        # Gamo Production Clerk template (tracked)
│   │   ├── .dev.vars           # Optional local Worker secret overrides (gitignored)
│   │   └── .dev.vars.example   # Local Worker secret template (tracked)
│   │
│   └── admin/
│       ├── .env                # Admin local config (gitignored)
│       ├── .env.example        # Admin local template (tracked)
│       ├── .dev.vars           # Optional local Worker secret overrides (gitignored)
│       └── .dev.vars.example   # Local Worker secret template (tracked)
│
└── packages/
    └── config/
        └── env-loader.ts       # Shared loader (`createGamoCloudflareConfig` / `resolveAppLocalEnv`)
```

### How Environment Loading Works (`@gamo/config/env-loader`)

1. **Root Shared Local Configuration (`studio-gamo/.env`)**:
   - Astro's `@astrojs/cloudflare` adapter executes Wrangler's `unstable_getVarsForDev()` against each application's own `apps/<app>/wrangler.toml`, which does **not** automatically walk up to the monorepo root.
   - Every application's `astro.config.mjs` wraps `cloudflare(createGamoCloudflareConfig('<app>', import.meta.url))` from [`packages/config/env-loader.ts`](file:///Users/gamo/Desktop/studio-gamo/packages/config/env-loader.ts), which explicitly loads shared local variables (`ENVIRONMENT`, `SESSION_SECRET`, `ALLOW_DEMO_SESSION`, `ALLOW_TEST_CHALLENGE_OUTBOX`, `REQUIRE_ADMIN_AUTH`, `RESEND_API_KEY`) from `studio-gamo/.env` during local development (`make dev`, `make dev-all`, `make dev-<app>`).
   - **Strict Root Isolation Filter**: Any un-suffixed Clerk keys or cross-product suffixed Clerk keys at the repository root are stripped for other apps so one product can never inherit another product's Clerk credentials.
2. **Per-Application Clerk Credentials (`apps/<app>/.env` and `apps/<app>/.dev.vars`)**:
   - Inside `apps/<app>/.env` (or `apps/<app>/.dev.vars`), developers may use **either** standard Clerk SDK variable names (`PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_ISSUER`, `CLERK_APP_ID`, `CLERK_AUTHORIZED_PARTIES`) **or** product-suffixed variable names (`PUBLIC_CLERK_PUBLISHABLE_KEY_<PRODUCT>`, `CLERK_SECRET_KEY_<PRODUCT>`, etc.).
   - `resolveAppLocalEnv()` automatically sets `CLERK_PRODUCT="<app>"` and maps standard Clerk names to that application's suffixed names in memory, while `resolveProductClerkConfig()` in [`packages/auth/clerk.ts`](file:///Users/gamo/Desktop/studio-gamo/packages/auth/clerk.ts) natively accepts both conventions for the active product.
   - In Wrangler's native loader, if `apps/<app>/.dev.vars` exists, Wrangler skips `apps/<app>/.env`. `createGamoCloudflareConfig()` merges both `apps/<app>/.env` and `apps/<app>/.dev.vars` (with `.dev.vars` taking precedence) so neither file is silently ignored.
3. **Production & Preview Secrets**:
   - `isLocalDevEnvironment()` ensures local `.env` and `.dev.vars` values are injected **only** during local development (`astro dev`). Production and preview builds (`make deploy-*`, `make preview-*`) never embed local secrets into generated `dist/server/wrangler.json` bundles. Production secrets are stored exclusively in Cloudflare Worker secrets (`wrangler secret put`).

| Product | Workspace Package | Local Config Files | Clerk App ID | Status | Local Dev Origin | Production Domain(s) | Supported Clerk Variable Names |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Gamo Live** | `apps/live` | `apps/live/.env`<br>`apps/live/.dev.vars` | `app_3KlWyOBL2xL2YzhJuvgk8QdrWIt` | **Provisioned by Founder** | `http://127.0.0.1:4324` | `https://live.gamostudio.org` | `PUBLIC_CLERK_PUBLISHABLE_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE`<br>`CLERK_SECRET_KEY` / `CLERK_SECRET_KEY_LIVE` |
| **Gamo Studios** | `apps/web` | `apps/web/.env`<br>`apps/web/.dev.vars` | `pending_clerk_app_gamo_web` | Pending Founder Approval | `http://127.0.0.1:4321` | `https://gamostudio.org`, `https://www.gamostudio.org` | `PUBLIC_CLERK_PUBLISHABLE_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY_WEB`<br>`CLERK_SECRET_KEY` / `CLERK_SECRET_KEY_WEB` |
| **Gamo Worship** | `apps/worship` | `apps/worship/.env`<br>`apps/worship/.dev.vars` | `pending_clerk_app_gamo_worship` | Pending Founder Approval | `http://127.0.0.1:4322` | `https://worship.gamostudio.org` | `PUBLIC_CLERK_PUBLISHABLE_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY_WORSHIP`<br>`CLERK_SECRET_KEY` / `CLERK_SECRET_KEY_WORSHIP` |
| **Gamo Academy** | `apps/academy` | `apps/academy/.env`<br>`apps/academy/.dev.vars` | `pending_clerk_app_gamo_academy` | Pending Founder Approval | `http://127.0.0.1:4323` | `https://academy.gamostudio.org` | `PUBLIC_CLERK_PUBLISHABLE_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY`<br>`CLERK_SECRET_KEY` / `CLERK_SECRET_KEY_ACADEMY` |
| **Gamo Production** | `apps/production` | `apps/production/.env`<br>`apps/production/.dev.vars` | `pending_clerk_app_gamo_production` | Pending Founder Approval | `http://127.0.0.1:4325` | `https://production.gamostudio.org` | `PUBLIC_CLERK_PUBLISHABLE_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION`<br>`CLERK_SECRET_KEY` / `CLERK_SECRET_KEY_PRODUCTION` |
| **Gamo Admin** | `apps/admin` | `apps/admin/.env`<br>`apps/admin/.dev.vars` | *N/A (Cloudflare Access + Admin Gate)* | Active Internal Boundary | `http://127.0.0.1:4326` | `https://admin.gamostudio.org` | `CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD`, `REQUIRE_ADMIN_AUTH` |

> [!IMPORTANT]
> `resolveProductClerkConfig()` in [`packages/auth/clerk.ts`](file:///Users/gamo/Desktop/studio-gamo/packages/auth/clerk.ts) enforces a hard runtime guard: if `app_3KlWyOBL2xL2YzhJuvgk8QdrWIt` or Gamo Live's publishable/secret keys are ever configured on `web`, `worship`, `academy`, or `production`, the server immediately throws `403 FORBIDDEN`.

---

## 3. Shared Authentication Component Inventory

All five public products render the same shared components from `packages/ui/src/components/auth/` inside `Layout` with `chrome={false}`:

- [`GamoAuthExperience.astro`](file:///Users/gamo/Desktop/studio-gamo/packages/ui/src/components/auth/GamoAuthExperience.astro) — Reads `Astro.locals.clerkConfig` (populated by [`page-middleware.ts`](file:///Users/gamo/Desktop/studio-gamo/packages/domain/src/api/page-middleware.ts)) and passes `clerkPublishableKey` and `clerkAppId` to `AuthLayout`.
- [`AuthLayout.astro`](file:///Users/gamo/Desktop/studio-gamo/packages/ui/src/components/auth/AuthLayout.astro) — Full-viewport split-screen layout with `AuthPhotoPanel.astro` and `AuthCurvedDivider.astro`, binding `data-clerk-publishable-key` and `data-clerk-app-id` on `[data-verified-auth]`.
- [`AuthForm.astro`](file:///Users/gamo/Desktop/studio-gamo/packages/ui/src/components/auth/AuthForm.astro) — Composes `AuthNavBar.astro`, `AuthFormHeader.astro`, `AuthFeedback.astro`, `AuthEmailInput.astro`, `AuthCodeInput.astro` (`[data-otp-slot="0..5"]`), and `AuthActions.astro`.
- [`auth-flow-client.ts`](file:///Users/gamo/Desktop/studio-gamo/packages/ui/src/lib/auth-flow-client.ts) — Client controller supporting:
  1. **Clerk Custom Headless Email OTP Flow** (when the product's `PUBLIC_CLERK_PUBLISHABLE_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY_<PRODUCT>` is configured): dynamically loads `@clerk/clerk-js` (`new Clerk(publishableKey)`), executes `client.signUp.create` + `prepareEmailAddressVerification({ strategy: 'email_code' })` + `attemptEmailAddressVerification` (for `/account/signup`) or `client.signIn.create` + `prepareFirstFactor({ strategy: 'email_code' })` + `attemptFirstFactor` (for `/account/signin` and `/account/recover`), and activates the product-scoped session via `clerk.setActive({ session })`.
  2. **Local Simulation / Pre-Cutover Fallback** (when a product's Clerk publishable key is not yet provisioned): uses `/api/auth/challenge` and `/api/auth/verify` with zero UI changes.
- [`AccountHub.astro`](file:///Users/gamo/Desktop/studio-gamo/packages/ui/src/components/account/AccountHub.astro) — Displays product-scoped account details, organization memberships, and signs out of both Clerk (`window.Clerk.signOut()`) and D1 (`DELETE /api/auth/session`).

---

## 4. Existing D1 Identity Migration & Rollback Strategy

### Schema Additions (`0011_clerk_product_identities.sql`)
- Added `clerk_app_id`, `clerk_user_id`, `clerk_issuer`, and `clerk_linked_at` columns to `product_accounts`.
- Created `clerk_identity_links` table with unique constraints on:
  - `(product, clerk_user_id)`
  - `(clerk_issuer, clerk_user_id)`
  - `(product_account_id)`

### Safe Domain Claim vs. Cross-Product Isolation
When a user authenticates with a verified Clerk JWT on product `P` (`resolveOrProvisionClerkProductSession` in [`packages/auth/clerk.ts`](file:///Users/gamo/Desktop/studio-gamo/packages/auth/clerk.ts)):
1. **Existing Link**: If `(P, clerkUserId)` exists in `clerk_identity_links` and `clerk_issuer` matches, resolves the linked D1 `user_id` and `product_account_id`.
2. **Same-Product Legacy Claim (`verified_domain_claim`)**: If no Clerk link exists yet, checks whether an **unlinked** `product_accounts` row already exists for `(legacyUser.id, P)` with the same verified email.
   - If found, links that existing `product_accounts` row to `(P, clerkAppId, clerkUserId, clerkIssuer)` and records an audit log (`clerk.legacy_product_account_claimed`).
   - All existing `events`, `organizer_profiles`, `organization_members`, `artist_profiles`, `artist_representatives`, `representation_authorizations`, `enrollments`, `musician_profiles`, `production_requests`, and `participation_inquiries` remain intact.
3. **Cross-Product Email Isolation (`clerk_registration`)**: If the email exists in D1 **only under other products** (or does not exist at all), the system **never** merges or links with the other product's user record. Instead, it creates a dedicated product-scoped D1 user (`usr_<product>_<clerkUserId>`) and `product_accounts` row (`pacc_<product>_<clerkUserId>`).

### Rollback Plan
- Legacy D1 tables (`users`, `sessions`, `auth_challenges`, `product_accounts`) are preserved non-destructively.
- If a product's Clerk cutover needs to be rolled back, unsetting `PUBLIC_CLERK_PUBLISHABLE_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY_<PRODUCT>` and `CLERK_SECRET_KEY` / `CLERK_SECRET_KEY_<PRODUCT>` immediately restores the D1 challenge/session flow without losing any domain data.

---

## 5. Owner Provisioning Steps for Remaining Clerk Applications

### A. Configure Gamo Live (`apps/live` — `app_3KlWyOBL2xL2YzhJuvgk8QdrWIt`)
1. In the Clerk Dashboard for application `app_3KlWyOBL2xL2YzhJuvgk8QdrWIt`:
   - Enable **Email Address** with **Email verification code (OTP)** for both Sign-up and Sign-in.
   - Under **Session management → Customize session token**, include claims:
     ```json
     {
       "email": "{{user.primary_email_address}}",
       "email_verified": "{{user.email_verified}}",
       "name": "{{user.full_name}}",
       "product": "live",
       "app_id": "app_3KlWyOBL2xL2YzhJuvgk8QdrWIt"
     }
     ```
   - Set **Paths / Component paths** to custom application routes:
     - Sign-in URL: `/account/signin`
     - Sign-up URL: `/account/signup`
     - After sign-in / sign-up fallback: `/account`
   - Set **Allowed Origins / Authorized Parties**:
     - Development: `http://127.0.0.1:4324`, `http://localhost:4324`
     - Production: `https://live.gamostudio.org`
2. Populate `apps/live/.env` (from `apps/live/.env.example`) or `apps/live/.dev.vars` (from `apps/live/.dev.vars.example`) for local dev, and set Cloudflare Worker secrets for preview/production:
   ```bash
   pnpm --filter apps-live exec wrangler secret put CLERK_SECRET_KEY_LIVE --env production
   pnpm --filter apps-live exec wrangler secret put CLERK_JWT_KEY_LIVE --env production
   ```

### B. Provision the 4 Remaining Clerk Applications (Upon Founder Approval)
Create **four separate Clerk applications** in the Clerk Dashboard (or via `npx @clerk/cli@latest` per app directory):
1. **Gamo Studios (`apps/web/.env`)** → Set `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (or `CLERK_APP_ID_WEB`, `PUBLIC_CLERK_PUBLISHABLE_KEY_WEB`, `CLERK_SECRET_KEY_WEB`, `CLERK_JWT_KEY_WEB`, `CLERK_ISSUER_WEB`).
2. **Gamo Worship (`apps/worship/.env`)** → Set `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (or `CLERK_APP_ID_WORSHIP`, `PUBLIC_CLERK_PUBLISHABLE_KEY_WORSHIP`, `CLERK_SECRET_KEY_WORSHIP`, `CLERK_JWT_KEY_WORSHIP`, `CLERK_ISSUER_WORSHIP`).
3. **Gamo Academy (`apps/academy/.env`)** → Set `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (or `CLERK_APP_ID_ACADEMY`, `PUBLIC_CLERK_PUBLISHABLE_KEY_ACADEMY`, `CLERK_SECRET_KEY_ACADEMY`, `CLERK_JWT_KEY_ACADEMY`, `CLERK_ISSUER_ACADEMY`).
4. **Gamo Production (`apps/production/.env`)** → Set `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (or `CLERK_APP_ID_PRODUCTION`, `PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION`, `CLERK_SECRET_KEY_PRODUCTION`, `CLERK_JWT_KEY_PRODUCTION`, `CLERK_ISSUER_PRODUCTION`).

For each application:
- Enable **Email verification code (OTP)** for Sign-up and Sign-in.
- Configure custom session token claims with `"product": "<web|worship|academy|production>"`.
- Restrict cookies to the product's own host (`live.gamostudio.org`, `academy.gamostudio.org`, `worship.gamostudio.org`, `production.gamostudio.org`, `gamostudio.org`) — **never** set a shared `.gamostudio.org` Clerk session cookie across products.


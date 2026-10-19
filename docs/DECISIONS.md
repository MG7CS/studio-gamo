# Gamo Studios Architecture Decisions

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Removed since: the admin-password and gate-cookie code, `requireStaff`/`requireSuperadmin`/`verifyStaffBoundaryIdentity`, `provisionStaffIdentity`, the review form handlers and the break-glass variables. The `superadmin` role overrides, `isStaffOrAdmin` and every `audit_logs` write were removed too. Still in the repo until the rebuild: the `staff_reviewer` role check, `AdminService`, `ParticipationService.review`, `provider-review.ts` (self-review rules), the `audit_logs` and `admin_credentials` tables (migration 0005) and the admin Cloudflare resources.


## Milestone 0 Decisions
- **Monorepo Structure**: using `pnpm` workspaces. This provides native workspace resolution and avoids conflicts, keeping deployables separated while sharing domain models.
- **Framework**: Astro SSR on Cloudflare Workers for all applications.
- **Styling**: Tailwind CSS for rapid styling matching the design tokens.
- **Authentication Strategy**: Custom implementation using HttpOnly/Secure cookies backed by Cloudflare D1. Heavy third-party auth services (like Auth0 or Supabase Auth) often have friction with Cloudflare Workers' Edge environment or add significant bundle sizes. Since user identity and verification are crucial (M1), owning the auth model in D1 keeps us within our strict boundaries. 

## 2026-10-12 — Gamo Live, Church Partners & dynamic homepage
> **Partially superseded** by the nonprofit decision below. Items marked ~~struck~~ no longer apply; remaining items stay in force.
- **Gamo Live is two-sided** (Promote Event for organizers, Explore Events for attendees). Detailed in `docs/GAMO_LIVE_AND_PARTNERS.md`.
- **Promotion starts as a managed service.** Staff run campaigns; no ad-platform APIs are assumed or connected. Future integrations go behind `packages/integrations` adapters with explicit approval.
- ~~**Money separation:** media spend, Gamo service fees and ticket proceeds are distinct ledger categories.~~ → replaced by nonprofit ledger categories (below). Stripe Connect remains the payout rail; no "escrow" claims (still in force).
- ~~**Gamo Church Partners** is a proposed recurring membership with advertising credits and discounts.~~ → redefined as a mission partnership network. Free participation without partnership remains in force.
- **Integrity:** sponsored placements always labeled; payment/advertising/partnership cannot influence musician vetting/rankings (separate domain, no cross-access); musician pay never reduced to fund partner benefits.
- **Dynamic hero:** "Keep Worship Going" stays as brand message. ~~Hero becomes a placement-driven rotating spotlight.~~ → a rotating spotlight is now a *future option* that **requires explicit approval** before implementation.
- **No new providers:** stack remains Astro, Cloudflare, Stripe Connect, Resend.
- **Homepage pills** (How It Works, Gamo Live) implemented as small vanilla-JS accessible tablists rather than framework islands.

## 2026-10-12 — Gamo Studios becomes a proposed Christian nonprofit (governing decision)
- **Decision (founder):** Gamo Studios is restructured as a proposed Christian nonprofit dedicated to religious, educational and community-serving purposes, intended as an Arizona nonprofit corporation seeking 501(c)(3) recognition. This **supersedes** the commercial business model (commission maximization, advertising revenue, commercial subscriptions, separate profit-center verticals).
- **Source of truth:** `docs/GAMO_NONPROFIT_MODEL.md`. Legal/governance dependencies: `docs/NONPROFIT_TRANSITION_CHECKLIST.md`. Other documents link rather than restate.
- **Programs retained:** Worship, Academy, Live, Production and Admin apps and all technical decisions are kept; they are reframed as connected nonprofit programs.
- **Gamo Worship:** fair musician pay; any Gamo administrative allocation is modest, transparent, separate from musician pay and **not implemented** until mechanism, consent, classification and legal review are complete.
- **Gamo Academy:** principal educational program; primary audience students and families; approved headline "Learn to Play the Instrument You Love."
- **Gamo Live:** Christian events nationwide, eligibility not defined by ethnicity or nationality; tickets only for authorized organizers; promotion is an optional, labeled service.
- **Church partnerships:** mission network; no mandatory tiers/prices; no pay-to-win.
- **Financial architecture:** ledger categories `charitable_contribution`, `sponsorship`, `program_service_receipt`, `third_party_payable`, `processing_cost`, refund/dispute, with `program` and `fund_id` dimensions. Replaces `media_spend | service_fee | ticket_proceeds`.
- **Placement kinds:** `sponsored | editorial | gamo_program` (renamed from `gamo_service`).
- **Roadmap:** reordered around ten mission-aligned priorities; donations/funding infrastructure blocked on legal prerequisites.
- **Public status wording:** "a developing Christian nonprofit initiative; incorporation and federal tax-exempt recognition are pending; contributions are not currently tax-deductible."
- **Open question for counsel (not decided):** whether an interim fiscal-sponsorship arrangement is appropriate while formation and recognition are pending.

## 2026-10-12 — Favicons and domain under consideration

- **Favicon:** all six apps use the official standalone waveform symbol (`design-reference/branding/svg/gamo-studios-symbol-*.svg`), geometry unchanged, viewBox tightened for 16/32px legibility. `favicon.svg` uses rust `#BE5B32` and switches to the official cream `#F6EFE4` variant under `prefers-color-scheme: dark`. PNG/ICO variants use rust on transparent; the Apple touch icon uses rust on cream (iOS ignores transparency). Regenerate with `node scripts/generate-favicons.mjs`. Default Astro starter favicons removed.
- **Domain:** the founder owns `gogamostudio.org`, which is **under consideration only**. No production domain, DNS, canonical URL or redirect changes until the exact intended canonical domain is approved by the founder.

## 2026-10-12 — Public frontend recovery and shared foundation

- **Scope:** founder authorized the full public multi-page UI brief for web, Worship, Academy, Live and Production, superseding the previous web-only restriction. Admin expansion and backend functionality remain deferred. Engineering evidence is separate from founder visual acceptance.
- **Hero preservation:** approved homepage stays on `/`; bright proposal on `/preview/hero-2026` uses real components/photography and is not automatically promoted.
- **Shared UI:** organization-wide shell/navigation/footer, typed photo catalog and fixed local sibling ports; program-specific compositions remain app-owned. Icon type exports live in TypeScript, avoiding `.astro` module imports in data catalogs.
- **Demo boundaries:** deterministic local interactions, safe review text, explicit fictional data and no real submission/persistence. Legacy transactional-looking routes redirect or disclose sample states. No new external providers.
- **Build reliability:** root workspace builds run sequentially after parallel Cloudflare prerender workers collided on inspector ports. `make check`, `make test`, `make images` propagate failure instead of echoing a success-looking fallback.
- **Images:** configuration-aware content caching and bounded responsive variants; originals and website concepts stay separate from deployable AVIF/WebP assets. Exact inventory/evidence: [ASSET_INVENTORY_2026.md](ASSET_INVENTORY_2026.md).
- **Accessibility:** content always visible during scroll reveals, reduced motion suppresses transitions, small terracotta text uses the darker brand shade on cream. Controls retain keyboard focus and honest unavailable states.
- **Concurrent recovery:** preserve incoming work and comparative components; rerun affected checks rather than overwriting another writer. Any later source changes require fresh evidence.

## 2026-10-13 — Authenticated dashboard UI system (design-first)

- **Scope:** founder authorized the complete frontend UI for all signed-in experiences (account entry, Worship, Academy, Live, Production, Church Partner, internal Admin). No authentication, authorization, payments, publishing, dispatch, messaging or database writes.
- **Shared, data-driven system:** `packages/ui` owns the shell, navigation, switcher, page header, state views and typed blocks; apps declare `Workspace` data and render one dynamic route per workspace. Chosen over hand-written pages to keep one visual system, small page files and consistent responsive behaviour (tables become stacked cards on mobile; container queries adapt blocks to their column width).
- **Demo identity:** one fixed fictional persona, a persistent demo banner, `noindex` on every dashboard and a switcher that only changes the page viewed. No impersonation path to a real user exists.
- **One account, many roles:** personal account · active role · active organization · program workspace · permission level are distinct concepts. Future server-side boundaries: [DASHBOARD_ARCHITECTURE.md](DASHBOARD_ARCHITECTURE.md).
- **Consolidation:** Live organizer pages merged into `/organizer/*`; Academy `/dashboard` → `/family`; Live `/my-tickets` → `/me/tickets`; Worship `/church/roster` → `/church/musicians`; Worship `/admin` prototypes → `apps/admin` (port 4326).

### 2026-10-13 — OpenAPI-first HTTP contracts

Adopt OpenAPI 3.1.1 multi-file contracts and Redocly lint/bundle/reference tooling, generated `@gamo/api-contracts` types/openapi-fetch client, and build-time Ajv standalone validators. Keep six domain-owned Astro applications and existing `/api` URLs/legacy envelopes. Generate filtered public and restricted internal references; publish neither automatically. Prefer a focused OpenAPI JSON Schema HTTP runner with isolated SQLite and provider mocks for initial coverage; Cloudflare concurrency and actual provider sandbox tests remain separate requirements. Pin TypeScript 5.9.3 because openapi-typescript depends on its compiler API. Production Node SQLite imports are removed. See `docs/OPENAPI_ARCHITECTURE.md` for compatibility, security and idempotency policies.

## 2026-10-13 — Legal-Structure-Neutral Organizational Architecture & Backend Stabilization

- **Legal-Structure-Neutral Positioning**: Gamo Studios is a Christian, mission-driven organization serving churches, musicians, students, families and faith communities, while its final legal incorporation structure and tax status remain undecided. All documentation and financial ledger models remain legal-structure-neutral: strict separation of third-party payables (`third_party_payable`), program receipts (`program_service_receipt`), processing costs (`processing_cost`), sponsorships, and contributions; zero claims of 501(c)(3) status or tax-deductibility; donation/sponsorship/membership payment processing disabled until legal and tax decisions are finalized.
- **Independent Audit Reconciliation**: Earlier `cb97c37` completion claims for end-to-end backend functionality are superseded by [`docs/BACKEND_INDEPENDENT_AUDIT.md`](BACKEND_INDEPENDENT_AUDIT.md). Checkout (`POST /api/checkout/session`) and financial Stripe webhooks (`POST /api/webhook/stripe`) remain fail-closed (`503 Service Unavailable`).
- **Sensitive Document Prohibition**: The platform does not collect sensitive student records or government identity documents.
- **Cloudflare Environment Isolation**: Isolated `local`, `preview` (account `gamostudios` `ebae7bded6ab45950aeba1d6cf51eb7f`: `gamo-db-preview` and `gamo-media-preview`), and `production` configurations across all six `wrangler.toml` files without deploying to or modifying production domains.
- **Verified Authentication, Org Onboarding & Staff Identity Provisioning**: Cryptographic email OTP challenge-response (`auth_challenges`, SHA-256 hashed single-use codes, attempt caps, expiry, rate limiting), verified-email organization onboarding (`POST /api/organizations`), and superadmin staff provisioning binding immutable Cloudflare Access `sub` identifiers (`external_identities`) to D1 users.

## 2026-10-14 — Standalone Gamo Live Consumer Platform Evolution (`PLATFORM_BRAND`)

- **Configurable Consumer Brand Architecture (`PLATFORM_BRAND`)**:
  - `PLATFORM_BRAND` is the configurable public-facing software brand placeholder resolved via `getPlatformBrandConfig(env)` in `@gamo/domain` and `@studio-gamo/ui`.
  - Sanitization guarantees that literal `"PLATFORM_BRAND"` never renders as customer-facing copy (falling back to `"Gamo Live"` until a founder-approved name is configured) and placeholder domains remain marked `isPlaceholderDomain: true` until `PLATFORM_IS_LIVE_DOMAIN="true"`.
  - **Gamo Live** is the internal operating division; **Gamo Studios** is the parent Christian, mission-driven organization. Parent branding is not imposed on every public screen (`LiveHeader.astro` / `LiveFooter.astro` replace the global Gamo Studios cross-program chrome on `apps/live`), while accurate legal-structure-neutral operator and non-escrow payment disclosures are shown in legal, payment, privacy, and transactional footer contexts.
- **No Mandatory Attendee Account / Dashboard**:
  - Public discovery (`GET /api/events` with `category`, `city`, `artist`, `venue`, `dateFrom` filters), free registration, and ticket checkout operate without requiring a casual attendee account.
  - Self-service ticket/order/receipt lookup (`POST /api/tickets/lookup` and `/my-tickets` → `/me/tickets`) requires strong inbox verification via a 6-digit email challenge code (`auth_challenges`), preventing email-only or phone-only enumeration.
- **One Identity, Role-Scoped Workspaces & Granular Event Permissions**:
  - Added `event_organizations` (many-to-many co-organizers, venues, promoters, sponsors) and `event_team_members` (`0006_live_standalone_platform.sql`) with distinct roles (`event_owner`, `lead_promoter`, `host_venue`, `co_organizer`, `booking_agent`, `production_coordinator`, `ticketing_admin`, `finance_contact`, `door_scanner`) and 7 boolean permission flags enforced server-side via `hasEventPermission` / `requireEventPermission`.
  - Publishing or editing event content (`can_edit_content`) never implies authority to approve refunds (`can_approve_refunds`) or access settlement accounts (`can_view_settlement`).
- **Artists, Authorized Representatives & Immutable Booking Engagements**:
  - Added `artist_profiles`, `artist_representatives`, `representation_authorizations`, `booking_inquiries`, `booking_offers`, and `performance_engagements`.
  - SQLite triggers (`rep_auth_exclusive_conflict_insert/update`) reject conflicting active exclusive representation in overlapping territories (`409 Conflict`).
  - Revoking representation (`POST /api/representations/{id}/revoke`) immediately blocks future negotiation authority while preserving prior signed engagements and audit history.
  - Accepted booking offers are locked against mutation by SQLite trigger `booking_offer_immutable_accepted`, and `performance_engagements` enforce `deposit_collection_status = 'disabled_pending_policy'` via triggers `engagement_deposit_gate_insert/update` until legal terms, financial authority, and refund policies are approved.
  - Artist compensation (`artist_fee_cents`), agent commission (`agent_commission_cents`), travel stipends, and platform administrative allocations (`platform_admin_allocation_cents`) are always stored and reported as separate line items.
- **Atomic Ticket Holds, Sandbox Webhook Fulfillment, Replay-Protected Scans & Linked Production**:
  - Added `ticket_holds`, `ticket_orders`, `tickets`, `ticket_scans`, `refund_records`, and `settlement_records`.
  - Unverified organizers remain fail-closed (`503`) on `POST /api/checkout/session`. Verified organizers with `ticketing_authorized_at` create expiring inventory holds (`ticket_holds`) and pending orders (`ticket_orders`) fulfilled idempotently only via signed Stripe sandbox webhooks (`POST /api/webhook/stripe`, `livemode: false`), never via browser redirects.
  - Door check-in (`POST /api/tickets/scan`) verifies SHA-256 QR token hashes, blocks replay (`already_scanned`), and records `ticket_scans` audit rows.
  - Academy youth showcase performers on `event_performers` require verified guardian consent (`guardian_consent_verified = 1`, `guardian_user_id IS NOT NULL`, `safeguarding_cleared = 1`), enforced by SQLite triggers `event_performer_minor_safeguarding_insert/update`.
  - Organizers coordinate sound, lighting, livestreaming, stage setup, AV, and crew via `POST/GET /api/events/{id}/production-requests` (`production_requests.event_id`), exposing only technical/schedule context to Gamo Production.

## 2026-10-14 — Gamo Live Software Name Retained; Alternative Brand Search Paused

- **Working software name**: **Gamo Live** across all `apps/live` public pages, navigation, dashboards, event listings, ticketing flows, artist and agent workspaces, transactional emails, and admission passes.
- **Naming status**: **Retained for now** for the current development cycle. No alternative names, temporary naming experiments, or placeholder brands are shown in the customer experience.
- **Alternative brand search**: **Paused**.
- **Trademark clearance**: **Pending legal consultation**. Retaining Gamo Live as the working and customer-facing software name does not imply trademark registration, clearance, or legal approval.
- **Domain decision**: **Deferred**. Existing development (`localhost:4324`), preview, and deployment (`live.gamostudio.org`) configurations remain unchanged; no new domain is registered, migrated, or activated.
- **Future rebranding**: **Supported by the existing configurable brand layer** (`PLATFORM_BRAND` in `apps/live/wrangler.toml`, `getPlatformBrandConfig`, and `resolvePlatformBrandConfig` in `@gamo/domain` and `@studio-gamo/ui`), which sets **Gamo Live** as the effective default while preserving the ability to rebrand later without rebuilding routes or templates.
- **Parent relationship & release gates preserved**: Gamo Live remains an operating program/division of Gamo Studios (legal-structure-neutral; not a separately incorporated entity), with shared authentication, cross-division integrations, and fail-closed live payment (`503`) and artist deposit (`disabled_pending_policy`) gates intact.
## 2026-10-15 — Production Readiness Phase 1: Real Authentication, Onboarding, and Public-to-Workspace Journeys

- **Server-Enforced Workspace Authorization (`packages/auth/page-access.ts` + App Middlewares)**:
  - All five public applications (`apps/web`, `apps/live`, `apps/worship`, `apps/academy`, `apps/production`) enforce server-side session and role checks in `src/middleware.ts` via `evaluateWorkspacePageAccess(...)`.
  - Unauthenticated requests to any private workspace route (`/account` index, `/partner*`, `/organizer*`, `/artist*`, `/agent*`, `/me/tickets*`, `/workspaces*`, `/promote/create*`, `/church*`, `/musician*`, `/family*`, `/host*`, `/instructor*`, `/client*`) redirect (`303 See Other`) to `/account/signin?next=<encoded_path>`, preserving the original destination through email verification.
  - Authenticated users who lack the required program role or organization membership are redirected to `/account/access-denied` (`403 Forbidden`), which explains the missing prerequisite and links to the relevant onboarding or inquiry path rather than rendering a silent dead end or fictional dashboard.
- **Removal of Public Demo Personas & Query-Parameter Bypasses**:
  - Removed all `?demo_key=` query-parameter authentication bypasses and automatic fallback to fictional demo personas (`Hannah Desta`, etc.) across public and workspace routes.
  - Isolated demo workspace preview mode strictly to local loopback requests when both `ENVIRONMENT=local` and `ALLOW_PUBLIC_DEMO_WORKSPACES=true` are explicitly configured; preview and production environments reject demo workspace fallbacks unconditionally.
  - Replaced populated sample dashboard records with `emptyWorkspaceScreen(...)` (`packages/ui/src/lib/workspace-empty.ts`) so newly registered or role-authorized users see honest empty states and actionable next steps until real records exist.
- **Shared Cross-App Identity, Verification & Organization Onboarding**:
  - Standardized `/account`, `/account/signin`, `/account/signup`, and `/account/access-denied` across `apps/web`, `apps/live`, `apps/worship`, `apps/academy`, and `apps/production`, backed by replicated `/api/auth/{challenge,verify,session,logout}` and `/api/organizations` routes in each application and documented in `openapi/root.yaml` (58 total operations).
  - Email verification challenges (`POST /api/auth/challenge`) send 6-digit single-use codes via Resend when `RESEND_API_KEY` and `EMAIL_FROM` are configured, return a simulated code only on local loopback when `ENVIRONMENT=local` and `ALLOW_AUTH_SIMULATION=true`, and fail closed (`503 AUTH_DELIVERY_UNAVAILABLE`) when email delivery is unconfigured outside local simulation.
- **Persistent Participation Inquiries & Staff Review Queue (`0008_participation_inquiries.sql`)**:
  - Replaced unpersisted multi-step prototype forms (`/apply`, `/hire` on `worship`; `/register`, `/host-apply` on `academy`; `/assessment`, `/consultation` on `production`) with `303` redirects to `apps/web` `/contact?interest=...` and connected `/get-involved`, `/contact`, and `/partnerships` to D1 table `participation_inquiries` via `POST /api/participation` and `GET /api/participation`.
  - Added staff review endpoints (`GET /api/participation/review-queue`, `POST /api/participation/{id}/review`) and operational queue UI (`apps/admin/src/pages/participation.astro`) so reviewers can triage inquiries (`pending_review`, `in_review`, `reviewed`, `closed`) with persistent notes visible in the submitter's `/account` hub.
- **Gamo Live Public-to-Workspace Journeys & Verified Ticket Recovery**:
  - Restructured `apps/live` public navigation (`LiveHeader.astro`, `LiveFooter.astro`) around purposeful public destinations (`/events`, `/promote`, `/artists`, `/my-tickets`) and authenticated entry points (`/workspaces`, `/promote/create`, `/account/signin`).
  - `/promote/create` requires an authenticated session (`middleware.ts`), guides first-time users without an organization to set one up in `/account`, and persists real event submissions (`POST /api/events`) with `pending_review` moderation status.
  - `/workspaces` serves as the authenticated hub displaying the user's real submitted events, artist profiles (`POST /api/artists`), and authorized workspaces.
  - `/my-tickets` requires a verified 6-digit email challenge code (`POST /api/auth/challenge` + `POST /api/tickets/lookup`) before disclosing registrations or QR admission credentials, and honestly states that SMS recovery is unavailable because no SMS delivery provider is configured.

## 2026-10-15 — Unified Shared Authentication Component Architecture & Ecosystem Rollout

- **Canonical Shared Authentication Components (`packages/ui/src/components/auth/`)**:
  - `AuthLayout.astro` (full-viewport desktop split-screen composition and curved mobile photographic header wrapping `AuthPhotoPanel.astro` and `AuthCurvedDivider.astro`), `AuthForm.astro` (shared form presentation composing `AuthNavBar.astro`, `AuthFormHeader.astro`, `AuthFeedback.astro`, `AuthTextField.astro`, `AuthEmailInput.astro`, `AuthCodeInput.astro`, and `AuthActions.astro`), and `GamoAuthExperience.astro` (top-level 4-mode authentication experience wired to `packages/ui/src/lib/auth-flow-client.ts`) are maintained centrally in `@studio-gamo/ui`.
- **Passwordless Adaptation & No Unconfigured Social Controls**:
  - Although the visual reference depicts a password field on Create Account and Google/Facebook buttons on Sign In, Gamo Studios uses passwordless 6-digit email verification (`POST /api/auth/challenge` + `POST /api/auth/verify`). Create Account adapts that slot into a clean `Verification method: 6-digit email verification code · No password` indicator, and social sign-in buttons are rendered only when `googleAuthUrl` or `facebookAuthUrl` props are genuinely configured.
- **Ecosystem-Wide Rollout & Zero Public Chrome (`chrome={false}`)**:
  - All five public/program applications (`apps/web`, `apps/live`, `apps/worship`, `apps/academy`, `apps/production`) import `@studio-gamo/ui/components/auth/GamoAuthExperience.astro` across `/account/{signin,signup,verify,recover}.astro` wrapped in `<Layout chrome={false}>` so no public marketing navigation header or footer surrounds the authentication screen.
  - `apps/admin` remains protected by Cloudflare Access (`CF_Access_JWT_Assertion`) and break-glass staff gateway (`/login`) rather than public end-user OTP registration.

## 2026-10-15 — Product Account Independence Architecture (`product_accounts` & Scoped Sessions)

- **Shared Authentication Infrastructure, Separate Product Accounts**:
  - Gamo Studios applications (`web`, `live`, `worship`, `academy`, `production`) share the cryptographic OTP challenge infrastructure (`users`, `auth_challenges`, `sessions`) and reusable UI components (`@studio-gamo/ui/components/auth/*`), but operate as **independent products** with separate account registration, membership, onboarding, permissions, and workspaces.
  - Added the `product_accounts` table (`packages/db/migrations/0010_product_accounts.sql`, `packages/db/schema.ts`) with unique constraint `(user_id, product)` and added `sessions.product` so every registration and session is explicitly scoped to a single product (`'web' | 'worship' | 'academy' | 'live' | 'production'`).
  - Existing valid user records are preserved non-destructively during migration by backfilling `product_accounts` strictly from each user's existing product-specific domain records (events, artist profiles, ticket orders, musician profiles, service requests, enrollments, instructors, production requests, participation inquiries, and sessions).
- **Per-Product Enrollment & Sign-In Enforcement**:
  - `IdentityService.issueEmailChallenge` and `verifyEmailChallenge` (`packages/domain/src/services/identity.ts`) accept `intent` (`'signin' | 'signup' | 'recover'`) and `product`.
  - If an existing user attempts `signin` on a product where they have not registered a product account, `issueEmailChallenge` and `verifyEmailChallenge` return `403 FORBIDDEN` (`"No <Product> account was found for this email address. Please create a <Product> account first."`) rather than silently creating or granting cross-product access.
  - Verifying a `signup` challenge creates or activates the `product_accounts` record for the target product only.
  - Every application's `/api/auth/{challenge,verify,session,me}` routes bind to their owning product key via `createAuthHandlers(defaultProduct)` (`packages/domain/src/http/auth.ts`).
- **Strict Cross-Product Session & Page Isolation**:
  - `validateSession` (`packages/auth/index.ts`) resolves active `product_accounts` and `sessionProduct`. `hasProductAccess(auth, product)` requires both an active product account for `product` and (when `sessionProduct` is set) a matching `sessionProduct === product`.
  - `canAccessPage(app, path, auth)` (`packages/auth/page-access.ts`) and `applicationPages(app)` (`packages/domain/src/api/page-middleware.ts`) enforce `hasProductAccess(auth, app)` before granting access to any product route (including `/account`, `/workspaces`, `/family`, `/church`, `/client`). Cross-product session requests to private routes are redirected to `/account/access-denied` (`403 Forbidden`).
- **Product-Specific Authentication Copy & Gamo Live Onboarding**:
  - Updated `getAuthScreenCopy(program)` (`packages/ui/src/lib/auth-flow-client.ts`) and `GamoAuthExperience.astro` so registration headings read `Create your ${program} account` (e.g., **Create your Gamo Live account**) and supporting copy refers exclusively to that product. Removed all occurrences of `"One account for Gamo Worship, Gamo Academy, Gamo Live, and Gamo Production."`.
  - Gamo Live registration creates a general Gamo Live account only and routes into Gamo Live onboarding (`/account`, `/workspaces`, or `?next=`), while organizer publishing, artist representation, and settlement/refund permissions require explicit organization/artist onboarding and authorization.

---

## Decision 014 — Real Database Events on `gamostudio.org/live` & Past Event Closure Rule (2026-10-15)

- **Context**: `gamostudio.org/live` (`apps/web/src/pages/live.astro`) previously rendered hardcoded sample events (`"Harvest Night of Gospel"`, `"Rise Christian Leadership Conference"`, etc.) instead of querying the `events` table in D1. Additionally, events whose scheduled dates had passed needed an explicit rule marking them closed and past.
- **Decision**:
  1. Converted `apps/web/src/pages/live.astro` (`export const prerender = false;`) to query D1 directly via `LiveService.ensureVerifiedCatalogSeeded()` and `LiveService.listDiscoverableEvents({ limit: 100 })`, mapping real database events through `mapDbEventsToMarketingEvents` in `apps/web/src/data/live-marketing.ts`.
  2. Added `isEventPast` and `getEventLifecycleStatus` to `@gamo/domain` (`packages/domain/src/services/live-external-discovery.ts`) and enriched `LiveEventWithDetails` in `LiveService` with `isPast`, `isClosed`, and `lifecycleStatus`.
  3. Enforced the **Past Event Closure Rule** across both `apps/web` (`/live` spotlight hero, event cards, free/ticketed ledger, and trust legend) and `apps/live` (`LiveDiscoveryCard.astro`, `/events/[id]`, and `/events/[id]/register`), rendering a `Past · Closed` / `Past Event · Closed` badge and replacing active ticket/registration CTAs with a closed notice whenever `isEventPast(event, now)` is true, while sorting upcoming events ahead of past events.


---

## 2026-10-18 — Test servers run with Clerk off; deploy builds carry no local values

- **Context**: four Playwright tests failed because local `.dev.vars` held Clerk Production-instance keys (Clerk rejects `127.0.0.1` with 400) and, in worship, Gamo Live's Clerk app id (the product-isolation guard then answers 503 on private pages). Checking `make deploy-<app>` showed that `@astrojs/cloudflare` copies `.dev.vars` into `process.env` on every build, so Vite inlined the local `PUBLIC_CLERK_PUBLISHABLE_KEY` (and admin's local `CF_ACCESS_*`) into production server chunks, and `@cloudflare/vite-plugin` left `dist/server/.dev.vars` in deploy builds.
- **Decision**:
  1. e2e servers blank every Clerk credential and app id (`scripts/e2e/test-servers.ts`, `GAMO_TEST_SERVER=1`) and are never reused from an earlier process; Clerk-on behaviour is tested only with fake keys and blocked outbound network (`scripts/audit/clerk-configured-fake-keys-e2e.test.mjs`).
  2. A live key (`pk_live_`/`sk_live_`/`rk_live_`) in a local env file is a warning in `pnpm dev` and stops `pnpm test:e2e` with an explanation.
  3. `gamoDeployBuildHygiene` restores `process.env` before Vite runs in preview/production builds, deletes `dist/server/.dev.vars`, and fails the build if a local value is found in `dist`.
- **Not changed**: local builds still inline `import.meta.env` objects (needed for `astro preview`); the build machine's shell `USER` is also inlined in those objects (harmless, noted for a later clean-up of `import.meta.env?.` reads).

## 2026-10-19 — Admin rebuilt from scratch: single admin, Access-only, claymorphism UI

- **Context**: the old admin (and a first rebuild) were deleted. The owner decided one admin account is enough for the foreseeable future.
- **Decision**:
  1. One admin, no roles, staff management, audit trail, passwords or sessions. Cloudflare Access alone: the app verifies the Access assertion and requires the exact `ADMIN_EMAIL`, fail-closed. Recovery is changing the Access policy in Cloudflare.
  2. Admin pages use the claymorphism design in `design-reference/claymorphism-admin-ui/` and only that. Exception to the single-palette UI rule, approved by the owner; public sites and `packages/ui` tokens are unchanged.
  3. Accessibility deviations from the design are approved: darker body/muted text and primary-button colors so contrast meets WCAG 2.2 AA (`docs/ADMIN_REQUIREMENTS.md` §3). Inter only, CSS-only decoration, no dark mode in v1.
  4. The old `gamo-admin` worker stays live until the new one replaces it after a preview sign-in through real Access.
- **Plan**: `docs/ADMIN_REQUIREMENTS.md`.

## 2026-10-19 — Admin uses the app palette (supersedes the lavender palette above)

- **Decision** (owner, after reviewing localhost; no gradients anywhere): admin pages keep the claymorphism shapes and shadows but use the same palette as every other app (shared `tokens.css`). The lavender palette, the invented logo chip and the background blobs are gone; the layout is full-page, the sidebar collapses to an icon rail, the brand is the Gamo Studios logo with an "Admin" label. The earlier palette exception no longer applies; the claymorphism design remains the admin's UI design.

## 2026-10-19 — Rebuild the product side from scratch; rules reset

- **Decision** (owner): rebuild every non-marketing page, API, the backend, data model, tests and the rules/docs from scratch; keep the marketing pages and the admin's Cloudflare Access gate and shell. Fresh data model (production holds no real user data), Live first, public sign-in redesigned, production frozen for the public apps until each rebuilt product ships. Rules now live in the rewritten `AGENTS.md`; the old rules are listed there as retired. Plan: `docs/REBUILD_PLAN.md`.


## 2026-10-19 — Phase 3: marketing contact by email

- **Decision:** until each product's accounts are rebuilt, every "sign up", "register", "list an event" or "apply" call to action leads to the web contact page, which opens an email to `hello@gamostudio.org` with a pre-filled subject. Reason: the old forms required sign-in that never worked in production, and an honest email path is better than a dead end. **Deviation** from rebuild decision 3 ("forms keep working"); the owner can restore a form once its product is rebuilt.

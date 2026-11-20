# Gamo Studios Architecture Decisions

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
> **Superseded 2026-11-16:** legal structure is a Christian, mission-driven Public Benefit Corporation (not a nonprofit, not tax-exempt; no 501(c)(3)). See the 2026-11-16 legal-structure entry below.
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
> **Superseded 2026-11-16:** public accounts and all per-program dashboards were removed; admin is the only dashboard (cleanup two entry below).

- **Scope:** founder authorized the complete frontend UI for all signed-in experiences (account entry, Worship, Academy, Live, Production, Church Partner, internal Admin). No authentication, authorization, payments, publishing, dispatch, messaging or database writes.
- **Shared, data-driven system:** `packages/ui` owns the shell, navigation, switcher, page header, state views and typed blocks; apps declare `Workspace` data and render one dynamic route per workspace. Chosen over hand-written pages to keep one visual system, small page files and consistent responsive behaviour (tables become stacked cards on mobile; container queries adapt blocks to their column width).
- **Demo identity:** one fixed fictional persona, a persistent demo banner, `noindex` on every dashboard and a switcher that only changes the page viewed. No impersonation path to a real user exists.
- **One account, many roles:** personal account · active role · active organization · program workspace · permission level are distinct concepts. Future server-side boundaries: [DASHBOARD_ARCHITECTURE.md](DASHBOARD_ARCHITECTURE.md).
- **Consolidation:** Live organizer pages merged into `/organizer/*`; Academy `/dashboard` → `/family`; Live `/my-tickets` → `/me/tickets`; Worship `/church/roster` → `/church/musicians`; Worship `/admin` prototypes → `apps/admin` (port 4326).

### 2026-10-13 — OpenAPI-first HTTP contracts

Adopt OpenAPI 3.1.1 multi-file contracts and Redocly lint/bundle/reference tooling, generated `@gamo/api-contracts` types/openapi-fetch client, and build-time Ajv standalone validators. Keep six domain-owned Astro applications and existing `/api` URLs/legacy envelopes. Generate filtered public and restricted internal references; publish neither automatically. Prefer a focused OpenAPI JSON Schema HTTP runner with isolated SQLite and provider mocks for initial coverage; Cloudflare concurrency and actual provider sandbox tests remain separate requirements. Pin TypeScript 5.9.3 because openapi-typescript depends on its compiler API. Production Node SQLite imports are removed. See `docs/OPENAPI_ARCHITECTURE.md` for compatibility, security and idempotency policies.

## 2026-10-13 — Legal-Structure-Neutral Organizational Architecture & Backend Stabilization
> **Superseded 2026-11-16 (legal-structure part):** the structure is a Public Benefit Corporation (entry below).

- **Legal-Structure-Neutral Positioning**: Gamo Studios is a Christian, mission-driven organization serving churches, musicians, students, families and faith communities, while its final legal incorporation structure and tax status remain undecided. All documentation and financial ledger models remain legal-structure-neutral: strict separation of third-party payables (`third_party_payable`), program receipts (`program_service_receipt`), processing costs (`processing_cost`), sponsorships, and contributions; zero claims of 501(c)(3) status or tax-deductibility; donation/sponsorship/membership payment processing disabled until legal and tax decisions are finalized.
- **Independent Audit Reconciliation**: Earlier `353b630` completion claims for end-to-end backend functionality are superseded by [`docs/BACKEND_INDEPENDENT_AUDIT.md`](BACKEND_INDEPENDENT_AUDIT.md). Checkout (`POST /api/checkout/session`) and financial Stripe webhooks (`POST /api/webhook/stripe`) remain fail-closed (`503 Service Unavailable`).
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
> **Superseded 2026-11-16:** public authentication, onboarding and workspaces were removed (cleanup two entry below).

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
> **Superseded 2026-11-16:** shared public authentication UI removed (cleanup two entry below).

- **Canonical Shared Authentication Components (`packages/ui/src/components/auth/`)**:
  - `AuthLayout.astro` (full-viewport desktop split-screen composition and curved mobile photographic header wrapping `AuthPhotoPanel.astro` and `AuthCurvedDivider.astro`), `AuthForm.astro` (shared form presentation composing `AuthNavBar.astro`, `AuthFormHeader.astro`, `AuthFeedback.astro`, `AuthTextField.astro`, `AuthEmailInput.astro`, `AuthCodeInput.astro`, and `AuthActions.astro`), and `GamoAuthExperience.astro` (top-level 4-mode authentication experience wired to `packages/ui/src/lib/auth-flow-client.ts`) are maintained centrally in `@studio-gamo/ui`.
- **Passwordless Adaptation & No Unconfigured Social Controls**:
  - Although the visual reference depicts a password field on Create Account and Google/Facebook buttons on Sign In, Gamo Studios uses passwordless 6-digit email verification (`POST /api/auth/challenge` + `POST /api/auth/verify`). Create Account adapts that slot into a clean `Verification method: 6-digit email verification code · No password` indicator, and social sign-in buttons are rendered only when `googleAuthUrl` or `facebookAuthUrl` props are genuinely configured.
- **Ecosystem-Wide Rollout & Zero Public Chrome (`chrome={false}`)**:
  - All five public/program applications (`apps/web`, `apps/live`, `apps/worship`, `apps/academy`, `apps/production`) import `@studio-gamo/ui/components/auth/GamoAuthExperience.astro` across `/account/{signin,signup,verify,recover}.astro` wrapped in `<Layout chrome={false}>` so no public marketing navigation header or footer surrounds the authentication screen.
  - `apps/admin` remains protected by Cloudflare Access (`CF_Access_JWT_Assertion`) and break-glass staff gateway (`/login`) rather than public end-user OTP registration.

## 2026-10-15 — Product Account Independence Architecture (`product_accounts` & Scoped Sessions)
> **Superseded 2026-11-16:** product accounts, workspaces and the shared person record were removed (cleanup two entry below).

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
> **Superseded 2026-11-16:** Gamo Live was removed.

- **Context**: `gamostudio.org/live` (`apps/web/src/pages/live.astro`) previously rendered hardcoded sample events (`"Harvest Night of Gospel"`, `"Rise Christian Leadership Conference"`, etc.) instead of querying the `events` table in D1. Additionally, events whose scheduled dates had passed needed an explicit rule marking them closed and past.
- **Decision**:
  1. Converted `apps/web/src/pages/live.astro` (`export const prerender = false;`) to query D1 directly via `LiveService.ensureVerifiedCatalogSeeded()` and `LiveService.listDiscoverableEvents({ limit: 100 })`, mapping real database events through `mapDbEventsToMarketingEvents` in `apps/web/src/data/live-marketing.ts`.
  2. Added `isEventPast` and `getEventLifecycleStatus` to `@gamo/domain` (`packages/domain/src/services/live-external-discovery.ts`) and enriched `LiveEventWithDetails` in `LiveService` with `isPast`, `isClosed`, and `lifecycleStatus`.
  3. Enforced the **Past Event Closure Rule** across both `apps/web` (`/live` spotlight hero, event cards, free/ticketed ledger, and trust legend) and `apps/live` (`LiveDiscoveryCard.astro`, `/events/[id]`, and `/events/[id]/register`), rendering a `Past · Closed` / `Past Event · Closed` badge and replacing active ticket/registration CTAs with a closed notice whenever `isEventPast(event, now)` is true, while sorting upcoming events ahead of past events.


---

## 2026-10-18 — Test servers run with Clerk off; deploy builds carry no local values
> **Superseded 2026-11-16 (Clerk part):** Clerk was removed; the deploy-build hygiene part still applies.

- **Context**: four Playwright tests failed because local `.dev.vars` held Clerk Production-instance keys (Clerk rejects `127.0.0.1` with 400) and, in worship, Gamo Live's Clerk app id (the product-isolation guard then answers 503 on private pages). Checking `make deploy-<app>` showed that `@astrojs/cloudflare` copies `.dev.vars` into `process.env` on every build, so Vite inlined the local `PUBLIC_CLERK_PUBLISHABLE_KEY` (and admin's local `CF_ACCESS_*`) into production server chunks, and `@cloudflare/vite-plugin` left `dist/server/.dev.vars` in deploy builds.
- **Decision**:
  1. e2e servers blank every Clerk credential and app id (`scripts/e2e/test-servers.ts`, `GAMO_TEST_SERVER=1`) and are never reused from an earlier process; Clerk-on behaviour is tested only with fake keys and blocked outbound network (`scripts/audit/clerk-configured-fake-keys-e2e.test.mjs`).
  2. A live key (`pk_live_`/`sk_live_`/`rk_live_`) in a local env file is a warning in `pnpm dev` and stops `pnpm test:e2e` with an explanation.
  3. `gamoDeployBuildHygiene` restores `process.env` before Vite runs in preview/production builds, deletes `dist/server/.dev.vars`, and fails the build if a local value is found in `dist`.
- **Not changed**: local builds still inline `import.meta.env` objects (needed for `astro preview`); the build machine's shell `USER` is also inlined in those objects (harmless, noted for a later clean-up of `import.meta.env?.` reads).

---

## 2026-11-16 — Drop Gamo Live; three programs (Academy, Worship, Production)

- **Context**: after talking with church ministers and pastors, the owner decided the most important work is **Gamo Academy** (music academy) and the musicians/church tech network (**Gamo Worship**), plus **Gamo Production**. Gamo Live (events, ticketing, door scanning, Promote/Explore Events) is not part of that work and added the largest amount of code, data and operational risk (payments, inventory, scanner secrets).
- **Decision**:
  1. Gamo Studios runs **three programs**: Gamo Academy, Gamo Worship and Gamo Production, plus the organization site (`apps/web`) and the staff admin app. Gamo Live is dropped.
  2. **Snapshot**: the four-program state is preserved at commit `08c9b44`, branch `archive/four-programs-2026-11-16` and annotated tag `four-programs-snapshot` (both pushed to GitHub with owner approval).
  3. **Removed**: `apps/live` and its workers (`gamo-live`, `gamo-live-preview`); Live-only domain code (ticketing services, `LiveService`, external discovery catalog, ticket QR and scanner PIN security, ticketing types, unused `PaymentService`, Stripe ticket/refund helpers); Live OpenAPI paths and schemas plus admin's event/organizer review paths; Live surfaces in web and admin (web `/live`, homepage Live spotlight, nav/footer/sitemap/llms/JSON-LD links, admin event review and Live demo screens); Live-only tests, scripts and docs.
  4. **Database**: migration `0018_remove_gamo_live.sql` drops the Live-only tables (events, ticketing, scanner, venues, artists/bookings, organizer profiles, external listings, `production_requests`/`production_projects`, `notification_jobs`) and the never-used `payment_records`, `ledger_entries` and `stripe_webhook_events`. It is destructive and owner-approved; production holds only test data. Kept tables are **not rebuilt**: CHECK constraints that still list `'live'` (product keys, provider roles) keep that value — harmless, and table rebuilds are risky.
  5. **Moved**: the Resend bounce/complaint webhook is served by `apps/web` at `https://gamostudio.org/api/webhook/resend` (commit `0a4fb0f`); `RESEND_WEBHOOK_SECRET` belongs to the web worker.
  6. **Deferred to cleanup two**: shared account, sign-in, Clerk, customer-link, email and Academy Stripe code stays even where it still names `'live'` in a type or list. A second cleanup (designed separately, later) will turn the remaining programs into simple forms, emails and invoices with the admin dashboard as the only dashboard.
- **Rules carried forward**: the church-partnership, sponsored-labeling ("Sponsored" / "Featured" / "Gamo Program" / "Example") and dynamic-homepage rules from the deleted `docs/GAMO_LIVE_AND_PARTNERS.md` now live in `docs/GAMO_NONPROFIT_MODEL.md` §4, §4.1 and §6. The AGENTS.md "Past Event Closure & Real Database Events Rule" (Decision 014) is retired.
- **Owner actions** (remote, not done by agents): delete the `gamo-live` and `gamo-live-preview` workers and the `live.gamostudio.org` route; repoint the Resend webhook and set `RESEND_WEBHOOK_SECRET` on web; apply migration `0018`. Steps: `docs/RUNBOOK.md` §12.

---

## 2026-11-16 — Cleanup two: no public accounts; forms, emails and invoices; admin is the only dashboard

- **Context**: after dropping Gamo Live, the owner wants Academy, Worship and Production to be simple: public pages, forms, emails and invoices. Only two forms persisted anything, Worship/Production pushed people into account sign-up, and every non-admin dashboard was demo data.
- **Decision** (owner, 2026-11-16; spec `docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`, plan `docs/superpowers/plans/2026-11-16-forms-emails-invoices.md`):
  1. **Remove public accounts first**: public sign-in/sign-up, Clerk, onboarding, provider profiles, the shared person record, participation, staff provider/church review and all per-program dashboards and demo workspaces. Old URLs redirect (`legacy-redirects.ts`). Migration `0019_remove_public_accounts.sql` drops the public-account tables (destructive; owner approved with the plan; production holds test data only). OpenAPI 4.0.0 is a breaking release (`docs/API_COMPATIBILITY.md`).
  2. **Admin is the only dashboard**, behind Cloudflare Access plus the admin password (unchanged: `users`, `sessions`, `roles`, `user_roles`, `admin_credentials`, `requireStaff`, `staffContext`).
  3. **Staff-editable forms** (Google-Forms question types, links, photo/video/PDF uploads to R2, versioned on publish) replace account flows; Academy registration keeps its account-free flow with emailed manage links.
  4. **Money flows through Gamo**: Gamo invoices the church or family and pays the musician; musician pay and any Gamo administrative line stay separate, and a Gamo line is refused until the owner approves the fee. Stripe Invoicing in test mode plus manual "mark paid".
  5. **Daily cron approved** for email retry and retention.
- **Retired AGENTS.md rules**: "Shared Authentication Design Rule" (and its component locations/route convention), "Product Account Independence Rule" (including the 2026-10-18 shared person record exception) and "Independent Clerk Authentication Rule". The email-domain rule is kept under "Email". The 2026-10-15 entries above (shared authentication components, product account independence) and the 2026-10-18 Clerk test-server entry are superseded and left as written.
- **Docs retired**: `docs/AUTH.md`, `docs/IDENTITY.md` and `docs/design/identity-and-ticketing.md` carry a retired banner; `docs/CLERK_ARCHITECTURE_AND_MIGRATION.md` was deleted (history at tag `four-programs-snapshot`).
- **Owner actions**: `docs/RUNBOOK.md` §13 (apply `0019`; delete any Clerk applications, DNS records and `CLERK_*` secrets).

## 2026-11-16 — Legal structure: Christian, mission-driven Public Benefit Corporation

- **Decision (owner-confirmed):** Gamo Studios is a Christian, mission-driven Public Benefit Corporation, formed to be mission-driven and not only profit-seeking. It is **not** a nonprofit and **not** tax-exempt. This supersedes the 2026-10-12 proposed-nonprofit/501(c)(3) entry and the 2026-10-13 legal-structure-neutral positioning.
- **Formation (owner-confirmed 2026-11-16):** state filing done, EIN obtained, bylaws adopted with the public benefit purpose, business bank account open. Filing details and numbers are never published in the repository.
- **Consequences:** no nonprofit, charity, tax-exempt, tax-deductible or donation language anywhere; Form 1023, fiscal sponsorship, donation acknowledgment and donation processing are not applicable (`docs/NONPROFIT_TRANSITION_CHECKLIST.md`, historical file name). Contribution or sponsorship payments need owner approval.
- **Docs:** `docs/GAMO_NONPROFIT_MODEL.md` (file name historical), `AGENTS.md`, `SECURITY.md`, `DESIGN.md`, `ROADMAP.md` updated; `DESIGN_FIRST_OVERRIDES.md`, `prompts/MASTER-PROMPT.md`, the root `ARCHITECTURE.md` and the 2026-10 backend audit documents are marked historical.
- **Hero (owner-confirmed 2026-11-16):** the approved homepage hero is the current "Where Worship, Learning & Community Meet." (`HomeEditorialHero`); the earlier "Keep Worship Going" reference is historical.

## 2026-11-16 — Photo frames: one radius, four ratios, shared `Frame` and `PhotoGrid`

- **Decision (owner, 2026-11-16; AGENTS.md rule 14):** every photo is a rounded rectangle with one radius token and one of four fixed ratios, rendered only by `packages/ui/src/components/media/Frame.astro`; clusters of two to four photos only by `PhotoGrid.astro`. The organic masks (`mask-arch`, `mask-arch-sm`, `mask-leaf`, `mask-leaf-alt`, `mask-pebble`) are retired; their utilities stay in `tokens.css` until the apps have migrated, then the lead removes them (`FRAMES_STRICT=1` in `scripts/audit/frames.test.ts` then fails on any remaining use).
- **Research (2026-11-16):** small ratio sets (Thumbprint https://thumbprint.design/guidelines/aspect-ratio); nested radius = outer − padding (https://cloudfour.com/thinks/the-math-behind-nesting-rounded-corners/); reserve space with width/height plus aspect-ratio (https://web.dev/articles/optimize-cls); focal point as `object-position` (https://developer.mozilla.org/en-US/docs/Web/CSS/object-position); overlay text only on a scrim with checked contrast (https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); alt required by type (https://design-system.service.gov.uk/styles/images/); one eager `fetchpriority="high"` image per page (https://web.dev/articles/fetch-priority); Safari rounded clipping needs `clip-path` and no transforms (https://bugs.webkit.org/show_bug.cgi?id=98538). Two approaches compared for the wide fallback and grid shapes: viewport media queries versus container queries; container queries chosen because frames sit in columns of different widths.
- **Tokens** (`packages/ui/src/styles/tokens.frame.css`): `--ratio-portrait` 4/5, `--ratio-landscape` 3/2, `--ratio-wide` 21/8, `--ratio-square` 1/1, `--radius-photo` 1.25rem, `--photo-gap` clamp(0.5rem, 1.5cqi, 1rem), `--photo-placeholder` (sand), `--photo-scrim` (ink 72% at the bottom, 62% across the text zone, fading to 0 over `--photo-scrim-fade` 3rem). Contrast on the worst case, a pure white pixel under 62% ink (rgb 112 112 114): white text 4.96:1, cream text 4.60:1 (WCAG 1.4.3 needs 4.5:1). `Card` sets `--frame-radius` (card radius minus padding) so a Frame inside a padded card is concentric.
- **`Frame` props:** `photo`, `ratio` (required), `alt` or `decorative: true` (exactly one, enforced by the TypeScript union and at build), `sizes` (`full` | `half` | `third` | `grid-tall`, built from `media/frame.ts` breakpoints), `priority`, `caption` (figcaption below, never over the photo), `scrim` (`none` | `bottom`; default slot only with `bottom`). No class, style, radius, fit or position. `wide` falls back to landscape in a container narrower than 30rem. `fill` is internal to `PhotoGrid`.
- **`PhotoGrid`:** `layout` `pair` (2) | `trio` (3) | `quad` (4) | `hero` (2) and `photos` as an ordered list of `{ photo, alt | decorative, caption?, priority? }` (priority on the first only). Wrong counts, a missing alt or a photo that cannot make a cell's crop throw at build time.
- **Crop validation:** `lib/images.ts` derives each catalog photo's focal point from its `position` and its allowed `ratios` from its pixel size (a ratio is allowed when at least half of the source stays in frame; an entry may override with `ratios`). A 4:5 source cannot be a 21:8 banner. `frames.test.ts` enforces focal point, allowed ratios and the throw.
- **Guards:** `scripts/audit/frames.test.ts` (Frame/PhotoGrid carry no raw styling; retired masks and photo geometry classes in `apps/*` are reported, ratchet per file, and fail under `FRAMES_STRICT=1`); catalog gate `tests/e2e/catalog.spec.ts` checks every `.frame` radius and ratio and an unclipped focus ring on a linked frame.

## 2026-11-18 — Offer sending is closed until the public offer page exists

Offer emails carry `/worship/offers/{token}` on the main site; the page and its POST are not built, only their domain logic. Because only the token's hash is stored, a sent link cannot be re-sent. Decision: `POST /api/requests/{id}/offers` fails closed (503) behind `OFFER_PAGE_LIVE = false` and `scripts/audit/offer-page-gate.test.ts` forces the switch to flip in the same change that adds `apps/web/src/pages/worship/offers/[token].astro`. Also: the daily purge skips submissions that a roster member or service request references (foreign keys); retention of those records is an owner decision. No external research needed (bug fixes and a fail-closed switch).

## 2026-11-18 — Public forms live on the main site; the offer page accepts `Origin: null`

Forms are built once, on `apps/web` (single-public-app direction, `docs/superpowers/specs/2026-11-16-single-public-app-design.md`): `/worship/{apply,request}` and `/production/{apply,request}`. The old per-program `/apply` and `/request` pages only redirect there; cross-origin form posts to a different subdomain would fail the same-origin checks and the shared upload routes. Form text, questions and the heading come from the published form, so staff edit them in admin. A submit stores the answers, attaches finished uploads with the upload-session token the browser posts, creates the service request for request forms, sends the receipt and staff notice, then redirects to `?sent=<signed reference>` (HMAC with `FORM_UPLOAD_SECRET`, one hour) so a reload never posts twice.

The offer page sends `Referrer-Policy: no-referrer` because the token is in the URL. Per the Fetch standard browsers then send `Origin: null` on its form post, so `isSameOriginPost` accepts `Origin: null` unless `Sec-Fetch-Site` is cross-site or same-site (sandboxed frames and `data:` pages arrive as cross-site), and uses the shared `requireSameOrigin` otherwise. The unguessable token is the credential; the check only keeps other sites from driving the buttons. Sources: Fetch standard "serializing a request origin"; the research on GET-versus-POST links is in `packages/domain/src/worship/offers.ts`.

The first visit to admin `/forms` publishes the six default forms when none exist (the plan's "seed on first admin load"). Research was already recorded in the spec; no new external dependency.

## 2026-11-18 — Photos and PDFs may be posted inside the form without JavaScript

Owner choice (2026-11-18): do not make the photo optional; let a normal form post carry it. Only for forms with a file question the body limit is 24 MiB (two 10 MB files plus text) instead of 128 KiB; Turnstile, the per-IP and per-email limits and the type, size and first-bytes checks all still run before and while the file is stored, and a post over the limit is cut off as it streams. Videos (500 MB) are never taken this way. The form is rendered `novalidate` and the browser script re-enables native validation, so a visitor without JavaScript is not blocked by `required` on questions that do not apply.

## 2026-11-18 — No old-URL compatibility: redirect lists removed

Owner: the apps have never been used by real users, so old URLs, retired flows and legacy data owe nothing. The per-app `legacy-redirects.ts` lists, the `legacyRedirects` middleware option and their tests are deleted; retired `/account/*`, demo and old form URLs answer 404. The single-public-app plan (`docs/superpowers/plans/2026-11-16-single-public-app.md`) therefore needs no old-URL redirect map, Search Console change of address or sitemap migration: when the program apps merge into the main site the old subdomains can simply be retired. Re-introduce a redirect only for an address real people or search engines have used.

**Update (2026-11-18, same day): this is temporary.** The no-redirect rule holds only until the first public launch. At launch, restore redirects for every address real people or search engines could have used, bring back the `legacyRedirects` middleware option (it is in git history: commit "Remove old-URL redirects and unused components, and rewrite the app READMEs") and a redirect test, and delete the "until the first public launch" exception from `AGENTS.md`. Added to the production gate in `ROADMAP.md`.

## 2026-11-18 — Clean layout rules: no eyebrows or pills, rectangular buttons, varied photo-led cards

Owner direction after comparing our home page with spacex.com and tesla.com (screenshots supplied by the owner, which stand in for the research step; no external source needed beyond these references). The layout most generated UIs default to (label, heading, grey subheading, button, then identical rounded cards each with a pill) is rejected. Rules are in `DESIGN.md` §11, summarised in `AGENTS.md`, `CLAUDE.md`, the three agent briefs, `packages/ui/src/components/README.md` and `docs/FRONTEND_ARCHITECTURE.md`. Nothing in the code has changed yet: the home page is redesigned first, then the shared components, then a ratcheting guard is added.

## 2026-11-18 — Home hero heading shortened

Owner: the home hero heading is now "Worship, Learning & Community" (was "Where Worship, Learning & Community Meet."). Composition, copy under it and photos are unchanged. The 2026-11-16 entry above is history.

## 2026-11-18 — Replace every photo with freely licensed ones; header menu is image-led; software service proposed

Owner direction: (1) the current AI-generated photos are all replaced. New photos must be usable by anyone commercially with no attribution: CC0 or public domain (including Wikimedia Commons files that state it) and the Unsplash, Pexels and Pixabay licenses. Nothing that needs attribution, no editorial-only or watermarked images, no AI-generated images, no identifiable children (the child-safety policy is pending). Each approved photo is recorded with its source page, creator, license name and URL, the exact license wording and the retrieval date (`docs/ASSET_MANIFEST.md`), and goes through the catalog (`packages/ui/src/lib/images.ts`) and `make images`. Candidates are downloaded as untrusted files into `assets/images/candidates/` (git-ignored) with a review page; only the owner's picks are kept. (2) The header becomes a Tesla-style mega menu where photos tell the story (tiles for instruments, kinds of musicians and kinds of technical work). The accessible pattern is the APG disclosure navigation, progressively enhanced (research summary: JS-enhanced disclosure buttons plus real links, no `menubar` role, panels hidden with `hidden` so images are not fetched until opened, hover delay about 150/300 ms, tap only opens on touch, drawer with accordions below 1024 px; sources: W3C APG disclosure navigation, WCAG 2.2 1.4.13, web.dev lazy loading). (3) A new proposed Gamo Production support area: websites and apps that churches need, offered at a cost that is cheap for churches. Under `AGENTS.md` any fee stays a proposal: the page says "proposed", shows no prices and makes no "affordable" claim until the board approves the offer and its pricing.

## 2026-11-18 — Church buildings keep the current photos for now; church email tile is an original SVG

Owner direction: the free-photo search found no good church-building photos, so the three church exteriors (modern church, golden hour, white chapel) stay as they are and the owner will source replacements. This is a known, temporary exception to the free-licence photo policy above and must be closed when the owner supplies the photos. The church-organization-email tile uses an original illustration (`assets/illustrations/church-email.svg`, cream and terracotta, an envelope with a letter) instead of a photo or a mail-brand logo: the Gmail logo is a Google trademark, and the stock-site copies offered were watermarked or of unknown licence.

## 2026-11-18 — Header mega menu: photo tiles, disclosure navigation

Pattern: W3C APG "Disclosure Navigation", progressively enhanced. Each program item stays a real link to its site, with a small chevron `<button>` beside it (`aria-expanded`, `aria-controls`, name "Academy menu") that toggles a sibling panel carrying the `hidden` attribute while closed, so the photos are not fetched until it opens. Not `role="menu"`/`menubar` (that is for application menus and forces arrow-key behaviour a site nav does not need), not CSS-only hover (keyboard and touch users cannot reach it), not popover or interest invokers (support is not yet wide enough). The chevrons ship `hidden` and the script reveals them, so without JavaScript the links navigate and the program home page shows the same content. Pointer: opens on hover only under `(hover: hover) and (pointer: fine)` (150 ms open, 300 ms close, the close timer is cancelled when the pointer enters the panel; Escape dismisses; the panel stays until dismissed: WCAG 1.4.13). On touch the first tap on the chevron only toggles. Keyboard: Enter or Space toggles, Down arrow opens and focuses the first tile, Escape closes and returns focus to the button, focus leaving the item closes it, opening one panel closes the other. The backdrop is a dim `aria-hidden` layer that closes on click; it is not a modal (no `inert`, no focus trap). Fade is 150 ms and is removed under `prefers-reduced-motion`. Below 1024 px the drawer shows each program as an accordion button with 48 px thumbnail rows (at least 44 px tall), then the text links and "All of X".

Data model: `NavTile { label, href, photo | src }` and `NavMenu { tiles, links, all }` in `packages/ui/src/shell/types.ts`, with `menu?: NavMenu` on `NavItem`. The content lives in `packages/config/menus.ts` (`programMenus(siteUrl)`, `withMenus(items, siteUrl)`), which may name programs and photos; `packages/ui` only renders it (`SiteHeader`, `MegaMenuPanel`, `MenuTile`). Every app's `site.config.ts` uses `withMenus(programNavItems(...), siteUrl)` and keeps Mission as a plain link. `scripts/audit/mega-menu.test.ts` checks photo keys against the catalog, the square ratio, the static image in every app, tile counts and hrefs; `tests/e2e/mega-menu.spec.ts` checks the behaviour.

axe may ask for `aria-haspopup` on the chevron buttons. We deliberately omit it: they are disclosure buttons that reveal a region of links, not menu buttons, and `aria-haspopup` would announce a menu that does not follow the menu keyboard model. Sources: W3C APG Disclosure Navigation Menu example, WCAG 2.2 1.4.13 (content on hover or focus), web.dev lazy loading.

## 2026-11-18 — The original photos return to the pages; the free-licence photos serve the header menu only

Owner direction after seeing the live site: "all the images we had before in their positions. only new images are those going to the panel." This reverses the earlier decision to replace every photo (the entry "Replace every photo with freely licensed ones" above still holds for how any NEW photo is sourced and recorded). The photo swap commit is reverted: every page uses the original catalog photos and descriptions again, including the three church exteriors. The 33 free-licence photos stay in the catalog and in `docs/ASSET_MANIFEST.md` and are used only by the header menu tiles (the original set has no instrument, musician-type or software photos). The proposed Software for Churches page uses an original photo (sanctuary), not a new one. The owner accepts that the original set is AI-generated and includes a child, which the earlier free-photo and child-safety notes had ruled against.

## 2026-11-18 — Photo rule clarified: new photos wherever the section is about a specific instrument or job

The owner clarified the previous entry: reverting everything went too far. Sections about a specific instrument, kind of musician or technical job need the new free-licence photos because only they show the subject. Rule now: the new photos (`instrument*`, `musician*`, `tech*`, `software*`) are used in the header menu panels, Academy instrument pages and lesson heroes, Worship's instruments section, and Production's support-area cards, pages, home features, training and event sections (including the proposed software area). The original photos stay on heroes, mission, get-involved and support pages, church sections, age-group cards, closing invitations and anywhere the picture is people or a place. When an instruction about photos could apply to every page, ask which sections it covers before applying it.

## 2026-11-18 — Minimal testing: the suite is cut by about 77%

Owner direction: "the testing is too much", then "delete 80% of the tests ... prioritize among the critical ones too", then "add a rule to use minimal testing". The suite went from about 1,017 test blocks to 237 (226 unit and audit, 24 browser; 3 journeys), chosen by risk: money (invoice totals, the fee-approval gate, Stripe never live), sign-in and access control, security headers and secret guards, personal data and uploads, migrations and data integrity, and the public offer link. Removed: layout, copy, photo-shape and count tests, screenshot baselines, the per-page link crawl, most menu, form-renderer and admin-screen browser tests, and many second and third variants of the same security or money behaviour. Tests that touched money, security or data and were removed (the agents' lists): invoice numbering, mark-paid, void and send refusals, Stripe status mapping, finalize and void, replay and not-configured webhook cases, customer erasure and link revocation, academy registration consent and guardian tests, Turnstile response mappings, IP /64 bucketing, email bounce and suppression handling, 365-day decline retention, withdrawn and expired offer pages, upload part limits and the 503 paths, FORM_UPLOAD_SECRET and INQUIRY_INBOX_EMAIL env checks. They stay in git history before the commit that records this entry. Rule: `AGENTS.md` "Minimal testing", `CLAUDE.md`. Review these removals if a payment or registration change is made later; restore the matching test from history first.

## 2026-11-18 — Three wide AI illustrations tried on the home page

Owner direction: use them as illustrations only (never on a musician profile); for children only appropriate, safe images and a consent policy must be written. The singer close-up is the full-width home hero (dark scrim, AA contrast checked), the worship-service picture sits in the Worship program section and the piano picture in the Academy section. Open for the owner's judgement: the dark scrim, and the purple against the cream and terracotta brand. The draft policy is `docs/CHILD_IMAGE_AND_CONSENT_POLICY.md` (DRAFT, not legal advice, not lawyer-reviewed; not yet linked from AGENTS.md).

**Outcome (same day):** the owner asked to undo the full-width hero and the three program sections, so the home page is back to the three-photo hero and the single programs block, and the three illustrations were removed from the repository. The illustration-only rule and the consent policy draft stand.

## 2026-11-19 — Shared defaults, no page-by-page flags

Owner direction: "We don't use the page-by-page thing. We use a shared platform architecture with layers where the top level is just assembling shared work." The layers are page, recipe, shared section, component, primitive, tokens; pages only assemble. The per-page markers and flags added earlier the same day (`data-heading-case="as-written"` on 13 page wrappers, `mediaFirstStacked` on 13 call sites, per-page `photoRatio` and `ratio`, `badge={false}` on 6 previews) were removed, and `docs/PAGE_BY_PAGE.md` was deleted. Five behaviours are now defaults of the shared layers and apply to every page of every app:

1. **Title case.** `titleCase` / `titleCaseHtml` / `titleCaseHeadingsIn` in `packages/ui/src/lib/title-case.ts` and the `TitleCase.astro` wrapper title-case text nodes only (small words a, an, the, and, but, or, nor, for, so, yet, as, at, by, in, of, on, to, from, with, into, onto, over, per, via, is stay lower case; the first word is capital; `&`, digits, entities and words with inner capitals are kept). Every shared heading component wraps its heading in it; `SplitHero` processes headings in its copy slot. `text-transform` is gone from the heading utilities and card titles. "up" is not a small word (owner, 2026-11-19), so "Signing Up" keeps its capital; "is" stays lower case.
2. **Photo first when stacked.** `SplitHero`, `PageHero`, `EditorialFeatureCard` and `CtaInvitation` order the media first below their stacking breakpoint; the `mediaFirstStacked` prop no longer exists.
3. **Photo shape by the photo.** `Frame` `ratio` defaults to `auto` (`closestRatio` in `lib/images.ts`: the allowed portrait, landscape or square that crops least). `commonRatio` chooses one shape for a set (highest worst-case share kept, then highest average); `MediaCardGrid` uses it so cards in a grid are equal. Explicit ratios remain as overrides (kept: Academy ChurchHosted and InstructionFormats, where the owner-chosen square is taller than the auto shape).
4. **No badge or caption by default.** `FloatingPreviewCard` has no Sample badge; captions show only when passed.
5. **No overflow on narrow screens.** Base-layer `min-width: 0` on grid and flex children, `overflow-wrap: anywhere` on text, `max-width: 100%` on media and tables, `text-size-adjust: 100%`, fluid heading minimums that shrink with the viewport, `NumberedSteps` single column `minmax(0, 1fr)`, a shrinking header brand block with the program label hidden below 24rem and the "Menu" word hidden below 17rem (accessible name stays Menu / Close), wrapping `ButtonLink`. Root cause of the Academy sign-up overflow at 308 px: a grid item (and the `NumberedSteps` list) without `min-width: 0` held its min-content width.

Where each lives and how to extend it: `docs/FRONTEND_ARCHITECTURE.md` ("Shared defaults, no page-by-page flags") and `packages/ui/src/components/README.md`.

## 2026-11-19 — No choirs, vocalists or singers

The owner decided that Gamo Studios does not work with choirs, vocalists or singers. There is no choir, voice or singing offering, lesson, instructor or role anywhere: apps, menus, seed data, form role lists and the docs. Worship and worship leaders stay part of the mission (clarified by the owner the same day): the home and Worship hero photos of a worship leader leading stay, and the Worship program is unchanged. Sound-engineering wording about vocal mixes in production copy is fine, because it describes audio work, not singers. The rule is also recorded in `AGENTS.md` ("Clean visual style").

## 2026-11-19 — Sponsorship wording

Owner direction: Academy lessons will be sponsored through partner organizations and churches. There is no sponsor page and no sponsor links anywhere (no footer, header, menu or closing-band "Sponsor" links, no `/sponsored` page). Sponsorship appears as two sections only, the main-site home (`HomeSponsorInvite`, after the program sections) and the Academy home (`SponsoredPrograms`), both with a "Partner with us" action to `/partners/interest`, plus a mention on the Partnerships page (opportunities list and closing band) and a "Sponsoring lessons" interest option on `/contact` and `/partners/interest` (form seeds; `/contact?interest=Sponsor lessons` pre-selects it; databases that already hold those forms need the option added in the admin form editor before deploy). The arrangement depends on each partner's offer, so the wording stays general: lessons will be sponsored through partner organizations and churches; details are shaped with each partner and shared when confirmed. Public pages must not state who qualifies, amounts, counts, need-based support, scholarships, cohorts, reduced or no-cost lessons, "free" reservations, instrument lending, an ability-to-pay or church-membership requirement.

## 2026-11-19 — Subtle alternating section bands

Owner direction: sections that follow each other are told apart by background colour, subtly (cream and a pale sand), on every page including the main-site home. It is a shared default, not a page flag: bands carry `data-band` and `data-tone`, and `packages/ui/src/styles/bands.css` gives every second default band in a run the new semantic token `--ui-surface-band` (an even mix of cream and sand; own values for the inset and dark wrappers). An explicit tone (`raised`, `inset`, `dark`) keeps its surface and restarts the run; a `Section` with `spacing="none"` continues the band above. The decorative hand-set `raised` and `inset` tones on page bands were removed so the rule does the work; tones stay only for panels, dark emphasis and status. A page body has at most one dark band and never one directly above the footer (Production landing: the livestream row went to the default tone, the event-support band stays dark). Details: `docs/FRONTEND_ARCHITECTURE.md`, "Section bands".

## 2026-11-19 — One landing hero

Owner direction: the hero images of every landing page have the shape of the main-site home hero, and the heading is on at least four lines so the text is about as tall as the photos. The shared recipe `PhotoTrioHero` (`packages/ui/src/components/content/PhotoTrioHero.astro`) now renders the main-site home, Academy, Worship and Production landing heroes: a full-height band, the tall photo trio in seven twelfths, the heading and buttons in five twelfths, photos first when stacked, and a narrow heading measure from `lg` (`--container-landing-heading`, 6.6em, or the narrow 6em for headings of short words such as "Better Tools."). Apps pass only the heading, accent, buttons and three photos. Production now shows three production photos (sound console, camcorder, stage lighting) instead of one portrait. Details: `docs/FRONTEND_ARCHITECTURE.md`, "Landing hero".

## 2026-11-19 — No public email address for now

Owner direction: "Do not show the email and remove the emails shown for now." Every visible address (`hello@gamostudio.org`) was replaced by the contact form until the owner chooses a public address in the next deploy: page copy, notices, error messages, the FAQ answer, the legal texts and their footers, the Academy messages and the receipt and sign-in-link email bodies ("Questions? Reply to this email."). The `EmailUsBlock` card was removed from `/contact` and `/partners/interest`, which already carry the form. The staff inbox (`INQUIRY_INBOX_EMAIL`, a secret) is never shown. Sender and Reply-To addresses (`packages/config/brand.ts`, `packages/integrations/src/resend.ts`) are unchanged. The legal texts changed, so the terms version moved to `2026-11-19-draft.5` with new content hashes.

## 2026-11-20 — Form wizard

Public forms now show one screen at a time, a card with a photo, built on the server-rendered form renderer.

- **Approach A.** We enhance the server-rendered `DynamicForm` instead of building a client-side form app. All questions are in the HTML, so the form works without JavaScript; the script only hides all but one screen. No partial answers are stored: nothing is saved until the final submit.
- **Markup contract.** The renderer emits `data-wizard` (form), `data-wizard-section`, `data-wizard-screen`, `data-wizard-card`, `data-wizard-controls`, `-back`, `-next`, `-progress`, `-status`, `-live` and `-final`; the client adds `data-wizard-ready` and `data-wizard-active`. The photos use `data-wizard-photo` and `data-wizard-photos`. The client reads only these attributes, never class names. `data-wizard-off` turns the wizard off.
- **Screen rule.** One question per screen; up to three from the same section; heavy questions (paragraphs, file uploads, grids, checkboxes, scales, links, long choice lists) stand alone. `screenItems` and `buildScreens` (`packages/ui/src/lib/dynamic-form-wizard.ts`) apply it.
- **Positional consents.** Consent questions are recognised by position (the last screens), not by a schema marker, so stored forms need no migration.
- **Header kept, footer dropped.** Form pages use `BaseLayout` with `footer={false}`: the header stays, the footer goes.
- **Promoted to `packages/ui`.** `WizardCard` and the kind-keyed `formPhotosFor` live in `packages/ui` because the admin preview is the second user of the wizard (AGENTS rule 6: promote on second use).
- **Local seed.** `pnpm forms:seed:local` seeds the forms into the local database for the browser checks.
- **Research (first, per the owner rule).** GOV.UK Design System question pages and "one thing per page" (one question by default, group only when it helps, "Question 3 of 5" text); Visa and Trimble accessible wizard guidance (focus to the new heading, polite live region, `aria-current="step"`, keep data when going back); Formspree on fieldsets, formwizard and Smashing on multistep forms (steps as fieldsets, everything visible without JS, validate per step). We compared a client-rendered wizard (B) with enhancing the server-rendered form (A) and chose A for the no-JavaScript fallback and a single validation path on the server.
- **Open:** history `#step-n` behaviour: to be verified in the browser (Task 9).

## 2026-11-20 — Four new forms: teach, host, volunteer, Academy interest

The site used to send teaching, church-hosting and volunteering enquiries to the contact form. They now have their own staff-editable forms (default slugs `academy-teach`, `academy-host`, `volunteer`, `academy-interest`), so the ten defaults are: worship-apply, worship-request, production-apply, production-request, contact, partner-interest and these four. Pages: `/academy/teach`, `/academy/host`, `/academy/interest` and `/get-involved/volunteer` on the main site.

- **New kind `instructor_application`.** The teach form approves into the private roster with program `academy`. Both `APPLICATION_KINDS` lists (`packages/domain/src/forms/service.ts` and `packages/domain/src/worship/roster.ts`) were extended, not unified; unifying them is a possible cleanup.
- **Inbox-only forms reuse existing kinds.** Host uses `partner_interest`; volunteer and Academy interest use `contact`. They only need staff review in the inbox, so no schema change or migration was needed.
- **Slug-aware photos.** `formPhotosFor(kind, slug?)` in `packages/ui` picks photos by slug first and by kind otherwise, so forms sharing a kind can still have their own photos.
- **Admin action "Add the new default forms".** `seedDefaultForms` skips slugs that already exist and admin only seeds when the list is empty, so a database that already has the six old forms would never get the new ones. The button is owner-triggered, idempotent and attributed to the signed-in staff member. It shows only when some default is missing. Staff cannot delete a default form or rename its slug, so "missing" means absent.
- **`roster.can_teach`** is bound through the required single-option "Yes" question ("Are you applying to teach lessons?"), so every approved instructor is flagged as able to teach.
- **Role vocabulary.** The instructor form's role words (Piano, Guitar, Bass, Drums, Voice, Strings, Other) differ from the musician roster vocabulary (for example Keys, Sound). Staff should keep this in mind when searching the roster.
- **Open:** partial seeding is not self-healing. Creating a form, saving its draft and publishing it are separate steps, so a failure in between can leave a form created but unpublished; the button's "missing" test sees an existing slug and does not repair it. Staff can publish it from the form's page.

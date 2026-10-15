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

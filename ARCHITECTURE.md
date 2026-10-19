# Gamo Studios — Technical Architecture

<!-- status-banner: 2026-10 foundation pass -->
> **Superseded for current structure by [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md);** this file keeps the original constraints. Legal status: Gamo Studios is a Christian, mission-driven **Public Benefit Corporation** — not a nonprofit and not tax-exempt. Where this file says "nonprofit", "tax-exempt", "charitable" or "legal-structure-neutral", the PBC statement in [AGENTS.md](AGENTS.md) prevails.

**Status:** proposed architecture and build constraints; verify vendor APIs and dependencies at implementation time.

**Organizational context:** Gamo Studios is a Christian, mission-driven organization whose final legal incorporation structure and tax status remain undecided (legal-structure-neutral). The software exists to support connected religious, educational and community programs, not to maximize transaction revenue. Organizational purpose, fee philosophy and funding sources are defined in [docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md); this document covers technical boundaries only.

## System model

### Cloudflare Backend & API Foundation — 2026-10-13 (Audit-Reconciled)

> [!IMPORTANT]
> Earlier pre-audit statements claiming end-to-end backend completion or live webhook fulfillment have been removed per [`docs/BACKEND_INDEPENDENT_AUDIT.md`](docs/BACKEND_INDEPENDENT_AUDIT.md) and [`docs/BACKEND_RELEASE_READINESS.md`](docs/BACKEND_RELEASE_READINESS.md). Production release remains **NO-GO** until all release gates in [`docs/BACKEND_RELEASE_READINESS.md`](docs/BACKEND_RELEASE_READINESS.md) pass.

The backend foundation uses Cloudflare-native primitives with strict safety gates:
- **Cloudflare D1**: Serverless SQLite relational database with tracked migrations (`0000`–`0004`), foreign keys, and SQLite triggers enforcing atomic registration capacity, immutable fields, and one-time moderation transitions.
- **Shared Authentication (`@gamo/auth`)**: Native Web Crypto session manager with HMAC-SHA256 signed host-only `HttpOnly` cookies (`__session`), verified email challenges (`auth_challenges`), multi-tenant organization onboarding, Cloudflare Access `sub` staff identity binding (`external_identities`), and server-side RBAC + same-origin CSRF guards.
- **R2 Storage Abstraction (`@studio-gamo/integrations`)**: Scoped upload authorization tickets, prefix ownership checks, MIME/magic-byte spoofing rejection, no-overwrite semantics, and quarantine-by-default for non-public metadata. Sensitive student and identity documents are never collected.
- **Contract-First API & Domain Services (`openapi/root.yaml`, `@gamo/api-contracts`, `@gamo/domain`)**: OpenAPI 3.1.1 is the source of truth, backed by generated TypeScript types, standalone Ajv Worker validators, and Zod domain validation.
- **Protective Stripe Sandbox Gates**: Live Stripe keys and `livemode: true` events are rejected (`400`/fatal error). Paid checkout (`POST /api/checkout/session`) and financial webhook events (`checkout.*`, `charge.*`, `payment_intent.*`, `refund.*`) fail closed with `503 Service Unavailable` until authoritative order and inventory hold tables are built.
- **Gamo Live Free Registration & Durable Outbox**: Organizer event proposal (`pending_review`) → staff moderation (`approved`/`rejected`/`revision_requested`) → public discovery → atomic free attendee registration → transactional `notification_jobs` outbox and worker consumer delivery via Resend. See [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md) and [`docs/API_INVENTORY.md`](docs/API_INVENTORY.md).

```
                  gamostudio.org (organization hub + entry + account)
                                    |
           +------------------------+-------------------------+
           |                        |                         |
    worship.gamostudio.org   academy.gamostudio.org    live.gamostudio.org
           |                        |                         |
       production.gamostudio.org    (admin.gamostudio.org: app removed, rebuilding)
           \_______________________|_________________________/
                       Shared domain model, identity,
                  permissions, design and adapters
                              |
               Cloudflare Workers + Astro SSR
               D1 / R2 / Durable Objects / Queues
                              |
                    Stripe Connect / Resend
```

## Monorepo layout — target

```
apps/
  web/          # organization hub: mission, programs, partnerships, support pathways
  worship/      # Gamo Worship: church & musician coordination
  academy/      # Gamo Academy: lessons, classes, sponsored programs
  live/         # Gamo Live: Christian event discovery, registration, authorized ticketing
  production/   # Gamo Production: technical support program for churches
  admin/        # governance, staff operations, program administration, stewardship
packages/
  ui/           # design tokens and accessible primitives
  domain/       # business rules, types, validation
  db/           # D1 schema, queries and migrations
  auth/         # session verification, RBAC, identity
  integrations/ # Stripe, Resend, maps, video, ID provider adapters
  config/       # shared TypeScript / lint configs
infra/          # Wrangler configuration, domain/routing notes
scripts/        # check, seed, migrations and verification
```

An agent may consolidate deployables initially to reduce complexity, **but must maintain package/service boundaries** and describe how eventual subdomains map to them. Prefer pnpm workspaces unless evidence justifies another choice. Keep SSR and browser-only components distinct. Avoid coupling UI components to Cloudflare bindings.

## Deployment and routing

- Public applications are Astro SSR deployed to Cloudflare Workers with official currently-supported Astro adapter/scaffold.
- Each domain resolves to the correct deployment when DNS is approved; local development must work without owning or configuring production DNS.
- Shared session design must be deliberate: secure HttpOnly/Secure cookies, CSRF defenses, appropriate SameSite/domain settings, session renewal/revocation, and server-side authorization. Do not assume Cloudflare Access is appropriate for consumer authentication; it is suitable as an additional internal admin gate.
- Role permissions must be enforced server-side for every route/API mutation; hiding navigation links is never authorization.
- Account roles are not mutually exclusive: e.g. a musician may also be student/organizer. A single user can belong to multiple organizations.

## Core D1 entities (minimum logical model)

```
users(id, email, verified_email_at, status, created_at)
identities(id, user_id, provider, provider_subject, verified_at)
sessions(id, user_id, expires_at, revoked_at)
roles(id, code)
user_roles(user_id, role_id, scope_type, scope_id)
organizations(id, name, type, status)
organization_members(id, org_id, user_id, role)
musician_profiles(id, user_id, status, bio, home_zone, travel_radius_miles)
musician_skills(id, musician_id, instrument, primary_flag, proficiency)
musician_styles(id, musician_id, style, custom_label)
musician_notation(id, musician_id, notation_type)
applications(id, musician_id, step, status, submitted_at)
identity_verifications(id, user_id, provider_reference, state, verified_at)
auditions(id, musician_id, instrument, external_url, repertoire_id, review_status)
audition_reviews(id, audition_id, reviewer_id, criteria_json, outcome, reviewed_at)
churches(id, organization_id, service_zone, contact_user_id)
gigs(id, church_id, plan, starts_at, ends_at, rehearsal_at, status, location_zone)
gig_positions(id, gig_id, instrument, requirements_json, status)
gig_assignments(id, position_id, musician_id, kind, status, confirmation_deadline)
checkins(id, assignment_id, status, recorded_at)
dispatch_events(id, assignment_id, backup_assignment_id, event_type, created_at)
bookings(id, customer_user_id, scope_type, scope_id, status, total_amount, currency)
payment_records(id, booking_id, provider, provider_object_id, state, idempotency_key)
payout_records(id, payee_user_id, payment_record_id, amount, state)
lesson_offerings(id, instructor_id, format, duration_minutes, rate_amount, status)
lesson_sessions(id, offering_id, student_id, starts_at, status)
clinics(id, host_organization_id, instructor_id, capacity, starts_at, status)
events(id, organizer_organization_id, venue_id, starts_at, status)
ticket_tiers(id, event_id, name, price_amount, capacity)
ticket_orders(id, event_id, buyer_id, status, total_amount)
tickets(id, order_id, tier_id, status, credential_hash, checked_in_at)
seat_holds(id, event_id, seat_key, expires_at, state)
audit_logs(id, actor_id, action, entity_type, entity_id, metadata, created_at)
```

This is a **logical inventory**, not a finished migration. Agents must normalize, define indexes/constraints, select explicit money units (integer minor units), enforce referential integrity and build migrations in dependency order. Sensitive identity artifacts belong in access-controlled vendor systems or private storage with retention policy, not plaintext D1 columns. Use UTC storage and named local timezone for church event display/call times.

## Worship application flows

### Musician application
`/apply/start` → `/apply/identity` → `/apply/profile` → `/apply/logistics` → `/apply/audition` → `/apply/status`

- Server-side validation and resumable drafts; instrument/style/notation fields must support multiple selections.
- Webcam capture is a UX input, not proof of liveness or ID validity. Use a qualified verification provider for real decisions; provide a **clearly marked sandbox stub** until integrated.
- Audition uploads are **external unlisted links** in the planned workflow; validate URL domain, sanitize and restrict embed behavior, and verify reviewers' access.
- Travel radius and zones are approximate discovery filters, not guaranteed ETA. Collect the minimum required location information.
- Audition states: draft, submitted, needs_clarification, approved, rejected; record staff decisions and reasons.

### Church booking
`/hire/plan-selection` → `/hire/gig-details` → `/hire/repertoire` → `/hire/checkout` → `/hire/success`

- Plans: Spot Fill (single weekend), Monthly (four weekends), Quarterly (twelve weeks). Display **proposed** amounts only in development data; do not publish unapproved prices or fees.
- Every engagement records the **musician's agreed pay** and any **Gamo administrative allocation** as separate, labeled line items. No deduction from musician pay may be implemented until the mechanism is approved (see [docs/GAMO_NONPROFIT_MODEL.md §3.1](docs/GAMO_NONPROFIT_MODEL.md#31-gamo-worship)).
- Church records must be protected by membership permission checks; setlists and charts may include licensed/copyrighted materials — restrict storage and access.
- Checkout success must be established by verified server-side Stripe webhook events, not a redirect URL alone.
- Booking fulfillment and musician assignment are separate statuses. Never show a booking as staffed before confirmed assignment.

### Standby / Sunday operations
- Primary musician has an explicit confirmation/check-in requirement; timing must be relative to each gig's timezone and call time, not a hardcoded universal 7 AM.
- Backup is a **paid opt-in assignment**, within suitable geography and repertoire, not silently assigned or portrayed as guaranteed available.
- Missed check-in triggers a job and idempotent dispatch escalation; use Durable Objects or transactionally coordinated D1 state for one active dispatch winner, retry handling, audits and admin override.
- Emergency UI shows call time, direct contact, navigation deep link, charts and explicit ACCEPT/DECLINE/EN ROUTE/ARRIVED states; track acknowledgments.
- Critical attendance promises require operational staffing and contract terms; do not write a 'zero-failure' public guarantee.

## Academy flows
- Discovery; instructor profiles and availability; private lessons in 30/45/60 minute offerings; church-hosted classes and clinics; sponsored and scholarship-supported enrollments; student/guardian registration and receipts; facility-host and sponsor intake.
- Primary audience is students, parents and families; church hosting/sponsorship is a secondary pathway.
- Instructor eligibility for minors must be policy-gated; background screening and consent/guardian workflows cannot be silently mocked as verified.
- An enrollment may be funded by tuition, sliding-scale tuition, a sponsor, a scholarship fund or a combination. Represent funding sources and instructor pay as separate ledger rows, independent of provider payout state. Tuition and instructor-pay policy are pending approval.

## Gamo Live flows
Gamo Live serves **Christian events nationwide** with two audiences (see [docs/GAMO_LIVE_AND_PARTNERS.md](docs/GAMO_LIVE_AND_PARTNERS.md)). Event eligibility is enforced by staff moderation against the approved content policy.

**Attendee (Explore Events):**
- Event discovery by location, date, organizer, type and free/paid, with user-controlled location fallback; IP-based location is approximate and opt-outable.
- Event, ticket tier, inventory, cart, Checkout, QR ticket, free-event registration, "my tickets". Prices, fees, refund policy and organizer identity are shown before purchase.
- **Do not use Cloudflare KV as the sole seat lock.** Use a Durable Object per event/inventory shard or equivalent serialized transactional reservation authority; expiry via alarms/job; commit inventory only after verified payment confirmation.
- QR codes must be unpredictable, scoped, revocable and single-use for admission. Do not expose raw personally identifying data in token payloads.
- Multiple scans must be idempotent and guarded against races; maintain audit trail and offline policy.

**Organizer (Promote Event):**
- `/promote` landing → event submission → organizer identity/authority verification → staff review → published → reports. Optional promotion request (website, social, partner communications, creative) is a separate, staff-managed step.
- Paid ticketing is enabled only when organizer authorization is recorded (`ticketing_authorized_at`, evidence reference).
- Promotion is a **managed service**: staff run campaigns manually. No third-party ad-platform API is assumed connected; any future integration sits behind an `integrations` adapter and requires approval.
- Organizer panel: events, recurring schedules, ticket tiers, registrations, scanner access, updates/cancellations, attendance and ticket reports, promotion status.

## Placements & dynamic homepage (future)
- Homepage hero and featured slots are driven by placement records, not hardcoded slides. **No carousel without explicit approval.**
- Selection inputs: event date, campaign window/expiry, approximate location, editorial priority and mission priorities; capped sponsored density.
- Every placement has a `kind` of `sponsored | editorial | gamo_program`, rendered as a visible label.
- Ranking/vetting data for musicians is in a separate domain that promotion, sponsorship and partnership code **cannot** read or write.
- Design phase: static, clearly labeled example content only.

## Financial architecture (nonprofit, conceptual)
The ledger supports nonprofit accounting and must keep these categories distinct (definitions in [docs/GAMO_NONPROFIT_MODEL.md §5.3](docs/GAMO_NONPROFIT_MODEL.md#53-money-categories-the-platform-must-distinguish)):

| Category | Examples | Notes |
| --- | --- | --- |
| `charitable_contribution` | donations, gifts | `fund_id` + restricted/unrestricted; no processing until approved |
| `sponsorship` | program or event sponsorship | may carry recognition benefits; treatment pending review |
| `program_service_receipt` | tuition, Worship administrative allocation, ticketing admin fee, production cost recovery | each tied to a program |
| `third_party_payable` | musician pay, instructor pay, organizer ticket proceeds, organizer-funded media budgets | **not organizational income** |
| `processing_cost` | processor fees | expense |
| `refund` / `dispute` | reversals, chargebacks | adjustments |

- Every row carries `program` (`worship | academy | live | production | general`) for program-level budgets and board reporting.
- Musician and instructor pay are never netted against Gamo allocations inside a single amount.
- Stripe Connect is the intended payout rail; Stripe is **not** regulated escrow and must not be described as such.
- Any fee, contribution amount or tier remains a configuration value set by approved policy, never a hardcoded assumption.

### Commercial assumptions to reconsider (2026-10-12 audit)
| Earlier assumption | Disposition |
| --- | --- |
| Platform commission maximization on bookings | Replace with configurable, disclosed administrative allocation (pending approval) |
| Automatic deductions from musician earnings | Do not implement; keep `third_party_payable` musician pay separate |
| "Marketplace escrow" | Never; describe as payment processing and scheduled payouts |
| Commercial subscription tiers (`memberships.plan_code`, credits) | Replace with partnership/contribution records; no tiers without approval |
| Advertising revenue as a core stream | Reframe as optional promotion service with cost recovery |
| Revenue-based promotion rankings | Prohibited; placements labeled and density-capped |
| Inflexible fee structures | Fees configurable per program and waivable for free/sponsored gatherings |

Existing payment and database foundations (D1 schema, auth, Stripe adapters) are retained; only their conceptual categories change.

## Production and admin
- Production: technical support for churches and ministries — worship audio, livestreaming, lighting, technical training, volunteer development, portfolio/case studies (real work only), consultation intake, optional event creative. Do not fabricate client results.
- Admin: staff-only audition review, identity-verification decision status (no ID scans for churches), gig and dispatch radar, incident history, **program ledger and fund tracking, board financial reports**, audit logs, **event moderation & organizer verification, promotion intake, placement scheduling, ticketing oversight, church partnership and contribution records**.

### Additional logical entities (proposed)
```
organizer_profiles(id, organization_id, kind, verification_status, ticketing_authorized_at)
event_registrations(id, event_id, user_id, status)
event_schedules(id, event_id, recurrence_rule, timezone)
promotion_requests(id, event_id, organization_id, scope_json, status, starts_at, ends_at)
promotion_channels(id, promotion_request_id, channel, external_reference, status)
promotion_metrics(id, promotion_request_id, date, views, clicks, registrations, ticket_sales)
placements(id, slot, kind, target_type, target_id, priority, region, starts_at, ends_at, status)  -- kind: sponsored | editorial | gamo_program
church_partnerships(id, organization_id, participation_json, status, started_at)              -- no tiers/prices until approved
funds(id, name, restriction, program, status)                                                  -- restricted | unrestricted
contributions(id, contributor_type, contributor_id, fund_id, kind, amount, currency, received_at) -- kind: donation | sponsorship | in_kind
sponsorships(id, sponsor_organization_id, program, target_type, target_id, fund_id, status)
enrollment_funding(id, enrollment_id, source, fund_id, amount, currency)                          -- tuition | sponsor | scholarship
ledger_entries(id, category, program, fund_id, scope_type, scope_id, amount, currency, created_at)
```

## Integrations / infrastructure

| Capability | Implementation policy |
| --- | --- |
| Payments | Stripe Connect; choose charge/payout pattern after researching applicable countries, funds flow and requirements. Do not call it escrow. |
| Payment safety | Webhook signature verification, event dedupe, idempotency keys, no card data on server. |
| Email | Resend server-side only; domain verification and test sending; log deliveries without storing message secrets. |
| Files | R2 for authorized assets, presigned/short-lived access, content type/size controls and retention. |
| Coordinate locks | Durable Objects/transactional data, not eventual KV inventory locks. |
| Jobs | Cloudflare Queues or documented jobs design for dispatch/email retry and background processing. |
| Maps | Cloudflare-compatible map provider behind adapter; don't assume Cloudflare provides full map UI/routing. |
| Telemetry | Redacted structured logs, error reporting and auditable operational events. |
| Auth | Choose currently maintained Cloudflare-compatible solution; document alternatives, threat model, session design and tests. |

## Environments and secrets
- `local`, `preview`, `production`, independently scoped D1/R2/DO resources and Stripe modes.
- Maintain `.dev.vars.example` with placeholders only. Real secrets remain in Cloudflare secrets and ignored local secret files.
- Never automatically promote schema migrations/data from development to production.
- Local development must offer seeded sample churches/musicians/events clearly labeled **demo**.

## Definition of deployable
An application is deployable only after real tests, verified migrations, access controls, webhook verification, secret management, observability, rollback documentation, and user approval for external deployments.

## Component-First Architecture & Development Workflow

Gamo Studios strictly follows a **component-first architecture** to ensure UI scalability, maintainability, and visual consistency across all applications.

### 1. Architectural Principle
**Pages compose components. Components implement interfaces. Shared packages provide reusable building blocks.** 
Large monolithic page files are prohibited.

### 2. Levels of Reusability

- **Level 1 (Shared UI Primitives)**: Located in `packages/ui/src/components/`. Contains highly reusable components like `Button`, `Card`, `Badge`, `Container`, and `SectionHeading`. These enforce the Gamo Studios design tokens (Inter, terracotta, charcoal, cream).
- **Level 2 (Application-Specific Components)**: Located in `apps/<app-name>/src/components/`. Contains components specific to a single application's domain (e.g., `MusicianProfileCard`, `AuditionPreview`, `StandbyAssignment`).
- **Level 3 (Page-Specific Sections)**: Large sections of a page (e.g., `HeroSection.astro`, `WorshipCoverageSection.astro`) must be extracted into their own components within `apps/<app-name>/src/components/<page-name>/` and composed in the page file.

### 3. Component Development Rules
- Ensure components have explicit, typed interfaces (Props).
- Use Astro slots to separate structure from content.
- Keep data fetching and business logic separated from presentation components when practical.
- Avoid repeating generic Tailwind classes across multiple files; abstract them into reusable variants.
- Do not extract components merely to reduce line counts; extract them to improve clarity, reuse, maintainability, or independent testing.

### 4. Shared Packages and Workspaces
- `packages/ui` is the central repository for the design system.
- Application workspaces (`apps/web`, `apps/worship`, etc.) must depend on `packages/ui` rather than duplicating basic elements.
- Introduce client-side JS (React, Vue, or Vanilla islands) only when interactions demand it, maintaining Astro's static-first approach for presentation.

## Authoritative HTTP contracts — 2026-10-13

All REST work is now contract-first: [openapi/root.yaml](openapi/root.yaml), then generated `@gamo/api-contracts` types and Worker validators, then routes/services and HTTP contract tests. See [docs/OPENAPI_ARCHITECTURE.md](docs/OPENAPI_ARCHITECTURE.md) and the corrected [docs/API_INVENTORY.md](docs/API_INVENTORY.md). Keep six apps and domain-owned origins; no central API deployable is added.

The earlier “fully wired / end-to-end verified” backend wording above describes service tests, not a proven production/browser workflow. Verified identity login, real Access-to-D1 staff identity mapping, domain staff authorization, capacity-safe registration and full payment fulfillment remain incomplete. Node SQLite is isolated in `@gamo/db/testing`; Workers require a real D1 binding. Contract tests use isolated local HTTP handlers/middleware and SQL migrations, without production changes or real provider calls.

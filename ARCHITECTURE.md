# Gamo Studios — Technical Architecture

**Status:** proposed architecture and build constraints; verify vendor APIs and dependencies at implementation time.

## System model

```
                  gamostudios.com (brand + entry + account)
                                    |
           +------------------------+-------------------------+
           |                        |                         |
    worship.gamostudios.com  academy.gamostudios.com  live.gamostudios.com
           |                        |                         |
       admin.gamostudios.com   production.gamostudios.com
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
  web/          # global brand hub
  worship/      # church & musician marketplace
  academy/      # lessons / clinics
  live/         # ticketing
  production/   # agency site
  admin/        # private operations
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

- Plans: Spot Fill (single weekend), Monthly (four weekends), Quarterly (twelve weeks). Display **proposed** fees only in development data; do not publish unapproved prices.
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
- Discovery; instructor profiles and availability; private lessons in 30/45/60 minute offerings; church-hosted clinics; student booking/receipts; facility-host intake.
- Instructor eligibility for minors must be policy-gated; background screening and consent/guardian workflows cannot be silently mocked as verified.
- Instructor/host payout split is a pricing-policy decision, and must be represented by ledger rows independent of provider payout state.

## Gamo Live flows
- Event discovery with user-controlled location fallback; IP-based location is approximate and opt-outable.
- Event, ticket tier, inventory, cart, Checkout, QR ticket, organizer panel and authorized scanner.
- **Do not use Cloudflare KV as the sole seat lock.** Use a Durable Object per event/inventory shard or equivalent serialized transactional reservation authority; expiry via alarms/job; commit inventory only after verified payment confirmation.
- QR codes must be unpredictable, scoped, revocable and single-use for admission. Do not expose raw personally identifying data in token payloads.
- Multiple scans must be idempotent and guarded against races; maintain audit trail and offline policy.

## Production and admin
- Production: marketing, portfolio/case studies (real work only), consultation intake; do not fabricate client results.
- Admin: staff-only audition review, identity-verification decision status (no ID scans for churches), gig and dispatch radar, incident history, finance ledger, audit logs.

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

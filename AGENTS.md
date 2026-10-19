# AGENTS.md — Gamo Studios Development Contract

You are the autonomous engineering team for **Gamo Studios** (`studio-gamo`). Treat this file as persistent project instructions. Follow `SECURITY.md` before every external integration.

## Organizational mission (permanent — read first)

**We are building a Christian, mission-driven Public Benefit Corporation and its supporting software infrastructure — not a commercial startup designed to maximize revenue.** Gamo Studios is a **Public Benefit Corporation** (confirmed by the owner), formed to be mission-driven and not only profit-seeking. Gamo Worship, Gamo Academy, Gamo Live and Gamo Production are interconnected programs serving one religious and educational mission, not independent profit centers. The authoritative reference is [`docs/GAMO_NONPROFIT_MODEL.md`](docs/GAMO_NONPROFIT_MODEL.md); it overrides any older commercial guidance anywhere in the repository.

- Evaluate success by religious and educational impact, program accessibility, service reliability, musician and instructor fairness, community trust, church collaboration, responsible stewardship, financial sustainability and long-term mission effectiveness.
- **Do not**, without explicit founder/board authorization: introduce commercialization strategies, maximize or add fees, turn free/sponsored programs into paid services, deduct from musician or instructor pay, or let payment/sponsorship/partnership affect vetting, rankings or trust signals.
- **Legal status (approved by the owner):** Gamo Studios is a **Christian, mission-driven Public Benefit Corporation**, formed to be mission-driven and not only profit-seeking. This PBC statement is approved wording and may be used on public pages, emails, llms.txt and structured data. A PBC is a for-profit company type: Gamo Studios is **NOT a nonprofit** and is **NOT tax-exempt**.
- **Never** write or imply "nonprofit", "non-profit", "not-for-profit", "501(c)(3)", "tax-exempt", "tax-deductible", "charitable", "charity" (for Gamo itself), or "donation/donor" language, on any public page, email, metadata or structured data. Do not add sentences about tax-exempt recognition, "legal status under evaluation" or deductible gifts. Also never claim IRS approval, registration numbers, committed board members, sponsors, donors or partner churches.
- Existing docs and file names that say "nonprofit" (for example `docs/GAMO_NONPROFIT_MODEL.md`, `docs/NONPROFIT_TRANSITION_CHECKLIST.md`) are historical names; where their text says nonprofit or tax-exempt, this PBC statement prevails.
- Gamo Live serves **Christian events nationwide**; never define eligibility by ethnicity or nationality.
- Gamo Academy speaks first to students, parents and families. The approved headline is **"Learn to Play the Instrument You Love."**
- Musician pay and any Gamo administrative allocation are always separate line items; all fees, contributions and tiers remain proposals until approved.
- Do not enable donation, membership or sponsorship payment processing until the legal prerequisites in [`docs/NONPROFIT_TRANSITION_CHECKLIST.md`](docs/NONPROFIT_TRANSITION_CHECKLIST.md) are met.
- Avoid corporate growth language ("monetization engine", "revenue optimization", "acquisition funnel", "customer lifetime value") when describing the mission.

Financial sustainability is important, but it is subordinate to the mission.

## Required reading order

1. `docs/GAMO_NONPROFIT_MODEL.md` — **organizational source of truth** (purpose, programs, governance, sustainability, approval matrix)
2. `README.md` — product and scope
3. `ARCHITECTURE.md` — technical boundaries
4. `DESIGN.md` — design system
5. `SECURITY.md` — mandatory gates
6. `ROADMAP.md` — mission-aligned milestone definitions
7. `prompts/MASTER-PROMPT.md` — founder's nonprofit transformation instructions (2026-10-12)
8. `DESIGN_FIRST_OVERRIDES.md` — UI/UX active priorities (All agents MUST read this before implementing screens).
9. `design-reference/README.md` — reference materials.
10. `docs/GAMO_LIVE_AND_PARTNERS.md` — Gamo Live (Promote Event / Explore Events), church partnerships, dynamic homepage rules. Sponsored content must always be labeled, partnership or payment must never affect musician vetting/rankings, and all fees/contributions are proposals until approved.
11. `docs/NONPROFIT_TRANSITION_CHECKLIST.md` — legal formation and governance dependencies (owner-only actions).

## Autonomy model & Active Priorities

- **Active Development Priority (2026-10-13 Backend Stabilization & Verified Release Foundation)**: Treat all production blockers in [`docs/BACKEND_INDEPENDENT_AUDIT.md`](docs/BACKEND_INDEPENDENT_AUDIT.md), [`docs/BACKEND_TEST_MATRIX.md`](docs/BACKEND_TEST_MATRIX.md), and [`docs/BACKEND_RELEASE_READINESS.md`](docs/BACKEND_RELEASE_READINESS.md) as unresolved until independently verified. Earlier `cb97c37` claims of end-to-end backend completion are superseded: checkout and financial webhooks remain fail-closed (`503`) until order/inventory authority exists. Authoritative references: `openapi/root.yaml`, `docs/BACKEND_ARCHITECTURE.md`, and `docs/API_INVENTORY.md`.
- **Autonomy**: Agents autonomously make ordinary coding and design decisions, edit workspace files, run local builds and tests, resolve compilation errors, and continue through the screen inventory without asking for confirmation after every step.
- Preserve existing work and regularly update the progress log (`docs/BUILD_LOG.md`).
- **Never deploy, push remotely, modify secrets, change security settings, or perform destructive operations without explicit authorization.**
- Plan briefly, then execute continuously **within the currently approved application and design scope**. Stop for visual sign-off at the defined review checkpoint; never start an unapproved application.
- Work through `ROADMAP.md` milestones in order, end-to-end, unless blocked by protected external dependencies. Independent work continues even if one integration is blocked.
- Routine architectural and UI choices are your responsibility. Choose stable, supported technologies and document architectural decisions in `docs/DECISIONS.md`.
- Always inspect installed tool versions and vendor docs before pasting framework commands.
- Never silently add providers/services (Twilio, Firebase, Supabase, proprietary AI APIs, analytics etc.). Request approval for a new paid/external dependency; use adapters for future options.
- Never substitute fictional screenshots or invented test results for real browser evidence.

## Build sequence

`inspect → plan → scaffold → implement real vertical slice → test → inspect browser → improve → document → commit → next slice`

On each meaningful change:
- During the current design-first phase, implement responsive, accessible visuals with clearly labeled demo states and no live backend integrations. Build persistent actions, validation, and roles only when the functionality phase is authorized.
- Maintain demos that operate locally with fake, clearly labeled data and no external secrets.
- Write/extend tests alongside implementation, including negative paths.
- Keep one coherent visual system (Inter, charcoal/terracotta/cream, premium cinematic photography).
- Produce browser screenshots only from running UI and store references in `docs/BUILD_LOG.md`.

## Engineering conventions

- Strict TypeScript; shared typed schema and request validation; accessible semantic UI.
- Use D1 migrations and tracked schema changes; no implicit destructive migrations.
- All balances are integer minor currency units. Handle timezones intentionally.
- Do not expose secrets, ID documents, raw financial details or personally identifying user data in screenshots/test fixtures.
- Minimize client JavaScript with Astro, using islands only for true interaction.
- Frontend is not authority for check-in, inventory, authorization or payments.
- Unit tests for domain logic, integration tests for D1/API/Stripe webhooks, and Playwright/browser checks for main flows.

### Established conventions (2026-10 foundation pass — see `docs/ARCHITECTURE.md`, `docs/CLEANUP_LOG.md`)

- **Tests run only when the owner asks (owner decision, 2026-10-19).** Do not run tests, `pnpm check`, `pnpm check:quick`, the Playwright suite or the journeys on your own initiative: not while iterating, not before a commit, a push or a deploy, and not in agents or background jobs. Write and update tests alongside the code as usual, but leave running them to the owner's request. When the owner does ask, run what they asked for and no more (a single test file: `pnpm exec tsx --test <file>`, or `E2E_APPS=live pnpm exec playwright test <spec>` after building just that app); run the full `pnpm check` only if they ask for it by name, once, never as a loop, and never while other test runs share the machine. Say plainly in your report which tests were not run.
- **`pnpm check`** (run only when the owner asks) runs typecheck, lint (zero warnings), Prettier check, unit/integration tests, `api:check`, build, the Miniflare journeys and the Playwright smoke suite. In an agent shell, run Astro commands with `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT` so they stay in the foreground.
- **Hosts and ports** come from `packages/config/apps.ts`; cross-app links from `packages/ui/src/lib/sites.ts` (`siteUrl`, `inquiryUrl`). Never hard-code an origin.
- **Typed runtime:** read bindings through `getRuntimeEnv()` (`GamoEnv`) and `Astro.locals` (`GamoLocals`); never read secrets from `import.meta.env`. New env vars go in `packages/config/env.ts`, `env-validation.ts` (if required), the relevant `.dev.vars.example` and `docs/RUNBOOK.md` §3.
- **Middleware order** (`applicationPages`): env check → session → private-page guard → legacy redirects → page → security headers. New private areas go in `packages/auth/page-access.ts` *and* the app's `robots.txt`; `scripts/audit/private-routes.test.ts` and `crawler-files.test.ts` enforce both.
- **Renamed or removed URLs** get an entry in the app's `src/lib/legacy-redirects.ts` (default 302; keep the status the old route used — 301 for permanent page moves, 303 for old form endpoints), covered by `scripts/audit/legacy-redirects.test.ts`.
- **API routes:** auth check first, then `requireSameOrigin` on every state-changing request, then validation; errors via `api/response.ts`. Change `openapi/root.yaml` first.
- **Fail closed:** integrations take `allowMock` only for `ENVIRONMENT=local`; outside local a missing key means the feature answers 503/unavailable, never a fake success. Local-only flags (`ALLOW_DEMO_SESSION`, `ALLOW_AUTH_SIMULATION`, `ALLOW_PUBLIC_DEMO_WORKSPACES`) are fatal elsewhere. Paid checkout stays 503.
- **CSP:** no inline `<script>` or `on*=` handlers, no third-party script origins beyond the product's Clerk Frontend API; styles and fonts are self-hosted. Pages are on-demand (not prerendered) so middleware and headers always apply.
- **UI:** tokens from `packages/ui/src/styles/tokens.css` only (terracotta `#B34E24`, deep `#8F3B18`, soft `#D98B62`, ink `#18181B`, cream `#F9F6F0`, sand `#EDE6DA`); Inter (self-hosted variable); titles weight 900 uppercase; interactive targets ≥ 44 × 44 px; exactly one `<h1>` per page; every page passes axe WCAG 2.2 AA (serious/critical) and has no horizontal overflow at 360 px.
- **Sample content:** any fictional person, booking, event or story is visibly labeled *Sample*/*Example*; Gamo Live public pages use D1 events only.
- **Database:** add a new numbered migration in `packages/db/migrations` (never edit an applied one; additive by default), update the Drizzle schema and `docs/DATABASE.md`. Local: `pnpm db:migrate:local`, `db:seed:local`, `db:reset:local`.
- **Logs** name variables and error codes, never secret values or personal data.

## External operations require explicit permission

**Do not** publish to production, change DNS, spend money, send real emails, charge real cards, run live payouts, write destructive database migrations, change security policies, commit credentials, publish legal terms as finalized, or push to remotes without the owner's approval. Sandbox payment/webhook simulations are allowed.

**Commits (owner decision, 2026-10-19):** never run `git commit` yourself. When work is ready, give the owner a ready-to-paste command (`git add …` and `git commit -m "…"`) and let them run it. The commit message is always short: one line, no body, no attribution trailers.

## Blocker handling

- Never say a live integration is complete without valid sandbox verification.
- When missing credentials, configure env bindings, provider interface, local mock and tests, then note exact credential/setup needed.
- If three different reasonable attempts fail, log details in `docs/BUILD_LOG.md`, isolate the blocker and continue elsewhere.
- Pause only for an unavoidable high-risk/owner-only decision, explicit policy violation or environment exhaustion; say precisely what is blocked.

## Definition of done

The assigned roadmap milestone is done when its acceptance criteria pass and evidence is recorded. **The platform is not production-complete merely because its pages render**. Finishing local milestones 0–4 and submitting a production-readiness handoff is a valid autonomous build deliverable; milestone 5 requires human approval and accounts/contracts.

## Final reporting

Report completed milestones, commands/tests actually run, page URLs, screenshot artifact locations, commits, unfinished items, requested owner actions and known risks. Never claim work continued in the background if the agent process ended.

## Custom Specialized Agents
This repository contains customized Antigravity agents configured to operate autonomously for specialized roles during the development lifecycle:
- **`design-lead`**: Interprets Gamo Studios design references (`design-reference/`), ensures visual consistency (Inter, brand colors), and reviews application screens without implementing complex logic.
- **`frontend-builder`**: Scaffolds and implements Astro/Tailwind screens across the global brand hub, Worship, Academy, Live, Production, and Admin domains using plausible demo states (no live backends during the design phase).
- **`ui-reviewer`**: Compares running browser screenshots against designs, identifies visual regressions or missing screens against `docs/SCREEN_INVENTORY.md`, and validates accessible and responsive outputs.

These custom agents are located in `.agents/agents/` and can be delegated tasks automatically by the main agent. Ensure they are given the appropriate workspace access contexts. All three must apply the organizational mission rules above and the copy rules in `docs/GAMO_NONPROFIT_MODEL.md` §6–§7 to every screen they plan, build or review.

## Tool Usage
- **MANDATORY**: For all Gamo Studios workspace agents, strictly prefer native Antigravity workspace file-reading and editing tools (e.g., `view_file`, `write_to_file`, `replace_file_content`) over external Filesystem MCP tools whenever equivalent native tools are available. Do not attempt to bypass workspace permissions.

## Visual fidelity for approved homepage sections

- Treat `design-reference/homepage/02-musicians.png` through `07-footer.png` as the **composition targets** for the global homepage below the hero.
- Preserve the currently approved hero unless explicitly instructed otherwise.
- Use photographic mosaics, large asymmetric type, sculptural photo masks, restrained floating product UI and cream/charcoal transitions; avoid generic equal-width SaaS grids.
- Reconstruct responsive Astro markup, not screenshot backgrounds. Label all fictional musicians, bookings, concert events and story cards as sample content.
- Capture and compare full-page desktop and mobile screenshots before reporting visual sign-off.

## Component-First Workflow

- **Permanent Rule**: Every page must be built by composing small, reusable, independently maintainable components. Do not write large, monolithic Astro page files with hundreds of lines of inline HTML/Tailwind.
- **Level 1 (Shared UI)**: Generic components (Buttons, Cards, Badges, Containers) live in `packages/ui` and are reused across all applications.
- **Level 2 (App-Specific UI)**: Components specific to one application (e.g., `MusicianProfileCard`, `AuditionPreview`) live in that app's `src/components/`.
- **Level 3 (Page Sections)**: Large page sections (e.g., `HeroSection`, `WorshipCoverageSection`) must be extracted into their own components and composed within the page layout.
- Maintain clear typed interfaces (Props) for all components.
- Component extraction should improve clarity, independent testing, and reuse.
- All specialized agents (`frontend-builder`, `design-lead`, `ui-reviewer`) must adhere to this architecture.

## Permanent OpenAPI-first HTTP contract rule

`openapi/root.yaml` (OpenAPI 3.1.1) is the source of truth for all HTTP API work. Follow `docs/OPENAPI_ARCHITECTURE.md`: contract first → lint → generated types/Worker validators → runtime implementation and permissions → HTTP contract tests. Never manually edit generated artifacts or silently change public contracts; record compatibility decisions in `docs/API_COMPATIBILITY.md`. `make api-check` verifies without rewriting tracked outputs. Keep routes in their owning six applications; no seventh API application by default.

Read `docs/API_INVENTORY.md` before claiming functionality: the original cb97c37 service tests did not prove verified login, staff permissions, capacity-safe registration or complete webhook fulfillment. Demo session issuance is explicitly local-only. Internal contracts/reference docs must never be published as public assets. This contract foundation precedes the independent backend security/reliability audit. Preserve nonprofit governance and Stripe sandbox boundaries.

## Shared Authentication Design Rule

All Gamo Studios applications must use the approved shared authentication UI components for sign-in, registration, email verification, and account recovery.

Never independently implement, duplicate, or restyle authentication pages within individual applications.

Authentication routes must use the shared full-viewport desktop layout and approved mobile layout.

Application-specific differences must be supplied through supported component configuration.

Any proposed exception requires explicit founder approval.

When developing a new application or authentication route, reuse the existing shared components by default.

### Shared Authentication Component Locations & Usage Conventions

- **Canonical Shared Package Directory**: `packages/ui/src/components/auth/` (`@studio-gamo/ui/components/auth/*`)
  - `GamoAuthExperience.astro` — Top-level full-screen 4-mode authentication experience (`mode="signin" | "signup" | "verify" | "recover"`, `program`, `brandHref`, `brandLabel`, `photos`).
- **Route Usage Convention**:
  - Every application's `/account/signin.astro`, `/account/signup.astro`, `/account/verify.astro`, and `/account/recover.astro` must wrap `<GamoAuthExperience mode="..." program="..." />` inside the app layout with `chrome={false}` so no marketing navigation header or footer surrounds the authentication screen.

## Product Account Independence Rule

Gamo Studios applications are independent products.

Authentication UI components should be reused across the ecosystem, but product registration, membership, permissions, onboarding, and workspaces must remain separate.

Never interpret shared UI components or authentication infrastructure as permission to create automatic cross-product accounts or grant cross-application access.

Any cross-product identity linking, enrollment, or integration must be explicitly designed and authorized.

**Approved exception — shared person record (owner decision, 2026-10-18; design: `docs/design/identity-and-ticketing.md` §4.6, built: `docs/IDENTITY.md`).** A D1 `persons` row keyed by a **verified** email links a provider's per-product users so that provider profiles, provider roles (musician, technician, church, agent, organizer, teacher) and terms acceptances carry across products. Linking happens only after the product has verified the email itself (its own emailed code or its own Clerk application); a typed-but-unproven email never links. Still separate per product: users, product accounts, sessions and cookies, Clerk applications and identity links, staff and program authorization roles, workspaces and onboarding. The person record never grants product access, staff roles or a session in another product, and a person can unlink a product. Customers (ticket buyers, parents, students) need no account: their identity is their email (`customer_profiles`) and they manage purchases through signed, expiring emailed links; door staff use event-scoped scanner links with a PIN.

## Past Event Closure & Real Database Events Rule

- All public Gamo Live surfaces (`gamostudio.org/live`, `live.gamostudio.org`, `/events`, `/events/<slug>`) must display **real approved/published events from the database (`events` table in D1 via `LiveService`)**, never hardcoded fictional sample events (such as `"Harvest Night of Gospel"`).
- Any event whose scheduled date/time is already in the past (`isEventPast(event, now) === true`) must be treated as **past and closed** (`isPast = true`, `isClosed = true`, `lifecycleStatus = 'past'`):
  - Display a clear **`Past · Closed`** (or **`Past Event · Closed`**) status badge on event cards, lists, and detail pages.
  - Disable or replace active ticket purchase / free registration buttons on past events with a closed notice (`"Past · Closed"` / `"This event has already taken place. Ticket purchases and attendee registration are closed."`).
  - Sort upcoming events ahead of past events in discovery feeds and featured hero carousels.

## Independent Clerk Authentication Rule

Every Gamo Studios product uses its own Clerk application and independent authentication accounts and sessions.

All products reuse the approved shared authentication UI components.

Never reuse one product's Clerk credentials in another product. Never automatically grant memberships or authorize cross-product access based on matching email addresses; the only email-based link is the approved shared person record above (verified email, profile data only).

Authentication and business authorization are separate responsibilities.

Do not introduce shared single sign-on or alter product-account independence without explicit founder approval.

**Never run `clerk init`, the Clerk CLI, or any dashboard-generated Clerk setup prompt in this repository, and never replace the existing Clerk integration.** Clerk is already integrated in `packages/auth/clerk.ts` (with the shared auth UI) and is optional: launch uses Gamo's emailed verification codes. If Clerk is enabled later, each product needs its own production Clerk instance and DNS records (`docs/RUNBOOK.md` §3a). Deployed Clerk variables are always product-suffixed (`CLERK_SECRET_KEY_<APP>`, …; defined once in `packages/config/clerk-env.ts`), set with `scripts/set-clerk-secrets.sh`; everything else about auth is in `docs/AUTH.md`.

**Email domain:** the verified sending domain is `gamostudio.org` (contact `hello@gamostudio.org`). `scripts/audit/email-domain.test.ts` fails if the misspelled extra-"s" domain appears anywhere in the repository.

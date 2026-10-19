# Gamo Studios Build Log

## Milestone 0 - Initializing Workspace
- Scaffolded pnpm monorepo with `apps/` and `packages/`.
- Created structural directories: `apps/web`, `apps/worship`, `apps/academy`, `apps/live`, `apps/production`, `apps/admin`.
- Initialized shared packages: `ui`, `domain`, `db`, `auth`, `integrations`, `config`.
- Bootstrapped Astro apps (`web`, `worship`) with strict TypeScript configuration.
- Adding Tailwind and Cloudflare SSR integrations to the web and worship applications.

- Configured Cloudflare D1 local integration in `apps/web` and `apps/worship`.
- Built database schema with Drizzle ORM in `packages/db` and generated initial migrations for Auth/Roles.
- Bootstrapped standard Layouts and Homepage structure matching the provided design tokens and copy (No fake metrics used).
- Ready to begin Milestone 1 (Worship vertical slice).

- Setup `@gamo/auth` package using Lucia v3 and Cloudflare D1 adapter.
- Scaffolded basic `worship.gamostudios.com` application flow placeholders (`/apply/identity`).

## Milestone 2/3/4 UI Prototyping
- Completed remaining `/apply` UI flows for the Worship app.
- Scaffolding Astro apps for Academy, Live, and Production subdomains.

## Finalizing UI Mock Phase
- Recreated standard Layout and styling (Tailwind CSS configuration applied) across `production` and `admin` apps.
- Built UI screens for Production (`/` and `/contact`).
- Scaffolding the central Admin Hub (`/` dashboard and `/legal` documentation) and copied baseline Astro and Vite config.
- Fixed TS typecheck scripts across `package.json` configurations.
- Workspace successfully builds via `pnpm build` and typechecks via `pnpm typecheck` successfully across all Astro domains.
- Generated `docs/SCREEN_INVENTORY.md` to reflect all completed app pages according to `ROADMAP.md` requests.
- Created `docs/FUNCTIONALITY_PHASE_PLAN.md` pending owner's approval for phase transition.

## Scope Correction: Web Only Phase
- Received updated scope restricting active development strictly to the global homepage (`apps/web` -> gamostudios.com).
- Instructed to cease further prototyping of `worship`, `academy`, `live`, `production`, and `admin` apps.
- The `apps/web` homepage will be fully implemented according to the design-reference composition guides.
- Custom workspace agents (`design-lead`, `frontend-builder`, `ui-reviewer`) will handle the implementation and review of this single application.

## Homepage Design & Automation Pipeline
- Implemented an image optimization pipeline using `sharp` to process high-resolution source photography into responsive WebP/AVIF variants at `scripts/optimize-images.mjs`.
- Successfully generated optimized assets reducing total payload footprint by ~93%.
- Rewrote `apps/web/src/pages/index.astro` to faithfully implement the approved premium cinematic design references.
- Integrated asymmetric layout, glassmorphic floating UI cards, organic curved overlaps, and `<picture>` elements for responsive optimized images.
- Created root `Makefile` to simplify and document standard monorepo workflows (`make dev`, `make build`, `make images`, etc.).

## Architecture Update: Component-First Refactor
- Extracted shared generic UI components into `packages/ui` (`Button`, `Badge`, `Container`, `Logo`).
- Refactored `apps/web/src/pages/index.astro` from a monolithic file into composed layout and page-specific section components (`HeroSection`, `MusiciansSection`, `WorshipCoverageSection`, etc.) maintaining 100% visual fidelity.
- Fixed workspace dependencies, enabling `@studio-gamo/ui` internal imports and updated `package.json` configurations.

## Homepage Refinement Pass vs. design-reference/homepage (02–07)
- Captured section screenshots of the running page (`docs/screenshots/current-*.png`) and compared against references.
- Loosened headline tracking / weight (extrabold → bold) in below-hero sections to stop glyph collisions.
- Added `KeepWorshipGoingSection` (dark church/musician CTA from reference 06) before the terracotta `FinalCTA`.
- Footer now matches reference 07: six links per column, social icons (placeholders), legal row (Privacy / Terms / Cookie / Help Center).
- Academy lesson cards now stretch to equal height.
- Remaining gaps: musicians/academy/coverage photo selection is limited by available assets; cream wave dividers; Live floating card avatars; mobile pass.

## 2026-10-12 — Hero sizing + floating header

- `SiteHeader.astro`: rebuilt as a fixed, floating rounded-full glass bar (pill nav group, pill Sign In / terracotta Get Started), stronger contrast after scrolling, accessible mobile menu (aria-expanded, Escape to close).
- `HeroSection.astro`: hero is now viewport-height (`100svh`, clamped 620–880px) instead of a fixed 780px minimum; headline and body text scale with viewport height; photo bleeds to the right edge on wide screens; mobile stack is more compact (hero 1177px → 939px at 390px wide).
- Verified with Playwright at 1366×768, 1440×900, 1920×1080, 820×1180 and 390×844, plus the mobile menu toggle; `pnpm --filter apps-web build` passes.

## 2026-10-12 — Homepage section transitions & sizing pass
- Added `SectionCurve` (editorial) arched edge; applied at Musicians→Coverage, Stories→Keep Going, Final CTA→Footer (Coverage→How-it-works now uses it too).
- Removed doubled ~220px gaps (Musicians, How it works, Live events, Stories padding tightened); Academy given warm sand tone `#ECE1D3` to break the cream run; hairline divider before Stories.
- Keep Going: gutter aligned to page grid, taller (520px), headline changed to "Find Your Place in Worship" (no longer duplicates Final CTA).
- Mobile: How it works / Events / Stories cards are swipe rails; footer link columns 2-up. Mobile page height 15,660px → 12,919px; no horizontal overflow at 390 or 1440.
- Evidence: Playwright boundary crops in agent scratch dir (desktop 1440×900, mobile 390×844).

## 2026-10-12 — Homepage content audit cleanup
- Image slots on homepage: ~41 → 14 (Playwright `main img` count); no photo used more than twice; Final CTA no longer reuses the hero photo; footer photo removed.
- Fictional people no longer share one portrait: Marcus T., standby musician, Daniel K., Live attendees use new `InitialsAvatar` (hero David K. untouched — approved).
- How it works, Academy lessons, Stories → icon/text cards (equal height); Musicians instrument photo tiles → icon chip links; Coverage hero → church exterior, booking-card thumbnail removed; Academy video thumb desktop-only.
- Keep Going merged into Final CTA ("Find Your Place in Worship."); hero headline now unique. CTAs unified: "Find a Musician" / "Join the Roster"; "Explore Plans" → /pricing.
- Removed non-functional Stories arrows. `KeepWorshipGoingSection.astro` left on disk, unused (untracked).
- Heights: desktop page 7,703 → 6,875px; mobile 12,919 → 11,407px. No console errors, no horizontal overflow.

## 2026-10-12 — Owner feedback: Musicians / Coverage / How it works
- Musicians: single feature photo (mosaic removed); "Browse by instrument" list moved into the text column so it no longer floats between sections.
- Extracted approved hero card into `editorial/ServiceCoverageCard.astro`; hero renders identically via the component; Coverage now reuses it (lead + standby) instead of its bespoke booking card.
- How it works moved onto Coverage's dark band (one section); removed the duplicate curved divider at Coverage's bottom edge.
- Academy lesson cards no longer stretch to the classes-panel height. Homepage images: 14 → 11. No console errors; no horizontal overflow at 390/1440.

## 2026-10-12 — Homepage feedback pass
- Hero: replaced duplicate service-coverage card with new `WorshipTeamCard` (sample lineup).
- De-duplicated CTAs: Musicians → "Browse the Roster"; Coverage → single "See Coverage Plans"; Final CTA → "Get Started" / "Talk to Our Team" (`/contact` page not yet built).
- Removed curved `SectionCurve` dividers from Coverage and Final CTA.
- How It Works: numbers only, icons removed.
- Removed Stories/testimonials section from homepage.
- Live photo mask changed to a clean diagonal.
- Verified: `astro build` OK; full-page 1440px screenshot captured.
- Removed "Your Sunday, Covered" feature (kept How It Works) and Academy lesson category cards.
- Removed "Church-hosted Classes" section from Academy.

## 2026-10-12 — Strategy documentation: Gamo Live, Church Partners, dynamic homepage
- Docs-only update; no application code changed in this commit.
- Added `docs/GAMO_LIVE_AND_PARTNERS.md` (positioning, Promote/Explore journeys, managed advertising workflow, revenue streams, money separation, Partners benefits & integrity rules, dynamic hero rules, app responsibilities, 13 open owner decisions).
- Updated `README.md`, `ARCHITECTURE.md`, `DESIGN.md`, `ROADMAP.md`, `AGENTS.md`, `docs/SCREEN_INVENTORY.md`, `docs/DECISIONS.md`, `docs/FUNCTIONALITY_PHASE_PLAN.md`.
- Screen inventory gained ~20 planned screens (Not started) across web, live, admin, production.
- Earlier UI copy changes (Gamo Collection rename, How It Works pill, Academy heading, Gamo Live heading + pill) remain uncommitted working-tree changes pending visual review.

## 2026-10-12 — Nonprofit transformation (supersedes commercial model)
- Governing brief: `prompts/MASTER-PROMPT.md`. Gamo Studios is now positioned as a **proposed** Christian nonprofit (Arizona nonprofit corporation + 501(c)(3) recognition pending; no tax-deductibility or IRS claims).
- New docs: `docs/GAMO_NONPROFIT_MODEL.md` (source of truth), `docs/NONPROFIT_TRANSITION_CHECKLIST.md`. Rewrote `docs/GAMO_LIVE_AND_PARTNERS.md` and `ROADMAP.md` (10 mission-aligned priorities). Updated README, ARCHITECTURE, DESIGN, AGENTS, SECURITY, DESIGN_FIRST_OVERRIDES, design-reference/README, SCREEN_INVENTORY, FUNCTIONALITY_PHASE_PLAN, DECISIONS, HOMEPAGE_VISUAL_REVIEW, DESIGN_REVIEW_WEB (historical), and `.agents/agents/*`. (commit `64e378c`)
- Homepage copy (hero composition, design tokens, photography and components preserved):
  - Hero: mission subheading; primary CTA "Request a Musician".
  - Musicians: auditioned/reviewed + paid fairly; CTA "Explore Gamo Worship"; verified badge removed from sample profile.
  - How It Works: no guarantee language; standby "where available"; musicians "Serve & Be Paid Fairly".
  - Academy: headline "Learn to Play the Instrument You Love."; family-oriented copy; "Host or Sponsor a Class".
  - Live: "Christian Events. Bring People Together."; pathways "Promote Event" / "Explore Events"; floating card labeled "Sample Event".
  - Upcoming Events: second sample is a free community prayer gathering.
  - Final CTA: "Get Involved" / "Partner With Us".
  - Header: "Mission" nav item, "Get Involved" button. Footer: Programs / Get Involved / Organization columns, nonprofit-status statement (`#status`). Layout: mission meta description.
- Layout fixes: Live section `lg:min-h-[700px]` (CTA was clipped); Academy paragraph `lg:max-w-[min(24rem,30vw)]` (overlapped photo mask at 1024px).
- Verification: `pnpm --filter apps-web build` OK; `pnpm run typecheck` OK; `pnpm run lint` is a placeholder; no `test` script exists. Playwright at 1440/1024/390: no console errors, no horizontal overflow, no broken images. Heights desktop 5,009 → 5,282px; mobile 6,958 → 7,050px.
- Screenshots: `docs/screenshots/nonprofit-desktop-1440.png`, `nonprofit-laptop-1024.png`, `nonprofit-mobile-390.png`.
- Remaining: /mission, /partners, /support, /contact, /get-started pages not built; admin `/legal` demo still shows contractor agreement as "Published"; worship/live/academy/production app copy review pending; legal/governance decisions in `docs/GAMO_NONPROFIT_MODEL.md` §8 and the checklist.

## 2026-10-12 — Gamo Studios favicons

- Replaced default Astro favicons in `apps/{web,worship,academy,live,production,admin}/public` with the official waveform symbol: `favicon.svg` (light/dark aware), `favicon.ico` (16/32/48), `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180). Generator: `scripts/generate-favicons.mjs` (sharp).
- Added matching `<link rel="icon">`/`apple-touch-icon` tags to each app `Layout.astro`; no layout or visual changes.
- Recorded `gogamostudio.org` as a founder-owned domain under consideration (see DECISIONS.md); no domain/redirect changes made.

## 2026-10-12 — Resume interrupted multi-page public frontend

- Inspected the existing `e88ceb5` shared asset/design foundation and substantial uncommitted Worship/Academy/Live/Production implementations. Resumed the founder-approved seven-stage frontend brief, preserving the approved `/` hero, nonprofit model, monorepo, optimized assets and component boundaries. The older web-only development scope is superseded for these public apps; no backend phase was started.
- Added organization Mission, Get Involved, Partnerships/inquiry, Support, Contact, FAQ, legal-status information, account-entry and audience-routing experiences. Proposed bright hero is isolated at `/preview/hero-2026` for review. All forms are local previews; no accounts, real messages or records are created.
- Worship: completed summary, opportunity board and church roster; removed false attendance/dispatch/payment claims and repaired legacy routes. Academy: preserved discovery/detail/dashboard work, added required local registration checks, removed the acoustic-photo/electric-guitar mismatch and improved the mobile learner-photo composition.
- Live: completed profiles, organizer builder/status/dashboard/manage/report/promotion and scanner simulation; corrected tier/event continuity, empty/reset filters and canceled/external-ticket behavior. Production: preserved technical sections and six service categories; completed real local assessment review and safe validated inquiry previews.
- Shared fixes: extensionless TypeScript library exports, icon types outside Astro modules, reduced-motion behavior, visible scroll-reveal content, darker small accent text on cream, correct local sibling links. Image optimizer cache now includes encoder/width configuration, recovers missing derivatives and exits nonzero on errors; Makefile stops hiding check/test/image failures.
- Verified 16 refresh originals: 33,056,992 bytes (31.53 MiB) → 1,820,614 bytes across one largest delivered variant per photo, **94.49% reduction**. Originals remain separate; all generated derivatives exist in each of five public apps. Inventory includes source mappings, intended subjects and exact output patterns/widths.
- Actual checks: `pnpm run typecheck` passed; `make test` passed four image-policy cases; `make images` regenerated successfully; `git diff --check` passed. `pnpm run build` passed all six app builds. Initial parallel `pnpm -r build` failed on competing Cloudflare inspector ports, so the supported root build now runs sequentially. Local Cloudflare/Chromium permissions required escalation; failed initial restricted attempts are not counted as passes.
- Actual browser checks: Organization 60 cases + eight interaction checks/55 collected links; Worship/Academy 120 cases plus extra landing/summary checks; Live 125 cases plus link/negative interaction checks; Production 60 cases plus redirect/form/assessment checks. Widths: 390, 768, 1024, 1440, 1920. Verified decoded images, no horizontal overflow, main headings, meaningful demo controls, negative inputs and honest statuses. Root and specialist reports record exact coverage.
- Evidence: `docs/screenshots/2026-refresh/{web,resume,live-resume,production-resume,sections}/`; full-page desktop/mobile screenshots plus representative section crops. Reviewed the reference concepts and original photographs, corrected concrete visual defects and recorded findings in `docs/MULTIPAGE_DESIGN_REVIEW.md` and `docs/RESUME_*.md`. No fictional screenshots or synthetic test results.
- Concurrent external edits appeared during verification in Mission/Get Started/bright hero, Worship summary and Live organizer flows. Preserved useful incoming components and comparative variants, repaired a redirect loop and reran affected checks. A later writer can invalidate evidence; no claim is made that concurrent work stopped.
- Documentation reconciled: DESIGN, ARCHITECTURE, ROADMAP, AGENTS, DESIGN_FIRST_OVERRIDES, COMPONENT_ARCHITECTURE, SCREEN_INVENTORY, FUNCTIONALITY_PHASE_PLAN, asset inventory, decision log and centralized multi-page review. Corrected older Admin legal inventory's unsupported Published statuses to drafts pending counsel review; no Admin expansion.
- Limitations: `pnpm run lint` remains a placeholder, and `astro check` is unsupported with installed TypeScript 7.0.2. Founder visual acceptance remains pending. No backend, real payment/ticketing, identity/background screening, auth, email, dispatch, donation checkout, production deployment or DNS work. Future functionality and legal/safeguarding gates remain intact.
- Version-control instruction: verified work is committed and pushed directly to `main` under the founder's explicit brief; actual commit/push outcome is reported at handoff. Unrelated `.DS_Store` and scratch changes are preserved outside the implementation commit.

## 2026-10-13 — Complete Authenticated Dashboard UI System (design-first)

- **Authorized scope**: Build the complete frontend UI/UX for all user dashboards and account experiences across the Gamo Studios monorepo (`apps/web`, `apps/worship`, `apps/academy`, `apps/live`, `apps/production`, `apps/admin`). Remains in the design-first phase: zero live authentication, payments, external integrations, or backend persistence.
- **Shared Dashboard Design System (`packages/ui`)**:
  - Reusable layout & application shell (`DashboardShell.astro`): desktop sidebar (`DashNav.astro`), persistent conspicuous demo-mode banner (`DemoModeBanner.astro`), top bar with workspace switcher (`WorkspaceSwitcher.astro`), account menu (`AccountMenu.astro`), search, notifications shortcut, mobile drawer and bottom quick-tab bar.
  - Contextual page header (`DashPageHeader.astro`) with restrained typography scale (26–30px titles, 16–17px panel titles, 14–16px body, 11–13px labels) and `?state=loading|empty|error|success` design review preview switcher.
  - Reusable container-query responsive blocks (`DashBlocks.astro`): `StatGrid`, `DataTable` (desktop table ≥md, stacked card view on mobile with local client filtering), `ItemList`, `Agenda`, `MonthCalendar`, `StepList`, `KeyValueList`, `InlineNotice`, `QuickActions`, `DashForm`/`FormFields` (client-side validation), `SettingsPanel` (switches), `ProgressList`, `CardGrid`, `Statement` (musician/instructor pay vs proposed allocation strictly separated), `DashDialog` (native `<dialog>` with focus trapping and demo submission), and `StateView`.
  - Focused account-entry shell (`AuthLayout.astro`) for sign in, sign up, recovery, and onboarding.
  - Shared typed model in `packages/ui/src/lib/dashboard.ts`, client-side local interactive handler in `packages/ui/src/lib/dashboard-client.ts`, and expanded stroke line icons in `packages/ui/src/lib/icons.ts`.
- **Identity & Role Architecture (`docs/DASHBOARD_ARCHITECTURE.md`)**:
  - Distinguishes Personal Account, Active Role, Active Organization, Program Workspace, and Permission Level.
  - Single human identity (`Jordan Avery`, demo persona) holding multiple program roles (Musician in Worship, Instructor in Academy, Church Admin in Worship/Academy/Live, Event Organizer in Live, Client in Production).
  - Cross-application workspace switcher (`workspaceDirectory()`) connects all 12 demo workspaces across dev ports (4321–4326) and production origins without impersonating real users or altering permissions.
- **Account Entry & Personal Account (`apps/web`)**:
  - `/account/signin`: Focused sign-in demo with demo continue link.
  - `/account/signup`: Registration preview with demo validation.
  - `/account/recover`: Password recovery simulation.
  - `/account/onboarding`: 4-step role, program, and organization onboarding wizard.
  - `/account/signed-out` & `/account/access-denied`: Honest demo confirmation and authorization boundary explanations.
  - `/account`: Personal account hub showcasing multi-role capabilities.
  - `/account/roles`, `/account/organizations`, `/account/profile`, `/account/notifications`, `/account/settings`.
- **Church Partner & Supporter Workspace (`apps/web`)**:
  - `/partner`: Grace Fellowship partnership overview.
  - `/partner/programs`, `/partner/commitments`, `/partner/activities`, `/partner/updates`, `/partner/contributions`, `/partner/reports`, `/partner/contacts`.
  - Demonstrates collaborative nonprofit partnership without commercial vendor contracts, protects musician pay, and includes prominent nonprofit status disclosures (no tax-deductibility claims).
- **Gamo Worship Dashboards (`apps/worship`)**:
  - Musician workspace (`/musician/*`): overview, opportunities board, assignments, availability calendar, standby commitments, gig details with setlists, repertoire & instruments profile, audition verification progress, statements.
  - Church workspace (`/church/*`): overview, request a musician wizard, active requests, upcoming services agenda, assigned musicians roster, standby coverage tracking, recurring scheduling patterns, request history, statements, church profile & team permissions.
  - Consolidated legacy `/church/roster` to `/church/musicians` (301) and legacy Worship admin prototypes to `apps/admin` (301).
- **Gamo Academy Dashboards (`apps/academy`)**:
  - Student / Family workspace (`/family/*`): lesson overview, upcoming lessons, enrolled programs, lesson schedule, learning tracks, instructor directory, practice audio/materials, attendance history, household learners (minors privacy protected), term announcements. Redirected legacy `/dashboard` to `/family` (301).
  - Instructor workspace (`/instructor/*`): teaching overview, calendar, assigned classes, student roster (first name + initial, level, attendance only; privacy notice), lesson plan preparation, attendance recording checklist, learning resources, screening & qualification status, compensation statements (instructor pay vs proposed allocation separated), profile.
  - Church Host & Sponsor workspace (`/host/*`): hosted program overview, class schedule, facility & classroom rules, instructor liaisons, aggregate enrollment summaries (no private minor data), proposed youth scholarships, community educational outcomes, host communications.
- **Gamo Live Dashboards (`apps/live`)**:
  - Consolidated Organizer workspace (`/organizer/*`): overview, event management, recurring schedules, attendee registrations, ticket tiers & inventory, attendance & door scanning, attendee announcements, proposed promotion requests (labeled Sponsored), post-event reports, organizer verification steps, payout statements.
  - Removed competing `organizer.astro` and redirected legacy `/organizer/dashboard`, `/organizer/manage`, and `/organizer/report` to consolidated workspace endpoints (301).
  - Attendee account (`/me/*`): overview, digital tickets (prominently labeled 'Not valid for admission'), event registrations, upcoming agenda, saved events & organizers, history, account settings. Redirected legacy `/my-tickets` to `/me/tickets` (301).
- **Gamo Production Dashboards (`apps/production`)**:
  - Church / Client workspace (`/client/*`): project overview, technical support requests, acoustic needs assessments, consultation scheduling calendar, project milestone tracker, technical schematics & documents, service history, communications.
  - Volunteer / Technician workspace (`/crew/*`): technician overview, operational task list, service availability calendar, equipment checklists (stage, broadcast, wireless), volunteer audio/video training tracks, crew team directory, technical reference resources.
- **Internal Staff Operations Application (`apps/admin`)**:
  - Expanded `apps/admin` (running on port 4326) into a comprehensive operational command center.
  - Organization Operations: `/` (Command Center by program), `/programs`, `/people`, `/staff-roles`, `/activity`.
  - Worship Operations: `/worship/applications`, `/worship/review` (audition video review + decision dialog), `/worship/requests`, `/worship/placement`, `/worship/standby`, `/worship/dispatch`.
  - Academy Operations: `/academy/instructors`, `/academy/enrollments`, `/academy/classes`, `/academy/hosted`, `/academy/sponsorships`, `/academy/safeguarding` (background screening status tracking).
  - Live Operations: `/live/submissions`, `/live/organizers`, `/live/moderation`, `/live/ticketing`, `/live/refunds`, `/live/reports`, `/live/scanning`.
  - Production Operations: `/production/requests`, `/production/projects`, `/production/training`, `/production/personnel`.
  - Nonprofit Administration: `/nonprofit/partnerships`, `/nonprofit/sponsorships`, `/nonprofit/funding`, `/nonprofit/budgets`, `/nonprofit/stewardship`, `/nonprofit/reconciliation`, `/nonprofit/governance`.
  - Re-styled `/legal` draft documents registry inside `DashboardShell`.
- **Verification & Evidence**:
  - Typecheck passed: `pnpm --filter apps-* exec tsc --noEmit` across all apps.
  - Builds passed: `pnpm run build` across all six applications (`apps/web`, `apps/worship`, `apps/academy`, `apps/live`, `apps/production`, `apps/admin`).
  - Automated responsive tests: `scripts/verify-public-ui.mjs` passed 60 route checks; `scripts/dashboard-shots.mjs` verified every single dashboard route across desktop (1440px) and mobile (390px) with 0 HTTP errors, 0 console errors, and 0 horizontal overflow flags.
  - Real screenshots captured and stored in `docs/screenshots/dashboards/` for all major user roles on desktop (1440px) and mobile (390px).

## 2026-10-13 — Comprehensive Dashboard UX Audit, Responsive Refinement & Accessibility Polish

- **Full UX Audit & Documentation**:
  - Authored `docs/DASHBOARD_UX_AUDIT.md`: Complete audit across all 12 authenticated workspaces and staff operations, categorizing findings into P0 (blocking/critical), P1 (usability/IA/responsive), P2 (content/coherence), and P3 (enhancements).
  - Evaluated 11 distinct user journeys end-to-end (Musician, Church Director, Family/Parent, Instructor, Church Host, Event Organizer, Attendee, Production Client, Volunteer Tech, Supporter Liaison, and Admin Operations Staff).
  - Updated `docs/DASHBOARD_ARCHITECTURE.md` with reusable component specs, mobile drawer offcanvas mechanics, viewport-constrained dialogs, dynamic route aliasing, WCAG 2.1 AA accessibility patterns, and role-specific density principles.
- **Shared Component Improvements (`packages/ui`)**:
  - `packages/ui/src/lib/dashboard.ts`: Added route alias support (`aliases?: string[]`) to `DashScreen`; updated `findScreen(ws, slug)` to match canonical `s.slug` or any alias in `s.aliases`.
  - `packages/ui/src/components/dashboard/DashboardShell.astro`:
    - Re-architected mobile navigation `<dialog id="dash-drawer">` into an offcanvas left drawer with fixed full-height geometry (`fixed inset-y-0 left-0 h-full max-h-none m-0 z-50 flex flex-col`) to prevent Safari/WebKit centering bugs.
    - Added demo persona header to drawer (initials avatar, persona name, active role, active org) so users never lose context when navigating on mobile.
    - Added direct mobile drawer shortcuts to Profile, Notification Alerts, and Exit Demo.
  - `packages/ui/src/components/dashboard/DashDialog.astro`: Added viewport constraints (`max-h-[min(90vh,42rem)] overflow-y-auto`) and a sticky blurred header to eliminate modal button and footer clipping on small screens.
  - `packages/ui/src/components/dashboard/DashPageHeader.astro`: Upgraded breadcrumbs from plain text to semantic, accessible `<nav aria-label="Breadcrumb">` with interactive parent links and `aria-current="page"`.
  - `packages/ui/src/components/dashboard/Panel.astro`: Elevated panel header typography from 16–17px to 17–19px (`text-[17px] sm:text-[19px] font-semibold`) and guaranteed minimum 40px touch targets on header actions.
  - `packages/ui/src/components/dashboard/DataTable.astro`: Increased filter chip dimensions to minimum 40px touch targets (`min-h-[40px] px-4`) with explicit `focus-visible:ring-2 focus-visible:ring-terracotta`.
  - `packages/ui/src/components/dashboard/MonthCalendar.astro`: Inverted dark event dots (`bg-charcoal` → `bg-cream`) on selected days (`aria-pressed="true"`) to fix WCAG contrast failure, and added month navigation buttons.
  - `packages/ui/src/components/dashboard/FormFields.astro`: Linked form inputs and textareas to error helper texts via `aria-describedby` and unique error IDs, ensuring screen readers announce validation messages on focus.
  - `packages/ui/src/components/dashboard/StatGrid.astro`: Applied `truncate text-[22px] sm:text-[26px] leading-tight` to prevent awkward word wrapping on 360–390px mobile screens.
  - `packages/ui/src/components/dashboard/ItemList.astro`: Added `break-words [overflow-wrap:anywhere]` to item title and body to prevent unbroken technical strings from causing horizontal overflow in narrow containers.
- **Cross-Program Demonstration Data Reconciliation**:
  - `apps/worship`: Renamed "Gig details" to "Service details" and added `aliases: ['service', 'assignment']` to eliminate commercial gig terminology. Reconciled Oct 25 Grace Fellowship keys request to Mateo S. so Jordan Avery is free for the Riverside standby commitment; added `aliases: ['roster']` to church musicians screen.
  - `apps/academy`: Renamed nav item to "Instructors" and added `aliases: ['instructors']` to resolve route mismatches. Reconciled instructor classes so Jordan Avery teaches "Keyboard Foundations", "Piano Group B", and "Private — Noah P.", leaving Maya Thompson as Ava's piano teacher in First Piano Steps.
  - `apps/live`: Unified Oct 31 event title to "Fall Family Festival & Praise (sample)" across Organizer and Attendee workspaces.
  - `apps/web`: Aligned Harvest Night of Gospel concert date to Sat, Nov 14.
  - `apps/admin`: Shortened legal compliance references and linked cleanly via `siteUrl('admin', '/legal')`.
- **Rigorous Multi-Viewport Verification**:
  - Authored `scripts/verify-dashboards-all-viewports.mjs`: Automated Playwright test verifying 34 core dashboard screens across 6 responsive viewports (`390×844`, `768×1024`, `1024×768`, `1280×800`, `1440×900`, `1920×1080`) — totaling 204 screen checks.
  - 0 horizontal overflows detected across all 204 tests.
  - 0 console errors detected across all tests.
  - 100% heading accessibility compliance (exactly 1 `h1` per page).
  - Verified interactive mobile offcanvas drawer opening and closing via Escape key and backdrop click.
  - Verified modal dialog opening, focus trapping, and close actions.
  - Verified interactive filter chips, calendar day toggles, and switch controls.
  - Captured 26 fresh desktop (1440px) and mobile (390px) screenshots for all 13 major roles in `docs/screenshots/dashboards/`.


---

### Entry: 2026-10-13 — Cloudflare Backend & API Foundation (Phases 1–10)

- **Objective**: Architect and implement a maintainable, secure, Cloudflare-native backend across the Astro monorepo using Cloudflare D1, R2, Workers, and existing Stripe Sandbox / Resend integrations.
- **Phase 1 — Repository Audit & Architecture Specifications**:
  - Audited existing packages, endpoints, middleware, bindings, and documentation.
  - Produced [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) defining D1 relational schema, R2 storage policies, native Web Crypto session authentication, thin API conventions, and durable Stripe webhook handling.
  - Produced [`docs/API_INVENTORY.md`](API_INVENTORY.md) cataloging all 46 endpoints across Gamo Live, Worship, Academy, Production, Web, and Admin, distinguishing existing, implemented, and planned states.
- **Phase 2 — Relational Data Architecture (D1)**:
  - Designed complete 33-table relational schema in `packages/db/schema.ts` for users, sessions, roles, organizations, organization members, musician profiles, gigs, positions, assignments, check-ins, standby dispatches, academy classes, enrollments, live events, occurrences, ticket tiers, event registrations, production requests, partnerships, sponsorships, payment records, nonprofit ledger entries, media files, and audit logs.
  - Implemented migration `0002_complete_backend_foundation.sql` with foreign keys, indexes, and uniqueness constraints (`reg_event_email_unique`, `org_member_unique`).
  - Added `client.ts` with `getDb` and `createInMemoryD1()` wrapper for high-speed local testing and seamless Worker runtime connection.
- **Phase 3 — Authentication Architecture (`@gamo/auth`)**:
  - Evaluated authentication options: replaced deprecated Lucia v3 with lightweight native Web Crypto session manager.
  - Implemented HMAC-SHA256 cookie signing (`__session`), constant-time signature verification, and expiration handling.
  - Implemented multi-tenant and role authorization guards (`hasSystemRole`, `isStaffOrAdmin`, `hasOrgRole`, `requireAuth`, `requireStaff`, `requireOrgAccess`).
  - Verified with 8 unit tests in `packages/auth/auth.test.ts` (100% pass).
- **Phase 4 — R2 Object Storage Abstraction (`@studio-gamo/integrations`)**:
  - Implemented `packages/integrations/src/storage.ts` supporting 7 storage scopes (`public_asset`, `event_media`, `private_document`, `audition_media`, `educational_resource`, `technical_attachment`, `restricted_verification`).
  - Enforced strict MIME type whitelists, byte size caps, and unpredictable namespaced object keys.
  - Added signed upload tickets with 15-minute expiration and tenant access verification on object retrieval.
  - Verified with 8 unit tests in `packages/integrations/src/storage.test.ts` (100% pass).
- **Phase 5 & 6 — API Conventions & Shared Domain Services (`@gamo/domain`)**:
  - Created standardized API response envelope (`ApiResponse`), error handler (`handleApiError`), and Zod validation schemas (`createEventSchema`, `registerAttendeeSchema`, `reviewDecisionSchema`, etc.).
  - Implemented reusable domain services: `LiveService`, `AdminService`, `IdentityService`, `WorshipService`, `AcademyService`, `ProductionService`, `PartnershipService`, `PaymentService`, and `MediaService`.
- **Phase 7 — Stripe Integration & Durable Webhook Processing**:
  - Re-engineered `apps/live/src/pages/api/webhook/stripe.ts` to use D1 persistence (`stripe_webhook_events`) for durable webhook deduplication.
  - Implemented authoritative payment recording in `payment_records`.
  - Implemented discrete nonprofit ledger entries in `ledger_entries` separating `third_party_payable` (organizer ticket proceeds), `program_service_receipt` (Gamo allocation), and `processing_cost` (processor fee).
  - Proved via integration tests that musician/organizer pay is never pooled or netted against Gamo funds.
  - Updated `apps/live/src/pages/api/checkout/session.ts` to resolve prices authoritatively from server-side D1 records.
- **Phase 8 — First End-to-End Functional Slice (Gamo Live)**:
  - Implemented and verified complete 9-step workflow in `packages/domain/src/services/live-slice.test.ts`:
    1. Authorized organizer creates Christian event (`LiveService.createEvent`).
    2. Event is persisted to D1 in `pending_review` status.
    3. Pending event is excluded from public discovery.
    4. Authorized staff reviews and approves event (`AdminService.reviewEvent`).
    5. Approved event becomes discoverable (`LiveService.listDiscoverableEvents`).
    6. Attendee registers for free gathering with quantity = 2 (`LiveService.registerFreeAttendee`).
    7. Unique QR admission token (`gamt_...`) issued and persisted in D1 `event_registrations`.
    8. Duplicate registration attempt with same email is safely deduplicated without incrementing headcount.
    9. Resend transactional notification dispatched to attendee.
    10. Organizer dashboard reflects live registration headcount.
- **Phase 9 — Automated Testing & Verification**:
  - Expanded test runner to native `node --test` across all suites:
    - `scripts/image-policy.test.mjs`
    - `packages/integrations/src/stripe.test.ts`
    - `packages/auth/auth.test.ts`
    - `packages/integrations/src/storage.test.ts`
    - `packages/domain/src/services/live-slice.test.ts`
    - `packages/domain/src/services/payments.test.ts`
  - **Results**: 39 tests across 8 suites, 39 passed, 0 failed.
  - **Full Monorepo Build**: `pnpm build` completed with exit code 0 across all 6 applications (`web`, `worship`, `academy`, `live`, `production`, `admin`).

## 2026-10-13 — OpenAPI-first foundation and backend contract reconciliation

**Authorized scope:** user requested authoritative contract adoption before the independent backend security/reliability audit, with commit/push to main. No production deployment, remote D1 mutation, secrets, real email, payment, payout or unrestricted access was enabled.

**Baseline:** clean `main`, HEAD `cb97c37`, four commits ahead of `origin/main` (`fc32b71`, `2ad0aed`, `07bb316`, `cb97c37`). Remote main fetched successfully before final commit. No user changes were overwritten.

**Completed foundation:** discovered 10 route files / 12 HTTP method-path operations; all 12 specified in multi-file OpenAPI 3.1.1 and exercised in initial HTTP contract tests. Six-app topology and existing URLs preserved. Added Redocly lint/bundle/local reference, deterministic public/internal bundles, openapi-typescript declarations, public openapi-fetch factory, generated Ajv standalone Worker validators, root/Make commands and GitHub Actions contract gate. Generation verification writes only temporary artifacts. Public bundle/reference excludes admin operations, identity creation demo and Worship redirect demos. Documentation and source coverage are checked; no planned API was fabricated.

**Reconciled:** local-only email session issuance, tenant membership enforcement on proposals (forged demo-header regression), approved-only public detail, strict body/query/media validation including RFC3339 offsets, no fabricated checkout pricing or coercion, paid/external/cross-event-tier denial for free registration, generic unexpected errors, signed-live-event denial and removal of unapproved 5%/estimated fee deductions. Isolated node:sqlite to test-only `@gamo/db/testing`; missing DB binding is an explicit failure. Final webhook exception boundary also handles DB/claim errors as documented 500 JSON.

**Limitations/findings:** registration privacy/user binding/capacity/concurrent retries; Access-subject-to-D1 mapping and per-operation staff RBAC; revision_requested maps to rejected; no client idempotency; claim-before-effects webhook retry/concurrency and accounting/ticket/refund gaps; missing rate limits/CSRF; unbounded moderation queue; real provider/Cloudflare verification; schema/migration drift and domain-only safeguarding/dispatch gaps. These are documented reconciliation findings, **not** completion of the independent security/reliability audit. Worship routes remain redirect-only demos. Thirty-four historical future endpoint candidates and conceptual media upload workflow remain outside executable OpenAPI paths; specified-but-unimplemented count is zero.

**Exact successful verification:**

| Command | Result |
| --- | --- |
| `pnpm exec redocly lint openapi/root.yaml` / `pnpm api:lint` | Valid syntax/references; 2 intentional redirect-only Worship 2xx warnings |
| `node scripts/api/generate.mjs` | Redocly public/internal bundles, TypeScript declarations and standalone validators generated |
| `node scripts/api/generate.mjs --check` | Byte-identical generated outputs; no tracked artifact rewrite |
| `pnpm api:docs` | Public 183 KiB and internal 240 KiB local Redocly HTML generated; no publication |
| `node scripts/api/check.mjs` | 12 source/contract operations match; internal filtering and credential-pattern scans pass |
| `pnpm api:test` / final `make api-check` | 9 grouped contract tests pass; 12/12 operations tested over loopback HTTP with isolated migrated SQLite/D1 adapter, foreign keys and blocked outbound fetch; includes sandbox zero-allocation regression |
| `pnpm test` | Existing 39 tests pass, 0 failures |
| `pnpm typecheck` | All six app TypeScript checks and shared api-contracts package pass |
| `pnpm build` | All six Cloudflare Astro application builds pass |
| `pnpm api:compatibility cb97c37` | Initial adoption baseline (no prior contract) |
| `git diff --check` | Pass |

**Environment issues resolved:** existing pnpm store needed the approved `/Users/gamo/Library/pnpm/store/v11` path during installation. openapi-typescript failed with the TypeScript 7 compiler API; pinned TypeScript 5.9.3, then all checks passed. Ajv standalone emitted CommonJS helper requires; generation now transforms them to static pure-JS ESM imports and tests/builds pass. Initial test runner/template selection failure was corrected; final tests exercise actual handlers/middleware. Local loopback/tsx IPC and Cloudflare build debug listeners were sandbox-denied; reran with tool approval. No fictitious results or screenshot substitutes were used.

**Artifacts/evidence:** `openapi/bundled/{public,internal}.json`, `packages/api-contracts/src/{public,internal}.d.ts`, `packages/api-contracts/src/validators.js`, local `docs/api-reference/{public,internal}.html` (ignored by Git; reproduce with make api-docs), `scripts/api/contract.test.ts`, `.github/workflows/api-contract.yml`, `docs/OPENAPI_ARCHITECTURE.md`, corrected `docs/API_INVENTORY.md`, compatibility release note. Local execution logs: `/tmp/gamo-openapi-{check,backend-tests,types,build}.log`. Tests use loopback ephemeral ports; configured app origins remain Web 4321, Worship 4322, Academy 4323, Live 4324, Production 4325 and Admin 4326. No UI screens changed or browser screenshots produced; these tests verify HTTP handlers, not Astro routing, Cloudflare D1 concurrency or real providers.

**Owner actions / production gate:** approve verified identity and staff mapping design, registration pass privacy/access and serialization, financial/accounting/refund/idempotency policies, operational pagination, and legal/safeguarding prerequisites. Configure real sandbox provider and Cloudflare resources only under explicit later authorization. The next phase may independently audit the recorded security/reliability concerns; it was not started here.

**CI follow-up:** First push commit `1cb3434` reached origin/main. GitHub Actions run `38433811975` passed API/docs/contracts/backend tests, then exposed a clean-checkout TypeScript setup gap: apps without tracked `env.d.ts` relied on locally generated `.astro/types.d.ts` for `ImportMeta.env`. Root `pnpm typecheck` now runs `astro sync` for all six apps before tsc so a clean checkout generates its required declarations. This is a tooling correction; no UI or runtime policy changes. A follow-up verified commit/push records this fix.

## 2026-10-13 — Independent Backend Security, Data Integrity & Runtime Verification Audit

- **Authorized Scope**: Execute an independent adversarial security, data integrity, concurrency, and `workerd` runtime audit against the `cb97c37` / `1cb3434` / `6103121` backend baseline. Repair P0/P1 defects, fail-close incomplete financial/identity paths behind explicit `403`/`503` gates, verify behavior in both Node SQLite and `workerd`/Miniflare, remediate dependency advisories, and produce authoritative audit, test-matrix, and release-readiness documentation. No production deployment, remote D1 mutation, or live external provider call was performed.
- **Audit Register & Handoff**:
  - Authored [`docs/BACKEND_INDEPENDENT_AUDIT.md`](BACKEND_INDEPENDENT_AUDIT.md) (12 confirmed P0–P2 findings with file/line citations, repairs, and residual blockers), [`docs/BACKEND_TEST_MATRIX.md`](BACKEND_TEST_MATRIX.md), [`docs/BACKEND_RELEASE_READINESS.md`](BACKEND_RELEASE_READINESS.md), and [`docs/BACKEND_AUDIT_HANDOFF.md`](BACKEND_AUDIT_HANDOFF.md).
  - Updated [`docs/API_COMPATIBILITY.md`](API_COMPATIBILITY.md), [`docs/API_INVENTORY.md`](API_INVENTORY.md), and [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md), and bumped `openapi/root.yaml` to `1.1.0` with regenerated public/internal bundles, TypeScript declarations, and standalone Ajv validators.
- **Key Security & Integrity Repairs Implemented**:
  1. **Session & CSRF Hardening (`@gamo/auth`, `apps/web/src/pages/api/auth/session.ts`)**: Removed hardcoded fallback signing secret; fail-closed on malformed URI-encoded cookies; restricted demo session creation to `ENVIRONMENT=local` + `ALLOW_DEMO_SESSION=true` on loopback; rotated prior session on login; enforced `requireSameOrigin` on session/event/admin mutations; excluded scoped roles (`scope_type IS NOT NULL`) from global `session.roles`.
  2. **Admin Zero Trust & Moderation Boundary (`apps/admin/src/lib/cf-access.ts`, `apps/admin/src/middleware.ts`, `AdminService`)**: Required trusted `CF_ACCESS_TEAM_NAME` and `CF_ACCESS_AUD`, token `exp`/`sub`/`email`, 5s JWKS timeout, and `redirect: 'error'`; removed `/api/*` dev fallthrough and synthetic `staff_reviewer_demo` fallback; required active D1 staff session (`staff_reviewer`/`superadmin`) with matching email when Access headers are present; blocked staff from moderating their own organization (`403`); made `AdminService.reviewEvent` an atomic D1 `batch()` preserving `revision_requested` and preventing re-review (`409`).
  3. **Populated-DB Migration Repair & Registration Triggers (`0002`, `0003_registration_integrity.sql`)**: Fixed SQLite `ALTER TABLE ... ADD COLUMN ... DEFAULT (unixepoch())` failure on populated legacy databases by using constant defaults in `0002` and backfilling in `0003`; added `notification_jobs` outbox table and SQLite triggers enforcing atomic capacity reservation, cancellation release, field immutability, tier bounds, and transactional outbox queueing; removed client `userId` and omitted attendee PII/`qrToken` on duplicate `200` responses.
  4. **Protective Financial Gates (`apps/live/src/pages/api/checkout/session.ts`, `apps/live/src/pages/api/webhook/stripe.ts`, `PaymentService`)**: Gated checkout creation with `503 Service Unavailable` after request validation; gated financial Stripe webhook events (`checkout.*`, `charge.*`, `payment_intent.*`, `refund.*`) with `503` before recording processed state so events are never falsely fulfilled or silently dropped; removed unapproved 5% / estimated fee allocations.
  5. **R2 Quarantine & Object Validation (`packages/integrations/src/storage.ts`, `MediaService`)**: Defaulted non-public media metadata to `quarantined`; narrowed staff access so generic `staff_reviewer` cannot read `restricted_verification` or `educational_resource` files; enforced key prefix ownership, ticket expiry, byte size, basic HTML/script/SVG/MZ/ELF magic-byte spoofing checks, and no-overwrite rules in `putObject`.
  6. **Dependency & Build Tooling Remediation (`package.json`, `pnpm-workspace.yaml`)**: Upgraded `pnpm` (`11.6.0` → `11.28.5`) and overrode `@esbuild-kit/core-utils>esbuild` to `0.28.2` (`pnpm audit` passes with **0 vulnerabilities**); configured isolated `/tmp` Wrangler log/config paths so `pnpm typecheck` and `pnpm build` succeed cleanly across all 6 apps.
- **Verification Evidence**:
  - `pnpm test`: **Pass (39/39, exit 0)**
  - `node --import tsx --test scripts/audit/security.test.ts`: **Pass (12/12 adversarial regression suites, exit 0)**
  - `pnpm api:check`: **Pass (12/12 HTTP operations, OpenAPI lint, bundle/type/validator drift check, secret scan, exit 0)**
  - `node scripts/audit/workers.mjs`: **Pass (ESM Worker bundle in `workerd`/Miniflare v4 with local D1 + R2 bindings, 12-way concurrency race, capacity & outbox triggers, foreign-key check, R2 restricted-read denial, 503 checkout gate, exit 0)**
  - `pnpm typecheck`: **Pass (6/6 apps + `@gamo/api-contracts`, exit 0)**
  - `pnpm build`: **Pass (6/6 Astro Cloudflare SSR builds, exit 0)**
  - `pnpm audit`: **Pass (0 vulnerabilities found, exit 0)**
- **Release Recommendation**: **NO-GO for production deployment** until verified user login, Access `sub`-to-D1 staff provisioning, authoritative order/inventory/webhook fulfillment, notification outbox consumer, R2 upload confirmation endpoints, edge rate limiting, and explicit `wrangler.toml` D1/R2 bindings ([`docs/BACKEND_RELEASE_READINESS.md`](BACKEND_RELEASE_READINESS.md)) are completed and approved.

## 2026-10-13 — Backend Stabilization Phase: Legal-Structure-Neutral Architecture, Preview D1/R2 Provisioning, Verified Auth, Staff Provisioning, Notification Outbox Consumer & Browser E2E

- **Authorized Scope**: Execute the post-audit Backend Stabilization engineering phase:
  1. Update organizational architecture docs (`docs/GAMO_NONPROFIT_MODEL.md`, `docs/NONPROFIT_TRANSITION_CHECKLIST.md`, `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `SECURITY.md`, `docs/DECISIONS.md`) to be **legal-structure-neutral** (Gamo Studios is Christian and mission-driven while its final legal incorporation and tax status remain undecided).
  2. Establish isolated `local`, `preview`, and `production` Cloudflare configurations across all 6 `wrangler.toml` files without deploying to or modifying production.
  3. Provision and test remote preview D1 (`gamo-db-preview`, `d7e12797-cc6c-4fa3-91c7-c192863e4812`) and remote preview R2 (`gamo-media-preview`) in the confirmed `gamostudios` Cloudflare account (`ebae7bded6ab45950aeba1d6cf51eb7f`).
  4. Update OpenAPI 3.1.1 contracts (`openapi/root.yaml` → `v1.2.0`) and regenerate bundles, types, and standalone Ajv validators before implementing new routes.
  5. Implement verified user authentication (`POST /api/auth/challenge`, `POST /api/auth/verify`), session inspection (`GET /api/auth/me`), organization onboarding (`POST /api/organizations`), and staff identity provisioning (`POST /api/staff/provision`) binding immutable Cloudflare Access `sub` values in `external_identities`.
  6. Complete Gamo Live's free-event registration workflow (`POST /api/events/{id}/register`) with reliable notification outbox processing (`NotificationService` with HTML escaping, retry backoff, and 5-attempt terminal failure).
  7. Enforce hard prohibition of sensitive student and identity documents (`restricted_verification`, `student_record`, `identity_document`) in code and D1 triggers (`SENSITIVE_DOCUMENT_PROHIBITED`).
  8. Add Playwright Chromium browser-level E2E tests (`scripts/audit/browser-e2e.test.mjs`) against `workerd`/Miniflare v4 and isolated D1.
- **Verification Evidence**:
  - Remote Cloudflare Preview D1 (`gamo-db-preview`, `d7e12797-cc6c-4fa3-91c7-c192863e4812`) & R2 (`gamo-media-preview`) in account `gamostudios` (`ebae7bded6ab45950aeba1d6cf51eb7f`): Applied all 5 migrations (`0000`–`0004`), verified `registration_reserve`, `notification_jobs` outbox insertion, and `media_prohibit_sensitive_docs` triggers on remote D1, verified R2 put/get/delete on `gamo-media-preview`, and cleaned up all smoke test records.
  - `pnpm test`: **Pass (39/39, exit 0)**
  - `pnpm api:check`: **Pass (17/17 HTTP operations, OpenAPI 1.2.0 lint, bundle/type/validator check, secret scan, exit 0)**
  - `node --import tsx --test scripts/audit/security.test.ts`: **Pass (15/15 adversarial regression suites, exit 0)**
  - `node scripts/audit/workers.mjs`: **Pass (ESM Worker bundle in `workerd`/Miniflare v4 with D1 + R2 bindings, persisted SQLite `PRAGMA integrity_check` + `PRAGMA foreign_key_check`, verified email challenge/verify, org onboarding, staff provisioning, moderation, 12-way concurrency race, notification outbox `sent`, R2 denial, 503 checkout gate, exit 0)**
  - `node scripts/audit/browser-e2e.test.mjs`: **Pass (Playwright Chromium E2E against `workerd` + isolated D1 covering `/account/signin` challenge/verify, `HttpOnly` session cookie, organization onboarding, event submission/approval, `/events/{id}/register` free registration + notification outbox `sent`, `409 Conflict` capacity enforcement, and sign-out, exit 0)**
  - `pnpm typecheck`: **Pass (6/6 apps + `@gamo/api-contracts`, exit 0)**
  - `pnpm build`: **Pass (6/6 Astro Cloudflare SSR builds, exit 0)**
  - `pnpm audit`: **Pass (0 vulnerabilities found, exit 0)**
- **Release Recommendation**: **NO-GO for public production deployment** until live Resend credentials/domain verification, paid ticketing order/hold/webhook fulfillment, R2 HTTP upload/quarantine promotion, edge rate limiting, and legal/governance prerequisites in [`docs/BACKEND_RELEASE_READINESS.md`](BACKEND_RELEASE_READINESS.md) pass a separate release-readiness review.

## 2026-10-13 — `gamostudio.org` Canonical Domain Standardization & Live Cloudflare Custom Domain Deployment

- **Authorized Scope**: Ensure the entire repository uses `gamostudio.org` (never `.com` or `gamostudio[s].org`), diagnose why `gamostudio.org` was not resolving, and deploy all six applications live on `gamostudio.org` and its subdomains while preserving all security and financial protective gates.
- **Root Cause of `gamostudio.org` Not Resolving**:
  - In the `gamostudio.org` Cloudflare zone (`5dd92c18b4c722d5d15d66bda4f94979`) under account `gamostudios` (`ebae7bded6ab45950aeba1d6cf51eb7f`), DNS previously had only `MX`/`TXT` email records and zero `A`/`AAAA`/`CNAME` records, and the 6 Workers had only `*.gamostudio.workers.dev` preview URLs with `"domains": []` and `"routes": []`.
  - Furthermore, `@astrojs/cloudflare` v13+ flattens the active Wrangler environment at `astro build` time via `CLOUDFLARE_ENV=production` and throws on `Astro.locals.runtime.env` at edge runtime in favor of `import('cloudflare:workers')`.
- **Key Changes Implemented**:
  1. Replaced remaining `.com` / `gamostudio[s].org` references with `gamostudio.org` in [`docs/GAMO_NONPROFIT_MODEL.md`](GAMO_NONPROFIT_MODEL.md), [`docs/GAMO_LIVE_AND_PARTNERS.md`](GAMO_LIVE_AND_PARTNERS.md), [`prompts/MASTER-PROMPT.md`](../prompts/MASTER-PROMPT.md), and [`scripts/audit/browser-e2e.test.mjs`](../scripts/audit/browser-e2e.test.mjs).
  2. Provisioned production D1 database `gamo-db-production` (`d6db9fe7-77c0-4a50-836e-3d1924f00b53`, all 5 migrations `0000`–`0004` applied) and R2 bucket `gamo-media-production` in account `ebae7bded6ab45950aeba1d6cf51eb7f`, and configured `custom_domain = true` in `[env.production]` across all 6 `wrangler.toml` files so Cloudflare automatically provisions proxied DNS records and Universal SSL certificates on `gamostudio.org`.
  3. Added [`getRuntimeEnv`](../packages/domain/src/api/response.ts) in `@gamo/domain` (and updated all API routes, SSR pages, and `apps/admin/src/middleware.ts`) to resolve Worker bindings via `cloudflare:workers` on Astro v6 while preserving Node.js test harness compatibility.
  4. Provisioned a cryptographically random `SESSION_SECRET` secret across all 6 Workers via `wrangler secret put SESSION_SECRET`.
- **Live Edge Verification (`gamostudio.org`)**:
  - `https://gamostudio.org/` -> **HTTP 200**
  - `https://www.gamostudio.org/` -> **HTTP 200**
  - `https://worship.gamostudio.org/` -> **HTTP 200**
  - `https://academy.gamostudio.org/` -> **HTTP 200**
  - `https://live.gamostudio.org/` -> **HTTP 200**
  - `https://production.gamostudio.org/` -> **HTTP 200**
  - `https://admin.gamostudio.org/` -> **HTTP 401 Unauthorized** (`Gamo Studios · Operations Gateway`)
  - `GET https://www.gamostudio.org/api/auth/me` -> **HTTP 401** (`UNAUTHENTICATED`)
  - `GET https://live.gamostudio.org/api/events` -> **HTTP 200** (`{"success":true,"data":[],"meta":{"total":0}}`, live D1 query)
  - `POST https://www.gamostudio.org/api/auth/session` -> **HTTP 403** (`FORBIDDEN` — demo session creation blocked in production)

## 2026-10-13 — Dashboard navigation overlap repair

- Fixed the shared dashboard mobile dialog: unconditional flex display revealed the closed drawer on top of desktop content. Closed drawers are now explicitly hidden; flex applies only when open.
- Desktop retains its reserved 256px sidebar column with a shrink-safe content track. Mobile/tablet drawer uses dynamic viewport height, scrollable navigation, background scroll locking, expanded state, keyboard focus wrapping, Escape/close/backdrop dismissal, link dismissal, and automatic closure/focus recovery when resizing to desktop.
- Verified `node scripts/verify-dashboard-navigation.mjs`: church and musician dashboards at 390, 768, 1024, 1440 and 1920px (10 passing route/viewport checks), including mobile interactions and resize recovery; no page errors. `pnpm --filter apps-worship exec tsc --noEmit` and `git diff --check` passed.
- Preview: http://127.0.0.1:4331/church and http://127.0.0.1:4331/musician. Browser screenshots: `docs/screenshots/dashboard-navigation/` (full-page layouts and open drawers); desktop church and mobile drawer visually inspected.
- Shared fix applies to all DashboardShell consumers; browser verification in this task covers Worship. No deployment or backend changes. Production remains unchanged pending an authorized release.

## 2026-10-13 — Zoom reflow and mobile hero ordering

- Fixed the short-height media query that overrode desktop photograph heights in the approved homepage hero, musicians, Academy, Live and final CTA sections. Scoped the adjustment to each section's mobile width; desktop hero now stretches between top/bottom anchors. Preserved photography, masks, colors and desktop composition.
- Made existing photo compositions precede text below 1024px in Worship, Academy, Production, organization, Live promotion and event detail heroes, including shared Academy/Production interior heroes. Text-only operational screens remain text-led.
- Added `scripts/verify-zoom-layout.mjs`: 12 routes × 10 CSS viewport sizes (320px mobile, landscape, short desktop, and zoom-equivalent reflow), asserting HTTP success, image loading, image coverage, image-first ordering, heading/header separation and document overflow.
- Verification: `ACADEMY_PORT=4332 node scripts/verify-zoom-layout.mjs` passed 120 checks, zero failures and zero page errors. Initial Academy instance at 4323 returned HTTP 500 (`fetch failed`); a fresh Astro background server selected 4332. No application change was needed for that stale instance.
- `pnpm --filter apps-web --filter apps-worship --filter apps-academy --filter apps-live --filter apps-production --workspace-concurrency=1 run build` passed after final component changes. `git diff --check` passed.
- Evidence: `docs/screenshots/zoom-layout/results.json`; full-page and viewport PNGs in the same directory. Inspected corrected homepage desktop/full-page, Worship mobile/full-page, Academy mobile and Production mobile captures. Browser skill was read; its Node browser connection was unavailable, so local installed Playwright captured actual running pages.
- Local review URLs: http://127.0.0.1:4321/ ; http://127.0.0.1:4322/ ; http://127.0.0.1:4332/ ; http://127.0.0.1:4324/promote ; http://127.0.0.1:4325/ .
- Limits: this is targeted responsive regression coverage, not complete UX sign-off. Native browser zoom controls, text-only zoom, Safari/Firefox and all operational UI states have not been reverified in this pass. Normal scrolling at increased zoom is expected; actions are not forced above the fold. No deployment or remote push.

## 2026-10-13 — Zoom-out photo alignment follow-up

- User screenshots exposed two remaining viewport-wide photo anchors: homepage hero and final Get Involved CTA. Both now keep imagery and sculptural overlays inside a centered 1536px composition, matching the other homepage sections while section background colors remain full width.
- Added `scripts/verify-zoom-out.mjs`. `node scripts/verify-zoom-out.mjs` passed six widths: 390, 1280, 1536, 1920, 2880, 5760 CSS pixels, checking no horizontal overflow and bounded desktop image edges/heights. These are zoom-equivalent wide viewports, not native Chrome zoom control tests.
- Captured actual full-page screenshots in `docs/screenshots/zoom-out/`; inspected mobile and 5760px evidence. Results: `docs/screenshots/zoom-out/results.json`. Review URL: http://127.0.0.1:4321/ .
- `pnpm --filter apps-web run build` completed successfully (exit 0); Wrangler reported a sandbox-denied diagnostic log write. `git diff --check` passed. No external integration, deployment or remote push.

## 2026-10-13 — Authorized public UI deployment

- Owner requested push and deployment. Pushed `main` through `691715b` to `origin/main`, then ran `make deploy-web deploy-worship deploy-academy deploy-live deploy-production` successfully. Production builds used the existing configured domains and resource bindings. No migrations, secret changes or Admin deployment.
- Cloudflare versions: web `5d980dc6-d036-455d-98e0-5ca0969532d8`; Worship `b8cde1b8-7a8a-463f-8248-f2e48faae03a`; Academy `3211b3f5-71d7-4632-b1bb-ac95e8b0c5c5`; Live `b06e06ba-cfb6-4c9b-a6ef-1ae5d2c18733`; Production `b543804f-7578-402a-990e-9e6a469eb06c`.
- Read-only live HTTP checks returned 200 for apex, www, Worship, Academy, Live homepage and `/promote`, and Production. Confirmed corrected hero-container markup on apex/www and image-first markup on affected program landing pages. Local browser evidence is recorded above; this deployment does not certify outstanding backend readiness gates.

## 2026-10-13 — Mobile workspace & Assigned musicians redesign

- Redesigned mobile workspace shell (`packages/ui/src/components/dashboard/DashboardShell.astro`, `WorkspaceSwitcher.astro`, `DashPageHeader.astro`) and block cards (`StatGrid.astro`, `CardGrid.astro`, `Panel.astro`, `Agenda.astro`, `QuickActions.astro`, `StatusPill.astro`) for effortless mobile scanning:
  - Consolidated the sticky mobile header into a single row with a compact pill `WorkspaceSwitcher` (eliminating the stacked second header bar on mobile).
  - Replaced the full-width bottom tab bar (which truncated long labels) with a floating dark charcoal pill dock (`rounded-[28px]`) using concise 1-word labels (`shortNavLabel`) and a highlighted active pill.
  - Promoted `Assigned musicians` (`/church/musicians`) to the primary 4-item mobile dock in `apps/worship/src/data/workspaces/church.ts` and added at-a-glance coverage summary cards above compact 2-line horizontal musician row cards on mobile.
- Verification: `DASHBOARD_URL=http://127.0.0.1:4322 node scripts/verify-dashboard-navigation.mjs` passed all 10 viewport/route checks (`390`, `768`, `1024`, `1440`, `1920` across `/church` and `/musician`) with zero horizontal overflow and zero console/page errors; `pnpm test` passed all 39 tests.
- Evidence: `docs/screenshots/dashboard-navigation/church-musicians-390-viewport.png`, `docs/screenshots/dashboard-navigation/church-musicians-390-full.png`, `docs/screenshots/dashboard-navigation/church-overview-390-full.png`, `docs/screenshots/dashboard-navigation/church-musicians-1440.png`.
- Authorized push and deployment (`f196bd3`): `make deploy-web deploy-worship deploy-academy deploy-live deploy-production` succeeded. Cloudflare versions: web `d5ef2d6b-ba59-48ca-9df8-4f0de481cd02`; Worship `570b500a-535a-4339-9aad-bff9c46a848c`; Academy `9628c469-0d07-4039-9b3d-85c3a11adbc8`; Live `119d46e9-093d-42f3-aff3-1abc8a04f8ad`; Production `ff253347-bed4-4975-836a-842e82a869d9`. Verified HTTP 200 on `https://worship.gamostudio.org/church/musicians` and all workspace routes.

## 2026-10-14 — Account Creation, Cross-App Session Sharing & Hybrid Sample Data Mode

- Enabled full passwordless OTP account creation on `/account/signup` alongside `/account/signin` via `VerifiedAuthPanel.astro`, with direct launchers to all Gamo workspaces (`Personal Account Hub`, `Gamo Worship`, `Gamo Academy`, `Gamo Live`, `Gamo Production`) and inline organization onboarding.
- Updated `POST /api/auth/verify` and `DELETE /api/auth/session` to scope `__session` cookies to `Domain=.gamostudio.org` when `PUBLIC_ROOT_DOMAIN === 'gamostudio.org'` in production so sessions authenticate seamlessly across all `*.gamostudio.org` subdomains while remaining host-only on `localhost` / `127.0.0.1`.
- Added `packages/ui/src/lib/session-viewer.ts` and updated `WorkspaceScreen.astro`, `DashboardShell.astro`, `AccountMenu.astro`, `DemoModeBanner.astro`, and `AuthLayout.astro` to resolve the signed-in user's identity and organization from D1/cookies while keeping all interactive test sample data active across every workspace for all accounts.
- Verification:
  - `DASHBOARD_URL=http://127.0.0.1:4322 node scripts/verify-dashboard-navigation.mjs` (10/10 pass)
  - `pnpm test` (39/39 pass)
  - `pnpm api:check` (17/17 operations + 10/10 contract tests pass)
  - `pnpm exec tsx --test scripts/audit/security.test.ts` (15/15 pass)
  - End-to-end Playwright signup, organization creation, and cross-app workspace verification captured in `docs/screenshots/dashboard-navigation/auth-signup-step1-390.png`, `docs/screenshots/dashboard-navigation/auth-signup-authenticated-390.png`, and `docs/screenshots/dashboard-navigation/worship-assigned-authenticated-390.png`.

## 2026-10-14 — Admin Gateway Password Login (`gasanamoise7@gmail.com`) & Cohesive Global Homepage Draft

- Added `packages/db/migrations/0005_admin_password_credentials.sql`, `adminCredentials` in `packages/db/schema.ts`, and PBKDF2-HMAC-SHA256 administrator password authentication + self-service password rotation in `packages/auth/index.ts`, `apps/admin/src/middleware.ts`, and `apps/admin/src/pages/security.astro`:
  - Idempotently provisions `gasanamoise7@gmail.com` with `superadmin` role and temporary password `[temporary password redacted — see docs/CLEANUP_LOG.md H-02]` (`mustChangePassword: true`), 5-attempt lockout protection, and `/security` password rotation inside `apps/admin`.
- Rebuilt `apps/web/src/pages/index.astro` from the ground up using modular Level-3 components (`HomeEditorialHero.astro`, `HomeProgramsBento.astro`, `HomeWorshipSpotlight.astro`, `HomeAcademySpotlight.astro`, `HomeLiveSpotlight.astro`, `HomeProductionSpotlight.astro`, `HomeCommunityPaths.astro`, and `CtaInvitation.astro`) to match the bright editorial design language of `/mission`, `/partners`, `/get-involved`, Worship, Academy, Live, and Production.
- Verification:
  - `node scripts/verify-public-ui.mjs`: passed 60 responsive route checks (`390`, `768`, `1024`, `1440`, `1920`) and 8 interaction checks; 73 links inspected (`docs/screenshots/2026-refresh/web/home-1440.png`, `docs/screenshots/2026-refresh/web/home-390.png`).
  - `pnpm exec tsx --test scripts/audit/security.test.ts` (16/16 pass), `pnpm test` (39/39 pass), `pnpm api:check` (10/10 pass), `pnpm typecheck` (pass).

## 2026-10-14 — Gamo Live Standalone Consumer Platform Evolution (`PLATFORM_BRAND`, Migration `0006`, OpenAPI `v1.3.0` & Role Workspaces)

- **Authorized Scope**: Evolve `apps/live` into a standalone-feeling, mainstream-quality Christian event and live-performance platform across four connected workflows — (1) Discover & Attend (no required attendee dashboard/account, strong-verification self-service order recovery), (2) Organize & Promote (multi-organization/multi-role event teams with granular permissions), (3) Represent & Book Talent (artists, authorized agents/managers, multi-artist rosters, booking inquiries/offers, immutable engagements), and (4) Produce Events (linked Gamo Production requests without duplicating identity or event records) — while preserving the monorepo and OpenAPI-first architecture.
- **Brand Architecture (`PLATFORM_BRAND`)**:
  - Implemented `packages/domain/src/brand.ts` and `packages/ui/src/lib/brand.ts` (`getPlatformBrandConfig`, `resolvePlatformBrandConfig`) with `PLATFORM_BRAND` environment configuration in `apps/live/wrangler.toml`.
  - Sanitizes literal `"PLATFORM_BRAND"` or empty strings so customer-facing copy defaults cleanly to `"Gamo Live"` (with `isPlaceholderDomain: true` unless `PLATFORM_IS_LIVE_DOMAIN === 'true'`).
  - Added standalone consumer chrome (`apps/live/src/components/LiveHeader.astro`, `apps/live/src/components/LiveFooter.astro`, and `apps/live/src/layouts/Layout.astro`) with accurate legal-structure-neutral operator and payment disclosures in footer/transactional contexts (no 501(c)(3), tax-deductible, or escrow/fiduciary claims).
- **Relational Data Model & SQLite Integrity Triggers (`0006_live_standalone_platform.sql`, `packages/db/schema.ts`)**:
  - Added 15 new tables: `artist_profiles`, `artist_representatives`, `representation_authorizations`, `booking_inquiries`, `booking_offers`, `performance_engagements`, `event_organizations`, `event_team_members`, `event_performers`, `ticket_holds`, `ticket_orders`, `tickets`, `ticket_scans`, `refund_records`, and `settlement_records`, plus additive `production_requests.event_id`.
  - Added 6 SQLite triggers enforcing:
    1. Exclusive representation conflict prevention (`EXCLUSIVE_REPRESENTATION_CONFLICT`).
    2. Immutability of accepted booking offers (`BOOKING_OFFER_IMMUTABLE`).
    3. Deposit collection fail-closed gate (`DEPOSIT_COLLECTION_DISABLED`).
    4. Academy youth performer guardian consent + safeguarding verification (`MINOR_SAFEGUARDING_REQUIRED`).
- **Granular Event & Representation RBAC (`packages/auth/index.ts`)**:
  - Added `hasEventPermission`, `requireEventPermission`, and `hasRepresentationAuthority` enforcing strict separation between `content_manage`, `publish_event`, `lineup_manage`, `booking_negotiate`, `ticketing_manage`, `checkin_scan`, `refund_approve`, `settlement_view`, and `production_coordinate` (e.g., `ticketing_admin` or `event_owner` can publish events without automatically receiving `refund_approve` or `settlement_view` authority).
- **OpenAPI 3.1.1 Contract (`v1.3.0`) & API Endpoints (`apps/live/src/pages/api/*`)**:
  - Expanded `openapi/root.yaml` from 17 to 30 operations across 26 route files and regenerated `openapi/bundled/{public,internal}.json`, `packages/api-contracts/src/{public,internal}.d.ts`, `packages/api-contracts/src/validators.js`, and local Redocly HTML references (`docs/api-reference/{public,internal}.html`).
  - Implemented 11 new route files in `apps/live`:
    - `GET/POST /api/artists`
    - `POST /api/artists/[id]/representations`, `PATCH /api/artists/[id]/representations/[authId]`
    - `GET/POST /api/bookings/inquiries`
    - `POST /api/bookings/inquiries/[id]/offers`
    - `POST /api/bookings/inquiries/[id]/confirm`
    - `GET/POST /api/events/[id]/team`
    - `POST /api/events/[id]/holds`
    - `POST /api/events/[id]/checkin`
    - `POST /api/orders/lookup` (requires matching purchaser email + `orderNumber` or `verificationCode` + `ticketQrToken`, rate-limited and audited)
    - `POST /api/orders/[id]/refunds`
    - `GET /api/events/[id]/production`, `POST /api/events/[id]/production`
- **Role-Appropriate Workspaces (`apps/live`)**:
  - Added Artist Workspace (`/artist`, `/artist/bookings`, `/artist/representation`, `/artist/profile`, `/artist/financials`) and Agent & Manager Workspace (`/agent`, `/agent/roster`, `/agent/inquiries`, `/agent/engagements`, `/agent/commissions`).
  - Expanded Organizer Workspace (`/organizer/bookings`, `/organizer/production`, `/organizer/team`) and converted `/my-tickets` (`/me/tickets`) into a Verified Self-Service Order & Pass Lookup portal without requiring a casual attendee account.
- **Verification Evidence**:
  - `pnpm api:check`: **Pass (Redocly lint 0 errors, bundle/type/validator check clean, `scripts/api/contract.test.ts` 11/11 tests, 30/30 operations verified over loopback HTTP)**
  - `pnpm exec tsx --test scripts/audit/security.test.ts`: **Pass (16/16 adversarial security tests)**
  - `pnpm test`: **Pass (41/41 unit & vertical-slice tests across 8 suites, including `PLATFORM_BRAND` sanitization, `MINOR_SAFEGUARDING_REQUIRED`, `BOOKING_OFFER_IMMUTABLE`, `DEPOSIT_COLLECTION_DISABLED`, and `reconcileEventSettlement`)**
  - `pnpm typecheck`: **Pass (6/6 apps + `@gamo/api-contracts`)**
  - `node apps/live/scripts/verify-ui.mjs`: **Pass (170 responsive route checks across 34 routes × 5 widths `390, 768, 1024, 1440, 1920`, all local links HTTP 200, all interactive checks pass, 0 console/page errors)**
  - Screenshots captured in `docs/screenshots/2026-refresh/live-resume/` (`home`, `artist`, `agent`, `my-tickets`, `organizer`, `organizer-scan`, `promote-create`, `events-harvest-night-of-gospel`, `checkout`, `ticket` at 390px and 1440px).

## 2026-10-14 — Gamo Live Software Name Retained (`PLATFORM_BRAND = "Gamo Live"`)

- **Decision Recorded**: Retained **Gamo Live** as the working and customer-facing software name across `apps/live`; paused the alternative standalone brand search; recorded trademark clearance as pending legal consultation and domain selection as deferred while keeping the configurable brand layer (`PLATFORM_BRAND`, `getPlatformBrandConfig`, `resolvePlatformBrandConfig`) intact for future rebranding.
- **Configuration & Test Updates**:
  - Updated `apps/live/wrangler.toml` (`[vars]`, `[env.preview.vars]`, `[env.production.vars]`) to set `PLATFORM_BRAND = "Gamo Live"`, `PLATFORM_IS_LIVE_DOMAIN = "false"`, and `PLATFORM_SUPPORT_EMAIL = "support@live.gamostudios.local"` explicitly while preserving existing domain settings and fallback sanitization in `@gamo/domain` and `@studio-gamo/ui`.
  - Updated Step 10 in `packages/domain/src/services/live-slice.test.ts` to assert **Gamo Live** retention and placeholder sanitization without introducing alternative brand names.
  - Updated `docs/DECISIONS.md` and `docs/GAMO_LIVE_AND_PARTNERS.md` with the six naming status attributes.
- **Authorized Push, Remote D1 Migration & Production Deployment**:
  - Formatted triggers in `packages/db/migrations/0006_live_standalone_platform.sql` with single-line `BEGIN SELECT RAISE(...); END;` statements for Wrangler's remote D1 SQL splitter and applied migrations `0005_admin_password_credentials.sql` and `0006_live_standalone_platform.sql` (56 commands) to both `gamo-db-preview` (`d7e12797-cc6c-4fa3-91c7-c192863e4812`) and `gamo-db-production` (`d6db9fe7-77c0-4a50-836e-3d1924f00b53`).
  - Deployed all six applications via `make deploy-all`:
    - `gamo-web` (`gamostudio.org`, `www.gamostudio.org`): Version `046e8f48-47c8-448e-935f-210745dab1f6` (HTTP 200)
    - `gamo-worship` (`worship.gamostudio.org`): Version `b12e8b99-e485-4b90-90aa-13637ceaf516` (HTTP 200)
    - `gamo-academy` (`academy.gamostudio.org`): Version `8e346493-d7ab-4ef2-98d3-0ecce756d024` (HTTP 200)
    - `gamo-live` (`live.gamostudio.org`): Version `bdc324e8-9072-4bec-8bff-d8e365aefc76` (HTTP 200 on `/`, `/artist`, `/agent`, `/api/artists`)
    - `gamo-production` (`production.gamostudio.org`): Version `e04ce2c2-db6f-422d-9cc0-1ca7c35f2ef4` (HTTP 200)
    - `gamo-admin` (`admin.gamostudio.org`): Version `a3b3cc44-781d-45ef-8f35-e295bbfdab62` (HTTP 302 login gate)

## 2026-10-14 — Admin Command Center Modernization, Analytics/Reporting/Exports & Public Pages Polish

- **Objective**: Modernize `apps/admin` into a full operational command center where administrators can control every program and entity (`Worship`, `Academy`, `Live`, `Production`, `Governance & Stewardship`, `System Controls & Safety Gates`, `Users`, `Organizations`, `Roles`, `Legal`), introduce interactive analytics graphs (`trend`, `bar`, `stacked`, `distribution`) with Graph/Table view toggles and 1-click CSV/JSON export across Admin and role dashboards (`organizer`, `artist`, `agent`, `church`, `musician`, `host`, `instructor`, `partner`, `client`), and polish public pages (`apps/live`, `apps/web`, shared footer).
- **Shared Dashboard Engine (`@studio-gamo/ui`)**:
  - Added `'download'` icon (`packages/ui/src/lib/icons.ts`, `packages/ui/src/components/Icon.astro`).
  - Extended `packages/ui/src/lib/dashboard.ts` with `chart` block type (`ChartPoint`, `ChartSeries`, `ChartSummaryMetric`), `exportReport?: 'csv' | 'json' | 'print'` on `DashAction`, `delta` and `deltaTone` on `stats` items, and `exportable`, `exportFilename`, and `rowAction` on `table` blocks.
  - Built `packages/ui/src/components/dashboard/AnalyticsChart.astro` supporting responsive SVG/CSS `trend`, `bar`, `stacked`, and `distribution` visualizations, interactive Graph / Data-table view toggle (`[data-chart-view]`), summary metric callouts, and 1-click CSV & JSON export (`[data-chart-export]`).
  - Upgraded `DataTable.astro`, `StatGrid.astro`, `DashBlocks.astro`, `DashDialog.astro`, `DashPageHeader.astro`, `QuickActions.astro`, `Panel.astro`, `WorkspaceScreen.astro`, `session-viewer.ts`, and `dashboard-client.ts` to support per-row operational control actions (`rowAction` prefilling `DashDialog` with the selected row's subject), table-level CSV/JSON exports, and full-page report CSV/JSON downloads (`[data-export-report]`).
- **Admin Command Center & Deep Analytics Hub (`apps/admin`)**:
  - Created `apps/admin/src/data/admin/analytics.ts` with 5 deep-dive Admin Analytics & Reporting screens:
    1. `analytics` — Executive Analytics Hub (34-screen telemetry, 6-month cross-program volume trend, program share distribution, and exportable 6-month master ledger).
    2. `analytics/programs` — Program Velocity & Utilization (`Worship`, `Academy`, `Live`, `Production`).
    3. `analytics/financials` — Financial & Settlement Ledger Analytics (strictly separating musician/instructor/artist/organizer pay from proposed Gamo administrative allocations, with zero unapproved deductions).
    4. `analytics/trust` — Trust, Vetting & Safeguarding Telemetry (Academy youth safeguarding verification, audition rubric distribution, QR scan replay blocks, and role audit metrics).
    5. `analytics/exports` — Data Exports & Scheduled Reports (10 canonical dataset schemas with 1-click CSV/JSON generation and custom query builder).
  - Expanded `apps/admin/src/data/admin/live.ts` from 4 to 8 operational control screens (`live/submissions`, `live/organizers`, `live/artists`, `live/agents`, `live/bookings`, `live/sponsored`, `live/tickets`, `live/policies`) so administrators can verify/control artists, audit agent representation scopes & exclusive-conflict triggers, inspect booking negotiations/engagements, and govern ticket orders, holds, QR admission scans, and finance-scoped refunds.
  - Added System Controls & Safety Gates (`/controls`) in `apps/admin/src/data/admin/organization.ts`, modernized `apps/admin/src/pages/legal.astro` into a full interactive Legal, Operator Disclosures & Gate Readiness workspace, and upgraded all `worship.ts`, `academy.ts`, `production.ts`, and `nonprofit.ts` screens with charts, interactive `rowAction` controls, and CSV/JSON exports (34 total screens in `apps/admin`).
- **Role Dashboards Upgraded with Analytics & Exports**:
  - Added `chart` blocks, stat delta indicators, and CSV/JSON exports to `organizer.ts`, `artist.ts`, and `agent.ts` (`apps/live`), `church.ts` and `musician.ts` (`apps/worship`), `host.ts` and `instructor.ts` (`apps/academy`), `partner.ts` (`apps/web`), and `client.ts` (`apps/production`).
- **Public Pages Polish**:
  - Created `apps/live/src/components/explore/LiveEcosystemPillars.astro` and integrated it into `apps/live/src/pages/index.astro` to showcase the 4 connected Gamo Live workflows (`Discover & Attend`, `Organize & Promote`, `Represent & Book Talent`, `Produce Events`).
  - Replaced the redirect in `apps/live/src/pages/my-tickets.astro` with a dedicated, account-free public **Self-Service Order, QR Pass & Refund Lookup** portal wired to `POST /api/orders/lookup`.
  - Updated `packages/ui/src/components/SiteFooter.astro` (`Organizational Status` column) and `apps/web/src/pages/legal.astro` with clear Gamo Live brand retention & trademark pending disclosures and self-service order lookup links.
- **Verification**:
  - `pnpm exec tsx --test scripts/audit/admin-analytics-workspaces.test.ts`: **Pass (4/4 tests verifying all 34 Admin screens, all 5 Analytics screens, all 8 Live Admin screens, and all 9 role workspaces)**
  - `pnpm typecheck`: **Pass (0 errors across all 6 apps and packages)**
  - `pnpm test`: **Pass (41/41 tests across 8 suites)**
  - `pnpm api:check` & `pnpm exec tsx --test scripts/audit/security.test.ts`: **Pass (30/30 OpenAPI operations, 11/11 contract tests, 16/16 security tests)**
  - `pnpm build`: **Pass (6/6 apps built cleanly)**
  - Playwright browser verification across 13 Admin routes and 11 Live routes: **HTTP 200, 0px horizontal overflow, 0 console errors**, with screenshots saved to `docs/screenshots/admin-command-center-1440.png`, `docs/screenshots/admin-analytics-1440.png`, `docs/screenshots/admin-live-artists-1440.png`, and `docs/screenshots/live-my-tickets-1440.png`.

## 2026-10-15 — Production Readiness Phase 1: Real Authentication, Onboarding, and Public-to-Workspace Journeys

- **Objective**: Transition Gamo Studios (`apps/web`, `apps/live`, `apps/worship`, `apps/academy`, `apps/production`, `apps/admin`) from development-era demo personas and unpersisted prototype forms to real server-enforced authentication, organization onboarding, persistent participation inquiries, verified ticket recovery, and honest empty-state workspaces.
- **Shared Identity, Session & Page Authorization (`packages/auth`, `packages/domain`, `packages/ui`)**:
  - Implemented `evaluateWorkspacePageAccess(...)` (`packages/auth/page-access.ts`) and wired `src/middleware.ts` across all 5 public apps (`web`, `live`, `worship`, `academy`, `production`) to enforce server-side session and role checks before rendering any workspace route (`/account`, `/partner*`, `/organizer*`, `/artist*`, `/agent*`, `/me/tickets*`, `/workspaces*`, `/promote/create*`, `/church*`, `/musician*`, `/family*`, `/host*`, `/instructor*`, `/client*`).
  - Removed all `?demo_key=` query-parameter bypasses and automatic demo persona fallbacks; isolated local demo workspace preview strictly to loopback requests when `ENVIRONMENT=local` and `ALLOW_PUBLIC_DEMO_WORKSPACES=true`.
  - Standardized `/account`, `/account/signin`, `/account/signup`, and `/account/access-denied` (`403 Forbidden`) across `web`, `live`, `worship`, `academy`, and `production`, backed by shared `<AccountHub>` (`packages/ui/src/components/account/AccountHub.astro`) and `<VerifiedAuthPanel>` (`packages/ui/src/components/account/VerifiedAuthPanel.astro`) components and replicated `/api/auth/{challenge,verify,session,logout}` + `/api/organizations` endpoints.
  - Added `emptyWorkspaceScreen(...)` (`packages/ui/src/lib/workspace-empty.ts`) so newly authenticated users see honest empty states rather than fabricated metrics or sample records.
- **Gamo Studios Public Entry Points & Persistent Participation Workflow (`apps/web`, `apps/admin`, `0008_participation_inquiries.sql`)**:
  - Added D1 migration `packages/db/migrations/0008_participation_inquiries.sql` (`participation_inquiries` table + indexes) and `ParticipationService` (`packages/domain/src/services/participation.ts`).
  - Wired `apps/web` `/get-involved`, `/contact`, and `/partnerships` to persist inquiries to `POST /api/participation` and display submitted inquiries and staff review notes in `/account` (`GET /api/participation`).
  - Redirected legacy unpersisted multi-step mock forms (`/apply`, `/hire` on `worship`; `/register`, `/host-apply` on `academy`; `/assessment`, `/consultation` on `production`) with `303` to `apps/web` `/contact?interest=...`.
  - Added staff review queue (`GET /api/participation/review-queue`, `POST /api/participation/{id}/review`) and operational review UI at `apps/admin/src/pages/participation.astro`.
- **Gamo Live Public-to-Workspace Journeys & Verified Ticket Recovery (`apps/live`)**:
  - Updated `LiveHeader.astro` and `LiveFooter.astro` to expose clean public navigation (`Explore Events`, `For Organizers`, `Artists & Agents`, `Find My Tickets`, `Workspaces`, `Sign in`, `List an event`) without deep links into internal demo sub-routes.
  - Built `/artists` (public overview + CTA to authenticated artist/agent registration) and `/workspaces` (authenticated hub showing real submitted events, artist profile creation via `POST /api/artists`, and authorized workspaces).
  - Protected `/promote/create` behind authentication, prompting users without an organization to create one in `/account` first and persisting submitted events (`POST /api/events`) with `pending_review` moderation status.
  - Updated `/my-tickets` to require a verified 6-digit email challenge code (`POST /api/auth/challenge` + `POST /api/tickets/lookup`) before disclosing registrations or QR admission credentials, while stating honestly that SMS recovery is unavailable.
- **OpenAPI 3.1.1 Contract Synchronization (`openapi/`, `packages/api-contracts`)**:
  - Added `openapi/paths/participation.yaml`, `openapi/paths/replicated-auth.yaml`, and `ParticipationInquiry` schemas in `openapi/components/schemas.yaml`; regenerated `@gamo/api-contracts` types and standalone Ajv validators (`58/58` operations verified).
- **Verification Evidence**:
  - `ASTRO_TELEMETRY_DISABLED=1 pnpm typecheck`: **Pass (0 errors across all 6 apps and packages)**
  - `pnpm test`: **Pass (41/41 domain unit & vertical-slice tests)**
  - `pnpm exec tsx --test scripts/audit/auth-journeys.test.ts scripts/audit/page-access.test.ts scripts/audit/participation.test.ts scripts/audit/security.test.ts scripts/audit/admin-analytics-workspaces.test.ts`: **Pass (30/30 tests)**
  - `pnpm api:check` (`pnpm api:lint && node scripts/api/generate.mjs --check && node scripts/api/check.mjs && pnpm api:test`): **Pass (Redocly 0 errors, 12/12 contract test suites, 58/58 OpenAPI operations verified over loopback HTTP)**
  - `node scripts/audit/workers.mjs` & `node scripts/audit/browser-e2e.test.mjs`: **Pass**
  - `node scripts/audit/phase1-journeys-e2e.test.mjs`: **Pass (`PHASE1_FRESH_BROWSER_JOURNEYS_E2E_OK` across all 6 built Cloudflare Workers running in Miniflare with shared D1 and Playwright Chromium verifying all 8 fresh-browser user journey requirements)**

## 2026-10-15 — Approved Authentication UI (Gamo Studios) & UI/UX Design Standards ("Less, But Better")

- **Standing UI/UX Design Standards (`DESIGN.md` & Custom Agents)**:
  - Codified **UI/UX Design Standards: Design Restraint, Reference Fidelity & Professional Quality** in `DESIGN.md` (§10) and synchronized `.agents/agents/{design-lead,frontend-builder,ui-reviewer}/agent.md`.
  - Archived the approved authentication visual reference to `design-reference/authentication/gamo-studios-authentication-ui-collage.png`.
- **Reusable Authentication Component Architecture (`packages/ui/src/components/auth/*` + `packages/ui/src/lib/auth-flow-client.ts`)**:
  - Built 9 shared visual primitives in `packages/ui/src/components/auth/`:
    - `AuthSplitLayout.astro`: Centered horizontal split-screen shell on warm cream canvas (`#F5F0E7`).
    - `AuthPhotoPanel.astro`: Catalog-driven responsive `<Photo />` panel (`acousticLeader`, `girlGuitar`, `concertCrowdWide`, `soundEngineer`) with white `<Logo />` overlay and tonal lighting gradients.
    - `AuthCurvedDivider.astro`: Sculptural SVG cubic-bezier curved white divider overlapping the photograph on desktop (`lg:-ml-[112px]`) and rounded sheet transition on mobile/tablet.
    - `AuthNavBar.astro`: Top-right `"Already have an account? Sign in"` bar and top-left back arrow button.
    - `AuthFormHeader.astro`: Typographic header with `h1`, supporting text, and privacy-masked destination email (`yo•••u@example.com`).
    - `AuthStatusBanner.astro`: Accessible `aria-live="polite"` status banner (`[data-auth-status]`).
    - `AuthTextField.astro`: Accessible input field with optional leading mail icon and configurable `terracotta` or `lavender` focus ring.
    - `AuthPrimaryButton.astro`: Pill primary CTA button with `terracotta`, `lavender`, and `soft-lavender` variants and animated arrow.
    - `AuthCodeInput.astro`: 6-slot visual OTP grid (`[data-otp-slot="0..5"]`) with active lavender focus ring synchronized with an accessible `<input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required>`.
  - Built `packages/ui/src/lib/auth-flow-client.ts` (`initAuthFlow`, `maskEmailAddress`, `AUTH_SCREEN_COPY`), cleanly separating authentication API/state logic from visual presentation.
- **Four Gamo Studios Authentication Screens (`apps/web` only, pending cross-app review)**:
  - Implemented `GamoAuthExperience.astro`, `SignInScreen.astro`, `CreateAccountScreen.astro`, `VerifyEmailScreen.astro`, and `RecoverAccountScreen.astro` in `apps/web/src/components/account/` and wired `apps/web/src/pages/account/{signin,signup,verify,recover}.astro`.
  - Preserved `apps/{live,worship,academy,production}/src/pages/account/{signin,signup}.astro` on their existing `VerifiedAuthPanel.astro` until founder sign-off on the `apps/web` implementation.
- **Public & Workspace Design Restraint Refinements**:
  - Refined `apps/web/src/components/organization/InquiryForm.astro`, `packages/ui/src/components/account/AccountHub.astro`, and `apps/live/src/pages/workspaces.astro` to eliminate redundant eyebrow labels, multi-sentence boilerplate disclaimers, and duplicate panels while preserving all functional selectors and journeys.
- **Verification & Visual Evidence**:
  - `ASTRO_TELEMETRY_DISABLED=1 pnpm typecheck`: **Pass (0 errors)**
  - `pnpm test` & `pnpm exec tsx --test scripts/audit/*.test.ts`: **Pass (41/41 domain tests + 30/30 audit tests)**
  - `ASTRO_TELEMETRY_DISABLED=1 pnpm build`: **Pass (6/6 apps)**
  - `node scripts/audit/verify-auth-ui.mjs`: **Pass (`APPROVED_AUTH_UI_E2E_AND_SCREENSHOTS_OK` across `1920px`, `1440px`, `768px`, and `390px` viewports, verifying `naturalWidth > 0`, 0px horizontal overflow, keyboard focus, 6-digit clipboard paste, resend code, and account recovery)**
  - `node scripts/audit/phase1-journeys-e2e.test.mjs`: **Pass (`PHASE1_FRESH_BROWSER_JOURNEYS_E2E_OK`)**
  - Desktop (`1440px`) and mobile (`390px`) screenshots saved to `docs/screenshots/2026-refresh/auth-ui/auth-{signin,signup,verify,recover}-{1440,390}.png`.

## 2026-10-15 — Gamo Live Public Concert Discovery Launch (`apps/live`)

- **Objective**: Launch Gamo Live (`apps/live`) as a real, production-worthy Christian concert and worship event discovery platform and outbound ticket referral directory across 9 U.S. metros (`Phoenix, AZ`, `Atlanta, GA`, `Nashville, TN`, `Orlando, FL`, `Los Angeles, CA`, `Houston, TX`, `Seattle, WA`, `New York, NY`, `Oklahoma City, OK`), matching the approved `GAMO LIVE Concert Discovery Homepage.png` visual reference and `docs/GAMO_LIVE_AGY_LAUNCH_BRIEF_2026-10-15.md` specification.
- **Database Schema & Editorial Safety (`packages/db/migrations/0009_live_external_discovery.sql`, `packages/db/schema.ts`)**:
  - Added external discovery columns to `events` (`listing_type`, `editorial_status`, `external_ticket_provider`, `external_destination_kind`, `source_name`, `source_url`, `source_event_id`, `published_by_org_id`, `published_by_label`, `independent_disclosure`, `editorial_notes`, `last_verified_at`, `verified_by`, `published_at`, `published_by`, `metro_slug`, `postal_code`, `country_code`, `start_date_local`, `start_time_local`, `price_min_cents`, `price_max_cents`, `currency`, `performers_json`, `artwork_url`, `artwork_source`, `artwork_rights_verified`, `is_featured`, `canonical_dedupe_key`) plus `external_listing_revisions` and `external_outbound_clicks` audit tables.
  - Added SQLite triggers (`trg_no_ticket_tiers_on_external_discovery`, `trg_no_holds_on_external_discovery`, `trg_no_orders_on_external_discovery`, `trg_no_tickets_on_external_discovery`, `trg_no_settlements_on_external_discovery`, `trg_events_external_discovery_insert_check`, `trg_events_external_discovery_update_check`) enforcing at the database layer that external discovery listings never enter internal Gamo checkout, never publish without an HTTPS external URL and verified venue, and never display unverified artwork.
- **OpenAPI 3.1.1 v1.4.0 Contract & Domain Layer (`openapi/`, `packages/domain`)**:
  - Updated `openapi/root.yaml` (`1.4.0`), `openapi/components/schemas/live/{Event,EventDetails,EventFilters}.yaml`, `openapi/paths/events.yaml`, and `docs/API_COMPATIBILITY.md`; regenerated `@gamo/api-contracts` types and runtime validators.
  - Implemented `packages/domain/src/services/live-external-discovery.ts` and `verified-catalog-2026-10-15.ts`, plus `LiveService` discovery methods (`listDiscoverableEvents`, `listDiscoverableVenues`, `getMetroSummaries`, `ensureVerifiedCatalogSeeded`).
- **Repeatable Editorial CLI & 21-Candidate Import Audit (`scripts/live/editorial-cli.ts`, `docs/GAMO_LIVE_IMPORT_REPORT_2026-10-15.md`)**:
  - Implemented `pnpm live:publisher:provision`, `pnpm live:events:import`, `pnpm live:events:review`, and `pnpm live:events:publish` supporting `--dry-run` (default) and `--apply` (`--env local|staging|production`).
  - Audited all 21 candidate events in `gamo_live_verified_events_2026-10-15.json`: **18 approved & published**, **2 held (`needs_review`)** due to unverified TicketWeb destination URLs (`pat-barrett-atlanta-2026-11-22`, `chapman-powder-springs-2026-12-06`), and **1 rejected (`rejected`)** due to missing venue and ticket URL (`josiah-queen-duluth-2027-04-18`).
- **Frontend Pages, Metro SEO Routes & Outbound Referral Flows (`apps/live`)**:
  - Rebuilt `LiveHeader.astro`, `LiveFooter.astro`, `LiveDiscoveryCard.astro`, and `apps/live/src/pages/index.astro` to match the approved homepage reference (`Find your next live experience.`, 3-part pill search bar, working category/weekend/market filter chips, `CAIN Live and In Worship Tour with bodie` featured banner, and `For Organizers and Artists` split section).
  - Built `/events` discovery directory (with opt-in `#use-my-location-btn`, search/metro/category/date/saved-events filters), `/events/[id]` dual route supporting all 9 SEO metro landing pages (`/events/phoenix-az`, etc.) and individual event detail pages (with `Event` JSON-LD, Google Maps links, and direct `https://` ticket provider CTAs), `/events/[id]/register` external referral safeguard, `/venues` directory, `/sitemap.xml`, and `/robots.txt`.
- **Verification & Visual Evidence**:
  - `pnpm test`: **Pass (45/45 tests across 9 suites)**
  - `pnpm api:check`: **Pass (12/12 contract suites)**
  - `node scripts/verify-live-discovery-launch.mjs`: **Pass (Desktop `1440px` & Mobile `390px` Playwright verification, 0px horizontal overflow, outbound ticket URLs verified)**
  - Screenshots saved to `artifacts/screenshots/live-launch-2026-10-15/`:
    - `artifacts/screenshots/live-launch-2026-10-15/live-homepage-desktop-1440.png`
    - `artifacts/screenshots/live-launch-2026-10-15/live-homepage-mobile-390.png`
    - `artifacts/screenshots/live-launch-2026-10-15/live-events-directory-desktop-1440.png`
    - `artifacts/screenshots/live-launch-2026-10-15/live-events-directory-mobile-390.png`
    - `artifacts/screenshots/live-launch-2026-10-15/live-metro-phoenix-desktop-1440.png`
    - `artifacts/screenshots/live-launch-2026-10-15/live-metro-phoenix-mobile-390.png`
    - `artifacts/screenshots/live-launch-2026-10-15/live-event-detail-cain-desktop-1440.png`
    - `artifacts/screenshots/live-launch-2026-10-15/live-event-detail-cain-mobile-390.png`
    - `artifacts/screenshots/live-launch-2026-10-15/live-venues-desktop-1440.png`

## 2026-10-15 — Unified Authentication UI Rollout Across All Applications

- **Shared Authentication Component Architecture (`packages/ui/src/components/auth/`)**:
  - Established and refined the canonical shared authentication components in `packages/ui/src/components/auth/`: `AuthLayout.astro` (aliased by `AuthSplitLayout.astro`), `AuthForm.astro`, `AuthEmailInput.astro`, `AuthCodeInput.astro`, `AuthActions.astro`, `AuthFeedback.astro` (aliased by `AuthStatusBanner.astro`), `AuthPhotoPanel.astro`, `AuthCurvedDivider.astro`, `AuthNavBar.astro`, `AuthFormHeader.astro`, `AuthTextField.astro`, `AuthPrimaryButton.astro`, and `GamoAuthExperience.astro`, backed by `packages/ui/src/lib/auth-flow-client.ts`.
  - Removed duplicate app-local wrappers (`apps/web/src/components/account/{SignInScreen,CreateAccountScreen,VerifyEmailScreen,RecoverAccountScreen,GamoAuthExperience}.astro`) and converted `VerifiedAuthPanel.astro` into a thin compatibility shim delegating directly to `GamoAuthExperience.astro`.
- **Cross-Application Rollout (`chrome={false}`)**:
  - Updated `apps/live/src/layouts/Layout.astro` to gate `<LiveHeader />` and `<LiveFooter />` behind `{chrome && ...}` so authentication pages render zero public navigation or marketing footers, and updated `LiveHeader.astro` `Sign In` links to `/account/signin`.
  - Standardized `/account/{signin,signup,verify,recover}.astro` across `apps/web`, `apps/live`, `apps/worship`, `apps/academy`, and `apps/production` to render `<GamoAuthExperience mode="..." program="..." />` inside `<Layout chrome={false}>`.
  - Added the mandatory **Shared Authentication Design Rule** and component reference to root `AGENTS.md`.
- **Verification & Visual Evidence**:
  - `pnpm --filter "./apps/**" exec tsc --noEmit`: **Pass (0 errors)**
  - `pnpm exec tsx --test scripts/audit/security.test.ts`: **Pass (16/16 security tests)**
  - `pnpm build`: **Pass (6/6 applications)**
  - `node scripts/audit/verify-auth-ui.mjs`: **Pass (`APPROVED_AUTH_UI_E2E_AND_SCREENSHOTS_OK` across all 5 applications and all 4 screens at `1920px`, `1440px`, `768px`, and `390px`)**
  - `node scripts/audit/phase1-journeys-e2e.test.mjs`: **Pass (`PHASE1_FRESH_BROWSER_JOURNEYS_E2E_OK`, including `/account/signin?next=%2Fpromote%2Fcreate` -> `/account/signup?next=%2Fpromote%2Fcreate` -> OTP verification -> `/promote/create` redirect on Gamo Live)**
  - Desktop (`1440px`) and mobile (`390px`) screenshots saved to `docs/screenshots/2026-refresh/auth-ui/auth-{signin,signup,verify,recover}-{1440,390}.png` (Gamo Studios) and `docs/screenshots/2026-refresh/auth-ui/live-auth-{signin,signup,verify,recover}-{1440,390}.png` (Gamo Live).

## 2026-10-15 — Product Account Independence Architecture & Cross-Product Isolation

- **Database Schema & Non-Destructive Migration (`packages/db/migrations/0010_product_accounts.sql`, `packages/db/schema.ts`, `packages/db/index.ts`)**:
  - Added `product_accounts` table (`id`, `user_id`, `product`, `status`, `onboarding_status`, `created_at`, `updated_at`) with unique index `product_account_user_product_unique` on `(user_id, product)` and added `sessions.product`.
  - Non-destructively backfilled `product_accounts` from existing product-specific user records (`events`, `artist_profiles`, `ticket_orders`, `musician_profiles`, `service_requests`, `enrollments`, `instructors`, `production_requests`, `participation_inquiries`, `sessions`) so existing valid user records are preserved without granting blanket cross-product accounts.
- **Scoped Authentication, Sessions & Middleware Isolation (`packages/auth/index.ts`, `packages/auth/page-access.ts`, `packages/domain/src/api/page-middleware.ts`, `packages/domain/src/services/identity.ts`, `packages/domain/src/http/auth.ts`)**:
  - Added `ProductKey`, `PRODUCT_DISPLAY_NAMES`, `hasProductAccess(auth, product)`, `requireProductAuth(request, db, product, secret)`, `ensureProductAccount`, `hasProductAccount`, and `getProductAccounts`.
  - Updated `issueEmailChallenge` and `verifyEmailChallenge` to accept `intent` (`'signin' | 'signup' | 'recover'`) and `product`, rejecting `signin` with `403 FORBIDDEN` when a user has accounts in other products but has not registered for the target product, and enrolling the user only in the target `product` upon verification.
  - Bound each application's `/api/auth/{challenge,verify,session,me}` and `/api/organizations` routes to its owning product (`'web'`, `'live'`, `'worship'`, `'academy'`, `'production'`) via `createAuthHandlers(defaultProduct)`.
  - Updated `canAccessPage` and `applicationPages` so sessions and memberships for one product (e.g., Gamo Live) cannot access private routes on another product (e.g., Gamo Academy `/account` or `/family`), returning a `303` redirect to `/account/access-denied` (`403`).
- **OpenAPI 1.5.0 Contract Updates (`openapi/root.yaml`, `openapi/components/schemas/identity/*`, `docs/API_COMPATIBILITY.md`)**:
  - Added `intent` and `product` to `AuthChallengeInput` and `AuthVerifyInput`, and `products` and `sessionProduct` to `AuthMeResponse`; regenerated `@gamo/api-contracts` types and runtime Ajv validators.
- **Shared UI Components with Product-Specific Copy & Gamo Live Onboarding (`packages/ui/src/lib/auth-flow-client.ts`, `packages/ui/src/components/auth/*`, `packages/ui/src/components/account/AccountHub.astro`)**:
  - Configured `getAuthScreenCopy(program)` so registration headings read `Create your ${program} account` (e.g., **Create your Gamo Live account**) and supporting copy refers only to that product.
  - Removed all occurrences of `"One account for Gamo Worship, Gamo Academy, Gamo Live, and Gamo Production."` across components, pages, data catalogs, and tests.
  - Updated `AccountHub.astro` with product-scoped account status and explicit **Gamo Live Onboarding & Access** cards requiring separate organization or artist onboarding and authorization for privileged organizer/artist/agent actions.
  - Added the permanent **Product Account Independence Rule** to root `AGENTS.md`.
- **Verification & Visual Evidence**:
  - `pnpm tsx --test scripts/audit/page-access.test.ts scripts/audit/auth-journeys.test.ts`: **Pass (10/10 tests, including cross-product isolation between Live, Academy, Worship, and Production)**
  - `pnpm test`: **Pass (45/45 domain and database tests)**
  - `pnpm api:check`: **Pass (OpenAPI lint, bundle check, and 12/12 HTTP contract suites across 58 operations)**
  - `pnpm build`: **Pass (6/6 applications)**
  - `node scripts/audit/verify-auth-ui.mjs`: **Pass (`APPROVED_AUTH_UI_E2E_AND_SCREENSHOTS_OK`)**
  - `node scripts/audit/phase1-journeys-e2e.test.mjs`: **Pass (`PHASE1_FRESH_BROWSER_JOURNEYS_E2E_OK`, verifying in real Chromium browsers that a newly registered Gamo Live session cannot access Gamo Academy `/account` or `/family` and cannot sign in on Academy without creating an Academy account)**
  - Screenshots updated at `docs/screenshots/2026-refresh/auth-ui/auth-{signin,signup,verify,recover}-{1440,390}.png` and `docs/screenshots/2026-refresh/auth-ui/live-auth-{signin,signup,verify,recover}-{1440,390}.png`.
- **Authorized Push, Remote D1 Migrations & Production Deployment**:
  - Applied pending remote D1 migrations (`0008_participation_inquiries.sql`, `0009_live_external_discovery.sql`, and `0010_product_accounts.sql`) to both `gamo-db-preview` (`d7e12797-cc6c-4fa3-91c7-c192863e4812`) and `gamo-db-production` (`d6db9fe7-77c0-4a50-836e-3d1924f00b53`).
  - Deployed all six applications to Cloudflare production:
    - `gamo-web` (`gamostudio.org`, `www.gamostudio.org`): Version `3623944a-d0b3-4520-9ba0-8b2baf447763` (HTTP 200)
    - `gamo-worship` (`worship.gamostudio.org`): Version `5692498a-4639-4d02-86ae-2aece7455333` (HTTP 200)
    - `gamo-academy` (`academy.gamostudio.org`): Version `bbb71aea-bc8c-41b6-ad38-d11e177275ab` (HTTP 200)
    - `gamo-live` (`live.gamostudio.org`): Version `8a9de5ae-2749-4f8c-94e5-26473ad34c8d` (HTTP 200 on `/` and `/account/signup`)
    - `gamo-production` (`production.gamostudio.org`): Version `9ac3225a-2d7a-4aef-8c48-a7e4a3a82e1c` (HTTP 200)
    - `gamo-admin` (`admin.gamostudio.org`): Version `e0bce5c2-c448-4a40-86a6-c9d08e65fa9a` (HTTP 302 login gate)

## 2026-10-15 — Real Database Events on `gamostudio.org/live` & Past Event Closure Rule

- **Real Database Events on `/live` (`apps/web/src/pages/live.astro`, `apps/web/src/data/live-marketing.ts`)**:
  - Updated `apps/web/src/pages/live.astro` (`export const prerender = false;`) to query D1 directly via `LiveService.ensureVerifiedCatalogSeeded()` and `LiveService.listDiscoverableEvents({ limit: 100 })`, replacing static sample events (`"Harvest Night of Gospel"`, etc.) with real database events (`Elevation Worship & Steven Furtick — Fall Tour 2026`, `Revelation Nights`, `Blessing Offor — Heart So Real Tour Pt. 2`, `CeCe Winans — COME WORSHIP! Tour`, `CAIN Live and In Worship Tour with bodie`, `Bethel Music 2026 Tour`, `Crowder LIVE!`, etc.).
- **Past Event Closure Rule (`@gamo/domain`, `packages/ui`, `apps/web`, `apps/live`, `AGENTS.md`)**:
  - Added `isEventPast` and `getEventLifecycleStatus` to `@gamo/domain` (`packages/domain/src/services/live-external-discovery.ts`) and enriched `LiveEventWithDetails` in `LiveService` with `isPast`, `isClosed`, and `lifecycleStatus`.
  - Updated `LiveService.listDiscoverableEvents` and `mapDbEventsToMarketingEvents` to sort upcoming events ahead of past events and mark any event whose scheduled date/time has passed as `isPast = true`, `isClosed = true`, `status = 'past'`.
  - Added `kind="past"` (`Past · Closed`) to `StatusPill.astro`, `EventPills.astro`, `TrustLegend.astro`, `EventSpotlightHero.astro`, `EventCard.astro`, `FreeAndTicketed.astro`, `LiveDiscoveryCard.astro`, `apps/live/src/pages/events/[id]/index.astro`, and `apps/live/src/pages/events/[id]/register.astro`.
  - Added the permanent **Past Event Closure & Real Database Events Rule** to `AGENTS.md` and `docs/DECISIONS.md` (Decision 014).
- **Verification & Visual Evidence**:
  - `node --test packages/domain/src/services/live-external-discovery.test.ts`: **Pass (5/5 tests, including past-event closure and chronological sorting)**
  - `node scripts/verify-live-discovery-launch.mjs`: **Pass (full 1440px desktop & 390px mobile Playwright verification; updated `artifacts/screenshots/live-launch-2026-10-15/gamo-live-marketing-desktop-1440.png`)**

## 2026-10-16 — Monorepo Environment Architecture & Per-Application Clerk Credential Isolation

- **Environment Architecture Audit & Loader (`packages/config/env-loader.ts`, `packages/config/env-loader.test.ts`, `apps/*/astro.config.mjs`)**:
  - Audited `make dev`, `@astrojs/cloudflare` (`wrangler-config.js`), and `@cloudflare/vite-plugin` (`unstable_getMiniflareWorkerOptions` / `unstable_getVarsForDev`). Confirmed that Wrangler's default dev loader resolves `.dev.vars` or `.env` only within each application's own directory (`apps/<app>`) and skips `.env` whenever `.dev.vars` exists.
  - Implemented `createGamoCloudflareConfig(app, import.meta.url)` and `resolveAppLocalEnv` in `packages/config/env-loader.ts` and wired it across all six `astro.config.mjs` files (`web`, `live`, `academy`, `worship`, `production`, `admin`).
  - During local development (`make dev`, `make dev-all`, `make dev-<app>`), each app inherits shared non-product-specific settings (`ENVIRONMENT`, `SESSION_SECRET`, `ALLOW_DEMO_SESSION`, `ALLOW_TEST_CHALLENGE_OUTBOX`, `REQUIRE_ADMIN_AUTH`, `RESEND_API_KEY`) from root `studio-gamo/.env` while loading its own isolated Clerk credentials from `apps/<app>/.env` and `apps/<app>/.dev.vars`.
  - Both standard Clerk SDK variable names (`PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_ISSUER`, `CLERK_APP_ID`, `CLERK_AUTHORIZED_PARTIES`) and product-suffixed variable names (`*_LIVE`, `*_WEB`, `*_ACADEMY`, `*_WORSHIP`, `*_PRODUCTION`) are supported inside each application's directory without duplicating secrets or permitting cross-product leakage.
  - Production and preview builds (`make deploy-*`, `make preview-*`) never inject local `.env` or `.dev.vars` secrets into generated `dist/server/wrangler.json` bundles.
- **Templates, `.gitignore` & Documentation (`.gitignore`, `apps/*/.gitignore`, `.env.example`, `apps/*/.env.example`, `apps/*/.dev.vars.example`, `docs/CLERK_ARCHITECTURE_AND_MIGRATION.md`)**:
  - Updated root and per-application `.gitignore` rules so all `.env`, `.env.*`, `.dev.vars`, and `.dev.vars.*` files are ignored by Git while `!.env.example` and `!.dev.vars.example` remain tracked.
  - Added safe `.env.example` templates at the repository root and inside `apps/web`, `apps/live`, `apps/academy`, `apps/worship`, `apps/production`, and `apps/admin`, and updated `.dev.vars.example` files and `docs/CLERK_ARCHITECTURE_AND_MIGRATION.md`.



## 2026-10-18 — Crawler access and SEO basics (not committed, not deployed)
- Per-app `robots.txt` / `sitemap.xml` via `packages/ui/src/lib/crawlers.ts`; `llms.txt` on apps/web.
- `BaseLayout`: canonical (app origin, no query; omitted on private/account pages), Open Graph/Twitter tags, optional JSON-LD; `og:image` omitted until a 1200x630 image is supplied.
- Unique 120–155 char descriptions on every marketing page; Organization JSON-LD on web home; Event JSON-LD on Live `/events/[id]` (offers only with a real price).
- Cache: marketing pages still `private, no-store` because `SiteHeader` renders signed-in state and `/contact` + `/partners/interest` render the user's name/email. `pageCacheControl()` in `packages/auth/page-access.ts` holds the switch (`MARKETING_PAGES_CACHEABLE`); `packages/auth/page-cache.test.ts` guards private pages.
- Known pre-existing test failure: live-external-discovery "past events sort" (date-dependent; the seeded 2026-10-17 event is now past).

## 2026-10-18 — Status claims, share images, test fix (not committed, not deployed)
- Removed nonprofit / tax-exempt / tax-deductible wording from public pages, workspaces and Gamo Live brand disclosure; approved wording is "Christian, mission-driven Public Benefit Corporation" (AGENTS.md updated). llms.txt and Organization JSON-LD use the same wording.
- `scripts/generate-share-images.mjs` writes og-image.png (1200x630) and logo-512.png to each public app from the vector wordmark; `og:image`/`twitter:image` default in `BaseLayout`.
- `live-external-discovery.test.ts` ordering test now builds its own upcoming and past fixtures relative to now.

## 2026-10-18 — Release blockers: secrets script, e2e Clerk isolation, deploy-build hygiene (not deployed, not pushed)
- `scripts/set-clerk-secrets.sh`: refuses production writes from tests/CI and without an interactive terminal (`--yes` removed), requires `pk_live_`/`sk_live_` for production, requires a temp-directory stub `WRANGLER_BIN` under tests. Root cause: `scripts/clerk/clerk-tools.test.ts` ran `--env production` without `--yes`; `[ -r /dev/tty ]` is true inside a terminal, so the prompt appeared.
- e2e failures (live auth screens ×2, worship onboarding redirect, worship marketing link check) were local configuration, not product bugs: production Clerk keys in `apps/live/.dev.vars` (400 from Clerk on sso-callback) and Gamo Live's Clerk app id in `apps/worship/.dev.vars` (guard → 503 on private pages). Test servers now run with Clerk off; see DECISIONS 2026-10-18.
- Deploy builds: local `PUBLIC_CLERK_PUBLISHABLE_KEY` and admin `CF_ACCESS_*` were inlined into production server chunks and `dist/server/.dev.vars` was left in dist; fixed by `gamoDeployBuildHygiene` (verified by production builds of all six apps and a value scan of `dist`).

## 2026-10-19 — Admin CSP: per-request nonce for Cloudflare's injected script (not committed to a remote, not deployed)
- Console error on the admin sign-in (`/security?welcome=1`): inline script blocked by `script-src 'self'`, a different sha256 on every load. Not from our code: no admin page (49 crawled from the production build, plus the middleware-rendered gateway sign-in) has an inline `<script>`, `on*=` handler or `javascript:` URL. The per-load hash matches Cloudflare JavaScript Detections (injected into HTML, enabled automatically by Bot Fight Mode), which per Cloudflare's docs reads a `nonce` from the CSP header and stamps it on its script.
- Admin responses now carry `'nonce-<16 random bytes>'` in `script-src` (`generateCspNonce()` in `packages/domain/src/http/security-headers.ts`, set in `apps/admin/src/middleware.ts`). No `'unsafe-inline'`. Not confirmed on the live zone from here (admin is behind Access); confirm after the next deploy that the console error is gone.
- Tests: `security-headers.test.ts` (nonce unit cases) and `scripts/audit/admin-csp-e2e.test.mjs` (built admin worker; fails on an inline script/handler the CSP would block; checked by adding one to `security.astro`).
- Other apps send the same CSP without a nonce and would show the same error where Cloudflare injects the script into their HTML; not changed (admin only was asked).

## 2026-10-19 — Admin sign-in loop in production: Access assertions never verified (not deployed, not pushed)
- Symptom: after "Sign in to Operations Gateway" the page reloads on `/security?welcome=1` with empty fields. Reproduced in Chromium against the built admin worker served as production serves it (`scripts/e2e/admin-server.ts`: ENVIRONMENT=production, Secure cookies, enforced CSP, Access verified with a locally answered JWKS): `POST /__admin_auth/login` → 303 with both cookies stored → `GET /security?welcome=1` → 401 gateway page again.
- Root cause: `verifyCloudflareAccessJwt` fetched the Access signing keys with `redirect: 'error'`, which the Workers runtime rejects with a TypeError ("won't be implemented ... at the edge"). Every Access assertion therefore failed verification. The middleware only checks the gateway session when no assertion is present or the assertion is valid, so with Access in front (an assertion on every request) the signed-in session was never honoured. The inline-script CSP message was Cloudflare's own injected script and unrelated to the loop (the nonce added earlier today stays; it only lets that script run).
- Fix: `redirect: 'manual'` (a redirect is a non-2xx response and is refused). Refusals now log a fixed reason code (`[admin] Cloudflare Access assertion rejected: <reason>`), never token or config values; `VerificationResult.reason` is new and additive.
- Tests: `scripts/audit/cf-access.test.ts` (redirect mode, reason codes), `tests/e2e/admin-signin.spec.ts` (wrong password; temporary password → forced change → workspace → sign out → old password refused; JavaScript disabled; tampered assertion), run with `pnpm --filter apps-admin build && E2E_APPS=admin pnpm exec playwright test tests/e2e/admin-signin.spec.ts --workers=1`. With `redirect: 'error'` put back, the spec fails.
- Playwright now starts the admin server for `E2E_APPS=admin` (and in the default full run).

## 2026-10-19 — Admin rebuilt from scratch: gate and clay shell (not deployed, not pushed)

- New `apps/admin` (Astro 7 + Cloudflare adapter, worker name `gamo-admin-next`, no production environment until cutover; the old `gamo-admin` worker stays live). Plan: `docs/ADMIN_REQUIREMENTS.md`.
- Gate: Cloudflare Access only. Every request needs a valid Access assertion whose email is `ADMIN_EMAIL`; anything else is a plain 401/403/503 (no sign-in page, accounts, sessions, passwords or emergency credentials). Local development only: `ALLOW_LOCAL_ADMIN_IDENTITY=true` on a loopback host with `ENVIRONMENT=local` (fatal elsewhere).
- Shell in the claymorphism design: tokens in `src/styles/clay.css` (darker text/primary colors than the sheet so contrast passes AA), floating panel, sidebar (desktop) / bottom tab bar (mobile), admin chip, Inbox with real counts and the longest-waiting items, 404/500 in the same shell. Nav lists only existing pages (Inbox).
- Checked on the running dev server against sample rows in the local D1: screenshots at 1440 and 390 px; axe (WCAG 2.2 AA) clean and no horizontal overflow at 1440 and 360 px on `/` and a 404; production build succeeds. Not run: `scripts/audit/admin.test.ts` and the extended `packages/config/env-validation.test.ts` (written, run only on request), browser CSP check against the built worker.

## 2026-10-19 — Admin: church verification and provider review (not deployed, not pushed)

- Review services reshaped for one admin: `AdminActor { name }` (the admin's email) replaces staff users; `verification_records.staff_user_id` is the fixed id `admin`; self-review rules, the staff-role check and `moderation_reviews` writes are gone; `AdminService.reviewEvent` returns `{ event, firstApproval }`. Tests updated to match (not run).
- Pages in `apps/admin`: `/churches`, `/providers` (status and role filters, oldest first, honest empty states and truncation note) and `/churches/[id]`, `/providers/[id]` (profile facts, decision history, decision forms; a profile is redirected to its own queue's URL). Decisions are plain same-origin form POSTs with a stale-form guard; the provider is emailed through the outbox and the page says whether it was. Sidebar badges and Inbox links come from real counts.
- Bug fixed on the way: the old profile page formatted dates with `dateStyle` plus `timeZoneName`, which throws, so a profile with history rendered nothing after its header. `formatWhen` in `lib/format.ts` replaces it (unit test added).
- Checked in a real browser against the local D1: schedule meeting → verify with notes for a church (Verify is not offered before the meeting), history, notices, provider email status; axe WCAG 2.2 AA clean and no overflow at 390 px. Not run: `scripts/audit/admin.test.ts` and the updated service tests.

## 2026-10-19 — Admin: first-event review (not deployed, not pushed)

- `/events` in `apps/admin`: events in `pending_review` (same query as the sidebar count), oldest submission first, each with organizer, date in its time zone, venue, category and admission, description, and why it is in review (first event, or the organizer is set to review every event). Approve, ask for changes, or reject (a note is required for the last two); the organizer switch "review every event". Forms POST to the page (same-origin check, conditional status change, `verification_records` row with actor `admin`); results come back as fixed messages; a second decision on the same event is a conflict.
- Honest limit shown on the page: organizers are not emailed about event decisions (the old admin did not either), so the note is kept with the decision only.
- Checked in a real browser against the local D1: reject without a note is refused, approve records the first approval, the switch toggles, ask-for-changes empties the queue to the honest empty state, badge follows; axe clean and no overflow. Unit test added to `scripts/audit/admin.test.ts` (not run).

## 2026-10-19 — Admin: participation requests (not deployed, not pushed)

- `ParticipationService.review(id, input)` no longer takes a reviewer: no self-review rule, `reviewed_by_user_id` stays empty (one admin). `scripts/audit/participation.test.ts` updated (not run).
- `/participation` in `apps/admin`: status filters (waiting oldest first, others newest first), each inquiry with who/what/when and the message, the admin's last reply, and a reply form (reply required; keep open or close). Plain same-origin POST, fixed result messages, honest empty state, truncation note. Nav item with a real badge; Inbox card and waiting-list rows link here.
- Checked in a real browser against the local D1: reply keeps an inquiry open as "Replied", close removes the form, the queue empties to the honest empty state and the badge follows; axe clean, no overflow at 1440 or 390 px. Unit test added to `scripts/audit/admin.test.ts` (not run).

## 2026-10-19 — Admin: legal registry (not deployed, not pushed)

- `/legal` in `apps/admin`, read-only: documents in the registry, legal-review progress, recorded acceptances (all versions), and one card per document (slug, version, status, review status, acceptances of the current version, link to the public page). A "not finalized" notice shows while any document still requires legal review. The page never writes (the old page ran `syncTermsDocuments` on every view); if the count query fails it says "Unavailable" instead of zero.
- Checked in a real browser: all 8 documents render, axe clean and no overflow at 1440 and 360 px. Unit test added to `scripts/audit/admin.test.ts` (not run).
- v1 screens are done: Inbox, participation requests, church verification, provider review, first-event review, legal. Still to do before cutover: browser checks against the built worker (CSP headers, anonymous denial over HTTP, axe), preview deployment and sign-in through real Access, then replacing the old worker.

## 2026-10-19 — Admin: full-page layout, collapsible sidebar, branding (not deployed, not pushed)

- Layout changed on the owner's review of localhost: the dashboard is the page itself (full viewport, no floating panel, no background blobs or gradient). The sidebar collapses to an icon rail and expands again (`scripts/sidebar.ts`, remembered per browser in localStorage, button hidden without JavaScript); collapsed rail keeps icons, tooltips, screen-reader labels and corner badge counts.
- Branding: the shared Gamo Studios logo with an "Admin" label (page titles "· Gamo Studios Admin"); the collapsed rail shows the official Gamo symbol (`/favicon.svg`). The made-up chip mark and "Operations" wording were removed.
- Fixed on the way: Tailwind only generates classes it can read literally, so the collapsed variants are written out in full in `Sidebar.astro`.
- Checked in a real browser: 288 px expanded, 80 px collapsed, persists across pages, axe clean in both states, mobile uses the bottom bar with no toggle.

## 2026-10-19 — Admin: app palette (not deployed, not pushed)

- Owner review: the admin uses the app palette used by every other app. `apps/admin/src/styles/clay.css` now imports the shared `tokens.css` and maps the clay accent scale onto terracotta/sand/tan/cream; stat-card chips use brand tints; the unused `@fontsource-variable/inter` dependency was removed (Inter comes with the shared tokens). Status words keep green/amber/red.
- Checked in a real browser: 9 pages at 1440 and 360 px, axe (WCAG 2.2 AA) clean, no overflow. A stale Vite dependency cache after `pnpm install` shows an "optimize deps" error until the dev server is restarted.

## 2026-10-19 — Admin: flat background and phone layout (not deployed, not pushed)

- No gradients anywhere (owner decision): one flat cream page, white cards and sidebar; a unit test fails if a gradient is added. Phone tab bar: short labels (Inbox, Requests, Church, Providers, Events, Legal) with the full name and waiting count as the accessible name, and the count badge outside the link text (axe `label-content-name-mismatch`).
- Checked against the running dev server at 360, 390 and 430 px on 9 pages each: axe (WCAG 2.2 AA) clean, no horizontal overflow, every tap target at least 44 px, no clipped tab label. Not run: the unit tests.

## 2026-10-19 — Admin: built-worker checks (not deployed, not pushed)

- `scripts/e2e/admin-server.ts` serves the BUILT admin worker under Miniflare as production does (`ENVIRONMENT=production`, enforced CSP, Cloudflare Access verified against a locally answered key set, every other outbound request refused, labeled sample rows) on port 4327 (never 4326, the dev server). `tests/e2e/admin.spec.ts` (8 tests, 8 pass, ~9 s): `pnpm --filter apps-admin build && E2E_APPS=admin pnpm exec playwright test tests/e2e/admin.spec.ts --workers=1`.
- What it proves against the built worker: without an Access assertion every path and method (pages, `/api`, unknown routes, `/signin`, `/500`) is 401 with no page content, no cookie, `no-store` and `noindex`; emergency-style headers and the plain Access email header open nothing; forged, wrong-audience, wrong-issuer, expired, garbage and other-person assertions are refused (401/403); every page has the real CSP (`script-src 'self' 'nonce-…'` with a fresh nonce per response, no `unsafe-inline`/`unsafe-eval`, no external origin, `frame-ancestors 'none'`, `form-action 'self'`), `X-Frame-Options: DENY`, `nosniff`, `noindex`, no cookies, no inline script or handler; the sidebar script runs under that CSP and the collapse is remembered; real counts and rows; axe + 360 px + 44 px targets + tab-bar names on 9 pages; 404, `/500` and missing records inside the shell; reply, verify, ask-for-changes, approve and a refused cross-site POST under the CSP, with no CSP console error anywhere. HSTS is only sent over HTTPS, so it is not exercised here.
- Not covered: real Cloudflare Access and the Workers runtime (Miniflare stands in), preview/production data. `scripts/audit/admin.test.ts` and the updated service tests remain unrun.

## 2026-10-19 — Rebuild phase 1 (production inventory) and phase 2 (rules and docs reset)

- Phase 1: read-only counts in production D1 — no real user data; only the old admin bootstrap user, the Live publisher and the 20-event Live catalog. Preview D1 empty. Public sign-up broken in production (CSP blocks Clerk). Details and decisions: `docs/REBUILD_PLAN.md`.
- Phase 2: `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `docs/RUNBOOK.md` rewritten; `DESIGN.md` and `design-reference/README.md` corrected; 31 retired rule and product docs deleted (list and carried-forward requirements in `docs/REBUILD_PLAN.md`). No code changed. Next: phase 3 removal, then Gamo Live requirements.

## 2026-10-19 — Rebuild phase 3: removal (not committed, not deployed, not pushed)

- Removed from the five public apps: accounts, API routes and workspaces (see `docs/REBUILD_PLAN.md` for the earlier list), plus the Academy "family journey" demo card. The apps now hold marketing pages only.
- `applicationPages()` (shared page middleware) is now marketing-only: environment check → legacy redirects → page → security headers, `Cache-Control: private, no-store`, no sessions, no Clerk origins. `SiteHeader` and `LiveHeader` no longer show Sign In.
- Forms that depended on accounts are replaced by an email contact (`hello@gamostudio.org`, subject pre-filled from `?interest=`): web `/contact` and `/partners/interest` (`EmailContact.astro`), Academy lesson pages ("Ask about this lesson"), Live "List an Event" and artist/agent links (`inquiryUrl`), organizer event pages (registration note). `providerSignupUrl()` now routes to the same contact page. This deviates from decision 3 of the rebuild plan ("forms keep working") because none of those forms completed in production.
- Retired URLs redirect (per-app `legacy-redirects.ts`); robots files only disallow `/api/` and `/account`.
- Backend pruned: `@gamo/domain` lost identity, persons, customers, Academy registrations, payments, media, ticketing, form guard, account/auth HTTP helpers and the Resend webhook verifier; `LiveService` kept only its read model and the editorial catalog import; `@gamo/auth` reduced to `AuthError` + `requireSameOrigin`; `@gamo/integrations` to the Resend adapter; `@gamo/api-contracts`, `openapi/`, `scripts/api`, the API docs and their dependencies removed. Preflight and `validateEnv` no longer require `SESSION_SECRET`, Clerk or Turnstile names.
- Deleted tests of removed code (auth, identity, ticketing, scanner, journeys, API contract, security, forms) and the e2e specs for removed flows; rewrote the tests for legacy redirects, crawler files, security headers, environment validation and preflight. `scripts/audit/provider-review.test.ts` and `event-review.test.ts` were deleted because their fixtures used the removed identity service; the admin's review services need new tests on the rebuilt data model.
- Checked: `astro check` for all six apps (0 errors), package typecheck, eslint (zero warnings), prettier, and `astro build` for the five public apps. Not run (owner's rule): unit tests, Playwright, journeys.
- Left for later: Clerk name filtering in `packages/config/env-loader.ts` and `set-clerk` leftovers in docs; the `audit_logs` backfill and drop migrations; `packages/db` schema/migrations (replaced with the fresh data model); `security-headers.ts` still has unused Clerk/Turnstile options; an untracked `packages/api-contracts/node_modules` folder remains (delete by hand).

## 2026-10-19 — Gamo Live rebuild, slices 1–3 (not committed, not deployed, not pushed)

- **Data model:** `packages/db/live/migrations/0001_live_core.sql` (organizers, organizations, memberships, venues, events, occurrences, performers, catalog sources, registrations, email codes, review decisions, rate limits…) per `docs/LIVE_DATA_MODEL.md`. Applied once to an in-memory SQLite to check the syntax; no database was created anywhere.
- **Read model:** `LiveCatalog` (`packages/domain/src/live/catalog.ts`) replaces the old `LiveService` for every public Live page and web `/live`. Only published (and canceled) events of active organizations; upcoming first, past ones "Past · Closed". The old `LiveService`, its import CLI and the web fallback list of bundled events were removed (an empty database now shows an honest empty state).
- **Catalog import:** `importCatalog` + `scripts/live/catalog-cli.ts` (local only; dry-run for preview/production). Imports queue for admin review unless `--publish-approved`.
- **Free registration:** `registration.ts` (capacity-safe batch reservation, 15-minute holds, emailed 6-digit code with 5 attempts, signed expiring manage link, cancel, optional QR check-in code with first-scan-wins) and `mail.ts`/`qr.ts`. Pages: `/events/<slug>/register`, `/events/<slug>/register/confirm`, `/registrations/<token>`, using the new shared `SplitScreenLayout` (the sign-in design: photo left, curved panel right; flat scrim, no gradients). The event page's action panel is state-aware (register, full, free-no-registration, past/canceled, external link).
- **Env/config:** `LIVE_DB` binding added to `apps/live` and `apps/web` (local only; preview/production need the owner-created databases, see `docs/RUNBOOK.md` §5). Local emails print to the dev server terminal.
- **Checked:** typecheck (all apps and packages), eslint (zero warnings), prettier, `astro build` for Live and web. **Not run (owner's rule):** all tests, including the new `registration.test.ts` and `catalog.test.ts`, and no browser check of the new pages yet.
- **Not built yet:** Clerk sign-in, organizer area, event editor, check-in screen, admin review screens, event emails beyond registration, the cleanup job for personal data. The artists pages now show performers without profile details (genre/city) because artist profiles no longer exist.

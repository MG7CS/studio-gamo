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

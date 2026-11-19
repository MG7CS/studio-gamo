# AGENTS.md — Gamo Studios Development Contract

You are the autonomous engineering team for **Gamo Studios** (`studio-gamo`). Treat this file as persistent project instructions. Follow `SECURITY.md` before every external integration.

> **2026-11-16 note:** public accounts, sign-in, Clerk, onboarding, provider profiles, the shared person record and all per-program dashboards were removed by owner decision. The former Shared Authentication, Product Account Independence and Independent Clerk rules are retired; see "Forms, emails and admin" below.

## Organizational mission (permanent — read first)

**We are building a Christian, mission-driven Public Benefit Corporation and its supporting software infrastructure — not a commercial startup designed to maximize revenue.** Gamo Studios is a **Public Benefit Corporation** (confirmed by the owner), formed to be mission-driven and not only profit-seeking. Gamo Academy, Gamo Worship and Gamo Production are the three interconnected programs serving one religious and educational mission, not independent profit centers. (Owner decision 2026-11-16, after talking with church ministers and pastors: Gamo Live — events, ticketing, scanner, Promote/Explore Events — was dropped; the four-program state is preserved at branch `archive/four-programs-2026-11-16` / tag `four-programs-snapshot`. A second cleanup (owner decision 2026-11-16; spec `docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`) turns the remaining programs into public pages, staff-editable forms, emails and invoices, with the admin dashboard as the only dashboard; see "Forms, emails and admin" below.) The authoritative reference is [`docs/GAMO_NONPROFIT_MODEL.md`](docs/GAMO_NONPROFIT_MODEL.md); it overrides any older commercial guidance anywhere in the repository.

- Evaluate success by religious and educational impact, program accessibility, service reliability, musician and instructor fairness, community trust, church collaboration, responsible stewardship, financial sustainability and long-term mission effectiveness.
- **Do not**, without explicit founder/board authorization: introduce commercialization strategies, maximize or add fees, turn free/sponsored programs into paid services, deduct from musician or instructor pay, or let payment/sponsorship/partnership affect vetting, rankings or trust signals.
- **Legal status (approved by the owner):** Gamo Studios is a **Christian, mission-driven Public Benefit Corporation**, formed to be mission-driven and not only profit-seeking. This PBC statement is approved wording and may be used on public pages, emails, llms.txt and structured data. A PBC is a for-profit company type: Gamo Studios is **NOT a nonprofit** and is **NOT tax-exempt**.
- **Never** write or imply "nonprofit", "non-profit", "not-for-profit", "501(c)(3)", "tax-exempt", "tax-deductible", "charitable", "charity" (for Gamo itself), or "donation/donor" language, on any public page, email, metadata or structured data. Do not add sentences about tax-exempt recognition, "legal status under evaluation" or deductible gifts. Also never claim IRS approval, registration numbers, committed board members, sponsors, donors or partner churches.
- Existing docs and file names that say "nonprofit" (for example `docs/GAMO_NONPROFIT_MODEL.md`, `docs/NONPROFIT_TRANSITION_CHECKLIST.md`) are historical names; where their text says nonprofit or tax-exempt, this PBC statement prevails.
- **Program order (owner, 2026-11-16):** Gamo Academy leads, then Gamo Worship, then Gamo Production — in navigation, program lists, homepage features and anywhere one program is featured first.
- Gamo Academy speaks first to students, parents and families. The approved headline is **"Learn to Play the Instrument You Love."**
- Age groups, levels, formats and instrument ages live only in `packages/config/academy-levels.ts` and `academy-instruments.ts`; never type them in pages or data files (`docs/academy/AGE_GROUPS_AND_LEVELS.md`).
- Musician pay and any Gamo administrative allocation are always separate line items; all fees, contributions and tiers remain proposals until approved.
- No donation, membership or sponsorship payment processing or language without owner approval.
- Avoid corporate growth language ("monetization engine", "revenue optimization", "acquisition funnel", "customer lifetime value") when describing the mission.

Financial sustainability is important, but it is subordinate to the mission.

## Required reading order

1. `docs/GAMO_NONPROFIT_MODEL.md` — **organizational source of truth** (purpose, programs, governance, sustainability, approval matrix; file name historical)
2. `README.md` — product and scope
3. `docs/ARCHITECTURE.md` — what the code does today
4. `docs/FRONTEND_ARCHITECTURE.md` — shared front-end rules, rationale and gaps
5. `DESIGN.md` — design system (§11: the owner's clean layout rules; read before any UI work)
6. `SECURITY.md` — mandatory gates
7. `ROADMAP.md` — done, now, next, production gate
8. `docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md` and `docs/superpowers/plans/2026-11-16-forms-emails-invoices.md` — forms, emails, invoices (cleanup two)
9. `docs/superpowers/plans/2026-11-16-frontend-foundation.md` — front-end foundation plan
10. `design-reference/README.md` — reference materials (design work)
11. `docs/NONPROFIT_TRANSITION_CHECKLIST.md` — formation and governance dependencies (owner-only actions; file name historical)

## Autonomy model & Active Priorities

- **Active priority (2026-11-16):** front-end foundation (`docs/superpowers/plans/2026-11-16-frontend-foundation.md`), then cleanup two Phase 2–4 (forms, roster/offers/invoices, admin + cron). Paid flows stay 503 in production until the owner approves real charges. References: `openapi/root.yaml`, `docs/ARCHITECTURE.md`, `docs/API_INVENTORY.md`.
- **Autonomy**: Agents autonomously make ordinary coding and design decisions, edit workspace files, run local builds and tests, resolve compilation errors, and continue through the screen inventory without asking for confirmation after every step.
- Preserve existing work and regularly update the progress log (`docs/BUILD_LOG.md`).
- Plan briefly, then execute continuously **within the currently approved application and design scope**. Stop for visual sign-off at the defined review checkpoint; never start an unapproved application.
- Work through the active plans' phases in order (see `ROADMAP.md`), end-to-end, unless blocked by protected external dependencies. Independent work continues even if one integration is blocked.
- Routine architectural and UI choices are your responsibility. Choose stable, supported technologies and document architectural decisions in `docs/DECISIONS.md`.
- Always inspect installed tool versions and vendor docs before pasting framework commands.
- Never silently add providers/services (Twilio, Firebase, Supabase, proprietary AI APIs, analytics etc.). Request approval for a new paid/external dependency; use adapters for future options.
- Never substitute fictional screenshots or invented test results for real browser evidence.

## Research first (owner rule, 2026-11-16)

Before fixing or improving anything non-trivial (UI/UX, shared components, architecture, performance, accessibility, security, a recurring bug), do web research first to gather ideas and current best practice: prefer official docs and recognised practitioners, check that the sources are current, and compare at least two approaches before choosing one. Briefly record what was found and chosen (sources and the decision) in the relevant doc (`docs/DECISIONS.md`, the spec or plan, or `docs/FRONTEND_ARCHITECTURE.md`). Every agent brief for such work must say to research first. Skip only for trivial changes (typos, copy edits, renames, mechanical refactors) and say so.

## Build sequence

`inspect → plan → scaffold → implement real vertical slice → test → inspect browser → improve → document → commit → next slice`

On each meaningful change:
- The functionality phase is authorized for forms, emails and invoices (cleanup two plan); no other new integrations without owner approval. Implement responsive, accessible UI with real validation and server-side authority for those flows.
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
- Frontend is not authority for authorization, approvals, offers or payments.
- Unit tests for domain logic, integration tests for D1/API/Stripe webhooks, and Playwright/browser checks for main flows.

### Established conventions (2026-10 foundation pass — see `docs/ARCHITECTURE.md`, `docs/CLEANUP_LOG.md`)

- **Test economy (owner direction, 2026-10-18):** while iterating run only the test file for the code you changed (`pnpm exec tsx --test <file>`, or `E2E_APPS=academy pnpm exec playwright test <spec>` after building just that app); use `pnpm check:quick` (lint, format, unit tests) as the cheap gate; run the full `pnpm check` (typecheck, build of all apps, journeys, whole Playwright suite) **once** per merge or release, never as a loop, and never run it while other test runs share the machine. One reviewer/test pass per change, not one per finding. Agents in parallel worktrees must not run the broad suites at all; the lead runs them once after merging.
- **Minimal testing (owner direction, 2026-11-18; stricter than test economy above):** write and keep tests only for what is expensive to get wrong: money (invoices, payments, fees), sign-in and access control, security headers, secrets and live-key guards, personal data and uploads, database migrations and data integrity, and public token links (offers). Everything else is checked by looking at the page, not by a test: no tests for layout, spacing, copy, photo choice, item counts or component variants; no screenshot baselines; no per-page link crawls; no design guard test unless an owner rule has already been broken twice. A new feature adds at most one happy-path and one failure-path test, and only in the critical areas above. The suite stays small (about 200 tests; adding a test means removing or merging one). While building run only the one test file for the code you changed; run the full `pnpm check` once, right before a deploy, never as a loop and never after each edit; never regenerate baselines. On 2026-11-18 the owner cut the suite by about 80%: the removed tests are in git history before that commit if one is ever needed again.
- **Commit messages:** one short sentence saying what was done (e.g. `Remove public accounts`) — no how, no details or body, no attribution of who did what (no `Co-Authored-By` or agent/task names).
- **`pnpm check` must pass before every merge or push; each commit needs `pnpm check:quick` plus typecheck.** The full check runs typecheck, lint (zero warnings), Prettier check, unit/integration tests, `api:check`, build, the Miniflare journeys and the Playwright smoke suite. In an agent shell, run Astro commands with `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT` so they stay in the foreground.
- **Hosts and ports** come from `packages/config/apps.ts`; cross-app links from `packages/ui/src/lib/sites.ts` (`siteUrl`, `inquiryUrl`). Never hard-code an origin.
- **Typed runtime:** read bindings through `getRuntimeEnv()` (`GamoEnv`) and `Astro.locals` (`GamoLocals`; only the admin app carries a staff session); never read secrets from `import.meta.env`. New env vars go in `packages/config/env.ts`, `env-validation.ts` (if required), the relevant `.dev.vars.example` and `docs/RUNBOOK.md` §3.
- **Middleware order** (`applicationPages`): public apps (web, academy, worship, production) run env check → page → security headers, with no public session and no private-page guard (there are no public accounts since 2026-11-16). The admin app adds the staff session and staff guard (Cloudflare Access + admin password) before the page. Any new private area belongs in admin, and also in admin's `robots.txt`; `scripts/audit/private-routes.test.ts` and `crawler-files.test.ts` enforce the crawler rules.
- **Renamed or removed URLs — until the first public launch:** the apps have never had real users (owner, 2026-11-18), so a removed address is simply removed: no redirect lists, no compatibility shims. **This ends at launch.** From the day a public site goes live, every renamed or removed URL that real people or search engines could have used gets a redirect again (add the middleware option back to `applicationPages`, keep the status the old route used: 301 for permanent moves, 303 for old form endpoints, and a test). Remove this exception from this file when the first public site launches.
- **API routes:** auth check first, then `requireSameOrigin` on every state-changing request, then validation; errors via `api/response.ts`. Change `openapi/root.yaml` first.
- **Fail closed:** integrations take `allowMock` only for `ENVIRONMENT=local`; outside local a missing key means the feature answers 503/unavailable, never a fake success. Local-only flags (the list in `packages/config/env-validation.ts`) are fatal elsewhere; the public sign-in and demo-workspace flags were retired with public accounts on 2026-11-16. Stripe stays in test mode (`assertStripeTestMode`) and paid checkout stays 503 until the owner approves real charges.
- **CSP:** no inline `<script>` or `on*=` handlers, no third-party script origins except Turnstile (`https://challenges.cloudflare.com`) on pages that show a protected form (Clerk origins were removed 2026-11-16); styles and fonts are self-hosted. Pages are on-demand (not prerendered) so middleware and headers always apply.
- **UI:** follow "Shared front-end architecture" below; semantic tokens from `packages/ui/src/styles` only (terracotta `#B34E24`, deep `#8F3B18`, soft `#D98B62`, ink `#18181B`, cream `#F9F6F0`, sand `#EDE6DA`); Inter (self-hosted variable); titles weight 900 uppercase; interactive targets ≥ 44 × 44 px; exactly one `<h1>` per page; every page passes axe WCAG 2.2 AA (serious/critical) and has no horizontal overflow at 360 px.
- **Sample content:** any fictional person, booking, event or story is visibly labeled *Sample*/*Example*. Sponsored content is always labeled and church partnership or payment never affects musician vetting or rankings (`docs/GAMO_NONPROFIT_MODEL.md` §4).
- **Database:** add a new numbered migration in `packages/db/migrations` (never edit an applied one; additive by default), update the Drizzle schema and `docs/DATABASE.md`. Local: `pnpm db:migrate:local`, `db:reset:local`.
- **Logs** name variables and error codes, never secret values or personal data.

## External operations require explicit permission

**Do not** deploy or publish to production, push to remotes, change DNS, modify secrets, spend money, send real emails, charge real cards, run live payouts, write destructive database migrations or perform other destructive operations, change security settings or policies, commit credentials, or publish legal terms as finalized without the owner's explicit approval. Local commits and sandbox payment/webhook simulations are allowed.

## Blocker handling

- Never say a live integration is complete without valid sandbox verification.
- When missing credentials, configure env bindings, provider interface, local mock and tests, then note exact credential/setup needed.
- If three different reasonable attempts fail, log details in `docs/BUILD_LOG.md`, isolate the blocker and continue elsewhere.
- Pause only for an unavoidable high-risk/owner-only decision, explicit policy violation or environment exhaustion; say precisely what is blocked.

## Definition of done

An assigned plan phase is done when its acceptance criteria pass and evidence is recorded. **The platform is not production-complete merely because its pages render**. Finishing the local plan phases and submitting a production-readiness handoff is a valid autonomous build deliverable; the production gate in `ROADMAP.md` requires owner approval and accounts/contracts.

## Final reporting

Report completed plan phases and tasks, commands/tests actually run, page URLs, screenshot artifact locations, commits, unfinished items, requested owner actions and known risks. Never claim work continued in the background if the agent process ended.

## Claude Code agents

Three Claude Code agents live in `.claude/agents/`:
- **`design-lead`**: interprets `design-reference/`, keeps visual consistency (Inter, brand tokens) and reviews screens without implementing complex logic.
- **`frontend-builder`**: implements Astro/Tailwind screens across web, Academy, Worship, Production and Admin by composing shared components.
- **`ui-reviewer`**: compares running screenshots with references, checks `docs/SCREEN_INVENTORY.md`, accessibility, responsiveness and the shared front-end rules.

All three apply the organizational mission rules above, the copy rules in `docs/GAMO_NONPROFIT_MODEL.md` §6–§7 and "Shared front-end architecture" below.

## Homepage composition

Composition targets for the global homepage below the hero are in `DESIGN.md` ("Homepage composition targets"). The approved hero is the current "Worship, Learning & Community" hero (`HomeEditorialHero`); preserve it unless the owner says otherwise.

## Shared front-end architecture (permanent; owner direction 2026-11-16)

**Goal:** all UI/UX polish lives in shared low-level pieces; apps and pages only assemble them. The shared shell survives when any app is deleted, serves any number of independent apps, and every improvement to a shared package reaches every app that uses it. Sources and rationale: `docs/FRONTEND_ARCHITECTURE.md`.

1. **Dependencies point one way:** page → app section/recipe → shared section/pattern → shared component → primitive → tokens. `packages/*` never imports from `apps/*` and never names a specific app, program, host, nav item, photo or page copy.
2. **The shell takes, it never looks up.** `BaseLayout`, header, footer, nav, error page and `DashboardShell` receive brand, nav items, footer groups, related programs, CTAs and route paths (sign-out, security, contact) as typed props or slots. Each app owns a `src/site.config.ts` manifest and passes it in. Deleting an app deletes its manifest and nothing in `packages/` changes.
3. **Cross-app links come from configuration, not code.** Origins resolve from app IDs in config (`packages/config/apps.ts` + `siteUrl`); an app lists the siblings it links to in its own manifest. Shared code may resolve an ID it is given; it never enumerates apps.
4. **Three token tiers.** Base tokens (raw palette, scale) → semantic tokens (roles: `surface`, `text`, `muted`, `action`, `on-action`, `border`, `focus`, `danger`, `success`; container widths, radii, type steps, aspect ratios, spacing, shadows) → component tokens (only inside a component's CSS). Apps and pages use semantic tokens only. Theming per app or program overrides semantic tokens on a wrapper (`data-program`, `data-surface`); components are never forked for a theme.
5. **One Tailwind source of truth in CSS.** `packages/ui/src/styles` owns `@theme`, `@layer` order and `@source` for shared components; app CSS imports it and adds nothing global except app-scoped tokens. No arbitrary values (`-[…]`), hex/rgb colours, inline `style=` or pixel font sizes in `apps/*`; a missing value becomes a token first.
6. **A small, excellent core, recipes at the edge.** `packages/ui` holds primitives (Container, Section, Stack/Grid, Heading, Text, Button/ButtonLink, Link, Badge, Card/LinkCard/MediaCard, Photo, Icon, form fields incl. Select/Fieldset/ChoiceCard/File, DataTable…) and patterns (PageHero, SplitHero, FeatureGrid, NumberedSteps, FAQ, CTA band, footer/header). Product-specific compositions ("recipes", e.g. `LessonCard`) live in the app; a recipe is promoted to `packages/ui` when a second app needs it. Do not generalise before the second real use.
7. **Composition over configuration.** Prefer named slots with fallbacks over boolean props; split a component past ~6–8 props or any mutually exclusive booleans. Variants are one `variant`/`tone`/`size` prop mapped to a `data-*` attribute that switches semantic custom properties — not new components.
8. **Components adapt to their slot.** Use container queries for cards and sections, logical properties for spacing, and no viewport assumptions inside components; layout decisions belong to the section or page.
9. **Quality is built into primitives.** Labels/errors/`aria-describedby` in fields, focus-visible rings, ≥ 44 × 44 px targets, reduced motion, colour contrast, heading levels by prop, one `<h1>` via the page template. Fixing a primitive must fix every app.
10. **Zero JS by default.** Server-rendered, progressively enhanced; interaction via bundled external modules (CSP: no inline scripts); islands only for true interaction; no `ClientRouter` (native cross-document view transitions only).
11. **Pages are thin.** A page file wires data and composes sections; markup longer than a screen moves into a section component. App sections compose shared primitives/patterns and contain no one-off styling.
12. **Governed by checks, not review.** Lint/audit tests enforce: no `apps/*` imports or app names in `packages/*`; no raw colours/arbitrary values in `apps/*`; shared components only via package exports. A private catalog page renders every shared primitive and pattern in every variant at 360 px and desktop, checked with axe and Playwright screenshots — the regression gate for shared changes.
13. **Change management.** Apps depend on shared packages with `workspace:*` (always HEAD). Deprecate before removing (`@deprecated` JSDoc, `$deprecated` tokens), migrate callers, then delete. Record new primitives and promotions in `docs/DECISIONS.md`.

14. **Photos live in shared frames.** One calm frame language (owner decision 2026-11-16): every photo is a rounded rectangle with the single `rounded-card` radius and one of four fixed ratios (`portrait` 4/5, `landscape` 3/2, `wide` 21/8, `square` 1/1), rendered only by the shared `Frame` component (`packages/ui/src/components/media/`), with clusters built by the shared `PhotoGrid`. Apps never set a photo's radius, mask, aspect or crop themselves; the organic mask utilities (`mask-arch`, `mask-leaf`, `mask-pebble`) are retired. Focal points come from the photo catalog. A guard test fails on any `mask-*` or custom radius/aspect on a photo in `apps/*`.

Existing code that predates these rules (app knowledge in `SiteHeader`/`SiteFooter`/`ProgramLayout`/`sites.ts`, per-app heroes and cards, raw values) is migrated before the public UI/UX polish pass; see the gap list in `docs/FRONTEND_ARCHITECTURE.md`. All specialized agents (`frontend-builder`, `design-lead`, `ui-reviewer`) apply these rules.

## Clean visual style (permanent; owner direction 2026-11-18)

Full rules, reference examples and review test: `DESIGN.md` §11. In short, for every page, in every app and in `packages/ui`:

- **No eyebrow labels and no pills above headings or card titles.** Start with the heading.
- **Short headings, title case (owner direction 2026-11-19):** a heading fits on one line where possible and never runs past two lines. Headings are title cased automatically by the shared heading components (`TitleCase.astro`, `packages/ui/src/lib/title-case.ts`): every word starts with a capital except small words (a, an, the, and, but, or, nor, for, so, yet, as, at, by, in, of, on, to, from, with, into, onto, over, per, via, is), and the first word always does; words that already have capitals inside (FAQ, iPad) are kept. Type the heading normally; there is no page marker and no CSS capitalisation, and a heading written in app markup outside the shared components wraps its content in `<TitleCase>`.
- **Subtle alternating section bands (owner direction 2026-11-19):** neighbouring full-width sections are told apart by a pale sand background that the shared layer applies automatically (`packages/ui/src/styles/bands.css`, token `--ui-surface-band`); pages never set it. Do not hand-set `raised` or `inset` tones to alternate; use a tone only for a deliberate panel or a dark band, with at most one dark band per page and none directly above the footer. See `docs/FRONTEND_ARCHITECTURE.md`, "Section bands".
- **A heading, and a subheading only where the heading alone is unclear** (one short line at most). Not the default label, heading, intro, button stack.
- **Buttons, links, tabs and chips are small-radius rectangles**, never `rounded-full` or `rounded-pill`. One main action per block.
- **Cards are photo-led and vary in size**, with the whole card as the link and no category tag. Do not build a wall of identical rounded tiles.
- **No choirs, vocalists or singers as an offering (owner decision 2026-11-19):** Gamo does not work with them, so no choir, voice or singing lesson, instrument, instructor, role or seed for them in any app, doc or form. Worship and worship leaders are part of the mission, so photos of worship leaders leading (for example the home and Worship hero) and the Worship program itself stay. Sound-engineering wording about vocal mixes in production copy is fine.
- **Sponsorship wording stays general, with no sponsor page or links (owner direction 2026-11-19):** sponsorship appears only as the home-page sections (main site and Academy) and a mention on the Partnerships page; say only that lessons will be sponsored through partner organizations and churches and that details are shaped with each partner and shared when confirmed. Never say who qualifies, how much, how many, need-based, scholarship, cohort, reduced, no-cost, free, affordable, underwrite or instrument lending, and never imply a family's ability to pay or a church-membership requirement.
- Required labels (Sample, Proposal, Sponsored), admin status chips, legends and breadcrumbs are information and stay, quietly.
- **When unsure, remove the element.** Reviewers (`ui-reviewer`, `design-lead`) flag every violation. Existing components still carry the old pattern and are being migrated (home page first, then the shared components); do not copy it into new work.

## Permanent OpenAPI-first HTTP contract rule

`openapi/root.yaml` (OpenAPI 3.1.1 format; contract version 4.0.0, 2 operations) is the source of truth for all HTTP API work. Follow `docs/OPENAPI_ARCHITECTURE.md`: contract first → lint → generated types/Worker validators → runtime implementation and permissions → HTTP contract tests. Never manually edit generated artifacts or silently change public contracts; record compatibility decisions in `docs/API_COMPATIBILITY.md`. `make api-check` verifies without rewriting tracked outputs. Keep routes in their owning five applications; no sixth API application by default.

Read `docs/API_INVENTORY.md` before claiming functionality. Internal contracts/reference docs must never be published as public assets. Preserve mission governance and Stripe sandbox boundaries.

## Forms, emails and admin (owner decision, 2026-11-16)

Spec: [`docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`](docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md); plan: `docs/superpowers/plans/2026-11-16-forms-emails-invoices.md`.

- **No public accounts.** Gamo Academy, Gamo Worship and Gamo Production are public pages, staff-editable forms, emails and invoices. There is no public sign-in, sign-up, Clerk, onboarding, provider profile, shared person record, workspace or per-program dashboard. Do not reintroduce any of them without explicit founder approval.
- **Admin is the only dashboard.** Staff sign in to the admin app with Cloudflare Access plus the admin password (`requireStaff`, `staffContext`). Staff edit forms (versioned on publish), review submissions, approve musicians and technicians into a private roster, match service requests, send offers and issue invoices there (being built: plan Phases 2–4).
- **Forms** are rendered by the shared `DynamicForm` renderer (being built: plan Phase 2), work without JavaScript and are protected by the public form guard (Turnstile, rate limits, bounded bodies). Uploads go through our Worker into R2 and are served to staff only (being built: plan Phase 2).
- **People are identified by email, not accounts.** Submitters, churches, parents and musicians act through emails and signed, expiring single-purpose links (offer Accept/Decline acts on POST only; Academy manage links). Email subjects never contain names; logs never contain personal data or tokens.
- **Money flows through Gamo.** Gamo invoices the church or family and pays the musician; musician pay and any Gamo administrative line are always separate, and a Gamo administrative line is refused unless the owner has approved it. Invoices use Stripe Invoicing in test mode or manual "mark paid"; integer cents.
- **Daily cron** (approved; being built: plan Phase 4) retries the email outbox and enforces retention.
- The retired Shared Authentication, Product Account Independence (including the shared person record exception) and Independent Clerk rules are recorded in `docs/DECISIONS.md` (2026-11-16); `docs/AUTH.md`, `docs/IDENTITY.md` and `docs/design/identity-and-ticketing.md` are historical.

## Email

**Email domain:** the verified sending domain is `gamostudio.org` (contact `hello@gamostudio.org`). The Resend bounce/complaint webhook lives in `apps/web` (`/api/webhook/resend` on `gamostudio.org`). `scripts/audit/email-domain.test.ts` fails if the misspelled extra-"s" domain appears anywhere in the repository.

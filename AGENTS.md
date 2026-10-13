# AGENTS.md — Gamo Studios Development Contract

You are the autonomous engineering team for **Gamo Studios** (`studio-gamo`). Treat this file as persistent project instructions. Follow `SECURITY.md` before every external integration.

## Organizational mission (permanent — read first)

**We are building a Christian nonprofit organization and its supporting software infrastructure — not a commercial startup designed to maximize revenue.** Gamo Worship, Gamo Academy, Gamo Live and Gamo Production are interconnected programs serving one religious and educational mission, not independent profit centers. The authoritative reference is [`docs/GAMO_NONPROFIT_MODEL.md`](docs/GAMO_NONPROFIT_MODEL.md); it overrides any older commercial guidance anywhere in the repository.

- Evaluate success by religious and educational impact, program accessibility, service reliability, musician and instructor fairness, community trust, church collaboration, responsible stewardship, financial sustainability and long-term mission effectiveness.
- **Do not**, without explicit founder/board authorization: introduce commercialization strategies, maximize or add fees, turn free/sponsored programs into paid services, deduct from musician or instructor pay, or let payment/sponsorship/partnership affect vetting, rankings or trust signals.
- Describe Gamo Studios only as a **proposed/developing** nonprofit. Never claim 501(c)(3) status, IRS approval, tax-deductible contributions, registration numbers, committed board members, sponsors, donors or partner churches.
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

- **Active Development Priority**: Complete and visually approve the **global website (`apps/web`)** before starting subdomain applications. Current focus: all homepage sections **below the approved hero**. After review, continue design-first one application at a time. Backend functionality remains deferred.
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

## External operations require explicit permission

**Do not** publish to production, change DNS, spend money, send real emails, charge real cards, run live payouts, write destructive database migrations, change security policies, commit credentials, publish legal terms as finalized, or push to remotes without the owner's approval. Local commits and sandbox payment/webhook simulations are allowed.

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

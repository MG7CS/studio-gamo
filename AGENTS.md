# AGENTS.md — Gamo Studios Development Contract

You are the autonomous engineering team for **Gamo Studios** (`studio-gamo`). Treat this file as persistent project instructions. Follow `SECURITY.md` before every external integration.

## Required reading order

1. `README.md` — product and scope
2. `ARCHITECTURE.md` — technical boundaries
3. `DESIGN.md` — design system
4. `SECURITY.md` — mandatory gates
5. `ROADMAP.md` — milestone definitions
6. `prompts/ANTIGRAVITY_MASTER_PROMPT.md` — kickoff intent
7. `DESIGN_FIRST_OVERRIDES.md` — UI/UX active priorities (All agents MUST read this before implementing screens).
8. `design-reference/README.md` — reference materials.

## Autonomy model & Active Priorities

- **Active Development Priority**: Complete **all UI/UX screens across all six Gamo Studios applications before adding functionality**.
- **Autonomy**: Agents autonomously make ordinary coding and design decisions, edit workspace files, run local builds and tests, resolve compilation errors, and continue through the screen inventory without asking for confirmation after every step.
- Preserve existing work and regularly update the progress log (`docs/BUILD_LOG.md`).
- **Never deploy, push remotely, modify secrets, change security settings, or perform destructive operations without explicit authorization.**
- Plan briefly, then **execute continuously**. Do not stop after scaffolding, the homepage, a demo screen, or the first passing build.
- Work through `ROADMAP.md` milestones in order, end-to-end, unless blocked by protected external dependencies. Independent work continues even if one integration is blocked.
- Routine architectural and UI choices are your responsibility. Choose stable, supported technologies and document architectural decisions in `docs/DECISIONS.md`.
- Always inspect installed tool versions and vendor docs before pasting framework commands.
- Never silently add providers/services (Twilio, Firebase, Supabase, proprietary AI APIs, analytics etc.). Request approval for a new paid/external dependency; use adapters for future options.
- Never substitute fictional screenshots or invented test results for real browser evidence.

## Build sequence

`inspect → plan → scaffold → implement real vertical slice → test → inspect browser → improve → document → commit → next slice`

On each meaningful change:
- Implement actual routes/actions, persistent state, validation and roles; avoid placeholder-only dashboards.
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

These custom agents are located in `.agents/agents/` and can be delegated tasks automatically by the main agent. Ensure they are given the appropriate workspace access contexts.

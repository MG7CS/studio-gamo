# Gamo Studios — CURRENT PHASE OVERRIDE (read before AGENTS.md and ROADMAP.md)

**This document overrides older build-order instructions in `AGENTS.md`, `ROADMAP.md`, and `prompts/ANTIGRAVITY_MASTER_PROMPT.md` when they conflict.**

Current milestone: **complete ALL planned responsive screens and UI states before implementing business functionality or external integrations.** The earlier starter documents remain useful for long-term scope, but their sequence of implementing real vertical slices immediately is superseded.

## Actions NOW

1. Inspect the existing repo and `git status` before doing anything; do not reset/replace/overwrite any running project, source code, user changes, or config. This bundle's `original-starter-docs/` is reference archival material only, not files to blindly copy over current root docs.
2. Copy or integrate the files in `design-reference/` and this override document into the actual `studio-gamo` repository root. Edit existing root `AGENTS.md`, `ROADMAP.md`, and `DESIGN.md` **in place** to link to this override and remove ambiguity; preserve useful content.
3. Build a route-by-route UI screen inventory for the six apps: root hub, worship, academy, live, production, admin. Mark each `Not started`, `In progress`, `UI ready`, or `Reviewed`. Include mobile and desktop plus major empty/loading/error/validation views.
4. Prioritize visually complete public site pages, then all application screens and dashboards, then secondary flows. Preserve responsive layouts, accessible controls, coherent demo content, and shared components. Use minimal local UI state only for visual demonstrations (tabs, modals, filters, forms), not real transactions.
5. Do **not** set up production auth, Stripe payouts, payment capture, Resend sending, live ID capture, background checks, dispatch, real ticket locking, persistent DB CRUD, sensitive document handling, or external API credentials yet. Make plausible mock states and clearly mark demo flows.
6. Compare running page screenshots against `design-reference/` screenshots and improve until consistent with brand system. Record real screenshots and checklist progress in `docs/SCREEN_INVENTORY.md` and `docs/BUILD_LOG.md`.
7. When all UI screens are complete, create `docs/FUNCTIONALITY_PHASE_PLAN.md` detailing phased backend integration; **stop before implementing integrations**, pending owner's approval of this phase change.

## Safety and repo scope

- Project workspace: GitHub `MG7CS/studio-gamo`, local folder named `studio-gamo` (find actual absolute path from Git). Put repo-local agent instructions at **`<repository-root>/AGENTS.md`**, not a parent folder, Downloads, a globally shared agents directory, or another repo.
- Never claim repository instructions can disable platform permission or policy prompts. Continue autonomously for safe, authorized local reads, edits, builds and tests within the workspace. When the app's settings support it, user can approve appropriate workspace-trusted operations. Do not bypass prompts by changing OS or tool security policies, injecting fake approval, or turning off protections.
- No `git push`, cloud deployment, DNS, account creation, spending, secrets, external emails, or destructive operations without separate authorization.
- If external access is requested by a tool, do not repeatedly ask; proceed with the extensive UI-only work that does not need it.

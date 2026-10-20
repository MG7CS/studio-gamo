# AGENTS.md — Gamo Studios

Persistent instructions for anyone (person or agent) working in this repository. Rewritten 2026-10-19 for the rebuild: the product side of every app is being rebuilt from scratch ([`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md)). Older rules that described the previous product logic are listed at the end as retired; do not follow them.

## 1. Mission and wording (permanent)

**Gamo Studios is a Christian, mission-driven Public Benefit Corporation.** Gamo Worship, Gamo Academy, Gamo Live and Gamo Production are connected programs serving one religious and educational mission, not independent profit centers. The mission reference is [`docs/GAMO_NONPROFIT_MODEL.md`](docs/GAMO_NONPROFIT_MODEL.md) (historical file name; the PBC statement below prevails over any "nonprofit" wording in it).

- A PBC is a for-profit company type. Gamo Studios is **not a nonprofit** and **not tax-exempt**. Never write or imply "nonprofit", "non-profit", "not-for-profit", "501(c)(3)", "tax-exempt", "tax-deductible", "charitable", "charity" (for Gamo itself) or "donation/donor" on any public page, email, metadata or structured data. Never claim IRS approval, registration numbers, committed board members, sponsors, donors or partner churches.
- Judge success by religious and educational impact, accessibility, reliability, musician and instructor fairness, community trust, church collaboration and responsible stewardship. Financial sustainability matters but is subordinate to the mission.
- Without explicit owner approval, never: add or raise fees, turn free or sponsored programs into paid ones, deduct from musician or instructor pay, or let payment, sponsorship or partnership affect vetting, rankings or trust signals. Sponsored content is always visibly labeled.
- Musician pay and any Gamo administrative allocation are always separate line items. All fees, contributions and tiers are proposals until approved.
- No donation, membership or sponsorship payment processing until the prerequisites in [`docs/NONPROFIT_TRANSITION_CHECKLIST.md`](docs/NONPROFIT_TRANSITION_CHECKLIST.md) are met.
- Gamo Live serves **Christian events nationwide**; never define eligibility by ethnicity or nationality.
- Gamo Academy speaks first to students, parents and families; the approved headline is **"Learn to Play the Instrument You Love."**
- No corporate growth language ("monetization engine", "revenue optimization", "acquisition funnel", "customer lifetime value").
- Email: the verified sending domain is `gamostudio.org` (contact `hello@gamostudio.org`); `scripts/audit/email-domain.test.ts` fails on the misspelled extra-"s" domain.

## 2. How the owner works with you (permanent)

- **Tests: targeted yes, broad only when asked.** Write and update tests alongside the code, and run the specific test files (or single Playwright specs) that cover what you just changed, once per change set, to know the work is right. Do not run the full unit suite, `pnpm check`, `check:quick`, the full Playwright suite or the journeys on your own initiative (not while iterating, not before a commit, push or deploy); run those only when the owner asks, or at the end of a planned phase the owner has approved. Never loop on re-running. State plainly in reports which tests were run and which were not. Builds, typechecks, lint and format checks are always fine.
- **Commits:** never run `git commit`. When work is ready, give a ready-to-paste command (`git add …` and `git commit -m "…"`) with a short one-line message, no body, no attribution trailers.
- **Never** deploy, push to a remote, change DNS, change secrets or security settings, spend money, send real emails, charge cards, run payouts, run destructive database operations, or publish legal terms as final without the owner's explicit approval for that action.
- **Dev servers belong to the owner.** Never stop, kill or restart a dev server. Test against the owner's running server (read-only), or ask them to start one. Astro allows one dev server per app; after dependency changes, tell the owner to restart theirs.
- Never add a provider or external service (analytics, AI APIs, messaging, payment, auth vendors…) without approval.
- Never present invented screenshots or test results. Browser evidence comes from a running UI.
- **No fake data or counts, ever.** Every number, badge and list comes from a real query; empty states say so honestly. Nothing appears in navigation without a working page behind it. Fictional people, bookings, events or stories are visibly labeled *Sample*/*Example*.
- Record meaningful progress in [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md) and decisions in [`docs/DECISIONS.md`](docs/DECISIONS.md) (both are history logs; this file holds the rules).
- **Use parallel agents when work splits cleanly.** When a task has independent parts that touch different files (for example shared components, a security pass and a data-accuracy pass), run them as parallel agents with explicit file ownership and a written brief, then review and integrate the results yourself. Do not split work that edits the same files or depends on an earlier step. Agents follow this file too (no running tests, no commits, no touching dev servers).
- Plan briefly, then work through the agreed scope. Stop for the owner on visual sign-off, owner-only actions and real decisions; otherwise make ordinary engineering choices yourself.

## 3. Scope of the rebuild

- **Kept as they are (do not touch):** the marketing pages of the five public apps (look and content). For Gamo Live that means every public page and its chrome: home, events list, event detail, artists, venues, promote, the header, footer and event card, plus their copy. A polish or rebuild pass never changes them unless the owner names a specific page and change; if a task seems to need it, ask first. Before finishing any task, compare the marketing files with `git diff` against the starting commit and confirm they are unchanged. The only parts of the old Live public side that are rebuilt are the non-marketing flows (registration, confirmation, ticket page, sign-in, organizer, admin), and the admin's Cloudflare Access gate and shell (`apps/admin`, [`docs/ADMIN_REQUIREMENTS.md`](docs/ADMIN_REQUIREMENTS.md)).
- **Being rebuilt from scratch:** every non-marketing page (accounts, onboarding, dashboards, flows), every API route, the shared backend (`@gamo/domain`, product sign-in in `@gamo/auth`, the data model in `@gamo/db`, `@gamo/integrations`, the API contracts), demo-era UI in `@studio-gamo/ui`, and their tests. Until a product is rebuilt, its old code may still exist; it is not a reference for how things should work.
- **Order:** Gamo Live first. Each product goes requirements → design → build → built-worker checks, like the admin.
- **Production is frozen** for the public apps until each rebuilt product is ready and the owner approves a deploy.

## 4. Engineering rules (permanent)

- **Stack:** Astro (server output) on Cloudflare Workers, D1, R2, KV; Tailwind 4; strict TypeScript; pnpm workspaces. Check installed versions and vendor docs before using framework commands.
- **Hosts and ports** come from `packages/config/apps.ts`; cross-app links from `packages/ui/src/lib/sites.ts`. Never hard-code an origin.
- **Runtime config:** read bindings and secrets through `getRuntimeEnv()`, never `import.meta.env`. New variables go in `packages/config/env.ts`, `env-validation.ts` (when required), the app's `.dev.vars.example` and the runbook.
- **Fail closed.** A missing key, binding or identity means the feature is unavailable (503/denied), never a fake success. Local-only flags (`ALLOW_DEMO_SESSION`, `ALLOW_AUTH_SIMULATION`, `ALLOW_PUBLIC_DEMO_WORKSPACES`, `ALLOW_LOCAL_ADMIN_IDENTITY`) are fatal outside `ENVIRONMENT=local`.
- **Every state-changing request** checks identity first, then same origin, then validates input. The frontend is never the authority for permissions, inventory, check-in or payments.
- **CSP:** no inline `<script>` or `on*=` handlers; scripts and styles ship as files; fonts self-hosted; no third-party script origin without approval. Security headers come from `packages/domain/src/http/security-headers.ts` (moves with the rebuild; keep it at least as strict).
- **Money** in integer minor units with the currency recorded. **Time** zones handled explicitly.
- **Data:** schema changes are tracked migrations; never edit an applied migration; nothing destructive without the owner.
- **Logs** name variables and error codes, never secret values or personal data. Screenshots and fixtures never show secrets, ID documents or real personal data.
- **Minimal client JavaScript:** server-rendered pages and plain forms; islands only for real interaction.
- **Thin pages:** no application or API logic in `.astro` page files (database writes, email sending, business rules, multi-step flows). Rules and SQL live in `@gamo/domain`; orchestration such as "cancel and notify" lives in the app's `src/lib/`. A page parses the request, calls one named function, and renders or redirects with the result. Every such function has a unit test.
- **Components:** compose pages from small typed components — shared primitives in `packages/ui`, app-specific components in the app's `src/components/`, large page sections extracted into their own components. No monolithic page files. **Reuse first:** before writing UI or a feature, search `packages/ui` and the app's `src/components/` for something that already does it; extend it instead of copying. The second time a pattern (button, notice, pill, empty state, form row, card, list row, page header) appears, it becomes a shared component, and the earlier copies are replaced in the same change. No page repeats markup or logic another page already has.
- **Removed or renamed public URLs** keep a redirect (`src/lib/legacy-redirects.ts` in each app).

## 5. Design (permanent)

- One design system, defined in [`DESIGN.md`](DESIGN.md) and the tokens in `packages/ui/src/styles/tokens.css` (terracotta `#B34E24`, deep `#8F3B18`, soft `#D98B62`, ink `#18181B`, cream `#F9F6F0`, sand `#EDE6DA`, tan `#D8C5AE`); Inter, self-hosted.
- Every page: exactly one `<h1>`, interactive targets at least 44 × 44 px, axe WCAG 2.2 AA clean (serious/critical), no horizontal overflow at 360 px.
- Marketing pages follow the cinematic editorial design and the approved references in `design-reference/` (homepage sections `design-reference/homepage/02-…07-`, approved hero preserved). Rebuild screens get their own approved design before they are built.
- **Split-screen pages (sign-in, sign-up, registration, confirmation, organizer set-up, invitations) never scroll on desktop.** The page is exactly one screen tall, content centered, photo on the left. If the fields do not fit, reduce type and spacing a little, then split the form into steps instead of shrinking further: a thin progress bar with "Step N of M", a Next button, a Back link, each step a server-rendered page that validates its own fields and keeps earlier answers. Phones may scroll. Check at laptop heights (about 700 and 900 px) before calling any such page done.
- **Admin:** claymorphism shapes and shadows from `design-reference/claymorphism-admin-ui/` in the same palette, full-page layout, collapsible sidebar, Gamo Studios logo with an "Admin" label, **no gradients anywhere**.

## 6. Admin access (permanent)

One admin, one account. Cloudflare Access alone: every admin request must carry a valid Access assertion for exactly `ADMIN_EMAIL`; anything else is denied. No admin accounts, roles, passwords, sessions or emergency credentials. Recovery is changing the Access policy in Cloudflare. Locally, `ALLOW_LOCAL_ADMIN_IDENTITY=true` on a loopback host stands in for Access.

## 7. Tools and helper agents

- `.agents/agents/` holds the owner's Antigravity helper agents (`design-lead`, `frontend-builder`, `ui-reviewer`); they follow this file. Antigravity agents prefer the workspace's native file tools over external filesystem tools and never bypass workspace permissions.
- In an agent shell, run Astro commands with `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT` so they stay in the foreground.

## 8. Retired rules (2026-10-19)

These described the previous product logic. They are not in force; where a rebuilt product needs something similar, its requirements will say so ([`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md) lists what to carry forward).

- The "design-first phase with demo states" priority, the old roadmap milestones, the backend-stabilization priority and the old definition of done.
- The permanent OpenAPI-first contract rule (the API approach is decided anew in the rebuild).
- The shared authentication UI rule, the product account independence rule with its shared person record, and the independent Clerk rule (public sign-in is designed from scratch).
- The Live "past event closure" rule and "D1 events only" rule as written (carried forward as Live requirements).
- The old middleware order, private-page registry and route tests as mandatory conventions.
- Staff roles, staff provisioning, the admin password gateway and audit-log requirements.

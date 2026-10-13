# Gamo Studios — Autonomous Delivery Roadmap

## Operating objective

Build a coherent **working local ecosystem**, not only static landing pages. Autonomous work should progress continuously across milestones; each ends with tests, screenshots, evidence and a Git commit. Completion is measured by objective checks, not by the agent saying 'done'.

## Milestone 0 — Repository and foundation

- [ ] Inspect repository and these documents; research current Astro/Cloudflare/Stripe/Resend SDK guidance.
- [ ] Create current Astro + Cloudflare scaffold(s), TypeScript strict, Tailwind, pnpm workspace, lint/format, `.gitignore`, `.dev.vars.example`.
- [ ] Local Workers development, D1 migrations, local seeds, deploy preview scaffolding without deployment.
- [ ] Design token library, shared Inter typography, real SVG logo if available, navigation, responsive page shell.
- [ ] Test + build scripts running in clean install; document working commands.

**Exit:** clean install, typecheck, tests and local dev run; public brand hub homepage matches design direction and has no fake trust metrics.

## Milestone 1 — Worship working vertical slice (highest priority)

- [ ] Global login/session demo with secure server-side role checks; real auth provider evaluated and decision recorded.
- [ ] Musician application draft / profile / travel / audition link / submitted status; identity verification safely sandboxed.
- [ ] Church posting wizard and gig creation with plan selection, details, repertoire links and demo checkout state.
- [ ] Admin queue: review auditions, approve/reject, assign confirmed musicians.
- [ ] Primary vs paid standby assignment and dispatch simulation; idempotent check-in/backup activation and audit trail.
- [ ] Resend email sandbox/console fallback; transactional templates triggered by verified state changes.
- [ ] Access control integration tests, form errors, dispatch concurrency tests and mobile E2E.

**Exit:** seeded church can create a sample request; applicant can apply; authorized admin can review; primary and standby can be assigned; a simulated failed check-in safely activates exactly one backup; no provider mocks misrepresented as live.

## Milestone 2 — Academy functioning module

- [ ] Course/instructor listing and filtering; profiles and availability.
- [ ] Private lessons and hosted clinics with registrations, booking records and sandbox payment flow.
- [ ] Student dashboard and academy host application; eligibility placeholders clearly marked.

**Exit:** end-to-end testable demo lesson/clinic booking with permission separation.

## Milestone 3 — Live functioning module (two-sided)

- [ ] Events/tiers/inventory, event pages, organizer demo and local seat reservation authority.
- [ ] Free-event registration flow and attendee "my tickets".
- [ ] Organizer event submission and admin moderation/approval (local, demo data).
- [ ] Stripe test checkout integration when credentials provided; ticket generation, signed/opaque QR and scanner.
- [ ] Simultaneous seat hold and double-entry tests, timeout expiry and refund status transitions.
- [ ] *(Later, separately approved)* managed promotion intake, campaign status and reporting; Church Partners membership. See [docs/GAMO_LIVE_AND_PARTNERS.md](docs/GAMO_LIVE_AND_PARTNERS.md).

**Exit:** two simulated buyers cannot secure the same seat; verified demo ticket scans only once.

## Ecosystem planning categories (Gamo Live, Partners, dynamic homepage)

Planning categories, in order. **They are not permission to begin all seven**; each requires the preceding category to be approved.

1. **UI/UX design and approval** — dynamic hero concept, Live Promote/Explore journeys, Partners pages, admin campaign screens. *(Current phase.)*
2. **Frontend screen implementation** — responsive screens with labeled example data, no backends.
3. **Event publishing and discovery functionality** — submission, moderation, discovery, D1 persistence.
4. **Ticketing and registration functionality** — free registration, Stripe Connect test-mode checkout, QR tickets.
5. **Advertising campaign management** — managed intake, staff workflow, placement scheduling, reporting (manual social campaigns; no ad APIs).
6. **Church membership and discount integration** — Partners subscriptions, credits, fee discounts (pricing must be approved first).
7. **Advanced automation, personalization and analytics** — promotion engine, geo relevance, ad-platform integrations (each needs approval).

## Milestone 4 — Production services and cross-app polish

- [ ] Production services site, real-asset portfolio placeholders, consultation intake.
- [ ] Central account navigation, global legal draft routes, user account management.
- [ ] Cross-app visual, accessibility, search engine and performance refinement.
- [ ] Audit and operational dashboards, basic observability, documented data backup/restore.

**Exit:** every planned domain can be demonstrated locally, even where external integrations are explicitly sandboxed.

## Milestone 5 — Production-readiness review (human gate)

- [ ] Threat model, third-party contracts, privacy/terms, payment/legal review, identity provider selection.
- [ ] Production secrets/resources, domain/DNS and Stripe/Resend verification via owner-approved setup.
- [ ] Integration tests with provider sandbox accounts; security review and operator runbook.
- [ ] Human-approved preview deployment, monitoring, rollback and staged release.

**Exit:** owner signs off. The agent **must not** claim production is launched merely because the local app works.

## Routine check after each milestone

1. Keep an updated `docs/BUILD_LOG.md` with completed changes, test output, screenshots paths, architecture decisions and blockers.
2. Run format, lint, typecheck, unit/integration tests, production build and relevant E2E/browser tests.
3. Capture responsive screenshots of actual running pages, compare to `DESIGN.md` and fix clear problems.
4. Commit small coherent changes; do not push to GitHub unless repo access and owner instruction allow it.
5. Immediately proceed to the next milestone if no protected external action is required.

## Stopping rules

Continue without repetitive confirmation for normal development decisions. Stop **only** when unable to proceed safely (missing credentials critical to current test, irreversible operation, policy/legal or security gate, exhausted environment). Document blockers and continue on other independent work first. No infinite loops: after three failed approaches, write cause/alternatives and choose a safe fallback or mark blocked.

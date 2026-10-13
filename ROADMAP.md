# Gamo Studios — Mission-Aligned Delivery Roadmap

> **Current phase override:** [DESIGN_FIRST_OVERRIDES.md](DESIGN_FIRST_OVERRIDES.md) governs build order. Design-first remains in force: complete and approve screens before functionality, one application at a time. Organizational direction: [docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md).

## Operating objective

Build the software infrastructure for a **Christian nonprofit** whose programs serve churches, musicians, students, families and faith communities. Work is ordered by **mission need and dependency**, not by which product could generate the most money. Each milestone ends with tests, screenshots, evidence and a Git commit. Completion is measured by objective checks, not by the agent saying "done".

## Mission-aligned priority sequence (2026-10-12)

Supersedes the previous revenue-oriented ordering (advertising campaigns and paid memberships as standalone categories).

| # | Priority | Maps to | Notes |
| --- | --- | --- | --- |
| 1 | **Nonprofit organizational foundation** | Docs + [NONPROFIT_TRANSITION_CHECKLIST.md](docs/NONPROFIT_TRANSITION_CHECKLIST.md) | Owner/legal actions; agents maintain documentation only |
| 2 | **Global website mission and program presentation** | Milestone 0 / current design phase | Homepage copy aligned; Mission, Church Partnerships and Support pages proposed |
| 3 | **Gamo Worship** musician and church coordination | Milestone 1 | Fair-pay line items; no musician deductions |
| 4 | **Gamo Academy** instruction and sponsorship support | Milestone 2 | Families first; safeguarding gates for minors |
| 5 | **Gamo Live** Christian event publishing, discovery, free registration, authorized ticketing | Milestone 3 | Organizer verification before ticketing |
| 6 | **Gamo Production** program support | Milestone 4 | Volunteer development, technical training |
| 7 | **Supporting church relationships** | Milestone 4b | Partnership records; no tiers/prices without approval |
| 8 | **Administrative tools and financial stewardship** | Milestones 1–4 (admin slices) | Program ledger, funds, board reports |
| 9 | **Donations, sponsorships, grants, funding infrastructure** | Milestone 5a | Blocked until formation/recognition and counsel review |
| 10 | **Accessibility, safeguarding, security, operational maturity** | Every milestone + Milestone 5 | Continuous, with a final readiness gate |

Each priority requires the preceding design approval gate; this table is **not** permission to begin all ten in parallel.

## Milestone 0 — Repository, foundation and mission presentation

- [ ] Inspect repository and these documents; research current Astro/Cloudflare/Stripe/Resend SDK guidance.
- [ ] Create current Astro + Cloudflare scaffold(s), TypeScript strict, Tailwind, pnpm workspace, lint/format, `.gitignore`, `.dev.vars.example`.
- [ ] Local Workers development, D1 migrations, local seeds, deploy preview scaffolding without deployment.
- [ ] Design token library, shared Inter typography, real SVG logo if available, navigation, responsive page shell.
- [ ] Test + build scripts running in clean install; document working commands.
- [x] Homepage copy aligned with the nonprofit mission (2026-10-12).
- [ ] Mission, Church Partnerships and Support Our Mission screens designed and approved (see [docs/SCREEN_INVENTORY.md](docs/SCREEN_INVENTORY.md)).

**Exit:** clean install, typecheck, tests and local dev run; the organization hub matches design direction, communicates the mission accurately, states legal status accurately, and has no fake trust metrics.

## Milestone 1 — Gamo Worship working vertical slice (highest program priority)

- [ ] Global login/session demo with secure server-side role checks; real auth provider evaluated and decision recorded.
- [ ] Musician application draft / profile / travel / audition link / submitted status; identity verification safely sandboxed.
- [ ] Church request wizard and gig creation with plan selection, details, repertoire links and demo checkout state; **musician agreed pay and any Gamo administrative allocation shown as separate line items** (amounts are placeholders until approved).
- [ ] Admin queue: review auditions, approve/reject, assign confirmed musicians.
- [ ] Primary vs paid standby assignment and dispatch simulation; idempotent check-in/backup activation and audit trail.
- [ ] Resend email sandbox/console fallback; transactional templates triggered by verified state changes.
- [ ] Access control integration tests, form errors, dispatch concurrency tests and mobile E2E.

**Exit:** seeded church can create a sample request; applicant can apply; authorized admin can review; primary and standby can be assigned; a simulated failed check-in safely activates exactly one backup; musician pay is never netted against Gamo allocations; no provider mocks misrepresented as live.

## Milestone 2 — Gamo Academy instruction and sponsorship support

- [ ] Instructor and lesson discovery for students, parents and families; profiles and availability.
- [ ] Private lessons, church-hosted classes and clinics with registrations and sandbox payment flow.
- [ ] Sponsored and scholarship-supported enrollment states (demo), with funding source recorded separately from instructor pay.
- [ ] Guardian consent and safeguarding placeholders clearly marked; no minor bookings until policy approval.
- [ ] Student/guardian dashboard; church host and sponsor intake.

**Exit:** end-to-end testable demo lesson/class enrollment (tuition, sponsored and scholarship variants) with permission separation.

## Milestone 3 — Gamo Live Christian events

- [ ] Organizer event submission, organizer verification states and admin moderation against the Christian-event content policy (local, demo data).
- [ ] Event pages, one-time and recurring schedules, discovery filters (location, date, type, free/paid).
- [ ] Free-event registration flow and attendee "my tickets".
- [ ] Events/tiers/inventory and local seat reservation authority; paid ticketing enabled only for organizers with recorded ticketing authorization.
- [ ] Stripe test checkout integration when credentials provided; ticket generation, signed/opaque QR and scanner.
- [ ] Simultaneous seat hold and double-entry tests, timeout expiry and refund status transitions.
- [ ] *(Later, separately approved)* optional managed promotion requests with labeled placements. See [docs/GAMO_LIVE_AND_PARTNERS.md](docs/GAMO_LIVE_AND_PARTNERS.md).

**Exit:** unverified organizers cannot sell tickets; two simulated buyers cannot secure the same seat; verified demo ticket scans only once; free registration works without payment.

## Milestone 4 — Gamo Production and cross-app polish

- [ ] Production program site: technical support, training and volunteer development; real-asset portfolio placeholders; consultation intake.
- [ ] Central account navigation, global legal draft routes, user account management.
- [ ] Cross-app visual, accessibility, search engine and performance refinement.
- [ ] Audit and operational dashboards, basic observability, documented data backup/restore.

### Milestone 4b — Supporting church relationships and stewardship tools

- [ ] Church partnership records (participation types, hosted classes, sponsored programs) — **no tiers or prices until approved**.
- [ ] Program ledger with nonprofit categories (`charitable_contribution`, `sponsorship`, `program_service_receipt`, `third_party_payable`, `processing_cost`, refunds), `program` and `fund_id` dimensions; tests proving categories never mix.
- [ ] Board-oriented program and fund reports (demo data).
- [ ] Tests proving partnership/sponsorship status cannot touch vetting or ranking data.

**Exit:** every planned domain can be demonstrated locally, even where external integrations are explicitly sandboxed.

## Milestone 5 — Production-readiness review (human gate)

- [ ] Threat model, third-party contracts, privacy/terms, payment/legal review, identity provider selection.
- [ ] Safeguarding policy for minors approved; screening provider contracted.
- [ ] Production secrets/resources, domain/DNS and Stripe/Resend verification via owner-approved setup.
- [ ] Integration tests with provider sandbox accounts; security review and operator runbook.
- [ ] Human-approved preview deployment, monitoring, rollback and staged release.

### Milestone 5a — Donations, sponsorships and grants infrastructure (blocked)

Blocked until nonprofit incorporation, IRS recognition (or counsel-approved interim approach), donation acknowledgment wording, gift acceptance and restricted-fund policies exist. See [docs/NONPROFIT_TRANSITION_CHECKLIST.md](docs/NONPROFIT_TRANSITION_CHECKLIST.md).

**Exit:** owner signs off. The agent **must not** claim production is launched merely because the local app works.

## Routine check after each milestone

1. Keep an updated `docs/BUILD_LOG.md` with completed changes, test output, screenshots paths, architecture decisions and blockers.
2. Run format, lint, typecheck, unit/integration tests, production build and relevant E2E/browser tests.
3. Capture responsive screenshots of actual running pages, compare to `DESIGN.md` and fix clear problems.
4. Re-check copy against [docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md): accurate legal status, no unapproved fees, no commercial superlatives.
5. Commit small coherent changes; do not push to GitHub unless repo access and owner instruction allow it.
6. Immediately proceed to the next milestone if no protected external action is required.

## Stopping rules

Continue without repetitive confirmation for normal development decisions. Stop **only** when unable to proceed safely (missing credentials critical to current test, irreversible operation, policy/legal or security gate, exhausted environment, or a board/legal/tax decision listed in [docs/GAMO_NONPROFIT_MODEL.md §8](docs/GAMO_NONPROFIT_MODEL.md#8-decisions-requiring-approval)). Document blockers and continue on other independent work first. No infinite loops: after three failed approaches, write cause/alternatives and choose a safe fallback or mark blocked.

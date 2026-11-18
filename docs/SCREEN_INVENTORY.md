# Gamo Studios — Screen inventory

Updated 2026-11-16. Four public apps (web, academy, worship, production) plus the staff admin app, the only dashboard. Gamo Live and public accounts were removed on 2026-11-16 (history: tag `four-programs-snapshot` and git history of this file); their old URLs redirect through each app's `legacy-redirects.ts`.

**Status values:** *UI ready* = implemented as a local preview, not launched; *Real (D1)* = persists data; *Placeholder* = replaced by a staff-editable form in plan Phase 2; *Planned* = in the forms/emails/invoices plan ([docs/superpowers/plans/2026-11-16-forms-emails-invoices.md](superpowers/plans/2026-11-16-forms-emails-invoices.md)). Founder visual acceptance is pending for public screens.

## Organization hub — apps/web — port 4321

| Routes | Screens | Status |
| --- | --- | --- |
| / | Approved hero "Where Worship, Learning & Community Meet." (`HomeEditorialHero`), mission homepage, program links (Academy, Worship, Production) | UI ready |
| /mission | Mission, needs, programs, audiences, values, invitation | UI ready |
| /get-involved | Families, students, churches, musicians, instructors, volunteers | UI ready |
| /get-started | Audience routing to program destinations | UI ready |
| /partners | Hosting, sponsorship, shared resources and partnership integrity | UI ready |
| /partners/interest | Partnership heading and email card, with the staff-editable `partner_interest` form below it (email card only until the form is published) | Real (D1) |
| /support | Ways to support the mission (no donation processing) | UI ready |
| /contact | Heading and email card, with the staff-editable `contact` form below it; `?interest=` pre-selects the topic (email card only until the form is published) | Real (D1) |
| /worship/apply, /worship/request, /production/apply, /production/request | Staff-editable public forms (shared `DynamicForm`; Turnstile, chunked uploads, signed confirmation); 404 until the forms are published from admin | Real (D1) |
| /worship/offers/[token] | Emailed offer Accept/Decline page | Real (D1) |
| /faq | Native accessible FAQ expansion | UI ready |
| /legal, /legal/[slug] | Current status and draft policies pending review | UI ready; not final legal terms |
| /preview/catalog | Private catalog of every shared primitive and pattern (foundation task F5) | Planned |

No filler news pages, donation checkout or automatic hero rotation.

## Gamo Academy — apps/academy — port 4323

| Routes | Screens | Status |
| --- | --- | --- |
| / | Exact approved headline "Learn to Play the Instrument You Love.", learning hero, instruments, ages, formats, instructors, sponsored/hosted pathways, FAQs | UI ready |
| /instruments, /instruments/[slug] | Discovery and instrument detail | UI ready |
| /instructors/[slug] | Sample instructor profile | UI ready |
| /lessons, /lessons/[slug] | Filterable discovery and sample lesson details | UI ready |
| /register/[lesson] | Account-free family registration (parent-completed), validation, review | Real (D1) |
| /registrations/find, /open, /manage, /receipt | Emailed manage-link flow, no account | Real (D1) |
| /sponsored | Proposed sponsored/scholarship details | UI ready |

No sponsored places, screened instructors or real enrollments are offered. Safeguarding, tuition and launch decisions remain pending.

## Gamo Worship — apps/worship — port 4322

| Routes | Screens | Status |
| --- | --- | --- |
| / | Worship hero, instruments, preparation, FAQs; CTAs "Apply to serve" → /apply, "Request a musician" → /request | UI ready |
| /apply, /request | Redirect (302) to the forms on the main site: `/worship/apply` (staff-editable `musician_application`: photo, video by link or upload, PDFs) and `/worship/request` (`church_request`), served by `apps/web` | Real (D1) |
| /worship/offers/[token] on web | Emailed offer page (GET read-only, POST accepts or declines once; no-referrer, noindex) | Real (D1) |

## Gamo Production — apps/production — port 4325

| Routes | Screens | Status |
| --- | --- | --- |
| / | Technical ministry, audio/video/lighting, volunteers, event support | UI ready |
| /services, /services/[slug] | Support categories, learning skills and planning prompts | UI ready |
| /training | Proposed technical/volunteer training | UI ready |
| /apply, /request | Redirect (302) to `/production/apply` (`technician_application`) and `/production/request` (`production_request`) on the main site | Real (D1) |

No completed projects, customers, scheduled consultations or available training places are claimed.

## Admin — apps/admin — port 4326 (the only dashboard)

Behind Cloudflare Access + admin password (`/__admin_auth/login`, `/__admin_auth/logout`). Every screen below except `/security` and `/legal` is rendered from demo data in `apps/admin/src/data/workspace.ts` through `[...slug].astro`; plan Phase 4 replaces the demo workspace with real screens, and Phases 2–3 add `/forms`, `/forms/[id]` (builder), `/submissions`, `/submissions/[id]`, `/files/[id]`, `/roster`, `/requests`, offers, invoices and Academy registrations.

| Group | Routes | Status |
| --- | --- | --- |
| Command & Control | / (command center), /controls, /reviews, /users, /organizations, /roles, /audit, /notifications (email outbox), /security (password & security, real) | Demo, except /security |
| Analytics & Reporting | /analytics, /analytics/programs, /analytics/financials, /analytics/trust, /analytics/exports | Demo |
| Gamo Academy | /academy/enrollments, /academy/classes, /academy/hosted, /academy/sponsorships, /academy/safeguarding | Demo |
| Gamo Worship | /worship/review, /worship/requests, /worship/placement, /worship/standby, /worship/dispatch | Demo (standby and dispatch are not in the current plan) |
| Gamo Production | /production/requests, /production/projects, /production/training, /production/personnel | Demo |
| Governance & Stewardship | /nonprofit/partnerships, /nonprofit/sponsorships, /nonprofit/funding, /nonprofit/budgets, /nonprofit/stewardship, /nonprofit/reconciliation, /nonprofit/governance (route names historical), /legal (draft legal document registry) | Demo |

## Shared state coverage

Mobile menu/Escape, active navigation, keyboard focus, reduced motion, FAQs, local filters/no results, required/malformed input, disabled unavailable transaction states, admin demo state switching (`?state=loading|empty|error|success`), dialogs with focus trapping, responsive table card stacking. Evidence for the 2026-10-13 responsive review: `docs/screenshots/zoom-layout/results.json` and `BUILD_LOG.md`.

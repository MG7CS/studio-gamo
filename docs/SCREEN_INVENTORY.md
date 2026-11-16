# Gamo Studios — Public frontend screen inventory

Updated 2026-10-12 after recovering the interrupted Bright Cinematic Editorial implementation. All five public apps are in the founder-approved scope.

> **2026-11-16:** Gamo Live was dropped. `apps/live` (public pages and workspaces), the web `/live` page and the admin `/live/*` demo screens were removed; their rows are deleted below. The four public apps are web, worship, academy and production. The previous inventory is at tag `four-programs-snapshot`. **UI ready** means implemented as a local frontend preview, not launched or connected. Engineering evidence is in [MULTIPAGE_DESIGN_REVIEW.md](MULTIPAGE_DESIGN_REVIEW.md); new screens await founder visual acceptance.

> **2026-11-16 (second cleanup):** public accounts and every non-admin dashboard were removed (spec `docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`). The account entry screens, the church partner workspace, and the Worship (`/musician`, `/church`), Academy (`/family`, `/instructor`, `/host`, `/dashboard`) and Production (`/client`, `/crew`) workspaces are deleted from this inventory; their old URLs redirect (each app's `legacy-redirects.ts`). Worship and Production now have placeholder `/apply` and `/request` pages that the staff-editable forms replace in Phase 2. The admin app is the only dashboard.

## Organization hub — apps/web — port 4321

| Routes | Screens | Status |
| --- | --- | --- |
| / | Existing approved hero, nonprofit homepage, local sibling links | UI ready; hero preserved |
| /mission | Mission, needs, programs, audiences, values, invitation | UI ready |
| /get-involved | Churches, musicians, families, instructors, volunteers, organizers, supporters | UI ready |
| /partners | Hosting, sponsorship, shared resources and partnership integrity | UI ready |
| /partners/interest | Shows `hello@gamostudio.org` until the staff-editable partner-interest form lands (Phase 2) | Placeholder |
| /support | Education, resources, institutional support, volunteering, stewardship | UI ready |
| /contact | Shows `hello@gamostudio.org` until the staff-editable contact form lands (Phase 2) | Placeholder |
| /faq | Native accessible FAQ expansion | UI ready |
| /legal | Current status and policies pending review | UI ready; not final legal terms |
| /get-started | Audience routing to real program preview destinations | UI ready |
| /preview/hero-2026 | Separate bright hero and four photographic program cards | UI ready; replacement pending approval |

No filler news pages, donation checkout or automatic homepage hero rotation. Partnership/support pathways lead to dedicated pages.

## Gamo Worship — apps/worship — port 4322

| Routes | Screens | Status |
| --- | --- | --- |
| / | Bright worship hero, instruments, preparation, FAQs; CTAs "Apply to serve" → /apply, "Request a musician" → /request | UI ready |
| /apply | Musician application placeholder; becomes the staff-editable `musician_application` form (photo, video by link or upload, PDFs) in Phase 2 | Placeholder |
| /request | Church request placeholder; becomes the staff-editable `church_request` form in Phase 2 | Placeholder |
| /offers/[token] | One-click offer Accept/Decline page (GET shows details, POST acts) — Phase 3 | Planned |

Approvals, the private roster, offers and invoices run in admin (Phases 2–3). Old `/musician/*`, `/church/*`, `/opportunities` and `/check-in/*` URLs redirect.

## Gamo Academy — apps/academy — port 4323

| Routes | Screens | Status |
| --- | --- | --- |
| / | Exact approved headline, bright learning hero, instruments, ages, formats, instructors, sponsored/hosted pathways, FAQs | UI ready |
| /instruments, /instruments/[slug] | Discovery and piano, acoustic/electric guitar, bass, percussion, vocals detail | UI ready |
| /instructors/[slug] | Sample instructor profile | UI ready |
| /lessons, /lessons/[slug] | Filterable discovery and sample lesson details | UI ready |
| /register/[lesson] | Account-free family registration (parent-completed), validation, review | Real (D1) |
| /registrations/find, /open, /manage, /receipt | Emailed manage-link flow, no account | Real (D1) |
| /sponsored | Proposed sponsored/scholarship details | UI ready |
| /host-apply | Church hosting/sponsorship interest preview | UI ready |

No sponsored places, screened instructors or real enrollments are offered. Safeguarding, tuition and launch decisions remain pending.

## Gamo Production — apps/production — port 4325

| Routes | Screens | Status |
| --- | --- | --- |
| / | Technical ministry, audio/video/lighting, volunteers, event support | UI ready |
| /services, /services/[slug] | Support categories, learning skills and planning prompts | UI ready |
| /training | Proposed technical/volunteer training | UI ready |
| /apply | Technician application placeholder; becomes the staff-editable `technician_application` form in Phase 2 | Placeholder |
| /request | Production request placeholder; becomes the staff-editable `production_request` form in Phase 2 | Placeholder |

No completed projects, customers, scheduled consultations or available training places are claimed.

### Internal Staff Operations Application — apps/admin — port 4326 (the only dashboard)

> 2026-11-16: provider/church review (`/review/*`) and participation pages were removed. Phases 2–3 add `/forms`, `/forms/[id]` (builder), `/submissions`, `/submissions/[id]`, `/files/[id]`, `/roster`, `/requests`, offers and invoices. The demo rows below remain until those screens replace them.

| Routes | Screens | Status |
| --- | --- | --- |
| / | Staff Command Center: cross-program daily operational queue | UI ready |
| /programs | Comprehensive program status: Worship, Academy, Production | UI ready |
| /people | Directory of users, churches, and affiliated organizations | UI ready |
| /staff-roles | Staff roles, permissions matrix, and access tier registry | UI ready |
| /activity | Operational activity feed and administrative audit trail | UI ready |
| /worship/applications | Musician application queue (auditions, vetting states) | UI ready |
| /worship/review | Audition video review queue and staff decision modal | UI ready |
| /worship/requests | Incoming church musician requests needing placement | UI ready |
| /worship/placement | Musician placement dashboard (primary and standby) | UI ready |
| /worship/standby | Sunday standby coverage coordination and monitoring | UI ready |
| /worship/dispatch | Incident radar and simulated emergency musician dispatch | UI ready |
| /academy/instructors | Instructor candidate screening & vetting decisions | UI ready |
| /academy/enrollments | Student enrollment summaries (aggregate counts only) | UI ready |
| /academy/classes | Active instrument classes, church schedules, rooms | UI ready |
| /academy/hosted | Church-hosted programs & facility partnership oversight | UI ready |
| /academy/sponsorships | Student scholarship funds & tuition subsidy administration | UI ready |
| /academy/safeguarding | Background screening tracking & child safety policy compliance | UI ready |
| /production/requests | Church technical support inquiries and intake triage | UI ready |
| /production/projects | Technical installation & acoustic project tracking | UI ready |
| /production/training | Volunteer sound & video training program curriculum | UI ready |
| /production/personnel | Technical crew roster, specializations, availability | UI ready |
| /nonprofit/partnerships | Church partnership network & collaborative agreements | UI ready |
| /nonprofit/sponsorships | Prospective institutional grants & mission foundation dialogues | UI ready |
| /nonprofit/funding | Sample funding ledger (service receipts vs contributions) | UI ready |
| /nonprofit/budgets | Proposed FY2027 operational budget forecast (drafts) | UI ready |
| /nonprofit/stewardship | Quarterly stewardship reports & governance publications | UI ready |
| /nonprofit/reconciliation | Program fund accounting & financial reconciliation | UI ready |
| /nonprofit/governance | Governance documentation & transition checklist tracker | UI ready |
| /legal | Draft legal agreements register (Musician, Church) | UI ready |

## Shared state coverage

Mobile menu/Escape, active navigation, keyboard focus, reduced motion, audience switches, FAQs, local filters/no results, manual carousel, wizard Back/Next, required/malformed input, disabled unavailable transaction states, pending review and preview summaries, local dashboard state switching (?state=loading|empty|error|success), dialog open/close with focus trapping, tab bar navigation, drawer menus, responsive table card stacking. No-JavaScript form fallbacks prevent sending details. Persistent server failures and live authorization belong to future functionality.


### 2026-10-13 responsive correction review

Homepage photo collapse at short desktop heights corrected; mobile split-photo heroes now lead with imagery across organization/Worship/Academy/Production and Live promotion/event details. 120 targeted route/viewport checks passed; evidence in `docs/screenshots/zoom-layout/results.json`. This does not promote all screens to Reviewed: native zoom, text-only zoom and cross-browser sign-off remain outstanding. See `BUILD_LOG.md` for routes, commands and screenshot evidence.

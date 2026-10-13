# Gamo Studios — Public frontend screen inventory

Updated 2026-10-12 after recovering the interrupted Bright Cinematic Editorial implementation. All five public apps are in the founder-approved scope. **UI ready** means implemented as a local frontend preview, not launched or connected. Engineering evidence is in [MULTIPAGE_DESIGN_REVIEW.md](MULTIPAGE_DESIGN_REVIEW.md); new screens await founder visual acceptance.

## Organization hub — apps/web — port 4321

| Routes | Screens | Status |
| --- | --- | --- |
| / | Existing approved hero, nonprofit homepage, local sibling links | UI ready; hero preserved |
| /mission | Mission, needs, four programs, audiences, values, invitation | UI ready |
| /get-involved | Churches, musicians, families, instructors, volunteers, organizers, supporters | UI ready |
| /partners | Hosting, sponsorship, shared resources and partnership integrity | UI ready |
| /partners/interest | Local inquiry; required/invalid-email/preview/reset states | UI ready |
| /support | Education, resources, institutional support, volunteering, stewardship | UI ready |
| /contact | Local contact preview, no sending or storage | UI ready |
| /faq | Native accessible FAQ expansion | UI ready |
| /legal | Current status and policies pending review | UI ready; not final legal terms |
| /signin | Public sample-workspace entry, no credentials | UI ready |
| /get-started | Audience routing to real program preview destinations | UI ready |
| /preview/hero-2026 | Separate bright hero and four photographic program cards | UI ready; replacement pending approval |

No filler news pages, donation checkout or automatic homepage hero rotation. Partnership/support pathways lead to dedicated pages.

## Gamo Worship — apps/worship — port 4322

| Routes | Screens | Status |
| --- | --- | --- |
| / | Bright worship hero, audience switch, instruments, preparation, primary/standby, recurring needs, FAQs | UI ready |
| /apply, /apply/profile, /apply/audition, /apply/status | Application start, instrument/genre profile, audition-link validation, sample review status | UI ready |
| /hire, /hire/repertoire, /hire/schedule, /hire/summary | Church request, rehearsal/repertoire, scheduling, local review; pay/allocation separated | UI ready |
| /church/roster | Sample church roster | UI ready |
| /opportunities | Filterable sample opportunity board | UI ready |
| /apply/identity, /apply/logistics | Legacy redirects to current preview | UI ready |
| /hire/checkout, /hire/gig-details, /hire/success | Legacy redirects to non-transactional request screens | UI ready |
| /check-in/[id], /check-in/success, /check-in/standby-notified | Honest illustrative states, no attendance or dispatch submission | Preserved preview |
| /admin, /admin/assign/[id] | Older staff prototypes | Preserved; outside public redesign |

Identity capture, real vetting/approvals, payments, dispatch and persistence are deferred. Older redirect-only API stubs are not live integration evidence.

## Gamo Academy — apps/academy — port 4323

| Routes | Screens | Status |
| --- | --- | --- |
| / | Exact approved headline, bright learning hero, instruments, ages, formats, instructors, sponsored/hosted pathways, FAQs | UI ready |
| /instruments, /instruments/[slug] | Discovery and piano, acoustic/electric guitar, bass, percussion, vocals detail | UI ready |
| /instructors/[slug] | Sample instructor profile | UI ready |
| /lessons, /lessons/[slug] | Filterable discovery and sample lesson details | UI ready |
| /register | Local family registration, guardian/learner fields, validation, review | UI ready |
| /dashboard | Sample student/family dashboard | UI ready |
| /sponsored | Proposed sponsored/scholarship details | UI ready |
| /host-apply | Church hosting/sponsorship interest preview | UI ready |

No sponsored places, screened instructors or real enrollments are offered. Safeguarding, tuition and launch decisions remain pending.

## Gamo Live — apps/live — port 4324

| Routes | Screens | Status |
| --- | --- | --- |
| / | Manual cinematic spotlight, nearby rail, location/date, event categories, free/ticketed, organizers | UI ready |
| /events | Search/filter/clear/no-results collection | UI ready |
| /events/[id] | Sample event details, organizer identity, venue/date, ticketing state | UI ready |
| /events/[id]/tickets, /events/[id]/register | Sample tiers/free registration; canceled/external distinctions | UI ready |
| /organizers/[slug] | Sample organizer profile without fictional verified badges | UI ready |
| /promote | Distinct organizer introduction | UI ready |
| /promote/create, /organizer/events/new | Media, recurrence, venue, free/paid tiers, local validation and review | UI ready |
| /promote/status | Sample submission/review/publishing status | UI ready |
| /organizer, /organizer/manage | Sample dashboard and event management | UI ready |
| /organizer/verification | Pending identity/authority and ticketing authorization | UI ready |
| /organizer/preview, /organizer/report, /organizer/promotion | Preview, sample reports, proposed labeled promotion | UI ready |
| /checkout, /ticket, /my-tickets | Non-transactional checkout, invalid-for-admission ticket, sample collection | UI ready |
| /organizer/scan | Manual simulated scan states, no camera or real admission | UI ready |

All events, dates, prices, capacities and organizers are samples/proposals. No publishing, sales, payment, external ticket destination or live inventory is connected.

## Gamo Production — apps/production — port 4325

| Routes | Screens | Status |
| --- | --- | --- |
| / | Technical ministry, audio/video/lighting, volunteers, event support, equipment, honest project empty state | UI ready |
| /services, /services/[slug] | Six support categories, learning skills and planning prompts | UI ready |
| /training | Proposed technical/volunteer training | UI ready |
| /assessment | Required fields, Back/Next and actual local answer review | UI ready |
| /consultation, /consultation/confirmation | Required/invalid-email inquiry and explicit demo confirmation | UI ready |
| /contact | Legacy redirect to /consultation | UI ready |

No completed projects, customers, scheduled consultations or available training places are claimed.

## Admin and functionality — excluded from this public brief

Older Admin dashboard/legal inventory remain prototypes. Legal agreements now read drafts pending counsel review. New moderation, placement, ticketing, partnership and stewardship dashboards are **Not started**, requiring their own scope. No backend milestone is completed by this inventory. See [FUNCTIONALITY_PHASE_PLAN.md](FUNCTIONALITY_PHASE_PLAN.md).

## Shared state coverage

Mobile menu/Escape, active navigation, keyboard focus, reduced motion, audience switches, FAQs, local filters/no results, manual carousel, wizard Back/Next, required/malformed input, disabled unavailable transaction states, pending review and preview summaries. No-JavaScript form fallbacks prevent sending details. Persistent server failures and live authorization belong to future functionality.

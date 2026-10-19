# Gamo Studios — Public frontend screen inventory

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Removed since: the admin-password and gate-cookie code, `requireStaff`/`requireSuperadmin`/`verifyStaffBoundaryIdentity`, `provisionStaffIdentity`, the review form handlers and the break-glass variables. The `superadmin` role overrides, `isStaffOrAdmin` and every `audit_logs` write were removed too. Still in the repo until the rebuild: the `staff_reviewer` role check, `AdminService`, `ParticipationService.review`, `provider-review.ts` (self-review rules), the `audit_logs` and `admin_credentials` tables (migration 0005) and the admin Cloudflare resources.


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

## Authenticated Dashboard UI System (design-first preview)

All authenticated experiences operate in **design-first preview mode** with a persistent demo banner, fixed fictional identity (Jordan Avery), local-only interactions, and zero live authentication or backend writes.

### Account Entry & Personal Account — apps/web — port 4321

| Routes | Screens | Status |
| --- | --- | --- |
| /account/signin | Focused sign in preview; links to signup/recover; demo redirect | UI ready |
| /account/signup | Account registration preview; demo validation | UI ready |
| /account/recover | Password recovery simulation; no email sent | UI ready |
| /account/onboarding | Multi-step role & interest onboarding wizard | UI ready |
| /account/signed-out | Safe signed-out confirmation preview | UI ready |
| /account/access-denied | Clear authorization boundary explanation & role request link | UI ready |
| /account | Personal account hub; one account holding multiple program workspaces | UI ready |
| /account/roles | Program role affiliations & role request modal | UI ready |
| /account/organizations | Church & organizational affiliations; boundary notices | UI ready |
| /account/profile | Profile management form (demo validation) | UI ready |
| /account/notifications | Cross-program notification center & delivery preferences | UI ready |
| /account/settings | Password change demo, privacy & account closure controls | UI ready |

### Church Partner & Supporter Workspace — apps/web — port 4321

| Routes | Screens | Status |
| --- | --- | --- |
| /partner | Grace Fellowship (sample) partnership hub & overview | UI ready |
| /partner/programs | Supported programs: Worship, Academy, Live, Production | UI ready |
| /partner/commitments | Proposed sponsorships & in-kind facility agreements | UI ready |
| /partner/activities | Calendar and guidelines for hosted church activities | UI ready |
| /partner/updates | Mission bulletins & ministry updates | UI ready |
| /partner/contributions | Illustrative contribution statements; nonprofit notice | UI ready |
| /partner/reports | Stewardship documents & governance publications | UI ready |
| /partner/contacts | Church liaison contact details & Gamo liaisons | UI ready |

### Gamo Worship Workspaces — apps/worship — port 4322

| Routes | Screens | Status |
| --- | --- | --- |
| /musician | Musician overview: next service, open requests, readiness | UI ready |
| /musician/opportunities | Filterable opportunity board (primary vs standby) | UI ready |
| /musician/assignments | Confirmed services, call times & rehearsal schedule | UI ready |
| /musician/availability | Interactive calendar & weekly recurring availability | UI ready |
| /musician/standby | Standby coverage window & activation workflow | UI ready |
| /musician/gig, /musician/service | Service details, setlist, logistics, payment statement (aliases: /musician/service, /musician/assignment) | UI ready |
| /musician/repertoire | Instruments, musical styles, reading capabilities, bio | UI ready |
| /musician/verification | Application & audition review progress steps | UI ready |
| /musician/statements | Sample payment statements (musician pay vs admin allocation) | UI ready |
| /musician/notifications | Worship assignment alerts & notifications | UI ready |
| /musician/settings | Profile visibility & contact preferences | UI ready |
| /church | Church overview: upcoming services, open requests, standby | UI ready |
| /church/request | Comprehensive musician request form (rehearsal, style, standby) | UI ready |
| /church/requests | Active musician requests filterable by status | UI ready |
| /church/services | Upcoming church services agenda & calendar | UI ready |
| /church/musicians | Assigned musicians roster with approval status (aliases: /church/roster) | UI ready |
| /church/standby | Standby coverage monitoring per service | UI ready |
| /church/recurring | Recurring weekly scheduling & pattern manager | UI ready |
| /church/history | Service & request fulfillment history | UI ready |
| /church/statements | Church financial records (musician pay vs allocation separate) | UI ready |
| /church/profile | Church profile & team permission access control | UI ready |
| /church/roster | Legacy redirect and route alias to /church/musicians | UI ready |
| /admin, /admin/assign/[id] | Legacy prototypes redirect to apps/admin (/worship/placement) | UI ready |

### Gamo Academy Workspaces — apps/academy — port 4323

| Routes | Screens | Status |
| --- | --- | --- |
| /family | Student / Family overview: next lesson, learning tracks | UI ready |
| /family/lessons | Upcoming lessons & rehearsal agenda | UI ready |
| /family/programs | Enrolled instrument programs & class details | UI ready |
| /family/schedule | Interactive lesson calendar & reschedule request | UI ready |
| /family/tracks | Instrument progression & skill milestones | UI ready |
| /family/instructors | Instructor profiles & contact via program office (aliases: /family/teachers) | UI ready |
| /family/practice | Practice materials, audio stems & chord charts | UI ready |
| /family/progress | Attendance record & term evaluation notes | UI ready |
| /family/learners | Household learner management (minors privacy protected) | UI ready |
| /family/announcements | Academy term news & recital schedules | UI ready |
| /dashboard | Legacy redirect to /family | UI ready |
| /instructor | Instructor overview: teaching agenda, readiness, assigned classes | UI ready |
| /instructor/calendar | Interactive teaching calendar & studio availability | UI ready |
| /instructor/classes | Assigned group classes & church-hosted clinics | UI ready |
| /instructor/roster | Student roster (first name + initial, level, attendance only) | UI ready |
| /instructor/preparation | Lesson plan builder & curriculum preparation form | UI ready |
| /instructor/attendance | Daily attendance recording & status checklist | UI ready |
| /instructor/resources | Teaching curriculum, sheet music & pedagogical resources | UI ready |
| /instructor/qualifications | Screening and credential verification steps | UI ready |
| /instructor/statements | Teaching compensation statements (pay vs allocation separate) | UI ready |
| /instructor/profile | Teaching biography, instruments, formats | UI ready |
| /host | Church host & sponsor overview (Grace Fellowship sample) | UI ready |
| /host/classes | Hosted class schedule & room assignments | UI ready |
| /host/facility | Classroom inventory, piano availability, access rules | UI ready |
| /host/instructors | Assigned guest instructors & liaison details | UI ready |
| /host/enrollments | Aggregate enrollment summaries (no private minor data) | UI ready |
| /host/sponsorship | Proposed youth scholarships & in-kind hosting support | UI ready |
| /host/outcomes | Community educational impact & student recital reports | UI ready |
| /host/communications | Church host coordination & program office messages | UI ready |

### Gamo Live Workspaces — apps/live — port 4324

| Routes | Screens | Status |
| --- | --- | --- |
| /organizer | Consolidated organizer overview: events, registrations, review | UI ready |
| /organizer/events | Comprehensive event catalog (draft, in review, scheduled) | UI ready |
| /organizer/recurring | Recurring Bible study, youth, and prayer schedules | UI ready |
| /organizer/registrations | Attendee registrations list & ticket tier breakdown | UI ready |
| /organizer/tickets | Ticket tiers & capacity inventory (authorization pending) | UI ready |
| /organizer/attendance | Door check-in overview & scanner shortcut | UI ready |
| /organizer/communications | Attendee broadcast composer & dispatch history | UI ready |
| /organizer/promotion | Proposed awareness packages (labeled Sponsored) | UI ready |
| /organizer/reports | Post-event attendance & incident feedback reports | UI ready |
| /organizer/verification | Organizer verification workflow & ticketing authorization | UI ready |
| /organizer/payouts | Financial statements (proceeds, proposed fees, processing) | UI ready |
| /organizer/dashboard | Consolidated redirect to /organizer | UI ready |
| /organizer/manage | Consolidated redirect to /organizer/events | UI ready |
| /organizer/report | Consolidated redirect to /organizer/reports | UI ready |
| /my-tickets | Consolidated redirect to /me/tickets | UI ready |
| /me | Attendee account hub: upcoming events, saved, ticket counts | UI ready |
| /me/tickets | Sample digital tickets (clearly marked 'Not valid for admission') | UI ready |
| /me/registrations | Free RSVPs & event registrations collection | UI ready |
| /me/upcoming | Personalized chronological event agenda | UI ready |
| /me/saved | Bookmarked events and followed Christian ministries | UI ready |
| /me/history | Archive of past gatherings attended | UI ready |
| /me/settings | Attendee preferences and notification channels | UI ready |

### Gamo Production Workspaces — apps/production — port 4325

| Routes | Screens | Status |
| --- | --- | --- |
| /client | Church client overview: project milestones, support requests | UI ready |
| /client/requests | Technical assistance inquiries (audio, video, lighting) | UI ready |
| /client/assessments | Sanctuary acoustic & gear needs assessment review | UI ready |
| /client/consultations | Technical consultation calendar & booking request | UI ready |
| /client/milestones | Project milestone tracker for soundboard upgrade | UI ready |
| /client/documents | Technical schematics, equipment recommendations, PDFs | UI ready |
| /client/history | Completed support requests and equipment audits | UI ready |
| /client/messages | Technical coordinator communication thread | UI ready |
| /crew | Volunteer / Technician overview: tasks, projects, training | UI ready |
| /crew/tasks | Operational tasks queue (cables, mics, console patches) | UI ready |
| /crew/availability | Studio & Sunday service technical availability calendar | UI ready |
| /crew/checklists | Stage audio, broadcast video, and wireless mic checklists | UI ready |
| /crew/training | Volunteer live audio & broadcast training tracks | UI ready |
| /crew/team | Technical crew communications & mentor directory | UI ready |
| /crew/resources | Dante networking, gain staging, and mixer cheat-sheets | UI ready |

### Internal Staff Operations Application — apps/admin — port 4326

| Routes | Screens | Status |
| --- | --- | --- |
| / | Staff Command Center: cross-program daily operational queue | UI ready |
| /programs | Comprehensive program status: Worship, Academy, Live, Production | UI ready |
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
| /live/submissions | Christian event submission queue awaiting review | UI ready |
| /live/organizers | Organizer authority & ticketing authorization vetting | UI ready |
| /live/moderation | Event content moderation & Christian gathering alignment | UI ready |
| /live/ticketing | Ticketing oversight, tier configuration, capacity caps | UI ready |
| /live/refunds | Ticket refund requests & cancellation handling (simulated) | UI ready |
| /live/reports | Post-event attendee feedback & incident reports | UI ready |
| /live/scanning | Real-time entrance scanning & check-in operational monitoring | UI ready |
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
| /legal | Draft legal agreements register (Musician, Church, Tickets) | UI ready |

## Shared state coverage

Mobile menu/Escape, active navigation, keyboard focus, reduced motion, audience switches, FAQs, local filters/no results, manual carousel, wizard Back/Next, required/malformed input, disabled unavailable transaction states, pending review and preview summaries, local dashboard state switching (?state=loading|empty|error|success), dialog open/close with focus trapping, tab bar navigation, drawer menus, responsive table card stacking. No-JavaScript form fallbacks prevent sending details. Persistent server failures and live authorization belong to future functionality.


### 2026-10-13 responsive correction review

Homepage photo collapse at short desktop heights corrected; mobile split-photo heroes now lead with imagery across organization/Worship/Academy/Production and Live promotion/event details. 120 targeted route/viewport checks passed; evidence in `docs/screenshots/zoom-layout/results.json`. This does not promote all screens to Reviewed: native zoom, text-only zoom and cross-browser sign-off remain outstanding. See `BUILD_LOG.md` for routes, commands and screenshot evidence.

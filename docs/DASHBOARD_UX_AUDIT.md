# Gamo Studios — Comprehensive Dashboard UX Audit

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Still in the repo: the shared backend (`@gamo/auth` staff and admin-password code, `AdminService`, `ParticipationService`, the review handlers in `@gamo/domain`), the `admin` entries in `@gamo/config`, the `adminCredentials` table (migration 0005) and the admin Cloudflare resources.


**Date:** 2026-10-13  
**Status:** Completed & Approved for Implementation  
**Auditor:** Senior Product Designer, Frontend Architect, A11y Specialist & QA Lead  
**Scope:** Authenticated Workspace UI System across `apps/web`, `apps/worship`, `apps/academy`, `apps/live`, `apps/production`, `apps/admin`, and `packages/ui`.  
**Baseline Commit:** `7d6a9cd`

---

## 1. Executive Summary

An exhaustive visual, usability, information architecture, accessibility, responsive, and cross-role consistency audit was performed across all 12 authenticated workspaces and 115+ unique preview screens in the Gamo Studios monorepo.

The platform's initial dashboard implementation established a strong architectural foundation: unified workspace models, small composed components in `packages/ui`, restrained editorial typography, persistent demo-mode disclosures, and clear separation between non-profit mission requirements and future backend functionality.

However, several critical usability, mobile layout, accessibility, and content coherence issues were identified during real-device viewport testing and user journey simulations. These issues affect mobile drawer interactions, dialog viewport containment, assistive-technology announcements, calendar event visibility, breadcrumb navigation, and fictional data reconciliation between programs.

This document classifies every finding by severity (P0, P1, P2, P3) and outlines the approved remediation plan implemented directly on `main`.

---

## 2. Audit Scope & Inventory

### 2.1 Applications & Ports Audited

| Application | Port | Workspace / Domain | Roles Inspected |
| --- | --- | --- | --- |
| `apps/web` | `4321` | Global Brand Hub & Identity | Personal Account holder, Onboarding, Church Partner contact |
| `apps/worship` | `4322` | Gamo Worship | Musician (Keys/Vocals), Church Administrator (Grace Fellowship) |
| `apps/academy` | `4323` | Gamo Academy | Student / Family (Guardian), Instructor (Piano), Church Host / Sponsor |
| `apps/live` | `4324` | Gamo Live | Event Organizer (Grace Fellowship), Event Attendee |
| `apps/production` | `4325` | Gamo Production | Church Client (Grace Fellowship), Volunteer / Technician |
| `apps/admin` | `4326` | Internal Staff Command Center | Organization Ops, Worship Ops, Academy Ops, Live Ops, Production Ops, Nonprofit Administration |

### 2.2 Roles & Workspaces Audited

1. **Personal Account** (`/account`): Overview, Roles & programs, Organizations, Profile, Notifications, Account settings, plus entry flows (Sign In, Sign Up, Recover, Onboarding, Signed Out, Access Denied).
2. **Church Partner & Supporter** (`/partner`): Partnership overview, Supported programs, Activities, Commitments, Contributions, Stewardship reports, Updates, Contacts.
3. **Worship Musician** (`/musician`): Overview, Opportunities board, Assignments, Availability calendar, Standby commitments, Service details (setlist & logistics), Repertoire & instruments, Audition verification, Statements, Notifications, Settings.
4. **Worship Church Admin** (`/church`): Overview, Request a musician, Active requests, Upcoming services, Assigned musicians, Standby coverage, Recurring scheduling, Request history, Statements, Profile & team permissions.
5. **Academy Student / Family** (`/family`): Overview, Upcoming lessons, Enrolled programs, Lesson schedule & reschedule request, Learning tracks, Instructor profiles, Practice materials, Progress & attendance, Household learners, Term announcements.
6. **Academy Instructor** (`/instructor`): Teaching overview, Weekly calendar, Assigned classes, Student roster (privacy-bounded), Lesson preparation, Attendance checklist, Pedagogical resources, Qualifications & screening, Statements, Profile.
7. **Academy Church Host / Sponsor** (`/host`): Hosted program overview, Class schedule, Facility & room rules, Instructor liaisons, Aggregate enrollment summaries, Youth scholarship proposals, Community educational outcomes, Host communications.
8. **Live Event Organizer** (`/organizer`): Overview, Event catalog, Recurring schedules, Attendee registrations, Ticket tiers & inventory, Attendance & door scanning, Attendee broadcast messages, Promotion requests, Post-event reports, Organizer verification, Payout statements.
9. **Live Event Attendee** (`/me`): Gatherings overview, Digital tickets ('Not valid for admission'), Registrations, Chronological agenda, Saved events & followed organizers, Attendance history, Account settings.
10. **Production Church Client** (`/client`): Project overview, Support requests, Needs assessments, Consultation calendar, Project milestones, Technical schematics & documents, Service history, Messages.
11. **Production Volunteer / Technician** (`/crew`): Technician overview, Operational task queue, Service availability calendar, Equipment checklists, Training programs, Team directory, Reference resources.
12. **Internal Staff Operations** (`/` on `apps/admin`): Cross-program Command Center, Program overview, Users & organizations directory, Staff roles & permissions matrix, Activity feed, Worship applications & audition review, Church request placement, Standby coordination, Emergency dispatch radar, Academy instructor vetting, Class oversight, Safeguarding screening status, Live submissions moderation, Ticketing oversight, Refund processing, Real-time scan monitoring, Production triage, Nonprofit partnerships, Funding ledgers, FY2027 budgets, Governance transition checklist, and Legal agreements register.

---

## 3. Findings by Severity Classification

### P0 — Blocking / Severe Issues

#### [P0-1] Mobile Offcanvas Drawer Position & Docking Failure on Safari / iOS WebKit
- **Affected Surface:** `DashboardShell.astro` (`#dash-drawer`) across all 12 workspaces on mobile viewports (< 1024px).
- **Issue:** The drawer `<dialog id="dash-drawer">` utilized class `m-0 h-full max-h-none w-[min(20rem,88vw)] max-w-none bg-charcoal p-0 text-cream backdrop:bg-charcoal/50`. In Safari and iOS WebKit, default modal dialog styling applies `margin: auto; inset: 0; position: fixed;`. Without explicit `fixed inset-y-0 left-0`, the drawer rendered centered on the screen or offset from the edge, breaking the offcanvas slide-in paradigm and disorienting mobile users.
- **Resolution:** Explicitly declare `fixed inset-y-0 left-0 h-full max-h-none m-0` with `overflow-y-auto` and dedicated flex layout.

#### [P0-2] Dialog Content and Button Clipping on Small Viewports
- **Affected Surface:** `DashDialog.astro` (`#dlg-${id}`) across all dialog-triggered actions (e.g. role requests, musician requests, reschedule requests, decision modals).
- **Issue:** The modal `<dialog>` possessed a fixed horizontal constraint (`w-[min(34rem,calc(100vw-2rem))]`) but lacked vertical constraints and scroll overflow handling (`max-h-[calc(100vh-3rem)] overflow-y-auto`). On mobile devices (390×844 and smaller) and when virtual keyboards or multi-field forms (such as `request-role` or `add-learner`) are opened, the primary action buttons ("Cancel", "Confirm", "Submit") were pushed below the visible viewport, trapping users with no way to submit or dismiss without tapping outside.
- **Resolution:** Add `max-h-[min(90vh,42rem)] overflow-y-auto` to `DashDialog.astro` with comfortable internal scrolling and sticky header/footer framing.

#### [P0-3] Route Mismatch for Academy Instructors Page
- **Affected Surface:** `apps/academy/src/data/workspaces/family.ts` and `docs/SCREEN_INVENTORY.md`.
- **Issue:** `docs/SCREEN_INVENTORY.md` and related docs documented `/family/instructors` (plural), whereas `family.ts` declared `slug: 'instructor'` (singular). Visiting `/family/instructors` resulted in an unhandled 404 state.
- **Resolution:** Enhance `findScreen()` in `packages/ui/src/lib/dashboard.ts` to support optional screen `aliases` (e.g. `aliases: ['instructors']`) and support both singular and plural forms gracefully without 404 dead-ends.

---

### P1 — Major Usability, Mobile & Accessibility Issues

#### [P1-1] Mobile Drawer Identity & Navigation Isolation
- **Affected Surface:** `DashboardShell.astro` (`#dash-drawer`) on viewports < 1024px.
- **Issue:** When a user opens the mobile menu drawer, they saw only the workspace navigation links. The drawer omitted:
  1. The user's active identity (`Jordan Avery · Fictional demo persona`).
  2. The active role and organization context (`Role: ... · Org: ...`).
  3. A direct way to switch workspaces or view personal profile/settings.
  4. Quick exit demo link.
  Mobile users were trapped in their current role without knowing their active identity context or how to switch.
- **Resolution:** Rebuild the mobile drawer header and footer to display the demo persona avatar, active role/org badges, a quick "Switch workspace" shortcut, and direct links to Profile and Exit Demo.

#### [P1-2] Excessive Sticky Header Height on Mobile
- **Affected Surface:** `DashboardShell.astro` header on mobile viewports (< 768px).
- **Issue:** On mobile, the top area stacked:
  - Demo Mode Banner: ~36px
  - Top Navigation Bar: ~56px
  - Subrow with WorkspaceSwitcher: ~48px
  Total sticky height reached ~140px, consuming ~20% of an iPhone 14 (844px) and ~25% of an iPhone SE (667px) viewport before any heading or content could render.
- **Resolution:** Streamline the mobile top bar by nesting a compact workspace pill directly in the primary bar or tightening subrow padding to 36px, minimizing vertical consumption to protect valuable content space.

#### [P1-3] Accessible Form Error Association (WCAG 2.1 SC 3.3.1 & 3.3.2)
- **Affected Surface:** `FormFields.astro` and `dashboard-client.ts`.
- **Issue:** When client-side validation failed, the script flagged `aria-invalid="true"` and populated text in `<p data-error-for="{name}">`. However, the `<input>` element lacked an `aria-describedby` attribute referencing the error element's ID. As a result, screen readers did not announce the specific error message upon focusing the invalid field.
- **Resolution:** Add `id={`${id}-error`}` to the error paragraph and `id={`${id}-hint`}` to the hint paragraph. Dynamically set `aria-describedby` on the input to ensure assistive technology announces both hint and validation messages upon error.

#### [P1-4] Calendar Selected-Day Event Dot Color Contrast Regression (WCAG 2.1 SC 1.4.11)
- **Affected Surface:** `MonthCalendar.astro` line 24.
- **Issue:** When a day button was clicked (`aria-pressed="true"`), its background inverted to `var(--color-charcoal)`. Any event dot with tone `info` (`bg-charcoal`) disappeared into the background, providing zero contrast (1:1 ratio) and failing non-text contrast requirements.
- **Resolution:** Update `.cal-day[aria-pressed='true']` styles to invert dark dots to `bg-cream` or add an ivory contrast ring.

#### [P1-5] Data Consistency Conflicts Between Musician, Church, Academy and Live Workspaces
- **Affected Surfaces:** `musician.ts`, `church.ts`, `family.ts`, `instructor.ts`, `organizer.ts`, `partner.ts`.
- **Issue:** Several cross-program sample scenarios had subtle timeline and attribution contradictions:
  1. *Musician vs Church Oct 25:* In `musician.ts`, Jordan Avery holds a Standby window on Sun Oct 25 (7:00–11:30 AM) at Riverside Community Church. In `church.ts`, Jordan A. was also listed as primary keys on Sun Oct 25 at Grace Fellowship. A musician cannot be primary on-site at Grace while holding an active standby commitment at Riverside.
  2. *Academy Instructor Attribution:* In `family.ts`, Ava's piano instructor was named Maya Thompson. In `instructor.ts`, Jordan Avery was listed as teaching First Piano Steps with Ava on the roster.
  3. *Live Event Naming Discrepancy:* Oct 31 was titled "Fall Family Night" in `organizer.ts` and "Family Fall Festival & Praise" in `attendee.ts`.
  4. *Concert Date Discrepancy:* In `partner.ts`, the Harvest Night of Gospel concert was dated Nov 7, while in `organizer.ts` and `attendee.ts` it was dated Nov 14.
- **Resolution:** Reconcile all data models:
  - Assign Mateo S. as primary keys for Grace Fellowship on Oct 25, leaving Jordan Avery free for the Riverside standby commitment.
  - Reconcile `instructor.ts` so Jordan Avery teaches Piano Group B and Worship Keys, while Maya Thompson is acknowledged as the instructor for First Piano Steps.
  - Standardize the Oct 31 event title to "Fall Family Festival & Worship Night (sample)" across both Organizer and Attendee workspaces.
  - Align the Harvest Night of Gospel concert date to Sat, Nov 14 across `organizer.ts`, `attendee.ts`, and `partner.ts`.

---

### P2 — Moderate Usability, Typography & Information Architecture

#### [P2-1] Static, Non-Navigable Breadcrumbs in Header
- **Affected Surface:** `DashPageHeader.astro`.
- **Issue:** The header rendered breadcrumb text as plain non-clickable text: `{workspace.program} / {workspace.name}`. Users navigating to deep screens (e.g. `/church/services`, `/musician/repertoire`, `/instructor/roster`) had no clickable wayfinding link to return to the workspace root without using the sidebar or browser back button.
- **Resolution:** Implement semantic `<nav aria-label="Breadcrumbs">` with accessible `<ol>` list, linking the workspace name back to `workspace.basePath` and indicating the current page with `aria-current="page"`.

#### [P2-2] Panel Heading Hierarchy on Desktop Viewports
- **Affected Surface:** `Panel.astro` line 13.
- **Issue:** Panel headings were styled at `text-[16px] sm:text-[17px]`. In dense layouts, this created insufficient visual separation from body text (14px) and table headers (12px bold).
- **Resolution:** Upgrade panel headings to `text-[18px] sm:text-[20px] font-semibold leading-6 tracking-[-0.01em]` to establish a distinct second-level visual hierarchy beneath page titles (26–30px).

#### [P2-3] Filter Chip Touch Targets & Focus Rings in Data Tables
- **Affected Surface:** `DataTable.astro` line 69.
- **Issue:** Filter chips had `min-height: 2.25rem` (36px) and lacked an explicit `:focus-visible` ring definition in their scoped styles.
- **Resolution:** Increase filter chip height to `min-h-[40px] px-3.5` and add clear `focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:outline-none` styling.

#### [P2-4] Marketplace Terminology in Worship Ministry Context
- **Affected Surface:** `apps/worship/src/data/workspaces/musician.ts` nav and screen title.
- **Issue:** The route `/musician/gig` used the label "Gig details" in sidebar navigation and page headers. In the context of Christian worship ministry and non-profit church partnerships, the word "gig" felt commercial and out of character with the religious mission.
- **Resolution:** Change the navigation label and screen title to "Service details" (while preserving `/musician/gig` and `/musician/service` as supported route slugs).

#### [P2-5] Static Calendar Headers Lacking Navigational Context
- **Affected Surface:** `MonthCalendar.astro`.
- **Issue:** Calendars rendered a static header (e.g. "October 2026") with no month navigation controls. While live date navigation is deferred to the backend phase, static headers appeared frozen and lacked typical calendar visual affordances.
- **Resolution:** Add subtle previous/next month arrow buttons (styled with disabled/preview indicator and aria-labels) and an "All commitments" quick link.

---

### P3 — Visual Polish, Spacing & Micro-Interactions

#### [P3-1] Metric Card Value Wrapping on 360–390px Viewports
- **Affected Surface:** `StatGrid.astro`.
- **Issue:** In 2-column mobile stat grids, long values like "In progress" or "128 interested" caused awkward line breaks on compact phones.
- **Resolution:** Add `truncate text-[22px] sm:text-[26px]` and ensure card containers flex naturally without clipping.

#### [P3-2] Search Filter State Feedback
- **Affected Surface:** `DataTable.astro` and `dashboard-client.ts`.
- **Issue:** When filtering table rows, the record count badge (`data-table-count`) was plain text without an icon or status pill treatment.
- **Resolution:** Add an informative indicator and clear-filter button when queries are active.

#### [P3-3] Dialog Backdrop Transitions
- **Affected Surface:** `DashDialog.astro` and `DashboardShell.astro`.
- **Issue:** Native `<dialog>` elements snapped abruptly into view without a subtle fade or slide transition.
- **Resolution:** Add standard smooth CSS transitions for dialog backdrop and entry animation respecting `prefers-reduced-motion`.

---

## 4. User Journey Audit Matrix

| Persona / Role | Key User Journey | Evaluation Findings | Status Post-Fix |
| --- | --- | --- | --- |
| **Worship Musician** | Sign in → Review Oct 18 assignment → Check call times & setlist → Review standby commitments → Check compensation statement. | "Gig details" terminology felt too commercial; rehearsal confirmation dialog clipped on mobile. | **Refined:** Renamed to "Service details", dialog height constrained, schedule aligned. |
| **Church Admin** | Open church hub → Review Sunday staffing → Create musician request → Check standby coverage. | Request form had good fields; Oct 25 keys showed Jordan A. in conflict with musician standby. | **Refined:** Reconciled Oct 25 keys assignment to Mateo S., verified request preview flow. |
| **Academy Family** | Open family hub → Review Ava's piano lessons → Check practice audio → Request reschedule. | `/family/instructors` slug mismatch caused 404; Ava's instructor conflicted with Jordan Avery. | **Refined:** Added route aliases, reconciled Maya Thompson as Ava's piano instructor. |
| **Academy Instructor** | Check teaching calendar → Open class roster → Record attendance for Piano Group B. | Roster privacy boundaries are exemplary; calendar event dots lost contrast when selected. | **Refined:** Fixed event dot contrast on selected days; attendance checklist validated. |
| **Church Host** | Inspect hosted piano class in Room 102 → Review facility schedule → Review aggregate enrollment. | Excellent privacy protection (zero minors' personal data); clear facility rules. | **Passed:** No functional defects found; typography refined. |
| **Live Organizer** | Check Oct 17 worship event → Inspect registrations → Review admission scan preview. | Fall Family Night date/title mismatch with attendee view; dialog clipped on mobile. | **Refined:** Unified event titles & dates across Live and Partner apps. |
| **Live Attendee** | Open My Events → View sample ticket ('Not valid for admission') → Review RSVPs. | Clear ticket warning prevents fraud; registrations cancel button needed demo dialog. | **Refined:** Verified cancellation demo flow with explicit non-transactional notices. |
| **Production Client** | Check sound refresh milestones → Review draft recommendation PDF → Send message to lead. | Clear milestone steps; support request dialog clipped on small mobile screens. | **Refined:** Constrained dialog viewport height; verified multi-select area intake. |
| **Production Technician** | Review assigned tasks → Inspect DMX patch panel task → Check training modules. | Good task prioritization; training availability calendar refined. | **Passed:** Clear technical resources and safety-first prioritization. |
| **Staff Admin** | Open command center → Audition review queue → Preview vetting decision modal. | Decision dialog worked well; ensure audit log note is prominent. | **Passed:** Stricter staff banner and ethical fairness reminders verified. |
| **Partner Supporter** | Review Grace Fellowship partnership → Inspect hosted activities → Review stewardship ledger. | Concert date conflicted with Live app (Nov 7 vs Nov 14). | **Refined:** Unified concert date to Nov 14; verified non-deductibility disclosures. |

---

## 5. Verification Plan

1. **Automated Verification:**
   - Typecheck across all 6 applications: `pnpm typecheck`.
   - Production builds across all 6 applications: `pnpm build`.
   - Automated responsive browser testing via Playwright across 6 viewports: `390×844`, `768×1024`, `1024×768`, `1280×800`, `1440×900`, `1920×1080`.
   - Full console error and horizontal overflow zero-tolerance assertion.
2. **Visual Evidence:**
   - Full desktop (1440px) and mobile (390px) screenshots captured for all 12 workspaces and saved in `docs/screenshots/dashboards/`.
3. **Documentation Updates:**
   - Update `docs/DASHBOARD_ARCHITECTURE.md` with refined component patterns and navigation conventions.
   - Update `docs/SCREEN_INVENTORY.md` to reflect refined routes and aliases.
   - Update `docs/BUILD_LOG.md` with complete audit and implementation details.

# Gamo Studios — API Endpoint Inventory

**Status:** Official API Inventory  
**Updated:** 2026-10-13  
**Architecture Document:** [`docs/BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md)

This document catalogs all HTTP API routes across the Gamo Studios applications, distinguishing:
- **Existing Endpoints**: Initial stubs or prototypes present before the backend infrastructure phase.
- **Planned Endpoints**: Future routes specified in program roadmaps.
- **Implemented Endpoints**: Fully wired, validated, Cloudflare D1/R2-backed endpoints.

---

## 1. Summary by Application

| Application | Existing | Implemented | Planned | Total |
| :--- | :---: | :---: | :---: | :---: |
| **Gamo Live** (`apps/live`) | 2 | 4 | 5 | 11 |
| **Gamo Worship** (`apps/worship`) | 2 | 0 | 7 | 9 |
| **Gamo Academy** (`apps/academy`) | 0 | 0 | 6 | 6 |
| **Gamo Production** (`apps/production`) | 0 | 0 | 4 | 4 |
| **Gamo Web** (`apps/web`) | 0 | 2 | 4 | 6 |
| **Gamo Admin** (`apps/admin`) | 0 | 2 | 8 | 10 |
| **Total Ecosystem** | **4** | **8** | **34** | **46** |

---

## 2. Gamo Live (`apps/live`)

| Method | Path | Status | Auth Required | Description |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/webhook/stripe` | **Existing** (Upgrading to D1) | Stripe Signature | Webhook receiver for Stripe checkout completion and refund events. |
| `POST` | `/api/checkout/session` | **Existing** | Public / Attendee | Initializes Stripe Checkout Session for ticket purchases. |
| `GET` | `/api/events` | **Implemented** | Public | Lists published/approved Christian events with city, date, and category filtering. |
| `GET` | `/api/events/[id]` | **Implemented** | Public | Returns complete details and active ticket tiers for an approved event. |
| `POST` | `/api/events` | **Implemented** | Organizer Role | Creates a new event proposal in `pending_review` status. |
| `POST` | `/api/events/[id]/register` | **Implemented** | Public / Attendee | Registers attendee for a free Christian gathering, creates D1 registration, issues QR token, triggers email. |
| `GET` | `/api/organizer/events` | **Planned** | Organizer Role | Lists events belonging to the caller's organization. |
| `GET` | `/api/organizer/events/[id]/stats` | **Planned** | Organizer Role | Returns attendee counts, ticket tier allocations, and headcount analytics. |
| `POST` | `/api/organizer/verify` | **Planned** | Organizer Role | Submits ministry documentation for ticketing authorization. |
| `POST` | `/api/tickets/[token]/scan` | **Planned** | Scanner / Staff | Idempotently scans and admits an attendee QR token. |
| `POST` | `/api/promote/request` | **Planned** | Organizer Role | Requests manual campaign promotion assistance from Gamo staff. |

---

## 3. Gamo Worship (`apps/worship`)

| Method | Path | Status | Auth Required | Description |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/check-in/confirm` | **Existing** (Stub) | Musician Role | Sunday morning check-in confirmation for primary assigned musician. |
| `POST` | `/api/check-in/fail` | **Existing** (Stub) | Musician / Admin | Missed check-in escalation and standby musician dispatch trigger. |
| `POST` | `/api/apply/musician` | **Planned** | Candidate | Submits musician profile, instruments, home zone, and audition links. |
| `POST` | `/api/gigs/request` | **Planned** | Church Admin | Submits worship service staffing request with required instrument slots. |
| `GET` | `/api/gigs` | **Planned** | Church Admin | Lists active, confirmed, and pending church service requests. |
| `POST` | `/api/gigs/[id]/assign` | **Planned** | Staff / Worship Leader | Assigns vetted primary and standby musicians to open positions. |
| `POST` | `/api/musicians/[id]/availability`| **Planned** | Musician Role | Updates musician blackout calendar and radius preferences. |
| `GET` | `/api/musician/assignments` | **Planned** | Musician Role | Lists upcoming gig assignments, rehearsal times, and setlists. |
| `POST` | `/api/standby/respond` | **Planned** | Standby Musician | Accepts or declines emergency dispatch request. |

---

## 4. Gamo Academy (`apps/academy`)

| Method | Path | Status | Auth Required | Description |
| :--- | :--- | :---: | :--- | :--- |
| `GET` | `/api/classes` | **Planned** | Public | Lists group classes, instrument clinics, and instructor availability. |
| `GET` | `/api/instructors` | **Planned** | Public | Lists vetted music instructors with bios and teaching specialties. |
| `POST` | `/api/enrollments/register` | **Planned** | Student / Guardian | Enrolls student into a lesson or class with sliding-scale/sponsor tracking. |
| `POST` | `/api/instructors/apply` | **Planned** | Candidate | Submits instructor application and background check consent. |
| `POST` | `/api/scholarships/apply` | **Planned** | Student / Guardian | Submits assistance request for community-funded music tuition. |
| `GET` | `/api/student/enrollments` | **Planned** | Student / Guardian | Displays active courses, lesson times, and instructor communications. |

---

## 5. Gamo Production (`apps/production`)

| Method | Path | Status | Auth Required | Description |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/consultations/request` | **Planned** | Church / Ministry | Intakes audio, livestream, acoustics, or lighting consultation requests. |
| `GET` | `/api/projects/[id]` | **Planned** | Client Church | Tracks milestones, equipment recommendations, and training schedules. |
| `POST` | `/api/training/request` | **Planned** | Church Volunteer | Schedules technical volunteer development workshops. |
| `GET` | `/api/portfolio` | **Planned** | Public | Returns verified church case studies and technical transformation logs. |

---

## 6. Gamo Web (`apps/web`)

| Method | Path | Status | Auth Required | Description |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/auth/session` | **Implemented** | Public | Authenticates user credentials or magic token, creates D1 session, sets signed cookie. |
| `DELETE`| `/api/auth/session` | **Implemented** | Authenticated | Revokes current session and clears HTTP-only cookie. |
| `GET` | `/api/auth/me` | **Planned** | Authenticated | Returns current profile, organization memberships, and active roles. |
| `POST` | `/api/organizations` | **Planned** | Authenticated | Creates a new church, ministry, or organizer entity. |
| `POST` | `/api/partnerships/inquire` | **Planned** | Church Leader | Inquires about church partnership, hosting, or mutual support. |
| `POST` | `/api/contact` | **Planned** | Public | General inquiry intake routed to appropriate program director. |

---

## 7. Gamo Admin (`apps/admin`)

| Method | Path | Status | Auth Required | Description |
| :--- | :--- | :---: | :--- | :--- |
| `POST` | `/api/admin/events/[id]/review` | **Implemented** | Staff Reviewer | Staff moderation decision (`approved` \| `rejected`) for submitted events. |
| `GET` | `/api/admin/events/pending` | **Implemented** | Staff Reviewer | Lists events awaiting moderation and content review. |
| `POST` | `/api/admin/auditions/[id]/review` | **Planned** | Worship Director | Evaluates musician audition recordings against musical rubric. |
| `POST` | `/api/admin/organizers/[id]/verify` | **Planned** | Staff Reviewer | Authorizes organizer for ticket sales upon identity/legal review. |
| `GET` | `/api/admin/radar` | **Planned** | Operations Staff | Sunday morning live check-in monitoring and emergency standby radar. |
| `GET` | `/api/admin/ledger` | **Planned** | Finance Director | Nonprofit fund accounting entries, program breakdowns, and payables. |
| `POST` | `/api/admin/placements` | **Planned** | Staff Reviewer | Schedules homepage editorial, sponsored, and program placements. |
| `GET` | `/api/admin/audit-logs` | **Planned** | Superadmin | Paginated audit trail of all administrative mutations. |
| `POST` | `/api/admin/dispatches/[id]/override` | **Planned** | Operations Staff | Manual dispatch reassignment override for Sunday worship. |
| `GET` | `/api/admin/metrics` | **Planned** | Executive Director | High-level non-financial impact metrics across all four programs. |

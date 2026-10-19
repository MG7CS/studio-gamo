# Gamo Studios: Functionality Phase Plan

> **Status (2026-10-19):** the previous admin app (`apps/admin`: pages, `/api/*` staff routes, `scripts/admin/*`, `staff:account:sql`, `make *-admin`) was deleted and a new admin is being designed from scratch. What this describes about it is historical. Still in the repo: the shared backend (`@gamo/auth` staff and admin-password code, `AdminService`, `ParticipationService`, the review handlers in `@gamo/domain`), the `admin` entries in `@gamo/config`, the `adminCredentials` table (migration 0005) and the admin Cloudflare resources.


**2026-10-13 Status Update — Backend Foundation & First Functional Slice Completed:**
The backend infrastructure phase has commenced and completed its core foundational milestones:
1. Complete relational schema in `packages/db` with D1 migrations 0000–0002 covering all 33 entity tables.
2. Evaluated and implemented native Web Crypto session authentication (`@gamo/auth`) with HMAC-SHA256 cookie signing and server-side RBAC/tenant isolation guards.
3. R2 object storage abstraction in `packages/integrations` with scope policies and signed upload tickets.
4. Shared domain service layer (`@gamo/domain`) with thin API route handlers and Zod validation.
5. Durable Stripe webhook processing in D1 with nonprofit ledger separation.
6. First end-to-end functional slice completed and verified in Gamo Live (event creation -> staff review -> discoverability -> free attendee registration with QR token -> Resend email notification -> organizer dashboard totals).
All 39 automated tests pass.

## Overview
This document outlines the phased backend integration strategy for the Gamo Studios ecosystem.

**Organizational context:** these phases build infrastructure for a proposed Christian nonprofit ([GAMO_NONPROFIT_MODEL.md](GAMO_NONPROFIT_MODEL.md)). No fee, contribution amount or tier is hardcoded; all are configuration set by approved policy. Musician and instructor pay are always recorded separately from any Gamo allocation.

## Phase 1: Authentication & Shared Core Services [COMPLETED 2026-10-13]
1. **Database Schema Finalization (`packages/db`)** — COMPLETED
   - Complete Drizzle schema and D1 migrations 0000–0002 for `users`, `sessions`, `roles`, `user_roles`, `organizations`, `organization_members`, `musician_profiles`, `gigs`, `classes`, `events`, `ticket_tiers`, `event_registrations`, `ledger_entries`, `stripe_webhook_events`, etc.
2. **Global Auth Implementation (`packages/auth`)** — COMPLETED
   - Implemented native Cloudflare Web Crypto session manager (`@gamo/auth`) using HMAC-SHA256 signed `__session` HTTP-only cookies, D1 persistence, and multi-tenant authorization guards (`hasSystemRole`, `isStaffOrAdmin`, `hasOrgRole`, `requireAuth`).
3. **API Conventions & Domain Services (`packages/domain`)** — COMPLETED
   - Reusable domain services (`LiveService`, `AdminService`, `IdentityService`, `PaymentService`, etc.) and Zod validation schemas.

## Phase 2: Worship Vertical (Highest Priority)
1. **Musician Application Flow (`apps/worship/src/pages/apply`)**
   - Connect the application forms to D1 insertions.
   - Implement the Identity capture sandbox component (simulate verification state).
2. **Church Gig Wizard (`apps/worship/src/pages/hire`)**
   - Persist church posting configurations to D1.
   - Implement the Stripe test checkout session for reserving gig requests, with musician agreed pay and any Gamo administrative allocation as separate line items (placeholder amounts until approved).
3. **Admin Queue & Dispatch (`apps/worship/src/pages/admin`)**
   - Populate the admin radar with real D1 `Application` and `Gig` entries.
   - Implement approval/rejection mutations and assign confirmed musicians.
   - Implement the check-in simulation (`/check-in/[id]`) and idempotent state transitions for primary vs. standby activation.
4. **Email Notifications (`packages/integrations`)**
   - Implement Resend server-side adapter for local testing / sandbox console fallback.
   - Trigger transactional emails on gig creation, audition approval, and check-in failures.

## Phase 3: Academy Vertical
1. **Course Listings (`apps/academy`)**
   - Fetch courses and instructors from D1 seed data.
2. **Lesson Booking**
   - Implement sandbox payment flow for lesson bookings.
   - Record booking entries in D1 and trigger email confirmations.

## Phase 4: Live Events Vertical
1. **Event Ticketing (`apps/live`)**
   - Connect event details to D1.
   - Implement atomic inventory decrements and lock mechanism for concurrent reservations.
2. **Stripe & QR Generation**
   - Connect Stripe checkout for ticket purchases.
   - Generate secure, signed QR codes post-purchase and display them on `/ticket`.
3. **Check-in Simulation**
   - Write tests to ensure a verified demo ticket scans only once.
4. **Organizer Publishing & Free Registration**
   - Organizer event submission persisted to D1; admin moderation states (draft, submitted, approved, rejected, published).
   - Free-event registration records and attendee "my tickets".

## Phase 4b: Promotion, Placements, Church Partnerships & Stewardship (separately approved, after Phase 4)
Ordered per ROADMAP priorities 7–8. See `docs/GAMO_NONPROFIT_MODEL.md` and `docs/GAMO_LIVE_AND_PARTNERS.md`.
1. **Organizer verification** — verification states and recorded ticketing authorization; unverified organizers cannot sell tickets.
2. **Optional promotion requests** — staff-managed intake and status; manual reporting entry. No ad-platform APIs.
3. **Placements** — admin scheduler for homepage/featured slots with `sponsored | editorial | gamo_program` kinds, date windows and region; homepage reads placements instead of static content (carousel only if approved).
4. **Nonprofit ledger** — `charitable_contribution`, `sponsorship`, `program_service_receipt`, `third_party_payable`, `processing_cost`, refund/dispute categories with `program` and `fund_id`; tests proving categories never mix and that musician/instructor pay is never netted against Gamo allocations.
5. **Church partnerships** — participation records (hosting, sponsorship, events, resources) without tiers or prices until approved; tests proving partnership status never touches vetting/ranking data.
6. **Board reporting** — program-level and restricted/unrestricted fund reports from demo data.
7. **Later** — personalization, geo relevance and analytics integrations, each with explicit approval.

## Phase 4c: Donations, Sponsorships & Grants Infrastructure (blocked)
Blocked until nonprofit formation, tax-exempt recognition (or counsel-approved interim approach), acknowledgment language, gift acceptance and restricted-fund policies exist (`docs/NONPROFIT_TRANSITION_CHECKLIST.md`). Until then: interest/contact forms only, no payment capture, no tax-deductibility language.

## Phase 5: Production & Operations
1. **Production Inquiries (`apps/production`)**
   - Wire up the Consultation Intake form (`/contact`) to insert leads into D1 and trigger a notification email to the admin.
2. **Admin Hub Dashboard (`apps/admin`)**
   - Build live queries for the Quick Stats metrics (Active Gigs, Pending Auditions, Ticket Sales, Leads).
   - Implement the System Audit Log by capturing events from other domains.
   - Wire up the Legal Document management.

## Approval Request
This plan requires owner approval to proceed. Once approved, the autonomous execution will resume, starting with Phase 1 (Database and Authentication integration) and proceeding through the remaining phases locally.

## Evidence correction after contract adoption — 2026-10-13

The completion labels above describe local service foundations. They do not prove verified user identity, staff mapping/RBAC, browser-to-Worker integration, capacity-safe registration or full financial fulfillment. See the authoritative [API_INVENTORY.md](API_INVENTORY.md) and [OPENAPI_ARCHITECTURE.md](OPENAPI_ARCHITECTURE.md). Complete contract foundation/reconciliation before the independent security and reliability audit, then resolve the recorded blockers before opening persistent workflows to real users.

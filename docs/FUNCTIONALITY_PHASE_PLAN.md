# Gamo Studios: Functionality Phase Plan

## Overview
This document outlines the phased backend integration strategy to transition the Gamo Studios ecosystem from a pure UI prototype to a fully functional application, fulfilling the local demonstration requirements.

**Objective:** Wire up the UI prototypes with Cloudflare D1 persistence, secure user sessions (Lucia v3), external service adapters (Stripe / Resend test mode), and inter-application communication, maintaining strict adherence to architectural boundaries and security constraints.

**Organizational context:** these phases build infrastructure for a proposed Christian nonprofit ([GAMO_NONPROFIT_MODEL.md](GAMO_NONPROFIT_MODEL.md)). No fee, contribution amount or tier is hardcoded; all are configuration set by approved policy. Musician and instructor pay are always recorded separately from any Gamo allocation.

## Phase 1: Authentication & Shared Core Services
1. **Database Schema Finalization (`packages/db`)**
   - Solidify Drizzle schema for `User`, `Role`, `Session`, `Gig`, `Application`, `Ticket`, `Class`, etc.
   - Run local D1 migrations and populate seed data for predictable development.
2. **Global Auth implementation (`packages/auth`)**
   - Finalize Lucia v3 integration using HTTP-only cookies and D1 adapter.
   - Implement `signIn`, `signUp`, and `signOut` mutations.
   - Implement role-based middleware to secure sensitive routes across all Astro apps (e.g., `/admin` routes require `admin` role, `/organizer` routes require `organizer` role).
3. **Shared Layout State**
   - Update `Layout.astro` and global navigation to dynamically reflect the active user's session and role.

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

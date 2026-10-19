# Gamo Live — requirements (owner decisions recorded 2026-10-19; design in progress)

Gamo Live is the first product rebuilt from scratch ([`REBUILD_PLAN.md`](REBUILD_PLAN.md)). This draft states what v1 must do and what it leaves out. The owner answered the six open questions on 2026-10-19 (section 7); everything else is a proposal to confirm. Nothing here is built yet. Rules that apply everywhere are in [`AGENTS.md`](../AGENTS.md) and [`SECURITY.md`](../SECURITY.md).

## 1. Purpose

A trusted place to **discover, attend and organize Christian events nationwide** (mission: [`GAMO_NONPROFIT_MODEL.md`](GAMO_NONPROFIT_MODEL.md) §3.3). Eligibility is Christian purpose, never ethnicity or nationality. In scope: gospel concerts, Christian artist tours, worship nights, choir festivals, church conferences, prayer gatherings, Bible studies, youth events, retreats, church community events, sponsored music workshops, free educational gatherings, recurring religious activities. Out of scope unless the board decides otherwise: non-Christian, political-campaign and secular commercial events.

Two experiences:

- **Explore Events** — individuals, families and communities finding something to attend.
- **Promote an Event** — churches, ministries, artists and authorized organizers getting their events listed.

## 2. What exists today (kept until replaced)

- Marketing pages: `/` (featured events), `/events`, `/events/[id]`, `/artists`, `/artists/[slug]`, `/venues`, plus web `/live`. They read the event catalog from D1.
- The catalog: 20 external listings (18 published) imported 2026-10-15 from `data/gamo_live_verified_events_2026-10-15.json`, each with a source link and an outbound ticket link (Ticketmaster and similar), published under the "Gamo Live Listings" editorial account.
- Everything else (organizer tools, accounts, RSVP, Gamo-issued tickets, waitlists, scanning, artists/agents, bookings) is old code that phase 3 removes.

## 3. v1 scope (proposal)

Like the admin, v1 is what can be trusted end to end, nothing more.

### 3.1 Explore (public, no account)

1. **Event list** — upcoming events first, then past ones; filter by city/metro, date range and category; free-text search over title, performers and venue. Every number (result counts) comes from a query.
2. **Event detail** — title, date and time in the event's own time zone, venue and address, performers, category, description, organizer, admission (free, Gamo registration, or external tickets), price as stated by the organizer, and the source or ticket link. Structured data (`Event` JSON-LD) for search engines.
3. **Past events** are shown as **"Past · Closed"**, can't be booked or registered for, and sort after upcoming ones.
4. **External listings** (editorial catalog) link out clearly ("Tickets on Ticketmaster", opens the official page); Gamo never implies it sells those tickets.
5. **Artists and venues** pages list only those with at least one published event.
6. Only real, approved events appear; empty results say so.

### 3.2 Register for a free event (public, no account)

7. For events where the organizer turned on **free registration**: name, email, number of people (within the organizer's limit and the remaining capacity), terms consent.
8. The person confirms with a **6-digit code emailed** to them; nothing is held as confirmed before that. Capacity is reserved safely (no overselling under concurrent sign-ups).
9. A confirmation email with the details and a **signed, expiring manage link** (view, cancel). No attendee account.
10. **QR codes are off by default for free events** and an organizer can switch them on per event (owner decision, clarified 2026-10-19). When on, each confirmed registration gets a QR code (in the confirmation email and on the manage page) and the organizer checks people in on a check-in screen by scanning or typing the code (first scan wins; a second scan shows who was already admitted and when). When off, registrants get no code and the organizer sees and exports the list. Gamo-issued QR tickets for **paid** events stay out of v1 (3.5).

### 3.3 Promote an Event (organizers, with an account)

11. **Organizer sign-in with Clerk** (Gamo Live's own Clerk application, never shared with another product; owner decision). One organizer account can belong to one or more organizations. The old Clerk code is in git history (commit `6eba89c`: `packages/auth/clerk.ts`, `packages/config/clerk-env.ts`) as a reference only; it is rebuilt with Live, and the CSP gains Clerk's exact origins on the sign-in pages only (the cause of the production sign-up failure must be tested against the built worker). Attendees still need no account. One organizer account can belong to one or more organizations (church, ministry, artist, organizer).
12. **Organization profile** — name, type, city, website, contact; shown on its events.
13. **Submit an event** — the fields of 3.1.2 plus schedule (one-time or recurring weekly/monthly), admission mode (free/no registration, free with registration and capacity, external tickets link), category, images with rights confirmation. Terms consent (organizer terms draft).
14. **Review rule** — every organization's **first event is reviewed by the admin** before it is published; later events publish directly unless the admin set "review every event" for that organization. The organizer sees the status and the admin's note.
15. **Manage** — edit (edits to a published event follow the same review rule), cancel (registrants are emailed), see registrations and export them.
16. **Verified organizer** badge only after an admin decision; unverified organizations are labeled as such on their events.

### 3.4 Admin (in the existing admin app)

17. **Event review** queue on the new data (approve, ask for changes, reject, "review every event" switch) — replaces today's First-event review.
18. **Organizations**: verify or unverify an organizer; suspend an organization (its events are hidden).
19. **Catalog**: the editorial external listings — import from a catalog file, approve/publish, hide. (v1 may keep the import as a script and give the admin approve/hide only.)
20. Real counts on the Inbox and sidebar, as today.

### 3.5 Not in v1

Paid ticketing through Gamo (Stripe), Paid Gamo-issued QR tickets, door-staff scanner links, waitlists, ticket transfer and resale controls, seating and venue maps, artist/agent representation and booking offers, sponsored or featured placement sales, organizer team roles beyond "member of the organization", social sign-in, attendee accounts. Each needs its own approval later; paid ticketing also needs Stripe production approval, refund policy and legal review (`SECURITY.md`).

## 4. Trust rules (from the mission, permanent)

- Never invent events, verified status, authorized relationships, availability or attendance.
- Show organizer information, price as stated, and refund policy text (when the organizer gives one) before anyone registers or leaves for tickets.
- Featured or sponsored placement is always labeled and never affects verification or ordering of ordinary results. (v1 has editorial "featured" only, labeled.)
- Free listing and free registration are the default; any fee is a proposal until approved.

## 5. Data model (sketch, to be designed in detail)

Fresh schema, nothing reused from the old migrations: `organizations`, `organization_members`, `organizer_accounts` (email-verified sign-in), `events` (with schedule and admission mode), `event_occurrences` (recurring dates), `event_performers`, `venues`, `registrations` (pending → confirmed → cancelled, capacity-safe), `email_codes`, `review_decisions` (admin decisions with notes), `catalog_sources` (external listing provenance), `email_outbox`. Times are UTC epoch seconds plus the event's IANA zone. The 20-event catalog is re-imported from the repository file.

## 6. Quality bar

Same as the admin: real data only; honest empty states; plain server-rendered pages and forms (JavaScript only where it truly helps); CSP without inline scripts or third-party script origins; fail closed; same-origin checks; one `<h1>`, 44 px targets, axe WCAG 2.2 AA, no overflow at 360 px; built-worker browser checks before any deploy; designs approved before screens are built (marketing look kept for public pages).

## 7. Owner decisions (2026-10-19)

1. **Sign-in:** keep Clerk. Live gets its own Clerk application; each later product its own. Needs from the owner at build time: the Live Clerk keys and DNS (`docs/RUNBOOK.md`), and approval of the CSP origins Clerk requires.
2. **Free-registration QR codes:** off by default; an organizer can switch them on per event, which adds a QR code to each registration and a check-in screen (3.2 item 10).
3. **Recurring events in v1:** yes (weekly and monthly).
4. **Catalog management:** yes: script import plus admin approve/hide.
5. **Artists and venues pages:** yes, derived from published events.
6. **Design:** the organizer area is **not claymorphism**. References: `design-reference/dashboard-ui/` (a light dashboard: left sidebar with grouped menu, top bar with search, rounded white cards on a soft grey page, status pills, filter/sort controls, tables and a kanban-style board; a dark-sidebar variant). They are layout references only; colors come from the app palette (`tokens.css`), no gradients, and the sample content in them (revenue, products, deals) is not Gamo content. The admin keeps its claymorphism.

Detailed designs for owner approval: [`LIVE_DATA_MODEL.md`](LIVE_DATA_MODEL.md) and [`LIVE_SCREENS.md`](LIVE_SCREENS.md). Then the design pass, then the build.

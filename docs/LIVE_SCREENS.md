# Gamo Live — screen inventory (draft for owner approval, 2026-10-19)

Every screen v1 needs, who sees it, what it reads and writes, and its empty/error states. Data in [`LIVE_DATA_MODEL.md`](LIVE_DATA_MODEL.md); scope in [`LIVE_REQUIREMENTS.md`](LIVE_REQUIREMENTS.md). Public browsing pages keep the marketing look (`design-reference/homepage/`, current Live pages). **Owner direction (2026-10-19): the moments a person commits to something (registering for an event, later buying tickets) reuse the sign-in screen design: a full-viewport photo on the left, a curved cream panel on the right.** That layout is the shared `SplitScreenLayout` (`packages/ui/src/components/split/`, with `SplitHeading`, `SplitField`, `SplitButton`, `SplitNotice`); A4–A6 use it. The organizer area follows [`design-reference/dashboard-ui/`](../design-reference/dashboard-ui/) in the app palette (no gradients, no claymorphism); the admin screens keep the admin's claymorphism. Every screen: one `<h1>`, 44 px targets, axe clean, no overflow at 360 px, honest empty states, nothing in navigation without a working page.

## A. Public (no account) — `live.gamostudio.org`

| # | Route | Purpose | Notes |
| --- | --- | --- | --- |
| A1 | `/` | Home: featured upcoming events, metro picker, Explore and Promote entry points | Only real published events; "featured" is editorial and labeled. Empty: "No upcoming events yet" with the Promote link. |
| A2 | `/events` | List with search, metro, category, date range; upcoming first, then past | Query-string filters, server-rendered; result counts from the query. **Past · Closed** badge. |
| A3 | `/events/[slug]` | Detail: time in the event's zone, venue, performers, organizer (verified / unverified label), admission, price text, refund policy text, source or ticket link, `Event` JSON-LD | Right-hand panel states: *Register free* (free_registration, seats left), *Registration full*, *Free, no registration*, *Tickets on <provider>* (external, opens the official page), *Past · Closed*, *Canceled*. Recurring: occurrence picker. |
| A4 | `/events/[slug]/register` | Registration form: name, email, party size, terms consent, occurrence | Server validates capacity and past-closed; same-origin check; rate limited. |
| A5 | `/events/[slug]/register/confirm` | Enter the emailed 6-digit code | Errors: wrong code (attempts left), expired (resend), locked. Success shows the confirmation (and the QR when the event has QR on). |
| A6 | `/registrations/[token]` | Manage page from the emailed link: details, QR (if on), cancel | Signed, expiring link; cancel confirms; no sign-in. |
| A7 | `/artists`, `/artists/[slug]` | Artists with at least one published event | Derived from `event_performers`. |
| A8 | `/venues` | Venues with at least one published occurrence | |
| A9 | `/organizers/[slug]` | Organization page: name, kind, verified label, upcoming events | New (the old URL pattern redirects here). |
| A10 | `/promote` | "Promote an event": what you get, the review rule, the terms summary, sign-in/create-account button | Replaces the contact-page stopgap. |
| A11 | `/404`, `/500`, `/legal/*` | Branded errors; organizer terms and privacy (drafts, labeled) | |

## B. Organizer area (signed in with Clerk, member of an organization) — `/organizer/*`

Layout: dashboard shell per the reference (left sidebar with grouped menu, top bar with search and account, white cards on a soft page). Sidebar: **Overview, Events, Registrations, Check-in, Organization, Account**.

| # | Route | Purpose | Reads / writes |
| --- | --- | --- | --- |
| B1 | `/account/signin`, `/account/signup` | Clerk sign-in and sign-up on a Live-branded page | Creates the `organizers` row on first sign-in. Fail closed: if Clerk is not configured, the page says sign-in is unavailable (503), never a fake form. |
| B2 | `/organizer/start` | First sign-in: create an organization (name, kind, city, state, website, contact) or accept an invitation | Writes `organizations`, `memberships`, terms acceptance. |
| B3 | `/organizer` | Overview: events needing attention (changes requested, pending review), next upcoming events, registration totals | Counts come from queries; empty state links to "Create event". |
| B4 | `/organizer/events` | All events: filter by status, search, sort by date | Status pills: Draft, In review, Changes requested, Published, Rejected, Canceled. |
| B5 | `/organizer/events/new`, `/organizer/events/[id]/edit` | Event editor in sections: Basics (title, category, description, performers) · When (one-time or weekly/monthly series, time zone) · Where (venue picker or new venue) · Admission (free open, free with registration + capacity + max party + **QR codes toggle (off by default)**, external tickets link) · Media (image with rights confirmation) · Review and submit | Autosave as draft is not in v1; explicit "Save draft". Validation messages by field. Shows the review rule that will apply ("First event: reviewed by Gamo before it appears"). |
| B6 | `/organizer/events/[id]` | Event overview: status, the admin's note (if any), occurrences, registration counts per occurrence, QR toggle state, Cancel event (emails registrants), Duplicate | Cancel requires confirmation and a message. |
| B7 | `/organizer/events/[id]/registrations` | Registrations table per occurrence: name, party, status, checked-in; search; **Export CSV**; cancel a registration | Only this organization's registrants. |
| B8 | `/organizer/check-in/[occurrenceId]` | Check-in (only for events with QR on): scan with the camera where the browser supports it, or type the code; shows name and party, "Admitted" or "Already admitted at <time>" | First scan wins. Camera permission requested on this page only (`Permissions-Policy: camera=(self)` for this response). |
| B9 | `/organizer/organization` | Edit the organization profile; members and invitations (owner only); verification status (read-only) | Profile edits do not change verification. |
| B10 | `/organizer/account` | Name, email (from Clerk), sign out | |

Error and edge states for B: not signed in → sign-in; signed in with no organization → B2; wrong organization's event → 404; suspended organization → a clear notice and read-only pages.

## C. Admin additions (`apps/admin`, claymorphism, Cloudflare Access)

| # | Route | Purpose |
| --- | --- | --- |
| C1 | `/events` (rebuilt "First-event review") | Queue of `pending_review` events with the full event, the organization and its history; Approve, Ask for changes (note required), Reject (note required) |
| C2 | `/organizations` | List with status; open one to **Verify / Unverify**, **Suspend / Reinstate**, toggle **Review every event**; see its events |
| C3 | `/catalog` | Editorial external listings: approve (publish) or hide; import stays a script |
| C4 | Inbox and sidebar counts | Real counts: events in review, organizations waiting for verification, catalog items awaiting approval |

## D. Emails (plain text first, sent through Resend; owner-approved before real sending)

Registration code · Registration confirmation (manage link, QR when on) · Registration canceled (by you / by the organizer) · Event canceled (to registrants) · Event decision (approved / changes requested / rejected, with the note) · Organization verified · Invitation to join an organization.

## E. Cross-cutting

- **Time:** always show the event's zone abbreviation; the picker uses IANA zones; recurring events cross DST correctly (occurrences computed per local date).
- **Accessibility:** forms have visible labels and error summaries; the occurrence picker and check-in screen work by keyboard.
- **Security:** sign-in via Clerk only on `/account/*` pages (the CSP adds Clerk's exact origins there and nowhere else); all organizer pages and APIs are `no-store`, authorize membership on the server, then same-origin, then validate.
- **No fake data:** nothing sample on any page; the catalog entries are real and linked to their sources.

## F. Build order (after approval)

1. Schema, migrations, local seed (catalog import). 2. Public read pages on the new data (A1–A3, A7–A9). 3. Registration and manage flow (A4–A6, emails, outbox). 4. Clerk sign-in, organizer start, organization (B1, B2, B9, B10). 5. Event editor and management (B3–B7). 6. QR toggle and check-in (B8). 7. Admin review screens (C1–C4). 8. Built-worker browser checks (CSP including Clerk pages, capacity race, past-closed), then the owner's preview deploy.

## G. Owner decisions (2026-10-19)

1. New Live-owned D1 database: yes. 2. Retention: registrant personal data deleted 90 days after the event; non-personal facts about past events (title, date, venue, counts) are kept. 3. 52-occurrence series limit: ok. 4. Member rights: ok. 5. Organizer pages (A9) and the public `/promote` page (A10): yes. 6. Browser barcode detector with typed-code fallback: ok.

Client-facing UI (people who book events or music classes) is out of Live v1: attendees use the no-account public pages (A4–A6). Its design references are added later, when Academy, Worship and Production requirements start.

Next: the design pass for the organizer screens (B), the public registration screens (A3–A6), and the admin additions (C).

## H. Build status

Built (2026-10-19): everything in A and B, and the admin screens C1–C4 (Event review with emailed decisions, Organizations, Catalog, Inbox counts and waiting list). Built since: the admin cleanup action (Cleanup tab: 90-day registrant data, expired codes, old sessions and invitations, with a report), hide and restore for published events, and held-back changes to published events. Not built: event photos, duplicate event, bulk-email queue for large cancellations, and sponsored-placement labels (no sponsored placements exist). A polish pass on every screen is in progress (docs/BUILD_LOG.md).

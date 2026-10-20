# Gamo Live — screen inventory (2026-10-19)

Every screen v1 needs, who sees it, what it reads and writes, and its empty/error states. Data in [`LIVE_DATA_MODEL.md`](LIVE_DATA_MODEL.md); scope in [`LIVE_REQUIREMENTS.md`](LIVE_REQUIREMENTS.md). Public browsing pages keep the marketing look (`design-reference/homepage/`, current Live pages). **Owner direction (2026-10-19): the moments a person commits to something (registering for an event, later buying tickets) reuse the sign-in screen design: a full-viewport photo on the left, a curved cream panel on the right.** That layout is the shared `SplitScreenLayout` (`packages/ui/src/components/split/`, with `SplitHeading`, `SplitField`, `SplitButton`, `SplitNotice`); A4–A6 use it. The organizer area follows [`design-reference/dashboard-ui/`](../design-reference/dashboard-ui/) in the app palette (no gradients, no claymorphism); the admin screens keep the admin's claymorphism. Every screen: one `<h1>`, 44 px targets, axe clean, no overflow at 360 px, honest empty states, nothing in navigation without a working page.

## A. Public (no account) — `live.gamostudio.org`

| # | Route | Purpose | Notes |
| --- | --- | --- | --- |
| A1 | `/` | Home: featured upcoming events, metro picker, Explore and organizer entry points | Only real published events; "featured" is editorial and labeled. Marketing page, frozen. |
| A2 | `/events` | List with search, metro, category, date range; upcoming first, then past | Query-string filters, server-rendered; result counts from the query. **Past · Closed** badge. |
| A3 | `/events/[slug]` | Detail: time in the event's zone, venue, performers, organizer (verified / unverified label), admission, price text, refund policy text, source or ticket link, `Event` JSON-LD | Right-hand panel states: *Register free* (free_registration, seats left), *Registration full*, *Free, no registration*, *Tickets on <provider>* (external, opens the official page), *Past · Closed*, *Canceled*, and for `paid_tickets`: *Get tickets* (lowest price "from $X", the refund policy, the seller) or *Sold out* or *Sales not open* (the only change to this frozen page). Recurring: occurrence picker. |
| A4 | `/events/[slug]/register` | Registration form: name, email, party size, terms consent, occurrence | Server validates capacity and past-closed; same-origin check; rate limited. |
| A5 | `/events/[slug]/register/confirm` | Enter the emailed 6-digit code | Errors: wrong code (attempts left), expired (resend), locked. Success shows the confirmation (and the QR when the event has QR on). |
| A6 | `/registrations/[token]` | Manage page from the emailed link: details, QR (if on), cancel | Signed, expiring link; cancel confirms; no sign-in. |
| A7 | `/artists`, `/artists/[slug]` | Artists with at least one published event | Derived from `event_performers`. |
| A8 | `/venues` | Venues with at least one published occurrence | |
| A9 | `/organizers/[slug]` | Organization page: name, kind, verified label, upcoming events | New (the old URL pattern redirects here). |
| A10 | `/promote` | Removed; redirects to `/organizer`. | |
| A11 | `/404`, `/500`, `/legal/*` | Branded errors; organizer terms and privacy (drafts, labeled) | |

## B. Organizer area (signed in with Clerk, member of an organization) — `/organizer/*`

Layout: dashboard shell per the reference (left sidebar with grouped menu, top bar, white cards on a soft page). Sidebar areas: **Overview, Events, Organization, Settings** (`apps/live/src/lib/organizer-nav.ts`). Registrations, tickets, orders, the door and check-in are reached from an event; payments and verification from the Organization area.

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
| B10 | `/organizer/settings` | Name, email (from Clerk), default time zone, own devices, own data download, deletion by email (replaces Account) | |

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

## I. Paid ticketing, door and verification screens (2026-10-19)

Structure written before building, as the owner asked; the owner reviews the screens from screenshots afterwards. No new top-level area in either app. Every screen meets the bar in `DESIGN.md`; dashboard pages are floating cards; split-screen pages fit one desktop screen and use steps.

### I.1 Where things sit

- **Organizer, Events area.** A paid event's page (`/organizer/events/[id]`) gets tabs (shared `FilterChips`, real counts): **Overview** (today's page plus door-day totals), **Tickets** (ticket types, price deadlines, codes), **Orders** (orders, order detail, sales summary, CSV), **Door** (door screens per date, staff links, readers, cash sessions). Check-in for paid events is the door screen's Check in mode. A free-registration event keeps its tabs: Overview, Registrations. Paid setup (policies, fee choice, gifts, names required, door sales on/off) is a new section of the event editor under "How people attend".
- **Organizer, Organization area.** Tabs: **Profile** (today's page, with a verification card: status and "Request verification") and **Payments** (owners only).
- **Admin, Gamo Live area.** New tabs **Payments** and **Live settings** beside Event review, Organizations, Catalog. The meeting step lives on the organization detail page; churches use the same meeting form in Community.

### I.2 Public (no account)

| # | Route | Purpose | Reads / writes | Empty and error states |
| --- | --- | --- | --- | --- |
| P1 | `/events/[slug]/tickets` | Step 1 of 3 (split screen): date, ticket types with quantities, promo or access code | `ticket_types`, inventory, codes (server-priced) | Sold out, sales not open, past, canceled, wrong code (named), type limits |
| P2 | `/events/[slug]/tickets/details` | Step 2: name, email, confirm email (typo hint), attendee names when required, gift step when on | nothing stored yet | Field errors all at once |
| P3 | `/events/[slug]/tickets/review` | Step 3: every line (tickets, discount, Gamo fee if passed on, gift, total), seller, refund policy, terms consent; **Pay** posts, the server reserves and redirects to Stripe Checkout (or the local stand-in) | creates `orders`, `order_items`, inventory, `payments` | Sold out since step 1 (back to step 1 with a notice), payments unavailable (503 notice) |
| P4 | `/orders/return/[token]` | After Checkout: "Payment received, issuing your tickets" (refreshes until the webhook confirms), then the order page | order status | Canceled at Stripe → back to the event with seats freed |
| P5 | `/orders/[token]` | Order page: receipt with every line and the seller, one card per ticket with its QR, calendar file, maps; transfer a ticket; request a refund within policy | `orders`, `tickets`, `refunds` | Expired link (410, find my tickets), refunded or canceled states |
| P6 | `/orders/[token]/transfer/[ticketId]` | New holder's name and email (no price field); confirm | `tickets`, `ticket_transfers` | After cutoff, not allowed, already scanned |
| P7 | `/tickets/find` | Email → always the same answer; emails a link if there are orders | rate limits | Rate limited |
| P8 | `/door/[token]` | Staff link: enter the PIN (split screen), then the door screen | `staff_links`, `staff_devices` | Wrong PIN (attempts left), locked (until when), revoked or expired |
| P9 | `/api/stripe/webhook`, `/api/stripe/connect-webhook` | Stripe events (platform and Connect) | everything above | Signature or account mismatch: 400; processing elsewhere: 409 |
| P10 | `/dev/stripe/checkout/[id]` | Local Stripe stand-in's "hosted page" (pay, decline, cancel); exists only with `ENVIRONMENT=local` and no Stripe key | emits a signed webhook | 404 everywhere else |

### I.3 Organizer

| # | Route | Purpose | Who |
| --- | --- | --- | --- |
| O1 | `/organizer/events/[id]/edit` (new section) | Paid admission: policies, fee pass-on/absorb with "buyer pays / you receive" per type, gifts (presets), names required, door sales on/off; the "who may sell" checklist with links | members |
| O2 | `/organizer/events/[id]/tickets` | Ticket types (one card each; add from quick starts; edit, hide, end), price deadlines per type, codes (one card each; create, disable), comp tickets (issue with reason) | members |
| O3 | `/organizer/events/[id]/orders` | Toolbar card (search, filters), summary cards (counts link to filtered lists), one card per order; CSV | members |
| O4 | `/organizer/events/[id]/orders/[orderId]` | Order detail: lines, tickets, payments, refunds (refund whole or per ticket with `ConfirmAction`), resend, transfer history, refund requests to approve or decline | members |
| O5 | `/organizer/events/[id]/sales` | Sales summary per date from the ledger; reconciliation against Stripe | members |
| O6 | `/organizer/events/[id]/door` | Door tab: dates with "Open door screen", staff links (create with label, PIN shown once, permissions; revoke), readers (pair with code, name, online status, remove), cash sessions (expected, counted, difference) | members (readers: owners) |
| O7 | `/organizer/door/[occurrenceId]` (`?mode=checkin` / `sell`) | The door screen for a signed-in organizer; `/organizer/check-in/[occurrenceId]` redirects here | members |
| O8 | `/organizer/organization/payments` | Payments: mode in force, connect or check the Stripe account, payout account, payouts, statements; "Test mode" | owners |
| O9 | `/organizer/organization` (card) | Verification: status, meeting details when scheduled, "Request verification" | owners request; members see |
| O10 | `/organizer/events/[id]/preview-checkout` | Preview checkout: places a preview order, shows it, void | members |

The door screen (O7 and P8) is one component set: a mode switch (Check in / Sell), the date and live counts, then either the scan/type card or the sell card (type steppers, total, payment choice: Cash, Buyer's phone, Card reader, Comp), then the result card (change due, QR to scan, reader status, admitted). Targets at least 56 px on this screen. When offline: a danger notice and the Sell actions disabled.

### I.4 Admin

| # | Route | Purpose |
| --- | --- | --- |
| C5 | `/organizations/[id]` (meeting step) | Verification card: request date, meeting (schedule: date, time, zone, video or in person, link or place, note; mark held; cancel), then verify or decline with a note. Same `MeetingForm` as churches. |
| C6 | `/payments` | Tabs inside: Orders (search across organizations), Refunds (requests where Gamo is the seller), Disputes (open), Not ready (organizations whose payments are not ready), Balances and payouts (Mode B: owed per organization, prepare payout; sending needs the owner) |
| C7 | `/payments/orders/[id]` | Order detail with refund (Mode B orders) |
| C8 | `/live-settings` | Funds-flow default, per-organization overrides, Gamo fee (fixed and percent; reason required; `ConfirmAction`), door sales on or off; decision history |

### I.5 Main tasks and presses

| Task | Path | Presses |
| --- | --- | --- |
| Create a paid event | Overview → Create event → editor (choose "Paid tickets", policies) → Save → Tickets tab → add a type from a quick start → Save → Preview checkout → Submit | about 8, plus typing |
| Buy online | Event page → Get tickets → choose quantity → Next → details → Next → Pay → Stripe → back to the order page | 5 on Gamo |
| Sell at the door (cash) | Door screen → Sell → + on a type → Cash → enter received → Record sale | 4 |
| Sell at the door (phone) | Door screen → Sell → + → Buyer's phone → (buyer pays) → screen confirms | 3 |
| Refund an order (organizer) | Event → Orders → order → Refund → Confirm | 4 |
| Verify an organization (admin) | Overview count → organization → Schedule meeting → Save; later Mark held; Verify with note | 3 + 1 + 1 |

### I.6 Emails (plain text, through Resend)

Order confirmation (receipt, seller, order link, calendar file) · Payment received but tickets could not be issued (refund on its way) · Tickets transferred (to the new holder; to the old holder) · Refund requested (to the organization's owners) · Refund issued / declined · Event canceled (with refund) · Event changed (new details and calendar file) · Find my tickets link · Door tickets · Verification requested (to the admin, not emailed in this release: shown in the admin Overview) · Meeting scheduled / held / organization verified / declined (to the owners).

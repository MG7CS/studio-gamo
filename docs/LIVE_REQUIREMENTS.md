# Gamo Live — requirements (2026-10-19)

Gamo Live and the admin are rebuilt first and are the reference for the other three products ([`REBUILD_PLAN.md`](REBUILD_PLAN.md)). Sections 1–4 cover discovery, free events, organizers and the admin (built 2026-10-19). Section 8 adds Gamo's own **paid ticketing online and at the door**, verification by meeting and the admin's payments tools (owner decisions of 2026-10-19, section 7). Rules that apply everywhere are in [`AGENTS.md`](../AGENTS.md) and [`SECURITY.md`](../SECURITY.md); how money moves is in [`LIVE_PAYMENTS.md`](LIVE_PAYMENTS.md).

## 1. Purpose

A trusted place to **discover, attend and organize Christian events nationwide** (mission: [`GAMO_NONPROFIT_MODEL.md`](GAMO_NONPROFIT_MODEL.md) §3.3). Eligibility is Christian purpose, never ethnicity or nationality. In scope: gospel concerts, Christian artist tours, worship nights, choir festivals, church conferences, prayer gatherings, Bible studies, youth events, retreats, church community events, sponsored music workshops, free educational gatherings, recurring religious activities. Out of scope unless the board decides otherwise: non-Christian, political-campaign and secular commercial events.

Two experiences:

- **Explore Events** — individuals, families and communities finding something to attend.
- **Organize an event** — churches, ministries, artists and authorized organizers listing events, taking free registrations and selling tickets (sign in at `/organizer`; the old `/promote` page was removed and redirects there).

## 2. What exists today

- Marketing pages (frozen): `/` (featured events), `/events`, `/events/[slug]`, `/artists`, `/artists/[slug]`, `/venues`, plus web `/live`. They read Gamo Live's database.
- The catalog: 20 external listings imported 2026-10-15 from `data/gamo_live_verified_events_2026-10-15.json`, each with a source link and an outbound ticket link (Ticketmaster and similar). Gamo does not sell those tickets; they keep linking out.
- Rebuilt 2026-10-19: free registration with emailed codes and ticket pages, Clerk organizer sign-in, the organizer area (events, editor, registrations, check-in, organization, settings) and the admin's Live screens.
- Added by section 8: paid ticketing, the door screen, payments and verification meetings.

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

### 3.3 Organize an event (organizers, with an account)

11. **Organizer sign-in with Clerk** (Gamo Live's own Clerk application, never shared with another product; owner decision). One organizer account can belong to one or more organizations. The old Clerk code is in git history (commit `6eba89c`: `packages/auth/clerk.ts`, `packages/config/clerk-env.ts`) as a reference only; it is rebuilt with Live, and the CSP gains Clerk's exact origins on the sign-in pages only (the cause of the production sign-up failure must be tested against the built worker). Attendees still need no account. One organizer account can belong to one or more organizations (church, ministry, artist, organizer).
12. **Organization profile** — name, type, city, website, contact; shown on its events.
13. **Submit an event** — the fields of 3.1.2 plus schedule (one-time or recurring weekly/monthly), admission mode (free/no registration, free with registration and capacity, external tickets link), category, images with rights confirmation. Terms consent (organizer terms draft).
14. **Review rule** — every organization's **first event is reviewed by the admin** before it is published; later events publish directly unless the admin set "review every event" for that organization. The organizer sees the status and the admin's note.
15. **Manage** — edit (edits to a published event follow the same review rule), cancel (registrants are emailed), see registrations and export them.
16. **Verified organizer** badge only after an admin decision that follows a **meeting with Gamo** (video call or in person); unverified organizations are labeled as such on their events. Organizations request verification from the organizer area (section 8.6).

### 3.4 Admin (in the existing admin app)

17. **Event review** queue on the new data (approve, ask for changes, reject, "review every event" switch) — replaces today's First-event review.
18. **Organizations**: verify or unverify an organizer; suspend an organization (its events are hidden).
19. **Catalog**: the editorial external listings — import from a catalog file, approve/publish, hide. (v1 may keep the import as a script and give the admin approve/hide only.)
20. Real counts on the Inbox and sidebar, as today.

### 3.5 Later (not in this release)

Reserved seating and seat maps; a waiting queue for big on-sales; waitlists; Apple and Google Wallet passes (need a pass-signing setup); abandoned-checkout reminders and marketing emails (need a consent design); Gamo marketing services for organizers; gifts to Gamo Studios itself (need a legal review of Gamo as a PBC); Tap to Pay on a phone (needs a native app); offline cash sales and offline scanning; payment plans; merchandise; season passes; ticket insurance; live streams; artist and agent representation and booking offers; sponsored or featured placement sales; organizer roles beyond owner, member and event-scoped door staff; social sign-in; attendee accounts; the public free-RSVP section and marketing copy fixes (parked by the owner). Live payments need the owner's approval of Stripe production, the legal review of the terms and an answer on sales tax before real money moves.

## 4. Trust rules (from the mission, permanent)

- Never invent events, verified status, authorized relationships, availability or attendance.
- Show organizer information, price as stated, and refund policy text (when the organizer gives one) before anyone registers or leaves for tickets.
- Featured or sponsored placement is always labeled and never affects verification or ordering of ordinary results. (v1 has editorial "featured" only, labeled.)
- Free listing and free registration are the default and stay free; a fee is never added to free tickets.
- Before anyone pays: the organization, the full price with every line item, the refund policy and the seller.
- Never invent availability, "selling fast", countdowns or verified status.
- Gamo never sells tickets for an event without the organizer's account and consent; catalog events keep linking out.
- Never call Gamo Studios a nonprofit, tax-exempt or a charity; never say a payment to Gamo is tax-deductible; a gift names the organization that receives it.
- Sales tax on tickets is not computed (open question for the owner and counsel; some states, Arizona included, tax admissions).

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

### Owner decisions (2026-10-19, paid ticketing)

7. **Paid ticketing comes into Gamo Live now**, Stripe test mode only until the owner approves production.
8. **Two funds-flow modes, decided later:** Mode A (the organization's own Stripe account through Connect; it is the seller and handles refunds and disputes; Gamo's fee, if any, is an application fee) and Mode B (Gamo collects on its own account, records what it owes and pays the organization through Connect transfers; Gamo owns refunds and disputes). A platform default with per-organization overrides, set in the admin; until chosen, card sales are unavailable. Never described as escrow.
9. **Gamo fee built and set to $0**, its own line item, pass-on or absorb per event, changes recorded and never applied to tickets already sold.
10. **Door sales:** cash, the buyer's own phone (a QR code that opens Stripe Checkout) and Stripe Terminal smart readers (server-driven). Tap to Pay on a phone is later (needs a native app).
11. **Transfers allowed, resale not.** Event policies are set by the event's creator within the options offered.
12. **Every partner is verified through a meeting**, video or in person, including Gamo Live organizations.
13. **Gifts to the organizer at checkout** are in scope; gifts to Gamo Studios itself are later.
14. Not in this task: marketing copy fixes and the public free-RSVP section.
15. **No Stripe keys are configured.** Everything is built and tested against a local Stripe stand-in; the same code works against Stripe's test mode once the owner adds test keys.

## 8. Paid ticketing, door sales and verification (2026-10-19)

Numbers in brackets are the items of the owner's brief (`gamo-live-ticketing-prompt.md` §5). *Proposal* marks a choice the owner may change; each is listed in [`LIVE_TICKETING_REVIEW.md`](LIVE_TICKETING_REVIEW.md).

### 8.1 What the organizer sets up

Order of work: event details → ticket types → pricing and promotions → policies and fees → preview the buyer journey → publish → event day.

1. **Admission `paid_tickets`** beside the other three [1]. Free registration works exactly as before. *Proposal:* ticket types allow price 0 so free registration could move onto them later; not migrated now.
2. **Ticket types** [2]: name, price (cents, USD), capacity per date, per-order limit, sales window in the event's zone, status (on sale, hidden, ended; "sold out" is computed), short description, people per ticket (group or family pack), optional door-only allocation and whether the door may also sell the online pool. The event's capacity caps the people per date across all types. Quick starts: General, VIP, Child, Student, Group or family pack, Day pass.
3. **Pricing tools** [3]: promo codes (percent or amount off, use limits, dates, optional ticket types), presale access codes (unlock hidden types), comp tickets (organizer-issued, price 0, reason required) and price deadlines (early-bird → standard automatically). Every price a buyer sees is computed on the server.
4. **Policies** [4], chosen from offered options and shown on the event page before buying: refunds (none / until 24, 48, 72 or 168 hours before the start / any time before the start); transfers (allowed or not, cutoff 0–168 hours before the start); re-entry (allowed or not); entry notes (≤ 280 characters); attendee names required or not. The policy is snapshotted on each order; a later change applies to existing orders only when it is better for the buyer.
5. **Fees** [5]: the Gamo fee (an admin setting, starts at $0) is shown as its own line; per event the organizer chooses pass on (buyer pays) or absorb. The editor shows, per ticket type, what the buyer pays and what the organization receives in both choices. *Proposal:* Stripe's processing cost is borne by the organizer (Mode A: taken by Stripe on their account; Mode B: deducted on the statement) and is never added to buyers as a card surcharge (open legal question, not built).
6. **Review** [6]: paid events use the existing review gate. *Proposal:* an organization's first paid event is always reviewed, even after its first free event was approved; the admin's review card shows ticket types, prices, fees, policies and door sales.
7. **Who may sell** [7] (*proposal*): an organization can publish a paid event only when it is verified (meeting held, admin verified), its payments are ready for its funds-flow mode (Mode A: the connected account can take charges; Mode B: the payout account can receive transfers), and an owner accepted the current organizer terms. The editor names exactly what is missing and links to where it is fixed.
8. **Preview checkout** [8]: an organizer places a test order on their own event before publishing, sees the confirmation email and the order page, then voids it. Preview orders never count in reports.

### 8.2 Buying online (no account)

9. **Checkout on Gamo** [9]: the event page's action panel leads to ticket selection in the split-screen design, in steps that fit one screen: choose types and quantities and enter a code; then name and email (confirm email, typo hint never applied automatically) and attendee names if required; then the full total with every line (tickets, discounts, Gamo fee if passed on, gift) and the terms consent (never pre-ticked). The total is shown before the payment step.
10. **Payment on Stripe Checkout** [10] (cards, Apple Pay, Google Pay); Gamo never handles card numbers. Only the response that redirects to Checkout widens `form-action` to `https://checkout.stripe.com`.
11. **Inventory** [11] is reserved by the database before payment, for 30 minutes plus a 5-minute grace (Stripe's Checkout Sessions last 30 minutes to 24 hours), released on expiry or failure, and confirmed only by the verified webhook.
12. **Webhooks** [12]: one platform endpoint and one Connect endpoint; signatures verified; each event recorded once and processed idempotently; amount, currency and account checked against the order; a payment that arrives after its seats were lost becomes "paid, not fulfilled", is refunded automatically and the buyer is emailed. Events handled: Checkout completed, async payment succeeded and failed, Checkout expired, charge refunded, refund created/updated/failed, dispute created/updated/closed, PaymentIntent succeeded/failed (readers), Terminal reader action succeeded/failed, and for Connect accounts `account.updated`.
13. **Tickets** [13]: one per seat, an unpredictable versioned QR credential (prefix `GT1`, distinct from free registrations' `GL1`), invalidated on refund or transfer, first scan wins. Delivered by email (order page link, calendar file) and on the order page reached by a signed, expiring link. No PDF, no wallet passes.
14. **Find my tickets** [14]: takes an email, always answers the same way, emails a signed link when that address has orders; rate limited.
15. **Transfers** [15]: where allowed and before the cutoff, the holder enters the new holder's name and email; the old QR stops working; both are emailed. No price field, no marketplace.
16. **Refunds** [16]: the buyer requests one within the policy from the order page; the organizer approves or refunds directly (whole order or single tickets); money returns to the original payment method; refunded tickets stop working. In Mode B the admin can refund too.
17. **Cancellations and changes** [17]: canceling stops sales, hides the event, emails every buyer and refunds every paid order in full; a date, time or venue change keeps tickets valid, emails holders with the new details and calendar file, and allows a refund under the policy. The existing cancel-and-notify orchestration is extended.
18. **Receipts** [18]: the email and order page list every line and the seller (the organization in Mode A; "Gamo Studios on behalf of <organization>" in Mode B).
19. **Gift to the organizer** [18a]: per event, an optional "Add a gift to <organization>" step (preset amounts and a custom amount, none selected by default). The page names the receiver; Gamo makes no tax claim. *Proposal:* no Gamo fee on gifts; gifts are their own ledger entries and receipt line; refunded only with the whole order or by the organizer's decision. Door sales can offer the same step.

### 8.3 Selling at the door

20. **Door staff links** [19]: per door or person ("North door", "Box office 1"), event-scoped, with a PIN and permissions (check in, sell, comp); expire 12 hours after the event's last date; revocable; five wrong PINs lock the link for 15 minutes. Signed-in organizers use the same screens. Built in `@gamo/domain` so Academy check-in and Worship call times can reuse it.
21. **One door screen per event and date** [20], phone-first, large targets, two modes: **Check in** (the existing check-in, extended to paid tickets and staff links) and **Sell**. The organizer's "Check in now" card leads to it.
22. **Selling** [21]: pick types and quantities (door allocation and, where allowed, online inventory), see the total, then: **cash** (enter cash received, see change due; no Stripe; *proposal:* no Gamo fee); **buyer's phone** (a short-lived order and Checkout Session shown as a large QR; the screen refreshes until the webhook confirms; staff can cancel, which expires the session and frees the seats); **card reader** (a card-present PaymentIntent sent to a paired reader; the screen shows the reader's status; the webhook decides); **comp** (if the link allows it; reason required).
23. **After a door sale** [22]: people are admitted at once (tickets created already checked in); staff can enter an email to send the tickets.
24. **Cash drawer** [23]: each selling link opens a cash session with a starting float; every cash sale and refund is recorded; the close shows expected, counted and the difference; the organizer sees every session. Cash sales need a connection (no offline queue); the screen says so when offline.
25. **Door refunds** [24]: card and phone payments through Stripe; cash refunds recorded with a reason, reducing the drawer's expected amount.
26. **Door-day totals** [25] on the event page: sold online, sold at the door by method, checked in, still to arrive; every number links to its list.

### 8.4 Reports and money (organizer)

27. **Orders** [26] per event: search by name, email or reference; filter by status, ticket type, channel and payment method; order detail with refund, resend and transfer history; CSV with formula-injection protection.
28. **Sales summary** [27] per event and date from the ledger: sold per type, gross, discounts, Gamo fee, gifts, refunds, net to the organization, door sales by method; reconciliation against Stripe balance transactions (Mode A: the connected account; Mode B: Gamo's account and payouts).
29. **Payments area** [28] (owners only): connect or check the Stripe account (Mode A), payout account (Mode B), payout history and statements; "Test mode" shown plainly.
30. **Buyer data** [29]: organizers export only their own events' buyers; Gamo never sells it; marketing emails need separate consent (not built). *Proposal:* names and emails removed 90 days after the event's last date; orders, amounts, references and the ledger kept for accounting.

### 8.5 Ledger and payment interface

31. A ledger [30] records every money movement in signed cents with currency and a category from [`GAMO_NONPROFIT_MODEL.md`](GAMO_NONPROFIT_MODEL.md) §5.3 (`program_service_receipt` for Gamo's fee, `third_party_payable` for ticket money and gifts owed to the organization, `processing_cost`, `refund`, `dispute`). Reports read the ledger only.
32. One payment interface [31] with Mode A, Mode B and a local Stripe stand-in; pages and orchestration never branch on the mode.

### 8.6 Admin

33. **Organization verification by meeting** [32]: the organization requests it; the admin schedules a meeting (date, time, video or in person, link or place, note), marks it held, then verifies or declines with a note; the owners are emailed at each step. Verifying needs a held meeting.
34. **Church and provider wording** [33]: "meeting (video call or in person)"; one meeting form component across Community and Gamo Live.
35. **Event review** shows paid details [34].
36. **Payments tab** [35] in the Gamo Live area: orders across organizations, refunds, disputes needing attention, organizations whose payments are not ready, Mode B balances owed and payouts (prepared; sending needs the owner, test mode only).
37. **Live settings tab** [36]: funds-flow default and per-organization overrides, the Gamo fee (each change a recorded decision with a reason and a confirm step), door sales on or off platform-wide.
38. **Overview counts** [37]: verification meetings to schedule, disputes, refund requests where Gamo is the seller; every number links to its list.

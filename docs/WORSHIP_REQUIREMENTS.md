# Gamo Worship: requirements (draft, 2026-11-01)

**Status: draft for the owner's approval. Nothing in this file is decided until the owner says so.** It follows the shape of [`LIVE_REQUIREMENTS.md`](LIVE_REQUIREMENTS.md) and reuses what Gamo Live and the admin established: the shared shell, meeting-based verification in the partners package, one payment interface with two funds-flow modes, a ledger in integer cents, honest empty states and thin pages. Rules that apply everywhere are in [`AGENTS.md`](../AGENTS.md) and [`SECURITY.md`](../SECURITY.md); the mission reference is [`GAMO_NONPROFIT_MODEL.md`](GAMO_NONPROFIT_MODEL.md) §3.1. Where something below is a guess, it is marked *proposal* and listed again in section 12.

The old Worship product code (git history before commit `3c3ff224`: sample church and musician workspaces, demo request forms, a sample opportunity board) shows what was tried in the design-first phase. It is not a reference for how things should work; every record there was fictional.

## 1. Purpose

Gamo Worship helps churches and almost any other person or group find **prepared, vetted musicians for any occasion, on any day**: a Sunday service, a midweek prayer meeting, a concert, a wedding, a funeral, a conference, a retreat, a school chapel, a recording session or anything else with a Christian purpose. It also gives musicians fairly paid, clearly described opportunities to serve. The program is described as **coordinated coverage with a standby musician where available**; it never promises guaranteed attendance or guaranteed replacement.

Two experiences:

- **Request musicians**: a church, ministry, school, family, individual or other group describes the occasion, the roles and the repertoire; Gamo proposes vetted musicians; both sides confirm.
- **Serve as a musician**: a musician applies, auditions, meets Gamo, is approved, and then chooses the dates and roles that fit.

Musicians are people, not inventory. Pages present them as skilled servants and professionals, and payment, sponsorship or partnership never affects who is proposed, how musicians are ordered or any trust signal.

## 2. What exists today

- Marketing pages (polished when the owner asks): `/` (hero "Stronger Worship Starts Together", audience switch, instruments, how a request works, how an audition works, primary and standby coverage, scheduling, join, FAQ, closing) and `/opportunities`, which today shows **sample** listings labeled as such (`apps/worship/src/data/worship.ts`). Both link to a provider sign-up that is part of the old product side.
- No product pages, no database, no sign-in: the whole product side is built from scratch with this document.
- Available from the platform and from Gamo Live: Clerk sign-in through `platform/identity`, partner profiles and meeting-based verification in the partners package, the dashboard shell and primitives in `packages/ui`, the payment interface, ledger and fee settings pattern, the shared `Calendar`, and the check-in pattern (first scan wins, event-scoped links) built for the Live door.

## 3. Who uses the product

| Who | What they are | Account |
| --- | --- | --- |
| **Requester** | A church, ministry, school, family, individual or other group that needs musicians. The person signing in belongs to a requesting partner (an organization or a person acting for themselves). | Clerk sign-in; one account can belong to one or more requesting partners. |
| **Musician** | A person who plays or sings and wants to serve through Gamo. Also sound and media volunteers where the request asks for them (*proposal*; see section 12). | Clerk sign-in; one account, one musician profile. |
| **Admin (Gamo coordinator)** | The one admin, in the admin app behind Cloudflare Access. In v1 the admin is the coordinator: reviews applications, holds verification meetings, proposes musicians and watches the day. | Cloudflare Access only (no staff accounts). |
| **Visitor** | Anyone reading the marketing pages or the public opportunity list. | None. |

The same person can be a requester and a musician (a worship leader who also plays elsewhere); the two areas are separate and the platform person record is one.

## 4. v1 scope (proposal)

Like Gamo Live, v1 is what can be trusted end to end, nothing more.

### 4.1 Public (no account)

1. **Marketing pages** as today, with the sample opportunity board replaced by real open roles once the product exists (see item 3). Copy stays short and mission-centered.
2. **Request and apply entry points** lead to the sign-in and sign-up pages of this product (`/account/*`), not to the old provider sign-up.
3. **Open opportunities** (`/opportunities`): real open roles from published requests of verified requesters, showing occasion type, date and time in the occasion's zone, city, instrument, style, primary or standby, and the musician pay on its own line. No requester name or exact address before a musician is proposed for the role (*proposal*). Empty state when there are none ("No open roles right now"). Expressing interest needs a verified musician account.
4. **No public musician directory** in v1 (*proposal*): musicians are proposed by Gamo, not browsed by requesters, so no profile is public.

### 4.2 Request musicians (requesters, with an account)

5. **Sign-in with Clerk through `platform/identity`**; Worship has its own Clerk application, as decided for Live. On first sign-in the person creates a requesting partner (name, kind: church, ministry, school, family, individual, other; city, state, time zone, contact) or accepts an invitation to one. Partner profiles live in the platform database.
6. **Verification by meeting** before the first request is matched: the requester asks for verification from their area, the admin schedules a meeting (video or in person), marks it held, then verifies or declines with a note. A requester can write and submit a request before the meeting; it waits as "Verification pending" and nobody is proposed until the partner is verified (*proposal*). "Verified" is shown only after the admin recorded the meeting and the decision.
7. **Create a request** in steps: Occasion (type, title, description, expected length) · When (one date or a weekly, biweekly or monthly pattern with an until date, in the requester's zone; call time, start and end) · Where (a saved location or a new one: name, address, parking and entry notes) · Roles (one row per role: instrument or voice, worship style, pay offered to the musician, standby wanted and standby pay, notes) · Repertoire (set list text, keys, links to charts or recordings, rehearsal date and place, dress and arrival notes) · Review and submit (every money line shown: musician pay per role and date, Gamo administrative allocation as its own line, the total). Terms consent on submit (requester terms draft, labeled).
8. **Pay offered per role** is entered by the requester within guidance the admin sets (*proposal*: a published minimum per role and date and an optional suggested range; the form says the pay goes to the musician in full). The Gamo administrative allocation is computed separately from the admin setting (starts at $0) and is never deducted from musician pay.
9. **Review rule**: every request is seen by the admin before musicians are proposed (the admin is the coordinator in v1). The admin can approve it for matching, ask for changes with a note, or decline it (out of scope, not a Christian purpose, or not workable). The requester sees the status and the note.
10. **Matching** (coordinator-led): for each role and date the admin proposes one musician (from musicians who expressed interest, from invited musicians, or chosen directly). The requester sees the proposal (musician's first name and last initial, instruments, styles, a short bio and the audition recordings the musician agreed to share) and **accepts or declines with a reason**. The musician then confirms. A role is **Confirmed** only when both sides have confirmed; nothing is final before that.
11. **Standby**: where the requester asked and a standby musician is available, a second musician is confirmed for the same role and date with the same repertoire and a separate standby pay. The page says plainly when no standby could be found. On the day, the requester or the admin can **activate the standby** (the standby becomes the musician of record; both are told); the primary's pay for that date is handled by the cancellation rule in item 14.
12. **Day of**: the requester's schedule shows each date with its confirmed musicians, call times and a **check-in state** (not yet, arrived at <time>, activated standby, missing). After the date the requester marks it **Completed** or reports a problem with a note; a date not marked within 48 hours completes automatically (*proposal*).
13. **Payment** goes through the payment interface (section 7): the requester pays by card when the roles are confirmed, from a receipt that lists every line; cash or any payment outside Gamo is not recorded as paid (*proposal*; see section 12 for the alternatives).
14. **Changes and cancellations**: edits to a request that has confirmed roles (time, place, repertoire) notify every confirmed musician; a change of date reopens the role for that date unless the musician reconfirms. Cancellation by the requester follows the policy chosen at submission from the options offered (*proposal*: free until 72 hours before the call time; later than that, the musician pay for that date is still due; a Gamo allocation on a canceled date is never charged). Every confirmed musician is emailed.
15. **Records**: request history, each date's record (who played, who was standby, check-in times, completion), statements from the ledger, CSV export of their own records only.
16. **Members**: an owner invites other people to the requesting partner by email (worship leader, administrator); members can do everything except edit membership and the partner profile; owners also see payments and statements.

### 4.3 Serve as a musician (musicians, with an account)

17. **Apply**: profile (instruments and voice parts with level, worship styles, years of service, teams served with, short bio, city and state, how far they travel, languages, equipment they bring); **two audition recordings** (one worship song, one of their choice: links to a video or audio page; uploads to R2 are later); references (two names and contacts, contacted by Gamo); consent to the musician terms (draft, labeled). Minors cannot apply in v1 (*proposal*; safeguarding first).
18. **Verification by meeting**: after the audition is reviewed, the admin schedules a meeting (video or in person), marks it held, then approves or declines with a note. The musician sees every step in one decision history. Approved musicians are "Verified musicians"; the label is never shown before the recorded decision.
19. **Availability**: a calendar of dates they cannot serve, plus weekly patterns (for example no Sunday mornings); the opportunity list and the admin's proposals respect it.
20. **Opportunities**: open roles that match their instruments and area; **express interest** on a role and date (with a confirmation that they can arrive by the call time and have read the repertoire notes). Interest is not a booking.
21. **Proposals and confirmations**: when the admin proposes them and the requester accepts, the musician sees the full details (requester name, address, call time, repertoire, rehearsal, pay) and **confirms or declines** by a deadline (*proposal*: 48 hours, or 12 hours when the date is within three days). Standby offers are confirmed the same way with the standby pay shown.
22. **Withdraw**: a confirmed musician can withdraw with a reason; the standby (if any) is activated, otherwise the role reopens and the admin and requester are told. Repeated late withdrawals are visible to the admin on the profile (counts, not scores).
23. **Day of**: check in from the phone at the call time ("I have arrived") from the musician's schedule; the requester's screen updates. The check-in link pattern from the Live door is reused (event-scoped, expiring, first check-in wins).
24. **Statements**: every date played, the pay for it, when it was paid out, and the payout account state; CSV of their own records. The musician's pay is always shown alone; the Gamo allocation is never shown as deducted from it.
25. **Payout account**: connect a Stripe account through the payment interface (Stripe Connect, test mode) to receive musician pay; "Test mode" shown plainly until the owner approves production.

### 4.4 Admin (in the existing admin app)

26. **Musician applications** queue: profile, recordings, references; audition note; schedule the verification meeting, mark it held, approve or decline with a note (one `MeetingForm`, one decision history).
27. **Requester verification**: the same meeting steps for requesting partners.
28. **Requests** queue and **dispatch board**: approve a request for matching, ask for changes, decline; per role and date see interested, invited and proposed musicians; invite musicians; propose one; see confirmations; activate a standby; mark a date completed or disputed.
29. **Schedule**: the shared `Calendar` across every confirmed date, with unfilled roles called out (roles starting within 7 days with nobody confirmed first).
30. **Payments**: orders, refunds, what is owed to each musician, payouts prepared (sending needs the owner, test mode only), musicians whose payout account is not ready, disputes.
31. **Worship settings**: the funds-flow default and per-partner overrides, the Gamo administrative allocation (starts at $0; every change a recorded decision with a reason and a confirm step), the pay guidance per role, standby rules; a decision history.
32. **Overview counts**: applications waiting, meetings to schedule, requests to approve, roles unfilled within 7 days, dates to settle, payouts to prepare; every number links to its list.

### 4.5 Later (not in this release)

Automatic matching and ranking (v1 is coordinator-led); a musician directory or booking without Gamo in the middle; ratings and reviews; in-app messaging between requester and musician (v1 uses structured notes and email); worship teams or bands booked as one unit; chart and recording storage in R2 (links only in v1); musicians setting their own rates; instant booking; minors as musicians (needs the safeguarding policy); background checks; geolocated check-in; Apple and Google Wallet; tax forms for musicians (needs the owner and an accountant; see section 12); recurring requests longer than 52 dates; multiple coordinators or coordinator accounts; sponsorship of a church's musician costs by another organization (wanted later, needs the gift and sponsorship safeguards applied here); substitution between musicians without Gamo; penalties or fees for no-shows; insurance; a native app. Worship payments need the owner's approval of Stripe production, the legal review of both terms documents and an answer on worker classification before real money moves.

## 5. Trust rules (from the mission, permanent)

- Never invent musicians, verified status, availability, interest, coverage or "standby ready".
- Standby support is described as a goal that depends on local availability, never as a guarantee; no "zero failure" or "guaranteed replacement" wording anywhere.
- Before a requester pays: every line (musician pay per role and date, standby pay, the Gamo administrative allocation, the total), the cancellation policy and who the seller of record is.
- Musician pay and the Gamo administrative allocation are always separate line items; no deduction from musician pay, ever. The allocation starts at $0 and every change is a recorded decision.
- All pay guidance, allocations and tiers are proposals until the owner approves them; the pages say so where amounts are shown.
- Payment, sponsorship or partnership never affects vetting, who is proposed, the order of opportunities or any badge.
- Musicians are presented with care: first name and last initial until a role is confirmed, no photos required, no scores or rankings shown to requesters.
- Never call Gamo Studios a nonprofit, tax-exempt or a charity; never say a payment to Gamo is tax-deductible; Gamo makes no tax claim about musician pay (the musician terms say musicians are responsible for their own taxes, wording for counsel).
- Eligibility is Christian purpose, never ethnicity or nationality; requests that are not a Christian occasion are declined with a note.
- Stripe is never described as escrow; money held by Gamo for a musician is `third_party_payable`, never Gamo income.

## 6. Data model (draft, tables at the level of LIVE_DATA_MODEL.md §3)

**Where it lives.** People, partner profiles (requesting partners and musicians as partners), memberships, invitations, terms acceptances and verification meetings and decisions live **once in the platform database** (the partners package). Worship owns its **own D1 database** (`gamo-worship-db-<env>`, binding `WORSHIP_DB`, migrations in `packages/db/worship/migrations`) holding only Worship records keyed by platform ids, plus its own payments ledger. The admin binds both. Conventions as in Live: prefixed random ids, UTC epoch seconds plus an IANA zone on the request, integer cents with `currency`, `CHECK` enumerations, keyed email hashes, no plain secrets, `created_at` on every table.

**Musicians (Worship-specific profile; identity and verification are in the platform)**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `musician_profiles` | `partner_id` (PK, platform partner id), `person_id` (platform), `display_name`, `bio`, `city`, `state`, `timezone`, `travel_miles`, `languages` (JSON), `equipment`, `years_serving`, `teams_served`, `standby_willing` (0/1), `share_recordings_with_requesters` (0/1), `status` (`applying`, `audition_submitted`, `in_review`, `approved`, `declined`, `paused`, `suspended`), `approved_at`, `late_withdrawals` | `approved_at` set only by the admin decision recorded in the platform; the label reads from the platform's verification, this column caches it for queries. `paused` is the musician's own choice (no opportunities shown). |
| `musician_skills` | `id`, `partner_id`, `kind` (`instrument`, `voice`, `tech`), `name` (from a fixed list plus `other`), `level` (`developing`, `ready`, `lead`), `styles` (JSON from the style list) | Feeds opportunity matching by instrument and style. |
| `audition_recordings` | `id`, `partner_id`, `kind` (`worship_song`, `own_choice`), `url`, `title`, `submitted_at`, `admin_note` | Links only in v1; the admin's note is private. |
| `references` | `id`, `partner_id`, `name`, `contact` (email or phone), `relationship`, `contacted_at`, `outcome` (`pending`, `positive`, `concern`), `note` | Contacted by Gamo by hand; never shown to requesters. |
| `availability_blocks` | `id`, `partner_id`, `kind` (`date`, `weekly`), `date`, `weekday`, `from_minute`, `to_minute`, `note` | Dates or weekly windows the musician cannot serve. |

**Requesters and places**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `requester_settings` | `partner_id` (PK, platform), `timezone`, `default_location_id`, `first_request_approved_at`, `status` (`active`, `suspended`) | Everything else about the partner (name, kind, contact, members, verification) is in the platform. |
| `locations` | `id` (`loc_`), `partner_id`, `name`, `address`, `city`, `state`, `timezone`, `parking_notes`, `entry_notes`, `lat`, `lng` | A requester's saved places; copied onto the request at submission so a later edit never changes a confirmed date. |

**Requests, roles and dates**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `requests` | `id` (`req_`), `reference` (`GW-XXXX-XXXX`), `partner_id`, `created_by_person_id`, `occasion_type` (`service`, `prayer`, `concert`, `wedding`, `funeral`, `conference`, `retreat`, `school`, `recording`, `other`), `title`, `description`, `timezone`, `location_snapshot` (JSON), `recurrence` (JSON: `weekly`, `biweekly`, `monthly`, until), `call_minute`, `start_minute`, `end_minute`, `rehearsal_at`, `rehearsal_place`, `repertoire` (text), `repertoire_links` (JSON), `notes`, `cancellation_policy` (`free_until_72h`, `free_until_7d`, `pay_due_after_confirmation`), `status`, `submitted_at`, `approved_at`, `terms_version` | `status`: `draft`, `verification_pending`, `pending_review`, `changes_requested`, `open` (matching), `confirmed` (every role on every date filled), `partly_confirmed`, `completed`, `canceled`, `declined`. Policies are snapshotted on each order. |
| `request_occurrences` | `id` (`roc_`), `request_id`, `starts_at`, `call_at`, `ends_at`, `status` (`scheduled`, `completed`, `disputed`, `canceled`), `completed_at`, `completed_by` (`requester`, `auto`, `admin`), `problem_note` | Expanded at submission, at most 52 dates, as in Live. |
| `request_roles` | `id` (`rol_`), `request_id`, `position`, `skill_kind`, `skill_name`, `styles` (JSON), `pay_cents`, `standby_wanted` (0/1), `standby_pay_cents`, `notes` | Pay is per role per date; the requester's offer, within the admin's guidance. |
| `role_slots` | `id` (`slt_`), `role_id`, `occurrence_id`, `kind` (`primary`, `standby`), `status` (`open`, `proposed`, `awaiting_musician`, `confirmed`, `activated`, `released`, `canceled`), `partner_id` (the musician), `proposed_at`, `requester_accepted_at`, `musician_confirmed_at`, `confirm_by`, `checked_in_at`, `withdrawn_at`, `withdraw_reason` | One slot per role, date and kind. `confirmed` needs both timestamps (`CHECK`). A standby slot becomes `activated` and the primary slot `released` in one conditional batch. |
| `role_interests` | `id` (`int_`), `role_id`, `occurrence_id` (null = every date), `partner_id`, `kind` (`interest`, `invited`), `note`, `withdrawn_at` | Unique per musician, role and date. Interest is never a booking. |
| `slot_history` | `id`, `slot_id`, `from_status`, `to_status`, `actor` (`requester`, `musician`, `admin`, `system`), `note`, `at` | Shown to both sides as a plain history. |

**Money (payments package shape, Worship-owned ledger)**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `orders` | `id` (`ord_`), `reference`, `request_id`, `partner_id` (the requester), `status` (`pending`, `paid`, `canceled`, `expired`, `refunded`, `partially_refunded`), `funds_flow`, `seller` (`musician`, `gamo`), `stripe_account_id`, `livemode`, `currency`, `musician_pay_cents`, `standby_pay_cents`, `allocation_cents`, `total_cents`, `amount_refunded_cents`, `policy_snapshot` (JSON), `allocation_snapshot` (JSON), `checkout_session_id`, `payment_intent_id`, `paid_at` | One order per request confirmation batch (every slot confirmed at that time); `CHECK (total = musician_pay + standby_pay + allocation)`. |
| `order_items` | `id`, `order_id`, `slot_id`, `kind` (`musician_pay`, `standby_pay`, `allocation`), `amount_cents` | One line per slot per kind; copied, never re-read. |
| `payments` | `id`, `order_id`, `kind`, `provider_ref`, `stripe_account_id`, `amount_cents`, `currency`, `status` | Every attempt, as in Live. |
| `stripe_events` | Stripe event id (PK), `type`, `account_id`, `livemode`, `status`, `claim_token`, `processed_at`, `error_code` | Claim, process, mark. |
| `refunds` | `id`, `order_id`, `slot_ids` (JSON), `amount_cents`, `requested_by`, `reason`, `status`, `stripe_refund_id` | Computed on the server from the policy snapshot. |
| `disputes` | `id`, `order_id`, `stripe_dispute_id`, `amount_cents`, `reason`, `status`, `outcome` | Webhooks only. |
| `ledger_entries` | `id`, `partner_id` (musician or requester), `request_id`, `order_id`, `slot_id`, `refund_id`, `payout_id`, `entry_type` (`musician_pay`, `standby_pay`, `gamo_allocation`, `processing_cost`, `refund`, `allocation_refund`, `dispute`, `dispute_reversal`, `payout`), `category` (`program_service_receipt`, `third_party_payable`, `processing_cost`, `refund`, `dispute`), `held_by` (`musician`, `gamo`), `funds_flow`, `amount_cents` (signed), `currency`, `source_key` (unique), `occurred_at` | Append-only. What Gamo owes a musician is the sum of `held_by = gamo` payable entries for that musician minus payouts. Statements read only this table. |
| `payouts` | `id`, `partner_id` (musician), `amount_cents`, `currency`, `status` (`prepared`, `approved`, `sent`, `failed`, `canceled`), `stripe_transfer_id`, `prepared_at`, `approved_at`, `sent_at` | Prepared by the admin after a date completes; sending needs the owner (test mode only). |
| `musician_payment_accounts` | `partner_id` (PK), `funds_flow_override`, `connected_account_id`, `charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements_due`, `livemode`, `checked_at` | Readiness flags only, as in Live's `organization_payments`. |
| `payment_settings` | single row: `funds_flow_default` (`not_chosen`, `musician_account`, `gamo_collects`) | Starts `not_chosen`: card payment fails closed until the owner chooses. |
| `allocation_settings` | `id`, `fixed_cents`, `percent_bps`, `reason`, `effective_at` | History of the Gamo administrative allocation; starts at 0 and 0. |
| `pay_guidance` | `id`, `skill_kind`, `skill_name` (null = any), `occasion_type` (null = any), `minimum_cents`, `suggested_low_cents`, `suggested_high_cents`, `standby_minimum_cents`, `reason`, `effective_at` | Published guidance per role; every row a recorded decision. Nothing exists until the owner approves amounts. |
| `settings_decisions` | `id`, `subject` (`funds_flow_default`, `musician_override`, `allocation`, `pay_guidance`, `standby_rules`), `partner_id`, `old_value`, `new_value`, `reason`, `decided_at` | Every settings change with its reason. |

**Review, check-in and plumbing**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `review_decisions` | `id`, `subject_type` (`request`, `occurrence`), `subject_id`, `decision` (`approved`, `changes_requested`, `declined`, `completed`, `disputed`, `settled`), `note`, `decided_at` | Shown to the requester (and the musician where it concerns them). Partner verification decisions live in the platform, not here. |
| `checkin_links` | `id`, `slot_id`, `token_hash`, `expires_at`, `used_at` | The day-of check-in link, from the shared check-in pattern; expires 12 hours after the date ends. |
| `rate_limit_counters`, `email_outbox` | as in Live | From the platform packages. |

**Rules the database enforces (draft)**

- **One musician per slot, both confirmations**: `confirmed` requires `requester_accepted_at` and `musician_confirmed_at`; proposing is a conditional update on `status = 'open'`.
- **Standby activation is one batch**: the standby slot moves to `activated` and the primary slot to `released` only if both are still in the expected status.
- **Past is closed**: a date whose `call_at` has passed accepts no interest, proposal or confirmation.
- **First check-in wins**: `UPDATE role_slots SET checked_in_at = :now WHERE id = :id AND checked_in_at IS NULL`.
- **Paid only by the webhook**; **refunds never exceed the payment**; **52 dates per request**.
- **Suspended partners** (platform status) never appear in any query that proposes, lists or pays.

**Privacy and retention (proposal).** A musician's full name, address and contact are shown to a requester only for a confirmed slot; a requester's address is shown to a musician only when proposed. Audition recordings and references are visible to the admin only, unless the musician opted to share recordings with requesters. Personal data on completed dates older than 90 days is reduced to what statements need (names on the record, amounts); references and recordings of declined applicants are removed 90 days after the decision. Orders, amounts and the ledger are kept as accounting requires.

## 7. Payments (draft)

Through the payments package, the same interface as Gamo Live ([`LIVE_PAYMENTS.md`](LIVE_PAYMENTS.md)): Mode A (the musician's own Stripe connected account is charged directly; the musician is the seller of record; the Gamo allocation, if any, is an application fee) or Mode B (Gamo collects on its own account, records what it owes each musician as `third_party_payable`, and pays it out by Connect transfer after the date completes). The platform default starts "not chosen", with per-musician overrides in the admin; until the owner chooses, card payment is unavailable and the request page says so. Pages never branch on the mode.

Every money line is computed on the server: musician pay per confirmed slot and date, standby pay per confirmed standby slot, the Gamo administrative allocation from the setting in force at the order (starts at 0, never on canceled dates, never deducted from musician pay), total. Processing cost is borne as in Live (*proposal*: by the musician's account in Mode A, deducted on Gamo's statement in Mode B, never added to the requester as a surcharge). Refunds follow the policy snapshot on the order and return to the original payment method. No cash recording, no tips and no gifts in v1 (see section 12).

## 8. Screens (draft)

The requester and musician areas use the shared dashboard shell (`packages/ui`: sidebar, floating cards, `FilterChips` with real counts, `Calendar`, `ConfirmAction`); commitment moments (sign-in, sign-up, the application, the request steps, the day-of check-in) use the split-screen layout and fit one desktop screen per step. Public pages keep the marketing look. Every screen: one `<h1>`, 44 px targets, axe clean, no overflow at 360 px, honest empty states.

### 8.1 Public: `worship.gamostudio.org`

| # | Route | Purpose | Notes |
| --- | --- | --- | --- |
| A1 | `/` | Marketing home | Unchanged until the owner asks; buttons lead to `/account/*`. |
| A2 | `/opportunities` | Real open roles with instrument, style, date and city filters; pay on its own line | Empty state honest; "Express interest" needs a verified musician account. The sample board goes away. |
| A3 | `/account/signin`, `/account/signup` | Clerk pages on a Worship-branded split screen; sign-up asks "I want to request musicians / I want to serve as a musician" | Fail closed when Clerk is not configured. |
| A4 | `/checkin/[token]` | Day-of check-in from the emailed or shown link: confirm "I have arrived" | Signed, expiring; first check-in wins; `Referrer-Policy: same-origin`. |
| A5 | `/404`, `/500`, `/legal/*` | Branded errors; requester terms, musician terms, privacy (drafts, labeled) | |

### 8.2 Requester area: `/requester/*`

Sidebar areas: **Overview, Requests, Schedule, Organization** (members, verification, payments and statements as tabs). Roles, proposals and each date are reached from a request.

| # | Route | Purpose | Reads and writes |
| --- | --- | --- | --- |
| B1 | `/requester/start` | Create the requesting partner or accept an invitation; terms consent | platform partner, membership; `requester_settings` |
| B2 | `/requester` | Overview: proposals waiting for a decision, roles still open within 7 days, next dates, verification card | counts from queries; empty state links to "New request" |
| B3 | `/requester/requests` | All requests, tabs by status with counts, search | `requests` |
| B4 | `/requester/requests/new` (steps 1 to 6) and `/requester/requests/[id]/edit` | The request steps of item 7; every step validates itself and keeps earlier answers; the money lines on the last step | `requests`, `request_roles`, `locations` |
| B5 | `/requester/requests/[id]` | Request page with tabs: **Overview** (status, admin note, money lines, policy), **Roles** (one card per role and date: open, proposed with accept or decline, confirmed, standby state), **Dates** (each date with check-in states; mark completed or report a problem), **Payments** (orders, receipts, refunds) | `role_slots`, `request_occurrences`, `orders` |
| B6 | `/requester/requests/[id]/proposals/[slotId]` | A proposed musician: name as allowed, skills, styles, bio, shared recordings; Accept or Decline with a reason | `role_slots`, `slot_history` |
| B7 | `/requester/schedule` | The shared `Calendar` across every request; a day opens its dates | `request_occurrences` |
| B8 | `/requester/organization` | Tabs: Profile (platform), Members and invitations (owners), Verification (status, meeting details, "Request verification"), Payments and statements (owners; receipts and the ledger view, CSV) | platform, `ledger_entries` |
| B9 | `/requester/settings` | Own name and email (from Clerk), time zone, own data download, deletion by email | |

Edge states: not signed in → sign-in; signed in with no partner → B1; another partner's request → 404; suspended partner → notice and read-only pages; verification pending → the request can be written and submitted, and the status card says what happens next.

### 8.3 Musician area: `/musician/*`

Sidebar areas: **Overview, Opportunities, Schedule, Profile** (application and verification, availability, payout account and statements as tabs).

| # | Route | Purpose | Reads and writes |
| --- | --- | --- | --- |
| M1 | `/musician/apply` (steps 1 to 5) | Profile, skills and styles, recordings, references, terms consent; progress bar | `musician_profiles`, `musician_skills`, `audition_recordings`, `references` |
| M2 | `/musician` | Overview: offers to confirm (with deadlines), next dates, open opportunities matching them, application and verification status card | counts from queries |
| M3 | `/musician/opportunities` | Open roles matching their skills and area, filters, "Express interest" per date | `role_interests` |
| M4 | `/musician/offers/[slotId]` | A proposal accepted by the requester: full details, pay on its own line, Confirm or Decline by the deadline; the same page for standby offers | `role_slots` |
| M5 | `/musician/schedule` | `Calendar` of confirmed and standby dates; a date shows call time, address, repertoire, rehearsal, check-in button on the day, Withdraw with reason (`ConfirmAction`) | `role_slots`, `checkin_links` |
| M6 | `/musician/profile` | Tabs: Profile and skills, Application and verification (decision history, meeting details), Availability (calendar of blocks and weekly windows), Payout account (connect through Stripe, readiness, "Test mode"), Statements (every paid date, payouts, CSV) | platform verification, `availability_blocks`, `musician_payment_accounts`, `ledger_entries` |
| M7 | `/musician/settings` | Name and email (from Clerk), pause opportunities, own data download, deletion by email | |

### 8.4 Admin (`apps/admin`, new **Gamo Worship** area)

| # | Route | Purpose |
| --- | --- | --- |
| C1 | `/worship/applications` | Queue of musician applications: profile, recordings, references; audition note; meeting steps and the decision (shared `MeetingForm`, platform verification) |
| C2 | `/worship/requesters` | Requesting partners: verification by meeting, suspend or reinstate, funds-flow override; their requests |
| C3 | `/worship/requests` | Queue: approve for matching, ask for changes, decline; then the dispatch board per request (roles and dates, interested and invited musicians, propose, invite, activate standby, settle a date) |
| C4 | `/worship/schedule` | Every confirmed date on the shared `Calendar`; unfilled roles within 7 days first |
| C5 | `/worship/payments` | Orders, refunds, disputes, owed per musician, payouts prepared (owner sends), payout accounts not ready |
| C6 | `/worship/settings` | Funds-flow default and overrides, administrative allocation, pay guidance, standby rules; decision history with reasons |
| C7 | Overview counts | Applications waiting, meetings to schedule, requests to approve, roles unfilled within 7 days, dates to settle, payouts to prepare |

### 8.5 Main tasks and presses (draft)

| Task | Path | Presses |
| --- | --- | --- |
| Request musicians for one Sunday | Overview → New request → 6 steps → Submit | 7, plus typing |
| Accept a proposed musician | Overview count → proposal → Accept | 3 |
| Express interest (musician) | Opportunities → role → Express interest → Confirm | 4 |
| Confirm an offer (musician) | Overview → offer → Confirm | 3 |
| Check in on the day | Email or schedule → "I have arrived" | 1 to 2 |
| Propose a musician (admin) | Overview count → request → role and date → Propose <name> | 4 |
| Activate a standby | Request → Dates → Activate standby → Confirm | 3 |

## 9. Emails (plain text first, through the platform email adapter; owner-approved before real sending)

To requesters: verification requested, meeting scheduled, meeting held, verified or declined · request received · request approved for matching, changes requested or declined (with the note) · a musician is proposed (accept or decline) · role confirmed (musician's details, call time) · no standby available · standby activated · musician withdrew (what happens next) · receipt (every line and the seller) · refund issued · date completed reminder (mark completed or report a problem) · invitation to join the partner.

To musicians: application received · audition reviewed, meeting scheduled, meeting held, approved or declined (with the note) · invited to a role · offer to confirm (deadline) · confirmation received (full details, calendar file) · request changed (new details) · request canceled (and what pay is due) · standby activated (you are on) · check-in link on the day · payout prepared and payout sent · payout account needs attention.

To the admin: nothing emailed in v1; everything waiting shows on the admin Overview, as in Live.

## 10. Quality bar

Same as Live and the admin: real data only; honest empty states; server-rendered pages and plain forms; CSP without inline scripts (Clerk's origins on the sign-in pages only); fail closed; identity, same origin, then validation on every write; thin pages with one named function each and a unit test; shared components before new ones; designs approved before screens are built; built-worker browser checks before any deploy.

## 11. Build order (after approval)

1. Platform pieces Worship needs that Live did not: partner kinds for requesters and musicians, memberships for requesting partners, verification subject types, Clerk application for Worship. 2. Schema and migrations for `WORSHIP_DB`. 3. Sign-in, requester start, musician application (A3, B1, M1). 4. Admin applications and requester verification (C1, C2). 5. Request steps and request page (B3 to B6). 6. Opportunities, interest, offers, confirmations (A2, M2 to M5). 7. Admin requests and dispatch board, schedule (C3, C4). 8. Day of: check-in, standby activation, completion (A4, B5 Dates, M5). 9. Payments: orders, webhooks, ledger, statements, payouts, settings (B5 Payments, B8, M6, C5, C6). 10. Emails and the outbox. 11. Built-worker browser checks, then the owner's preview deploy.

## 12. Open questions for the owner

1. **Who sets the pay?** This draft has the requester offer the pay per role within admin-published guidance (a minimum and a suggested range). Alternatives: Gamo sets a fixed rate card per role and occasion; or musicians state their own rate. Which one, and are there any amounts to start with (none are approved today)?
2. **When is the requester charged?** This draft charges by card when the roles are confirmed and pays the musician out after the date completes (Mode B) or charges the musician's own account directly (Mode A). Alternatives: charge after the date completes; or let the requester pay the musician directly and have Gamo record it only. Which one?
3. **Funds-flow modes for Worship.** In Mode A the musician is the seller of record with their own Stripe account, which is a lot to ask of an individual. Should Worship start with Mode B only (Gamo collects, pays musicians out), keeping Mode A in the interface for later?
4. **Worker classification and tax forms.** Musicians paid through Gamo may need a tax form at year end, and their status (contractor or otherwise) needs counsel. Is this reviewed before any real money moves, and is it in the launch?
5. **Cancellation policy options.** Draft: free until 72 hours before the call time, otherwise the musician pay for that date is still due; a second option of 7 days for larger occasions. Are these the options to offer, and is a Gamo allocation ever charged on a canceled date (draft: never)?
6. **Standby pay.** Is a standby paid even when not activated (draft: yes, a separate, smaller standby pay set by the requester within guidance), and what happens to the primary's pay when the standby is activated for a reason other than the primary's withdrawal?
7. **Musician withdrawals.** Should a late withdrawal (inside 72 hours) have any consequence beyond being visible to the admin (draft: counts only, no penalties, no scores)?
8. **Verification of individuals and families.** The owner's rule says every client is verified in a meeting. For a family requesting for a wedding or a funeral, is a short video meeting still required before matching, or can the admin waive it per request?
9. **Can a request be submitted before verification?** Draft: yes, and it waits as "Verification pending". Or should the meeting come first?
10. **Audition recordings.** Links to a video or audio page in v1, uploads to R2 later. Right? And may musicians choose to let requesters see their recordings on a proposal (draft: yes, opt-in)?
11. **References.** Two references contacted by Gamo by hand before approval: required, optional, or not in v1?
12. **Sound and media roles.** Should Worship requests include front-of-house, monitors and lyrics operators (the marketing page lists "Sound and media"), or does that belong to Gamo Production?
13. **Minors as musicians.** Draft: not in v1 (safeguarding policy first). Confirm.
14. **Public musician directory.** Draft: none; musicians are proposed by Gamo, not browsed. Or should verified musicians have a public profile page?
15. **What requesters see of a musician before confirmation.** Draft: first name and last initial, skills, styles, bio, opted-in recordings; full name and contact after both confirmations. Right?
16. **What musicians see of a request before being proposed.** Draft: occasion type, date, city, style and pay on the public opportunity list; requester name and address only once proposed. Right?
17. **Matching model.** Draft: coordinator-led in v1 (the admin proposes one musician per role and date; musicians can express interest first). Is an "invite the musician you want" option for requesters wanted in v1 (for example a church that already knows a Gamo musician)?
18. **Confirmation deadlines.** Draft: a musician confirms within 48 hours, or 12 hours when the date is within three days; an unanswered offer returns to open. OK?
19. **Automatic completion.** Draft: a date completes automatically 48 hours after it ends unless the requester reported a problem. OK, and who settles a disputed date (draft: the admin, with a note, no partial pay rules in v1)?
20. **Gifts and tips.** Should a requester be able to add a gift to the musician at payment (its own line, no allocation), the way Live offers a gift to the organizer? Draft: not in v1.
21. **Sponsored musician costs.** Should another church or organization be able to sponsor a small church's musician costs in v1 (the gift and sponsorship safeguards would apply), or later?
22. **Area names and URLs.** Draft: `/requester/*` and `/musician/*`, and "Requester" as the word for churches and groups inside the product. Is there a better word (for example "Church and group area")?
23. **Instrument, voice and style lists.** The draft fixed lists come from the marketing page (keys, guitar, bass, drums, vocals, sound and media; contemporary, gospel, hymns and traditional, choir, acoustic, bilingual). Anything to add or remove?
24. **Service area.** Opportunities match by the musician's city and travel distance. Is Worship launched nationwide like Live, or in named metros first (the FAQ says areas will be announced)?
25. **Retention.** Draft: personal details reduced 90 days after a completed date; declined applicants' recordings and references removed after 90 days; ledger kept as accounting requires. OK?
26. **Terms documents.** A requester terms draft and a musician terms draft are needed for counsel (payment timing, cancellation, worker status, data use). Does the owner want drafts written with the build, labeled as drafts, as for Live?

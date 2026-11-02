# Gamo Production, requirements (draft, 2026-11-01)

**Status: draft for the owner's approval. Nothing below is decided or built.** Written in the shape of [`LIVE_REQUIREMENTS.md`](LIVE_REQUIREMENTS.md) so Production reuses what Gamo Live and the admin established: the shared dashboard shell, the partners package for verification by meeting, platform identity (Clerk), the payments package (two funds-flow modes, the ledger, a Gamo fee that starts at $0) and the admin's meeting form. Rules that apply everywhere are in [`AGENTS.md`](../AGENTS.md) and [`SECURITY.md`](../SECURITY.md); the mission is in [`GAMO_NONPROFIT_MODEL.md`](GAMO_NONPROFIT_MODEL.md) §3.4. Where this draft and the owner's facts disagree, the owner's facts win; everything uncertain is in section 12, not stated as fact.

## 1. Purpose

**Strengthen the technical capacity of churches and Christian events**: audio, livestream and video, lighting and media, event production support and equipment and facility guidance. Gamo Production serves the volunteers behind the board, with people first and equipment second: guidance that respects every church budget, independent of any vendor, and teams that do not depend on one person.

Three kinds of work, in the words the marketing pages already use:

- **Consultation**: a needs assessment of a room, a setup and a volunteer team, by video call or on site, ending in a written recommendation (keep, repair, replace or wait).
- **Event support**: planning and, where Gamo has the people, technicians at a service, a worship night, a conference or a concert (run of show, stage plot, input list, positions on the day).
- **Facility guidance**: equipment inventory and condition review, acoustics observations, phased improvement planning and questions to ask vendors. Gamo sells no equipment.

**Training is not delivered here.** Gamo Production describes training and sends people to Gamo Academy for it (production training is an Academy offering; `AGENTS.md` §1). A request about training is handed to Academy, not worked in Production.

Eligibility is Christian purpose (churches, ministries, Christian events, Christian artists) and the mission, never ethnicity or nationality, and never payment: requests are prioritized by need and safety, not by what a church can pay.

## 2. What exists today

- Marketing pages (`apps/production`, polished when the owner asks): `/` (hero, the three principles, three support areas with previews, training, event support, facility guidance, an honest "no project stories yet" section, consultation), `/services` (the six support areas, FAQ), `/services/[slug]` (one area: what it covers, questions to consider, skills to build). Every page carries a "Proposed program" label. Content is typed data in `apps/production/src/data/production.ts`; the support areas are `audio`, `livestream-video`, `lighting-media`, `training`, `event-support`, `facility-guidance`.
- Every call to action ("Start a needs assessment", "Request a consultation", "Join the technician team") goes to the web contact page with a prefilled subject (`inquiryUrl('Production consultation')`, `providerSignupUrl('production', 'technician')`), which opens an email to `hello@gamostudio.org` (decision of 2026-10-19). Nothing is stored in Production.
- Retired URLs redirect (`apps/production/src/lib/legacy-redirects.ts`): `/assessment`, `/consultation/*`, `/contact`, `/client/*`, `/crew/*`, `/account/*`, and `/training` to Academy's production training section.
- Old code (before commit `3c3ff224`): a church "client" workspace (requests, assessments, consultations, milestones, documents, history, messages) and a "crew" workspace (tasks, availability, checklists, training, team, resources) drawn from sample data only, a technician provider profile reviewed in the admin, and a Live API where an event's organizer could file a production request (`category` audio, livestream, lighting, acoustic or training plus a scope summary). It shows what was tried, not how things should work; none of it stored real work.
- In the admin today: technicians are a provider role (`PROVIDER_ROLES` in `@gamo/core`, `technician` one of the roles that always needs review) reviewed in Community → Provider review, with the meeting form. That is where Production's technician verification already lives.

## 3. Who uses the product

| Who | What they are to Gamo | Account |
| --- | --- | --- |
| **Client**: a church, ministry, Christian event organizer or Christian artist asking for help | a partner organization, verified by meeting once (the platform record, shared with Live and Worship) | Clerk through platform identity for the client area; the first request needs no account (3.1) |
| **Technician**: a sound, video, livestream or lighting technician serving on Gamo's behalf | a partner (provider role `technician`), verified by meeting before any assignment | Clerk through platform identity |
| **Visitor**: someone reading the support areas or deciding whether to ask | none | none |
| **The admin** (one person, Cloudflare Access) | runs the program: reviews requests, holds consultations, builds plans, assigns technicians, approves cost recovery | admin app |

A person can be both a client's contact and a technician (one platform person, two roles); the areas are separate.

## 4. v1 scope (proposal)

Like Live, v1 is what can be trusted end to end, nothing more.

### 4.1 Ask for help (public, no account)

1. **Support request** from any support area page and the consultation section: organization name and kind (church, ministry, event organizer, artist, other), city and state, contact name and email, the area (audio, livestream and video, lighting and media, event support, facility guidance, training), what they hope to improve (free text, at most 2 000 characters), weekly attendance and the number of technical volunteers (optional), and for event support the event's date and expected size, with an optional link to a Gamo Live event. Terms consent (client terms, a draft labeled as such).
2. The person confirms with a **6-digit code emailed** to them (the Live registration pattern: 10-minute expiry, 5 attempts, rate limited); nothing is a request before that. Then a confirmation email with a **signed, expiring manage link** (view, add a note, withdraw). No account needed for this.
3. **A training request is handed to Academy**: the confirmation says so, links to Academy's production training, and the request is closed in Production with reason `handed_to_academy`. The admin sees it once in the Production queue so nothing is lost (proposal; see open question 3).
4. Honest expectations: the page says a person from Gamo replies by email, gives no promised response time, and never shows invented availability, team sizes or past projects.

### 4.2 Client area (signed in, member of an organization)

5. **Sign-in with Clerk through platform identity**; the client area is reached from the confirmation email ("Create an account to follow this request") and from `/client`. One account can belong to one or more organizations; the organization is the platform partner record (name, kind, city, website, contact), created on first sign-in or claimed from the request's email. Membership roles: `owner` and `member` as in Live.
6. **Requests**: every request of the organization, its status (received, in review, consultation scheduled, consultation held, plan sent, active, completed, closed, withdrawn, handed to Academy), the admin's visible notes and the next step; add a note or files; withdraw.
7. **Consultations**: the meeting Gamo proposes (date, time, zone, video call or on site, link or place), accept or ask for another time; afterwards the written **recommendation** (what to keep, repair, replace or wait on; observations; a phased plan). Nothing is a recommendation until the admin sends it.
8. **Engagements**: when Gamo and the organization agree to do something (a site visit, event support on a date, a facility review), the client sees the engagement: dates, the positions Gamo fills (for example "front of house", "stream audio", "lighting"), who from Gamo is assigned once accepted (name and role only), the run of show or plan document, and the cost recovery proposal with every line (5.1). The client **accepts the proposal** before anything is scheduled as confirmed; a free or sponsored engagement is accepted the same way with a $0 total.
9. **Pay** an accepted proposal (when the total is above $0) through the payments package: Stripe Checkout, every line shown, the seller named, no card surcharge. The paid state comes only from the verified webhook. Cash or check is recorded by the admin (`recorded_offline`), never assumed.
10. **Documents**: recommendations, plans, stage plots and input lists shared by Gamo, and files the client uploads (photos of the room, the current input list), stored in R2 with a size and type limit; no document is shared before the admin publishes it to the organization.
11. **Organization profile**, members and invitations, verification status (read only; requested from here, decided in the admin after a meeting), own data download and account deletion by email, as in Live's settings page.

### 4.3 Technician area (signed in, a verified technician)

12. **Apply**: sign in, then a profile: display name, city and state, travel radius, skills (audio, livestream, video, lighting, media, stage), experience in each, equipment owned (free text), a short bio, references (optional), consent to the provider terms. Submitting puts the profile in `submitted` for the admin.
13. **Verification by meeting** (the partners package): the admin schedules a meeting (video or in person), marks it held, then verifies, asks for changes or declines with a note; the technician is emailed at each step and sees the decision history. "Verified" appears only after that. An unverified technician sees no assignments.
14. **Availability**: the shared calendar with unavailable dates and a typical week (weekday evenings, Saturdays, Sunday mornings, travel beyond the radius), read by the admin when assigning. Nothing is promised to anyone from it.
15. **Assignments**: an offer for a position on an engagement (date, place, call time, role, the agreed pay for that position as its own line, notes), **accept or decline** with an optional reason; a decline returns the position to the admin. An accepted assignment shows the call sheet (plan document, contact at the organization, the run of show) once the admin publishes it. Only the technician's own assignments are visible, never other technicians' pay.
16. **Pay statements**: per completed engagement, what the technician is owed, when it was approved and when it was paid, read from the ledger; a technician never sees Gamo's administrative allocation as a deduction from their line, because there is none (5.1).
17. Own profile edits (a change to skills or name after verification is recorded, not re-reviewed), own data download, deletion by email.

### 4.4 Admin (in the existing admin app)

18. **Production area** with tabs: **Requests** (queue, open one: notes, hand to Academy, schedule a consultation, close with a reason), **Consultations** (scheduled, held, recommendation drafting and publishing), **Engagements** (create from a request, positions, assignment offers, the plan document, the cost recovery proposal, its acceptance and payment, completion), **Technicians** (the provider review queue for role `technician`, moved or linked here; verification by meeting; availability overview), **Money** (proposals awaiting acceptance, payments received, technician pay approved and owed, payouts prepared; sending a payout is owner-only), **Settings** (the Gamo administrative allocation, starting at $0; each change a recorded decision with a reason and a confirm step; default pay guidance per position as a proposal list, not a price list on any public page).
19. Overview counts (requests waiting, consultations to schedule, positions unfilled within 14 days, proposals awaiting acceptance, pay to approve); every number links to its list.
20. The meeting form is the shared one (Community churches, Live organizations, Production technicians and client organizations).

### 4.5 Later (not in this release)

Equipment rental or sales (never sales; rental only if the owner wants it); messaging threads between clients and technicians (v1 uses notes on the request and email); a public technician directory; clients choosing technicians by name; recurring engagements (a technician every Sunday for a church is a Worship-style coverage model, not Production v1); multi-day tours; expense reimbursement lines (mileage, parking) on technician pay; a quote builder with equipment and vendor lines; sponsorship of an engagement by a third organization; gifts at checkout (gifts at Live checkout go to the organizing church; a Production client is the church itself, so there is no receiver to name); Stripe Terminal or cash drawer at events (that is Live's door); tasks and checklists for technicians (the old crew workspace); project stories on the marketing pages (only once real work exists and the church has agreed); training tracks, seats and progress (Academy); volunteer development programs run by Gamo inside a church (a Worship and Academy question); sales tax on services (open for counsel).

## 5. Money (proposal; every number is a proposal until the owner approves)

### 5.1 Lines

An engagement's cost recovery proposal has these lines, each stored and shown separately, in integer cents with currency:

| Line | Category (`GAMO_NONPROFIT_MODEL.md` §5.3) | Notes |
| --- | --- | --- |
| **Technician pay**, one line per assigned position | `third_party_payable` | the agreed amount for that position and date; never reduced by anything Gamo keeps |
| **Gamo administrative allocation** | `program_service_receipt` | an admin setting, **starts at $0**, applied per engagement as a fixed amount, a percentage of the technician lines, or both; its history and every change are recorded decisions; shown as its own line even at $0 |
| **Processing cost** | `processing_cost` | Stripe's cost, from the balance transaction; never a surcharge to the client |
| **Refund** | `refund` | when an engagement is canceled after payment |

No sponsored, free or volunteer engagement ever carries an allocation; a $0 proposal is still accepted explicitly so both sides have the record.

### 5.2 Funds flow

The payments package's two modes behind one interface, exactly as Live (`LIVE_PAYMENTS.md` §1): Mode A charges on a connected account that belongs to the seller, Mode B charges on Gamo's account and transfers afterwards. In Production the money is owed to **technicians** (several per engagement) rather than to one organization, so the natural fit is **Mode B with transfers to each technician's connected account**, and Mode A fits only when one technician is the whole engagement. Until the owner chooses, card payment is unavailable and the proposal says so; a $0 proposal and offline recording work in either state. Technician payouts are prepared in the admin and sent only with the owner's explicit approval, test mode only, after the engagement is completed. Stripe is never described as escrow.

### 5.3 Snapshots and the ledger

The proposal's lines, the allocation setting in force and the seller of record are copied onto the proposal when it is sent; a later settings change applies to new proposals only. Every movement is a ledger entry in signed cents with `held_by` and a unique `source_key`; the admin's Money tab and the technician's pay statements read the ledger only.

## 6. Trust rules (from the mission, permanent)

- Never invent technicians, availability, verified status, past projects, response times or results. The marketing pages keep their honest empty state until real work is documented with the church's agreement.
- Requests are prioritized by need and safety, never by payment, partnership or sponsorship; the admin's queue has no "paid" sort.
- Guidance is independent: no vendor relationships affect a recommendation; Gamo sells no equipment; the pages say so.
- Before a client accepts a proposal: every line, the seller of record and the cancellation terms are on the page.
- Technician pay and the Gamo allocation are separate lines; nothing is deducted from a technician's agreed pay; the allocation starts at $0 and changes only by a recorded owner decision.
- Training is Academy's; Production describes it and links there, and never enrolls anyone.
- Never call Gamo Studios a nonprofit, tax-exempt or a charity; never say a payment to Gamo is tax-deductible; no "donation" wording for anything paid to Gamo.
- Safety on site is a condition of an assignment (ladders, rigging, electrical): the call sheet carries the organization's safety contact, and a technician can decline unsafe work without penalty.

## 7. Data model (draft, tables at the level of `LIVE_DATA_MODEL.md` §3)

**Where it lives.** People, partner organizations, technician partner profiles, verification meetings and decisions, terms acceptances and identities live **once in the platform database** (the partners package); Production's own D1 database (`PRODUCTION_DB`, `packages/db/production/migrations`) holds only Production's records, keyed by platform ids, plus its own payments ledger. Conventions as Live: prefixed random ids, UTC epoch seconds plus an IANA zone where a date is shown, integer cents with currency, `CHECK` enumerations, keyed email hashes, no plain secrets, `created_at` and `updated_at`.

**Referenced from the platform (not owned here):** `people`, `partner_organizations` (kind, city, verification), `partner_profiles` (role `technician`), `memberships`, `verification_meetings`, `verification_decisions`, `terms_acceptances`, `email_outbox`.

**Requests and consultations**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `support_requests` | `id` (`req_`), `organization_id` (platform id, null until claimed), `organization_name`, `organization_kind`, `city`, `state`, `contact_name`, `contact_email`, `email_hash`, `area` (`audio`,`livestream_video`,`lighting_media`,`event_support`,`facility_guidance`,`training`), `summary`, `attendance`, `volunteer_count`, `event_date`, `event_size`, `live_event_slug`, `status` (`pending`,`received`,`in_review`,`consultation_scheduled`,`consultation_held`,`plan_sent`,`active`,`completed`,`closed`,`withdrawn`,`handed_to_academy`), `close_reason`, `terms_version`, `confirmed_at`, `closed_at` | `pending` until the emailed code is entered (15-minute hold, then deleted). The manage link is signed and stored nowhere. |
| `request_codes` | `id`, `request_id`, `code_hash`, `expires_at`, `attempts`, `consumed_at` | 6-digit code, 10 minutes, 5 attempts, one use (Live's `email_codes`). |
| `request_notes` | `id` (`rnt_`), `request_id`, `author` (`client`,`admin`), `visible_to_client` (0/1), `body` | The client sees only notes marked visible. |
| `consultations` | `id` (`con_`), `request_id`, `organization_id`, `starts_at`, `timezone`, `format` (`video`,`on_site`), `location`, `status` (`proposed`,`accepted`,`another_time_requested`,`held`,`canceled`), `held_at`, `client_message` | One request can have several (a walkthrough after a video call). |
| `recommendations` | `id` (`rec_`), `consultation_id`, `request_id`, `status` (`draft`,`published`), `summary`, `document_id`, `published_at` | The client sees it only when `published`. |

**Engagements, positions and assignments**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `engagements` | `id` (`eng_`), `request_id`, `organization_id`, `kind` (`site_visit`,`event_support`,`facility_review`), `title`, `venue_name`, `venue_address`, `timezone`, `status` (`draft`,`proposed`,`accepted`,`confirmed`,`completed`,`canceled`), `safety_contact_name`, `safety_contact_phone`, `plan_document_id`, `accepted_at`, `completed_at`, `canceled_at`, `cancel_reason` | `confirmed` needs an accepted proposal and every required position filled (a conditional update, checked on the server). |
| `engagement_dates` | `id` (`edt_`), `engagement_id`, `starts_at`, `ends_at`, `call_time_at` | A site visit has one date; event support can have several (rehearsal, event). |
| `positions` | `id` (`pos_`), `engagement_id`, `date_id`, `role` (`foh_audio`,`monitor_audio`,`stream_audio`,`video_switch`,`camera`,`lighting`,`media`,`stage`,`lead`), `label`, `required` (0/1), `pay_cents`, `currency`, `notes` | `pay_cents` is the technician line for this position; it is copied onto the assignment and the proposal line when sent. |
| `assignments` | `id` (`asg_`), `position_id`, `technician_profile_id` (platform id), `status` (`offered`,`accepted`,`declined`,`withdrawn`,`completed`,`no_show`), `pay_cents`, `currency`, `offered_at`, `responded_at`, `decline_reason`, `call_sheet_published_at` | One `accepted` assignment per position (`UNIQUE` on `position_id` among accepted, enforced by a conditional update). The technician sees only their own rows. |
| `technician_availability` | `technician_profile_id`, `kind` (`unavailable_range`,`weekly`), `starts_at`, `ends_at`, `weekday`, `slot` (`morning`,`afternoon`,`evening`), `travel_beyond_radius` (0/1) | Read by the admin's assignment screen; never shown publicly. |
| `technician_skills` | `technician_profile_id`, `skill` (`audio`,`livestream`,`video`,`lighting`,`media`,`stage`), `level` (`learning`,`capable`,`lead`) | Production-specific detail beside the platform partner profile. |

**Money (through the payments package)**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `proposals` | `id` (`prp_`), `engagement_id`, `organization_id`, `version`, `status` (`draft`,`sent`,`accepted`,`declined`,`superseded`,`canceled`), `currency`, `technician_cents`, `allocation_cents`, `total_cents`, `allocation_snapshot` (JSON), `seller` (`gamo`,`technician`), `funds_flow`, `stripe_account_id`, `cancellation_terms_version`, `sent_at`, `accepted_at`, `accepted_by` (platform person id) | A new version supersedes the old one; only a `sent` proposal can be accepted. `CHECK (total_cents = technician_cents + allocation_cents)`. |
| `proposal_lines` | `id` (`prl_`), `proposal_id`, `kind` (`technician_pay`,`gamo_allocation`), `position_id`, `label`, `amount_cents` | Copied, never recomputed after sending. |
| `payments` | `id` (`pay_`), `proposal_id`, `kind` (`checkout_session`,`recorded_offline`), `provider_ref`, `stripe_account_id`, `amount_cents`, `currency`, `status` (`pending`,`succeeded`,`failed`,`canceled`,`expired`), `recorded_by`, `recorded_note` | Paid state comes from the webhook or an explicit admin record of cash or check. |
| `stripe_events` | as Live | Claim, process, mark. |
| `refunds` | `id` (`rfd_`), `proposal_id`, `amount_cents`, `currency`, `method` (`stripe`,`offline`), `requested_by` (`client`,`admin`), `reason`, `status`, `stripe_refund_id` | Whole or partial, by the admin, within the cancellation terms. |
| `ledger_entries` | as Live, with `entry_type` (`service_payment`,`gamo_allocation`,`processing_cost`,`refund`,`allocation_refund`,`technician_pay`,`technician_payout`), `technician_profile_id`, `engagement_id`, `proposal_id` | Owed to a technician = Σ `technician_pay` approved for them minus `technician_payout`. |
| `pay_approvals` | `id` (`pap_`), `assignment_id`, `technician_profile_id`, `amount_cents`, `currency`, `approved_at`, `note` | The admin approves pay after completion; this writes the `technician_pay` entry. |
| `payouts` | `id` (`pyo_`), `technician_profile_id`, `amount_cents`, `currency`, `status` (`prepared`,`approved`,`sent`,`failed`,`canceled`), `stripe_transfer_id`, `prepared_at`, `approved_at`, `sent_at` | Prepared by the admin; sending is owner-only, test mode only. |
| `allocation_settings` | `id`, `fixed_cents`, `percent_bps`, `reason`, `effective_at` | The Gamo allocation history; starts with one row of 0 and 0. |
| `payment_settings`, `payment_decisions` | as Live | Funds-flow default, overrides per technician account, every change with its reason. |
| `technician_payments` | `technician_profile_id` (PK), `connected_account_id`, `charges_enabled`, `payouts_enabled`, `details_submitted`, `requirements_due`, `livemode`, `checked_at` | Only the account id and readiness flags. |

**Documents and the rest**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `documents` | `id` (`doc_`), `organization_id`, `request_id`, `engagement_id`, `kind` (`recommendation`,`plan`,`stage_plot`,`input_list`,`run_of_show`,`photo`,`other`), `title`, `r2_key`, `content_type`, `size_bytes`, `uploaded_by` (`client`,`admin`), `published_to_client_at`, `visible_to_technicians` (0/1) | Type and size limits on upload; a signed, expiring download URL; nothing public. |
| `rate_limit_counters` | as Live | Requests, codes, find-my-request. |
| `decisions` | `id`, `subject_type` (`request`,`engagement`,`proposal`,`assignment`), `subject_id`, `decision`, `note`, `decided_at` | The history the client or technician sees. |

**Rules the database enforces:** a request is confirmed only by a consumed code; one accepted assignment per position; an engagement is confirmed only with an accepted proposal (the server checks the proposal's status in the same batch); `total = technician + allocation`; refunds never above the payment; `pending → paid` only by the webhook or an explicit offline record with the admin's note; completed engagements and sent proposals are never edited (a new version is created).

**Retention (proposal):** request contact names and emails, notes and uploaded photos are removed 90 days after the request is closed or the engagement's last date, by the admin's cleanup action with a report; engagements, proposals, payments, pay approvals, payouts and the ledger are kept as accounting requires. Technician profiles stay while the technician is active and are removed on deletion by email.

## 8. Screens (draft inventory)

Public pages keep the marketing look; the request flow uses the split-screen layout in steps that fit one desktop screen; the client and technician areas use the shared dashboard shell (sidebar with four to six areas, floating cards, counts that link, the shared calendar); the admin keeps claymorphism.

### 8.1 Public (`production.gamostudio.org`)

| # | Route | Purpose |
| --- | --- | --- |
| A1 | `/`, `/services`, `/services/[slug]` | Marketing pages as today; every call to action leads to A2 instead of the email path |
| A2 | `/request` (steps: who you are, what you need, confirm) | The support request, split screen, area preselected from the page it came from, `?live_event=` prefill from a Live event |
| A3 | `/request/confirm` | Enter the emailed code; success shows the confirmation and the next step (for training: the Academy link) |
| A4 | `/requests/[token]` | Manage page from the emailed link: status, visible notes, add a note, withdraw, "Create an account to follow this" |
| A5 | `/request/find` | Email in, always the same answer, emails a link when there are open requests (rate limited) |
| A6 | `/technicians/apply` | Explains verification by meeting and leads to sign-in, then T1 |
| A7 | `/legal/*`, `/404`, `/500` | Client terms, provider terms (drafts, labeled), branded errors |

### 8.2 Client area (`/client/*`, signed in)

Sidebar: **Overview, Requests, Engagements, Organization** (documents live inside the request or engagement they belong to; payments inside the engagement).

| # | Route | Purpose |
| --- | --- | --- |
| B1 | `/account/signin`, `/account/signup` | Clerk through platform identity, fail closed |
| B2 | `/client/start` | First sign-in: claim the organization from a confirmed request's email, create one, or accept an invitation |
| B3 | `/client` | Overview: requests needing a reply, the next consultation, engagements waiting for acceptance or payment; every count links |
| B4 | `/client/requests`, `/client/requests/[id]` | List with status chips; detail with notes, consultation card (accept or ask for another time), recommendation card when published, documents, withdraw |
| B5 | `/client/engagements`, `/client/engagements/[id]` | List; detail with dates, positions and who is assigned (name and role), plan documents, the proposal with every line, **Accept** (`ConfirmAction` with the total), **Pay** (to Checkout), payment and refund history |
| B6 | `/client/organization` | Profile, members and invitations (owners), verification status and "Request verification" |
| B7 | `/client/settings` | Name, email, time zone, data download, deletion by email |

### 8.3 Technician area (`/technician/*`, signed in)

Sidebar: **Overview, Assignments, Availability, Profile**.

| # | Route | Purpose |
| --- | --- | --- |
| T1 | `/technician/start` | The application form in steps (split screen) ending in `submitted` |
| T2 | `/technician` | Overview: offers waiting, next call time, verification status; unverified technicians see the status card and nothing else |
| T3 | `/technician/assignments`, `/technician/assignments/[id]` | Offers (accept, decline with reason), upcoming with call sheet, completed with pay statement |
| T4 | `/technician/availability` | The shared calendar (view state in the URL) with unavailable ranges and the typical week |
| T5 | `/technician/profile` | Skills and levels, travel radius, equipment, bio; decision history; the connected account card (Mode A or payouts) with "Test mode" shown plainly |
| T6 | `/technician/settings` | As B7 |

### 8.4 Admin (`apps/admin`, Production area)

| # | Route | Purpose |
| --- | --- | --- |
| C1 | `/production` (Requests tab) | Queue with filters by status and area; open one: notes (visible or internal), schedule a consultation (shared meeting form), hand to Academy, create an engagement, close with reason |
| C2 | `/production/consultations` | Scheduled and held; mark held; write and publish the recommendation |
| C3 | `/production/engagements`, `/production/engagements/[id]` | Dates, positions with pay, offer a position to a technician (filtered by skill, radius and availability), the plan documents, the proposal builder (lines, allocation line computed, send, versions), payment record (offline with note), completion, pay approval per assignment |
| C4 | `/production/technicians` | Provider review for role `technician`: meeting, verify or decline, suspend; availability overview; the technician's connected account readiness |
| C5 | `/production/money` | Tabs: Proposals (sent, accepted, unpaid), Payments, Pay to approve, Owed per technician and payouts (prepare; sending is owner-only) |
| C6 | `/production/settings` | The Gamo allocation (fixed and percent, reason required, `ConfirmAction`), funds-flow default and overrides, decision history |
| C7 | Overview counts | Requests waiting, consultations to schedule, unfilled positions within 14 days, proposals awaiting acceptance, pay to approve |

### 8.5 Main tasks and presses

| Task | Path | Presses |
| --- | --- | --- |
| Ask for help | Area page → Start a needs assessment → step 1 → step 2 → enter code | 4 plus typing |
| Accept and pay a proposal | Email → engagement → Accept → Confirm → Pay → Stripe → back | 4 on Gamo |
| Accept an assignment | Email → assignment → Accept | 2 |
| Schedule a consultation (admin) | Overview count → request → Schedule meeting → Save | 3 plus typing |
| Fill a position (admin) | Engagement → position → Offer → pick technician → Send | 4 |

## 9. Emails (plain text first, through the platform email package; owner-approved before real sending)

Request code · Request received (manage link; for training, the Academy handoff) · Request note from Gamo · Consultation proposed / confirmed / another time requested / held · Recommendation published · Proposal sent / accepted / declined · Payment received (receipt with every line and the seller) · Engagement confirmed (dates, positions filled) · Engagement canceled (with refund where paid) · Request closed · Find my request link · Technician application received · Meeting scheduled / held / verified / changes requested / declined (technician) · Assignment offered / accepted (to the admin) / declined (to the admin) / withdrawn · Call sheet published · Pay approved / paid · Organization verified · Invitation to join an organization.

## 10. Quality bar

Same as Live and the admin: real data only; honest empty states; server-rendered pages and plain forms; CSP without inline scripts or third-party script origins (Clerk's origins on sign-in pages only); fail closed (no identity, no key, no binding means unavailable, never a fake success); identity, then same origin, then validation on every write; thin pages with one named function per page, each with a unit test; one `<h1>`, 44 px targets, axe WCAG 2.2 AA, no overflow at 360 px; split-screen pages fit one desktop screen; dashboards from floating cards with counts that link; built-worker browser checks before any deploy; designs approved by the owner before screens are built.

## 11. Build order (after approval)

1. Platform: partners package (organizations, technician profiles, verification by meeting) and identity, shared with Worship and Academy. 2. Production schema and migrations. 3. The request flow and manage page (A2 to A5), emails, outbox. 4. Client sign-in, start, organization (B1, B2, B6, B7). 5. Admin requests and consultations (C1, C2, C7). 6. Technician application, verification, availability (T1, T2, T4, T5, C4). 7. Engagements, positions, assignments, call sheets (C3, B5, T3). 8. Proposals, payment through the payments package, ledger, pay approval, payouts prepared (C5, C6). 9. Marketing calls to action switched from the email path to A2. 10. Built-worker checks, then the owner's preview deploy.

## 12. Open questions for the owner

1. **Who may ask without an account?** This draft lets anyone send a request with an emailed code and no account (like Live registration), with the client account only for following the work. Alternative: require sign-in before any request. Which?
2. **Who is the client?** Churches and ministries first; also Christian event organizers (including Live organizations) and Christian artists? Anyone else (a school, a family)?
3. **Training handoff.** Should a training request be closed in Production and sent to Academy automatically (this draft), or should Production keep it open and coordinate with Academy by hand? Should the Academy side receive a record, and if so in which database?
4. **Live link.** Should a Live organizer be able to request production support from their event page (a link into Production with the event prefilled, this draft), and should the Live event page ever show "Production support by Gamo"? Or keep the two products apart in v1?
5. **Does Gamo place technicians in v1 at all,** or is v1 consultation and guidance only (requests, meetings, recommendations, documents), with event support by Gamo's people a later phase? Placement brings pay, payouts, call sheets and no-show handling.
6. **Technicians: paid, volunteer, or both?** If both, is "volunteer" a position with $0 pay, and does the technician choose per assignment?
7. **Who pays the technician?** Mode B (Gamo collects from the church and transfers to each technician) is the natural fit; Mode A (the client pays one technician's own account) only when one person is the whole engagement. Is a technician a Stripe connected account at all, or does Gamo pay technicians outside Stripe (then the ledger records payouts but the rail is owner-run)?
8. **Worker classification.** Technicians paid through Gamo raise the contractor question counsel already has for Worship musicians (`GAMO_NONPROFIT_MODEL.md` §8, item 6). Is placement allowed before that review?
9. **The Gamo administrative allocation.** It starts at $0 and is a setting; should it be per engagement fixed, a percentage of technician lines, or both (this draft offers both, like the Live fee)? Should consultations ever carry a cost-recovery line of their own (a consultation is free in this draft)?
10. **Cancellation terms** for an accepted proposal (the client cancels a day before an event with technicians booked): full refund always, or a cancellation window chosen from offered options like Live's refund policy? Is a technician paid anything when the client cancels late?
11. **Sales tax on services** in Arizona and elsewhere: not computed in this draft (the same open question as Live tickets).
12. **Documents.** Is client upload (room photos, current input lists) in v1, or admin-shared documents only? Limits: this draft proposes 25 MB per file, images and PDF only.
13. **Technician visibility.** Does the client see assigned technicians' names before the day (this draft: name and role once accepted), and does the technician see the client's contact before accepting (this draft: organization name and city on the offer, the contact only on the call sheet)?
14. **Safety and insurance.** Does Gamo require anything from a technician (a safety acknowledgment, insurance) or from a church (ladder and rigging safety, a safety contact) before an on-site assignment? This draft requires a safety contact on each engagement and lets a technician decline unsafe work.
15. **Equipment.** Gamo sells nothing; should the recommendation ever name products or brands, or only categories and criteria?
16. **Project stories** on the marketing pages: what counts as permission from a church (a written yes recorded in the admin?), and who writes them?
17. **Database.** One Production D1 database (this draft), or Production tables inside a shared product database with Worship (both place verified people with churches on dates)? The partners and payments packages are shared either way.
18. **Admin placement.** A new **Production** area in the admin sidebar (this draft, making five areas), or Production tabs inside Community?
19. **Naming.** "Support request", "consultation", "engagement", "proposal", "assignment", "call sheet": keep these words, or do you prefer others on the public pages?
20. **Retention.** 90 days after close for personal data in requests and notes, as Live; longer for engagements with accounting records. Agree?

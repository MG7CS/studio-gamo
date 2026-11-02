# Gamo Academy: requirements (draft, 2026-11-01)

**Status: draft for the owner's approval. Nothing below is decided or built.** Written in the shape of [`LIVE_REQUIREMENTS.md`](LIVE_REQUIREMENTS.md) so Academy can reuse what Gamo Live and the admin settled: the shared dashboard shell, the split-screen commitment pages, the payment interface and ledger, meeting-based verification in the partners package, and the admin's queues. Rules that apply everywhere are in [`AGENTS.md`](../AGENTS.md) and [`SECURITY.md`](../SECURITY.md); the mission is in [`GAMO_NONPROFIT_MODEL.md`](GAMO_NONPROFIT_MODEL.md) §3.2. Where this draft says *proposal*, the owner may change it; everything the author is unsure of is in section 11, not stated as fact.

## 1. Purpose

**Anyone can learn an instrument, and anyone can learn production.** Gamo Academy offers instrument instruction (keyboard, guitar, bass, drums and percussion, vocals and other supported instruments) and **production training** (audio, video, livestream, lighting and technical setup; Gamo Production sends people here for it) to people of any age. Classes and workshops can be **sponsored by a church or any organization**; a fully sponsored class is free to the learner. Instructors are paid fairly and their pay is always a separate line from any Gamo administrative allocation. Minors learn only with a guardian's consent and under the child-safety rules. The approved headline is **"Learn to Play the Instrument You Love."**

Three experiences:

- **Learn**: a learner, or the guardian of a learner under 18, finds a class and enrolls (no account).
- **Teach**: a verified instructor runs classes, records attendance and sees what they are paid.
- **Host or sponsor**: a church or any organization offers a space for classes, sponsors a class, or both.

Gamo coordinates: it verifies instructors and organizations, reviews every class before it is published, handles enrollment and money, and keeps families and instructors informed.

## 2. What exists today

- Marketing pages (`apps/academy`): `/` (approved headline, instrument picker, learning by age, formats, how lessons work, sponsored classes, church-hosted lessons, FAQ), `/instruments`, `/instruments/[slug]`, `/lessons`, `/lessons/[slug]`, `/instructors/[slug]`, `/sponsored`, plus 404 and 500. Their lessons and instructors are **Sample** data in `apps/academy/src/data/` (fictional, labeled); the only action today is "Ask about this lesson", which goes to the web contact form.
- Legal drafts in `packages/site/src/components/legal/content/`: Academy Enrollment Terms, Guardian Consent, Child-Safety Consent (age bands, never a birth date; teachers contact the guardian, not the student; photos only with separate consent).
- In git history before `3c3ff224` (what was tried, not how things should work): guest registration with emailed manage links and an idempotent form, a Stripe test checkout path gated closed in production, and three demo dashboards (family, instructor, church host) with sample data.
- Carried forward from the rebuild plan: guest registration with emailed manage links; guardian consent and child-safety consent for under-18s; a safeguarding policy, instructor screening, guardian consent and messaging rules **before any real booking** (`SECURITY.md`).
- Platform pieces Academy builds on: Clerk sign-in through `platform/identity`, people and partner profiles and verification meetings in the platform database (partners package), the payment interface and ledger (payments package), the terms registry, the email outbox, the shared dashboard shell and split-screen layout.

## 3. Who uses the product

| Who | Account | What they are to the platform |
| --- | --- | --- |
| **Learner (18 or older)** | none; email plus signed links | a person record is created in the platform database at first enrollment (email as identity, no name on the person record) |
| **Guardian** of a learner under 18 | none; email plus signed links | the adult who enrolls, consents, pays and receives every message; the student is a first name and an age band on the enrollment, never a person record of their own |
| **Instructor** | Clerk (Academy's own Clerk application) | a partner (role instructor) verified by a meeting, with a screening status recorded by the admin |
| **Host organization** | Clerk; one or more members | a partner organization (church or any organization) verified by a meeting, offering one or more locations |
| **Sponsor organization** | Clerk; same organization record as a host when it is both | a partner organization that pays for all or part of a class |
| **Admin** | Cloudflare Access (the single admin) | verifies partners, reviews classes, prepares payouts, runs the cleanup |

Learners and guardians never need an account in v1 (*proposal*, as for Live attendees). Every partner is verified through a meeting with Gamo, by video or in person, before "Verified" appears and before they can publish or host anything.

## 4. v1 scope (proposal)

Like Live, v1 is what can be trusted end to end, nothing more.

### 4.1 Explore (public, no account)

1. **Class list** (`/lessons`): upcoming classes first, then full and past ones; filter by subject (instrument or production track), format (private, group, workshop), delivery (in person by city or metro, online), age band and level; free-text search over title, instructor and location. Every count comes from a query.
2. **Class detail**: title, subject, level, format, who it is for (age bands), instructor (verified label), schedule (the sessions, in the location's time zone), location or "online", length of the term, what you will learn, **price with its lines** (tuition to the instructor and any Gamo administrative allocation, both shown; the allocation starts at $0) or **"Sponsored by <organization>: free to the learner"**, places left, the enrollment and refund policy, guardian requirements for minors. `Course` and `Event` structured data for search engines where it fits.
3. **Subjects** (`/instruments` and `/instruments/[slug]`, plus a production track page): what first lessons cover, the classes currently open for that subject. Instruments and tracks are editorial content; the class counts are real.
4. **Instructors** (`/instructors`, `/instructors/[slug]`): only verified instructors with at least one published class; bio, subjects, formats, city; never a screening result, only the fact that Gamo verified them.
5. **Hosts and sponsors** (`/sponsored`): how sponsorship works; sponsors are named on the classes they sponsor and nowhere else unless they ask to be listed. Sponsored content is always visibly labeled.
6. **Past classes** are shown as **"Ended"**, cannot be enrolled in and sort last. Full classes say **"Full"** honestly. Only real, published classes appear; empty results say so.

### 4.2 Enroll (public, no account)

7. **Who enrolls**: an adult learner for themselves, or a guardian for a student under 18. The form asks for the student's first name and **age band** (`under_6`, `6_9`, `10_12`, `13_15`, `16_17`, `18_plus`; never a birth date), the class's level fit, and the contact email. For a minor it also asks the guardian's name and phone and requires the **Guardian Consent** and the **Child-Safety Consent** besides the Enrollment Terms. Consent boxes are never pre-ticked. A class states which age bands it accepts; the form refuses the others on the server.
8. **One form, several steps** in the split-screen design, each a server-rendered page that fits one desktop screen: student → contact and consents → review (every line) → pay or confirm. Earlier answers are kept.
9. **Confirmation by a 6-digit emailed code** before anything is held (as for Live registrations). The place is reserved by the database with a short hold (15 minutes), capacity-safe under concurrent enrollment, and confirmed only after the code (free or sponsored class) or the verified payment webhook (paid class).
10. **Paid classes**: after the code, the server reserves the place and redirects to Stripe Checkout (test mode; the local stand-in without keys); the verified webhook confirms; the browser never does. The total is shown before payment with its lines: tuition, Gamo administrative allocation if any, and nothing else. No surcharges. If payments are not configured, paid classes show "Enrollment opens soon" and the form fails closed (503), never a fake success.
11. **Confirmation email** with the details, the sessions as a calendar file, the location, what to bring, and a **signed, expiring manage link** (view, cancel within the policy, update the guardian phone, see attendance, download the receipt). "Find my enrollment" takes an email and always answers the same way.
12. **Cancel and refund**: the learner or guardian cancels from the manage link; the refund follows the class's policy (snapshotted on the enrollment at the time of enrolling: full refund until N days before the first session, then none; *proposal*). Refunds go back to the original payment method through the payment interface; sponsored places are released for the next learner.
13. **Waitlist**: not in v1 (section 4.7). A full class is "Full" and that is all.

### 4.3 Teach (instructors, signed in)

14. **Instructor sign-in with Clerk** through `platform/identity` (Academy's own Clerk application; one person can also be a Worship musician or a Production technician, but those are other products and other verifications). First sign-in creates the person record if needed and links it to the partner profile when the admin has one for that email; otherwise the person applies to teach (section 4.3.15).
15. **Apply to teach**: subjects, formats, levels, city, delivery (in person, online, both), a short bio, whether they will teach minors, acceptance of the instructor terms (draft; the provider terms with an Academy addendum). The application creates a partner profile (role instructor) with status `applied` in the platform database; the admin schedules the meeting. Nothing is public until verified.
16. **Screening for minors** (*proposal*): an instructor can be assigned to a class that accepts under-18s only when the admin recorded a screening (date, provider name, outcome "cleared", expiry). The result document is never stored; only the status. Which provider does the check is an owner decision (section 11).
17. **Propose a class**: title, subject, level, format (private: capacity 1; group: capacity 3 to 12; workshop: one or a few sessions, larger capacity), age bands accepted, delivery and location (one of a verified host's locations, the instructor's own studio recorded as a location, or online with a meeting link sent only to enrolled people), the schedule (weekly series with a start, a count and a time, or explicit dates; at most 52 sessions), the price per learner for the term (cents) or 0, the refund policy chosen from the options offered, what to bring, images with rights confirmation. The editor shows what the learner pays and what the instructor receives, with the Gamo allocation as its own line.
18. **Every class is reviewed by the admin before it is published** (*proposal*; stricter than Live's first-event rule because minors and money are involved). The instructor sees the status and the admin's note; edits to a published class that change when, where, price, capacity or age bands go back through review while the live version stays visible (Live's `event_revisions` pattern); wording changes save at once.
19. **Run a class**: roster (student first name and last initial, age band, guardian name and phone for minors, attendance), record **attendance per session** (present, absent, late), add a session note visible to the family, cancel or move a session (every enrolled family is emailed; a moved session keeps the enrollment valid and allows a refund under the policy), cancel the class (every enrollment refunded in full and emailed). The instructor never sees a learner's email; messages go through Gamo's emails.
20. **What I am paid**: per class, the enrolled count, tuition collected, the Gamo allocation, refunds, and what is owed to the instructor, read from the ledger; payout history. **Instructor pay is never reduced to fund anything else.**
21. **Account**: profile (what the public page shows), verification status and meeting details, screening status (status only), payments (connect a Stripe account or a payout account through the payment interface, "Test mode" shown plainly), own data download, deletion by email.

### 4.4 Host or sponsor (organizations, signed in)

22. **Organization sign-in with Clerk**, one organization with one or more members (owner, member), the same partners-package organization record Live uses for an organizer and Worship for a church, with an Academy role added (host, sponsor or both). A church already verified for Live or Worship is not re-verified; verification is one fact in the platform database.
23. **Offer a location**: name, address, room, capacity, what is there (piano, keyboards, PA, drum kit), accessibility notes, the windows when it is available, the site contact. Locations are reviewed with the first class that uses them (*proposal*). A class at a host location names the host on the class page.
24. **Sponsor a class**: choose a published or proposed class (or ask Gamo to create one), state what is sponsored (every place, N places, or a fixed amount), accept the sponsorship terms (draft). A fully sponsored class shows "Sponsored by <organization>: free to the learner"; a partly sponsored one shows the reduced price and the label. Sponsorship never changes who teaches, who is admitted or how classes are ordered. Payment of a sponsorship (*proposal*): recorded as a commitment with the amount, then paid through Stripe Checkout in test mode (ledger category `sponsorship`) or recorded by the admin as received outside the platform, with the date and reference; nothing is labeled paid until one of those happened. Gamo makes no tax claim about a sponsorship.
25. **What a host sees**: upcoming sessions at its locations (calendar), the classes it hosts and sponsors, **aggregate enrollment counts only** (no learner or family details; counts under 3 are suppressed in exports), its own sponsorship commitments and receipts, the organization profile and members.

### 4.5 Admin (in the existing admin app)

26. **Academy area** beside Community and Gamo Live, with tabs: **Class review** (approve, ask for changes, reject, with a note; the card shows the instructor's verification and screening status, the location's status, the price lines, the age bands), **Instructors** (applications, verification by meeting using the one shared `MeetingForm`, screening record, suspend and reinstate), **Organizations** (hosts and sponsors: verification by meeting, locations, suspend), **Enrollments** (search across classes, refunds, a cancellation on behalf of a family, the cleanup of personal data after the term), **Payments** (orders, refunds, disputes, sponsorship commitments and their payment state, what is owed to each instructor from the ledger, payouts prepared here and sent only with the owner's approval, test mode only), **Academy settings** (the Gamo administrative allocation, starting at $0, each change a recorded decision with a reason; the funds-flow default and per-partner overrides; whether classes for minors may be published at all until the safeguarding policy is approved).
27. **Overview counts**: instructor applications waiting for a meeting, classes in review, refund requests, sessions in the next 7 days at locations whose host is not yet verified; every number links to its list.

### 4.6 Trust rules (from the mission, permanent)

- Never invent classes, instructors, verified status, screening, sponsors, places left or attendance. Fictional content is labeled *Sample* and is refused by the enrollment form outside `ENVIRONMENT=local`.
- Before anyone enrolls: the instructor, the location, the full price with every line, the refund policy, and for minors the consents.
- Instructor pay and any Gamo administrative allocation are always separate line items; the allocation starts at $0 and every change is a recorded decision. No deduction from instructor pay, ever.
- Sponsorship and partnership never affect verification, who teaches, who is admitted or ordering. Sponsored content is always labeled. Free and sponsored classes stay free: no fee is ever added to a $0 enrollment.
- Gamo is a Public Benefit Corporation: never "nonprofit", "tax-exempt", "charity" or "donation" about Gamo; never a tax claim about a payment; a sponsorship names the class and the organization it comes from.
- Minors: age bands only, never a birth date or home address; the guardian is the contact, never the student; no one teaches a minor without a recorded screening and the two consents; nothing in a demo shows a minor's data.
- Sales tax on tuition is not computed (open question, as for Live).

### 4.7 Later (not in this release)

Waitlists; make-up sessions and rescheduling requests by families; choose-your-own-time private lessons (v1 private lessons are a weekly slot the instructor sets); practice materials, progress tracks, milestones and recitals; in-app messaging and free-text announcements (v1 has only the automatic session and class emails); learner or family accounts and a family dashboard; instrument lending; sliding-scale tuition and need-based support requests (section 11); multi-learner enrollment in one form (v1: one student per enrollment, repeated); scholarships funded by Gamo itself; photos or recordings of students and the separate consent for them; certificates; Apple and Google Wallet passes; QR check-in with door staff links (available from Live's domain code if a large workshop needs it); payment plans; gifts to Gamo Studios itself (legal review of Gamo as a PBC); Stripe production (owner approval, legal review of the terms, sales tax answer).

## 5. Data model (draft)

**Where it lives** (*proposal*, as for Live): a new D1 database owned by Gamo Academy (`gamo-academy-db-preview`, `gamo-academy-db-production`), binding `ACADEMY_DB` in `apps/academy` and `apps/admin`, its own migrations folder (`packages/db/academy/migrations`). People, partner profiles, organizations, memberships, verification meetings, terms acceptances and screening records live **once in the platform database** and are referenced by their platform ids; Academy's database holds only Academy records plus its own payments ledger. Conventions as in [`LIVE_DATA_MODEL.md`](LIVE_DATA_MODEL.md) §2: prefixed random ids, UTC epoch seconds with the location's IANA zone, integer cents with currency, `CHECK` enumerations, keyed email hashes, no plain secrets, no triggers.

**In the platform database (owned by the partners and identity packages, listed here for what Academy needs from them)**

| Table | Academy uses | Notes |
| --- | --- | --- |
| `people` | `id`, `email_hash`, `clerk_user_id` (null for guests) | A guardian or adult learner is a person without a name; an instructor's person carries the Clerk id. |
| `partners` | `id`, `person_id` or `organization_id`, `role` (`instructor`, `host`, `sponsor` among the roles Worship and Live use), `status` (`applied`, `meeting_scheduled`, `meeting_held`, `verified`, `declined`, `suspended`), `verified_at` | One row per person or organization and role. "Verified" is read from here only. |
| `organizations`, `memberships` | as Live | A church that hosts Academy classes and organizes Live events is one organization. |
| `verification_meetings`, `verification_decisions` | as Live, `subject_type` `partner` | One meeting form everywhere. |
| `screenings` (*proposal*, new) | `partner_id`, `kind` (`background_check`), `provider`, `cleared_at`, `expires_at`, `recorded_by` | Status only, never a result document. Required before a class for minors can be published. |
| `terms_acceptances` | `person_id` or `enrollment` context, `document`, `version` | Enrollment terms, guardian consent, child-safety consent, instructor terms, sponsorship terms, each by version. |

**Academy: catalog**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `subjects` | `id`, `slug` unique, `kind` (`instrument`, `production`), `name`, `description`, `first_steps` (JSON), `position`, `status` (`active`, `planned`) | Editorial; seeded from today's `instruments.ts` plus production tracks (audio, video and livestream, lighting, technical setup). A `planned` subject is shown as planned, with no classes. |
| `instructors` | `id` (`ins_`), `partner_id` (platform, unique), `display_name`, `slug` unique, `bio`, `city`, `state`, `subjects` (JSON slugs), `formats` (JSON), `teaches_minors` (0/1), `default_timezone`, `status` (`active`, `suspended`) | Academy-specific profile. The public page shows it only when the partner is `verified`. |
| `locations` | `id` (`loc_`), `organization_id` (platform; null for an instructor's own studio with `instructor_id` set), `name`, `room`, `address`, `city`, `state`, `metro_slug`, `timezone`, `capacity`, `equipment` (JSON), `accessibility_notes`, `contact_note`, `status` (`proposed`, `approved`, `retired`) | `online` is not a location: a class with `delivery = online` has `location_id` null and a `meeting_url` sent only to enrolled people. |
| `classes` | `id` (`cls_`), `slug` unique, `instructor_id`, `subject_id`, `title`, `description`, `outcomes` (JSON), `level` (`beginner`, `developing`, `advancing`), `format` (`private`, `group`, `workshop`), `delivery` (`in_person`, `online`), `location_id`, `meeting_url`, `timezone`, `age_bands` (JSON of accepted bands), `capacity`, `price_cents`, `currency`, `allocation_snapshot` (JSON, the Gamo allocation in force when published), `refund_policy` (`none`, `until_days_before_start`), `refund_days`, `bring_notes`, `image_key`, `image_rights_confirmed_at`, `schedule` (JSON: weekly start, count, weekday, time; or explicit dates), `sponsored_label` (computed, not stored), `status`, `published_at`, `host_organization_id` (derived from the location) | `status`: `draft`, `pending_review`, `changes_requested`, `published`, `rejected`, `canceled`, `ended`, `hidden`. A class that accepts any band below `18_plus` can be `published` only with a current screening for its instructor and an `approved` location (checked on the server at publish time, not only in the editor). |
| `class_sessions` | `id` (`ses_`), `class_id`, `starts_at`, `ends_at`, `status` (`scheduled`, `moved`, `canceled`, `held`), `note_to_families`, `attendance_recorded_at` | Expanded at save time, at most 52 rows; a moved session keeps its row and gets new times. |
| `class_revisions` | `class_id` (PK), `payload` (JSON), `created_at` | A proposed change to when, where, price, capacity or age bands of a published class, waiting for review while the live version stays. |
| `sponsorships` | `id` (`spo_`), `class_id`, `organization_id` (platform), `kind` (`all_places`, `places`, `amount`), `places`, `amount_cents`, `currency`, `status` (`proposed`, `committed`, `paid`, `recorded_offline`, `withdrawn`), `terms_version`, `committed_at`, `paid_at`, `recorded_by`, `reference` | The class page's label and the learner price are computed from committed sponsorships. Withdrawing after enrollments exist needs the admin. |

**Academy: enrollment**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `enrollments` | `id` (`enr_`), `reference` (`GA-XXXX-XXXX`), `class_id`, `person_id` (platform: the adult who enrolled), `email`, `email_hash`, `student_first_name`, `student_last_initial`, `student_age_band`, `is_minor` (derived), `guardian_name`, `guardian_phone`, `status` (`pending`, `confirmed`, `canceled`, `expired`, `refunded`), `price_cents` (what this learner paid: 0 when sponsored), `sponsorship_id`, `allocation_cents`, `policy_snapshot` (JSON), `terms_versions` (JSON), `hold_expires_at`, `confirmed_at`, `canceled_at`, `idempotency_key` unique | Unique (`class_id`, `email_hash`, `student_first_name`) among `pending`/`confirmed`. **A pending enrollment is the hold**: capacity is `UPDATE classes SET places_taken = places_taken + 1 WHERE id = :id AND (capacity IS NULL OR places_taken < capacity)`; the insert happens only when one row changed. A minor's row must carry guardian name, phone and both consents (table `CHECK`). |
| `email_codes` | `id`, `enrollment_id`, `code_hash`, `expires_at`, `attempts`, `consumed_at` | 6-digit code, 10 minutes, 5 attempts, one use (Live's table, same shape). |
| `attendance` | `session_id` + `enrollment_id` (PK), `status` (`present`, `absent`, `late`), `note`, `recorded_at`, `recorded_by` | Written by the instructor; shown on the manage page. |
| `rate_limit_counters`, `email_outbox` | as Live | The outbox comes from `platform/email`. |

**Academy: money** (the payments package's tables, instantiated for Academy)

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `orders` | `id` (`ord_`), `reference`, `enrollment_id` or `sponsorship_id`, `kind` (`tuition`, `sponsorship`), `payee_partner_id` (the instructor) or `payee` `gamo`, `funds_flow`, `seller`, `stripe_account_id`, `livemode`, `buyer_email`, `email_hash`, `currency`, `subtotal_cents` (tuition to the instructor), `allocation_cents` (Gamo), `total_cents`, `amount_refunded_cents`, `status` (`pending`, `paid`, `paid_unfulfilled`, `canceled`, `expired`, `refunded`, `partially_refunded`), `checkout_session_id`, `payment_intent_id`, `policy_snapshot`, `allocation_snapshot`, `paid_at` | The same shape as Live's orders without ticket lines; the mode, seller and allocation are snapshotted. |
| `payments`, `stripe_events`, `refunds`, `disputes` | as Live | Shared handlers from the payments package; one platform webhook endpoint per app. |
| `ledger_entries` | as Live, with `entry_type` `tuition`, `gamo_allocation`, `sponsorship`, `processing_cost`, `refund`, `allocation_refund`, `dispute`, `dispute_reversal`, `payout`; `category` `third_party_payable` (tuition owed to the instructor), `program_service_receipt` (the allocation), `sponsorship`, `processing_cost`, `refund`, `dispute`; `held_by` (`instructor`, `gamo`) | Append-only with idempotent `source_key`. Owed to an instructor = Σ `held_by = gamo` payable entries minus payouts. A sponsorship that funds places is recorded as `sponsorship` income and, per sponsored enrollment, a `tuition` payable to the instructor funded from it, so instructor pay is identical whether a learner or a sponsor paid (*proposal*; needs the accountant). |
| `payouts` | as Live, `partner_id` instead of `organization_id` | Prepared by the admin after the class's last session, sent only with the owner's approval, test mode only. |
| `payment_settings`, `partner_payments`, `allocation_settings`, `payment_decisions` | as Live's `payment_settings`, `organization_payments`, `fee_settings`, `payment_decisions` | `funds_flow_default` starts `not_chosen`: paid enrollment fails closed until the owner chooses. The allocation starts at 0 and 0. |

**Review**

| Table | Columns (key ones) | Notes |
| --- | --- | --- |
| `review_decisions` | `id`, `subject_type` (`class`, `location`, `sponsorship`), `subject_id`, `decision` (`approved`, `changes_requested`, `rejected`, `hidden`, `restored`, `recorded_paid`), `note`, `decided_at` | A decision history the instructor or host sees. Partner decisions (verified, declined, suspended) live in the platform database. |

**Rules the database enforces**: no overbooking (the conditional capacity update); past is closed (a class whose first session started accepts no enrollment; "Ended" after the last session); pending holds expire (15 minutes, released on the next enrollment attempt and by the cleanup); paid only by the webhook (`pending → confirmed` is a conditional update that also checks the amount and currency); a minor's enrollment cannot exist without guardian fields and both consents (`CHECK`); a class for minors cannot be `published` without a current screening and an approved location (a conditional update at publish time); refunds never exceed the payment.

**Privacy and retention** (*proposal*): student first names, last initials, age bands, guardian names and phones, emails and attendance notes are removed by an admin-run cleanup (which reports what it removed) 90 days after the class's last session; aggregate counts (enrolled, attended per session) are stored on the class and session before deletion; orders, amounts, references, payments, refunds, sponsorships, payouts and the ledger are kept as accounting requires. Instructors see first name, last initial, age band and attendance; hosts see counts only; the admin sees what it needs for refunds and safety. Gamo never sells or shares learner data.

## 6. Screens (draft)

Public pages keep the marketing look (approved hero and sections; changes only when the owner asks). Commitment pages (enroll, confirm, manage, apply to teach, organization set-up) use the shared `SplitScreenLayout` in steps that fit one desktop screen. Dashboards use the shared shell (collapsible sidebar, person menu at the bottom, phone tab bar) in the `design-reference/dashboard-ui/` layout with the app palette, assembled from floating cards; every number links to the list it counts. The admin keeps its claymorphism.

### 6.1 Public (no account), `academy.gamostudio.org`

| # | Route | Purpose | Notes |
| --- | --- | --- | --- |
| A1 | `/` | Home: approved headline, instrument picker, learning by age, formats, how lessons work, sponsored classes, church-hosted lessons, FAQ | Marketing page; the picker and any class counts come from the database. |
| A2 | `/instruments`, `/instruments/[slug]`, `/production` | Subjects and their open classes | `/production` is new: the production training track (audio, video and livestream, lighting, technical setup). |
| A3 | `/lessons` | Class list with filters and search; upcoming, then Full, then Ended | Query-string filters, server-rendered, real counts. |
| A4 | `/lessons/[slug]` | Class detail with the action panel: *Enroll* (places left, price lines or "Sponsored by <organization>: free"), *Full*, *Enrollment opens <date>*, *Ended*, *Canceled*, *Enrollment unavailable* (payments not configured) | Instructor card (verified label), location or online, sessions, refund policy, guardian requirements. |
| A5 | `/lessons/[slug]/enroll` | Step 1 of 3: student first name, last initial, age band; the form says when a guardian is required | Server refuses bands the class does not accept and a class that is full, past or unpublished. |
| A6 | `/lessons/[slug]/enroll/contact` | Step 2: email and confirm email; for a minor the guardian's name and phone; Enrollment Terms, and for a minor the Guardian Consent and Child-Safety Consent, each linked and never pre-ticked | Field errors all at once. |
| A7 | `/lessons/[slug]/enroll/review` | Step 3: every line (tuition to the instructor, Gamo allocation if any, sponsorship, total), the refund policy, the location and schedule; **Confirm** sends the code | Creates the pending enrollment (the hold). |
| A8 | `/lessons/[slug]/enroll/confirm` | Enter the emailed 6-digit code; a paid class then posts to **Pay** (303 to Stripe Checkout, the one response that widens `form-action`) | Wrong code (attempts left), expired (resend), locked, place lost meanwhile (honest notice). |
| A9 | `/enrollments/return/[token]` | After Checkout: "Payment received, confirming your place" (refreshes until the webhook confirms) | Canceled at Stripe: back to the class with the hold released. |
| A10 | `/enrollments/[token]` | Manage page: details, sessions with a calendar file, attendance and session notes, receipt lines, update guardian phone, cancel within the policy | Signed, expiring link; `Referrer-Policy: same-origin`; cancel uses `ConfirmAction`. |
| A11 | `/enrollments/find` | Email in, same answer always; emails the links when that address has enrollments | Rate limited. |
| A12 | `/instructors`, `/instructors/[slug]` | Verified instructors with at least one published class | Never a screening result. |
| A13 | `/sponsored` | Sponsored classes and how a church or any organization sponsors one; "Sponsor a class" leads to the organization sign-in | Marketing page, labeled. |
| A14 | `/teach` | Apply to teach: split screen in steps (subjects and formats, where and who, bio and terms), then Clerk sign-up | Creates the partner application. |
| A15 | `/api/stripe/webhook` | Stripe events for Academy orders | Shared handlers from the payments package. |
| A16 | `/404`, `/500`, `/legal/*` | Branded errors; the Academy terms and consents (drafts, labeled) | |

### 6.2 Instructor area (`/instructor/*`, Clerk)

Sidebar areas: **Overview, Classes, Calendar, Account**. The roster, attendance and sessions are reached from a class; verification, screening and payments from Account.

| # | Route | Purpose |
| --- | --- | --- |
| I1 | `/account/signin`, `/account/signup` | Clerk on an Academy-branded page; 503 notice when Clerk is not configured |
| I2 | `/instructor/start` | First sign-in: the application (if not made on `/teach`), or "waiting for your meeting with Gamo" with the meeting details |
| I3 | `/instructor` | Overview: classes needing attention (changes requested, in review), sessions in the next 7 days, attendance to record; every count links to its list |
| I4 | `/instructor/classes` | All classes with status chips (Draft, In review, Changes requested, Published, Full, Ended, Canceled) |
| I5 | `/instructor/classes/new`, `/instructor/classes/[id]/edit` | Class editor in sections: Basics · Who it is for (age bands, level) · When (weekly series or dates, time zone) · Where (a host location, own studio, online) · Price and policy (price, the two lines shown, refund policy) · Media · Review and submit; the "what is missing to publish" checklist (verification, screening for minors, approved location, payments ready) |
| I6 | `/instructor/classes/[id]` | Class page with tabs: **Overview** (status, the admin's note, places, sponsorship label), **Roster** (first name, last initial, age band, guardian phone for minors; export), **Sessions** (one card per session: record attendance, add a note, move, cancel), **Money** (tuition collected, allocation, refunds, owed to you, from the ledger). Cancel class uses `ConfirmAction` with the real numbers. |
| I7 | `/instructor/classes/[id]/sessions/[sessionId]` | Attendance recording: one row per student, present, absent or late, a note to families |
| I8 | `/instructor/calendar` | The shared `Calendar` of every session (month, week, day in the URL) |
| I9 | `/instructor/account` | Tabs: **Profile** (public page content), **Verification** (status, meeting details, screening status), **Payments** (connect or check the Stripe account or payout account, payouts, statements; "Test mode"), **Settings** (name and email from Clerk, time zone, own data, deletion by email) |

Error and edge states: not signed in → sign-in; signed in with no partner profile → `/instructor/start`; not yet verified → every page read-only with a notice naming the next step; suspended → a clear notice and read-only pages; another instructor's class → 404.

### 6.3 Host and sponsor area (`/host/*`, Clerk, member of an organization)

Sidebar areas: **Overview, Locations, Classes, Organization**.

| # | Route | Purpose |
| --- | --- | --- |
| H1 | `/host/start` | Create the organization (or accept an invitation), choose host, sponsor or both, accept the terms |
| H2 | `/host` | Overview: next sessions at your locations, classes you sponsor, counts (aggregate) |
| H3 | `/host/locations`, `/host/locations/new`, `/host/locations/[id]/edit` | Locations with status (Proposed, Approved, Retired), availability windows |
| H4 | `/host/classes` | Tabs: **Hosted** (classes at your locations, aggregate counts), **Sponsored** (your sponsorships, state, receipts) |
| H5 | `/host/classes/sponsor` | Sponsor a class: choose a class, what you sponsor, review the lines, accept the terms; pay now (Stripe Checkout, test mode) or "Gamo will record payment" |
| H6 | `/host/calendar` | Sessions at your locations (shared `Calendar`) |
| H7 | `/host/organization` | Tabs: **Profile**, **Members** (owners invite), **Verification** (status, meeting), **Payments** (receipts; no payouts to a host in v1) |

### 6.4 Admin additions (`apps/admin`)

| # | Route | Purpose |
| --- | --- | --- |
| C1 | `/academy` (Class review) | Queue of `pending_review` classes and location proposals; Approve, Ask for changes (note), Reject (note); the card shows verification, screening, location and price lines |
| C2 | `/academy/instructors`, `/academy/instructors/[id]` | Applications and instructors: schedule the meeting (shared `MeetingForm`), mark held, verify or decline with a note, record a screening (provider, date, expiry, cleared), suspend and reinstate; decision history |
| C3 | `/academy/organizations` | Hosts and sponsors: the same organization detail as Live with the Academy roles, locations and sponsorships |
| C4 | `/academy/enrollments`, `/academy/enrollments/[id]` | Search across classes; cancel on behalf of a family with a reason; refund (Mode B); resend the manage link |
| C5 | `/academy/payments` | Tabs: Orders, Refunds, Disputes, Sponsorships (commitments, record an offline payment with a reference), Not ready (instructors whose payments are not ready), Owed and payouts (prepare; sending needs the owner) |
| C6 | `/academy/settings` | Gamo allocation (fixed and percent, reason required, `ConfirmAction`), funds-flow default and per-instructor overrides, "classes for minors may be published" switch (off until the safeguarding policy is approved), decision history |
| C7 | `/academy/cleanup` | The 90-day personal-data cleanup with a report, reached from the area, not the menu |
| C8 | Overview counts | Applications waiting for a meeting, classes in review, refund requests, sessions within 7 days at unverified hosts |

### 6.5 Main tasks and presses

| Task | Path | Presses |
| --- | --- | --- |
| Enroll a child in a sponsored class | Class page → Enroll → student → Next → contact and consents → Next → Confirm → code → done | 5 on Gamo, plus typing |
| Enroll an adult in a paid class | the same, then Pay → Stripe → back to the manage page | 6 on Gamo |
| Propose a class (instructor) | Overview → New class → sections → Submit for review | about 6, plus typing |
| Record attendance | Overview "Attendance to record" → session → mark each → Save | 3 plus one per student |
| Sponsor a class (organization) | Classes → Sponsored → Sponsor a class → choose → review → Commit | 5 |
| Verify an instructor (admin) | Overview count → instructor → Schedule meeting → Save; later Mark held; Verify; Record screening | 3 + 1 + 1 + 1 |

## 7. Emails (plain text first, through Resend; owner-approved before real sending)

Enrollment code · Enrollment confirmed (details, calendar file, manage link, receipt lines, the consents accepted) · Payment received but the place was lost (refund on its way) · Enrollment canceled (by you / by the instructor / by Gamo) · Refund issued or declined · Session moved or canceled (new details, calendar file) · Class canceled (with refund) · Attendance and session note (after each recorded session, to the guardian or adult learner; *proposal*: one email per session, no digest) · Find my enrollments link · Reminder the day before a session (*proposal*) · Instructor: application received, meeting scheduled or held, verified or declined, class decision (approved, changes requested, rejected), screening recorded or expiring, payout sent · Organization: meeting scheduled or held, verified or declined, location decision, sponsorship committed, sponsorship payment recorded, receipt · Invitation to join an organization. Every email to a minor's family goes to the guardian's address only.

## 8. What the admin needs

- The **Academy area** in the admin (section 6.4) on the same shell, claymorphism, Cloudflare Access; real counts on the Overview; the shared `MeetingForm` for instructors and organizations; the shared payment screens from the Live Payments tab adapted to instructors as payees.
- **Screening records** (status only) with expiry, and the platform switch that keeps classes for minors unpublished until the owner approves the safeguarding policy.
- **Sponsorship handling**: record an offline payment with a reference and date; nothing is marked paid otherwise.
- **Decision history** on every class, location, sponsorship and partner; every settings change a recorded decision with a reason.
- **Cleanup** with a report; **payouts** prepared only, sent with the owner's approval, test mode only.
- Not needed in v1: charts, messaging, bulk email, a notifications bell.

## 9. Quality bar

Same as Live and the admin: real data only; honest empty states; server-rendered pages and plain forms (JavaScript only where it truly helps); CSP without inline scripts, Clerk's origins only on `/account/*`; fail closed (no Clerk, no payments, no secret: 503, never a fake success); identity, then same origin, then validation on every write; one `<h1>`, 44 px targets, axe WCAG 2.2 AA, no overflow at 360 px; split-screen pages fit one desktop screen at 700 and 900 px tall; dashboards checked at 1440 and 1280 px; thin pages, every orchestration function unit-tested; built-worker browser checks before any deploy; designs approved before screens are built.

## 10. Build order (after approval)

1. Platform pieces Academy depends on (identity, partners with the instructor and host roles, screenings, the payments package made product-neutral). 2. Schema and migrations, subject seed. 3. Public read pages on real data (A1 to A4, A12, A13). 4. Enrollment flow, codes, manage links, emails (A5 to A11). 5. Clerk sign-in, apply to teach, instructor area (I1 to I9). 6. Organization area (H1 to H7). 7. Paid enrollment and sponsorship payment through the payment interface, ledger, instructor statements. 8. Admin Academy area (C1 to C8). 9. Built-worker browser checks (CSP including Clerk pages, capacity race, minor consent enforcement, webhook authority), then the owner's preview deploy.

## 11. Open questions for the owner

1. **Learner accounts.** v1 keeps learners and guardians without an account (emailed codes and signed manage links, like Live attendees). Is that right, or should a family be able to sign in and see all its enrollments in one place in v1?
2. **Who creates classes.** The draft lets a verified instructor propose a class and the admin review every class before it is published. Alternatively Gamo (the admin) creates every class and assigns an instructor. Which do you want, and should the "review every class" rule relax later like Live's first-event rule?
3. **Private lessons.** v1 treats a private lesson as a class with capacity 1 and a weekly slot the instructor sets. Choose-your-own-time scheduling, rescheduling and make-ups are listed as later. Agreed?
4. **Screening provider for instructors who teach minors.** A background check needs a provider (an external service, which needs your approval) or an offline process whose outcome the admin records by hand. Which, and must a screening also be required for instructors who teach adults only?
5. **Safeguarding policy.** `SECURITY.md` requires an approved policy before any real booking involving minors. The draft keeps a platform switch ("classes for minors may be published") off until you approve the policy. Who writes the policy, and may adult-only classes launch before it?
6. **Money flow for tuition.** The draft reuses Live's two modes with the instructor as the payee: Mode A (the instructor's own Stripe account is the seller; Gamo's allocation as an application fee) or Mode B (Gamo collects and pays the instructor out). Is the instructor the right payee, or is Gamo always the seller of record for Academy (tuition as Gamo program income, instructor pay as a payable)? This changes the terms, the receipts and the accountant's view.
7. **Worker classification.** Paying instructors through Connect treats them as independent contractors. Counsel has not reviewed classification (mission doc §8, item 6). Can Academy launch with paid classes before that review, or only with free and sponsored ones?
8. **Gamo administrative allocation.** Built as its own line starting at $0 like the Live fee. Is it shown to the learner even at $0 ("Gamo allocation: $0"), or hidden until it is above 0?
9. **Sponsorship payments.** The draft lets a sponsor pay through Stripe Checkout in test mode or have the admin record an offline payment. Is a sponsorship ever paid online, or is it always an agreement settled outside the platform (then v1 only records commitments and the admin marks them paid)? Does a sponsor receive a receipt from Gamo, and what may it say (no tax claim)?
10. **Partial sponsorship.** Should v1 support "N places" and "a fixed amount" sponsorships, or only "every place, free to the learner"?
11. **Need-based support.** The marketing pages say support follows family need. A request for reduced-cost places needs a private form and a decision by the admin. In v1 or later?
12. **Pricing unit.** The draft prices a class per learner per term (one amount for the whole series). The sample data priced per session. Which unit, and are monthly ongoing lessons in v1?
13. **Refund policy options.** Proposed: full refund until N days before the first session (N chosen by the instructor from 3, 7 or 14), none after. Should a learner who leaves mid-term get a pro-rated refund?
14. **Age bands.** The draft keeps the bands from the terms drafts (`under_6`, `6_9`, `10_12`, `13_15`, `16_17`, `18_plus`). Keep them, and may a class accept `under_6` at all?
15. **Guardian presence.** Must a guardian stay on site during sessions for the youngest bands (the consent drafts only say hand-over at start and end)? This is a rule the class page should state.
16. **Instructor view of guardians.** The draft shows the instructor the guardian's name and phone for minors (for emergencies) but never an email; families are reached through Gamo's emails. Right level?
17. **Online classes.** Are online classes (meeting link sent only to enrolled people) in v1, and for minors too? The child-safety text was written for in-person rooms.
18. **Host locations.** Should a location be reviewed by the admin separately (a short form, maybe a visit), or only as part of the first class that uses it (the draft)?
19. **Hosting by an unverified organization.** Can an instructor teach in a church that has not been verified yet if the instructor is verified? The draft says no: the location must be approved and its organization verified.
20. **Production training content.** Which production tracks exist at launch (audio, video and livestream, lighting, technical setup are proposed), and who teaches them (Production's technicians as Academy instructors with their own verification)?
21. **URL naming.** The public list lives at `/lessons` today. Keep that, or rename to `/classes` with a redirect?
22. **Same organization across products.** The draft assumes one organization record (platform database) with roles per product, so a church verified for Live is verified for Academy. Confirm this is the intended meaning of "verification is built once".
23. **Retention.** Learner personal data removed 90 days after the last session, counts kept, money records kept for accounting (as Live). Agreed, and for how long must attendance records of minors be kept, if the safeguarding policy says otherwise?
24. **Messages after a session.** One email per recorded session with the attendance and note, and a reminder the day before. Too many, or fine for v1?
25. **Clerk application.** Academy gets its own Clerk application (as Live did), with keys, DNS and CSP origins from you at build time. Confirm.
26. **Database.** A new Academy-owned D1 database, created by you, as for Live. Confirm.
27. **Sales tax on tuition.** Not computed in the draft (the same open question as Live).

# Gamo Live ticketing — what was built

Design of record: [`docs/design/identity-and-ticketing.md`](design/identity-and-ticketing.md). This file describes what exists, how it behaves, and where each edge case is tested. Decisions D-150–D-171 are in [`docs/CLEANUP_LOG.md`](CLEANUP_LOG.md).

Gamo Studios is a Christian, mission-driven Public Benefit Corporation. Paid checkout is **Stripe test mode only** and **always answers 503 in production** (a code path, not configuration). All people and events in tests and fixtures are fictional and labelled _Sample_.

## 1. Flows

### Organizer: events, policies, categories

- Create at `/promote/create`, edit at `/promote/events/[id]/edit`. A plain HTML form (POST + 303) in sections: about, when and where, tickets, policies. Date and time are typed in the venue's time zone (a zone select; `zonedLocalToUtc` converts DST-safely: a time that does not exist moves forward, one that exists twice takes the earlier instant) and `start_date_local`/`start_time_local` are filled.
- Policies use `normalizeEventPolicy` (design §5.4): the defaults are shown, the bounds are spelled out, errors say what to change.
- Ticket types ("categories"): general, VIP, child (maximum age), companion (needs an accessible type), accessible, group/table (people per ticket), day pass and multi-day pass (valid dates); price in USD, capacity, per-order limit, sales window, status.
- Review: an organizer's first event goes to `pending_review`; later ones publish once an event of that organizer was approved (`first_event_approved_at`, or an earlier approved first event) unless staff set `always_review`. **Editing an approved event** that still needs review (no `first_event_approved_at`, or `always_review`) sends it back to review when anything a buyer sees changes (D-168); for verified organizers the change is recorded in `event_changes` (`details`).
- Once tickets exist, date/time/venue change only through **Event changes** (`/promote/events/[id]/changes`): reschedule and venue change keep tickets valid and email every holder with an updated `.ics` (same UID, higher SEQUENCE); cancel voids every ticket, refunds paid orders in full (test mode) and emails everyone.
- Orders and refunds: `/promote/events/[id]/orders` — per-ticket refund or cancellation (`approve_refunds`), reissue with a reason (`manage_ticketing`). Emails are masked; every action is in `audit_logs`; lookups and downloads are in `ticket_access_log`.

### Buyer: free RSVP

1. `/events/[id]/register`: one form for every ticket type (quantities per type or section), name, email + confirm email (with a typo hint, never auto-corrected), names per ticket when the policy requires them, Ticket Terms + Privacy consent (never pre-ticked), an optional unticked marketing box, Turnstile. Works without JS.
2. Server: Turnstile → per-IP and per-email limits → validation (policy bounds, per-order limit, types on sale, sales windows, companion rule, names, terms version) → expired holds swept → customer profile → **one batch**: order `pending_verification` + items + holds (triggers reserve or abort `SOLD_OUT`) + attendee names → consent rows → email with a 6-digit code and a confirm link.
3. `/tickets/confirm?t=…`: enter the code (five wrong codes per order per 30 minutes) _or_ open the link (`/link`, which confirms the order). Confirming marks the email verified and, in one batch, re-holds anything that expired, moves the order, converts holds and inserts one signed ticket per seat. Repeating it issues nothing new.
4. The answer is the same whether or not the address already has tickets (a per-event-per-email cap answers like a new order and emails "you already have tickets"). Sold out → 409 with the remaining count per type and the waitlist form.

### Buyer: paid checkout (test mode)

Same form; the primary action is "Continue to payment". `paidCheckoutMode`: production closed; `local`/`preview` need `STRIPE_TEST_CHECKOUT=true`; a real `sk_test_`/`rk_test_` key goes to Stripe; local without a key uses the **mock Stripe** (`/local-test/stripe-checkout/[session]`, where "Pay (test)" signs a `checkout.session.completed` and runs it through the real webhook handler in-process). The page asks for `form-action https://checkout.stripe.com` before the 303 (CSP). The Checkout Session has one line item per order item, `metadata.orderId`, `client_reference_id`, `customer_email`, key `checkout_<orderId>` and `expires_at = max(hold, creation + 31 min)` (Stripe allows 30 min – 24 h, verified in its API reference). The success URL is the order page, which refreshes itself ("Payment received — issuing your tickets…") until the webhook has issued the tickets.

### Webhook (`POST /api/webhook/stripe`)

Signature → test mode → claim row (`processing`; a duplicate while another delivery runs answers 409 so Stripe retries; `failed` or stale rows are reclaimed) → dispatch → `processed`/`ignored`/`failed` (+500).

| Event | Effect |
| --- | --- |
| `checkout.session.completed`, `async_payment_succeeded` | `payment_status` must be `paid`; amount and currency must equal the order; one batch re-holds if the hold expired, moves the order `paid`, converts holds, inserts the tickets and the payment record. Stock gone, or an amount mismatch → `paid_unfulfillable`, holds released, automatic test refund (or staff alert if it fails). |
| `checkout.session.expired` | holds released, order `expired`, waitlist told |
| `charge.refunded` | refunded total reconciled (only ever upward) |
| `refund.updated` | refund record status |
| `charge.dispute.created` | order `disputed`, unscanned tickets voided, staff alerted |
| anything else | recorded `ignored`, 200 |

### Tickets, downloads, manage

- `/tickets/orders/[id]`: "Save your tickets to your phone" (screenshot tip, iPhone long-press), each ticket as an image, per-ticket PDF, download-all PDF, calendar file, map link, manage link, honest email status (`sent` / `bounced` / `not_configured` …) and a spam-folder tip. The ticket is a **server-rendered SVG** shown as an `<img>`; a small island converts it to a PNG with a canvas so "Download PNG" and long-press save a PNG. Without JS the SVG and the PDF still work.
- Ticket: event, date/time with zone abbreviation, venue, gate, section, category badge, holder, order reference, large QR on white with a 4-module quiet zone, terms line "Personal ticket · no resale · first scan admits".
- QR: `GL1.<ticket>.<version>.<mac>` (design §6); the MAC covers id, version, event and a per-ticket salt, so a transfer or reissue (new version and salt) kills every old image.
- Access: only the **current holder** (customer session) sees a ticket; after a transfer the purchaser's page shows "transferred to j•••@…" without a code. A session that holds only some tickets (a transfer recipient) gets a reduced order view (D-166).
- PDFs use the standard Helvetica font, so names are reduced to the WinAnsi character set (`toWinAnsi`: accents outside it are decomposed, anything else becomes `?`). The on-screen ticket and the email show the original name. PDFs are cached in R2 (`MEDIA_BUCKET`, private, keyed `tickets/<id>@<version>.<fingerprint>.pdf`) when the binding exists and served only through the authorised route.

### Recovery, links, transfer, reissue

- `/tickets/find`: Turnstile, limits, **the same answer for every address**; an address with tickets gets a `customer:all` link (30 min). `/link?t=…` consumes the token, sets the 2-hour customer cookie and 303s to a token-free URL (`Referrer-Policy: no-referrer` on that page). Re-sends the same tickets; never new ones; lookups are in `ticket_access_log`.
- Transfer (`/tickets/[id]/transfer`): current holder only, within the order's policy snapshot (allowed, cutoff, maximum transfers, not scanned in today); new holder name and email; version bump; both people are emailed. Two transfers at once → one wins.
- Reissue: organizer/staff, reason required, version bump, holder emailed.

### Emails

Everything goes through the outbox (`email_log`, idempotency key per message). The ticket email has the manage link, an inline QR PNG per ticket (first 10, Resend `content_id`), one PDF with all tickets, the `.ics`, the map link and a plain-text part. `POST /api/webhook/resend` (Svix signature, 503 without `RESEND_WEBHOOK_SECRET`) updates statuses and suppressions. The on-screen download never depends on email.

### Door sales (for the scanner)

`issueDoorTickets(db, env, { eventId, categoryId, sectionId?, quantity, holderName?, holderEmail?, method: 'free_issue' | 'cash_recorded', amountCents, actorUserId | scannerSessionId, now })` issues in one batch an order with `source='door'`; refused unless the event policy enables door sales with that method. No card payments at the door.

## 2. Rendering choice and measurements

Server SVG + `pdf-lib` + `uqr` + a 60-line PNG encoder (`CompressionStream('deflate')`), no wasm, no fonts (design T-06).

| Item | Measurement |
| --- | --- |
| Worker server chunks (`apps/live`, `astro build`) before | 3,049,366 bytes raw · 544,249 gzip (all chunks concatenated) |
| after | 4,807,941 bytes raw · 946,136 gzip — **under 3 MB compressed** |
| SVG ticket (Node, warm) | ≈ 0.8 ms |
| QR PNG (6 px/module) | ≈ 2.6 ms |
| PDF, 2 tickets (Node, cold) | ≈ 41 ms, ≈ 5.5 KB |

PDF generation is the only CPU-heavy step; it is cached in R2 when bound. On the Workers Free plan's 10 ms CPU limit a cold PDF may not fit: use Workers Paid (or pre-render) before launch. Libraries: `uqr` 0.1.3 (MIT, no dependencies) and `pdf-lib` 1.17.1 (MIT) — local libraries, not services, pinned exactly.

## 3. State machine

```
order:  pending_verification ──code/link──▶ confirmed ──refund──▶ partially_refunded ─▶ refunded
        pending_payment ──webhook──▶ paid ─┘                       └── dispute ─▶ disputed
        (either) ──hold expiry / session expired──▶ expired ──late payment──▶ paid | paid_unfulfillable
ticket: valid ──transfer / reissue──▶ valid (version + 1) ·  valid ──▶ refunded | voided
```

## 4. Edge cases and where each is tested

| Case | Handling | Test |
| --- | --- | --- |
| Last ticket sold twice (parallel RSVPs / checkouts) | triggers abort the whole hold batch | `checkout.test.ts` "inventory races"; contract + workerd audit (12 parallel → 3 / 9) |
| Double click, same idempotency key | same order returned | `checkout.test.ts`; `security.test.ts`; `workers.mjs` |
| Webhook replay, concurrent duplicate deliveries | claim row + deterministic per-seat inserts | `checkout-webhook.test.ts` |
| Late webhook after hold expiry | re-hold if free, else `paid_unfulfillable` + refund | `checkout-webhook.test.ts` |
| Amount / currency / payment status | never fulfilled | `checkout-webhook.test.ts` |
| Partial refund | only chosen tickets; cumulative; repeat = no-op; concurrent = one wins | `checkout-webhook.test.ts` |
| Transfer race; old QR after transfer | conditional version bump; MAC no longer verifies | `checkout-webhook.test.ts` |
| Reissue | version bump, audited | `checkout-webhook.test.ts` |
| Same answer for known and unknown addresses (RSVP cap, recovery, waitlist) | uniform responses | `checkout.test.ts`; `checkout-webhook.test.ts`; `live-tickets.spec.ts` |
| Wrong codes | five per order, then use the link | `checkout.test.ts`; `live-tickets.spec.ts` |
| Closed at start; cancelled event | 409 `CLOSED`; page shows "Past · Closed" | `checkout.test.ts` |
| Event changes | notify with `.ics` update; buyer refund window | `checkout-webhook.test.ts` |
| Waitlist | earliest entries emailed when seats are released | `checkout-webhook.test.ts` |
| Review gate on edits | every public field | `checkout.test.ts` "review gate covers every public field" |
| `.ics` injection | RFC 5545 escaping + folding | `render.test.ts` |
| Order insert under workerd | migration 0015 | `workers.mjs`, journeys, `live-tickets.spec.ts` |
| Accessibility | axe WCAG 2.2 AA, one `<h1>`, no overflow at 360 px on every page of every flow | `live-tickets.spec.ts` |

## 5. Owner actions

- **Stripe test mode**: create a test key (`sk_test_…`) and a webhook endpoint `https://<live host>/api/webhook/stripe` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `charge.refunded`, `refund.updated`, `charge.dispute.created`; set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Worker secrets and `STRIPE_TEST_CHECKOUT=true` **on preview only**. Production stays closed in code.
- **Resend**: webhook `https://<live host>/api/webhook/resend` (delivered, bounced, complained, delivery_delayed, failed) → `RESEND_WEBHOOK_SECRET`.
- **Turnstile**: widget for the Live hostname → `PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`.
- **Secrets** (each ≥ 32 characters, all different): `TICKET_QR_SECRET_GL1`, `CUSTOMER_LINK_SECRET`, `PII_HASH_SECRET`, `SESSION_SECRET`. Missing outside local → ticketing answers 503.
- **R2** `MEDIA_BUCKET` (already bound) holds the cached PDFs under `tickets/`; add a lifecycle rule if wanted.
- **Staff**: the admin event approval should call `recordFirstEventApproval(db, eventId, now)` (exported from `@gamo/domain`) so the organizer becomes verified; until it does, edits to a first approved event go back to review (D-161, D-168).
- Retention jobs (`purgeRecipientEmails`, expired link tokens, rate-limit counters) are still manual (O-19).

## 6. Known gaps

- Venue blueprint selection and sections in the buyer form render sections as list rows when they exist; the clickable map is Agent C's.
- The organizer pages have no JavaScript beyond the shared form kit; extra ticket-type rows appear after a save.
- The organizer browser test needs `SESSION_SECRET` for the Live app, so CI skips it; it was run locally against `astro dev` with a throwaway `.dev.vars`.
- Admin data text still mentions the retired `/my-tickets` page (Agent A owns admin).

# Gamo Live — payments (2026-10-19)

How money moves for Gamo Live's paid tickets, online and at the door. Requirements: [`LIVE_REQUIREMENTS.md`](LIVE_REQUIREMENTS.md) §8. Tables: [`LIVE_DATA_MODEL.md`](LIVE_DATA_MODEL.md) §8. Rules: [`AGENTS.md`](../AGENTS.md) §7, [`SECURITY.md`](../SECURITY.md). Owner setup steps: [`RUNBOOK.md`](RUNBOOK.md) §7. Every Stripe detail below was checked against Stripe's documentation on 2026-10-19 (sources at the end).

**Everything runs in Stripe's test mode** until the owner approves production. No Stripe keys are configured yet; until the owner adds test keys, the code runs against a local Stripe stand-in (section 9).

## 1. One interface, two funds-flow modes

Pages and orchestration call one payment interface (`PaymentRouting` in `packages/domain/src/live/payments/`). It is chosen per order on the server from the platform default and the organization's override, and the choice is snapshotted on the order (`orders.funds_flow`, `seller`, `stripe_account_id`). Refunds, disputes and reader payments always use the account the order was charged on.

| | Mode A: organizer's own account | Mode B: Gamo collects |
| --- | --- | --- |
| Stripe pattern | Connect **direct charges**: requests carry `Stripe-Account: acct_…` | Connect **separate charges and transfers**: the charge is on Gamo's account, then `POST /v1/transfers` to the organization's connected account |
| Seller of record | The organization | Gamo Studios, on behalf of the organization |
| Who receives the money | The organization, directly | Gamo, which records what it owes and pays it out |
| Gamo fee | `payment_intent_data[application_fee_amount]` (must be less than the charge; only when the fee is above 0) | Kept from the transfer |
| Processing cost | Taken by Stripe from the organization's balance | Paid by Gamo's balance; deducted from the payout and shown on the statement |
| Refunds and disputes | On the organization's account (they reduce its balance); refunds pass `refund_application_fee=true` | On Gamo's account (Gamo's balance is debited); a later transfer reversal recovers money only if the organization's balance allows it, so payouts are made after the event (section 6) |
| Webhooks | The **Connect** endpoint (events carry a top-level `account`) | The **platform** endpoint |
| Terminal readers | Registered on the connected account (`Stripe-Account` header) | Registered on Gamo's account |
| Ready when | The connected account has `charges_enabled` | The connected account has `payouts_enabled` (it receives transfers) |

The platform default starts as **"not chosen"**: card sales (online, phone and reader) are unavailable and the editor says why. Cash and comp work in either mode. The owner chooses in the admin (Live settings). Stripe is not an escrow service and neither mode is described as escrow.

New connected accounts are created with **controller properties** (Stripe's current recommendation; the Standard/Express/Custom labels are legacy) and onboarded with an **Account Link** (`type=account_onboarding`, `refresh_url`, `return_url`; single use, expires in minutes). Gamo stores only the account id and its readiness flags (`charges_enabled`, `payouts_enabled`, `details_submitted`, the count of `requirements.currently_due`), refreshed on `account.updated` and when the owner opens the Payments page.

## 2. Prices, fees and gifts

Computed on the server, never taken from a form:

1. Unit price per ticket type: the first price deadline still ahead, else the type's price.
2. Subtotal = Σ unit price × quantity.
3. Discount (promo code): percent or amount off, only on the types it names, never below 0, spread over the lines (largest-remainder, so line discounts add up exactly).
4. **Gamo fee** per ticket = `fixed_cents + round(percent_bps × discounted unit price / 10 000)`, half-up, from the fee setting in force when the order is created (`orders.fee_snapshot`). No fee on price-0 tickets, comps, cash sales or gifts (*proposal*). **The fee starts at 0.**
5. If the event passes the fee on, the buyer pays it as its own line; if the organizer absorbs it, the buyer does not see it and it is subtracted from what the organization receives.
6. **Gift** to the organization (optional, never pre-selected), its own line.
7. Total = subtotal − discount + (fee if passed on) + gift. A database `CHECK` holds this.

No card surcharge is added for buyers (US surcharging is restricted and needs specific disclosures; open legal question, not built).

## 3. Buying online

1. The buyer chooses tickets (three server-rendered steps). On **Pay**, one D1 batch releases this date's expired holds, reserves the quantities (`ticket_inventory`, `occurrence_inventory`, `CHECK`s roll the batch back when sold out), takes a code use and inserts the order as `pending` with `hold_expires_at = now + 35 minutes`.
2. The server creates a Checkout Session (`mode=payment`, one `line_items[][price_data]` per line plus a fee line and a gift line, `customer_email`, `client_reference_id` = order id, `metadata[order_id]` on the session and `payment_intent_data[metadata][order_id]`, `expires_at = now + 31 minutes` (Stripe allows 30 minutes to 24 hours), `success_url` to the order's return page, `cancel_url` back to the event) with `Idempotency-Key: checkout_<order id>`. Mode A adds `Stripe-Account` and, when the fee is above 0, `application_fee_amount`; Mode B adds `payment_intent_data[transfer_group]=<order id>`.
3. The server answers `303` to the session URL; only that response widens CSP `form-action` to `https://checkout.stripe.com` (Chrome applies `form-action` to the redirect after a form post). Hosted Checkout needs no Stripe script and no domain registration for Apple Pay.
4. The return page never confirms anything; it refreshes until the webhook has marked the order paid.
5. On a definite Stripe error (4xx) the order is canceled and the seats freed; on a network error or 5xx the hold simply expires.

## 4. Webhooks

Endpoints: `/api/stripe/webhook` (platform, `STRIPE_WEBHOOK_SECRET`) and `/api/stripe/connect-webhook` (Connect, `STRIPE_CONNECT_WEBHOOK_SECRET`).

- **Verify:** the raw body (at most 256 KB, strict UTF-8); header `Stripe-Signature: t=…,v1=…` (several `v1` values during a secret roll; others ignored); HMAC-SHA256 of `<t>.<body>`; constant-time compare; 300 s tolerance. Then refuse `livemode=true` outside production (and `false` in production), and on the Connect endpoint require a top-level `account`.
- **Record once:** insert into `stripe_events` with a claim token (`processing`); a duplicate that is `processed` or `ignored` answers 200; one still `processing` answers 409 so Stripe retries; a stale claim (older than 5 minutes) or a `failed` one can be reclaimed. Marking checks the claim token.
- **Order of delivery is not guaranteed**: every handler is idempotent and checks the current state; an event that refers to an order not yet known (a refund before the payment) is marked `failed` and answered 500 so Stripe retries (up to three days in live mode).
- **Checks:** the order id from `metadata`/`client_reference_id` must exist, its session or PaymentIntent id must match, `amount_total` and `currency` must equal the order's, and the event's account must equal `orders.stripe_account_id`. A mismatch never issues tickets.
- **Handled:** `checkout.session.completed` (when `payment_status=paid`) and `checkout.session.async_payment_succeeded` → paid, tickets issued, ledger written, email sent; `checkout.session.async_payment_failed` and `checkout.session.expired` → seats freed; `payment_intent.succeeded` / `payment_intent.payment_failed` (readers); `terminal.reader.action_succeeded` / `terminal.reader.action_failed` (reader status); `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed` (refund records and the order's refunded amount, settled by one shared statement so the two paths never double count); `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed` (dispute record; unscanned tickets voided while open); `account.updated` (readiness flags). Anything else is recorded as `ignored` with 200.
- **Paid after the seats were lost** (the hold expired and the seats were sold): the order becomes `paid_unfulfilled`, is refunded in full automatically (`Idempotency-Key: refund_auto_<order id>`) and the buyer is emailed.

## 5. Refunds, cancellations and disputes

- The refundable amount is computed from the order's snapshot: chosen tickets' prices less their share of the discount, plus their fee when the buyer paid it; the gift only when the whole order is refunded or the organizer chooses. Two refunds racing for one ticket cannot both win (conditional updates on the ticket's status in the same batch as the refund row).
- A buyer's request (within the snapshotted policy) is a `requested` refund the organizer approves or declines; the organizer can also refund directly; in Mode B the admin can refund too.
- Stripe refunds use `payment_intent` and `Idempotency-Key: refund_<refund id>`; Mode A sends `Stripe-Account` and `refund_application_fee=true`.
- Cash refunds are recorded in the drawer with a reason.
- Canceling an event refunds every paid order in full (the existing cancel-and-notify orchestration, extended).

## 6. Ledger, reports and payouts

Every money movement is a `ledger_entries` row in signed cents with a category (from `GAMO_NONPROFIT_MODEL.md` §5.3) and `held_by` (who holds the money):

| Event | Entries |
| --- | --- |
| Online or reader sale | `ticket_sale` (+, `third_party_payable`), `gift` (+, `third_party_payable`), `gamo_fee` (+, `program_service_receipt`; when absorbed also a − `ticket_sale` adjustment of the same amount), `processing_cost` (−, from the balance transaction when known) |
| Cash sale | `cash_sale` (+, `third_party_payable`, `held_by=organization`) |
| Refund | `refund` / `gift_refund` / `fee_refund` (−) |
| Dispute | `dispute` (−), `dispute_reversal` (+) when won |
| Payout (Mode B) | `payout` (−, `held_by=gamo`) |

Mode A entries are `held_by=organization` (the money never touches Gamo; Gamo's fee arrives as an application fee). Mode B entries are `held_by=gamo`. **Owed to an organization (Mode B)** = Σ its `held_by=gamo` payable entries − processing costs − payouts. Payouts are prepared in the admin after the event's date has passed (so refunds and early disputes are settled first; *proposal*), sent with `POST /v1/transfers` (`destination`, `transfer_group`, `source_transaction` where one charge covers it) only with the owner's explicit approval, and in test mode only.

Reports and statements read the ledger only. Reconciliation lists Stripe balance transactions (`GET /v1/balance_transactions?source=…`, with `Stripe-Account` in Mode A) next to the ledger lines.

## 7. At the door

- **Cash:** no Stripe. Each selling staff link (or organizer) opens a cash session with a float; sales record cash received and change; the close records the counted amount against the expected one.
- **Buyer's phone:** the door screen creates a door order and a Checkout Session as in section 3 and shows its URL as a large QR code; the screen refreshes until the webhook confirms, then the people are admitted. Canceling a waiting sale expires the session (`POST /v1/checkout/sessions/{id}/expire`, only while `open`) and frees the seats.
- **Card reader (Stripe Terminal, server-driven):** supported smart readers are the Stripe Reader S700/S710, BBPOS WisePOS E, Stripe Reader T600 and Verifone smart readers (Stripe recommends server-driven for the S700/S710). An owner pairs a reader with its registration code (`POST /v1/terminal/readers` with `registration_code`, `location`, `label`), to a location created per organization (`POST /v1/terminal/locations`). A sale creates a PaymentIntent with `allowed_payment_method_types[]=card_present` and `capture_method=automatic`, then `POST /v1/terminal/readers/{id}/process_payment_intent`; the reader takes tap, chip, Apple Pay and Google Pay. Canceling calls `cancel_action` (not possible mid-authorization). `terminal.reader.action_succeeded`/`failed` update the screen; `payment_intent.succeeded` is the authority. Errors such as `terminal_reader_offline` and `terminal_reader_busy` are shown plainly. Testing uses Stripe's **simulated reader** (registration code `simulated-s700` or `simulated-wpe`, test mode only; `POST /v1/test_helpers/terminal/readers/{id}/present_payment_method`); wallets cannot be tested in test mode.
- **Comp:** price 0, reason required, only with the permission.
- Door sales admit the people at once (tickets created checked in). Cash and comp take no Gamo fee (*proposal*).
- **Tap to Pay on a phone** needs Stripe's iOS or Android SDK in a native app: later.

## 8. Keys and environments

| Variable | What |
| --- | --- |
| `STRIPE_SECRET_KEY` | Secret or restricted key (`sk_test_…`/`rk_test_…`). `*_live_*` keys are fatal outside production; test keys are an error in production. |
| `STRIPE_WEBHOOK_SECRET` | Platform endpoint signing secret (`whsec_…`) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect endpoint signing secret (`whsec_…`) |
| `LIVE_TICKET_SECRET` | ≥ 32 characters; keys ticket QR credentials, order links and staff-link and PIN hashes |
| `ALLOW_STRIPE_STANDIN` | `true` turns on the local stand-in; fatal outside `ENVIRONMENT=local`, ignored when `STRIPE_SECRET_KEY` is set |

No publishable key is needed: Gamo uses hosted Checkout and server-driven Terminal, so no Stripe script runs on Gamo's pages.

## 9. The local Stripe stand-in

`packages/domain/src/live/payments/standin.ts` implements the same low-level gateway as the real Stripe client: Checkout Sessions with a local "hosted" page (`/dev/stripe/checkout/<id>`: pay, decline, cancel), PaymentIntents, refunds, transfers, connected accounts that become ready after a local onboarding page, locations, readers (registration code `simulated-s700`) and `present_payment_method`. It emits the same event types as Stripe, signed with the configured webhook secret (or a fixed local one), and delivers them to the Live webhook endpoints. It runs only with `ENVIRONMENT=local` and `ALLOW_STRIPE_STANDIN=true` and no `STRIPE_SECRET_KEY` (and in the test harness). With test keys present, the real client talks to Stripe's test mode instead, with no code change.

## 10. Before real money moves (owner)

Choose the funds-flow mode; set up the Stripe account, Connect platform profile and webhook endpoints (RUNBOOK §7); legal review of the ticket and organizer terms; the sales-tax question (several states, Arizona included, tax admissions); the surcharging question (not built); an accountant's view of the ledger categories and retention; approve production keys and the first live payout.

## Sources (Stripe documentation, read 2026-10-19)

- Checkout Sessions: https://docs.stripe.com/api/checkout/sessions/create, https://docs.stripe.com/api/checkout/sessions/expire, https://docs.stripe.com/payments/checkout/custom-success-page.md?payment-ui=stripe-hosted
- Idempotency: https://docs.stripe.com/api/idempotent_requests
- Apple Pay, Google Pay, domains: https://docs.stripe.com/apple-pay.md?platform=web, https://docs.stripe.com/google-pay.md?platform=web, https://docs.stripe.com/payments/payment-methods/pmd-registration.md?dashboard-or-api=api
- CSP: https://docs.stripe.com/security/guide, https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/form-action
- Webhooks and event types: https://docs.stripe.com/webhooks, https://docs.stripe.com/api/events/types, https://docs.stripe.com/connect/webhooks
- Connect: https://docs.stripe.com/connect/direct-charges.md?platform=web&ui=stripe-hosted, https://docs.stripe.com/connect/separate-charges-and-transfers.md?platform=web&integration=checkout&ui=stripe-hosted, https://docs.stripe.com/connect/charges, https://docs.stripe.com/connect/manual-payouts, https://docs.stripe.com/connect/accounts, https://docs.stripe.com/connect/migrate-to-controller-properties, https://docs.stripe.com/api/account_links/create, https://docs.stripe.com/api/accounts/object, https://docs.stripe.com/connect/authentication
- Terminal: https://docs.stripe.com/terminal/payments/setup-integration?terminal-sdk-platform=server-driven, https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=server-driven, https://docs.stripe.com/terminal/payments/connect-reader.md?terminal-sdk-platform=server-driven&reader-type=simulated, https://docs.stripe.com/terminal/references/testing, https://docs.stripe.com/terminal/features/connect.md?connect-charge-type=direct, https://docs.stripe.com/terminal/features/connect.md?connect-charge-type=separate, https://docs.stripe.com/api/terminal/readers/create, https://docs.stripe.com/api/terminal/readers/object, https://docs.stripe.com/api/terminal/readers/present_payment_method, https://docs.stripe.com/api/terminal/readers/cancel_action, https://docs.stripe.com/api/terminal/locations/create, https://docs.stripe.com/terminal/payments/setup-reader/stripe-reader-s700-s710, https://docs.stripe.com/terminal/payments/collect-card-payment/supported-card-brands, https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay.md?platform=ios
- Keys: https://docs.stripe.com/keys
- Surcharging: https://docs.stripe.com/payments/cards/surcharge
- Balance transactions: https://docs.stripe.com/api/balance_transactions/list, https://docs.stripe.com/api/balance_transactions/object
- Tax (not used): https://docs.stripe.com/tax

Not confirmed in the documentation and handled defensively: whether expiring a session emits `checkout.session.expired` (the code frees the seats itself when staff cancel); the exact idempotency-key retention (at least 24 hours); whether Google Pay on hosted Checkout needs domain registration (it appears not).

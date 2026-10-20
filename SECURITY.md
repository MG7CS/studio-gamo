# Security, trust and safety baselines

Permanent baselines for everything built here, including the rebuild. Product-specific rules (roles, flows, data) are written per product in its requirements, not here.

## Identity and access

- Every private page, API route, webhook, action and stored file is authorized on the server, deny by default. The browser is never the authority.
- The admin is one account behind Cloudflare Access only (`AGENTS.md` §6).
- A webcam capture or uploaded photo does not prove identity or liveness. If identity verification is ever required, it comes from a specialist provider, approved by the owner; a local demo is never treated as real verification.
- **Do not collect sensitive identity documents** (government IDs, passports, driver licenses, birth certificates) or minors' records in this platform's database or storage.

## People under 18

Academy and youth programs that involve minors need an approved safeguarding policy, instructor screening, guardian consent, supervised or limited messaging and incident reporting before any real booking. Demo or sample states never show minors' data or imply screening has happened.

## Payments and money

- Stripe in test mode only until the owner approves production. Use Stripe-hosted payment surfaces (Checkout, Terminal readers); never see, store or log card numbers or CVV.
- **Keys by environment.** Live keys (`sk_live_…`, `pk_live_…`, `rk_live_…`) are refused anywhere but production; test keys are refused in production. Without keys, paid features fail closed (503). The local Stripe stand-in exists only where `ENVIRONMENT=local` (and in the test harness) and is fatal anywhere else.
- Webhooks are signature-verified (timestamp tolerance, constant-time compare), recorded once by event id and processed idempotently (claim, process, mark); amounts, currency and the connected account are checked against the order. Stripe's event state is authoritative, never a browser redirect.
- Money is integer minor units with the currency recorded. Every price, fee, discount and total shown to a buyer is computed on the server; amounts from a form are never trusted. Musician and instructor pay is never silently reduced or netted against Gamo allocations.
- **Mode safety.** The funds-flow mode (organizer's own account, or Gamo collects) is resolved on the server and snapshotted on each order; refunds, disputes and reader payments always run on the account the order was charged on, never on a re-read setting.
- **Gifts and sponsorships:** every gift names who receives it, and a gift to an organization is recorded as money owed to that organization (`third_party_payable`), never as Gamo income; Gamo makes no tax claim about any payment; each payment carries a ledger category; Gamo Studios receiving gifts for itself, and paid memberships, wait for a legal review.
- **Connect account data:** Gamo stores only the connected account id, its readiness flags and the time they were read; identity and bank details stay with Stripe (hosted onboarding). Only owners of an organization see its payments area.
- **Card readers (Stripe Terminal, server-driven):** readers are registered by an organization owner with the reader's one-time registration code, belong to one organization (on its own account in Mode A, on Gamo's in Mode B) and to one location; a reader can be renamed or removed, and payments are only ever sent to a reader that belongs to the event's organization. The server creates the card-present PaymentIntent with the amount it computed; the reader's result is confirmed by the webhook.
- **Door staff links:** event-scoped, expiring and revocable; the link token and the PIN are stored only as keyed hashes; five wrong PINs lock the link for a period; each link carries explicit permissions (check in, sell, comp) checked on every request; every sale and refund records the link that made it.
- **Cash:** cash never touches Stripe. Each selling link opens a cash session with a counted float, every cash sale and cash refund is a recorded movement (refunds need a reason), and the close records the counted amount against the expected one; nothing in a closed session can be edited.
- Never run production charges, live invoices, payouts or live connected accounts without explicit owner approval.

## Events and inventory

Ticket and seat inventory is reserved with a transactionally safe design (conditional updates in one D1 batch, not KV alone), with holds that expire with the payment session. Ticket credentials are unpredictable, versioned and invalidated on refund or transfer; scanning resists replay (first scan wins). Transfers carry no price; resale is not offered.

## Claims and legal

- Follow the wording rules in `AGENTS.md` §1 (PBC, never nonprofit or tax-exempt; no invented registrations, partners, sponsors, donors or board members).
- Terms, privacy policy, waivers and contractor agreements are drafts until counsel reviews them; never shown as final.
- No guarantees ("100% Sunday coverage", "zero failure", "guaranteed standby") unless contractually and operationally real and approved.
- Do not treat a contractor agreement as settling worker classification; background checks need consent and legal review.
- Licensed music, lyrics and chord charts are not rehosted publicly.
- Public reviews, profiles, listings and availability are shown as real only when sourced and approved; otherwise they are labeled samples.

## Engineering

- Strict TypeScript, validated input, database constraints, parameterized queries.
- Same-origin checks on every state-changing request; rate limits on sign-in, forms and webhooks.
- Secrets live in environment bindings only — never in the repository, logs, screenshots or the browser bundle.
- Logs carry error codes and non-sensitive metadata only.
- No new dependency on an external service or telemetry without owner approval.
- Tests for denial paths, races, webhook deduplication, failed payments and double scans are written with the code (run on the owner's request).

## External actions

Owner approval is required before: production deploys or DNS changes, financial transactions, paid resources, destructive data operations, messages to real recipients, account or security-policy changes, and publishing legal claims. When something is blocked, build a local adapter, document the limit and continue on independent work.

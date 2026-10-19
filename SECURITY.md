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

- Stripe in test mode only until the owner approves production. Use Stripe-hosted payment surfaces; never store card numbers or CVV.
- Webhooks are signature-verified and deduplicated; Stripe's event state is authoritative, never a browser redirect.
- Money is integer minor units with the currency recorded. Musician and instructor pay is never silently reduced or netted against Gamo allocations.
- Donation, sponsorship and membership payment processing stays off until the prerequisites in `docs/NONPROFIT_TRANSITION_CHECKLIST.md` are met.
- Never run production charges, live invoices, payouts or live connected accounts without explicit owner approval.

## Events and inventory

Ticket and seat inventory is reserved with a transactionally safe design (not KV alone). Ticket credentials are unpredictable and invalidated on refund or transfer; scanning resists replay.

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

# Gamo Studios — Security, Trust and Safety Rules

**Mandatory for all contributors and autonomous agents.** Security gates outrank speed and visual fidelity.

## Identity and access

- Server-side authN/authZ on every private route, webhook, action and storage fetch.
- Roles/scopes: visitor, student, musician applicant, approved musician, church member/director, event organizer, academy host/instructor, staff reviewer, dispatcher, finance administrator and superadmin. Define exact permissions, deny by default.
- Admin routes must additionally support Cloudflare Access or equivalent staff boundary where feasible.
- Real webcam capture does not prove a living person or a valid ID. A specialist identity verification provider must verify identity and/or liveness when required; never treat a local demo as real verification.
- Government ID images, selfies and background screening data are highly sensitive. No raw ID photographs exposed to church customers. Favor vendor tokens/results and minimal retention, encryption and narrow staff controls.
- For minors: obtain proper guardian consent and define safety rules for instructor eligibility, messaging and data handling before production Academy bookings.

## Payments / financial compliance

- Stripe Connect is not blanket escrow. Select a Stripe-supported charge and payout model after verification of legal entity, geographic availability, connected account obligations and current Stripe docs.
- PCI scope minimization: use Stripe-hosted/payment element surfaces; never store PAN/CVV.
- Verify and deduplicate Stripe webhooks; treat Stripe event states as authoritative, not browser success redirects.
- Explicit ledgers for customer payments, refunds, administrative allocations, contributions, sponsorships, standby retainers, musician/instructor payouts, organizer proceeds and disputes. Money in integer minor units, currency recorded; reconciliation required. Categories follow [docs/GAMO_NONPROFIT_MODEL.md §5.3](docs/GAMO_NONPROFIT_MODEL.md#53-money-categories-the-platform-must-distinguish).
- Musician and instructor pay must never be silently reduced or netted against Gamo allocations; any deduction requires an approved policy, documented consent and legal review.
- Never invoke production charges, send live invoices, start external payouts, or set up live connected accounts without explicit owner approval.
- **Donation, sponsorship and membership payment processing is disabled** until nonprofit formation, tax-exempt recognition (or counsel-approved interim approach) and counsel-reviewed acknowledgment language exist.

## Operational reliability

- Paid understudy standby is an agreement with terms, time window, compensation, radius and explicit acceptance.
- Sunday dispatch must withstand duplicate notifications, retries, simultaneous backup acceptances and network failures; have human escalation and incident audit.
- '100% Sunday attendance' / 'zero failure' / 'guaranteed understudy' statements are prohibited until contractual and operational capability is actually established and approved.
- Maps and geolocation show estimates; cannot substitute for actual location confirmation or arrival proof.

## Events and inventory

- Lock seat/tier inventory with transactionally safe reservation authority (Durable Objects or another well-justified serialized design). KV alone is not concurrency control.
- Ticket credentials must be unpredictable and invalidated on refund/transfer if supported; QR scanner needs scoped staff role and replay-resistant admission.

## Legal/compliance

- Do not assume a 1099 contract determines legal worker classification; obtain jurisdiction-specific professional review.
- Background checks require consent and applicable law compliance; do not instantiate automatic adverse action without safeguards.
- Music/lyrics/chord charts may be licensed; avoid public rehosting; enforce access and takedown path.
- Treat all public example reviews, gig availability, profiles, clients and event listings as demo unless sourced and approved.
- Terms, privacy policy, waivers, refund policy and independent-contractor agreements are legal drafts until counsel review; no fake 'approved' status.

## Legal structure, tax status and fundraising claims

- Gamo Studios is a **Christian, mission-driven organization** whose **final legal incorporation structure and tax status remain undecided** (legal-structure-neutral). Never state or imply 501(c)(3) recognition, IRS approval, tax-deductibility, state charitable registration, an EIN or any registration number until confirmed by the owner with evidence.
- Never name churches, sponsors, foundations, donors or board members as committed unless a signed agreement or documented consent exists.
- Do not describe mandatory fees or deductions as donations. Payments where the payer receives substantial goods or services are not presented as charitable gifts.
- Do not assume program fees, ticketing fees, promotion or production services are tax-exempt income; flag for accountant/tax review.
- Executive compensation and related-party transactions require independent approval and conflict-of-interest documentation; agents never implement compensation logic that bypasses this.

## Events trust

- Ticket sales only for organizers with recorded authorization; verified-organizer badges only after a staff verification decision.
- Gamo Live accepts Christian events per the approved content policy; moderation decisions are audited.

## Safeguarding & Sensitive Document Prohibition

- **Do not collect sensitive student or identity documents** (e.g., government IDs, passports, driver licenses, birth certificates, or minor student records) in application endpoints, D1 tables, or R2 buckets.
- Academy and youth programs involving minors require an approved safeguarding policy, instructor screening, guardian consent, supervised/limited messaging and incident reporting before any real booking. Demo states must never display minors' data or imply screening has occurred.

## Engineering requirements

- TypeScript strict, validated input schemas, DB constraints, parameterized queries, rate limits on auth/webhooks/application, CSRF where applicable and controlled CORS.
- Secrets in environment bindings; never repo, logs, screenshots or browser bundle.
- Audit trails for vetting decisions, payout changes, permissions and emergency dispatch. Limit logs to non-sensitive metadata.
- Dependency review, minimum permissions and no unapproved external telemetry/vendor integrations.
- Require tests for auth denial, race conditions, webhook deduplication, failed payment, backup dispatch and ticket double scan.

## External-action policy for agents

Agents may install approved open-source packages, run local tests, seed local demo data and create local Git commits. **Agents must request owner approval before:** production deployment/DNS, financial transactions, paid resources/subscriptions, destructive data operations, user communications to real recipients, account/security-policy changes, or publishing legal claims. When blocked, create a sandbox adapter, document the limitation and continue on independent work.

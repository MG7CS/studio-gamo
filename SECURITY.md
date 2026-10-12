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
- Explicit ledgers for customer payments, refunds, commissions, standby retainers, performance payouts and disputes. Money in integer minor units, currency recorded; reconciliation required.
- Never invoke production charges, send live invoices, start external payouts, or set up live connected accounts without explicit owner approval.

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

## Engineering requirements

- TypeScript strict, validated input schemas, DB constraints, parameterized queries, rate limits on auth/webhooks/application, CSRF where applicable and controlled CORS.
- Secrets in environment bindings; never repo, logs, screenshots or browser bundle.
- Audit trails for vetting decisions, payout changes, permissions and emergency dispatch. Limit logs to non-sensitive metadata.
- Dependency review, minimum permissions and no unapproved external telemetry/vendor integrations.
- Require tests for auth denial, race conditions, webhook deduplication, failed payment, backup dispatch and ticket double scan.

## External-action policy for agents

Agents may install approved open-source packages, run local tests, seed local demo data and create local Git commits. **Agents must request owner approval before:** production deployment/DNS, financial transactions, paid resources/subscriptions, destructive data operations, user communications to real recipients, account/security-policy changes, or publishing legal claims. When blocked, create a sandbox adapter, document the limitation and continue on independent work.

# Gamo Studios

**A trusted music, worship staffing, education, live events, and production platform.**

> Product name: **Gamo Studios** · Repository: `studio-gamo` · Primary domain: `gamostudios.com` · Initial service area: Phoenix metropolitan area, Arizona.

## Mission

Make worship staffing dependable. Help churches find qualified musicians, give musicians reliable opportunities, expand access to music education, enable Christian live events, and support audio/visual production.

**Differentiator:** a vetted local musician roster with paid standby understudies and a practical dispatch workflow. This is not a generic gig board or a chatbot.

## Applications

| Host | Purpose | Initial priority |
| --- | --- | --- |
| `gamostudios.com` | Global brand, account access, legal pages, routing | P0 |
| `worship.gamostudios.com` | Applications, church hiring, gigs, musician standby, dispatch | P0 |
| `admin.gamostudios.com` | Private staff vetting, decisions, bookings, live incidents | P0 |
| `academy.gamostudios.com` | Instructors, lessons, church-hosted clinics | P1 |
| `live.gamostudios.com` | Event discovery, tickets, organizer tools, scanning | P2 |
| `production.gamostudios.com` | A/V services, portfolio, consultation | P2 |

These are product domains, not a requirement to deploy six separate Workers immediately. All share the same visual identity and governed identity/access model.

## Audiences

1. Churches and worship directors looking for planned and emergency staffing.
2. Auditioned musicians seeking primary or paid standby opportunities.
3. Students, families, and partner church facilities seeking music education.
4. Event organizers and concert attendees.
5. Churches seeking A/V and production services.
6. Authorized internal staff.

## Experience principles

- Rich, realistic photography and visual hierarchy; low text density.
- Trust is demonstrated through real vetting and transparent statuses, never invented numbers or testimonials.
- Mobile-first operational flows; time-critical Sunday dispatch must be exceptionally clear.
- Minimal account friction without compromising identity, payments, or safeguarding.
- Interfaces must work without externally provisioned secrets using documented local mocks; never pretend live payments or identity checks succeeded.

## Technology choices

- Astro SSR on Cloudflare Workers, TypeScript strict mode, Tailwind CSS.
- Cloudflare D1 for relational application state; R2 for authorized object storage; Durable Objects where reservation/dispatch coordination requires strong serialization; optional Queues for reliable jobs.
- Stripe Checkout/Elements and Stripe Connect for supported customer payment, account onboarding and payouts.
- Resend for transactional email; no SMS provider without explicit approval.
- Shared auth backed by secure sessions and a vetted Cloudflare-compatible auth implementation (evaluate options before committing).
- Testing: unit, integration, end-to-end/browser and accessibility checks.

**Never implement 'Stripe escrow', atomic seat locks using KV alone, or public access to a musician's legal ID.** Refer to [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md).

## Source of truth

Read in this order:

1. [AGENTS.md](AGENTS.md) — mandatory agent operating instructions.
2. [ARCHITECTURE.md](ARCHITECTURE.md) — app boundaries, data, services, integrations.
3. [DESIGN.md](DESIGN.md) — visual direction, components, responsive rules.
4. [SECURITY.md](SECURITY.md) — trust, privacy, compliance and hard gates.
5. [ROADMAP.md](ROADMAP.md) — milestones, evidence and acceptance criteria.
6. [prompts/ANTIGRAVITY_MASTER_PROMPT.md](prompts/ANTIGRAVITY_MASTER_PROMPT.md) — execution kickoff.

## Getting started (after agents scaffold the project)

This repository begins **documentation-first**. The development agent must scaffold the application without deleting these files. After scaffolding, update this section with actual verified commands for install, local dev, tests, type-check, database migrations and deployment previews. Never document commands that have not been verified.

Local configuration goes in `.dev.vars` or other current Wrangler-compatible local secret files, excluded from git. Create `.dev.vars.example` with variable names only. Do not commit API keys or account identifiers.

## Non-goals for the first production milestone

- A nationwide, fully launched ticketing and academy marketplace.
- Live background-check vendor integration without a contract and review.
- Unconditional 100% staffing coverage guarantees.
- Real payment capture or payouts without approved Stripe configuration and legal review.
- Deploying production domains, changing DNS, incurring charges, or sending emails to real customers without user approval.

## Ownership of decisions

Product requirements in this repository are approved direction; any feature marked *proposed*, especially rates, guarantees, compliance paths or provider choices, must not silently become a public contractual claim. If blocked by an external service, implement a safe demonstrable local adapter, record the blocker and continue elsewhere.

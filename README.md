# Gamo Studios

**A trusted music, worship staffing, education, live events, and production platform.**

> Product name: **Gamo Studios** · Repository: `studio-gamo` · Primary domain: `gamostudios.com` · Initial service area: Phoenix metropolitan area, Arizona.

## Mission

Make worship staffing dependable. Help churches find qualified musicians, give musicians reliable opportunities, expand access to music education, enable Christian live events, and support audio/visual production.

**Differentiator:** a vetted local musician roster with paid standby understudies and a practical dispatch workflow. This is not a generic gig board or a chatbot.

**Ecosystem showcase:** the global homepage is a continuously refreshed, editorially curated showcase of events, lessons, musicians and Gamo services. "Keep Worship Going" remains the permanent brand message. See [docs/GAMO_LIVE_AND_PARTNERS.md](docs/GAMO_LIVE_AND_PARTNERS.md).

## Applications

| Host | Purpose | Initial priority |
| --- | --- | --- |
| `gamostudios.com` | Global brand, dynamic ecosystem showcase, Church Partners discovery, account access, legal pages, routing | P0 |
| `worship.gamostudios.com` | Applications, church hiring, gigs, musician standby, dispatch | P0 |
| `admin.gamostudios.com` | Private staff vetting, decisions, bookings, live incidents, event moderation, campaigns, placements, memberships | P0 |
| `academy.gamostudios.com` | Instructors, lessons, church-hosted clinics | P1 |
| `live.gamostudios.com` | Two-sided events platform: organizers promote events (managed advertising) and sell tickets/registrations; attendees discover and attend | P2 |
| `production.gamostudios.com` | A/V services, portfolio, consultation, optional promotional creative & event marketing | P2 |

These are product domains, not a requirement to deploy six separate Workers immediately. All share the same visual identity and governed identity/access model.

## Business model (proposed — no prices finalized)

- **Worship / Academy / Production:** service and platform fees.
- **Event promotion (Gamo Live):** managed campaign fees, advertising packages, optional creative; media budgets kept separate from Gamo fees.
- **Ticketing (Gamo Live):** transparent platform fees on paid tickets via Stripe Connect; free listings/registrations under defined policy.
- **Gamo Church Partners:** recurring church membership with advertising credits, featured placements and preferential pricing across Gamo services. Sponsored content is always labeled; advertising never affects musician vetting or rankings; booking discounts come from Gamo fees, never musician pay.

## Audiences

1. Churches and worship directors looking for planned and emergency staffing.
2. Auditioned musicians seeking primary or paid standby opportunities.
3. Students, families, and partner church facilities seeking music education.
4. Event organizers (churches, gospel artists, choirs, promoters) seeking promotion and ticketing.
5. Event attendees discovering concerts, worship nights and community events.
6. Churches seeking A/V and production services, and churches joining Gamo Church Partners.
7. Authorized internal staff.

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

## Getting started

This repository uses a root `Makefile` to simplify common development commands. 
Run `make help` to see all available commands.

**Common Commands:**
- `make dev` — Start the global website development server.
- `make build` — Build the monorepo projects.
- `make check` — Run TypeScript type-checking.
- `make images` — Optimize new images using the optimization pipeline.

Local configuration goes in `.dev.vars` or other current Wrangler-compatible local secret files, excluded from git. Create `.dev.vars.example` with variable names only. Do not commit API keys or account identifiers.

## Non-goals for the first production milestone

- A nationwide, fully launched ticketing and academy marketplace.
- Live background-check vendor integration without a contract and review.
- Unconditional 100% staffing coverage guarantees.
- Real payment capture or payouts without approved Stripe configuration and legal review.
- Deploying production domains, changing DNS, incurring charges, or sending emails to real customers without user approval.

## Ownership of decisions

Product requirements in this repository are approved direction; any feature marked *proposed*, especially rates, guarantees, compliance paths or provider choices, must not silently become a public contractual claim. If blocked by an external service, implement a safe demonstrable local adapter, record the blocker and continue elsewhere.

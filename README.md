# Gamo Studios

**A proposed Christian nonprofit strengthening worship and community through musical talent, music education, Christian events and shared technical resources.**

> Organization: **Gamo Studios** · Repository: `studio-gamo` · Primary domain: `gamostudio.org` · Initial service area: Phoenix metropolitan area, Arizona (Gamo Live events: nationwide Christian events).

> [!IMPORTANT]
> Gamo Studios is a **developing** nonprofit. It is not yet incorporated as a nonprofit corporation and has not received 501(c)(3) recognition; contributions are not tax-deductible. The authoritative organizational reference is **[docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md)**. Formation work is tracked in [docs/NONPROFIT_TRANSITION_CHECKLIST.md](docs/NONPROFIT_TRANSITION_CHECKLIST.md).

## Mission (proposed working statement)

**Gamo Studios strengthens Christian worship and communities by developing musical talent, connecting churches with skilled musicians, expanding access to music education, and helping people discover and participate in Christian events.**

Our purpose is religious and educational service, not maximizing financial returns. We are building a Christian nonprofit and its supporting software infrastructure — not a commercial startup.

**Distinctive strength:** a vetted local musician network with paid standby musicians and a practical coordination workflow, so churches can keep worship going. This is not a generic gig board or a chatbot.

**Homepage:** a continuously refreshed window into the mission — worship coverage, music education, Christian events, production support and church partnerships. "Keep Worship Going" remains the permanent brand message. See [docs/GAMO_LIVE_AND_PARTNERS.md](docs/GAMO_LIVE_AND_PARTNERS.md).

## Programs and applications

The applications are **connected programs of one nonprofit mission**, not independent profit centers.

| Host | Program purpose | Initial priority |
| --- | --- | --- |
| `gamostudio.org` | Organization hub: mission, programs, church partnerships, support pathways, account access, legal pages | P0 |
| `worship.gamostudio.org` | **Gamo Worship** — musician applications and auditions, church requests, recurring and Sunday coverage, standby, coordination | P0 |
| `admin.gamostudio.org` | Governance and staff operations: vetting, scheduling, event moderation, program administration, financial accountability, reporting | P0 |
| `academy.gamostudio.org` | **Gamo Academy** — instrument lessons for children, teens, adults and families; church-hosted and sponsored classes | P1 |
| `live.gamostudio.org` | **Gamo Live** — Christian events nationwide: *Promote Event* (organizers) and *Explore Events* (attendees); free registration and authorized ticketing | P2 |
| `production.gamostudio.org` | **Gamo Production** — worship audio, livestreaming, lighting, technical training and event creative for churches and ministries | P2 |

These are product domains deployed as six Cloudflare Workers under `gamostudio.org`. All share the same visual identity and governed identity/access model.

## Sustainability (proposed — no fees, contributions or prices approved)

Gamo aims for **financial sustainability in service of the mission**. Potential sources include donations, church contributions, supporting memberships, program sponsorships, grants, in-kind gifts, Academy cost-sharing, modest administrative allocations on facilitated musician engagements, ticketing/registration administration fees and production cost recovery. Musicians' agreed pay is always kept separate from any Gamo allocation, and partnership or payment never influences vetting or rankings. Full detail: [docs/GAMO_NONPROFIT_MODEL.md §5](docs/GAMO_NONPROFIT_MODEL.md#5-organizational-sustainability).

## Audiences

1. Churches and ministries seeking dependable worship musicians, including emergency coverage.
2. Musicians seeking to serve, grow and be fairly paid as lead or standby musicians.
3. Students, parents and families seeking instrument lessons (primary Academy audience).
4. Christian artists and event organizers sharing events with the community.
5. Individuals and families discovering Christian events.
6. Churches seeking technical support, and churches interested in partnering to support shared programs.
7. Donors, sponsors, foundations and community partners (support pathways planned; no donation processing yet).
8. Authorized internal staff and the governing board.

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

1. [docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md) — **organizational purpose, programs, governance, sustainability (authoritative)**.
2. [AGENTS.md](AGENTS.md) — mandatory agent operating instructions.
3. [ARCHITECTURE.md](ARCHITECTURE.md) — app boundaries, data, services, integrations.
4. [DESIGN.md](DESIGN.md) — visual direction, components, responsive rules.
5. [SECURITY.md](SECURITY.md) — trust, privacy, compliance and hard gates.
6. [ROADMAP.md](ROADMAP.md) — mission-aligned milestones, evidence and acceptance criteria.
7. [prompts/MASTER-PROMPT.md](prompts/MASTER-PROMPT.md) — founder's nonprofit transformation instructions (2026-10-12).

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

- A nationwide, fully launched ticketing and Academy platform.
- Donation, sponsorship or membership payment processing before nonprofit formation, recognition and counsel-reviewed acknowledgments.
- Any public claim of 501(c)(3) status or tax-deductibility before it is confirmed.
- Live background-check vendor integration without a contract and review.
- Unconditional 100% staffing coverage guarantees.
- Real payment capture or payouts without approved Stripe configuration and legal review.
- Deploying production domains, changing DNS, incurring charges, or sending emails to real customers without user approval.

## Ownership of decisions

Product requirements in this repository are approved direction; any feature marked *proposed*, especially fees, contributions, guarantees, compliance paths or provider choices, must not silently become a public contractual claim. Decisions requiring board, legal, tax or founder approval are listed in [docs/GAMO_NONPROFIT_MODEL.md §8](docs/GAMO_NONPROFIT_MODEL.md#8-decisions-requiring-approval). If blocked by an external service, implement a safe demonstrable local adapter, record the blocker and continue elsewhere.

# Gamo Studios Architecture Decisions

## Milestone 0 Decisions
- **Monorepo Structure**: using `pnpm` workspaces. This provides native workspace resolution and avoids conflicts, keeping deployables separated while sharing domain models.
- **Framework**: Astro SSR on Cloudflare Workers for all applications.
- **Styling**: Tailwind CSS for rapid styling matching the design tokens.
- **Authentication Strategy**: Custom implementation using HttpOnly/Secure cookies backed by Cloudflare D1. Heavy third-party auth services (like Auth0 or Supabase Auth) often have friction with Cloudflare Workers' Edge environment or add significant bundle sizes. Since user identity and verification are crucial (M1), owning the auth model in D1 keeps us within our strict boundaries. 

## 2026-10-12 — Gamo Live, Church Partners & dynamic homepage
> **Partially superseded** by the nonprofit decision below. Items marked ~~struck~~ no longer apply; remaining items stay in force.
- **Gamo Live is two-sided** (Promote Event for organizers, Explore Events for attendees). Detailed in `docs/GAMO_LIVE_AND_PARTNERS.md`.
- **Promotion starts as a managed service.** Staff run campaigns; no ad-platform APIs are assumed or connected. Future integrations go behind `packages/integrations` adapters with explicit approval.
- ~~**Money separation:** media spend, Gamo service fees and ticket proceeds are distinct ledger categories.~~ → replaced by nonprofit ledger categories (below). Stripe Connect remains the payout rail; no "escrow" claims (still in force).
- ~~**Gamo Church Partners** is a proposed recurring membership with advertising credits and discounts.~~ → redefined as a mission partnership network. Free participation without partnership remains in force.
- **Integrity:** sponsored placements always labeled; payment/advertising/partnership cannot influence musician vetting/rankings (separate domain, no cross-access); musician pay never reduced to fund partner benefits.
- **Dynamic hero:** "Keep Worship Going" stays as brand message. ~~Hero becomes a placement-driven rotating spotlight.~~ → a rotating spotlight is now a *future option* that **requires explicit approval** before implementation.
- **No new providers:** stack remains Astro, Cloudflare, Stripe Connect, Resend.
- **Homepage pills** (How It Works, Gamo Live) implemented as small vanilla-JS accessible tablists rather than framework islands.

## 2026-10-12 — Gamo Studios becomes a proposed Christian nonprofit (governing decision)
- **Decision (founder):** Gamo Studios is restructured as a proposed Christian nonprofit dedicated to religious, educational and community-serving purposes, intended as an Arizona nonprofit corporation seeking 501(c)(3) recognition. This **supersedes** the commercial business model (commission maximization, advertising revenue, commercial subscriptions, separate profit-center verticals).
- **Source of truth:** `docs/GAMO_NONPROFIT_MODEL.md`. Legal/governance dependencies: `docs/NONPROFIT_TRANSITION_CHECKLIST.md`. Other documents link rather than restate.
- **Programs retained:** Worship, Academy, Live, Production and Admin apps and all technical decisions are kept; they are reframed as connected nonprofit programs.
- **Gamo Worship:** fair musician pay; any Gamo administrative allocation is modest, transparent, separate from musician pay and **not implemented** until mechanism, consent, classification and legal review are complete.
- **Gamo Academy:** principal educational program; primary audience students and families; approved headline "Learn to Play the Instrument You Love."
- **Gamo Live:** Christian events nationwide, eligibility not defined by ethnicity or nationality; tickets only for authorized organizers; promotion is an optional, labeled service.
- **Church partnerships:** mission network; no mandatory tiers/prices; no pay-to-win.
- **Financial architecture:** ledger categories `charitable_contribution`, `sponsorship`, `program_service_receipt`, `third_party_payable`, `processing_cost`, refund/dispute, with `program` and `fund_id` dimensions. Replaces `media_spend | service_fee | ticket_proceeds`.
- **Placement kinds:** `sponsored | editorial | gamo_program` (renamed from `gamo_service`).
- **Roadmap:** reordered around ten mission-aligned priorities; donations/funding infrastructure blocked on legal prerequisites.
- **Public status wording:** "a developing Christian nonprofit initiative; incorporation and federal tax-exempt recognition are pending; contributions are not currently tax-deductible."
- **Open question for counsel (not decided):** whether an interim fiscal-sponsorship arrangement is appropriate while formation and recognition are pending.

## 2026-10-12 — Favicons and domain under consideration

- **Favicon:** all six apps use the official standalone waveform symbol (`design-reference/branding/svg/gamo-studios-symbol-*.svg`), geometry unchanged, viewBox tightened for 16/32px legibility. `favicon.svg` uses rust `#BE5B32` and switches to the official cream `#F6EFE4` variant under `prefers-color-scheme: dark`. PNG/ICO variants use rust on transparent; the Apple touch icon uses rust on cream (iOS ignores transparency). Regenerate with `node scripts/generate-favicons.mjs`. Default Astro starter favicons removed.
- **Domain:** the founder owns `gogamostudio.org`, which is **under consideration only**. No production domain, DNS, canonical URL or redirect changes until the exact intended canonical domain is approved by the founder.

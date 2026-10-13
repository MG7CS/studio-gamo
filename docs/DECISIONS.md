# Gamo Studios Architecture Decisions

## Milestone 0 Decisions
- **Monorepo Structure**: using `pnpm` workspaces. This provides native workspace resolution and avoids conflicts, keeping deployables separated while sharing domain models.
- **Framework**: Astro SSR on Cloudflare Workers for all applications.
- **Styling**: Tailwind CSS for rapid styling matching the design tokens.
- **Authentication Strategy**: Custom implementation using HttpOnly/Secure cookies backed by Cloudflare D1. Heavy third-party auth services (like Auth0 or Supabase Auth) often have friction with Cloudflare Workers' Edge environment or add significant bundle sizes. Since user identity and verification are crucial (M1), owning the auth model in D1 keeps us within our strict boundaries. 

## 2026-10-12 — Gamo Live, Church Partners & dynamic homepage
- **Gamo Live is two-sided** (Promote Events for organizers, Explore Events for attendees). Detailed in `docs/GAMO_LIVE_AND_PARTNERS.md`, the single source of truth for this model.
- **Advertising starts as a managed service.** Staff run campaigns; no ad-platform APIs are assumed or connected. Future integrations go behind `packages/integrations` adapters with explicit approval.
- **Money separation:** media spend, Gamo service fees and ticket proceeds are distinct ledger categories. Stripe Connect is the payout rail; no "escrow" claims.
- **Gamo Church Partners** is a proposed recurring membership; free event listings remain available without it. All pricing is proposed.
- **Integrity:** sponsored placements always labeled; advertising cannot influence musician vetting/rankings (separate domain, no cross-access); Partner discounts come from Gamo fees only.
- **Dynamic hero:** "Keep Worship Going" stays as brand message; hero becomes a placement-driven rotating spotlight (8–10 s, pausable, reduced-motion safe). Design phase uses static labeled example slides; no promotion engine yet.
- **No new providers:** stack remains Astro, Cloudflare, Stripe Connect, Resend.
- **Homepage pills** (How It Works, Gamo Live) implemented as small vanilla-JS accessible tablists rather than framework islands.

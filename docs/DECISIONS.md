# Architecture Decision Log

Create entries with date, status (`proposed`, `accepted`, `superseded`), decision, reason, alternatives and consequence.

## Initial decisions — proposed

- **Brand:** Gamo Studios; repo `studio-gamo`.
- **Runtime:** Astro SSR on Cloudflare Workers.
- **Database:** D1 for relational core; DO when consistent per-resource coordination is required.
- **Payments:** Stripe Connect, test mode first; no escrow assumption.
- **Email:** Resend server-side, local fallback.
- **Typography:** Inter; brand colors terracotta `#B65B35`, charcoal `#1D2323`, cream `#F4EDE3`.
- **Architecture:** one monorepo, logically independent domain verticals.

Document auth provider, migration framework, local deployment shape and routing before irreversible implementation choices.

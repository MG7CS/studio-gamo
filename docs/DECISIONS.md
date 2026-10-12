# Gamo Studios Architecture Decisions

## Milestone 0 Decisions
- **Monorepo Structure**: using `pnpm` workspaces. This provides native workspace resolution and avoids conflicts, keeping deployables separated while sharing domain models.
- **Framework**: Astro SSR on Cloudflare Workers for all applications.
- **Styling**: Tailwind CSS for rapid styling matching the design tokens.
- **Authentication Strategy**: Custom implementation using HttpOnly/Secure cookies backed by Cloudflare D1. Heavy third-party auth services (like Auth0 or Supabase Auth) often have friction with Cloudflare Workers' Edge environment or add significant bundle sizes. Since user identity and verification are crucial (M1), owning the auth model in D1 keeps us within our strict boundaries. 

# Architecture (as of 2026-10-19)

How the repository is organized today, during the rebuild ([`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md)). Sections marked **being replaced** describe old code that the rebuild removes; do not extend it.

## Apps

Six Astro apps (server output, `@astrojs/cloudflare`), one Cloudflare Worker each. Hosts and local ports are defined once in `packages/config/apps.ts`.

| App | Worker (production / preview) | Kept | Being replaced |
| --- | --- | --- | --- |
| `apps/web` | `gamo-web` / `gamo-web-preview` | marketing pages, legal pages, `llms.txt`, robots, sitemap | `/account/*`, API routes |
| `apps/worship` | `gamo-worship` / `gamo-worship-preview` | home, opportunities | accounts, `/church`, `/musician`, `/check-in`, API routes |
| `apps/academy` | `gamo-academy` / `gamo-academy-preview` | home, instruments, lessons, instructors, sponsored | accounts, `/family`, `/instructor`, `/host`, registration, API routes |
| `apps/live` | `gamo-live` / `gamo-live-preview` | home, events, artists, venues (read the event catalog) | accounts, organizer and promote tools, tickets, scanning, waitlist, API routes |
| `apps/production` | `gamo-production` / `gamo-production-preview` | home, services, training | accounts, `/client`, `/crew`, API routes |
| `apps/admin` | `gamo-admin-next` locally (no deployed worker yet; the old `gamo-admin` is still live) | everything: gate, shell, Inbox, review queues, participation, legal | its queues are rebuilt on the new backend as each product lands |

Every page is rendered on demand (not prerendered) so middleware and security headers always apply. Static files are served by Workers Static Assets; each app's `public/_headers` covers them.

## Packages

| Package | Status | What it holds |
| --- | --- | --- |
| `@studio-gamo/ui` (`packages/ui`) | tokens, marketing layout and components, `Icon`, `Logo`, legal content (the demo-era account, auth, dashboard, form and onboarding components were removed in phase 3) | shared UI |
| `@gamo/config` (`packages/config`) | kept | app hosts and ports, typed `GamoEnv`, environment validation, local env loading |
| `@gamo/domain` (`packages/domain`) | shrunk in phase 3 to what the admin and the marketing pages still use; each rebuilt product replaces its part | admin/provider-review/participation services, the Live read model and catalog import, security headers, terms registry, marketing page middleware |
| `@gamo/auth` (`packages/auth`) | reduced in phase 3 to `AuthError`, `requireSameOrigin` and the `PublicApp`/`GamoLocals` types (product sign-in is redesigned) | request guards |
| `@gamo/db` (`packages/db`) | **being replaced** (fresh data model) | Drizzle schema, migrations 0000–0017 |
| `@gamo/integrations` (`packages/integrations`) | reduced to the Resend adapter | email delivery |

## Request flow

- **Public apps (today):** `src/middleware.ts` → `applicationPages()` in `@gamo/domain` (environment check → legacy redirects → page → security headers; no sessions). Marketing pages need none of the session parts; the rebuild replaces this middleware.
- **Admin:** `apps/admin/src/middleware.ts` → environment check → the gate (`src/lib/gate.ts`: a valid Cloudflare Access assertion for exactly `ADMIN_EMAIL`; locally the explicit loopback-only identity) → page → security headers. Anything else is a plain 401/403/503. See [`docs/ADMIN_REQUIREMENTS.md`](docs/ADMIN_REQUIREMENTS.md).
- **Security headers** (`packages/domain/src/http/security-headers.ts`): CSP with `script-src 'self'` plus a per-response nonce, no `unsafe-inline` scripts, `frame-ancestors 'none'`, `form-action 'self'`, `X-Frame-Options: DENY`, `nosniff`, HSTS over HTTPS, a locked-down `Permissions-Policy`.

## Cloudflare resources (account `ebae7bded6ab45950aeba1d6cf51eb7f`)

- **D1:** `gamo-db-production` (old schema, 17 migrations; holds only the old admin bootstrap user, the Live publisher account and the 20-event Live catalog) and `gamo-db-preview` (empty, old schema up to 0010). One database per environment, shared by the apps. The rebuild's data model replaces both through an owner-approved step.
- **KV:** `SESSION` / `SESSION_KV`. **R2:** `gamo-media-preview`, `gamo-media-production`.
- **Access:** an Access application in front of `admin.gamostudio.org`.

## Configuration

Variables are typed in `packages/config/env.ts` and validated per app in `env-validation.ts`. Local values come from the root `.env` and each app's `.dev.vars`; deployed secrets are set with `wrangler secret put`. Local-only flags are fatal outside `ENVIRONMENT=local`.

## Tests

`tests/e2e/` (Playwright) and `scripts/audit/` (node tests). Most of them cover old product code and go with it. Kept: `tests/e2e/admin.spec.ts` with `scripts/e2e/admin-server.ts` (the built admin worker, as production serves it, on port 4327), `scripts/audit/admin.test.ts`, the marketing smoke and crawler tests. Tests run only when the owner asks.

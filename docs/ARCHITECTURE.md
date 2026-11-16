# Architecture

Current as of the 2026-10 foundation pass (`docs/CLEANUP_LOG.md`), updated 2026-11-16 for the removal of Gamo Live (programs: Academy, Worship, Production; the four-program state is at tag `four-programs-snapshot`). Front-end rules and rationale: [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md). The older root `ARCHITECTURE.md` and `docs/BACKEND_ARCHITECTURE.md` are historical; where they differ, this file describes what the code does.

## Applications

Five Astro 7 SSR apps, each built with `@astrojs/cloudflare` into its own Cloudflare Worker:

| App | Worker (production / preview) | Domain | Local port |
| --- | --- | --- | --- |
| `apps/web` | `gamo-web` / `gamo-web-preview` | gamostudio.org | 4321 |
| `apps/worship` | `gamo-worship` / `gamo-worship-preview` | worship.gamostudio.org | 4322 |
| `apps/academy` | `gamo-academy` / `gamo-academy-preview` | academy.gamostudio.org | 4323 |
| `apps/production` | `gamo-production` / `gamo-production-preview` | production.gamostudio.org | 4325 |
| `apps/admin` | `gamo-admin` / `gamo-admin-preview` | admin.gamostudio.org (no workers.dev) | 4326 |

Hosts, ports and inspector ports are defined once in `packages/config/apps.ts`; links between apps go through `packages/ui/src/lib/sites.ts` (`siteUrl`, `siteOrigin`, `inquiryUrl`), never hard-coded origins.

Each app has the same layout: `astro.config.mjs` (uniform, from `createGamoCloudflareConfig`/`createGamoDevServer`), `wrangler.toml` (local, `[env.preview]`, `[env.production]`), `src/middleware.ts`, `src/lib/legacy-redirects.ts` (public apps), `src/pages/` (pages + `api/` routes), branded `404.astro`/`500.astro`, `public/_headers`, web manifest and icons.

## Packages

| Package | Responsibility |
| --- | --- |
| `packages/config` (`@gamo/config`) | `apps.ts` (domains, ports), `env.ts` (`GamoEnv`, the typed Worker env), `env-validation.ts` (per-isolate checks), `env-loader.ts` (local `.env`/`.dev.vars` loading + Astro/Cloudflare config factory), `brand.ts` |
| `packages/auth` (`@gamo/auth`) | Staff (admin) sessions with HMAC-signed host-only cookies, `requireStaff`, `requireSameOrigin` (CSRF), admin gateway and Cloudflare Access checks, `GamoLocals` (public accounts and Clerk removed 2026-11-16) |
| `packages/domain` (`@gamo/domain`) | Services (`NotificationService`, `AdminService`, customers, email outbox, …), API helpers (`api/response.ts`: JSON errors, `getRuntimeEnv`), the shared page middleware (`api/page-middleware.ts`), security headers (`http/security-headers.ts`) |
| `packages/db` (`@gamo/db`) | Drizzle schema, SQL migrations (`migrations/0000…0019`; `0018` drops the Gamo Live tables, `0019` drops the public-account tables), `getDb`, SQLite-backed D1 for tests (`testing.ts`) — see `docs/DATABASE.md` |
| `packages/integrations` (`@studio-gamo/integrations`) | Stripe (test mode only), Resend, R2 storage; each fails closed when unconfigured outside local |
| `packages/ui` (`@studio-gamo/ui`) | App-neutral shell (`src/shell`: `ShellConfig`/`NavItem` types consumed by `BaseLayout`, header, footer, error page), layouts, form kit (`components/forms`), design tokens in two tiers (`styles/tokens.base.css` raw palette and scale, `styles/tokens.semantic.css` roles; `tokens.css` imports them), self-hosted Inter, crawler helpers. Each app passes its own `src/site.config.ts` manifest (brand, nav, footer, related programs) into the shell |
| `packages/api-contracts` | Types and validators **generated** from `openapi/root.yaml` by `scripts/api/generate.mjs` (do not edit) |

## Request flow

```
request → Worker (Astro) → src/middleware.ts
            └─ applicationPages(app, { legacyRedirects })      packages/domain/src/api/page-middleware.ts
                 1. checkEnvOnce()      unsafe config (e.g. ENVIRONMENT=local on a real host) → 503
                 2. legacy redirects    old URLs (incl. retired /account/* and workspace paths) → new
                 3. render page / API route
                 4. withSecurityHeaders CSP, HSTS, nosniff, frame/referrer/permissions policies,
                                        Cache-Control: private, no-store on pages
```

API routes (`src/pages/api/**`) follow `openapi/root.yaml`: auth check first, then `requireSameOrigin` on state-changing requests, then input validation; errors are `{ error: { code, message } }` from `api/response.ts`. Crawler files (`robots.txt`, `sitemap.xml`, `llms.txt`) are public and cacheable.

Public apps have no session (no public accounts since 2026-11-16). Admin adds its own middleware: Cloudflare Access JWT (`CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD`) **and** an admin gateway session are both required; optional break-glass (`ENABLE_BREAK_GLASS_AUTH`) uses constant-time comparison and logs a warning.

## Accounts and people (2026-11-16)

There are **no public accounts**: public sign-in, Clerk, onboarding, provider profiles, the shared person record and per-program dashboards were removed (owner decision; spec `docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`; AGENTS.md "Forms, emails and admin").

- **Staff** sign in to the admin app only (Cloudflare Access + admin password; `users`, `sessions`, `roles`, `user_roles`, `admin_credentials`). Session cookie: HMAC-signed with `SESSION_SECRET`, `HttpOnly; Secure; SameSite=Lax`, host-only.
- **Everyone else** is identified by email. Musicians, technicians, churches and contacts submit staff-editable forms; staff approve musicians and technicians into a private roster and send offers by email with signed single-purpose links. Parents and students use Academy registration with signed, expiring emailed manage links (`customer_profiles`, `customer_access_tokens`).

Shared plumbing: `@gamo/domain/security` (link tokens, rate limiter, Turnstile, PII hashing), `@gamo/domain/public-form-guard` (bounded body read, Turnstile, per-IP/per-email limits for every public form), `@gamo/domain/terms` (versioned terms registry; all documents are drafts), `services/customers.ts`, `services/email-outbox.ts` (idempotent sends, suppression; the Resend/Svix bounce-complaint webhook is served by `apps/web` at `/api/webhook/resend`), and the form kit in `packages/ui/src/components/forms`.

## Payments

- Stripe runs in **test mode only**; live-mode keys are refused at runtime.
- Academy paid registration uses the Stripe Checkout test path only where `STRIPE_TEST_CHECKOUT=true` in local/preview; production answers 503 in code. "Reserve" (no payment) works everywhere.
- The Gamo Live Stripe webhook (`/api/webhook/stripe`), ticket checkout and the unused `payment_records`/`ledger_entries`/`stripe_webhook_events` tables were removed on 2026-11-16.
- Outbound Stripe/Resend calls: 10 s timeout, `Idempotency-Key`, one retry on network error/429/5xx only.
- No donation, membership or sponsorship payments (AGENTS.md).
- **Planned (cleanup two, Phases 2–4):** staff-editable forms (`DynamicForm`), R2 uploads, submission/offer/invoice emails, invoices via Stripe Invoicing (test mode) or manual mark-paid, and a daily cron. Plan: `docs/superpowers/plans/2026-11-16-forms-emails-invoices.md`.

### Money and time rules (carried over from the 2026-10 root `ARCHITECTURE.md`)

- Money flows through Gamo: Gamo invoices the church or family and pays the musician or instructor. Musician (or instructor) pay and any Gamo administrative line are always separate, labeled line items; no deduction from musician pay without an approved policy; a Gamo administrative line needs owner approval.
- All amounts are integer minor units (cents) with the currency recorded; no floating-point money.
- Timestamps are stored in UTC; anything shown to people (service dates, call times, lesson times) is rendered in a named local timezone (the church's or class's), never a hard-coded offset.
- Booking or request fulfillment and musician assignment are separate states; never show a request as staffed before a confirmed offer.

## Data and storage

- **D1** (`DB`): one database per environment (`gamo-db-local`, `gamo-db-preview`, `gamo-db-production`) shared by all five apps; migrations in `packages/db/migrations`.
- **KV** (`SESSION`, `SESSION_KV`): Astro session storage. All environments currently point at the same namespace id — see CLEANUP_LOG H-01.
- **R2** (`MEDIA_BUCKET`): `gamo-media-<env>`.
- Locally, each app keeps its own Miniflare state in `apps/<app>/.wrangler/state`, so apps don't share a local database file.

## Removed: Gamo Live (2026-11-16)

`apps/live`, its workers (`gamo-live`, `gamo-live-preview`), ticketing, door scanning, the event catalog and their D1 tables (migration `0018`) were removed. Database CHECK constraints that still list `'live'` as a product value were deliberately not rebuilt. Shared account, sign-in and Clerk code was removed by the second cleanup (2026-11-16); customer-link, email and Academy Stripe code stays. History: `docs/DECISIONS.md` (2026-11-16) and tag `four-programs-snapshot`.

## Front end

Astro components with minimal client JavaScript, no inline scripts (CSP `script-src 'self'`, plus Turnstile on pages with a protected form). Admin also sends a per-request `'nonce-…'` in `script-src` (`generateCspNonce()`): Cloudflare JavaScript Detections (on with Bot Fight Mode) injects an inline script whose content, and so hash, changes on every load, and Cloudflare stamps the nonce from the CSP header onto it. Admin pages themselves have no inline script; `scripts/audit/admin-csp-e2e.test.mjs` fails if one ships. Tailwind 4 with base and semantic tokens in `packages/ui/src/styles/tokens.base.css` and `tokens.semantic.css` (apps use semantic roles only; see [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)) (terracotta `#B34E24`, deep `#8F3B18`, soft `#D98B62`, ink `#18181B`, cream `#F9F6F0`, sand `#EDE6DA`), self-hosted Inter variable, titles 900 uppercase, 44 px minimum tap targets.

## Testing

`pnpm check` runs everything (see README). Notable suites: `scripts/audit/private-routes.test.ts` (admin pages/APIs deny anonymous requests; no public private roots remain), `security-headers.test.ts`, `admin-csp-e2e.test.mjs` (every admin page against its own CSP), `legacy-redirects.test.ts`, `crawler-files.test.ts`, `scripts/api/contract.test.ts` (HTTP contract), `packages/integrations/src/http-retry.test.ts`, the Miniflare browser journeys, and `tests/e2e/smoke.spec.ts` (every sitemap page: 200, one h1, no console/CSP errors, no broken images/links, axe WCAG 2.2 AA serious/critical, no overflow at 360 px).

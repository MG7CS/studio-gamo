# Architecture

Current as of the 2026-10 foundation pass (`docs/CLEANUP_LOG.md`). The older root `ARCHITECTURE.md` and `docs/BACKEND_ARCHITECTURE.md` hold historical design notes; where they differ, this file describes what the code does.

## Applications

Six Astro 7 SSR apps, each built with `@astrojs/cloudflare` into its own Cloudflare Worker:

| App | Worker (production / preview) | Domain | Local port |
| --- | --- | --- | --- |
| `apps/web` | `gamo-web` / `gamo-web-preview` | gamostudio.org | 4321 |
| `apps/worship` | `gamo-worship` / `gamo-worship-preview` | worship.gamostudio.org | 4322 |
| `apps/academy` | `gamo-academy` / `gamo-academy-preview` | academy.gamostudio.org | 4323 |
| `apps/live` | `gamo-live` / `gamo-live-preview` | live.gamostudio.org | 4324 |
| `apps/production` | `gamo-production` / `gamo-production-preview` | production.gamostudio.org | 4325 |
| `apps/admin` | `gamo-admin` / `gamo-admin-preview` | admin.gamostudio.org (no workers.dev) | 4326 |

Hosts, ports and inspector ports are defined once in `packages/config/apps.ts`; links between apps go through `packages/ui/src/lib/sites.ts` (`siteUrl`, `siteOrigin`, `inquiryUrl`), never hard-coded origins.

Each app has the same layout: `astro.config.mjs` (uniform, from `createGamoCloudflareConfig`/`createGamoDevServer`), `wrangler.toml` (local, `[env.preview]`, `[env.production]`), `src/middleware.ts`, `src/lib/legacy-redirects.ts` (public apps), `src/pages/` (pages + `api/` routes), branded `404.astro`/`500.astro`, `public/_headers`, web manifest and icons.

## Packages

| Package | Responsibility |
| --- | --- |
| `packages/config` (`@gamo/config`) | `apps.ts` (domains, ports), `env.ts` (`GamoEnv`, the typed Worker env), `env-validation.ts` (per-isolate checks), `env-loader.ts` (local `.env`/`.dev.vars` loading + Astro/Cloudflare config factory), `brand.ts` |
| `packages/auth` (`@gamo/auth`) | D1-backed sessions with HMAC-signed host-only cookies, `requireAuth`/`requireProductAuth`/`requireStaff`, `requireSameOrigin` (CSRF), page-access rules (`page-access.ts`), Clerk verification (`clerk.ts`), admin gateway and Cloudflare Access checks, `GamoLocals` |
| `packages/domain` (`@gamo/domain`) | Services (`LiveService`, `NotificationService`, …), API helpers (`api/response.ts`: JSON errors, `getRuntimeEnv`), the shared page middleware (`api/page-middleware.ts`), security headers (`http/security-headers.ts`) |
| `packages/db` (`@gamo/db`) | Drizzle schema, SQL migrations (`migrations/0000…0017`), `getDb`, SQLite-backed D1 for tests (`testing.ts`) — see `docs/DATABASE.md` |
| `packages/integrations` (`@studio-gamo/integrations`) | Stripe (test mode only), Resend, R2 storage; each fails closed when unconfigured outside local |
| `packages/ui` (`@studio-gamo/ui`) | Layouts (`ProgramLayout`, `ErrorPage`), header/footer, shared auth experience (`components/auth/GamoAuthExperience.astro`), design tokens (`styles/tokens.css`), self-hosted Inter, crawler helpers |
| `packages/api-contracts` | Types and validators **generated** from `openapi/root.yaml` by `scripts/api/generate.mjs` (do not edit) |

## Request flow

```
request → Worker (Astro) → src/middleware.ts
            └─ applicationPages(app, { legacyRedirects })      packages/domain/src/api/page-middleware.ts
                 1. checkEnvOnce()      unsafe config (e.g. ENVIRONMENT=local on a real host) → 503
                 2. resolve session     cookie → D1 session → locals.auth (GamoLocals)
                 3. private-page guard  page-access.ts → sign-in redirect / 403
                 4. legacy redirects    old URLs → new (after the guard, so private paths never leak)
                 5. render page / API route
                 6. withSecurityHeaders CSP, HSTS, nosniff, frame/referrer/permissions policies,
                                        Cache-Control: private, no-store on pages
```

API routes (`src/pages/api/**`) follow `openapi/root.yaml`: auth check first, then `requireSameOrigin` on state-changing requests, then input validation; errors are `{ error: { code, message } }` from `api/response.ts`. Crawler files (`robots.txt`, `sitemap.xml`, `llms.txt`) are public and cacheable.

Admin adds its own middleware: Cloudflare Access JWT (`CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD`) **and** an admin gateway session are both required; optional break-glass (`ENABLE_BREAK_GLASS_AUTH`) uses constant-time comparison and logs a warning.

## Authentication and accounts

- Each product has **its own accounts**: a product account row per product, and its own Clerk application (`CLERK_*_<APP>` variables). Nothing links accounts across products automatically (AGENTS.md "Product Account Independence").
- Without Clerk keys, sign-in uses Gamo's own emailed verification codes. `ALLOW_AUTH_SIMULATION=true` shows the code on screen — local only; any local-only flag outside `ENVIRONMENT=local` is a fatal config error (503).
- All sign-in/sign-up/verify/recover pages use `GamoAuthExperience` from `packages/ui`.

### Clerk is optional and deferred

Launch signs everyone in with Gamo's **emailed verification codes** (6-digit, single use, sent through Resend from `Gamo Studios <hello@gamostudio.org>`; the code and session logic is in `packages/domain/src/http/auth.ts` and `packages/auth`). Clerk is already integrated (`packages/auth/clerk.ts`) and activates per product only when that product's `PUBLIC_CLERK_PUBLISHABLE_KEY_<APP>`, `CLERK_SECRET_KEY_<APP>`, `CLERK_JWT_KEY_<APP>` and `CLERK_ISSUER_<APP>` are all set; otherwise nothing Clerk-related runs and the CSP omits Clerk origins. If enabled later, each product needs its **own production Clerk instance** and the DNS records Clerk requires for that domain (`docs/RUNBOOK.md` §3a). Do not run `clerk init` or the Clerk CLI in this repository.
- Session cookie: HMAC-signed with `SESSION_SECRET`, `HttpOnly; Secure; SameSite=Lax`, host-only (no cross-subdomain cookie).

## People, identity and customers (2026-10-18)

Three kinds of people (full design: `docs/design/identity-and-ticketing.md`; what was built: `docs/IDENTITY.md`):

- **Customers** (ticket buyers, parents, students) have no account. `customer_profiles` is keyed by email; they act through signed, expiring emailed links (`customer_access_tokens`, HMAC-stored, scoped, product-bound) that open a short cookie session (`customer_sessions`). Optional account claim attaches a verified sign-up to the customer's `persons` row.
- **Providers** (musicians, technicians, churches, agents, organizers, teachers) have accounts per product (emailed code or that product's own Clerk app). A D1 `persons` row keyed by a **verified** email links a provider's per-product users so `provider_profiles` and terms acceptances carry across products; sessions, product accounts, Clerk apps and authorization roles stay per product (AGENTS.md exception). Provider publishing is gated (verified email, complete profile, accepted terms, staff review for church/musician/technician, first event of every organizer); staff work in the admin app (`/review/*`) with a shared self-review check and an append-only `verification_records` trail.
- **Door staff** use event-scoped scanner links plus a PIN (`scanner_sessions` → `scanner_devices` cookie), never an account.

Shared plumbing: `@gamo/domain/security` (QR codec, link tokens, rate limiter, Turnstile, PII hashing, PIN), `@gamo/domain/public-form-guard` (bounded body read, Turnstile, per-IP/per-email limits for every public form), `@gamo/domain/terms` (versioned terms registry; all documents are drafts), `services/customers.ts`, `services/email-outbox.ts` (idempotent sends, suppression, Resend/Svix webhooks), and the form kit in `packages/ui/src/components/forms`.

## Gamo Live ticketing (2026-10-18)

Details: `docs/TICKETING.md` (buying, tickets, email, webhooks) and `docs/TICKETING_SCANNER.md` (door scanning, offline, venue maps).

- **Inventory authority is D1 itself** (no Durable Object): inserting a hold reserves its units through a trigger on the category and section counters; overflow aborts the whole `db.batch`. Hold expiry/release and sale conversion are triggers on the hold status; voiding or refunding a ticket releases exactly once. Ticket issuance is idempotent per (order item, seq). `ticket_tiers` are the "ticket categories"; `venue_sections` carry per-section price/capacity.
- **Tickets** carry a version and a random salt; the QR is `GL1.<ticket>.<version>.<MAC>` (HMAC-SHA256, no personal data). Transfers and reissues bump the version so old screenshots die. The server decides every scan with one conditional upsert on `ticket_presence`; offline devices verify against a manifest of MAC digests and sync later, with conflicts flagged.
- **Payments** are Stripe Checkout in test mode only; production answers 503 in code. The webhook claims each event, verifies signature/livemode/amount/currency, and issues tickets in one batch. Refunds are per ticket.
- **Rendering** uses pure-JS libraries (`uqr` for the QR, `pdf-lib` for PDF, a tiny PNG encoder) to fit Workers limits; PDFs may be cached in R2.
- **Email** goes through the outbox (`email_log`, suppressions, bounce/complaint webhook); the on-screen download never depends on email.
- **Local only:** `/local-test/*` (mock Stripe checkout, test inbox, fixtures) answers 404 unless `ENVIRONMENT=local`.

## Payments

- Stripe runs in **test mode only**; live-mode keys are refused at runtime.
- Paid checkout on Gamo Live **fails closed with 503** before any hold is created, until order/inventory authority exists (see `docs/BACKEND_RELEASE_READINESS.md`). Free registration works.
- `POST /api/webhook/stripe` verifies the signature with `STRIPE_WEBHOOK_SECRET`; events are recorded idempotently. Financial fulfillment stays fail-closed.
- Outbound Stripe/Resend calls: 10 s timeout, `Idempotency-Key`, one retry on network error/429/5xx only.
- No donation, membership or sponsorship payments (AGENTS.md).

## Data and storage

- **D1** (`DB`): one database per environment (`gamo-db-local`, `gamo-db-preview`, `gamo-db-production`) shared by all six apps; migrations in `packages/db/migrations`.
- **KV** (`SESSION`, `SESSION_KV`): Astro session storage. All environments currently point at the same namespace id — see CLEANUP_LOG H-01.
- **R2** (`MEDIA_BUCKET`): `gamo-media-<env>`.
- Locally, each app keeps its own Miniflare state in `apps/<app>/.wrangler/state`, so apps don't share a local database file.

## Gamo Live catalog

Public Live pages read real events from D1 through `LiveService` (never hard-coded samples). The verified external discovery catalog (`data/gamo_live_verified_events_2026-10-15.json`, bundled as `verified-catalog-2026-10-15.ts`) is seeded automatically only in local development or when `LIVE_CATALOG_AUTOSEED=true`; otherwise it is imported deliberately (`docs/RUNBOOK.md`). Past events are shown as `Past · Closed` and cannot be registered for.

## Front end

Astro components with minimal client JavaScript, no inline scripts (CSP `script-src 'self'` plus the Clerk origin when configured). Tailwind 4 with tokens in `packages/ui/src/styles/tokens.css` (terracotta `#B34E24`, deep `#8F3B18`, soft `#D98B62`, ink `#18181B`, cream `#F9F6F0`, sand `#EDE6DA`), self-hosted Inter variable, titles 900 uppercase, 44 px minimum tap targets.

## Testing

`pnpm check` runs everything (see README). Notable suites: `scripts/audit/private-routes.test.ts` (every private page/API denies anonymous and foreign sessions), `security-headers.test.ts`, `legacy-redirects.test.ts`, `crawler-files.test.ts`, `scripts/api/contract.test.ts` (HTTP contract), `packages/integrations/src/http-retry.test.ts`, the Miniflare browser journeys, and `tests/e2e/smoke.spec.ts` (every sitemap page: 200, one h1, no console/CSP errors, no broken images/links, axe WCAG 2.2 AA serious/critical, no overflow at 360 px).

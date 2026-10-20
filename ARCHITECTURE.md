# Architecture (2026-10-19)

How the repository is organized. Rules for working here: [`AGENTS.md`](AGENTS.md). Plan: [`docs/REBUILD_PLAN.md`](docs/REBUILD_PLAN.md).

## Apps

Six Astro apps (server output, `@astrojs/cloudflare`), one Cloudflare Worker each. Hosts and local ports are defined once in `packages/config/apps.ts`; cross-app links come from `packages/ui/src/lib/sites.ts`.

| App | Worker (production / preview) | What it serves |
| --- | --- | --- |
| `apps/web` | `gamo-web` / `gamo-web-preview` | marketing and legal pages; `/live` reads Gamo Live's database |
| `apps/worship` | `gamo-worship` / `gamo-worship-preview` | marketing pages (product side to be rebuilt) |
| `apps/academy` | `gamo-academy` / `gamo-academy-preview` | marketing pages (product side to be rebuilt) |
| `apps/live` | `gamo-live` / `gamo-live-preview` | marketing pages (frozen); free registration and ticket pages; paid checkout, order pages, find my tickets; Stripe webhooks; the organizer area (`/organizer`); door staff links (`/door`) |
| `apps/production` | `gamo-production` / `gamo-production-preview` | marketing pages (product side to be rebuilt) |
| `apps/admin` | `gamo-admin-next` locally, `gamo-admin-preview` (no production environment until cutover; the old `gamo-admin` worker still serves `admin.gamostudio.org`) | the single-admin dashboard behind Cloudflare Access: Overview, Community, Gamo Live, Legal |

Every page is rendered on demand so middleware and security headers always apply. Static files are served by Workers Static Assets with each app's `public/_headers`.

## Packages

| Package | What it holds |
| --- | --- |
| `@studio-gamo/ui` (`packages/ui`) | tokens, marketing layout and components, the shared dashboard primitives (`components/ui/`: `Button`, `Notice`, `Pill`, `EmptyState`, `PageHeader`, `ConfirmAction`, `Stat`, `Panel`, `Calendar`, `SearchField`, `FilterChips`, `Toolbar`, `DateTimeField`, `Breadcrumbs`), the split-screen layout (`components/split/`), shared interaction and sidebar scripts, flash messages, legal draft texts |
| `@gamo/config` (`packages/config`) | app hosts and ports, typed `GamoEnv`, environment validation (`env-validation.ts`), local env loading |
| `@gamo/domain` (`packages/domain`) | rules and SQL. `src/live/` is Gamo Live (events and review gate, registration, check-in, organizers and sessions, Clerk, catalog read model and import, admin decisions and schedule, retention, mail; and for paid tickets: `payments/` (the payment interface, Mode A, Mode B, the Stripe HTTP client and the local stand-in), webhooks, fees, gifts, ledger, reports, payment settings, ticket types, pricing, codes, orders, checkout, tickets, transfers, refunds, disputes, paid-event rules, staff links, door sales, cash sessions, readers, verification meetings). `src/security/` (crypto, ids, hashes, PINs, rate limits, D1 helpers), `src/http/security-headers.ts`, `src/calendar.ts`, `src/terms/`, `src/api/page-middleware.ts`, and the admin's community services (`src/services/`: provider review, participation, meeting time) |
| `@gamo/auth` (`packages/auth`) | `AuthError`, `requireSameOrigin`, request types |
| `@gamo/db` (`packages/db`) | the old shared schema (`migrations/`, still read by the admin's Community queues), Gamo Live's own migrations (`live/migrations/0001`–`0012`), and the `node:sqlite` D1 facade for tests (`testing.ts`) |
| `@gamo/integrations` (`packages/integrations`) | the Resend email adapter |

## Data

- **`LIVE_DB`**: Gamo Live's own D1 database (`gamo-live-db-<env>`; schema `packages/db/live/migrations`, design `docs/LIVE_DATA_MODEL.md`), bound by `apps/live`, `apps/web` and `apps/admin`. Locally the three share one state folder (`.wrangler/shared-state`, `make live-db`). Preview and production databases are created by the owner (`docs/RUNBOOK.md` §5).
- **`DB`**: the old shared database (`gamo-db-<env>`), still read by the admin's Community queues (churches, providers, participation).
- **KV** `SESSION`/`SESSION_KV` and **R2** media buckets are bound; Live does not use KV (rate limits are counted in D1).

## Request flow

- **Public apps:** `src/middleware.ts` → `applicationPages()` (`@gamo/domain/page-middleware`): environment check → legacy redirects → page → security headers, `Cache-Control: private, no-store`. Pages that need identity call it themselves.
- **Live organizer area:** each page calls `organizerPage()` (`apps/live/src/lib/organizer-session.ts`): the `gl_organizer` session cookie (hashed in `organizer_sessions`, 7 days) and membership of the active organization, else a redirect to sign-in or set-up. Sign-in is Live's own Clerk application (`/account/*`).
- **Live door staff:** `/door/<token>` checks the staff link (keyed hash), then the PIN, then sets a device cookie scoped to the link's event; every request re-checks the link's permissions, expiry and revocation.
- **Every state-changing request** checks identity, then `requireSameOrigin`, then validates input, then calls one named function (in `@gamo/domain` or the app's `src/lib/`), then redirects with a flash message.
- **Admin:** `apps/admin/src/middleware.ts` → environment check → the gate (`src/lib/gate.ts`: a valid Cloudflare Access assertion for exactly `ADMIN_EMAIL`; locally a loopback-only stand-in) → page → security headers.
- **Security headers** (`packages/domain/src/http/security-headers.ts`): CSP with `script-src 'self'` and a nonce, no inline scripts, `frame-ancestors 'none'`, `form-action 'self'`, HSTS, `nosniff`, a locked-down `Permissions-Policy`. A page widens it only for itself with `requestSecurityHeaders()`: Clerk's origins on sign-in pages, the camera on the door screen, `form-action https://checkout.stripe.com` on the response that redirects to Stripe Checkout, `Referrer-Policy: same-origin` on pages with a secret in the URL.

## Payments (Gamo Live)

Details: [`docs/LIVE_PAYMENTS.md`](docs/LIVE_PAYMENTS.md).

- **One payment interface** (`PaymentRouting`, `packages/domain/src/live/payments/`) with two implementations: Mode A (the organization's own Stripe account, Connect direct charges) and Mode B (Gamo collects, Connect transfers). Both use a low-level Stripe gateway: the HTTP client (`fetch`, form-encoded, idempotency keys) or the local stand-in. The mode is resolved per order from `payment_settings` and `organization_payments` and snapshotted on the order; pages never branch on it.
- **Webhooks:** `/api/stripe/webhook` (platform) and `/api/stripe/connect-webhook` (Connect): signature check, claim in `stripe_events`, idempotent handlers, mark.
- **Inventory:** pending orders are the holds; one D1 batch reserves with `CHECK`-guarded counters (`ticket_inventory`, `occurrence_inventory`).
- **Ledger:** `ledger_entries`, append-only with idempotent source keys; reports read only the ledger.
- **Door:** staff links with PINs, cash sessions, and Stripe Terminal smart readers driven from the server.
- **Test mode only** until the owner approves production; without keys, card sales answer 503; the stand-in runs only with `ENVIRONMENT=local`.

## Cloudflare resources (account `ebae7bded6ab45950aeba1d6cf51eb7f`)

- **D1:** `gamo-db-production` and `gamo-db-preview` (old schema); Gamo Live's `gamo-live-db-preview` and `gamo-live-db-production` are created by the owner.
- **KV:** `SESSION` / `SESSION_KV`. **R2:** `gamo-media-preview`, `gamo-media-production`.
- **Access:** an Access application in front of `admin.gamostudio.org`.

## Configuration

Variables are typed in `packages/config/env.ts` and validated per app in `env-validation.ts` (fatal → 503; error → the feature fails closed; warning → unavailable). Local values come from the root `.env` and each app's `.dev.vars` (`.dev.vars.example` lists them); deployed secrets are set with `wrangler secret put`. Local-only flags (`ALLOW_*`, `GAMO_DEV_PHONE_TOKEN`) are fatal outside `ENVIRONMENT=local`.

## Tests

- **Unit:** `node:test` run with `tsx --test`, next to the code (`packages/**/*.test.ts`, `scripts/audit/*.test.ts`); D1 is the `node:sqlite` facade in `packages/db/testing.ts` (a batch is one transaction).
- **Built-worker browser tests (Playwright):** `scripts/e2e/live-flow-server.ts` runs the built Live and admin workers together in Miniflare on one Live database, with Resend and Stripe answered locally, for `tests/e2e/live-flow.spec.ts` and the paid specs (`live-paid-checkout`, `live-door`, `live-payments-admin`); `scripts/e2e/admin-server.ts` runs the built admin for `tests/e2e/admin.spec.ts`; marketing smoke tests for the other apps.
- Tests run as `AGENTS.md` §2 says: targeted runs for what changed; broad runs only when the owner asks.

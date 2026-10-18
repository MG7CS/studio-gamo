# Gamo Studios — Cloudflare Deployment Guide

<!-- status-banner: 2026-10 foundation pass -->
> **Superseded by [RUNBOOK.md](RUNBOOK.md)** (deploy, rollback, secrets per app, migrations, Live catalog). Some details below are out of date (migration file names, the demo-banner check).

**Canonical Production Domain:** `gamostudio.org`  
**Active Cloudflare Account:** `gamostudios` (Account ID: `ebae7bded6ab45950aeba1d6cf51eb7f`)  
**Active Cloudflare Zone:** `gamostudio.org` (Zone ID: `5dd92c18b4c722d5d15d66bda4f94979`, Active)  
**Temporary Live Preview:** [`https://gamo-web.gamostudio.workers.dev`](https://gamo-web.gamostudio.workers.dev)  
**Updated:** 2026-10-13

---

## 1. Architecture & Domain Topology

Gamo Studios is deployed as six discrete Cloudflare Workers corresponding to the applications in `apps/`:

| Application | Monorepo Path | Proposed Production Domain | Preview URL (`workers.dev`) | Access Policy |
| :--- | :--- | :--- | :--- | :--- |
| **Gamo Web** | `apps/web` | `gamostudio.org` / `www.gamostudio.org` | `https://gamo-web.gamostudio.workers.dev` | Public |
| **Gamo Worship** | `apps/worship` | `worship.gamostudio.org` | `https://gamo-worship.gamostudio.workers.dev` | Public |
| **Gamo Academy** | `apps/academy` | `academy.gamostudio.org` | `https://gamo-academy.gamostudio.workers.dev` | Public |
| **Gamo Live** | `apps/live` | `live.gamostudio.org` | `https://gamo-live.gamostudio.workers.dev` | Public |
| **Gamo Production** | `apps/production` | `production.gamostudio.org` | `https://gamo-production.gamostudio.workers.dev` | Public |
| **Gamo Admin** | `apps/admin` | `admin.gamostudio.org` | *Disabled* (`workers_dev = false`) | **Restricted: Cloudflare Zero Trust Access Required** |

---

## 2. Security & Access Protection

### 2.1 Protecting the Admin Application (`apps/admin`)

> [!CAUTION]
> **Do not mistake frontend role-switching for authentication.**  
> The persona switcher (`Jordan Avery`) in demo screens is a client-side layout preview affordance only. It provides zero security boundaries.

The Admin application contains internal staff tooling, audition evaluation pipelines, safeguarding reviews, and nonprofit governance documents. It must never be published openly.

Access protection is enforced at two distinct layers:

1. **Edge Protection — Cloudflare Zero Trust (Cloudflare Access)**:
   - Configure a Self-Hosted Access Application in the Cloudflare Zero Trust dashboard covering `admin.gamostudio.org`.
   - Policy: Require Email OTP restricted to approved Gamo Studios staff and board email addresses.
   - At runtime, Cloudflare Access injects `Cf-Access-Jwt-Assertion` and `Cf-Access-Authenticated-User-Email` headers into verified requests.

2. **Application Middleware — `apps/admin/src/middleware.ts`**:
   - Inspects incoming requests for Cloudflare Access assertions (`cf-access-jwt-assertion`).
   - Fallback credential gates:
     - Bearer Token / `x-admin-key`: Checked against Worker secret `ADMIN_ACCESS_TOKEN`.
     - HTTP Basic Authentication: Checked against Worker secrets `ADMIN_BASIC_AUTH_USER` and `ADMIN_BASIC_AUTH_PASS`.
   - If unauthenticated, the middleware returns `HTTP 401 Unauthorized` with `WWW-Authenticate: Basic realm="Gamo Studios Operations"` and blocks the request.
   - `workers_dev = false` is explicitly configured in `apps/admin/wrangler.toml` to prevent public edge exposure on `workers.dev`.

### 2.2 Server-Enforced Workspace Authorization & Isolated Local Demo Mode

Public applications (`apps/web`, `apps/worship`, `apps/academy`, `apps/live`, `apps/production`) enforce server-side page and API authentication via `applicationPages(app)` middleware (`packages/domain/src/api/page-middleware.ts`) and `packages/auth/page-access.ts`:

- Unauthenticated visitors requesting private routes (`/account`, `/partner`, `/church`, `/musician`, `/check-in`, `/family`, `/instructor`, `/host`, `/dashboard`, `/organizer`, `/artist`, `/agent`, `/me`, `/workspaces`, `/promote/create`, `/promote/status`, `/ticket`, `/checkout`, `/client`, `/crew`) receive an HTTP `303` redirect to `/account/signin?next=...` with `Cache-Control: no-store`.
- Authenticated users whose verified account lacks required program roles or organization memberships receive an HTTP `303` redirect to `/account/access-denied` (`HTTP 403`).
- Query-parameter bypasses (`?demo_key=...`) and unsigned cookie hints (`gamo_profile_hint`) are permanently ignored for authorization.
- Demonstration workspace screens (`DashboardShell`) are restricted strictly to isolated local loopback requests (`localhost`, `127.0.0.1`, `[::1]`) when both `ENVIRONMENT=local` and `ALLOW_PUBLIC_DEMO_WORKSPACES=true` are set. In staging and production, `ALLOW_PUBLIC_DEMO_WORKSPACES` and `ALLOW_AUTH_SIMULATION` must remain `false` or unset.

---

## 3. Required Cloudflare Resources

Before deploying the complete stack, ensure the following resources and migrations are provisioned in the `gamostudios` account:

### 3.1 D1 Database & R2 Storage (Provisioned)

Isolated preview and production resources are provisioned in the `gamostudios` account (`ebae7bded6ab45950aeba1d6cf51eb7f`):

- **Production D1 (`gamo-db-production`)**: `d6db9fe7-77c0-4a50-836e-3d1924f00b53`
- **Production R2 (`gamo-media-production`)**: Bound as `MEDIA_BUCKET`
- **Preview D1 (`gamo-db-preview`)**: `d7e12797-cc6c-4fa3-91c7-c192863e4812`
- **Preview R2 (`gamo-media-preview`)**: Bound as `MEDIA_BUCKET`

Tracked D1 migrations in `packages/db/migrations/` (`0000_nervous_black_tarantula.sql` through `0008_participation_inquiries.sql`, including `auth_challenges`, `external_identities`, `notification_jobs`, `live_platform_expansion`, and `participation_inquiries`) must be applied before deploying updated Workers:

```bash
CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-web exec wrangler d1 migrations apply gamo-db-preview --env preview --remote
CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-web exec wrangler d1 migrations apply gamo-db-production --env production --remote
```

### 3.2 KV Namespaces (Sessions & Caching)

All six applications bind the session KV namespace:
- `SESSION` / `SESSION_KV`: `7d35f3e994d04c00a8a404a552978674`

---

## 4. Environment Variables & Worker Secrets

Worker secrets are managed securely via the Cloudflare CLI. **Never commit real credentials to source control.**

### 4.1 Resend Integration (Email Verification & Transactional Delivery)

Configure transactional email delivery for 6-digit email verification challenges (`/api/auth/challenge`), ticket lookup challenges, and registration confirmations. Without `RESEND_API_KEY` and `EMAIL_FROM` in non-local environments, `/api/auth/challenge` fails closed with `503 Service Unavailable`:

```bash
# Set secret on each public worker (apps/web, apps/live, apps/worship, apps/academy, apps/production):
pnpm --filter apps-web exec wrangler secret put RESEND_API_KEY --env production
pnpm --filter apps-live exec wrangler secret put RESEND_API_KEY --env production
pnpm --filter apps-worship exec wrangler secret put RESEND_API_KEY --env production
pnpm --filter apps-academy exec wrangler secret put RESEND_API_KEY --env production
pnpm --filter apps-production exec wrangler secret put RESEND_API_KEY --env production
```

Public sender variable (configured in `wrangler.toml` or `.dev.vars`):
- `EMAIL_FROM="Gamo Studios <hello@gamostudio.org>"` (or `RESEND_FROM_EMAIL`)

### 4.2 Stripe Integration (Test Mode Only)

> [!IMPORTANT]
> **Legal & Governance Gate:**  
> Per `docs/GAMO_NONPROFIT_MODEL.md` and `docs/NONPROFIT_TRANSITION_CHECKLIST.md`, live transactions (donations, memberships, event payments, artist deposits) are strictly prohibited until legal formation and governance prerequisites are finalized.  
> Only Stripe Test Mode keys (`sk_test_...` and `pk_test_...`) are authorized when `STRIPE_SANDBOX_ENABLED=true`. By default, `STRIPE_SANDBOX_ENABLED` is `false` and paid checkout fails closed (`503`).

```bash
# Configure Stripe Test Mode secret for apps/live (sandbox testing only):
pnpm --filter apps-live exec wrangler secret put STRIPE_SECRET_KEY --env preview
pnpm --filter apps-live exec wrangler secret put STRIPE_WEBHOOK_SECRET --env preview
```

Public variable:
- `PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."`

### 4.3 Session & Admin Protection Secrets

All six workers verify `__session` cookies against `SESSION_SECRET` and D1 `sessions`. Configure the shared `SESSION_SECRET` across every Worker sharing the D1 database:

```bash
for app in apps-web apps-live apps-worship apps-academy apps-production apps-admin; do
  pnpm --filter "$app" exec wrangler secret put SESSION_SECRET --env production
done

pnpm --filter apps-admin exec wrangler secret put ADMIN_ACCESS_TOKEN --env production
```

---

## 5. DNS & Custom Domain Routing

The zone `gamostudio.org` (`5dd92c18b4c722d5d15d66bda4f94979`) is active on Cloudflare nameservers (`cullen.ns.cloudflare.com`, `nina.ns.cloudflare.com`).

### 5.1 Cloudflare Worker Custom Domains

In `wrangler.toml`, each worker defines its custom domains under `[env.production]` with `custom_domain = true`:

- `gamostudio.org` and `www.gamostudio.org` → `gamo-web`
- `worship.gamostudio.org` → `gamo-worship`
- `academy.gamostudio.org` → `gamo-academy`
- `live.gamostudio.org` → `gamo-live`
- `production.gamostudio.org` → `gamo-production`
- `admin.gamostudio.org` → `gamo-admin`

### 5.2 Building & Deploying with `@astrojs/cloudflare`

Because `@astrojs/cloudflare` flattens the active Wrangler environment into `dist/server/wrangler.json` at build time, always set `CLOUDFLARE_ENV=production` during `astro build` (which `make deploy-*` handles automatically):

```bash
CLOUDFLARE_ENV=production pnpm --filter apps-web build
CLOUDFLARE_ACCOUNT_ID=ebae7bded6ab45950aeba1d6cf51eb7f pnpm --filter apps-web exec wrangler deploy
```

With `custom_domain = true`, Cloudflare automatically creates the proxied DNS records and Universal SSL certificates in the `gamostudio.org` zone upon deployment.

---

## 6. Deployment Playbook & Order

### Step 1: Pre-Deployment Build & Verification

```bash
# 1. Clean previous build artifacts
make clean

# 2. Run TypeScript checks across all workspaces
make check

# 3. Run image policy and asset tests
make test

# 4. Perform dry-run deployment verification across all 6 applications
make verify-deployment
```

### Step 2: Temporary Preview Deployment (`workers.dev`)

```bash
# Deploy the public web application to test on edge
make preview-web

# Or deploy all public applications to workers.dev
make preview-all
```

Verified live endpoint: `https://gamo-web.gamostudio.workers.dev`

### Step 3: Production Deployment Order

Deploy applications in this strict order:

1. **`make deploy-web`** — The global hub and root domain (`gamostudio.org`). Verifies apex routing and asset delivery.
2. **`make deploy-worship`** — Gamo Worship (`worship.gamostudio.org`).
3. **`make deploy-academy`** — Gamo Academy (`academy.gamostudio.org`).
4. **`make deploy-live`** — Gamo Live (`live.gamostudio.org`).
5. **`make deploy-production`** — Gamo Production (`production.gamostudio.org`).
6. **`make deploy-admin`** — Gamo Admin (`admin.gamostudio.org`). **Verify Cloudflare Zero Trust Access is armed before directing staff.**

Or deploy all sequentially:

```bash
make deploy-all
```

---

## 7. Post-Deployment Verification Checklist

- [ ] **Apex & WWW**: `https://gamostudio.org` and `https://www.gamostudio.org` resolve with valid SSL.
- [ ] **Subdomains**: `worship`, `academy`, `live`, `production` load corresponding program homepages.
- [ ] **Cross-App Navigation**: Header and footer navigation links transition correctly between subdomains without broken links.
- [ ] **Asset Delivery**: Optimized WebP/AVIF images and Inter web fonts render without 404s.
- [ ] **Admin Security**: Navigating to `https://admin.gamostudio.org/` prompts for Cloudflare Access authentication or returns `401 Unauthorized`.
- [ ] **Demo Notices**: Demo banners remain visible on all preview states.
- [ ] **Payment Inactivity**: No real payment credentials exist in production secrets.

## OpenAPI reconciliation note — 2026-10-13

Use [OPENAPI_ARCHITECTURE.md](OPENAPI_ARCHITECTURE.md) and [API_INVENTORY.md](API_INVENTORY.md) for actual runtime behavior. Admin verifies RS256 Cloudflare Access assertions; emergency alternatives are disabled by default in production. Access identity-to-D1 mapping and operation-level staff permission checks are still incomplete. No deployment or production binding mutation is part of contract adoption. Never publish `openapi/bundled/internal.json` or `docs/api-reference/internal.html`. Require real provider sandbox and Cloudflare runtime verification plus the independent audit before production readiness claims.

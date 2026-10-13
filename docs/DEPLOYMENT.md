# Gamo Studios — Cloudflare Deployment Guide

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

### 2.2 Protecting Demo Workspaces in Public Apps

Public applications (`apps/web`, `apps/worship`, `apps/academy`, etc.) render interactive persona workspaces for design evaluation. In production environments, access can be locked to authorized reviewers using environment variables:

- `ALLOW_PUBLIC_DEMO_WORKSPACES=false`: Blocks open browsing of `/musician`, `/church`, `/family`, etc.
- `DEMO_ACCESS_KEY`: Requires a review passphrase passed via query parameter (`?demo_key=SECRET`) or cookie.

---

## 3. Required Cloudflare Resources

Before deploying the complete production stack, provision the following resources in the `gamostudios` account:

### 3.1 D1 Database (Relational Data & SQLite Engine)

When the functionality phase begins and persistent database queries are enabled:

```bash
# 1. Create the production D1 database
pnpm --filter apps-web exec wrangler d1 create gamo-production-db

# 2. Note the generated database_id (UUID)
# 3. Apply initial migrations
pnpm --filter apps-web exec wrangler d1 migrations apply gamo-production-db --remote
```

### 3.2 KV Namespaces (Sessions & Caching)

The global web app has already provisioned its session KV namespace:
- `gamo-web-session`: `7d35f3e994d04c00a8a404a552978674`

To create dedicated session KV namespaces for sibling apps if desired:

```bash
pnpm --filter apps-worship exec wrangler kv namespace create "gamo-worship-session"
pnpm --filter apps-academy exec wrangler kv namespace create "gamo-academy-session"
pnpm --filter apps-live exec wrangler kv namespace create "gamo-live-session"
pnpm --filter apps-production exec wrangler kv namespace create "gamo-production-session"
pnpm --filter apps-admin exec wrangler kv namespace create "gamo-admin-session"
```

---

## 4. Environment Variables & Worker Secrets

Worker secrets are managed securely via the Cloudflare CLI. **Never commit real credentials to source control.**

### 4.1 Resend Integration (Email Delivery)

Configure transactional email delivery for onboarding notifications, church requests, and ticket confirmations:

```bash
# Set secret on each worker requiring email dispatch (e.g. apps/web, apps/worship, apps/live):
pnpm --filter apps-web exec wrangler secret put RESEND_API_KEY --env production
# Prompt: Paste your Resend API key (starts with re_...)
```

Public variables (configured in `wrangler.toml` or `.dev.vars`):
- `RESEND_FROM_EMAIL="Gamo Studios <notifications@gamostudio.org>"`

### 4.2 Stripe Integration (Test Mode Only)

> [!IMPORTANT]
> **Nonprofit Governance Gate:**  
> Per `docs/GAMO_NONPROFIT_MODEL.md` and `docs/NONPROFIT_TRANSITION_CHECKLIST.md`, live transactions (donations, memberships, event payments) are strictly prohibited until 501(c)(3) legal transition prerequisites are finalized.  
> Only Stripe Test Mode keys (`sk_test_...` and `pk_test_...`) are authorized. The integration adapter actively rejects live keys (`sk_live_`).

```bash
# Configure Stripe Test Mode secret for apps/live (ticketing) and apps/web:
pnpm --filter apps-live exec wrangler secret put STRIPE_SECRET_KEY --env production
# Prompt: Paste your Stripe test secret key (must start with sk_test_)

pnpm --filter apps-live exec wrangler secret put STRIPE_WEBHOOK_SECRET --env production
# Prompt: Paste your Stripe webhook signing secret (whsec_...)
```

Public variable:
- `PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."`

### 4.3 Admin Protection Secrets

```bash
pnpm --filter apps-admin exec wrangler secret put ADMIN_ACCESS_TOKEN --env production
# Prompt: Enter a cryptographically strong 32+ character passphrase

pnpm --filter apps-admin exec wrangler secret put ADMIN_BASIC_AUTH_PASS --env production
# Prompt: Enter an administrative password for emergency Basic Auth
```

---

## 5. DNS & Custom Domain Routing

The zone `gamostudio.org` is active on Cloudflare nameservers (`cullen.ns.cloudflare.com`, `nina.ns.cloudflare.com`).

### 5.1 Cloudflare Custom Domain vs Worker Routes

In `wrangler.toml`, each worker defines its custom routes under `[env.production]`:

- `gamostudio.org/*` and `www.gamostudio.org/*` → `gamo-web`
- `worship.gamostudio.org/*` → `gamo-worship`
- `academy.gamostudio.org/*` → `gamo-academy`
- `live.gamostudio.org/*` → `gamo-live`
- `production.gamostudio.org/*` → `gamo-production`
- `admin.gamostudio.org/*` → `gamo-admin`

### 5.2 Enabling Routes on Custom Domains

When deploying with `--env production`, Wrangler automatically associates the worker with the route in the `gamostudio.org` zone.

Alternatively, custom domains can be attached directly via the Cloudflare dashboard:
1. Navigate to **Workers & Pages** → Select Worker (e.g. `gamo-web`).
2. Go to **Settings** → **Domains & Routes** → **Add Custom Domain**.
3. Enter `gamostudio.org` and `www.gamostudio.org`.
4. Cloudflare manages the DNS CNAME and Universal SSL certificates automatically.

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

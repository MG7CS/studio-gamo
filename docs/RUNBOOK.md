# Runbook

Operational procedures for Gamo Studios. **Every step that touches Cloudflare, Stripe, Clerk, Resend, DNS or a remote database is an owner-only action** (AGENTS.md). Agents prepare and verify locally; the owner runs the remote commands.

All commands run from the repository root unless stated. Account: `ebae7bded6ab45950aeba1d6cf51eb7f` (in each `wrangler.toml` and the Makefile).

## 0. Before any deploy

```sh
pnpm install --frozen-lockfile
pnpm check                      # must pass: typecheck, lint, format, tests, API checks, build, browser tests
pnpm --filter apps-web exec wrangler whoami   # or: make verify-config
make verify-deployment          # wrangler deploy --dry-run for all six apps
```

Then confirm the per-app secrets in §3 exist for the target environment (`wrangler secret list --env <env>` from `apps/<app>`; it prints names only).

## 1. Deploy

Always preview first, then production.

| Step | Command |
| --- | --- |
| Preview one app | `make preview-<app>` (web, worship, academy, live, production) |
| Preview all public apps | `make preview-all` |
| Production one app | `make deploy-<app>` |
| Production, all | `make deploy-all` (order: web, worship, academy, live, production, admin) |

Each target runs `CLOUDFLARE_ENV=<preview|production> pnpm --filter apps-<app> build` — the build writes the environment's bindings and vars into the deploy configuration — then `wrangler deploy`. **Never deploy a build made without `CLOUDFLARE_ENV`**: it carries `ENVIRONMENT=local`, and env validation then answers every non-loopback request with 503 (fail-safe, but an outage).

Production routes use `custom_domain = true`, so the first deploy of an app creates its DNS record and certificate (gamostudio.org + www, worship., academy., live., production., admin.).

**Admin:** deploy only after the Cloudflare Access application for `admin.gamostudio.org` exists and its AUD tag is set as `CF_ACCESS_AUD`. Admin has `workers_dev = false` and no preview route, so `admin-preview` is not reachable until a route is added (owner decision).

## 2. Rollback

```sh
cd apps/<app>
pnpm exec wrangler deployments list --env <preview|production>
pnpm exec wrangler rollback <version-id> --env <preview|production>
```

Rollback restores code and vars, not secrets or the database. If a migration was applied with the release, check that the previous code still works with the new schema (migrations are additive; see `docs/DATABASE.md`) or restore the database (§4).

## 3. Environment variables and secrets

Plain vars (`ENVIRONMENT`, `PUBLIC_SITE_URL_*`, `PUBLIC_ROOT_DOMAIN`, `PLATFORM_*`, `CLERK_APP_ID_*`, `CLERK_AUTHORIZED_PARTIES_*`, `REQUIRE_ADMIN_AUTH`, `STRIPE_SANDBOX_ENABLED`) live in each `wrangler.toml` per environment. Secrets are set per app and environment:

```sh
cd apps/<app> && pnpm exec wrangler secret put <NAME> --env <preview|production>
```

| App | Required | Optional (feature unavailable without it) |
| --- | --- | --- |
| all six | `SESSION_SECRET` (≥ 32 chars; same value across apps is not required) | — |
| web, worship, academy, live, production | — | `RESEND_API_KEY` + `EMAIL_FROM` (email delivery); Clerk for that product: `PUBLIC_CLERK_PUBLISHABLE_KEY_<APP>`, `CLERK_SECRET_KEY_<APP>`, `CLERK_JWT_KEY_<APP>`, `CLERK_ISSUER_<APP>` |
| live | — | `STRIPE_SECRET_KEY` (test mode `sk_test_`/`rk_test_` only; checkout stays 503 regardless until order authority exists), `STRIPE_WEBHOOK_SECRET` |
| admin | `CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD` | Break-glass: `ENABLE_BREAK_GLASS_AUTH`, `ADMIN_ACCESS_TOKEN`, `ADMIN_SECRET_KEY`, `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASS` (leave unset unless needed) |

`<APP>` is `WEB`, `WORSHIP`, `ACADEMY`, `LIVE` or `PRODUCTION`; each product uses its **own** Clerk application — never copy keys between products.

Never set `ALLOW_DEMO_SESSION`, `ALLOW_AUTH_SIMULATION` or `ALLOW_PUBLIC_DEMO_WORKSPACES` to `true` outside local: the app refuses to serve (503). `LIVE_CATALOG_AUTOSEED=true` (live only) is the one deliberate exception that writes on a visitor request — see §5.

On the first request each isolate logs missing configuration by **name** (`[env:<app>] error: …`). Check with `pnpm exec wrangler tail --env <env>` from `apps/<app>`.

## 4. Database (D1)

Databases: `gamo-db-preview`, `gamo-db-production` (one per environment, shared by all apps). Migrations live in `packages/db/migrations`.

```sh
cd apps/web
pnpm exec wrangler d1 migrations list  gamo-db-<env> --env <env> --remote   # what is pending
pnpm exec wrangler d1 export           gamo-db-<env> --env <env> --remote --output ../../backup-<env>-<date>.sql   # backup first (do not commit it)
pnpm exec wrangler d1 migrations apply gamo-db-<env> --env <env> --remote
```

Apply migrations **before** deploying code that needs them. To undo a bad change, D1 Time Travel can restore to a point in time: `wrangler d1 time-travel restore gamo-db-<env> --timestamp <ISO time> --env <env>` (destructive — owner only). Local database commands: `docs/DATABASE.md`.

## 5. Importing the Gamo Live catalog

The verified external discovery catalog is `data/gamo_live_verified_events_2026-10-15.json` (also bundled in `packages/domain/src/services/verified-catalog-2026-10-15.ts`). Imported listings are real events with source links; they are shown only after editorial approval.

**Local:**

```sh
pnpm db:migrate:local
pnpm live:publisher:provision --env local --apply
pnpm live:events:import --env local --apply          # --file <path> for another catalog; omit --apply for a dry run
pnpm live:events:publish --env local --only-approved --apply
# or all three: pnpm db:seed:local
```

Local dev also seeds automatically on the first Live request when no external listings exist.

**Preview / production:** the editorial CLI only writes to the local database; with `--env preview|production` it supports `--dry-run` (in-memory simulation) and refuses `--apply`. Options:

- Set `LIVE_CATALOG_AUTOSEED = "true"` in `[env.<env>.vars]` of `apps/live/wrangler.toml`, deploy, load one Live page, confirm the events, then remove the var and redeploy. Seeding is idempotent (it skips when any external listing already exists) and publishes only approved records.
- Whether production should carry this catalog at all is an owner decision (CLEANUP_LOG O-13/H-03).

A newer catalog file needs a code change (a new bundled catalog module); record it in `docs/BUILD_LOG.md`.

## 6. Cloudflare checks

- **Access:** an Access application covers `admin.gamostudio.org`; its team name and AUD match `CF_ACCESS_TEAM_NAME` / `CF_ACCESS_AUD`.
- **KV:** every environment's `SESSION`/`SESSION_KV` currently uses the same namespace id — create separate preview/production namespaces and update `wrangler.toml` (CLEANUP_LOG H-01).
- **R2:** buckets `gamo-media-preview` and `gamo-media-production` exist.
- **D1:** `gamo-db-preview` / `gamo-db-production` ids in `wrangler.toml` match the account; migrations list shows nothing pending.
- **Domains:** each custom domain shows an active certificate; `www.gamostudio.org` is attached to `gamo-web`.
- **Headers:** `curl -sI https://<host>/` shows `content-security-policy`, `strict-transport-security`, `x-content-type-options: nosniff`, `cache-control: private, no-store`.

## 7. After a deploy

For each public host:

- `/` returns 200; `/robots.txt`, `/sitemap.xml` return 200 (and `/llms.txt` on gamostudio.org).
- An unknown path shows the branded 404.
- `/account/signin` renders; a private page (e.g. `live…/me`) redirects anonymous visitors to sign-in.
- Live: events come from the database, past events show `Past · Closed`; paid checkout answers 503 by design.
- `wrangler tail` shows no `[env:<app>] fatal` or `error` lines.
- Admin: an unauthenticated visit is stopped by Cloudflare Access.

## 8. First staff account

Admin needs a Cloudflare Access identity **and** a D1 user with the `superadmin` (or staff) role and an `admin_credentials` row. `ensureBootstrapAdminAccount` creates these **only for explicit local demos on loopback**; there is no supported command for preview/production yet (CLEANUP_LOG H-07). Until one exists, the owner creates the rows with `wrangler d1 execute … --remote`, using a password hash produced by `hashAdminPassword` locally and `must_change_password = 1`. Retire the historical bootstrap credential first (H-02).

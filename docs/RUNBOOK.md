# Runbook

Operational procedures. **Every step that touches Cloudflare, DNS, secrets, a remote database, Stripe, Resend or Clerk is owner-only** (`AGENTS.md` §2): agents prepare and check locally; the owner runs remote commands. Commands run from the repository root unless stated. Cloudflare account: `ebae7bded6ab45950aeba1d6cf51eb7f`.

**During the rebuild ([`docs/REBUILD_PLAN.md`](REBUILD_PLAN.md)) the public apps are frozen in production.** The workers live today run the old code; its full secret list is in this file's git history (before 2026-10-19). Each rebuilt product adds its own section here when it is ready to ship.

## 1. Before a deploy

```sh
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm format:check
pnpm build
make verify-deployment                        # wrangler deploy --dry-run for the public apps
pnpm preflight <app> --env preview            # read-only: config and secret names (never values)
```

Tests run when the owner asks (`pnpm check` runs everything).

## 2. Deploy and roll back

| Step | Command |
| --- | --- |
| Preview one public app | `make preview-<app>` (web, worship, academy, live, production) |
| Production one public app | `make deploy-<app>` |

Each target builds with `CLOUDFLARE_ENV=<preview|production>` (the environment's bindings and vars) and runs `wrangler deploy`. Never deploy a build made without `CLOUDFLARE_ENV`. Production routes use custom domains, so a first deploy creates the DNS record and certificate.

Roll back:

```sh
cd apps/<app>
pnpm exec wrangler deployments list --env <preview|production>
pnpm exec wrangler rollback <version-id> --env <preview|production>
```

A rollback restores code and vars, not secrets or the database.

## 3. Admin (`apps/admin`)

The rebuilt admin is not deployed yet; the old `gamo-admin` worker still serves `admin.gamostudio.org`. Its config has a preview environment and deliberately **no production environment** until cutover.

1. **Cloudflare Access (owner, Zero Trust dashboard):** a self-hosted Access application covering the admin host, with a policy that allows only the admin's email. Note the team name and the application's AUD tag.
2. **Secrets** (from `apps/admin`): `pnpm exec wrangler secret put <NAME> --env preview` for `ADMIN_EMAIL`, `CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD`. Never set `ALLOW_LOCAL_ADMIN_IDENTITY` outside local (it is fatal).
3. **Preview deploy:** `cd apps/admin && CLOUDFLARE_ENV=preview pnpm build && pnpm exec wrangler deploy --env preview`, then sign in through Access as the admin and check every screen.
4. **Cutover** (after the preview sign-in): add the production environment to `apps/admin/wrangler.toml`, set the same secrets for production, deploy, then retire the old worker. Recovery is always changing the Access policy in Cloudflare.

Before shipping, the built-worker checks run on request: `pnpm --filter apps-admin build && E2E_APPS=admin pnpm exec playwright test tests/e2e/admin.spec.ts --workers=1`.

## 4. Database (D1)

`gamo-db-preview` and `gamo-db-production` (one per environment, shared by the apps), old schema in `packages/db/migrations`. The rebuild's data model replaces it through an owner-approved step; nothing is dropped or reset automatically.

```sh
cd apps/web
pnpm exec wrangler d1 export gamo-db-<env> --env <env> --remote --output ../../backup-<env>-<date>.sql   # backup first; never commit it
pnpm exec wrangler d1 migrations list gamo-db-<env> --env <env> --remote
```

Apply migrations before deploying code that needs them. D1 Time Travel (`wrangler d1 time-travel restore …`) is destructive and owner-only. Locally: `pnpm db:migrate:local`, `pnpm db:seed:local`, `pnpm db:reset:local` (deletes local data).

## 5. Gamo Live database and catalog

Gamo Live has its own D1 database (`LIVE_DB`; schema in `packages/db/live/migrations`, design in `docs/LIVE_DATA_MODEL.md`). `apps/live` and `apps/web` (which reads the catalog for `/live`) bind it; `apps/admin` will bind it for review screens.

Locally (creates the Miniflare database under `apps/live/.wrangler`, safe to repeat):

```sh
pnpm db:migrate:live:local                 # apply the Live migrations locally
pnpm live:catalog:import                   # import the verified catalog (data/gamo_live_verified_events_2026-10-15.json); records wait for admin review
pnpm live:catalog:import --publish-approved   # local seeding: also publish records that pass every editorial rule
pnpm live:catalog:import --env production --dry-run   # evaluate only; preview/production are never written by this script
```

Owner-only steps before Live can run in preview or production (not done): create `gamo-live-db-preview` and `gamo-live-db-production` (`wrangler d1 create`), add their ids to a `[[env.<env>.d1_databases]]` block with binding `LIVE_DB` and `migrations_dir = "../../packages/db/live/migrations"` in `apps/live/wrangler.toml` and `apps/web/wrangler.toml`, apply the migrations (`wrangler d1 migrations apply LIVE_DB --env <env> --remote`), then set `PII_HASH_SECRET` (32+ characters; keys the registration hashes and codes) and the Resend variables (`RESEND_API_KEY`, `EMAIL_FROM`) as Live secrets. Until then Live's data pages answer "unavailable" and registration fails closed.

### Organizer sign-in (Clerk, Gamo Live's own application)

Built: `/account/signin`, `/account/signup`, `/account/signed-out`, the organizer area under `/organizer`. The browser signs in with clerk-js using an emailed 6-digit code; the server verifies the session token (signature, issuer, expiry, authorized party), reads the **verified** email from Clerk's Backend API, then starts Gamo's own organizer session (an HttpOnly cookie; only its hash is stored in `organizer_sessions`, 7 days).

Owner-only setup (Clerk dashboard and Cloudflare; not done):

1. In Live's Clerk application (never another product's): enable **Email verification code** for sign-in and require a verified email address at sign-up; turn passwords off. Add the Live origins (`https://live.gamostudio.org`, the preview origin, `http://127.0.0.1:4324` for development) to the allowed origins.
2. Set Live variables (`apps/live/.dev.vars` locally, `wrangler secret put … --env <preview|production>` deployed): `PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE`, `CLERK_SECRET_KEY_LIVE`; optional `CLERK_JWT_KEY_LIVE` (PEM public key, verification without a network call) and `CLERK_AUTHORIZED_PARTIES_LIVE` (comma-separated origins). Development keys (`pk_test_`/`sk_test_`) are an error in production.
3. CSP: only the three sign-in pages add Clerk's origins, derived from the publishable key: the Frontend API (script and connect), `https://challenges.cloudflare.com` (script and frame), `https://img.clerk.com` (images) and `https://clerk-telemetry.com` (connect). **Clerk Protect (bot protection) loads `cdn.protect.clerk.com` and an inline script, which this CSP refuses (it was the cause of the failed production sign-up).** Keep Clerk Protect off for Live's instance, or approve that origin explicitly; verify the sign-in flow in a preview deployment before production.
4. Without Clerk keys, sign-in answers 503 ("not available right now"). Only `ENVIRONMENT=local` with `ALLOW_AUTH_SIMULATION=true` and no Clerk keys shows a clearly labeled local stand-in sign-in form (any email creates a local organizer); the flag is fatal anywhere else.

Local registration emails (the 6-digit code, the confirmation link) are printed in the `astro dev` terminal of `apps/live`; nothing is sent while `ENVIRONMENT=local` has no Resend key.

## 6. After a deploy

For each public host: `/`, `/robots.txt`, `/sitemap.xml` (and `/llms.txt` on gamostudio.org) return 200; an unknown path shows the branded 404; `curl -sI https://<host>/` shows `content-security-policy`, `strict-transport-security` and `x-content-type-options: nosniff`; `pnpm exec wrangler tail --env <env>` from the app shows no `[env:<app>] fatal` lines. Admin: a visit without Access is stopped; the admin's email gets in.

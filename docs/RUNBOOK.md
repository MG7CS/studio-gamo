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

## 5. Gamo Live catalog

The verified external catalog is `data/gamo_live_verified_events_2026-10-15.json` (also bundled in `packages/domain/src/services/verified-catalog-2026-10-15.ts`; import report in `docs/GAMO_LIVE_IMPORT_REPORT_2026-10-15.md`). Imported listings are real events with source links, shown only after editorial approval. Production holds these 20 events today.

Locally:

```sh
pnpm db:migrate:local
pnpm db:seed:local     # provision the publisher, import, publish approved records
```

The editorial CLI (`scripts/live/editorial-cli.ts`) writes only to the local database; with `--env preview|production` it supports `--dry-run` and refuses `--apply`. The rebuilt Live re-imports the catalog into its new data model.

## 6. After a deploy

For each public host: `/`, `/robots.txt`, `/sitemap.xml` (and `/llms.txt` on gamostudio.org) return 200; an unknown path shows the branded 404; `curl -sI https://<host>/` shows `content-security-policy`, `strict-transport-security` and `x-content-type-options: nosniff`; `pnpm exec wrangler tail --env <env>` from the app shows no `[env:<app>] fatal` lines. Admin: a visit without Access is stopped; the admin's email gets in.

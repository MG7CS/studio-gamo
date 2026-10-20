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
2. **Secrets** (from `apps/admin`): `pnpm exec wrangler secret put <NAME> --env preview` for `ADMIN_EMAIL`, `CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD`. Never set `ALLOW_LOCAL_ADMIN_IDENTITY` or `GAMO_DEV_PHONE_TOKEN` outside local (both are fatal).
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

**Admin.** `apps/admin` binds `LIVE_DB` too (Event review, Organizations, Catalog and the Inbox read it; the other queues still read the shared database). Add the same `[[env.<env>.d1_databases]]` block to `apps/admin/wrangler.toml` when creating the Live databases. Decisions on events email the organization's owners through Resend, so set `RESEND_API_KEY` and `EMAIL_FROM` as admin secrets; without them the decision is saved and the page says the owners were not emailed.

**Cleanup.** The admin's Cleanup tab runs the retention job by hand (registrant data 90 days after an event's last date, expired codes, old sessions and invitations, finished rate-limit counters) and reports what it removed. Nothing runs on a schedule; a cron trigger can be added later with the owner's approval. After pulling this release, apply Live migrations 0003 to 0006 (venue details, event revisions, hide/restore decisions, check-in window); `make live-db` does it locally.

**Local state.** The web, live and admin apps share one local state folder (`.wrangler/shared-state`, git-ignored) so an event submitted in Live is the one the admin reviews. `make live-db` (also run by `make dev-live`, `make dev-admin`, `make dev-all`) migrates it and imports the catalog; `pnpm db:reset:local` deletes it. Existing per-app state in `apps/<app>/.wrangler/state` is no longer used by those three apps. Running three dev servers against one SQLite file is fine for development; if you see "database is locked", retry the request.

**Phone on the same Wi-Fi.** Every `make dev-web`, `dev-worship`, `dev-academy`, `dev-live` and `dev-production` prints the this-computer URL and the Wi-Fi URL (`scripts/dev/print-urls.sh`, ports from `packages/config/apps.ts`) and sets `GAMO_DEV_LAN=1` so that one server listens on the network too. `make dev-all` stays on this computer unless you set `GAMO_DEV_LAN=1` by hand. `make dev-admin` is this computer only on purpose (its local identity stand-in is for this computer only). To view the admin on a phone run `make admin-phone` (it prepares the local Live database like `make dev-admin`): it makes a new random secret on every run, starts the admin on the network with it (`GAMO_DEV_LAN=1` and `GAMO_DEV_PHONE_TOKEN`, set by the script, never in a file), prints `http://<your Wi-Fi address>:4326/?phone=<secret>` and copies it to the clipboard. Open that link on the phone once (a redirect removes the secret from the address and sets an 8-hour cookie); the link stops working when you press Ctrl-C. On the network the admin answers 403 to every request without the secret, on this computer too while it runs, so use the same link there. Anyone who has the link can use the local admin (sample data only): keep it private, and note that it stays in the phone's browser history until you clear it. Anyone on the same network can reach a server started this way; use a network you trust. Phones allow the camera only on https or localhost. New app dev targets must call the same helper.

Local registration emails (the 6-digit code, the confirmation link) are printed in the `astro dev` terminal of `apps/live`; nothing is sent while `ENVIRONMENT=local` has no Resend key.

## 6. After a deploy

For each public host: `/`, `/robots.txt`, `/sitemap.xml` (and `/llms.txt` on gamostudio.org) return 200; an unknown path shows the branded 404; `curl -sI https://<host>/` shows `content-security-policy`, `strict-transport-security` and `x-content-type-options: nosniff`; `pnpm exec wrangler tail --env <env>` from the app shows no `[env:<app>] fatal` lines. Admin: a visit without Access is stopped; the admin's email gets in.

## 7. Gamo Live payments (Stripe, Connect, Terminal) — owner only

How money moves: [`LIVE_PAYMENTS.md`](LIVE_PAYMENTS.md). Nothing below has been done; no keys exist in any `.dev.vars`. **Test mode first.** Never paste keys into chat or commit them; Live refuses `sk_live_`/`rk_live_` outside production.

**New in this release, also for Cloudflare:** migrations `0008`–`0012` (`0008` rebuilds the `events` table and restores its dependent rows in the same migration: **export a backup first**, `wrangler d1 export … --remote`), the secrets `LIVE_TICKET_SECRET` (32+ random characters), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` for Live. The admin needs the same Stripe secret to run refunds and payouts (`STRIPE_SECRET_KEY`); its Live screens read `LIVE_DB` as before.

### 7.1 Local, without keys (works today)

`apps/live/.dev.vars`: `ALLOW_STRIPE_STANDIN=true` and no `STRIPE_SECRET_KEY`. The local stand-in creates sessions, accounts and readers and opens `/dev/stripe/checkout/<id>` instead of Stripe. Nothing leaves the computer.

### 7.2 Test mode (Stripe dashboard, test mode switched on)

1. **Account and business settings:** business name "Gamo Studios", public support email `hello@gamostudio.org`, statement descriptor (for example `GAMO LIVE`), branding. In Payment methods enable Cards, Apple Pay and Google Pay (hosted Checkout needs no domain registration).
2. **API key:** create a **restricted key** (recommended) or use the test secret key. Put it in `apps/live/.dev.vars` as `STRIPE_SECRET_KEY=sk_test_…` (or `rk_test_…`) and remove `ALLOW_STRIPE_STANDIN` (a key always wins). Restricted-key permissions: Checkout Sessions, PaymentIntents, Refunds, Disputes (read), Balance transactions (read), Accounts and Account Links (Connect), Transfers, Terminal (locations, readers, connection tokens not needed), Events (read).
3. **Connect platform profile** (Connect → Settings): platform name, the countries you onboard (US), "Platform" use case for a ticketing marketplace, branding for hosted onboarding, and the **return and refresh URLs** `https://<live host>/organizer/organization/payments` (`http://127.0.0.1:4324/...` locally).
   - **Mode A (organizer's own account):** connected accounts that process their own payments (direct charges, `card_payments` and `transfers` capabilities). Choose who pays Stripe fees (the connected account) and who is liable for losses (the connected account) in the controller settings.
   - **Mode B (Gamo collects):** connected accounts that only receive transfers (`transfers` capability); Gamo's platform is liable for refunds and disputes. Payouts stay manual in the admin (owner approval each time).
4. **Webhook endpoints** (Developers → Webhooks, API version as current):
   - **Platform** endpoint `https://<live host>/api/stripe/webhook`, events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `terminal.reader.action_succeeded`, `terminal.reader.action_failed`, `transfer.created`, `transfer.reversed`. Its signing secret is `STRIPE_WEBHOOK_SECRET`.
   - **Connect** endpoint ("Events on connected accounts") `https://<live host>/api/stripe/connect-webhook`, the same events plus `account.updated` and `account.application.deauthorized`. Its signing secret is `STRIPE_CONNECT_WEBHOOK_SECRET`.
   - **Locally** use the Stripe CLI: `stripe listen --forward-to 127.0.0.1:4324/api/stripe/webhook` and, in a second terminal, `stripe listen --forward-connect-to 127.0.0.1:4324/api/stripe/connect-webhook`; each prints a `whsec_…` for `.dev.vars`.
5. **Terminal:** locations are created by the app per organization (no dashboard step). To test a reader, pair a **simulated reader** from the organizer's Door tab with the registration code `simulated-s700` (test mode only).
6. **Preview:** `wrangler secret put STRIPE_SECRET_KEY --env preview` (test key), `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `LIVE_TICKET_SECRET` from `apps/live`; point the two test endpoints at the preview host.
7. **Choose the funds-flow mode** in the admin (Gamo Live → Live settings). Until then card sales stay unavailable.

### 7.3 Live mode (only after the owner approves production)

Complete Stripe's account activation (legal entity, bank account, tax details), repeat steps 1–4 in live mode with the production host, set the live key and the two live signing secrets as production secrets, order a physical reader (Stripe Reader S700 or BBPOS WisePOS E; Dashboard → Terminal → Shop) and pair it from the Door tab with the code it shows, run one small real purchase and refund, then approve the first payout (Mode B). Decide sales tax on admissions and review the ticket and organizer terms with counsel first.

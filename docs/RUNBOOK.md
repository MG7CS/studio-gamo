# Runbook

Operational procedures for Gamo Studios. **Every step that touches Cloudflare, Stripe, Resend, DNS or a remote database is an owner-only action** (AGENTS.md). Agents prepare and verify locally; the owner runs the remote commands.

> **2026-11-16 — Gamo Live removed.** `apps/live` and its workers are gone from the repository (snapshot: tag `four-programs-snapshot`). Owner actions are in [§12](#12-owner-actions-after-removing-gamo-live-2026-11-16).

> **2026-11-16 — public accounts removed.** Public sign-in, Clerk, onboarding, provider profiles and per-program dashboards are gone (spec: `docs/superpowers/specs/2026-11-16-forms-emails-invoices-design.md`). The admin app (Cloudflare Access + admin password, §8) is the only signed-in surface. Owner actions are in [§13](#13-owner-actions-after-removing-public-accounts-2026-11-16).

All commands run from the repository root unless stated. Account: `ebae7bded6ab45950aeba1d6cf51eb7f` (in each `wrangler.toml` and the Makefile).

## 0. Before any deploy

```sh
pnpm install --frozen-lockfile
pnpm check                      # must pass: typecheck, lint, format, tests, API checks, build, browser tests
pnpm --filter apps-web exec wrangler whoami   # or: make verify-config
make verify-deployment          # wrangler deploy --dry-run for all five apps
```

### Preflight

```sh
pnpm preflight all --env preview              # or: pnpm preflight academy --env production
pnpm preflight all --env production --no-remote   # configuration only, no Cloudflare calls
```

`pnpm preflight [app|all] --env preview|production` is read-only and never prints a secret value:

1. **Configuration (offline).** Reads each `apps/*/wrangler.toml` and reports, with the offending id: empty or placeholder KV/D1 ids and R2 bucket names, KV/D1/R2 resources **shared between environments** (this is how the single KV namespace of CLEANUP_LOG H-01 shows up), `ENVIRONMENT` not matching the environment, local-only flags set to `true`, a production Worker without a `custom_domain` route, preview and production sharing one Worker name, and an admin Worker that is not `workers_dev = false`.
2. **Worker secrets (remote, read-only).** If `wrangler` is logged in, runs `wrangler secret list --env <env> --format json` for each app and compares the **names** with §3: missing required secrets are errors; missing `RESEND_API_KEY`/`EMAIL_FROM` (needed for form, offer and invoice emails) are warnings; Stripe and break-glass names are noted as optional. A Worker that does not exist yet is reported as "not deployed yet".
3. **Not logged in →** the remote part is skipped with a message (log in yourself with `pnpm exec wrangler login`). `--no-remote` skips it on purpose; `--require-remote` turns a skipped or failed remote check into a failure.

Exit code: `1` if any error was found (✗), otherwise `0`; `2` for bad arguments. Warnings (`!`) do not fail the run. The checks live in `scripts/preflight/` and are covered by `scripts/preflight/preflight.test.ts`.

Then confirm any remaining item in §3 that preflight cannot see (values are never inspected, only that the names exist).

## 1. Deploy

Always preview first, then production.

| Step | Command |
| --- | --- |
| Preview one app | `make preview-<app>` (web, worship, academy, production) |
| Preview all public apps | `make preview-all` |
| Production one app | `make deploy-<app>` |
| Production, all | `make deploy-all` (order: web, worship, academy, production, admin) |

Each target runs `CLOUDFLARE_ENV=<preview|production> pnpm --filter apps-<app> build` — the build writes the environment's bindings and vars into the deploy configuration — then `wrangler deploy`. **Never deploy a build made without `CLOUDFLARE_ENV`**: it carries `ENVIRONMENT=local`, and env validation then answers every non-loopback request with 503 (fail-safe, but an outage).

**Local values never ship.** The build prints `Using secrets defined in .dev.vars` because `@astrojs/cloudflare` copies the Worker vars and the local `.dev.vars` into `process.env`, and `@cloudflare/vite-plugin` writes `dist/server/.dev.vars` for `astro preview`. For a `CLOUDFLARE_ENV` build, `gamoDeployBuildHygiene` (`packages/config/env-loader.ts`, in every `astro.config.mjs`) puts those keys back before Vite runs, deletes `dist/server/.dev.vars`, and **fails the build** if any value from a local env file is still anywhere in `dist` (it names the variable and file, never the value). `wrangler deploy` uploads `dist/server/entry.mjs` with its chunks and `dist/client` (minus `.assetsignore`), never `.dev.vars`.

Production routes use `custom_domain = true`, so the first deploy of an app creates its DNS record and certificate (gamostudio.org + www, worship., academy., production., admin.).

**Admin:** deploy only after the Cloudflare Access application for `admin.gamostudio.org` exists and its AUD tag is set as `CF_ACCESS_AUD`. Admin has `workers_dev = false` and no preview route, so `admin-preview` is not reachable until a route is added (owner decision).

## 2. Rollback

```sh
cd apps/<app>
pnpm exec wrangler deployments list --env <preview|production>
pnpm exec wrangler rollback <version-id> --env <preview|production>
```

Rollback restores code and vars, not secrets or the database. If a migration was applied with the release, check that the previous code still works with the new schema (migrations are additive; see `docs/DATABASE.md`) or restore the database (§4).

## 3. Environment variables and secrets

Plain vars (`ENVIRONMENT`, `PUBLIC_SITE_URL_*`, `PUBLIC_ROOT_DOMAIN`, `PLATFORM_*`, `REQUIRE_ADMIN_AUTH`, `STRIPE_SANDBOX_ENABLED`) live in each `wrangler.toml` per environment. Secrets are set per app and environment:

```sh
cd apps/<app> && pnpm exec wrangler secret put <NAME> --env <preview|production>
```

| App | Required | Optional (feature unavailable without it) |
| --- | --- | --- |
| all five | `SESSION_SECRET` (≥ 32 chars; same value across apps is not required) | — |
| web, worship, academy, production | — | `RESEND_API_KEY` + `EMAIL_FROM` (email delivery — **needed for form confirmations, staff notices, offers and invoices**; the sender domain `gamostudio.org` is verified in Resend, and when `EMAIL_FROM` is unset mail goes out as `Gamo Studios <hello@gamostudio.org>` with Reply-To `hello@gamostudio.org`) |
| academy | — | `STRIPE_SECRET_KEY` (test mode `sk_test_`/`rk_test_` only; paid registration answers 503 in production regardless) |
| web | — | `RESEND_WEBHOOK_SECRET` (see below) |
| admin | `CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD` | Break-glass: `ENABLE_BREAK_GLASS_AUTH`, `ADMIN_ACCESS_TOKEN`, `ADMIN_SECRET_KEY`, `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASS` (leave unset unless needed) |

**Forms, links and email.** All optional at startup; each one switches on a feature that otherwise **fails closed**. Missing ones are logged by name as warnings; a Gamo HMAC key shorter than 32 characters, or one that reuses `SESSION_SECRET` or another key, is an error. Generate each HMAC key separately, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, and set it with `wrangler secret put`.

| Name | Apps | Kind | Same value across apps? | You generate it, or a service issues it? | Without it (outside local) |
| --- | --- | --- | --- | --- | --- |
| `CUSTOMER_LINK_SECRET` | academy | secret, ≥ 32 chars | single app (links are also bound to the product) | **You generate** | manage/recovery links answer 503 |
| `PII_HASH_SECRET` | web, worship, academy, production | secret, ≥ 32 chars | **Identical in all four public apps** (they share one database; bounce/complaint suppressions are stored under a hash of the address and must match whichever app sends next). Different per environment. | **You generate** (once, then paste the same value into each app) | forms that record consent or rate-limit by address answer 503 |
| `PUBLIC_TURNSTILE_SITE_KEY` | web, worship, academy, production | var (public) | Either one shared widget listing all four hostnames, or one widget per app; both work (the hostname is not enforced) | **Cloudflare issues it** (dashboard → Turnstile → Add widget) | protected public forms answer 503 |
| `TURNSTILE_SECRET_KEY` | web, worship, academy, production | secret | Must be the secret of the widget whose site key the same app uses | **Cloudflare issues it** (shown with the site key) | protected public forms answer 503 |
| `STRIPE_TEST_CHECKOUT` | academy | var, `true` only in local/preview | per app | You set it | paid checkout answers 503. **`true` in production is fatal** (the app answers 503 everywhere; preflight reports `test-checkout-in-production`). |
| `RESEND_WEBHOOK_SECRET` | web only | secret (`whsec_…`) | single app; **different for preview and production** (separate webhooks) | **Resend issues it** when you create the webhook | `/api/webhook/resend` answers 503; no delivery/bounce updates |

Rules that apply to every row: each environment (preview, production) gets its **own** values — never copy production values into preview; generated secrets are random and at least 32 characters (`openssl rand -base64 48`); within one app no two of these HMAC keys, and not `SESSION_SECRET`, may share a value (startup reports an error by name). Setting a secret: `cd apps/<app> && pnpm exec wrangler secret put <NAME> --env <preview|production>`; the Turnstile site key and `STRIPE_TEST_CHECKOUT` entries that are vars can live in `wrangler.toml` per environment.

**Webhook URLs to register** (owner action; each service shows the signing secret once, after you save the endpoint):

| Service | URL to register | Events to select | Secret you copy back |
| --- | --- | --- | --- |
| Resend (one webhook per environment; the global site serves it and updates the shared database for mail sent by every app) | `https://gamostudio.org/api/webhook/resend` (preview: `https://gamo-web-preview.gamostudio.workers.dev/api/webhook/resend`) | `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` | `RESEND_WEBHOOK_SECRET` on web |

Clerk webhooks were removed with public accounts on 2026-11-16. The Gamo Live Stripe webhook (`/api/webhook/stripe`) was removed with `apps/live` on 2026-11-16; no Stripe webhook is registered yet (the forms/invoices plan adds an `invoice.paid` webhook on web in test mode; its setup will be documented here when it lands).

`EMAIL_FROM` must be on `gamostudio.org`.

Never set a local-only flag (the list in `packages/config/env-validation.ts`) to `true` outside local: the app refuses to serve (503).

On the first request each isolate logs missing configuration by **name** (`[env:<app>] error: …`). Check with `pnpm exec wrangler tail --env <env>` from `apps/<app>`.

### 3a. (Removed) Clerk

Removed 2026-11-16 with public accounts: no Clerk variables, secrets, webhooks or DNS records are used, and `scripts/set-clerk-secrets.sh` is gone. If Clerk applications or Clerk DNS records were ever created, see §13.

## 4. Database (D1)

Databases: `gamo-db-preview`, `gamo-db-production` (one per environment, shared by all apps). Migrations live in `packages/db/migrations`.

```sh
cd apps/web
pnpm exec wrangler d1 migrations list  gamo-db-<env> --env <env> --remote   # what is pending
pnpm exec wrangler d1 export           gamo-db-<env> --env <env> --remote --output ../../backup-<env>-<date>.sql   # backup first (do not commit it)
pnpm exec wrangler d1 migrations apply gamo-db-<env> --env <env> --remote
```

Apply migrations **before** deploying code that needs them. To undo a bad change, D1 Time Travel can restore to a point in time: `wrangler d1 time-travel restore gamo-db-<env> --timestamp <ISO time> --env <env>` (destructive — owner only). Local database commands: `docs/DATABASE.md`.

## 5. (Removed) Gamo Live catalog import

Removed 2026-11-16 with Gamo Live. Section numbers below are unchanged.

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
- Old account URLs (e.g. `/account/signin`) redirect (302) as listed in each app's `legacy-redirects.ts`; there is no public sign-in.
- Academy: paid registration answers 503 in production by design; "Reserve" works.
- `wrangler tail` shows no `[env:<app>] fatal` or `error` lines.
- Admin: an unauthenticated visit is stopped by Cloudflare Access.

## 8. First staff account

Admin needs a Cloudflare Access identity (the same email) **and** a D1 user with the `superadmin` role and an `admin_credentials` row. `ensureBootstrapAdminAccount` only works for explicit local demos on loopback, so for preview/production the SQL is generated locally and run by the owner.

### 8.1 Generate the SQL (local, nothing is sent anywhere)

```sh
pnpm staff:account:sql --env production            # asks for the email; --email you@example.org to skip the prompt
pnpm staff:account:sql --env preview --name "Full Name"
```

The script (`scripts/admin/first-staff-account.ts`):

- creates a strong random 24-character temporary password and **prints it once** to your terminal — store it in a password manager at once;
- writes `.staff-sql/first-superadmin-<env>-<timestamp>.sql` (git-ignored, mode 600). The file holds only the PBKDF2 hash (`hashAdminPassword`) and creates/activates the user, grants `superadmin` (global), and inserts the `admin_credentials` row with `must_change_password = 1`;
- an **existing** credential is left alone (so re-running cannot lock anyone out); add `--reset-password` to replace it and sign the account out everywhere;
- does **not** run `wrangler` and makes no network call.

Review the file, then run it yourself (the exact command is printed):

```sh
cd apps/admin && pnpm exec wrangler d1 execute gamo-db-production --env production --remote --file ../../.staff-sql/<file>.sql
```

Sign in at the admin host through Cloudflare Access with the same email, enter the temporary password, and set a new one when prompted. Then delete the SQL file.

### 8.2 Retire the historical bootstrap credential (CLEANUP_LOG H-02)

Earlier code (first seen in commit `e695029`, removed in this cleanup) hard-coded a bootstrap admin: an email (`BOOTSTRAP_ADMIN_EMAIL`), a display name and a **temporary password** (`BOOTSTRAP_ADMIN_TEMP_PASSWORD`). `ensureBootstrapAdminAccount` stored its hash in `admin_credentials` for that email with the `superadmin` role. That function only ran for local demos on loopback, so preview/production should not contain it — but the password is in git history, so assume it is known and **verify**.

1. Find the email without printing the password: `git show 5e964b6:packages/auth/index.ts | grep -n "BOOTSTRAP_ADMIN_EMAIL ="`.
2. Read-only check on each remote database (does the account exist, with a password or roles?):

   ```sh
   cd apps/admin && pnpm exec wrangler d1 execute gamo-db-production --env production --remote \
     --command "SELECT u.id, u.status, (SELECT COUNT(*) FROM admin_credentials c WHERE c.user_id = u.id) AS has_password, (SELECT COUNT(*) FROM user_roles r WHERE r.user_id = u.id) AS role_grants FROM users u WHERE u.email = '<that email>'"
   ```

   No row, or `has_password = 0` → nothing to retire for that database.
3. If it exists, choose by who the person is:
   - **The email is not going to be a staff account** → generate SQL that retires it: `pnpm staff:account:sql --env production --disable-user <that email>`. The file revokes its sessions, deletes its password and roles and sets `status = 'disabled'`. Review and run it as in §8.1.
   - **The email is the same person who will be the first staff account** → do not disable it; create the account with `pnpm staff:account:sql --env production --email <that email> --reset-password`. That replaces the known password with a new random one and signs the account out everywhere.

Generated files live only in `.staff-sql/` (git-ignored). Repeat for preview. The historical password stays in git history; rewriting history before the repository is ever public is a separate owner decision (H-02).

## 9. (Removed) Identity, onboarding and staff review

Removed 2026-11-16 with public accounts. Still needed for public forms: Turnstile (`PUBLIC_TURNSTILE_SITE_KEY` var, `TURNSTILE_SECRET_KEY` secret) and `PII_HASH_SECRET` on every public app (§3). All terms remain drafts ("DRAFT — requires legal review") until counsel reviews them. Erasure requests (hello@gamostudio.org) are handled by staff in admin.

## 10. Browser test servers

- `pnpm test:e2e` builds each app and serves it with `astro preview` (`scripts/e2e/test-servers.ts`); it never reuses a server already on a port.

(Door scanning and venue maps were Gamo Live features, removed 2026-11-16.)

## 11. (Removed) Gamo Live ticketing

Removed 2026-11-16. Academy's paid registration keeps the same test-only gate: on **preview** set `STRIPE_TEST_CHECKOUT=true` and a `sk_test_…` key on academy; never set `STRIPE_TEST_CHECKOUT` in production (the startup check treats it as fatal).

## 12. Owner actions after removing Gamo Live (2026-11-16)

Nothing was done remotely by agents. In Cloudflare and Resend:

1. **Delete the Live Workers** `gamo-live` (production) and `gamo-live-preview` (preview): dashboard → Workers & Pages → each Worker → Settings → Delete (or `pnpm exec wrangler delete --name gamo-live`, then `--name gamo-live-preview`).
2. **Remove the `live.gamostudio.org` custom domain/route** (Workers → `gamo-live` → Settings → Domains & Routes, before or with the deletion) and delete any leftover `live` DNS record in the `gamostudio.org` zone.
3. **Move the Resend webhook to web:** in Resend, edit (or recreate) the webhook so its URL is `https://gamostudio.org/api/webhook/resend` (preview: `https://gamo-web-preview.gamostudio.workers.dev/api/webhook/resend`), events as in §3; then set its signing secret on web: `cd apps/web && pnpm exec wrangler secret put RESEND_WEBHOOK_SECRET --env <preview|production>`. A recreated webhook issues a new `whsec_…`; use that value.
4. **Apply migration `0018_remove_gamo_live.sql`** (drops the Live tables; destructive, owner-approved; production holds only test data) following §4: back up first, apply, then deploy.
5. **Optional clean-up:** delete the Gamo Live Clerk application (if one was ever created) and remove `live.gamostudio.org` from any Turnstile widget. Live-only secrets (`TICKET_QR_SECRET_GL1`, `SCANNER_SESSION_SECRET`, `STRIPE_WEBHOOK_SECRET`) disappear with the Workers.

## 13. Owner actions after removing public accounts (2026-11-16)

Nothing was done remotely by agents. When the forms/emails/invoices release is deployed (once, at the end of the plan):

1. **Apply migration `0019_remove_public_accounts.sql`** (drops the public-account tables; destructive, owner-approved with the plan; production holds only test data) following §4: back up first, apply, then deploy.
2. **Clerk clean-up (if anything was ever created):** delete the Gamo Web, Worship, Academy and Production Clerk applications; remove any Clerk DNS records (for example `clerk.`, `accounts.`, `clk._domainkey` CNAMEs) from the `gamostudio.org` zone; delete any `CLERK_*` / `PUBLIC_CLERK_*` secrets left on the Workers (`pnpm exec wrangler secret delete <NAME> --env <env>` from `apps/<app>`).
3. **Delete retired secrets/vars** if set: `CLERK_WEBHOOK_SECRET_<APP>`, `CLERK_GOOGLE_ENABLED_<APP>`, `CLERK_APP_ID_<APP>`, `CLERK_AUTHORIZED_PARTIES_<APP>`.
4. Admin staff authentication (Cloudflare Access + admin password, §8) is unchanged.

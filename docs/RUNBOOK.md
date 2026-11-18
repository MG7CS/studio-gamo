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

Plain vars (`ENVIRONMENT`, `PUBLIC_SITE_URL_*`, `PUBLIC_ROOT_DOMAIN`, `PLATFORM_*`, `REQUIRE_ADMIN_AUTH`) live in each `wrangler.toml` per environment. Secrets are set per app and environment:

```sh
cd apps/<app> && pnpm exec wrangler secret put <NAME> --env <preview|production>
```

| App | Required | Optional (feature unavailable without it) |
| --- | --- | --- |
| all five | `SESSION_SECRET` (≥ 32 chars; same value across apps is not required) | — |
| web, worship, academy, production | — | `RESEND_API_KEY` + `EMAIL_FROM` (email delivery — **needed for form confirmations, staff notices, offers and invoices**; the sender domain `gamostudio.org` is verified in Resend, and when `EMAIL_FROM` is unset mail goes out as `Gamo Studios <hello@gamostudio.org>` with Reply-To `hello@gamostudio.org`) |
| web, worship, production | `FORM_UPLOAD_SECRET` wherever `MEDIA_BUCKET` is bound (all three bind it; uploads answer 503 without it) | `INQUIRY_INBOX_EMAIL` (staff notice for each new submission; **recommended**, warned by name when unset) |
| academy | — | `STRIPE_SECRET_KEY` (test mode `sk_test_`/`rk_test_` only; paid registration answers 503 in production regardless) |
| web | — | `RESEND_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET` (see below) |
| admin | `CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD` | `INQUIRY_INBOX_EMAIL` (recommended), `INVOICE_PAYMENT_INSTRUCTIONS`, `STRIPE_SECRET_KEY` (test mode only), `GAMO_ADMIN_FEE_APPROVED` (default `false`). Break-glass: `ENABLE_BREAK_GLASS_AUTH`, `ADMIN_ACCESS_TOKEN`, `ADMIN_SECRET_KEY`, `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASS` (leave unset unless needed) |

**Forms, links and email.** All optional at startup; each one switches on a feature that otherwise **fails closed**. Missing ones are logged by name as warnings; a Gamo HMAC key shorter than 32 characters, or one that reuses `SESSION_SECRET` or another key, is an error. Generate each HMAC key separately, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, and set it with `wrangler secret put`.

| Name | Apps | Kind | Same value across apps? | You generate it, or a service issues it? | Without it (outside local) |
| --- | --- | --- | --- | --- | --- |
| `CUSTOMER_LINK_SECRET` | academy | secret, ≥ 32 chars | single app (links are also bound to the product) | **You generate** | manage/recovery links answer 503 |
| `PII_HASH_SECRET` | web, worship, academy, production | secret, ≥ 32 chars | **Identical in all four public apps** (they share one database; bounce/complaint suppressions are stored under a hash of the address and must match whichever app sends next). Different per environment. | **You generate** (once, then paste the same value into each app) | forms that record consent or rate-limit by address answer 503 |
| `PUBLIC_TURNSTILE_SITE_KEY` | web, worship, academy, production | var (public) | Either one shared widget listing all four hostnames, or one widget per app; both work (the hostname is not enforced) | **Cloudflare issues it** (dashboard → Turnstile → Add widget) | protected public forms answer 503 |
| `TURNSTILE_SECRET_KEY` | web, worship, academy, production | secret | Must be the secret of the widget whose site key the same app uses | **Cloudflare issues it** (shown with the site key) | protected public forms answer 503 |
| `STRIPE_TEST_CHECKOUT` | academy | var, `true` only in local/preview | per app | You set it | paid checkout answers 503. **`true` in production is fatal** (the app answers 503 everywhere; preflight reports `test-checkout-in-production`). |
| `RESEND_WEBHOOK_SECRET` | web only | secret (`whsec_…`) | single app; **different for preview and production** (separate webhooks) | **Resend issues it** when you create the webhook | `/api/webhook/resend` answers 503; no delivery/bounce updates |
| `INQUIRY_INBOX_EMAIL` | web, worship, production, admin | var or secret; one plain address (no display name, no list) | **Same value** in all four (whichever app hosts the form sends the notice; admin links to it) | **You choose it** (an inbox staff read, e.g. a `gamostudio.org` mailbox) | staff are not emailed about new submissions (logged by name, **recommended**); the submitter's receipt is still sent. A malformed value is an error and also skips staff notices |
| `FORM_UPLOAD_SECRET` | web, worship, production | secret, ≥ 32 chars | Per app is fine (each app verifies the upload tokens it issued); must differ from `SESSION_SECRET`, `CUSTOMER_LINK_SECRET`, `PII_HASH_SECRET` and every other key. Different per environment | **You generate** | **Required when `MEDIA_BUCKET` is bound** (startup reports an error by name); form file uploads answer 503 (a form can still be submitted with a link) |
| `STRIPE_SECRET_KEY` | admin (Invoicing), academy (test checkout) | secret, **test mode only** (`sk_test_…` / `rk_test_…`) | Per app; preview and production each get their own **test** key | **Stripe issues it** (dashboard, test mode) | admin sends **manual invoices** (below) instead of Stripe invoices. **A live key (`sk_live_`/`rk_live_`) is fatal**: the app answers 503 everywhere |
| `STRIPE_WEBHOOK_SECRET` | web only | secret (`whsec_…`) | single app; **different for preview and production** | **Stripe issues it** when you add the webhook endpoint | `/api/webhook/stripe` answers 503; paid Stripe invoices are not marked paid automatically (staff can use **Mark paid**). Not warned about: Stripe is optional |
| `INVOICE_PAYMENT_INSTRUCTIONS` | admin only | var or secret; free text | single app | **You write it** (e.g. how to pay by Zelle, check or ACH) | manual invoice emails carry no payment instructions (warned by name) |
| `GAMO_ADMIN_FEE_APPROVED` | admin only | var, `true` or `false`; **default `false`** | single app | **Board decision**, then you set it | `gamo_admin` invoice lines are rejected. **Keep it `false` until the board approves a Gamo administrative fee** (AGENTS.md: all fees stay proposals until approved; musician pay and any Gamo allocation are always separate line items). `true` is logged as a warning every start so it is never set unnoticed; any other value is an error and counts as `false` |

**Bindings** (declared in each app's `wrangler.toml`, nothing to set by hand): `MEDIA_BUCKET` is the R2 bucket `gamo-media-<local|preview|production>` (web, worship, production write form uploads; admin reads them, §3b). `IMAGES` is the Cloudflare Images binding that re-encodes uploaded photos; `@astrojs/cloudflare` adds it to the generated config for every app and environment, so it has no `wrangler.toml` entry. Both are typed in `packages/config/env.ts` (`R2BucketBinding`, `ImagesBindingLike`).

Rules that apply to every row: each environment (preview, production) gets its **own** values — never copy production values into preview; generated secrets are random and at least 32 characters (`openssl rand -base64 48`); within one app no two of these HMAC keys, and not `SESSION_SECRET`, may share a value (startup reports an error by name). Setting a secret: `cd apps/<app> && pnpm exec wrangler secret put <NAME> --env <preview|production>`; the Turnstile site key and `STRIPE_TEST_CHECKOUT` entries that are vars can live in `wrangler.toml` per environment.

**Webhook URLs to register** (owner action; each service shows the signing secret once, after you save the endpoint):

| Service | URL to register | Events to select | Secret you copy back |
| --- | --- | --- | --- |
| Stripe (test mode; one endpoint per environment; web serves it, admin creates the invoices) | `https://gamostudio.org/api/webhook/stripe` (preview: `https://gamo-web-preview.gamostudio.workers.dev/api/webhook/stripe`) | `invoice.paid`, `invoice.payment_failed` | `STRIPE_WEBHOOK_SECRET` on web |
| Resend (one webhook per environment; the global site serves it and updates the shared database for mail sent by every app) | `https://gamostudio.org/api/webhook/resend` (preview: `https://gamo-web-preview.gamostudio.workers.dev/api/webhook/resend`) | `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` | `RESEND_WEBHOOK_SECRET` on web |

Clerk webhooks were removed with public accounts on 2026-11-16. The Gamo Live Stripe webhook was removed with `apps/live` on 2026-11-16; the Stripe row above is the new, invoice-only endpoint (**test mode only**; register it in the Stripe dashboard with test mode on, and never with a live key). Until it is registered and `STRIPE_WEBHOOK_SECRET` is set, `/api/webhook/stripe` answers 503 and staff mark invoices paid by hand.

`EMAIL_FROM` must be on `gamostudio.org`.

Never set a local-only flag (the list in `packages/config/env-validation.ts`) to `true` outside local: the app refuses to serve (503).

On the first request each isolate logs missing configuration by **name** (`[env:<app>] error: …`). Check with `pnpm exec wrangler tail --env <env>` from `apps/<app>`.

### 3a. (Removed) Clerk

Removed 2026-11-16 with public accounts: no Clerk variables, secrets, webhooks or DNS records are used, and `scripts/set-clerk-secrets.sh` is gone. If Clerk applications or Clerk DNS records were ever created, see §13.

### 3b. Form uploads, R2 lifecycle rules and the daily job

**R2 lifecycle rules (owner action, once per bucket; agents never touch the buckets).** Form uploads are written under `forms/…` in `gamo-media-preview` and `gamo-media-production`. Set these three rules on **each** bucket (they are the safety net behind the daily job):

| Rule | Prefix | Setting | Why |
| --- | --- | --- | --- |
| `forms-pending-expire` | `forms/pending/` | expire objects after **2 days** | uploads never attached to a submission (abandoned forms) |
| `forms-declined-expire` | `forms/declined/` | expire objects after **90 days** | files of declined applications |
| `abort-incomplete-multipart` | (all prefixes) | abort incomplete multipart uploads after **7 days** | interrupted video uploads |

```sh
cd apps/web
for bucket in gamo-media-preview gamo-media-production; do
  pnpm exec wrangler r2 bucket lifecycle add "$bucket" forms-pending-expire forms/pending/ --expire-days 2
  pnpm exec wrangler r2 bucket lifecycle add "$bucket" forms-declined-expire forms/declined/ --expire-days 90
  pnpm exec wrangler r2 bucket lifecycle add "$bucket" abort-incomplete-multipart "" --abort-multipart-days 7
done
pnpm exec wrangler r2 bucket lifecycle list gamo-media-production   # confirm
```

(Dashboard equivalent: R2 → bucket → Settings → Object lifecycle rules.) Files are served only through admin (`/files/{id}`, staff-authenticated, `attachment`/`nosniff`/`sandbox`); the buckets stay private with no public access or custom domain.

**Daily job.** One cron trigger on **web only**, `0 6 * * *` (06:00 UTC, daily), in the preview and production environments (`[env.preview.triggers]` and `[env.production.triggers]` in `apps/web/wrangler.toml`; local has none). The web Worker uses the custom entry `apps/web/src/worker.ts` (`main` in `wrangler.toml`), which exports Astro's `fetch` and a `scheduled` handler that runs `runDailyJobs` (`packages/domain/src/jobs/daily.ts`); `wrangler deploy --env <env>` registers the schedule. Each run, in this order: (1) retries up to 100 due outbox emails, re-rendered from the database (an `offer_sent` email cannot be re-rendered because only the token's hash is stored, so its row is closed as `not_renderable`; staff see the failed send and can withdraw and re-offer); (2) deletes pending upload sessions and objects older than 48 hours; (3) deletes the files (not the record) of applications declined more than 90 days ago; (4) deletes submissions past their `delete_after` (declined applications after 12 months), files first, up to 200 per run; (5) expires stale offers; (6) purges customer link tokens expired more than 30 days ago; (7) purges finished rate-limit windows; (8) clears email addresses from the outbox log after 180 days. Jobs 2 to 4 need `MEDIA_BUCKET` and `FORM_UPLOAD_SECRET` on web. Check the schedule under Workers → `gamo-web` → Settings → Triggers, and watch a run with `pnpm exec wrangler tail --env production`: one `[daily-jobs] done …` line of counts (and `failures=` naming any job that threw). A failing job logs its name and error name only, never a message or personal data, and never stops the others; every job is safe to run twice, so a missed or duplicated trigger needs no cleanup.

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
5. **Optional clean-up:** delete the Gamo Live Clerk application (if one was ever created) and remove `live.gamostudio.org` from any Turnstile widget. Live-only secrets (`TICKET_QR_SECRET_GL1`, `SCANNER_SESSION_SECRET`) disappear with the Workers; delete the old Gamo Live `STRIPE_WEBHOOK_SECRET` and Stripe endpoint too. A new, invoice-only `STRIPE_WEBHOOK_SECRET` returns on web (§3).

## 13. Owner actions after removing public accounts (2026-11-16)

Nothing was done remotely by agents. When the forms/emails/invoices release is deployed (once, at the end of the plan):

1. **Apply migration `0019_remove_public_accounts.sql`** (drops the public-account tables; destructive, owner-approved with the plan; production holds only test data) following §4: back up first, apply, then deploy.
2. **Clerk clean-up (if anything was ever created):** delete the Gamo Web, Worship, Academy and Production Clerk applications; remove any Clerk DNS records (for example `clerk.`, `accounts.`, `clk._domainkey` CNAMEs) from the `gamostudio.org` zone; delete any `CLERK_*` / `PUBLIC_CLERK_*` secrets left on the Workers (`pnpm exec wrangler secret delete <NAME> --env <env>` from `apps/<app>`).
3. **Delete retired secrets/vars** if set: `CLERK_WEBHOOK_SECRET_<APP>`, `CLERK_GOOGLE_ENABLED_<APP>`, `CLERK_APP_ID_<APP>`, `CLERK_AUTHORIZED_PARTIES_<APP>`.
4. Admin staff authentication (Cloudflare Access + admin password, §8) is unchanged.
5. **Open gates carried over from the 2026-10 backend audit** (`docs/BACKEND_RELEASE_READINESS.md`, historical):
   - **Resend production setup:** confirm the `gamostudio.org` sending domain is still verified in Resend (SPF, DKIM, DMARC), then set `RESEND_API_KEY` and `EMAIL_FROM` per §3 so form, offer and invoice emails send for real.
   - **Edge rate limiting:** add Cloudflare WAF / Workers Rate Limiting rules on the public form endpoints and webhooks (`/api/webhook/resend`, and the forms and Stripe webhook routes once Phases 2–3 ship), in addition to the in-app per-IP/per-email limits.
   - **R2 upload pipeline:** confirm the `gamo-media-<env>` buckets and set the R2 lifecycle rules for form uploads (§3b) before uploads go live; set `FORM_UPLOAD_SECRET` on web, worship and production.
   - **Staff notices, invoices and Stripe test mode:** set `INQUIRY_INBOX_EMAIL` (web, worship, production, admin), `INVOICE_PAYMENT_INSTRUCTIONS` on admin, optionally a Stripe **test** key on admin and the invoice webhook (§3); leave `GAMO_ADMIN_FEE_APPROVED` unset/`false` until the board approves a fee.
6. **Release scope check (2026-11-18):** the public Worship and Production forms and the offer page now exist (DECISIONS 2026-11-18). After the first deploy, sign in to admin and open **Forms** once: that publishes the six default forms (until then the form pages answer 404). Known gaps are in BUILD_LOG 2026-11-18 (photo upload needs JavaScript).

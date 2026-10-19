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

### Preflight

```sh
pnpm preflight all --env preview              # or: pnpm preflight live --env production
pnpm preflight all --env production --no-remote   # configuration only, no Cloudflare calls
```

`pnpm preflight [app|all] --env preview|production` is read-only and never prints a secret value:

1. **Configuration (offline).** Reads each `apps/*/wrangler.toml` and reports, with the offending id: empty or placeholder KV/D1 ids and R2 bucket names, KV/D1/R2 resources **shared between environments** (this is how the single KV namespace of CLEANUP_LOG H-01 shows up), `ENVIRONMENT` not matching the environment, local-only flags set to `true`, a production Worker without a `custom_domain` route, preview and production sharing one Worker name, and an admin Worker that is not `workers_dev = false`.
2. **Worker secrets (remote, read-only).** If `wrangler` is logged in, runs `wrangler secret list --env <env> --format json` for each app and compares the **names** with §3: missing required secrets are errors; missing `RESEND_API_KEY`/`EMAIL_FROM` (needed for emailed sign-in codes) are warnings; Stripe and break-glass names are noted as optional; a partly filled Clerk group is a warning. A Worker that does not exist yet is reported as "not deployed yet".
3. **Not logged in →** the remote part is skipped with a message (log in yourself with `pnpm exec wrangler login`). `--no-remote` skips it on purpose; `--require-remote` turns a skipped or failed remote check into a failure.

Exit code: `1` if any error was found (✗), otherwise `0`; `2` for bad arguments. Warnings (`!`) do not fail the run. The checks live in `scripts/preflight/` and are covered by `scripts/preflight/preflight.test.ts`.

Then confirm any remaining item in §3 that preflight cannot see (values are never inspected, only that the names exist).

## 1. Deploy

Always preview first, then production.

| Step | Command |
| --- | --- |
| Preview one app | `make preview-<app>` (web, worship, academy, live, production) |
| Preview all public apps | `make preview-all` |
| Production one app | `make deploy-<app>` |
| Production, all | `make deploy-all` (order: web, worship, academy, live, production, admin) |

Each target runs `CLOUDFLARE_ENV=<preview|production> pnpm --filter apps-<app> build` — the build writes the environment's bindings and vars into the deploy configuration — then `wrangler deploy`. **Never deploy a build made without `CLOUDFLARE_ENV`**: it carries `ENVIRONMENT=local`, and env validation then answers every non-loopback request with 503 (fail-safe, but an outage).

**Local values never ship.** The build prints `Using secrets defined in .dev.vars` because `@astrojs/cloudflare` copies the Worker vars and the local `.dev.vars` into `process.env`, and `@cloudflare/vite-plugin` writes `dist/server/.dev.vars` for `astro preview`. For a `CLOUDFLARE_ENV` build, `gamoDeployBuildHygiene` (`packages/config/env-loader.ts`, in every `astro.config.mjs`) puts those keys back before Vite runs, deletes `dist/server/.dev.vars`, and **fails the build** if any value from a local env file is still anywhere in `dist` (it names the variable and file, never the value). `wrangler deploy` uploads `dist/server/entry.mjs` with its chunks and `dist/client` (minus `.assetsignore`), never `.dev.vars`.

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
| web, worship, academy, live, production | — | `RESEND_API_KEY` + `EMAIL_FROM` (email delivery — **needed for sign-in codes at launch**; the sender domain `gamostudio.org` is verified in Resend, and when `EMAIL_FROM` is unset mail goes out as `Gamo Studios <hello@gamostudio.org>` with Reply-To `hello@gamostudio.org`); Clerk for that product (optional, deferred — see §3a) |
| live | — | `STRIPE_SECRET_KEY` (test mode `sk_test_`/`rk_test_` only; checkout stays 503 regardless until order authority exists), `STRIPE_WEBHOOK_SECRET` |
| admin | `CF_ACCESS_TEAM_NAME`, `CF_ACCESS_AUD` | Break-glass: `ENABLE_BREAK_GLASS_AUTH`, `ADMIN_ACCESS_TOKEN`, `ADMIN_SECRET_KEY`, `ADMIN_BASIC_AUTH_USER`, `ADMIN_BASIC_AUTH_PASS` (leave unset unless needed) |

**Identity and ticketing** (docs/design/identity-and-ticketing.md §10). All optional at startup; each one switches on a feature that otherwise **fails closed**. Missing ones are logged by name as warnings; a Gamo HMAC key shorter than 32 characters, or one that reuses `SESSION_SECRET` or another key, is an error. Generate each HMAC key separately, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`, and set it with `wrangler secret put`.

| Name | Apps | Kind | Same value across apps? | You generate it, or a service issues it? | Without it (outside local) |
| --- | --- | --- | --- | --- | --- |
| `TICKET_QR_SECRET_GL1` | live | secret, ≥ 32 chars | single app | **You generate** | ticket issue and scanning answer 503. Rotation later adds `TICKET_QR_SECRET_GL2` (optional, same rules) while GL1 stays accepted. |
| `CUSTOMER_LINK_SECRET` | live, academy | secret, ≥ 32 chars | **Unique per app** (links are also bound to the product, but do not share the value) | **You generate** | manage/recovery links answer 503 |
| `PII_HASH_SECRET` | web, worship, academy, live, production | secret, ≥ 32 chars | **Identical in all five apps** (they share one database; bounce/complaint suppressions are stored under a hash of the address and must match whichever app sends next). Different per environment. | **You generate** (once, then paste the same value into each app) | forms that record consent or rate-limit by address answer 503 |
| `SCANNER_SESSION_SECRET` | live | secret, ≥ 32 chars | single app | **You generate** | door scanner answers 503 |
| `PUBLIC_TURNSTILE_SITE_KEY` | web, worship, academy, live, production | var (public) | Either one shared widget listing all five hostnames, or one widget per app; both work (the hostname is not enforced) | **Cloudflare issues it** (dashboard → Turnstile → Add widget) | protected public forms answer 503 |
| `TURNSTILE_SECRET_KEY` | web, worship, academy, live, production | secret | Must be the secret of the widget whose site key the same app uses | **Cloudflare issues it** (shown with the site key) | protected public forms answer 503 |
| `STRIPE_TEST_CHECKOUT` | live, academy | var, `true` only in local/preview | per app | You set it | paid checkout answers 503. **`true` in production is fatal** (the app answers 503 everywhere; preflight reports `test-checkout-in-production`). |
| `RESEND_WEBHOOK_SECRET` | live only | secret (`whsec_…`) | single app; **different for preview and production** (separate webhooks) | **Resend issues it** when you create the webhook | `/api/webhook/resend` answers 503; no delivery/bounce updates |
| `CLERK_WEBHOOK_SECRET_WEB`, `_WORSHIP`, `_ACADEMY`, `_LIVE`, `_PRODUCTION` | the matching app, only if that product uses Clerk | secret (`whsec_…`) | **Unique per app** (one per Clerk application) | **Clerk issues it** when you add the endpoint | `/api/auth/clerk-webhook` answers 503; a session ended in Clerk stays valid here up to 7 days |
| `CLERK_GOOGLE_ENABLED_WEB`, `_WORSHIP`, `_ACADEMY`, `_LIVE`, `_PRODUCTION` | the matching app | var (`true`) | per app | You set it, after enabling Google in that product's Clerk app | "Continue with Google" stays hidden (also hidden while that product's Clerk is off) |

Rules that apply to every row: each environment (preview, production) gets its **own** values — never copy production values into preview; generated secrets are random and at least 32 characters (`openssl rand -base64 48`); within one app no two of these HMAC keys, and not `SESSION_SECRET`, may share a value (startup reports an error by name). Setting a secret: `cd apps/<app> && pnpm exec wrangler secret put <NAME> --env <preview|production>`; the two Turnstile and `*_ENABLED` / `STRIPE_TEST_CHECKOUT` entries that are vars can live in `wrangler.toml` per environment.

**Webhook URLs to register** (owner action; each service shows the signing secret once, after you save the endpoint):

| Service | URL to register | Events to select | Secret you copy back |
| --- | --- | --- | --- |
| Resend (one webhook per environment; Live serves it and updates the shared database for mail sent by every app) | `https://live.gamostudio.org/api/webhook/resend` (preview: `https://gamo-live-preview.gamostudio.workers.dev/api/webhook/resend`) | `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` | `RESEND_WEBHOOK_SECRET` on live |
| Clerk — Gamo Web application | `https://gamostudio.org/api/auth/clerk-webhook` | `session.ended`, `session.revoked`, `session.removed`, `user.deleted`, `user.banned` | `CLERK_WEBHOOK_SECRET_WEB` on web |
| Clerk — Gamo Worship application | `https://worship.gamostudio.org/api/auth/clerk-webhook` | same five events | `CLERK_WEBHOOK_SECRET_WORSHIP` on worship |
| Clerk — Gamo Academy application | `https://academy.gamostudio.org/api/auth/clerk-webhook` | same five events | `CLERK_WEBHOOK_SECRET_ACADEMY` on academy |
| Clerk — Gamo Live application | `https://live.gamostudio.org/api/auth/clerk-webhook` | same five events | `CLERK_WEBHOOK_SECRET_LIVE` on live |
| Clerk — Gamo Production application | `https://production.gamostudio.org/api/auth/clerk-webhook` | same five events | `CLERK_WEBHOOK_SECRET_PRODUCTION` on production |

Clerk webhooks are only needed for products that have Clerk switched on (§3a); each Clerk application points only at its own product's host. For a preview Clerk instance use that app's `https://gamo-<app>-preview.gamostudio.workers.dev/api/auth/clerk-webhook`. The Stripe webhook (`/api/webhook/stripe` on live, `STRIPE_WEBHOOK_SECRET`) is unchanged and test-mode only; it answers 503 in production by design.

`<APP>` is `WEB`, `WORSHIP`, `ACADEMY`, `LIVE` or `PRODUCTION`; each product uses its **own** Clerk application — never copy keys between products. The Clerk secret names are `PUBLIC_CLERK_PUBLISHABLE_KEY_<APP>`, `CLERK_SECRET_KEY_<APP>`, `CLERK_JWT_KEY_<APP>` and `CLERK_ISSUER_<APP>`; `EMAIL_FROM` must be on `gamostudio.org`.

Never set `ALLOW_DEMO_SESSION`, `ALLOW_AUTH_SIMULATION` or `ALLOW_PUBLIC_DEMO_WORKSPACES` to `true` outside local: the app refuses to serve (503). `LIVE_CATALOG_AUTOSEED=true` (live only) is the one deliberate exception that writes on a visitor request — see §5.

On the first request each isolate logs missing configuration by **name** (`[env:<app>] error: …`). Check with `pnpm exec wrangler tail --env <env>` from `apps/<app>`.

### 3a. Clerk is optional (deferred)

**Launch uses Gamo's own emailed verification codes** (Resend, sender `gamostudio.org`). Do not set any Clerk variable for launch; with none set, every product signs people in by emailed code and `pnpm preflight` reports "Clerk not configured (optional)". Everything about Clerk (how it works, the full variable list, the Clerk dashboard checklist for all five applications, Development → Production, and the manual test script) is in **[docs/AUTH.md](AUTH.md)**.

Clerk is already integrated (`packages/auth/clerk.ts`, shared auth UI) and switches on per product when that product's keys are set under the **product-suffixed names** (the only names a deployed Worker reads):

```
PUBLIC_CLERK_PUBLISHABLE_KEY_<APP>   CLERK_SECRET_KEY_<APP>   CLERK_JWT_KEY_<APP>   CLERK_ISSUER_<APP>
```

If you enable it later:

- each product needs **its own production Clerk instance** (never share keys or instances between products; no automatic account linking — AGENTS.md);
- a Clerk production instance needs its own **DNS records** on the product's domain (Clerk shows them in its dashboard) — add them in Cloudflare DNS yourself, and wait until Clerk shows the domain as verified;
- put the keys in `apps/<app>/.dev.vars` (or a file you pass) and run `scripts/set-clerk-secrets.sh --env preview|production [--app <app>] [--dry-run]`: it reads values without printing them, handles PEM keys with line breaks, quotes or literal `\n`, always sets the `<APP>`-suffixed names a deployed Worker reads, accepts only Production instance keys (`pk_live_`/`sk_live_`) for production, refuses one key used for two products, and prints only `ok <app> <NAME>`. Production writes need a person at an interactive terminal who types `production` (no `--yes`); under a test or CI the script refuses production writes and the real wrangler entirely. Keep `CLERK_APP_ID_<APP>`/`CLERK_AUTHORIZED_PARTIES_<APP>` in `wrangler.toml`; deploy to preview and complete CLEANUP_LOG H-05 (sign-in works under the CSP) before production;
- a startup log line names any missing Clerk variable (`wrangler tail`), and `pnpm preflight` warns about un-suffixed Clerk secrets left on a Worker.

Do **not** run `clerk init`, the Clerk CLI or a dashboard-generated Clerk setup prompt in this repository; they would replace the existing integration.

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

Earlier code (first seen in commit `b883c96`, removed in this cleanup) hard-coded a bootstrap admin: an email (`BOOTSTRAP_ADMIN_EMAIL`), a display name and a **temporary password** (`BOOTSTRAP_ADMIN_TEMP_PASSWORD`). `ensureBootstrapAdminAccount` stored its hash in `admin_credentials` for that email with the `superadmin` role. That function only ran for local demos on loopback, so preview/production should not contain it — but the password is in git history, so assume it is known and **verify**.

1. Find the email without printing the password: `git show 35d233d:packages/auth/index.ts | grep -n "BOOTSTRAP_ADMIN_EMAIL ="`.
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

## 9. Identity, onboarding and staff review (Phase 2, Agent A)

Owner steps (nothing here was done remotely):

1. **Turnstile.** Create one widget per public hostname; set `PUBLIC_TURNSTILE_SITE_KEY` (var) and `TURNSTILE_SECRET_KEY` (secret) on web, worship, academy, live and production. Without them the emailed-code sign-up/sign-in answers 503 outside local.
2. **Hash key.** Set `PII_HASH_SECRET` (>= 32 random chars, different from other secrets) on every public app; consent recording and rate limits need it.
3. **Clerk webhooks (only if a product uses Clerk).** In that product's Clerk application add an endpoint `https://<host>/api/auth/clerk-webhook` with events session.ended, session.revoked, session.removed, user.deleted, user.banned; put its signing secret in `CLERK_WEBHOOK_SECRET_<APP>`.
4. **Google (only if Clerk is on).** Enable Google in each product's Clerk application (production needs its own Google OAuth client and consent screen), add `/account/sso-callback` as an allowed redirect, set `CLERK_GOOGLE_ENABLED_<APP>=true`.
5. **Legal.** All terms are drafts ("DRAFT — requires legal review"); counsel must review before any version is marked active.
6. **Staff.** Reviewers need a staff gateway account with the `staff_reviewer` role (section 8). Review pages: `/review/churches`, `/review/providers`, `/review/events`.
7. **Erasure on request** (hello@gamostudio.org): see `docs/IDENTITY.md` section 8.

## 10. Door scanning and venue maps (Gamo Live)

Details: `docs/TICKETING_SCANNER.md`.

- **Needs:** `SCANNER_SESSION_SECRET` (≥ 32 chars, distinct from other secrets; scanner links, PINs and device cookies) and `TICKET_QR_SECRET_GL1` (scans verify the signed QR). Outside `ENVIRONMENT=local` a missing secret makes `/api/scanner/*` and `/scan/*` answer 503 with "use the printed guest list". `PII_HASH_SECRET` lets lookups and PIN attempts log a hashed IP; without it only the per-session lock applies. Venue maps use the `MEDIA_BUCKET` R2 binding (503 without it).
- **Create a scanner:** organizer opens `/organizer/events/<id>/scanners`, creates a gate; the link and 6-digit PIN are shown once. Link expiry: event end + 6 h, at most 7 days. Five wrong PINs lock the link 15 minutes.
- **Revoke:** "End scanner" on the same page; devices stop working on their next request. A lost phone: end the scanner and create a new one.
- **Overrides and lookups** are in `ticket_access_log` (actions `lookup`, `override`); scan results are in `ticket_scan_events` (retain 13 months per `docs/DATABASE.md`).
- **Offline conflicts:** `/organizer/events/<id>/scans?conflicts=1`, "Mark reviewed" sets `reviewed_at`.
- **Test servers never use real Clerk keys:** `pnpm test:e2e` blanks every Clerk variable in each build's `dist/server/.dev.vars` before `astro preview` (`scripts/e2e/test-servers.ts`), never reuses a server already on a port, and refuses to start while a local env file holds a live key (`pk_live_`/`sk_live_`/`rk_live_`; `pnpm dev` prints the same warning). Clerk switched on is covered with fake keys and no network by `scripts/audit/clerk-configured-fake-keys-e2e.test.mjs` (part of `pnpm test:journeys`).
- **Browser tests:** `pnpm test:e2e` runs `tests/e2e/scanner-*.spec.ts` against the built app in Miniflare (no `.dev.vars` needed; `pnpm build` first).

## 11. Gamo Live ticketing

Details and owner actions: [`docs/TICKETING.md`](TICKETING.md) §5.

- Paid checkout is test mode only and always `503` in production. On **preview** set `STRIPE_TEST_CHECKOUT=true` and a `sk_test_…` key; the local-only pages under `/local-test/*` answer 404 unless `ENVIRONMENT=local` (never set `STRIPE_TEST_CHECKOUT` in production: the startup check treats it as fatal).
- Webhooks: `/api/webhook/stripe` (secret `STRIPE_WEBHOOK_SECRET`) and `/api/webhook/resend` (`RESEND_WEBHOOK_SECRET`); both answer `503` until their secret is set.
- A failed card refund stays `approved` in `refund_records` and sends a staff alert email; retry it from the organizer order page.
- Local ticket tests: `pnpm test:e2e -g "Gamo Live tickets"`; the organizer test also needs `SESSION_SECRET` in `apps/live/.dev.vars` and `astro dev`.


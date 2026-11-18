# Owner steps to deploy the admin branch (2026-11-18)

Agents do none of this (AGENTS.md "External operations"). Run from the repository root of the branch `cleanup/forms-emails-invoices-verify` after it is merged or checked out. Details and reasons: `docs/RUNBOOK.md` §1, §3, §4, §13. Do **preview first** (public apps only; admin has no preview route), then production.

**What ships.** The admin screens, the account-free public apps, the public Worship and Production forms (`/worship/apply`, `/worship/request`, `/production/apply`, `/production/request` on gamostudio.org) and the emailed offer page. The contact and partner-interest pages show their forms too. Photos and PDFs also upload without JavaScript; videos need JavaScript or the link question.

## 0. Before anything

```sh
git push -u origin cleanup/forms-emails-invoices-verify        # then open a PR and wait for CI (pnpm check)
# The browser specs start their own servers on ports 4321-4326: stop any local `astro dev` first, then `pnpm check` runs them all
# (the admin specs passed 9 of 9 on 2026-11-18: pnpm --filter apps-admin build && E2E_APPS=admin pnpm exec playwright test --workers=1)
```

## 1. Secrets (production; values are never printed)

Run each from the app folder. `INQUIRY_INBOX_EMAIL` must be the **same address** on web, worship, production and admin.

```sh
# Upload signing key on the three public apps (>= 32 chars, different from every other secret)
for app in web worship production; do
  (cd apps/$app && openssl rand -base64 48 | pnpm exec wrangler secret put FORM_UPLOAD_SECRET --env production)
done

# Staff notice inbox: missing on worship, production and admin (web already has it)
for app in worship production admin; do
  (cd apps/$app && pnpm exec wrangler secret put INQUIRY_INBOX_EMAIL --env production)   # paste the address
done

# How a church or family pays a manual invoice (free text, e.g. Zelle/check/ACH details)
(cd apps/admin && pnpm exec wrangler secret put INVOICE_PAYMENT_INSTRUCTIONS --env production)

# Leave GAMO_ADMIN_FEE_APPROVED unset (= false) until the board approves a Gamo administrative fee.
# Optional, only for Stripe test-mode invoices: STRIPE_SECRET_KEY (sk_test_...) on admin and
# STRIPE_WEBHOOK_SECRET on web (endpoint https://gamostudio.org/api/webhook/stripe, events invoice.paid, invoice.payment_failed).
```

Remove the retired Clerk secrets (names from `wrangler secret list`; `SESSION_SECRET` and `CF_ACCESS_*` stay):

```sh
(cd apps/admin      && pnpm exec wrangler secret delete CLERK_SECRET_KEY --env production)
for a in WEB:web WORSHIP:worship ACADEMY:academy PRODUCTION:production; do
  U=${a%%:*}; app=${a##*:}
  for n in CLERK_ISSUER_$U CLERK_JWT_KEY_$U CLERK_SECRET_KEY_$U CLERK_WEBHOOK_SECRET_$U PUBLIC_CLERK_PUBLISHABLE_KEY_$U; do
    (cd apps/$app && pnpm exec wrangler secret delete $n --env production)
  done
done
```

## 2. Staff account (once; skip if you can already sign in)

```sh
pnpm staff:account:sql --env production --email <your-access-email>     # prints a temporary password once
cd apps/admin && pnpm exec wrangler d1 execute gamo-db-production --env production --remote --file ../../.staff-sql/<file>.sql
```

Also verify the retired bootstrap credential per `docs/RUNBOOK.md` §8.2.

## 3. Back up, then migrate (migrations 0019, 0020, 0021 are pending in production)

```sh
cd apps/web
pnpm exec wrangler d1 export gamo-db-production --env production --remote --output ../../backup-production-$(date +%F).sql   # do not commit
pnpm exec wrangler d1 migrations list  gamo-db-production --env production --remote
pnpm exec wrangler d1 migrations apply gamo-db-production --env production --remote
cd ../..
```

`0019` drops the public-account tables (approved; production holds only test data). Deploy right after, because the currently deployed public apps still read them.

## 4. Cloudflare and Resend settings

```sh
# R2 lifecycle for uploads (RUNBOOK §3b has the loop; shown for production)
cd apps/web
bucket=gamo-media-production
pnpm exec wrangler r2 bucket lifecycle add "$bucket" forms-pending-expire forms/pending/ --expire-days 2
pnpm exec wrangler r2 bucket lifecycle add "$bucket" forms-declined-expire forms/declined/ --expire-days 90
pnpm exec wrangler r2 bucket lifecycle add "$bucket" abort-incomplete-multipart "" --abort-multipart-days 7
pnpm exec wrangler r2 bucket lifecycle list "$bucket"
cd ../..
```

Dashboard only: WAF or Workers Rate Limiting rules on the public form endpoints and `/api/webhook/*`; Resend `gamostudio.org` domain still verified and the webhook pointing at `https://gamostudio.org/api/webhook/resend`; delete the `gamo-live` Workers and the `live.gamostudio.org` route (RUNBOOK §12); the Cloudflare Access application for `admin.gamostudio.org` exists with the AUD in `CF_ACCESS_AUD`.

## 5. Deploy and check

```sh
make verify-config
make deploy-all          # web, worship, academy, production, admin
```

**Publish the forms:** sign in to admin and open **Forms** once; the first visit publishes the six default forms. Until you do, the four form pages answer 404 and nobody can apply or request. Then send one test application and one test request from each public form (use your own address), check the staff notice arrives at `INQUIRY_INBOX_EMAIL`, approve and offer from admin, and open the offer link from the email.

After: RUNBOOK §7 (each host answers, old account URLs redirect, `pnpm exec wrangler tail --env production` shows no `fatal`/`error`), admin is stopped by Access when signed out, and Workers → `gamo-web` → Settings → Triggers shows the `0 6 * * *` cron. Rollback: RUNBOOK §2 (code only; the database is restored from the §3 backup).

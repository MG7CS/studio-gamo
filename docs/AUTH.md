# Authentication

How people sign in to the five public apps (`web`, `worship`, `academy`, `live`, `production`), what the owner must configure, and how to test it by hand. `admin` does not use Clerk or any account of its own: it sits behind Cloudflare Access alone and admits only `ADMIN_EMAIL` (`docs/ADMIN_REQUIREMENTS.md`).

Rules that never change (AGENTS.md): every product has its **own** Clerk application, users and keys; nothing links accounts across products; the sign-in screens are the shared `GamoAuthExperience`; nobody runs `clerk init`, the Clerk CLI or a dashboard-generated setup prompt in this repository.

## 1. How it works

Each app can sign people in two ways. The app picks one **per product, per request**, from its own configuration.

| | Gamo emailed codes (default, launch) | Clerk (optional, per product) |
| --- | --- | --- |
| Turned on by | nothing; it is the default | all of: publishable key **and** (secret key **or** JWT key), set under that product's suffixed names (§3) |
| Person enters | email, then the 6-digit code from Gamo's email | email, then the 6-digit code from **Clerk's** email |
| Who sends the email | Gamo, through Resend (`Gamo Studios <hello@gamostudio.org>`, Reply-To `hello@gamostudio.org`) | Clerk |
| Server session | D1 `sessions` row + signed `__session` cookie, 30 days | Clerk token verified once, then the same D1 session + cookie for **7 days** (§1.2) |
| Accounts | D1 `users` + `product_accounts` | the same rows, plus `clerk_identity_links` (product, Clerk user id, issuer) |

If Clerk is half configured (for example the publishable key but no secret key) it stays **off** for server and browser alike, the app keeps using emailed codes, and the first request of each Worker instance logs which names are missing (§3). A deployed Worker never reads the un-suffixed names (`CLERK_SECRET_KEY`, …): they exist only so a developer's `.dev.vars` can use Clerk's own names locally.

### 1.1 Request path

`middleware → env check → resolveAuth → private-page guard → page → security headers` (`docs/ARCHITECTURE.md`). `resolveAuth` (`packages/auth/index.ts`):

1. A three-part JWT in `Authorization: Bearer` or the `__session` cookie is verified against **this product's** Clerk application: signature (the PEM key, or Clerk's keys when only the secret key is set), issuer, authorized party (`azp`), expiry with Clerk's 5 s clock skew, optional `product`/`app_id` claims. A token from another product fails the signature or issuer check.
2. If the token is missing or does not verify, the signed two-part Gamo cookie is tried. An invalid Clerk token never authenticates by itself, and never hides a valid Gamo cookie of the same name.
3. A verified Clerk identity is mapped to D1 (§5). If Clerk is needed but cannot be reached (network failure, 5xx, 429, key fetch failure) the request fails with **503 "Account service is temporarily unavailable"** (pages) or `{ error: { code: "UNAVAILABLE" } }` (API), not with a redirect loop.

### 1.2 Why Clerk sign-in exchanges its token

A Clerk session token lives about **one minute** and only Clerk's browser script refreshes it; ordinary pages here do not load that script. Without a bridge a Clerk user would be signed out a minute after signing in. So right after Clerk completes sign-in, the browser sends the fresh token to `POST /api/auth/clerk-session` (`openapi/paths/auth-clerk-session.yaml`). The server verifies it exactly as above, finds or creates the product account, and issues a host-only, HttpOnly, 7-day Gamo `__session` cookie backed by a D1 session. That cookie keeps the person signed in; the Clerk token is only the proof used once. Sign-out ends both: `signOutOfClerk()` (`packages/ui/src/lib/clerk-browser.ts`) and `DELETE /api/auth/session`.

Consequence to accept: a Gamo session outlives a Clerk session that ends elsewhere (for example the person is deleted in Clerk) by up to 7 days, unless an owner suspends or revokes the identity link in D1 (`clerk_identity_links.status`, checked on every request) or the sessions are revoked. See §9 (no Clerk webhook yet).

### 1.3 What the sign-in screens support

| Capability | Status |
| --- | --- |
| Sign up and sign in with an **email code** (Clerk or Gamo) | implemented |
| Resend code, masked email on the verify step, `?next=` return to the page that asked for sign-in (same-site paths only, never `/api/*`) | implemented |
| Passwords, "forgot password" and "reset password" | **not implemented, by design**: the screens say "No password". The `recover` screen just requests a new code. |
| Google (or any social) sign-in, connecting or disconnecting a social account on the account page, account linking by shared email | **not implemented**. The shared UI can show a "Continue with Google" button if an app passes `googleAuthUrl`, but no app does and there is no OAuth callback route. Adding it needs a founder decision (§9) and a Clerk production OAuth client. |
| Multi-factor authentication | not supported: the screens stop with an error if Clerk asks for a second factor. Keep MFA **off** in every Clerk application. |
| Clerk's hosted pages (Account Portal) | not used |

## 2. Per-app summary

| App | Host (production) | Clerk variable suffix | Local port | `CLERK_APP_ID_*` in `wrangler.toml` today |
| --- | --- | --- | --- | --- |
| web | gamostudio.org (+ www) | `WEB` | 4321 | `pending_clerk_app_gamo_web` |
| worship | worship.gamostudio.org | `WORSHIP` | 4322 | `pending_clerk_app_gamo_worship` |
| academy | academy.gamostudio.org | `ACADEMY` | 4323 | `pending_clerk_app_gamo_academy` |
| live | live.gamostudio.org | `LIVE` | 4324 | `app_3KlWyOBL2xL2YzhJuvgk8QdrWIt` (exclusive to Gamo Live; the code refuses it anywhere else) |
| production | production.gamostudio.org | `PRODUCTION` | 4325 | `pending_clerk_app_gamo_production` |

A `pending_clerk_app_…` value is treated as "no app id yet": with keys set the app uses a derived id (`clerk_app_gamo_<product>`). Put the real `app_…` id of that product's Clerk application in `wrangler.toml` (all three environments) so the id stored in `clerk_identity_links` is the real one.

## 3. Variables

**One naming scheme:** every deployed Clerk variable carries the product suffix. `packages/config/clerk-env.ts` is the single definition; `packages/auth/clerk.ts`, startup validation, `pnpm preflight`, `scripts/set-clerk-secrets.sh` and the `.dev.vars.example` files all use it, and a test (`scripts/clerk/clerk-tools.test.ts`) keeps them equal.

| Name (APP = WEB, WORSHIP, ACADEMY, LIVE, PRODUCTION) | Kind | Needed | Meaning |
| --- | --- | --- | --- |
| `PUBLIC_CLERK_PUBLISHABLE_KEY_<APP>` | secret | yes | `pk_test_…` (development) or `pk_live_…` (production). Encodes the Frontend API host. |
| `CLERK_SECRET_KEY_<APP>` | secret | yes, unless the JWT key is set | `sk_test_…` / `sk_live_…`. Also used to look up the user when the token has no email claim. |
| `CLERK_JWT_KEY_<APP>` | secret | recommended | The instance's PEM public key. Verifies tokens with no network call. Real line breaks, or one line with literal `\n`, or quoted: all accepted. |
| `CLERK_ISSUER_<APP>` | secret | recommended | `https://clerk.<domain>` (production) or `https://<name>.clerk.accounts.dev` (development). Derived from the publishable key when unset. Also sets the CSP origin. |
| `CLERK_APP_ID_<APP>` | plain var in `wrangler.toml` | yes (see §2) | The `app_…` id of this product's Clerk application. |
| `CLERK_AUTHORIZED_PARTIES_<APP>` | plain var in `wrangler.toml` | yes | Comma-separated origins allowed in the token's `azp`. Already set per environment. |
| `PUBLIC_CLERK_KEYLESS_DISABLED` | plain var | already `"true"` | Keeps Clerk's keyless mode off. |

Local development only: the un-suffixed forms (`PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, `CLERK_ISSUER`, `CLERK_APP_ID`, `CLERK_AUTHORIZED_PARTIES`) inside `apps/<app>/.dev.vars` are mapped to the suffixed names. Use the Clerk **development** instance keys (`pk_test_`/`sk_test_`) there. A `pk_live_` key only works on its own production domain, so it will not work on `127.0.0.1`.

Startup messages (first request per Worker instance, names only, in `wrangler tail`):

- `Clerk is partly configured and stays off … Missing: <names>`
- `un-suffixed Clerk names are ignored when deployed; set the <APP>-suffixed names instead (<names>)`
- `<name> is a Clerk development key; production needs the production instance keys`
- `Clerk is on; also set <names> (offline token verification, exact CSP origin)`
- `EMAIL_FROM must be an address on the verified sending domain gamostudio.org`

Setting production secrets from `apps/<app>/.dev.vars` (values never printed, never in arguments):

```sh
scripts/set-clerk-secrets.sh --env production --dry-run     # checks only; calls nothing remote
scripts/set-clerk-secrets.sh --env production               # at a terminal: asks you to type "production"
scripts/set-clerk-secrets.sh --env preview --app academy --file ~/clerk-academy.vars
```

For production it accepts only Production instance keys (`pk_live_…`, `sk_live_…`) and always sets the `<APP>`-suffixed names; it refuses to write production without a person at an interactive terminal (there is no `--yes`), and when started by a test or CI it only accepts a stub `WRANGLER_BIN` in the temp directory and refuses `--env production` except `--dry-run`. It refuses one key used for two products, derives a missing issuer, converts literal `\n` and quoted PEM keys, and prints only `ok <app> <NAME>`. After an earlier hand-made upload with the un-suffixed names, remove those leftovers (each asks for confirmation):

```sh
for a in web worship academy live production; do (cd apps/$a && for n in PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY CLERK_JWT_KEY CLERK_ISSUER; do pnpm exec wrangler secret delete $n --env production; done); done
```

(A "not found" answer for a name that was never set is fine.) `pnpm preflight all --env production` warns `clerk-legacy-name` while any remain.

## 4. Paths, cookies, security headers

**Paths the code expects** (identical in every app unless noted):

| Path | Purpose |
| --- | --- |
| `/account/signin`, `/account/signup`, `/account/verify`, `/account/recover` | the shared screens (`mode="signin\|signup\|verify\|recover"`) |
| `/account` | where people land after sign-in or sign-up when there is no `?next=` |
| `/account/signin?next=<path+query>` | where a private page sends anonymous visitors (303) |
| `/account/access-denied` | signed in, but not allowed on that page |
| `/account/signed-out` (web), `/account/onboarding` (web) | extras |
| `POST /api/auth/challenge`, `POST /api/auth/verify` | emailed-code flow |
| `POST /api/auth/clerk-session` | Clerk token exchange (§1.2) |
| `GET /api/auth/me`, `DELETE /api/auth/session` | who am I, sign out |

**Cookies.** Gamo's `__session` is host-only (no `Domain`), `HttpOnly`, `Secure` over HTTPS, `SameSite=Lax`, `Path=/`; apps on sibling subdomains of `gamostudio.org` therefore never see each other's. Clerk's browser script sets its own cookies (`__session` holding the 60-second token, `__client_uat`, and `__clerk_db_jwt` on development instances). Which of those are host-only or domain-wide depends on Clerk and **could not be verified without a live instance** (§8); the code tolerates both: it ignores a Clerk token that does not verify and then uses the Gamo cookie, and the Gamo cookie is only picked from two-part values.

**CSP** (`packages/domain/src/http/security-headers.ts`). With Clerk off the policy has no Clerk origins. With Clerk on, it adds exactly: `script-src` + `https://challenges.cloudflare.com` and the product's Frontend API origin; `connect-src` + `https://clerk-telemetry.com` and the Frontend API origin; `img-src` + `https://img.clerk.com`; `frame-src` + `https://challenges.cloudflare.com`; `worker-src 'self' blob:`. No wildcards, no `unsafe-eval`, no inline script (`scripts/audit/auth-surface.test.ts` asserts every directive). Under `astro dev` the CSP is not enforced; the Playwright suite runs against production builds where it is.

**Not indexed.** Every `/account*` response carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store`; `robots.txt` disallows `/account` and `/api/`; sitemaps list no account page; `llms.txt` (web) links none (tests: `auth-surface`, `crawler-files`).

## 5. Clerk users in the database

- **First sign-in:** creates a D1 user (`usr_<product>_<clerkId>`), a product account and a `clerk_identity_links` row (`migration_source = clerk_registration`). Parallel first requests are safe: inserts are conflict-tolerant and only the winner writes the audit row.
- **Same email, other product:** a separate user (the stored address is namespaced `email#product:id`; the real address is shown). Never merged.
- **Same email, same product, before Clerk:** the earlier unlinked product account is claimed once, only for a **verified** email (`verified_domain_claim`), so organizer, enrollment and profile data survive.
- **Email changed in Clerk:** the next request updates the link and, if no other account holds the new address, the user row (audit `clerk.email_changed`).
- **Suspended or revoked link, or disabled user:** 403, and existing Gamo sessions of that identity stop working.
- **Roles:** a new registration has none. Unscoped roles and roles scoped to `program:<this product>` apply; another product's roles never do.
- **Deleted in Clerk:** nothing happens in D1 yet (§9).

## 6. Email

| Email | Sent by | When | From / Reply-To |
| --- | --- | --- | --- |
| Sign-in verification code | Gamo (Resend) | emailed-code flow (Clerk off, or `/api/auth/challenge` called directly) | `EMAIL_FROM` (must be on `gamostudio.org`; default `Gamo Studios <hello@gamostudio.org>`), Reply-To `hello@gamostudio.org` |
| Gamo Live registration confirmation (and retries from the outbox) | Gamo (Resend) | free RSVP on Gamo Live | same |
| Verification code for Clerk sign-up and sign-in | **Clerk** | Clerk on | Clerk's mail domain unless you add a custom email domain in Clerk |
| Any other Clerk email (new-device alerts, password or magic-link mail, invitations) | **Clerk** | only if you switch those features on; this app uses none of them | Clerk |

Handling: a failed send invalidates the unsent challenge and answers `503 UNAVAILABLE` ("We could not send a verification email"); the person can ask again. Per address: 5 codes per 15 minutes and 5 wrong guesses lock the code. Logs carry neither codes nor addresses nor bodies (`auth-surface` test captures every console line during a send). In local simulation (`ENVIRONMENT=local`, loopback host, `ALLOW_AUTH_SIMULATION=true`) the code is shown on screen instead of sent; every other mode is refused (503/403).

## 7. Clerk dashboard checklist (do for each of the five applications)

Menu labels in Clerk's dashboard change from time to time; match by function. Work on the **Development** instance first, then repeat on **Production** (§7.2). Each product is a separate Clerk application: never reuse a setting screenshot's keys.

### 7.1 Settings

1. **Application:** name it for the product (for example "Gamo Worship"). Note its `app_…` id and give it to the code (`CLERK_APP_ID_<APP>`, §2).
2. **Email, phone, username:** *Email address* on and **required**; *Verify at sign-up* on; verification method **Email verification code** on (links off). Phone, username, and web3 off. *Name* on, optional (the form sends first and last name when filled).
3. **Password:** **off.** The screens never ask for one; with passwords required, sign-up would stall at "Additional verification steps are required".
4. **Sign-in:** the identifier is *Email address*; the first factor is *Email verification code*.
5. **Multi-factor:** off.
6. **Social connections:** none (Google is not wired up, §1.3). When Google is added later: development instances use Clerk's shared test credentials; a **production instance requires your own Google OAuth client** (client ID and secret from Google Cloud, with the redirect URI Clerk shows).
7. **Account linking:** leave Clerk's default (accounts with the same verified email are one user *inside this application*). Nothing links across applications.
8. **Allowed origins / redirect URLs:** add this product's production origin (and `www` for web), its preview URL `https://gamo-<app>-preview.gamostudio.workers.dev`, and for development `http://127.0.0.1:<port>` and `http://localhost:<port>`. Application paths: sign-in `/account/signin`, sign-up `/account/signup`, after sign-in and sign-up `/account`.
9. **Authorized parties:** these are the origins the *code* accepts in the token's `azp` (`CLERK_AUTHORIZED_PARTIES_<APP>` in `wrangler.toml`); keep that list equal to the origins in step 8.
10. **Sessions:** maximum lifetime 7 days (the Gamo session after the exchange is also 7 days); inactivity timeout off; multi-session off.
11. **Customize session token** (recommended; saves a Clerk API call on every request that has a Clerk token). Add the claims `email` (the primary email address), `email_verified` (whether it is verified) and `name` (full name) using the shortcodes Clerk's "Customize your session token" page lists. If a shortcode is not offered, leave that claim out: the app then looks the user up through the Backend API and, if Clerk is unreachable, answers 503.
12. **Bot protection** (Attack protection): enable *Bot sign-up protection*. The sign-up form has the mount point (`#clerk-captcha`) and the CSP allows `challenges.cloudflare.com`. Without the mount point Clerk falls back to an invisible challenge with a lower success rate.
13. **Branding:** logo, terracotta `#B34E24` and cream `#F9F6F0`, "Gamo <Product>" as the display name. Clerk's own emails use this; the sign-in screens are Gamo's, not Clerk's components.
14. **Emails:** edit the verification code email so its subject and sender name say "Gamo <Product>". Add a custom email domain only if you want Clerk's mail from `gamostudio.org` (extra DNS records).
15. **Webhooks:** none yet (§9).
16. **API keys:** copy the publishable key, secret key, the **JWT public key** (PEM) and the Frontend API URL (issuer) into `apps/<app>/.dev.vars` for development.

### 7.2 Development → Production

For each product, one at a time:

1. In that Clerk application choose **Create production instance**; enter the product's domain (`gamostudio.org`, `worship.gamostudio.org`, …).
2. In Cloudflare DNS add every record Clerk lists for that domain (Frontend API `clerk.<domain>`, account portal, mail/DKIM records), **DNS only** (not proxied) unless Clerk says otherwise; wait until Clerk shows the domain verified and an SSL certificate issued.
3. Repeat §7.1 on the production instance (settings do **not** copy over); add Google credentials only when Google sign-in exists.
4. Copy the **production** keys (`pk_live_`, `sk_live_`, JWT public key, Frontend API URL) into `apps/<app>/.dev.vars` *only long enough to run the script*, or into a temporary file you pass with `--file`; delete the file afterwards. Do not keep production keys in `.dev.vars` while developing: `pnpm check` and local servers would then try to use them.
5. `scripts/set-clerk-secrets.sh --env production --app <app> --dry-run`, then without `--dry-run`.
6. Put the real `app_…` id in `apps/<app>/wrangler.toml` (all three environments), `pnpm preflight <app> --env production`, deploy (owner action), and run the manual tests in §8 against the live site.
7. Roll back by removing the product's four secrets (`wrangler secret delete`): the product falls back to emailed codes at once; Clerk-created accounts stay in D1.

## 8. Manual test script

Run each flow on a **preview** or production URL after deploying, with a mailbox you control, in a private browser window. "OK" lines are the expected result. Keep DevTools → Application → Cookies and Network open.

**Setup A (Clerk off):** product without Clerk secrets. **Setup B (Clerk on):** the same product with Clerk enabled.

1. **Sign up (Setup B).** `/account/signup` → first name, email → Continue. OK: Clerk's email arrives with a 6-digit code; entering it lands on `/account`; Network shows `POST /api/auth/clerk-session` = 200; a host-only `__session` cookie with `HttpOnly`, `Secure`, `SameSite=Lax` and about 7 days expiry exists.
2. **Sign up (Setup A).** Same, but the email comes from `hello@gamostudio.org`, has Reply-To `hello@gamostudio.org`, and no `clerk-session` call happens.
3. **Wrong and expired code.** Enter `000000`: OK, an error under the field and no session. Wait 10 minutes (Setup A) and use the old code: OK, rejected. Five wrong guesses: locked.
4. **Persistence (the 60-second check).** Sign in on Setup B, wait **3 minutes**, open another private page of the same app: OK, still signed in. Close and reopen the browser: still signed in.
5. **Sign out.** On `/account` choose Sign out: OK, you land on `/account/signin`; reload a private page and you are sent to sign-in. With Setup B also check that the Clerk session ended: open `/account/signin`, do not type anything, then `/account`: OK, still signed out.
6. **Sign in again** with the same email: OK, same account (same display name, same data), not a new one.
7. **Return to the page you asked for.** Signed out, open a private page (for example `/family` on academy). OK: you are sent to `/account/signin?next=%2Ffamily`; after the code you land on `/family`. Then try `/account/signin?next=https://example.com` and `?next=//example.com`: OK, you land on `/account`.
8. **Another product is separate.** Signed in to one product, open another product's `/account`: OK, signed out there, and signing up there with the same email creates a separate account and a separate Clerk user.
9. **Email change (Setup B).** In the Clerk dashboard change the user's primary email; load a private page: OK, the account page shows the new address.
10. **Block an identity (Setup B).** Suspend the user in D1 (`UPDATE clerk_identity_links SET status='suspended' WHERE clerk_email=…`) or ban them in Clerk: OK, the next page answers 403 / sends them to access-denied.
11. **Clerk unreachable.** Hard to stage live; the unit tests cover it (`packages/auth/clerk-flows.test.ts`). If you can block `*.clerk.accounts.dev` / `clerk.<domain>` in the browser: OK, the sign-in screen shows an error and no loop.
12. **Missing keys.** Remove one of the four secrets: OK, startup logs name it, and the product uses emailed codes.
13. **Bot protection (Setup B).** Open sign-up in a fresh private window from a VPN or with automation signals: OK, a Cloudflare challenge appears inside the form and the CSP shows no violation in the console.
14. **Not indexed.** `curl -sI https://<host>/account/signin | grep -i x-robots` → `noindex, nofollow`; `curl https://<host>/sitemap.xml | grep -c account` → `0`.
15. **Cookies and CSP.** `curl -sI https://<host>/ | grep -i content-security-policy`: Clerk origins appear only on Setup B; no `*`.
16. **Not available yet (expected to be absent):** passwords, "forgot password", Google button, "connect/disconnect account" in settings.

Automated coverage of the same flows (all Clerk calls mocked): `packages/auth/clerk-flows.test.ts` (tokens, skew, issuer, azp, PEM forms, cross-product, unreachable Clerk, D1 mapping, races, email change, roles), `scripts/audit/clerk-session-exchange.test.ts` (the exchange and 7-day session), `scripts/audit/auth-surface.test.ts` (noindex, CSP, API error format, product-from-host, no bypass modes, rate limits, email content and logs), `scripts/clerk/clerk-tools.test.ts` (names, startup messages, secrets script), `packages/ui/src/lib/auth-redirect.test.ts` (`?next=`), plus the existing `private-routes`, `auth-journeys`, `smoke.spec.ts` (axe, 360 px, CSP in a production build) and the Miniflare journeys (emailed-code sign-in, return to the original page, sign-out).

## 9. Known gaps and owner decisions

1. **Clerk webhook (built, needs the owner).** `POST /api/auth/clerk-webhook` on each app verifies Clerk's Svix signature with `CLERK_WEBHOOK_SECRET_<APP>` and ends this product's Gamo sessions on `session.ended|revoked|removed`, `user.deleted` and `user.banned` (`user.deleted` also suspends the identity link). Without the secret it answers 503 and the 7-day gap remains. Name or email changes are not pushed (`user.updated` is ignored).
2. **Google sign-in (built, needs the owner).** "Continue with Google" appears only when the product's own Clerk is configured and `CLERK_GOOGLE_ENABLED_<APP>=true`; the redirect ends on `/account/sso-callback`. Owner steps are in `docs/IDENTITY.md` §9. No passwords or MFA.
3. **Abuse protection (built).** Challenge, verify and clerk-session are limited per hashed IP and per hashed email; the challenge needs a Turnstile token outside local. Add Cloudflare rate rules on top if desired.
4. **Account existence is no longer visible**: sign-in for an address without an account answers like any other and sends nothing (`docs/IDENTITY.md` §4).
5. **Cookie scope of Clerk's own cookies** and **Clerk's real emails, bot challenge and browser SDK** need the live manual tests above.
6. **Local files found during the audit (fix before re-running the script):** `CLERK_APP_ID` in web, worship, academy and production `.dev.vars` is Gamo Live's id, and academy's `CLERK_JWT_KEY` is Live's key (it is also on the production academy Worker). Each must come from that product's own Clerk application.
7. **`app_3KsAGwTVJ38hAKcdP6Kv8u5R3ji`** (selected in the Clerk dashboard) is not assigned to any product yet; tell the agent which product it belongs to.

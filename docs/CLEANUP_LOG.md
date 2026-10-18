# Cleanup Log — Foundation-and-Polish Pass

Branch: `cleanup/foundation-pass` (local only; never pushed, never deployed).
Started: 2026-10-17. Toolchain: Node 22.22.3, pnpm 11.28.5, Astro 7.3.8, @astrojs/cloudflare 14.3.4, wrangler 4.149.

This log is appended to while work happens. Sections:

1. [Decisions](#1-decisions)
2. [Done](#2-done)
3. [Findings](#3-findings)
4. [Needs owner decision](#4-needs-owner-decision)
5. [Needs human action outside the code](#5-needs-human-action-outside-the-code)
6. [Verification](#6-verification)
7. [How to revert](#7-how-to-revert)

---

## Phase 0 baseline (recorded before any change)

**Git state.** `main` at `1d4bbad` with 180 uncommitted changes (modified + untracked: new robots/sitemap/llms routes, `.env.example` files, Clerk env loader, migration `0011`, booklet assets). All of it was saved as checkpoint commit `35d233d` on `cleanup/foundation-pass`. Before committing I checked every untracked env example for real-looking values (`sk_`, `pk_`, `whsec_`, `re_`, JWTs, long base64): none found. No `dist/`, `.astro/` or `.wrangler/` directories were tracked. `.DS_Store` was tracked.

| Step | Command | Result | Time |
| --- | --- | --- | --- |
| Install | `pnpm install --frozen-lockfile` | pass (lockfile current) | 1 s |
| Typecheck | `pnpm typecheck` (astro sync + `tsc --noEmit` per app + api-contracts) | pass, 0 errors. **Caveat:** `tsc` does not check `.astro` files, and packages other than `api-contracts` are only checked transitively. | 28 s |
| Tests | `pnpm test` (node --test, 9 files) | 61/61 pass | 1.3 s |
| Orphaned tests | `scripts/audit/*.test.ts` (not in any script) | admin-analytics 4/4, page-access 6/6, participation 2/2, security 16/16 pass; **auth-journeys 3/4 — 1 fail** (expects 403, gets 401 at `scripts/audit/auth-journeys.test.ts:101`) | — |
| Browser tests | `scripts/audit/browser-e2e.test.mjs`, `phase1-journeys-e2e.test.mjs` | not run by any script; need running servers | — |
| API contract | `pnpm api:check` | pass (lint + generate --check + check.mjs + 12 contract tests) | ~10 s |
| Build | `pnpm build` (all 6 apps, sequential) | pass | 15 s |
| Lint | `pnpm lint` | stub: `echo "Linting not set up yet"` | — |
| Dev, one app at a time | `astro dev` in each app, `curl /` | web 200, worship 200, academy 200, live 200, production 200, admin 401 (staff gate, expected) | — |
| Dev, all apps | `pnpm dev:all` | **fails**: `listen EADDRINUSE 127.0.0.1:9229` in whichever apps lose the race (worship, admin, …). Every app's workerd runtime binds the same default inspector port. | — |

Other baseline observations:

- Astro 7 dev servers bind `localhost` → `[::1]` only, but every `PUBLIC_SITE_URL_*` local var points to `http://127.0.0.1:432x`, so local cross-app links fail on machines where `127.0.0.1` ≠ `::1`.
- Astro 7 auto-backgrounds `astro dev` when it detects an AI-agent environment (`astro dev stop|status|logs`). In a normal terminal it runs in the foreground.
- Migrations: `0000`–`0006`, `0008`–`0011`; **`0007` is missing**.
- Repo weight: `docs/screenshots/` 627 MB (1,273 tracked PNGs), `assets/` 93 MB, `design-reference/` 49 MB, `artifacts/` 17 MB.

### Apps and packages

| Workspace | Purpose | Workspace deps (declared → actually imported) |
| --- | --- | --- |
| `apps/web` (`gamostudio.org`, :4321) | Organization hub, mission pages, account hub, partner interest, participation API | ui, auth, db, domain, api-contracts |
| `apps/worship` (:4322) | Gamo Worship marketing + dashboards | declares ui only; **also imports `@gamo/domain` (undeclared)** |
| `apps/academy` (:4323) | Gamo Academy marketing + dashboards | declares ui only; **imports `@gamo/domain` (undeclared)** |
| `apps/live` (:4324) | Gamo Live events, ticketing, artists, bookings; largest API surface | ui, auth, db, domain, integrations, api-contracts |
| `apps/production` (:4325) | Gamo Production marketing + dashboards | declares ui only; **imports `@gamo/domain` (undeclared)** |
| `apps/admin` (:4326) | Staff operations behind Cloudflare Access / admin password | ui, auth, db, domain, integrations, api-contracts |
| `packages/ui` (`@studio-gamo/ui`) | Shared Astro components, layouts, auth UI, dashboard kit, site/SEO helpers | — |
| `packages/domain` (`@gamo/domain`) | Services, HTTP helpers, page middleware, brand data | auth, db, integrations, api-contracts |
| `packages/auth` (`@gamo/auth`) | Sessions, Clerk integration, page access rules, page cache rules | db |
| `packages/db` (`@gamo/db`) | Drizzle schema, migrations, test DB helpers | — |
| `packages/integrations` (`@studio-gamo/integrations`) | Stripe, Resend, storage adapters | — |
| `packages/config` (`@gamo/config`) | Domains, local ports, env loader used by every `astro.config.mjs` (imported by relative path `../../packages/config/env-loader.ts`, not declared) | — |
| `packages/api-contracts` (`@gamo/api-contracts`) | Generated OpenAPI types + validators (from `openapi/`) | — |

All six Workers bind the **same** D1 database and the **same** KV namespace per environment, and the KV namespace ID `7d35…8674` is identical in local, preview and production.

---

## 1. Decisions

| ID | Context | Options considered | Choice | Reason |
| --- | --- | --- | --- | --- |
| D-01 | Checkpoint before any edit | stash; commit on main; commit on new branch | Commit everything (180 files) on `cleanup/foundation-pass` as `35d233d` | Instructed; keeps `main` untouched and gives one revert point. Env examples scanned first. |
| D-02 | Lint + format tooling | Biome; ESLint + Prettier | ESLint 10 (flat config) + typescript-eslint + eslint-plugin-astro + eslint-plugin-jsx-a11y-x, Prettier + prettier-plugin-astro | Biome's `.astro` template support is still experimental; eslint-plugin-astro is the maintained parser for Astro templates and gives a11y rules. `jsx-a11y-x` used because `eslint-plugin-jsx-a11y` 6.10 does not support ESLint 10 (eslint-plugin-astro accepts either). |
| D-03 | 627 MB of generated screenshots (`docs/screenshots/`, 1,273 PNGs) and `artifacts/` tracked in git | keep tracked; Git LFS; untrack + ignore | `git rm --cached` + `.gitignore` (files stay on disk; history keeps them at `35d233d`) | They are output of `scripts/*.mjs` against a running UI, not source. LFS is a new external dependency. `design-reference/` and `assets/` stay tracked (they are inputs). |
| D-04 | `dev:all` port clash | stagger startup; run apps under one wrangler process; distinct ports | Fixed per-app workerd inspector ports 9321–9326 and explicit per-app `persistState` (`apps/<app>/.wrangler/state`), centralized in `packages/config/apps.ts` + `createGamoCloudflareConfig`; dev servers bind `127.0.0.1` via `createGamoDevServer()` | Root cause was every workerd binding 9229. Binding IPv4 loopback makes the existing `http://127.0.0.1:432x` cross-app URLs work. |
| D-05 | Local D1 sharing between apps | one shared state dir; isolated per app | Isolated per app (as requested), documented | Two workerd processes writing one SQLite file risk lock errors/corruption. Consequence: locally, admin cannot see events created in live unless both are seeded — documented in RUNBOOK. |
| D-06 | `apps/*/.gitignore` duplicated the root file | keep; delete | Deleted; root `.gitignore` extended (test output, `*.tsbuildinfo`, `.eslintcache`, editor dirs) | One source of truth. |
| D-07 | `astro.config.mjs` imported `../../packages/config/env-loader.ts` by relative path | keep; package import | `@gamo/config/env-loader` with `exports` map + `workspace:*` devDependency in every app | Removes cross-package relative imports; dependency is now declared. |

## 2. Done

## 3. Findings

Ranked: **P0** = security/data-integrity risk in production, **P1** = correctness bug or broken user path, **P2** = quality/maintainability, **P3** = cosmetic. Status is updated as items are fixed.

| ID | Rank | Finding | Where | Status |
| --- | --- | --- | --- | --- |
| F-01 | P0 | A real person's email, name and a temporary admin password are hard-coded as bootstrap admin constants; the email is also rendered into the admin login HTML. The function using them is local-gated and has no callers, but the password is committed to git history. | `packages/auth/index.ts:720-722`, `apps/admin/src/middleware.ts:46` | open (Phase 3) |
| F-02 | P0 | Live catalog is seeded **and published** into D1 on the first anonymous GET (`LiveService.ensureVerifiedCatalogSeeded()` on `/`, `/events`, `/events/[id]`, `sitemap.xml`) with no environment gate — contradicts the catalog's own `requires_owner_review: true`. | `packages/domain/src/services/live.ts:3267-3283`; `apps/live/src/pages/index.astro:22` etc. | open (Phase 3) |
| F-03 | P0 | Checkout returns `200` with a **fake** Stripe session when `STRIPE_SECRET_KEY` is missing/`mock_`/`placeholder`, in any environment (AGENTS.md says checkout fails closed). Also builds a URL with two `?`. | `packages/integrations/src/stripe.ts:241-251`, `apps/live/src/pages/api/checkout/session.ts:55-77` | open (Phase 3) |
| F-04 | P0 | Free-registration confirmation emails are marked `sent` with a `mock_` id when no Resend key is configured, in any environment. | `apps/live/src/pages/api/events/[id]/register.ts:48-52`, `packages/integrations/src/resend.ts:48` | open (Phase 3/6) |
| F-05 | P0 | Same KV namespace ID used for local, preview **and** production in all six wrangler configs: preview Workers read/write production session data. | `apps/*/wrangler.toml` | needs human action (H-01) |
| F-06 | P1 | Stripe webhook contract schema closes `data` to `{object}` only; real `*.updated` events carry `data.previous_attributes` → `400` → Stripe retries forever. | `openapi/components/schemas/payments/StripeEvent.yaml`, `apps/live/src/pages/api/webhook/stripe.ts:54-61` | open (Phase 6) |
| F-07 | P1 | `pnpm dev:all` failed: all workerd runtimes bind inspector port 9229. | `apps/*/astro.config.mjs` | **fixed** (D-04) |
| F-08 | P1 | Local cross-app links point to `127.0.0.1` while dev servers bound `[::1]`. | `apps/*/wrangler.toml` `[vars]` | **fixed** (D-04) |
| F-09 | P1 | Outbox retry (`processPendingJobs`) is never called — no cron/scheduled handler — so failed emails are never retried. | `packages/domain/src/services/notifications.ts:148` | open (Phase 6) |
| F-10 | P1 | No timeouts on Resend/Stripe `fetch` calls. | `packages/integrations/src/resend.ts:59`, `stripe.ts:306,349` | open (Phase 6) |
| F-11 | P1 | Registration email uses `getPlatformBrandConfig()` without env → always defaults (`live.example.invalid`). Verification email is branded "Gamo Studios" for every product. | `packages/domain/src/services/notifications.ts:56-101,203` | open (Phase 6) |
| F-12 | P1 | `handleApiError` maps *any* error whose message contains "not found"/"duplicate"/"forbidden" to 404/409/403 — fragile, can return undeclared statuses. | `packages/domain/src/api/response.ts:103-118` | open (Phase 3/6) |
| F-13 | P1 | Several private routes parse/validate body before checking the session (anonymous gets 400, not 401). | artists, representatives, offers, inquiries, team, production-requests, refund, scan, events POST | open (Phase 3) |
| F-14 | P1 | Local live DB was migrated by the editorial CLI (no `d1_migrations` table), so `wrangler d1 migrations apply --local` would re-run everything and fail. CLI's own migration runner silently skips the rest of a file after the first "already exists". Local dry-run still mutates schema. | `scripts/live/editorial-cli.ts:136-165,261-277` | open (Phase 6) |
| F-15 | P2 | `schema.ts` drift vs migrations: `user_roles.id` not a PK in DB; 11 FKs have cascade/set-null in schema but NO ACTION in DB; 9 indexes exist only in schema. drizzle `meta/_journal.json` lists only 0000–0002. | `packages/db/schema.ts`, `packages/db/migrations/meta` | open (Phase 6) |
| F-16 | P2 | Migration numbering gap (`0007` missing); most migrations use bare `CREATE TABLE`/`INDEX` (not idempotent if re-run by hand). | `packages/db/migrations/` | open (Phase 3/6) |
| F-17 | P2 | Two error formats in the API (`{success:false,error:{…}}` and `{error:string}` for checkout/webhook); RFC 7807 `Problem` schema defined but unused. Checkout contract text says "returns 503" but code returns 200. | `openapi/`, `apps/live/src/pages/api/checkout/session.ts` | open (Phase 6) |
| F-18 | P2 | `api:check`, `scripts/audit/*.test.ts` and browser tests are not run by `pnpm test`; one of them (`auth-journeys`) fails. | `package.json` | open (Phase 1/7) |
| F-19 | P2 | `tsc --noEmit` typecheck ignores `.astro` files. | `package.json` `typecheck` | open (Phase 1/2) |
| F-20 | P2 | worship/academy/production import `@gamo/domain` without declaring it. | `apps/{worship,academy,production}/package.json` | **fixed** |
| F-21 | P2 | Same catalog in 3 byte-identical JSON files + an embedded TS copy. | `gamo_live_verified_events_2026-10-15.json`, `data/*.json`, `packages/domain/src/services/verified-catalog-2026-10-15.ts` | open (Phase 1) |
| F-22 | P2 | Docs stale: `docs/DEPLOYMENT.md:75-79` names a nonexistent migration and stops at 0008; import report uses wrong DB name; README says legal status undecided (AGENTS.md: PBC); `openapi/root.yaml:6-8` also says undecided. | docs | open (Phase 8) |
| F-23 | P3 | Admin middleware logs the raw error object. | `apps/admin/src/middleware.ts:420` | open (Phase 6) |
| F-24 | P0 | Request-path seeding (F-02) also inserts a verified active user `listings-editorial@gamostudios.org` with a **global `staff_reviewer` role** and org ownership — on an anonymous GET in production. Called from 9 pages: live `/`, `/events`, `/events/[id]`, `/events/[id]/register`, `/venues`, `/artists`, `/artists/[slug]`, `sitemap.xml`, and web `/live`. | `packages/domain/src/services/live.ts:2433+,3267`; `live-external-discovery.ts:22` | open (Phase 3) |
| F-25 | P0 | Admin login sets `__session` with `Domain=.gamostudio.org` in production; that session has no product scope, and Live private APIs (`requireVerifiedAuth`) never check product membership → an admin session is accepted by every Live API. | `apps/admin/src/middleware.ts:31-39,265-271`; `packages/auth/index.ts:573` | open (Phase 3) |
| F-26 | P0 | Live private APIs (events POST, team, production-requests, artists POST, representatives, bookings, offers accept, revoke, refund, scan) do not check `hasProductAccess`. | `packages/auth/index.ts:573` | open (Phase 3) |
| F-27 | P0 | No security headers anywhere (CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors). | all apps | open (Phase 3) |
| F-28 | P1 | `requireSameOrigin` lets requests with **no** `Origin` header through. Live `/api/events/[id]/register` and `/api/checkout/session` have no origin check at all. Admin `/__admin_auth/logout` accepts GET with no origin check (logout CSRF). | `packages/auth/index.ts:708-714`; admin `middleware.ts:299` | open (Phase 3) |
| F-29 | P1 | Admin break-glass compares tokens with `===` (not constant-time); active whenever not prod or `ENABLE_BREAK_GLASS_AUTH=true`. | `apps/admin/src/middleware.ts:442,446,463` | open (Phase 3) |
| F-30 | P1 | Admin: a Cloudflare-Access-only user (valid JWT, no D1 session) is redirected to `/account/signin`, which in admin is the `[...slug]` route → redirect loop. | `apps/admin/src/middleware.ts:346-359` | open (Phase 3) |
| F-31 | P1 | Admin login page renders `err?.message` (escaped) into HTML; Stripe webhook returns `verification.error` which can carry `JSON.parse` messages; `handleApiError` returns `AuthError` messages verbatim (incl. Clerk config errors). | admin `middleware.ts:292`; `stripe.ts:210`; `response.ts:80-126` | open (Phase 3) |
| F-32 | P1 | Webhook fulfillment dedupe is read-then-write (not atomic); concurrent deliveries collide on deterministic PKs → 500. Event is recorded idempotent **after** fulfillment. | `packages/domain/src/services/live.ts:1967-2085`; `payments.ts:51-60` | open (Phase 6) |
| F-33 | P1 | Worship `/api/check-in/{confirm,fail}` are unauthenticated no-op stubs (303 redirect) that are part of the public contract. | `apps/worship/src/pages/api/check-in/*.ts` | open (Phase 2) |
| F-34 | P2 | Default top-level wrangler env is `ENVIRONMENT="local"` — a `wrangler deploy` without `--env` ships "local" flags (demo gates still need a loopback hostname, so not exploitable on real hosts). | `apps/*/wrangler.toml` | open (Phase 2) |
| F-35 | P2 | Demo session endpoint (local + loopback only) can impersonate any existing user, incl. superadmin, without verification. Acceptable for local, but should be documented. | `packages/domain/src/http/auth.ts:164-220` | document |
| F-36 | P2 | No test exercises the `applicationPages` page middleware end to end; `scripts/audit/*` security tests are not in CI. | — | open (Phase 7) |
| F-37 | P1 | No `404.astro`/`500.astro` in any app; no web manifest or `theme-color`; Inter 900 never loaded although `font-black` is used; Google Fonts loaded at runtime. | all apps, `packages/ui/src/components/BaseLayout.astro:58-60` | open (Phase 4) |
| F-38 | P2 | Design tokens exist in one place (`packages/ui/src/styles/tokens.css`) but none matches the booklet values; ~945 arbitrary color classes and ~1,100 hex literals bypass them (worst: Live, which re-implements header/footer/logo with hex only). Auth CTA is purple/indigo. | `packages/ui/src/styles/tokens.css`, `apps/live/**`, `packages/ui/src/components/auth/*` | open (Phase 4) |
| F-39 | P2 | Admin login gateway is a hand-written HTML page inside middleware with its own palette and no skip link/landmarks. | `apps/admin/src/middleware.ts:55-200` | open (Phase 4) |
| F-40 | P2 | 18 `outline-none` without replacement; `AudienceSwitch` tabpanel loses focus ring; plain `<img>` without width/height in 5 Live spots (`LiveDiscoveryCard` also forces `loading=eager decoding=sync` on every card). | see Phase 4 | open (Phase 4) |
| F-41 | P2 | Optimized image set copied byte-identical into 5 apps' `public/` (≈6.9 MB each). | `apps/*/public/images/optimized` | open (Phase 4) |
| F-42 | P2 | `packages/ui/src/lib/brand.ts` and `packages/domain/src/brand.ts` are duplicates. Brand emails use `*.gamostudios.local`. | — | open (Phase 2) |
| F-43 | P0 | Admin `/security` page **displays** the hard-coded bootstrap password (`security.astro:79,111`), ungated by environment. | `apps/admin/src/pages/security.astro` | open (Phase 3) |
| F-44 | P1 | `DemoNotice.astro` and `DemoModeBanner.astro` render nothing, so fictional content is unlabeled on public pages: Academy instructors (with "verified" pill, also in sitemap), Academy lessons "Open enrollment" with prices, Worship `/opportunities` (5 fictional churches with pay amounts), Worship roster card. `DashForm`/`DashDialog` strip "(demo)"/"(sample)" from labels. Violates the AGENTS.md labeling rule. | `packages/ui/src/components/{DemoNotice,dashboard/DemoModeBanner,dashboard/DashForm,dashboard/DashDialog}.astro` | open (Phase 2) |
| F-45 | P1 | Production homepage consultation form discards input: `onsubmit="return false"` then navigates to a redirect stub. | `apps/production/src/components/production/ConsultationForm.astro:12,29-32` | open (Phase 2) |
| F-46 | P1 | Worship `/check-in/*` pages always say "Your arrival has been recorded" without writing anything. | `apps/worship/src/pages/check-in/*.astro` | open (Phase 2) |
| F-47 | P2 | Admin workspace fixtures (~4,300 lines) can never render (`isolatedDemo` is never set in admin), and `[...slug].astro` prepends real D1 rows to fake rows. | `apps/admin/src/data/**`, `apps/admin/src/pages/[...slug].astro:14-60` | open (Phase 2) |
| F-48 | P2 | `scripts/generate-index.mjs` would overwrite the current homepage with an old layout. | `scripts/generate-index.mjs:396` | open (Phase 1) |
| F-49 | P2 | `@clerk/astro` declared in 8 packages, imported nowhere; `@clerk/backend`/`@clerk/clerk-js` declared in all apps but imported only by packages. | package.json files | open (Phase 1/2) |
| F-50 | P2 | ~30 redirect-stub page files (worship `/hire/*`, `/apply/*`; academy `/register`, `/host-apply`; production `/assessment`, `/consultation*`, `/contact`; live `/organizer/*`, etc.), many still linked from live pages and the shared footer. | see Phase 1 Done | open (Phase 1) |

## 4. Needs owner decision

Nothing in this section was changed in code unless the row says so.

| ID | Question | Options | Recommendation |
| --- | --- | --- | --- |
| O-01 | **Email domain.** The site domain is `gamostudio.org` (no "s"); the organization name is "Gamo Studios". `hello@gamostudios.org` does not appear in the code at all, but `listings-editorial@gamostudios.org` (seeded publisher identity, `packages/domain/src/services/live-external-discovery.ts:22`) and `*@live.gamostudios.local` (brand defaults, `apps/live/wrangler.toml` `PLATFORM_SUPPORT_EMAIL`) do. Which domain owns mail? | (a) all mail on `gamostudio.org`; (b) register `gamostudios.org` and use it for mail; (c) both, with one redirecting | (a) — it is the domain already verified for the sites and the `notifications@gamostudio.org` sender. Then set `PLATFORM_SUPPORT_EMAIL` in the live wrangler envs. |
| O-02 | **Public contact details.** No public email, phone or address appears on `/contact`, the FAQ, the footer or `/legal`; the footer's Instagram/YouTube/Facebook icons all link to `/contact`. | publish a contact address; keep form-only; add real social URLs | Publish one monitored address and either real social URLs or remove the icons. |
| O-03 | **Fictional content on public pages** (F-44): homepage sample events in `HomeLiveSpotlight.astro:24-55` (incl. a real venue name, Atlanta Symphony Hall), homepage/worship roster cards with names, `/opportunities` (5 fictional churches with pay), Academy instructors (Maya Thompson, Daniel Reyes, Grace Okafor, Samuel Park) with "verified" badges and profile pages in the sitemap, Academy lessons with prices, the "Tesfaye" family example. | (a) label each visibly as "Sample" (what AGENTS.md requires); (b) replace with real content; (c) remove the sections until real content exists | I applied (a) as the minimum the AGENTS.md rule requires (see Phase 2 Done). Removing fictional instructors' profile pages from the sitemap is recommended but is a content decision — left in. |
| O-04 | **Program status wording** (left unchanged, as instructed). Every occurrence found: | keep; reword per program once status is decided | Decide per program which are live vs. proposed; then a single copy pass. |
| O-05 | **Admin bootstrap identity.** A personal Gmail address and name are used as the default admin identity in code and prefilled on the admin sign-in page. | remove (env-only); keep as local default | Removed from code and UI (Phase 3); admin bootstrap now comes only from env. Owner to confirm which address should be the first staff account. |
| O-06 | **"Support"/giving language.** No banned words appear in public copy, but several phrases read as charitable-giving language: `support.astro:8,11` ("more than financial giving"), `SupportPathways.astro:9,14,16,18` ("restricted support", "independent governing board"), `OurValues.astro:10` ("every gift"), `PartnershipOpportunities.astro:20` ("Church membership contributions"), service fees called "contributions" (`worship.ts:39`, `production.ts:127`). | keep; reword to service/fee language | Owner/counsel review. Not changed. |
| O-07 | **"developing … Public Benefit Corporation"** (`apps/web/src/components/mission/WhyWeExist.astro:16`) differs from the approved PBC sentence and may suggest the PBC is not yet formed. | keep; use approved sentence verbatim | Use the approved sentence. Not changed (legal wording). |
| O-08 | **Board/governance claims:** "reporting to an independent governing board" (`SupportPathways.astro:18`), "awaiting board approval" (`worship.ts:39`). AGENTS.md forbids claiming committed board members. | keep; soften | Confirm a board exists, or reword. Not changed. |
| O-09 | **Service area:** "initial local service area … Phoenix metropolitan area" (`apps/web/src/data/organization.ts`, `ContactIntroduction.astro:11`, `contact.astro:6`) vs "Service areas will be announced as the program develops" (`apps/worship/src/data/worship.ts:41`). | pick one | Pick one statement and use it in both places. |
| O-10 | **Public proposed prices/pay**: Academy tuition $30/$15/$35/$40/$18 per session (`apps/academy/src/data/lessons.ts`), Worship pay $150/$125/$60/$110/$120 (`apps/worship/src/data/worship.ts`). All marked "proposed". | keep; hide until approved | Hide until approved (AGENTS.md: all fees remain proposals). Not changed. |
| O-11 | **Tagline placement.** "Worship. Learn. Gather. Serve." appears exactly once (`OrganizationHero.astro:21`); homepage uses "Worship · Learn · Gather · Serve". Not in footer, metadata, JSON-LD, llms.txt or emails. | keep; add to footer/metadata | Homepage variant normalized to the canonical punctuation (Phase 5). Adding it elsewhere is a brand decision. |
| O-12 | **Live private APIs and admin sessions** (F-25/F-26): should staff be able to act in Gamo Live without a Live product account? | require a Live product account; allow staff override | Implemented: require Live product access; superadmin/staff keep access only through admin APIs (Phase 3). Confirm. |
| O-13 | **Request-path catalog seeding** (F-02/F-24): the bundled catalog published itself on first visit. | keep auto-seed; seed only via the editorial CLI/admin | Implemented: seeding is disabled outside `ENVIRONMENT=local`; production listings must come from the CLI/admin review (Phase 3). Owner must decide whether production should be seeded, and run it deliberately (H-03). |
| O-14 | **Admin nav labels use `/nonprofit/*` URLs** and "Fund reconciliation", "Stewardship reports" (`apps/admin/src/data/workspace.ts:96-102`); admin data says tax status "under evaluation" (`apps/admin/src/data/admin/nonprofit.ts:87`). Staff-only, but contradicts the PBC statement. | rename routes; keep | Rename to `/organization/*` when admin is next worked on. Not changed. |

**O-04 detail — every program-status phrase found (unchanged):**

- **web:** `pages/llms.txt.ts:16` "a developing program", `:17` "planned church-hosted and sponsored programs", `:19` "a proposed program"; `pages/mission.astro:11-12` "one developing mission", `:19` "as Gamo Studios develops its programs"; `pages/support.astro:8` "the developing Gamo Studios mission", `:9` "sustain our developing mission"; `pages/legal.astro:7` "any proposed Gamo administrative allocation"; `components/organization/OrganizationHero.astro:14` "Programs in preparation"; `SupportPathways.astro:6` "Explore proposed support", `:7` "agreed before launch", `:9` "as governance develops", `:14` "We are developing responsible pathways", `:18` "as organizational governance develops"; `PartnershipOpportunities.astro:6` "a proposed program … remain under development", `:7` "a future education program", `:16` "Proposed pathway", `:20` "still being developed. No membership tiers or contribution amounts are approved."; `mission/WhyWeExist.astro:16` "a developing … Public Benefit Corporation"; `home/HomeAcademySpotlight.astro:57-59` "being designed … proposed church-hosted music classrooms", `:86` "Planned · proposal", `:89-91` "We are planning church-hosted cohorts… remain proposals pending program launch", `:100` "Explore planned scholarship cohorts"; `home/HomeProductionSpotlight.astro:32` "Proposed technical ministry", `:36` "a proposed program", `:40` "(proposed)"; `home/HomeProgramsBento.astro:66` "cohorts in planning", `:67` "Planned church-hosted & scholarship pathways"; `home/HomeWorshipSpotlight.astro:50` "any proposed administrative allocation"; `home/HomeLiveSpotlight.astro:134` "Any future sponsored placement"; `data/organization.ts` "A planned network", "proposed church-hosted programs", "proposed private, group and community learning programs", "as community partnerships and dedicated program support are established", "Our initial local service area…"; `data/programs.ts:25` "church-hosted programs being planned"; `organization/ContactIntroduction.astro:11`, `pages/contact.astro:6` "Initial local program area".
- **worship:** `home/HeroSection.astro:11` "a developing program"; `pages/index.astro:15` "a developing program"; `home/AuditionSection.astro:11` "the same proposed process"; `home/AudienceSection.astro:13` "See who is proposed and confirmed"; `home/JoinSection.astro:9` "any proposed Gamo administrative allocation"; `home/FaqSection.astro:9` "Honest answers while we build."; `home/CoverageSection.astro` "Standby support is a goal of the program, not a guarantee."; `dashboard/OpportunityBoard.astro:15` "proposed musician pay"; `data/worship.ts:39` "still proposals awaiting board approval", `:41` "Service areas will be announced as the program develops."
- **academy:** `home/AcademyHero.astro:15` "planned church-hosted and sponsored programs"; `pages/index.astro:16` "sponsored options planned"; `home/SponsoredPrograms.astro:7` "Proposed reduced or no-cost lessons", `:8` "Proposed groups", `:9` "An idea under review", `:14` proposal pill; `home/ChurchHosted.astro:15` proposal pill; `home/InstructionFormats.astro:8` "a lower proposed cost per student"; `home/InstrumentDiscovery.astro:19` "More planned:"; `instruments/InstrumentOverview.astro:27` "Online or in person (planned)"; `data/lessons.ts` "Sponsorship planned", "/ session (proposed)"; `pages/lessons/[slug].astro:40` "Proposed tuition"; `data/registration.ts:14` "Proposed tuition amounts"; `pages/sponsored.astro:23` proposal pill (while `:21-22` uses present tense "coordinates sponsored … lessons").
- **production:** `ProductionHero.astro:16` "A proposed program…", `:22` proposal pill; `pages/index.astro:19` "A proposed Gamo Production program"; `MinistryIntro.astro:16` "being designed to…"; `pages/services/index.astro:10` "Six proposed ways … could support", `:11` "Proposed support areas"; `pages/training.astro:9` "Proposed hands-on training paths", `:11` pill; `TrainingSection.astro:16` same; `data/production.ts` "Proposed · N hands-on sessions" ×4, "remain proposals until approved"; `ProjectStoriesEmpty.astro:11` "has not completed any church projects yet", `:18` "once real work is documented"; `pages/services/[slug].astro:17` pill.
- **live:** `pages/checkout.astro:6` "Paid checkout is not available yet … only after the required release approvals."
- Inconsistency worth noting: `apps/web/src/data/programs.ts:20` (Worship) and `:35` (Production) use present tense with no status word, while the program sites say "proposed"/"developing".

## 5. Needs human action outside the code

| ID | Action | Why |
| --- | --- | --- |
| H-01 | Create separate KV namespaces for `SESSION`/`SESSION_KV` in preview (and a local placeholder ID), then put the new IDs in each `apps/*/wrangler.toml` `[env.preview]` block. Do not touch the production namespace. | F-05: preview and production currently share session storage. Requires Cloudflare dashboard/`wrangler kv namespace create` (production account access). |
| H-02 | **Rotate/retire the bootstrap admin password** that was committed in `packages/auth/index.ts` (value not repeated here) and confirm it was never set as a real `admin_credentials` row in preview/production D1. Consider rewriting git history before the repo is ever made public. | F-01: the value is in git history at every commit up to `35d233d`. |

## 6. Verification

## 7. How to revert

| Phase | Commit | Revert |
| --- | --- | --- |
| Checkpoint (pre-cleanup state) | `35d233d` | `git checkout 35d233d` or `git reset --hard 35d233d` on this branch |

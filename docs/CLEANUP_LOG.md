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
| D-08 | Prettier on the whole workspace (367 files) | format only touched files; format everything once | One isolated `style:` commit `c0711c3`, listed in `.git-blame-ignore-revs`. Markdown/docs, generated files and data excluded. | Consistent baseline; isolating it keeps every other diff readable. Rendered text of 12 pages compared before/after: identical except collapsible whitespace. |
| D-09 | `typecheck` ran `tsc` per app (skips `.astro`) | keep tsc; `astro check` | `astro check` per app + `tsc -p` per package + `tsc -p scripts` | `astro check` immediately found 6 real errors (see F-55). |
| D-10 | ~150 `no-explicit-any` hits | fix now; warn now, fix in Phase 2 | `warn` in Phase 1; Phase 2 types them and sets the rule (and `--max-warnings 0`) back to error | Kept Phase 1 to hygiene; typing touches auth/DB code that deserves its own commit. |
| D-11 | Orphaned tests (`scripts/audit/*.test.ts`, contract test) | leave; wire in | `pnpm test` = `tsx --test` over `packages/**` and `scripts/**` test files (105 → 110 tests) | They were green except one wrong expectation; they now run in CI. Browser/Miniflare e2e files (`*.test.mjs`) stay out until Phase 7. |
| D-12 | Env templates: both `.env.example` and `.dev.vars.example` per app, with values | keep both; one per location | Root `.env.example` (shared, loaded by env-loader) + `apps/<app>/.dev.vars.example` (per-app secrets; Cloudflare's convention, also read natively by the adapter). Names, required/optional and purpose only; no values. | Two templates per app were near-duplicates and drifted. Removed variables no code reads (F-52). |
| D-13 | 41 redirect-stub page files | keep files; delete files and links; central table | Links now point at real destinations; stubs replaced by per-app `src/lib/legacy-redirects.ts` tables consumed by `applicationPages(app, { legacyRedirects })` | Old bookmarks keep working, nothing renders a page just to redirect, and the routing rules are testable. Statuses preserved from the stubs (302 by default, 301 for consolidated routes, 303 where the stub used it). **Correction (Phase 7):** the first version used 302 for the Worship/Academy/Production form stubs that answered 303, and redirected retired *private* URLs before the sign-in guard; both fixed in `ae5184a` and covered by tests. |
| D-14 | Commit `1d17ee6` ("remove demo mode banners, sample tags … for pilot phase") vs AGENTS.md "fictional examples visibly labeled" | follow the commit; follow AGENTS.md | Follow AGENTS.md (the task brief repeats the rule); targeted sample labels added in Phase 2 | Owner decision recorded as O-03. |
| D-16 | Typing the Worker env | install `@cloudflare/workers-types`; generate `wrangler types` per app; hand-written `GamoEnv` | `GamoEnv` in `@gamo/config/env` with bindings typed `unknown` and validated at use (`getDb()` checks for `prepare`) | No new dependency, one type shared by six apps and the packages; ambient Workers types conflict with DOM lib types in Astro projects. |
| D-17 | `any` in tests | ban everywhere; allow in tests | `no-explicit-any` is an error everywhere except `*.test.*` and the Miniflare test worker | Tests build partial `APIContext`/row doubles; typing them adds noise without catching bugs. Source has zero `any`. |
| D-18 | Fake success paths (Stripe mock, Resend mock) | delete mocks; keep mocks but gate | Keep mocks behind an explicit `allowMock` option that callers set only when `ENVIRONMENT=local` | Local development still works without keys; preview/production fail closed (checkout 503 before any hold; email jobs stay queued). |
| D-19 | Fictional sample content on public pages | remove; replace with real data; label | Label visibly ("Sample · …" using the existing `sample` pill kind), as AGENTS.md requires | Removing or replacing content is an owner decision (O-03). |
| D-20 | Worship check-in demo stubs (pages + 2 API operations) | keep as labeled demo; return 501; remove | Remove the API operations (contract 2.0.0, compatibility note) and the fake confirmation pages; the check-in page now says online check-in is not available | They ignored input and claimed success; nothing called the API. |
| D-21 | Production consultation form and footer newsletter that discard input | wire to a backend; remove; replace with links | Replace with honest links to the existing inquiry/contact form | No approved backend for either; a new mailing-list provider needs owner approval (O-15). |
| D-22 | Brand config duplicated in `@gamo/domain` and `@studio-gamo/ui` | keep both; move to one | Move to `@gamo/config/brand` (dependency-free); domain re-exports; ui keeps only its request-time resolver | `@studio-gamo/ui` must not depend on `@gamo/domain`. |
| D-23 | Clerk per-product origin allow-lists duplicate `@gamo/config/apps` | derive; keep literal | Keep literal lists in `packages/auth/clerk.ts` | They are a security allow-list; explicit values are easier to audit than derived ones. |
| D-24 | Dependency updates | take all available; take none | Took none in Phase 2 | `pnpm audit`: 0 vulnerabilities. Every available minor (astro 7.4.0, @astrojs/cloudflare 14.4.0, @clerk/* , wrangler 4.151.1, playwright 1.64.1, redocly 2.64.1, eslint 10.13.0) was published 1–3 days ago; hold ~7 days for supply-chain safety, then `pnpm update -r`. Majors not taken: TypeScript 7 (breaks `openapi-typescript`, already pinned to TS 5.9.3 via override), zod 4 (API changes across `@gamo/domain` validation). |
| D-25 | Env validation "at startup" | throw at module load; validate per request; validate once per isolate | `checkEnvOnce()` on the first request per isolate (fatal checks every request); names only in logs | Workers have no startup hook and module-load throws give opaque 500s. Fatal (503): unknown `ENVIRONMENT`, `ENVIRONMENT=local` on a non-loopback host (mitigates F-34), local-only flags outside local. |
| D-26 | Request-path catalog seeding in production | keep; remove; gate | `seedCatalogIfAllowed(env)`: automatic only for `ENVIRONMENT=local` or explicit `LIVE_CATALOG_AUTOSEED=true` | Production already went live with the seed most likely applied; gating never deletes data, and the opt-in keeps a deliberate path (O-13, H-03). |
| D-27 | Listings publisher account | keep staff role; remove role; make non-loginable | `status: 'system'` (rejected by all sign-in/session paths), no roles; re-provisioning demotes older accounts | It only owns imported listings; its email is on `gamostudios.org`, a domain not confirmed as Gamo's (O-01). |
| D-28 | CSP strategy | Astro `security.csp` (hashes); header CSP with `'unsafe-inline'`; header CSP with no inline script | Header CSP from middleware with `script-src 'self'` (+ the product's Clerk Frontend API), achieved by building with `assetsInlineLimit: 0` / `inlineStylesheets: 'never'` and converting the 4 `is:inline` scripts | Astro's hash mode would also hash styles, which disables `'unsafe-inline'` and breaks the 11 `style=""` attributes; header CSP lets the Clerk origin vary per product. Verified in Chromium against production builds. CSP is not sent under `astro dev` (Vite HMR injects inline script). |
| D-29 | `requireSameOrigin` with no `Origin` header | reject; allow | Allow, but also reject `Sec-Fetch-Site: same-site` and a mismatched `Referer` | Browsers always send `Origin` on cross-origin non-GET requests; a request with neither header is not a browser and cannot carry a victim's cookies. Rejecting it would break server-to-server/API clients and tests. |
| D-30 | Admin logout via GET links | keep GET; POST only + change links; GET confirm page | GET renders a confirm page with a POST form; POST (same-origin) signs out | Closes logout CSRF without touching the two links. |
| D-31 | Applied D1 migrations are not idempotent (`CREATE TABLE` without `IF NOT EXISTS`) | rewrite them; leave | Leave applied migrations untouched; new migrations must be additive and use `IF NOT EXISTS` (documented in RUNBOOK) | Wrangler tracks applied migrations in `d1_migrations`; editing already-applied files is riskier than the theoretical re-run problem. The `0007` gap is harmless (applied in name order). |
| D-32 | Brand values | keep app values; booklet values | Booklet values (`design-reference/gamo-studios-booklet.html` `:root` and `.ttl`) for every token; old token names kept as aliases (`charcoal`→ink, `terracotta-dark`→deep, `ink-soft`→muted, `gold`→tan); only `ivory`/`night` are derived surfaces | One source of truth; aliases avoid a risky 700-file rename. |
| D-33 | Title style | utilities only; all headings | Display/section utilities + Live/auth `h1`/`h2` at `text-2xl`+ are 900 uppercase; panel headings (`text-lg`/`xl`) unchanged | Matches the booklet `.ttl`; small UI headings in uppercase would hurt scanning. Long sentence-style `h1`s now read heavy (O-16). |
| D-34 | Off-brand colors | map automatically by nearest color; curated role mapping | Curated role table (terracotta/deep/soft/ink/night/muted/cream/ivory/sand/line/tan) applied only to Tailwind color utilities; semantic status (green/red/amber) and chart series colors left as is | A nearest-color pass would turn status greens brown; curated mapping is reviewable in the commit. |
| D-35 | Self-hosting Inter | download files into `public/`; `@fontsource-variable/inter` | `@fontsource-variable/inter` (OFL) imported from tokens.css; Latin subset preloaded via `FontPreload.astro` | Versioned, fingerprinted by Vite, `font-display: swap`, weights 100–900 (makes `font-black` real), no runtime third party. |
| D-36 | Tap targets | 44 px everywhere; 44 px on touch widths | 44 px for every control at 360/768; shared header controls 44 px at all widths; desktop pointer-only nav pills unchanged; WCAG 2.5.8 exceptions honored (inline links in text, equivalent same-href control, stretched-link cards) | "Tap" targets are a touch concern; forcing 44 px desktop nav pills would break the header bar. |
| D-37 | Decorative text failing contrast | darken; aria-hidden; pseudo-element | Render purely decorative glyphs (giant initials, step numerals in ordered lists) via `::after { content: attr(data-glyph) }` | Keeps the design; not exposed as text to assistive tech or the contrast check; meaning is conveyed by the list order and headings. |
| D-38 | Capitalization convention | sentence case everywhere; Title Case everywhere | Document `<title>`s in Title Case (the majority already); headings, body text and in-page CTAs in sentence case; navigation labels unchanged | Smallest diff to a consistent rule; titles and headings were each already mostly in that style. |
| D-39 | HTML comments in templates | keep; strip with a build step; convert | Convert template `<!-- -->` comments to Astro `{/* */}` comments (stripped at build) | 102 internal notes (design-file names, implementation remarks) were shipped to every visitor on Live and in auth screens. |
| D-40 | Webhook event recording order (F-32) | record first; record after fulfillment | Keep: record only after fulfillment succeeds | A failure leaves the event unrecorded so Stripe retries; concurrent duplicates collide on deterministic ticket/payment keys (500) and the retry then deduplicates (`order.status === 'confirmed'`). No double issue is possible. |
| D-41 | Retries on external calls | none; always retry; retry only when idempotent | One retry on network error/429/5xx only when an idempotency key is sent (Stripe `checkout_session_<orderId>`, Resend `notification_job_<id>` / `auth_challenge_<id>`); 10 s timeouts | Retrying a non-idempotent POST could create duplicate sessions or emails. |
| D-42 | Two API error formats (`{success:false,error:{…}}` and `{error}` on checkout/webhook) | unify (breaking); keep | Keep, documented | Changing the shape is a breaking contract change for no current consumer benefit; Stripe ignores webhook bodies. RFC 7807 `Problem` stays unused. Revisit when a real client consumes checkout. |
| D-43 | Outbox consumer (F-09) | add cron `scheduled` handler; leave | Leave disabled; documented design (O-19) | A cron trigger would start sending real emails from production queues — an operational decision for the owner. |
| D-44 | Browser tests: dev server or production build | dev; build + `astro preview` | Production build via `astro preview` (Playwright `webServer`) | Tests what ships: enforced CSP, built assets, prerender/static behavior. It immediately found that prerendered pages bypassed the middleware. |
| D-45 | Prerendered detail pages (Academy instruments/lessons/instructors, Production services) | keep static and duplicate headers in `_headers`; render on demand | Render on demand; unknown slugs `Astro.rewrite('/404')` | One header/cache policy for every HTML response; the CSP needs the per-product Clerk origin, which static `_headers` cannot vary. Cost: a few ms of Worker time per view. |
| D-46 | Older Miniflare browser suites (`browser-e2e`, `phase1-journeys-e2e`) | delete; fix and run | Fix and run in `pnpm check` (`test:journeys`, 16 s) | They cover real sign-up/verify/workspace flows in a browser and caught two regressions of mine. |
| D-15 | Four domain services (`Academy`, `Worship`, `Production`, `Partnership`) and six zod schemas never used | keep as "foundation"; delete | Deleted (recoverable from `35d233d`) | Dead code with no route, test or caller; they implied functionality that does not exist. `MediaService` kept (tested). `createApiClient` kept (documented in `docs/OPENAPI_ARCHITECTURE.md`). |

## 2. Done

### Phase 1 — Repo hygiene and tooling

- **Hygiene files:** `.editorconfig`, `.gitattributes` (LF, binaries, generated files marked), `.nvmrc` (22.22.3), root `packageManager: pnpm@11.28.5`, `engines`, `private: true`; dropped bogus `main`/`license` fields. Files: root.
- **`.gitignore`** consolidated at the root (test output, `*.tsbuildinfo`, `.eslintcache`, editor dirs, generated screenshots); 6 duplicate `apps/*/.gitignore` deleted; `.DS_Store`, `docs/screenshots/` (1,273 PNGs, 627 MB), `artifacts/` untracked (kept on disk).
- **dev:all fixed** (F-07/F-08): `packages/config/apps.ts` (ports, inspector ports 9321–9326, `127.0.0.1`), `createGamoCloudflareConfig()` sets `inspectorPort` + `persistState`, new `createGamoDevServer()`. All six `astro.config.mjs` rewritten identically. Verified: all six apps up at once.
- **Linting/formatting:** `eslint.config.js` (typescript-eslint, eslint-plugin-astro, a11y rules), `.prettierrc.json`, `.prettierignore`, `knip.json`. Fixed: unused imports/vars, empty `catch {}` (now commented), lost `cause` on rethrown errors, a `prefer-const`, fragile multi-line member calls in `scripts/optimize-images.mjs`, an unnecessary regex escape. Justified disables: control-char regex in `safeReturnPath`, `tabindex` on the scrollable `ContentRail` region.
- **Dead code deleted** (each verified with an import resolver, see D-15): web old homepage sections (10) and `editorial/*` (10), `account/{OnboardingSteps,VerifiedAuthPanel}`, `organization/{AccountEntry,MissionPurpose,MissionValues,ProgramCollection}`, `page/SplitFeature`, `pages/preview/hero-2026` + `HeroBrightSection`/`HeroProgramCards`; web `data/workspaces/{account,partner}.ts`; live `data/events.ts` (fictional events) and `data/workspaces/{organizer,artist,agent,attendee}.ts`; worship `flow/{ChipGroup,DemoForm,NoticePanel,ProposalBreakdown,ScheduleStep,StatusTimeline}`, `dashboard/ChurchRoster`; academy `forms/DemoStepForm`, `dashboard/DashboardOverview`; production `AssessmentFlow`; admin `layouts/Layout`; ui `Badge`, `Button`, `Container`, `auth/AuthSplitLayout`, `auth/AuthStatusBanner`, `account/VerifiedAuthPanel`, `DemoNotice`, `dashboard/DemoModeBanner`; `packages/integrations/index.ts`; domain `services/{academy,worship,production,partnerships}.ts`; 6 unused zod schemas; unused data exports (`lessonBySlug`, `assessmentSteps`, `getEvent`, `eventsBy`, `cities`, `programs`, worship `roster`/`applySteps`/`hireSteps`).
- **Throwaway scripts deleted:** `scripts/{screenshot,capture-review-sections,generate-index,verify-responsive-refinement,dashboard-shots,verify-zoom-layout,verify-zoom-out,verify-dashboards-all-viewports,verify-dashboard-navigation,verify-live-discovery-launch}.mjs`, `scripts/audit/runtime-probe.mjs`, `apps/{live,production}/scripts/verify-ui.mjs`, `apps/worship/scripts/verify-frontends.mjs` (all unreferenced; several targeted retired routes; `generate-index.mjs` would overwrite the homepage).
- **Duplicate data:** removed root `gamo_live_verified_events_2026-10-15.json` and `data/gamo_live_events.json` (byte-identical to `data/gamo_live_verified_events_2026-10-15.json`); editorial CLI looks only in `data/`. Removed stale `docs/homepage-{desktop,mobile}.png`.
- **Unused dependencies removed:** `@clerk/astro` (8 workspaces), `@clerk/backend`/`@clerk/clerk-js` from apps (only packages import them), `@clerk/clerk-js` from auth, `@clerk/backend` from ui, `@studio-gamo/integrations` from admin, root `openapi-fetch`. Declared the missing `@gamo/domain` (worship/academy/production) and `@gamo/config` (all apps).
- **Redirect stubs:** 41 files replaced by legacy redirect tables (D-13); ~50 links updated to real destinations via new `inquiryUrl()`.
- **Env templates** rewritten (D-12): `.env.example`, `apps/*/.dev.vars.example`.
- **Root scripts:** `dev`, `dev:all`, `typecheck` (`typecheck:apps` = astro check, `typecheck:packages`), `lint`, `lint:fix`, `format`, `format:check`, `test`, `knip`, **`check`**. Makefile `check`/`lint`/`typecheck`/`format` call them.
- **CI:** `.github/workflows/ci.yml` replaces `api-contract.yml`: install (frozen), `api:docs`, `pnpm check`, OpenAPI compatibility review. Uses `.nvmrc` and the pinned pnpm (CI previously used pnpm 11.6.0).
- **Bugs fixed on the way** (found by `astro check`/tsc, F-55): live `/artists` date chip rendered `undefined`; admin `/security` crashed on a failed password change and dropped a panel description; admin `/security` displayed the bootstrap password (F-43, fixed); `auth.test.ts` fixtures used non-existent columns; `auth-journeys` expectation corrected (401, not 403, for a foreign-product session); admin `[...slug]` D1 enrichment that could never render removed (F-47 partially).

### Phase 2 — Code quality and architecture

- **Strictness:** `strict: true` everywhere (packages via `packages/config/tsconfig.base.json`, apps via `astro/tsconfigs/strict`, new `scripts/tsconfig.json`); `allowJs` for the generated validators.
- **Typed env and locals** (D-16): `packages/config/env.ts` (`GamoEnv`), `packages/auth/locals.ts` (`GamoLocals`), `packages/auth/app-locals.d.ts` (Astro `App.Locals`), `apps/*/src/env.d.ts`. `getRuntimeEnv()`, `getDb()`, `createDb()`, `verifyStaffBoundaryIdentity()`, Clerk resolver/token payload, page middleware, session viewer all typed. Removed every `(locals as Record<string, any>)` cast.
- **`any` removed from source** (150 → 0 outside tests, D-17): R2 binding (`R2BucketLike`), Clerk browser SDK (`ClerkLike`), dashboard export payloads, Stripe webhook object, ticket lookup records, catch clauses (`unknown`). Lint now `--max-warnings 0`.
- **One SQLite D1 shim** (`createSqliteD1`, `asD1` in `packages/db/testing.ts`); the editorial CLI's copy removed.
- **Package boundaries:** `exports` maps for `@gamo/auth` (`./page-access`, `./locals`, `./app-locals`) and `@gamo/domain` (`./page-middleware`); all `@gamo/domain/src/...` deep imports replaced.
- **Secret fallbacks removed:** `import.meta.env.SESSION_SECRET`/`process.env` fallbacks in admin middleware, staff provisioning and the Stripe webhook (build output was checked: no secrets were inlined, only `PUBLIC_*`).
- **No internal error text to users** (F-31 partly): admin sign-in exception → generic message + name-only log; CF Access and Stripe signature exceptions → fixed messages; registration form network errors → fixed message.
- **Storage tickets** (F-51 fixed): no hard-coded signing secret; a bound R2 bucket requires a ≥32-char secret; in-memory mode uses a random per-instance key.
- **Fail closed** (D-18): Stripe (`allowMock`, `StripeNotConfiguredError`, checkout 503 before any hold, well-formed mock URLs) — F-03 fixed; Resend (`allowMock`, `notConfigured` keeps jobs queued without spending a retry, 10 s timeout) — F-04 fixed.
- **Fictional content labeled** (D-19, F-44 partly): 11 pills changed from `verified` to `sample` ("Sample · Confirmed", "Sample instructor", "Sample lesson", …); `/opportunities` counter reads "sample opportunities (fictional examples …)"; `DashForm`/`DashDialog` keep their "demo only / nothing was saved" text and default to it.
- **Fake flows removed** (D-20, D-21): worship check-in stubs and confirmation pages (F-33, F-46 fixed; contract 2.0.0), production consultation form (F-45 fixed → `ConsultationRequest.astro`), footer newsletter form.
- **Duplicates consolidated:** brand config (D-22, F-42 fixed), `sites.ts` ports/origins from `@gamo/config/apps`, `ProgramLayout.astro` for worship/academy/production, live sitemap on `buildSitemapXml`, `formatUsd()` in `packages/ui/src/lib/format.ts`. Fixed doubled `<title>` suffix on 4 program pages.
- **Env validation** (D-25): `packages/config/env-validation.ts` + tests; wired into `applicationPages()` and admin middleware.
- **Dependencies** (D-24): audit clean; updates deliberately held.

### Phase 3 — Security and correctness

- **Request-path writes removed** (F-02, F-24 fixed): `LiveService.seedCatalogIfAllowed()` replaces 9 unconditional calls; publisher is a role-less `system` identity (`packages/domain/src/services/live.ts`); tests for both.
- **Hard-coded credentials removed** (F-01 fixed): bootstrap admin email/name/password constants deleted; `ensureBootstrapAdminAccount(db, identity, localDemo)` takes the identity from its caller; admin sign-in no longer pre-fills a personal email; personal data removed from admin fixtures; the password was redacted from `docs/BUILD_LOG.md`.
- **Cookies:** admin session cookie host-only (F-25 fixed); logout clears the legacy `.gamostudio.org` variant.
- **Product isolation** (F-26, F-13 fixed): 11 Live private routes use `requireProductAuth(…, 'live')` and authenticate before parsing the body.
- **CSRF** (F-28 fixed): stricter `requireSameOrigin()` (D-29); origin checks added to free registration and checkout; POST-only admin logout (D-30).
- **Input validation:** `Identifier` validation on the 4 routes that used raw `params.id`; no reflected ids in errors.
- **Error responses** (F-12 fixed, F-31 fixed): `handleApiError()` trusts only a leading `CODE:` prefix; unprefixed domain errors normalized (`FORBIDDEN:`, `NOT_FOUND:`, `BAD_REQUEST:`).
- **Admin** (F-29, F-30 fixed): Access + gateway session both resolved; timing-safe break-glass; robust Basic parsing.
- **Security headers** (F-27 fixed): `packages/domain/src/http/security-headers.ts`; `public/_headers` in each app; build settings in each `astro.config.mjs`; 4 `is:inline` scripts and 1 inline handler converted (and type-checked: 26 DOM null-safety errors fixed).
- **Contract 2.1.0** (F-06, F-17 fixed): see `docs/API_COMPATIBILITY.md`.
- **Tests added:** `scripts/audit/private-routes.test.ts` (every page and API method in every app; mutation-checked), `scripts/audit/security-headers.test.ts`, webhook unsigned/bad-signature, Access-only admin page, publisher identity, seeding guard.
- **SQL:** all runtime SQL is Drizzle or a static prepared statement; no string-built SQL outside tests/CLI (audit confirmed). The only raw query (admin `[...slug]`) was removed in Phase 1.
- **Secret scan** (tree + full history, names only): no real secret values found. Test fixtures use obviously fake keys (`sk_live_1234567890abcdef` to prove live keys are refused). Historical `.env.example`/`.dev.vars.example` values are all placeholder-shaped (17–30 chars, e.g. `sk_test_…placeholder`). No real `.dev.vars`/`.env`/key file was ever committed. **One real credential is in history:** the bootstrap admin temporary password and a personal email (first seen `b883c96`; files: `packages/auth/index.ts`, `apps/admin/src/pages/security.astro`, `docs/BUILD_LOG.md`, `scripts/audit/security.test.ts`) — see H-02.
- **Not done:** applying the migrations from scratch with `wrangler d1 migrations apply --local` (the command was declined in this session); the tests apply all 11 migrations in order to node:sqlite on every run instead.

### Phase 4 — Frontend, design consistency, accessibility, performance

- **Tokens** (D-32): `packages/ui/src/styles/tokens.css` — booklet palette, aliases, title utilities 900/uppercase (D-33), focus ring via tokens, `[tabindex]` focus ring.
- **Colors** (D-34, F-38 fixed): 741 arbitrary color classes → tokens in 38 files; admin gateway CSS, Live form CSS, chart series 1–2, program accents (lavender/blue/green → brand tints) and favicon colors moved to the palette. Remaining literals are semantic status colors, chart series 3–4 and neutral shadow tints.
- **Fonts** (D-35, F-37 partly): `@fontsource-variable/inter`, `FontPreload.astro`; all Google Fonts links removed (3 heads); CSP tightened accordingly.
- **Responsive** (D-36): scanner (Playwright) over 59 pages × 360/768/1280/1920: 0 horizontal overflow before and after the title change; small targets at touch widths 600+ → 0 (shared header/footer, Live header, cards, chips, selects, inputs, breadcrumbs).
- **Error pages** (F-37): `packages/ui/src/components/ErrorPage.astro`; `src/pages/404.astro` + `500.astro` in all public apps, `500.astro` in admin (its catch-all already returns 404). Verified 404 status and branded page on 5 apps.
- **Icons/manifest** (F-37): `HeadIcons.astro` (ico 32×32 declared correctly, svg, apple-touch, `site.webmanifest`, light/dark `theme-color`) in all three document heads; `icon-192.png` generated; admin gets `logo-512.png`; favicons regenerated in brand colors by `scripts/generate-favicons.mjs`; unused 16/32 PNGs removed.
- **Accessibility** (F-40 fixed): axe WCAG 2.0/2.1/2.2 A+AA on 59 pages × 2 widths: 80 → 0 violation entries (contrast on dark surfaces, decorative glyphs D-37, invalid `<dl>`s, Live wordmark name). One `<h1>` per page (web `/live` carousel had 4). Skip link on chrome-less pages; admin gateway `<main>`; Live logo/select focus rings restored; form field borders 3.3:1 (WCAG 1.4.11). Reduced-motion handling already existed (verified).
- **Images**: Live card images lazy + `decoding=async` + dimensions (were forced eager/sync on every card); mid-page Live image lazy. All other photos already use `<picture>` with AVIF/WebP and dimensions via `Photo.astro`.
- **Links** (F-53 resolved): 666 unique internal/cross-app link and image targets from 59 pages: 3 broken → 0. Real bug fixed: web `/live` fallback approved two editorially held listings. Preview/production builds inline correct sibling origins; `workers.dev` fallback pattern corrected.
- **Build**: builds no longer bind the dev inspector port (building while dev servers ran failed).

### Phase 5 — Content consistency (editing only)

- **Headline/tagline:** canonical Academy headline in `apps/web/src/data/programs.ts`; homepage card tagline `Worship. Learn. Gather. Serve.` (`HomeEditorialHero.astro`). The tagline still appears only in these places (O-11).
- **Spelling/grammar:** neighborhood (×2), favorite, traveling, practice; `apps/worship/src/pages/index.astro` (2 sentences), `apps/web/src/pages/llms.txt.ts`, `apps/web/src/data/organization.ts` FAQ.
- **Capitalization** (D-38): 34 document titles normalized (Title Case, "Sign In" kept as a phrasal verb); mission page CTA to sentence case.
- **Shipped comments** (D-39): 102 converted in 12 files (Live pages/components, auth components).
- **Fictional data:** sample emails on `riversidefellowship.org` (real-looking third-party domain) and fictional staff on `gamostudio.org` moved to `*.example`/`example.invalid` (admin fixtures, dashboard demo persona, a test).
- **Checked, nothing to change:** no lorem/TBD/placeholder copy; no prohibited legal-status words in public output (content audit); program names used consistently (Gamo Studios/Worship/Academy/Live/Production). "Gamo Live Listings" is the name of the listings publisher (data), kept.
- **Not changed (owner):** program-status wording (O-04), `hello@gamostudios.org` vs `gamostudio.org` (O-01 — `hello@gamostudios.org` does not appear in the code; other `gamostudios` addresses do), the musician pool's name varies between "Musician Collection", "musician collection", "a vetted collection" and "our reviewed network" (O-18), giving-style wording (O-06), "developing … Public Benefit Corporation" (O-07).

### Phase 6 — Data, API and integrations

- **Contract vs behavior:** 2.1.0 completed (declared 403s and the lookup 429; checkout description; open `StripeEvent.data`). New HTTP contract cases run the real handlers and validate responses against the spec: production checkout without a real key → 503 and no hold created; cross-origin checkout and registration → 403; a `customer.updated` event with `previous_attributes` → 200. `api:check` also confirms every operation has a handler and vice versa.
- **External calls** (D-41, F-10 fixed): `packages/integrations/src/stripe.ts` (`stripePost`, `StripeApiError`), `packages/integrations/src/resend.ts`; tests with a stubbed `fetch` in `http-retry.test.ts`.
- **Logging:** all runtime `console.*` calls reviewed; none logs personal data, request bodies or raw error objects (F-23 fixed).
- **Webhooks:** signature before anything else (existing), contract validation, idempotent recording (D-40).
- **Email** (F-11 fixed): verification email names the product in subject, heading and text; registration email uses the Worker's brand config and the event timezone (`formatEventStart`); booklet palette; every email has a plain-text part.
- **Database** (F-14 fixed): CLI requires a Wrangler-migrated local DB; `db:migrate:local`, `db:seed:local`, `db:reset:local`; `scripts/db/reset-local.mjs`; `docs/DATABASE.md` (tables, triggers, migrations, rules for new migrations, drift F-15, local vs remote). Verified all migrations apply from scratch with `wrangler d1 migrations apply --local` (H-06 resolved).
- **Not done:** outbox consumer (D-43/O-19); error format unification (D-42); schema drift reconciliation (F-15, needs table rebuilds).

### Phase 7 — Testing

- **Browser smoke suite** (`playwright.config.ts`, `tests/e2e/smoke.spec.ts`, D-44): all five public apps from production builds; every sitemap URL plus sign-in/ticket-recovery pages; per page: 200, one `<h1>`, no console/page/CSP errors, no broken images (lazy images forced to load), valid JSON-LD (`schema.org` `@context` + `@type`), `Cache-Control: private, no-store`, no 360 px overflow, no serious/critical axe WCAG 2.2 AA violations; every same-site/cross-app link fetched once (no ≥400); branded 404 per app; robots/sitemap headers. 15 tests, ~1 min.
- **Crawler files** (`scripts/audit/crawler-files.test.ts`): robots disallows `/api/`, `/account` and every private root in all three bot groups (checked against `isPrivatePage`), allows `/`, points at the sitemap; sitemaps are well-formed, same-origin, duplicate-free, public-only; `llms.txt` uses the approved PBC sentence and no prohibited words. 16 tests.
- **Private-route denial** (Phase 3) and **page cache rules** (`page-cache.test.ts` + smoke header check) included.
- **Journeys** (D-46): `test:journeys` fixed and wired in; regressions found and fixed: redirect statuses, redirect-before-auth on private legacy URLs.
- **Fixed from production-build testing** (D-45): prerendered pages bypassed middleware (no CSP/security headers); Live event hero label and breadcrumb contrast; metro venue link targets.
- **Removed:** `scripts/verify-public-ui.mjs`, `scripts/audit/verify-auth-ui.mjs` (screenshot scripts for retired routes, superseded), `test:web` script.
- `pnpm check` = typecheck → lint → format:check → test → api:check → build → test:journeys → test:e2e. CI installs Chromium first.

## 3. Findings

Ranked: **P0** = security/data-integrity risk in production, **P1** = correctness bug or broken user path, **P2** = quality/maintainability, **P3** = cosmetic. Status is updated as items are fixed.

| ID | Rank | Finding | Where | Status |
| --- | --- | --- | --- | --- |
| F-01 | P0 | A real person's email, name and a temporary admin password are hard-coded as bootstrap admin constants; the email is also rendered into the admin login HTML. The function using them is local-gated and has no callers, but the password is committed to git history. | `packages/auth/index.ts:720-722`, `apps/admin/src/middleware.ts:46` | **fixed** (Phase 3) |
| F-02 | P0 | Live catalog is seeded **and published** into D1 on the first anonymous GET (`LiveService.ensureVerifiedCatalogSeeded()` on `/`, `/events`, `/events/[id]`, `sitemap.xml`) with no environment gate — contradicts the catalog's own `requires_owner_review: true`. | `packages/domain/src/services/live.ts:3267-3283`; `apps/live/src/pages/index.astro:22` etc. | **fixed** (Phase 3) |
| F-03 | P0 | Checkout returns `200` with a **fake** Stripe session when `STRIPE_SECRET_KEY` is missing/`mock_`/`placeholder`, in any environment (AGENTS.md says checkout fails closed). Also builds a URL with two `?`. | `packages/integrations/src/stripe.ts:241-251`, `apps/live/src/pages/api/checkout/session.ts:55-77` | **fixed** (Phase 2) |
| F-04 | P0 | Free-registration confirmation emails are marked `sent` with a `mock_` id when no Resend key is configured, in any environment. | `apps/live/src/pages/api/events/[id]/register.ts:48-52`, `packages/integrations/src/resend.ts:48` | **fixed** (Phase 2) |
| F-05 | P0 | Same KV namespace ID used for local, preview **and** production in all six wrangler configs: preview Workers read/write production session data. | `apps/*/wrangler.toml` | needs human action (H-01) |
| F-06 | P1 | Stripe webhook contract schema closes `data` to `{object}` only; real `*.updated` events carry `data.previous_attributes` → `400` → Stripe retries forever. | `openapi/components/schemas/payments/StripeEvent.yaml`, `apps/live/src/pages/api/webhook/stripe.ts:54-61` | **fixed** (Phase 3) |
| F-07 | P1 | `pnpm dev:all` failed: all workerd runtimes bind inspector port 9229. | `apps/*/astro.config.mjs` | **fixed** (D-04) |
| F-08 | P1 | Local cross-app links point to `127.0.0.1` while dev servers bound `[::1]`. | `apps/*/wrangler.toml` `[vars]` | **fixed** (D-04) |
| F-09 | P1 | Outbox retry (`processPendingJobs`) is never called — no cron/scheduled handler — so failed emails are never retried. | `packages/domain/src/services/notifications.ts:148` | open — owner decision O-19 |
| F-10 | P1 | No timeouts on Resend/Stripe `fetch` calls. | `packages/integrations/src/resend.ts:59`, `stripe.ts:306,349` | **fixed** (Phase 6) |
| F-11 | P1 | Registration email uses `getPlatformBrandConfig()` without env → always defaults (`live.example.invalid`). Verification email is branded "Gamo Studios" for every product. | `packages/domain/src/services/notifications.ts:56-101,203` | **fixed** (Phase 6) |
| F-12 | P1 | `handleApiError` maps *any* error whose message contains "not found"/"duplicate"/"forbidden" to 404/409/403 — fragile, can return undeclared statuses. | `packages/domain/src/api/response.ts:103-118` | **fixed** (Phase 3) |
| F-13 | P1 | Several private routes parse/validate body before checking the session (anonymous gets 400, not 401). | artists, representatives, offers, inquiries, team, production-requests, refund, scan, events POST | **fixed** (Phase 3) |
| F-14 | P1 | Local live DB was migrated by the editorial CLI (no `d1_migrations` table), so `wrangler d1 migrations apply --local` would re-run everything and fail. CLI's own migration runner silently skips the rest of a file after the first "already exists". Local dry-run still mutates schema. | `scripts/live/editorial-cli.ts:136-165,261-277` | **fixed** (Phase 6) |
| F-15 | P2 | `schema.ts` drift vs migrations: `user_roles.id` not a PK in DB; 11 FKs have cascade/set-null in schema but NO ACTION in DB; 9 indexes exist only in schema. drizzle `meta/_journal.json` lists only 0000–0002. | `packages/db/schema.ts`, `packages/db/migrations/meta` | documented (docs/DATABASE.md); open |
| F-16 | P2 | Migration numbering gap (`0007` missing); most migrations use bare `CREATE TABLE`/`INDEX` (not idempotent if re-run by hand). | `packages/db/migrations/` | documented (D-31, docs/DATABASE.md) |
| F-17 | P2 | Two error formats in the API (`{success:false,error:{…}}` and `{error:string}` for checkout/webhook); RFC 7807 `Problem` schema defined but unused. Checkout contract text says "returns 503" but code returns 200. | `openapi/`, `apps/live/src/pages/api/checkout/session.ts` | **fixed** (Phase 3) |
| F-18 | P2 | `api:check`, `scripts/audit/*.test.ts` and browser tests are not run by `pnpm test`; one of them (`auth-journeys`) fails. | `package.json` | open (Phase 1/7) |
| F-19 | P2 | `tsc --noEmit` typecheck ignores `.astro` files. | `package.json` `typecheck` | open (Phase 1/2) |
| F-20 | P2 | worship/academy/production import `@gamo/domain` without declaring it. | `apps/{worship,academy,production}/package.json` | **fixed** |
| F-21 | P2 | Same catalog in 3 byte-identical JSON files + an embedded TS copy. | `gamo_live_verified_events_2026-10-15.json`, `data/*.json`, `packages/domain/src/services/verified-catalog-2026-10-15.ts` | open (Phase 1) |
| F-22 | P2 | Docs stale: `docs/DEPLOYMENT.md:75-79` names a nonexistent migration and stops at 0008; import report uses wrong DB name; README says legal status undecided (AGENTS.md: PBC); `openapi/root.yaml:6-8` also says undecided. | docs | open (Phase 8) |
| F-23 | P3 | Admin middleware logs the raw error object. | `apps/admin/src/middleware.ts:420` | **fixed** (Phase 2/6) |
| F-24 | P0 | Request-path seeding (F-02) also inserts a verified active user `listings-editorial@gamostudios.org` with a **global `staff_reviewer` role** and org ownership — on an anonymous GET in production. Called from 9 pages: live `/`, `/events`, `/events/[id]`, `/events/[id]/register`, `/venues`, `/artists`, `/artists/[slug]`, `sitemap.xml`, and web `/live`. | `packages/domain/src/services/live.ts:2433+,3267`; `live-external-discovery.ts:22` | **fixed** (Phase 3) |
| F-25 | P0 | Admin login sets `__session` with `Domain=.gamostudio.org` in production; that session has no product scope, and Live private APIs (`requireVerifiedAuth`) never check product membership → an admin session is accepted by every Live API. | `apps/admin/src/middleware.ts:31-39,265-271`; `packages/auth/index.ts:573` | **fixed** (Phase 3) |
| F-26 | P0 | Live private APIs (events POST, team, production-requests, artists POST, representatives, bookings, offers accept, revoke, refund, scan) do not check `hasProductAccess`. | `packages/auth/index.ts:573` | **fixed** (Phase 3) |
| F-27 | P0 | No security headers anywhere (CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors). | all apps | **fixed** (Phase 3) |
| F-28 | P1 | `requireSameOrigin` lets requests with **no** `Origin` header through. Live `/api/events/[id]/register` and `/api/checkout/session` have no origin check at all. Admin `/__admin_auth/logout` accepts GET with no origin check (logout CSRF). | `packages/auth/index.ts:708-714`; admin `middleware.ts:299` | **fixed** (Phase 3) |
| F-29 | P1 | Admin break-glass compares tokens with `===` (not constant-time); active whenever not prod or `ENABLE_BREAK_GLASS_AUTH=true`. | `apps/admin/src/middleware.ts:442,446,463` | **fixed** (Phase 3) |
| F-30 | P1 | Admin: a Cloudflare-Access-only user (valid JWT, no D1 session) is redirected to `/account/signin`, which in admin is the `[...slug]` route → redirect loop. | `apps/admin/src/middleware.ts:346-359` | **fixed** (Phase 3) |
| F-31 | P1 | Admin login page renders `err?.message` (escaped) into HTML; Stripe webhook returns `verification.error` which can carry `JSON.parse` messages; `handleApiError` returns `AuthError` messages verbatim (incl. Clerk config errors). | admin `middleware.ts:292`; `stripe.ts:210`; `response.ts:80-126` | **fixed** (Phase 3) |
| F-32 | P1 | Webhook fulfillment dedupe is read-then-write (not atomic); concurrent deliveries collide on deterministic PKs → 500. Event is recorded idempotent **after** fulfillment. | `packages/domain/src/services/live.ts:1967-2085`; `payments.ts:51-60` | by design (D-40) |
| F-33 | P1 | Worship `/api/check-in/{confirm,fail}` are unauthenticated no-op stubs (303 redirect) that are part of the public contract. | `apps/worship/src/pages/api/check-in/*.ts` | **fixed** (Phase 2) |
| F-34 | P2 | Default top-level wrangler env is `ENVIRONMENT="local"` — a `wrangler deploy` without `--env` ships "local" flags (demo gates still need a loopback hostname, so not exploitable on real hosts). | `apps/*/wrangler.toml` | open (Phase 2) |
| F-35 | P2 | Demo session endpoint (local + loopback only) can impersonate any existing user, incl. superadmin, without verification. Acceptable for local, but should be documented. | `packages/domain/src/http/auth.ts:164-220` | document |
| F-36 | P2 | No test exercises the `applicationPages` page middleware end to end; `scripts/audit/*` security tests are not in CI. | — | open (Phase 7) |
| F-37 | P1 | No `404.astro`/`500.astro` in any app; no web manifest or `theme-color`; Inter 900 never loaded although `font-black` is used; Google Fonts loaded at runtime. | all apps, `packages/ui/src/components/BaseLayout.astro:58-60` | **fixed** (Phase 4) |
| F-38 | P2 | Design tokens exist in one place (`packages/ui/src/styles/tokens.css`) but none matches the booklet values; ~945 arbitrary color classes and ~1,100 hex literals bypass them (worst: Live, which re-implements header/footer/logo with hex only). Auth CTA is purple/indigo. | `packages/ui/src/styles/tokens.css`, `apps/live/**`, `packages/ui/src/components/auth/*` | **fixed** (Phase 4) |
| F-39 | P2 | Admin login gateway is a hand-written HTML page inside middleware with its own palette and no skip link/landmarks. | `apps/admin/src/middleware.ts:55-200` | partly fixed: palette, landmark, icons (Phase 4); still hand-written HTML |
| F-40 | P2 | 18 `outline-none` without replacement; `AudienceSwitch` tabpanel loses focus ring; plain `<img>` without width/height in 5 Live spots (`LiveDiscoveryCard` also forces `loading=eager decoding=sync` on every card). | see Phase 4 | **fixed** (Phase 4) |
| F-41 | P2 | Optimized image set copied byte-identical into 5 apps' `public/` (≈6.9 MB each). | `apps/*/public/images/optimized` | open (left: duplicated optimized images; pipeline change) |
| F-42 | P2 | `packages/ui/src/lib/brand.ts` and `packages/domain/src/brand.ts` are duplicates. Brand emails use `*.gamostudios.local`. | — | **fixed** (Phase 2) |
| F-43 | P0 | Admin `/security` page **displays** the hard-coded bootstrap password (`security.astro:79,111`), ungated by environment. | `apps/admin/src/pages/security.astro` | **fixed** (Phase 2) |
| F-44 | P1 | `DemoNotice.astro` and `DemoModeBanner.astro` render nothing, so fictional content is unlabeled on public pages: Academy instructors (with "verified" pill, also in sitemap), Academy lessons "Open enrollment" with prices, Worship `/opportunities` (5 fictional churches with pay amounts), Worship roster card. `DashForm`/`DashDialog` strip "(demo)"/"(sample)" from labels. Violates the AGENTS.md labeling rule. | `packages/ui/src/components/{DemoNotice,dashboard/DemoModeBanner,dashboard/DashForm,dashboard/DashDialog}.astro` | **fixed** (labels, Phase 2); content decision O-03 |
| F-45 | P1 | Production homepage consultation form discards input: `onsubmit="return false"` then navigates to a redirect stub. | `apps/production/src/components/production/ConsultationForm.astro:12,29-32` | **fixed** (Phase 2) |
| F-46 | P1 | Worship `/check-in/*` pages always say "Your arrival has been recorded" without writing anything. | `apps/worship/src/pages/check-in/*.astro` | **fixed** (Phase 2) |
| F-47 | P2 | Admin workspace fixtures (~4,300 lines) can never render (`isolatedDemo` is never set in admin), and `[...slug].astro` prepends real D1 rows to fake rows. | `apps/admin/src/data/**`, `apps/admin/src/pages/[...slug].astro:14-60` | partly: dead D1 enrichment removed (Phase 1); fixtures kept for nav |
| F-48 | P2 | `scripts/generate-index.mjs` would overwrite the current homepage with an old layout. | `scripts/generate-index.mjs:396` | open (Phase 1) |
| F-49 | P2 | `@clerk/astro` declared in 8 packages, imported nowhere; `@clerk/backend`/`@clerk/clerk-js` declared in all apps but imported only by packages. | package.json files | open (Phase 1/2) |
| F-51 | P1 | Storage ticket signing falls back to a hard-coded secret constant when none is configured (forgeable upload/download tickets). No app route uses the R2 client yet. | `packages/integrations/src/storage.ts:119` | **fixed** (Phase 2) |
| F-52 | P3 | Variables set in templates/wrangler but read by no code: `ALLOW_TEST_CHALLENGE_OUTBOX`, `ADMIN_INITIAL_PASSWORD`, `CLERK_KEYLESS_DISABLED`, `PUBLIC_CLERK_KEYLESS_DISABLED`, `STRIPE_SANDBOX_ENABLED`. | templates, `apps/*/wrangler.toml` | templates **fixed**; wrangler vars left (deploy config) |
| F-53 | P1 | `siteOrigin()` reads `PUBLIC_SITE_URL_*`/`PUBLIC_ROOT_DOMAIN` from `import.meta.env` (build time); preview builds may therefore link to production origins, and the workers.dev pattern (`gamo-<app>.<root>`) does not match the real preview Worker names (`gamo-<app>-preview`). Duplicates the port table. | `packages/ui/src/lib/sites.ts` | **not a bug** in preview/production builds (explicit vars); fallback pattern fixed (Phase 4) |
| F-54 | P3 | Cloudflare account ID is committed in `Makefile` and every `wrangler.toml` although README says not to commit account identifiers (it is not a secret). | — | left; noted |
| F-55 | P1 | Real bugs hidden by the old typecheck: see Phase 1 Done "Bugs fixed on the way". | — | **fixed** |
| F-56 | P1 | gamostudio.org/live fallback approved two listings the editorial import holds (unverified ticket URL), linking to Live pages that 404. | `apps/web/src/data/live-marketing.ts` | **fixed** (Phase 4) |
| F-57 | P2 | Building while dev servers run failed (build bound the dev inspector port). | `packages/config/env-loader.ts` | **fixed** (Phase 4) |
| F-58 | P1 | Prerendered Academy/Production detail pages were served as static files without the CSP, security headers or the page cache rule. | `apps/academy/src/pages/{instruments,lessons,instructors}/[slug].astro`, `apps/production/src/pages/services/[slug].astro` | **fixed** (Phase 7) |
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
| O-15 | **Newsletter.** The footer had an email signup that stored and sent nothing (now a "Contact us for updates" link). | choose a mailing-list provider (needs approval: new external service); keep the link | Keep the link until a provider is approved. |
| O-16 | **Uppercase titles.** Per the booklet, page and section titles are now 900 uppercase. Some `h1`s are full sentences (e.g. Academy instructor pages: "A patient piano and voice teacher who loves…") and read heavy in uppercase. | keep; sentence-case long statements; shorten those headings | Keep the rule and shorten sentence-style headings (copy decision). |
| O-17 | **Homepage sample events** (`HomeLiveSpotlight.astro`) are now labeled "Sample", but the AGENTS.md Live rule says Live surfaces must show real database events. | label (done); replace with the same DB-backed list as gamostudio.org/live | Replace with real events (small code change once approved). |
| O-18 | **Name of the musician pool** varies: "Musician Collection" (footer), "musician collection" (`organization.ts`, `GetStartedRoutes.astro`, `JoinSection.astro`), "a vetted collection" (`programs.ts`), "our reviewed network" (worship layout). | pick one term | Pick one; then a one-line copy pass. |
| O-19 | **Sending queued emails.** Registration confirmations that fail (or are queued while email is unconfigured) are never retried: nothing runs `NotificationService.processPendingJobs`. | (a) cron trigger on the live Worker (custom Worker entry with a `scheduled` handler calling `processPendingJobs`, `[triggers] crons = ["*/10 * * * *"]`); (b) Cloudflare Queues; (c) leave manual | (a): smallest change; it sends real emails, so it needs approval and a configured Resend key. |
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
| H-03 | Decide whether production D1 should contain the bundled Live catalog. If it does not yet, either import it deliberately or set `LIVE_CATALOG_AUTOSEED=true` on the live Worker for one deploy, then remove it. Note: the editorial CLI cannot write to remote D1 (F-14). | O-13; request-path seeding is now off in production. |
| H-04 | In preview and production D1, remove the global role from the listings publisher and demote it: `DELETE FROM user_roles WHERE user_id = 'usr_gamo_live_listings_editorial'; UPDATE users SET status = 'system' WHERE id = 'usr_gamo_live_listings_editorial';` (`wrangler d1 execute gamo-db-<env> --remote --command "…"`). | F-24: code no longer grants it, but existing rows remain. |
| H-05 | Verify in a browser on preview that Clerk sign-in works under the new CSP for each product with Clerk keys (the policy allows the product's Clerk Frontend API derived from its publishable key, `img.clerk.com`, `clerk-telemetry.com`, `challenges.cloudflare.com`). If a product uses a Clerk custom domain, confirm it is the issuer. | D-28; Clerk was not configured locally, so this path was not exercised. |
| H-06 | ~~Confirm wrangler's splitter accepts all migrations from scratch.~~ **Done** in Phase 6 (into a scratch directory). Existing local databases created by the old CLI need `pnpm db:reset:local` once. | — |

## 6. Verification

### After Phase 1

| Command | Result |
| --- | --- |
| `pnpm check` (typecheck → lint → format:check → test → api:check → build) | **pass**, ~80 s |
| `pnpm typecheck` | 6 apps `astro check`: 0 errors / 0 warnings; 6 packages + scripts `tsc`: 0 errors |
| `pnpm lint` | 0 errors, 150 warnings (all `no-explicit-any`, D-10) |
| `pnpm test` | 110/110 pass (was 61 + 44 orphaned, 1 failing) |
| `pnpm api:check` | pass (12 contract tests, 58 operations matched) |
| `pnpm build` | all 6 apps build |
| `pnpm dev:all` (agent env vars unset = normal terminal) | all six respond: web/worship/academy/live/production 200, admin 401 (staff gate) |
| Redirect smoke on dev servers (17 URLs) | every legacy URL → intended target with intended status; real routes unaffected |
| Rendered-text diff before/after Prettier (12 pages) | no text change |

### After Phase 2

| Command | Result |
| --- | --- |
| `pnpm check` | **pass** |
| `pnpm lint` | 0 errors, 0 warnings (`--max-warnings 0`; `no-explicit-any` is an error outside tests) |
| `pnpm test` | 118/118 pass (new: env validation 6, Stripe fail-closed 3, email not-configured 1) |
| `pnpm api:check` | pass; contract 2.0.0; 56 operations covered |
| `pnpm audit` | 0 known vulnerabilities |
| Dev smoke (worship, live, web) | titles correct, 5 "Sample · Open service" pills on `/opportunities`, live sitemap 31 URLs, cross-app links all `http://127.0.0.1:432x` |

### After Phase 3

| Command | Result |
| --- | --- |
| `pnpm check` | **pass** |
| `pnpm test` | 137/137 pass (new: private-route denial ×12, security headers ×4, webhook signatures, publisher identity, seeding guard, Access-only page) |
| `pnpm api:check` | pass; contract 2.1.0 |
| CSP in Chromium (production builds via `astro preview`, web + live, 9 pages + favorites/sort/mobile-menu interactions) | 0 CSP violations, 0 console errors, 0 page errors |
| Secret scan (tree + `git log --all -p`) | no real secrets; one historical credential (H-02) |
| Mutation check: make `/workspaces` public | private-route test fails as expected |

### After Phase 4

| Command | Result |
| --- | --- |
| `pnpm check` | **pass** |
| Layout scan (59 pages × 360/768/1280/1920, Playwright) | 0 overflow; 0 controls < 44 px at 360/768; one `<h1>` per page |
| axe WCAG 2.2 AA (59 pages × 390/1280) | 0 violations (was 80 entries) |
| Link check (666 unique targets) | 0 broken |
| 404 on 5 public apps | branded page, status 404 |
| Preview/production builds of web | correct sibling origins inlined |

### After Phase 5

| Command | Result |
| --- | --- |
| `pnpm check` | **pass** |
| Rendered Live pages | 0 HTML comments shipped (was 3–25 per page) |

### After Phase 6

| Command | Result |
| --- | --- |
| `pnpm check` | **pass** |
| `pnpm api:check` | pass; 12 contract tests incl. the new fail-closed/cross-origin/webhook cases |
| `wrangler d1 migrations apply gamo-db-local --local --persist-to <scratch>` | all 11 migrations ✅ |
| `pnpm live:events:import --env staging --dry-run` | 18 approved, 2 held, 1 rejected (in memory) |

### After Phase 7

| Command | Result |
| --- | --- |
| `pnpm check` (full, incl. builds and browsers) | **pass**, 2 min 44 s |
| `pnpm test` | 158/158 |
| `pnpm api:check` | 12/12 contract tests |
| `pnpm test:journeys` | 2/2 (Miniflare + Chromium) |
| `pnpm test:e2e` | 15/15 (production builds) |

## 7. How to revert

| Phase | Commit | Revert |
| --- | --- | --- |
| Checkpoint (pre-cleanup state) | `35d233d` | `git checkout 35d233d` or `git reset --hard 35d233d` on this branch |
| Phase 1 | `d98b1f3` hygiene + dev:all · `0b26712` dead code/deps · `c0711c3` Prettier · `7d8ec12` blame-ignore · `2360897` redirects, tooling, astro-check fixes · `c01cf18` log | `git revert <sha>` per commit, newest first; or `git reset --hard 35d233d` |
| Phase 7 | `713de6c` smoke + crawler tests · `ae5184a` journeys + regressions · (log commit follows) | `git revert` newest first, or `git reset --hard 3323c85` |
| Phase 6 | `0d7a384` integrations/DB workflow · `fb5e91d` contract tests · `3323c85` log | `git revert` newest first, or `git reset --hard 0cfd416` |
| Phase 5 | `f9d4a1f` content · `0cfd416` log | `git revert f9d4a1f` |
| Phase 4 | `e202466` tokens/fonts/targets/error pages/icons · `4ee038a` links · `754c5dd` axe · `962847f` field borders · `c933bc2` log | `git revert` newest first, or `git reset --hard accea2b` |
| Phase 3 | `78f7584` privilege/credentials/CSRF · `be73cc4` headers + route tests · `3d91248` admin Access fix · `accea2b` log | `git revert` newest first, or `git reset --hard 062aa98` |
| Phase 2 | `8d47e01` types · `13d54a7` fail closed + sample labels + stub removal · `174fef0` dedupe · `5b00c0d` env validation · `062aa98` log | `git revert` newest first, or `git reset --hard c01cf18` (end of Phase 1) |

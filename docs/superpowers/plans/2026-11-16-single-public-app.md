# One Public App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (lead, inline) with superpowers:dispatching-parallel-agents for the waves marked parallel (disjoint file ownership, each agent in its own git worktree, no broad suites in agents). Every task follows superpowers:test-driven-development: failing test first, watch it fail, minimal change, pass. Steps use `- [ ]`. **Research first** (AGENTS.md): the research is done and recorded in the spec; an agent that meets a question the spec does not answer (Cloudflare rule syntax, Astro route priority, sitemap rules) checks the official docs before choosing and adds one line to `docs/DECISIONS.md`. Commit messages: one short sentence, no body, no attribution. Never deploy, change DNS, set secrets or push; those are the owner steps in Phase 5.

**Goal:** merge `apps/academy`, `apps/worship` and `apps/production` into `apps/web` as three sections (`src/features/<id>/` plus thin routes in `src/pages/<id>/`), driven by section manifests and one registry that generates the nav, footer, sitemaps, robots, llms.txt, JSON-LD and redirect tables; replace every cross-app link with `sectionPath()`; redirect the old subdomains once to the new paths; then delete the three apps. `admin` stays a separate app.

**Architecture:** one Worker (`gamo-web`) serves `gamostudio.org` with the union of the four apps' bindings. A `SectionManifest` per feature is the only thing the shell knows about a section; `sections/registry.ts` is the only file that imports manifests. Boundary rules (ESLint plus an audit test) forbid feature-to-feature imports and shared-to-feature imports, so deleting a section is "delete two folders and one registry line". Old-URL behavior is specified once, as a pure function (`legacyHostTarget`), which generates the Cloudflare Single Redirect expressions and is the oracle for the redirect tests.

**Tech stack:** Astro 7 + @astrojs/cloudflare 14.3 on Workers, TypeScript strict, `tsx --test`, ESLint `no-restricted-imports`, Playwright, Cloudflare Single Redirects (dashboard, owner).

**Spec:** `docs/superpowers/specs/2026-11-16-single-public-app-design.md`. Related: `docs/FRONTEND_ARCHITECTURE.md`, `docs/superpowers/plans/2026-11-16-frontend-foundation.md` (shell manifests), `docs/superpowers/plans/2026-11-16-forms-emails-invoices.md` (page tasks wait for this plan).

---

## Code survey: what the spec did not say (2026-11-16)

Findings that shape the tasks. Nothing here changes the decision; the spec's numbers and a few mechanisms are refined.

1. **Link count.** 97 `siteUrl(` calls exist, 52 of them `siteUrl('web', …)` (they stay valid but become plain paths where the caller is now in the same app), about 35 name a program literally and about 10 pass a dynamic id (`siteUrl(id)`, `siteUrl(program.id)`). The larger risk is **about 70 root-relative hard-coded links inside the three apps** (`href="/lessons"`, `/apply`, `/request`, `/services/${slug}`, `Location: '/registrations/manage'`, breadcrumbs `href: '/'`). After the move they would silently hit the main site's namespace or 404. A static audit test is part of the plan (Task 1.4).
2. **Domain code builds Academy URLs.** `packages/domain/src/services/academy-registrations.ts` hard-codes `openPath: '/registrations/open'` (twice) and takes an `origin` argument; callers pass `siteOrigin('academy')`. Both change to `sectionUrl('academy', …)`. Emailed manage links already in inboxes point at `academy.gamostudio.org/registrations/open?t=…`; the redirect must preserve the query (the full-URI wildcard does).
3. **Signed links and cookies are not host-bound.** Link tokens are HMAC-keyed by `CUSTOMER_LINK_SECRET` and the product string `'academy'` (`customer-link|academy|<token>`), looked up in D1; nothing checks the host. So the spec's "accept old and new host during one link TTL" needs no code. What it needs is the **same `CUSTOMER_LINK_SECRET` (and `PII_HASH_SECRET`) value on `gamo-web`** as on `gamo-academy` (owner step); a new value silently invalidates every outstanding link. The product key stays `'academy'` in the database. The host-only customer cookie `__gamo_customer_academy` is lost in the move (people reopen their emailed link or use "find my registration"); the new cookie gets `Path=/academy` instead of `/`.
4. **Turnstile and CSP need verification, not widening.** The merged app is served from `gamostudio.org`, which web's Turnstile widget already allows; CSP is `form-action 'self'`, `connect-src 'self'`, Turnstile origin only on pages with a protected form; no code passes `expectedHostname`. The work is tests that prove section pages get the same headers, plus the owner pruning dead hostnames later.
5. **Two hops for retired URLs.** Cloudflare's wildcard rule maps `worship.gamostudio.org/account/signin` to `/worship/account/signin`, and the section's legacy rule then redirects to `/worship`. Every URL that was in an old sitemap or was a live page is exactly one hop (tested); retired URLs (accounts, demo flows, `/hire`) are at most two hops and end on a real page (tested). Listing every retired URL in Cloudflare is impossible on Free (10 rules). The alternative (bind the old hostnames to the merged Worker and redirect in middleware, one hop for everything, no placeholder DNS) is noted in Phase 5 as the fallback if the two-hop case ever matters.
6. **Crawler files of the old hosts.** `academy.gamostudio.org/sitemap.xml` becomes `/academy/sitemap.xml`; `…/robots.txt` becomes `/academy/robots.txt`. Both would 404. Fix: per-section sitemaps live at `/<id>/sitemap.xml` (a sitemap may only list URLs at or below its own path, which fits) and `/<id>/robots.txt` and `/<id>/llms.txt` get generated 301s to the root files. The page middleware's crawler-file bypass (`/robots.txt`, `/sitemap.xml`, `/llms.txt` only) must accept the new sitemap paths, otherwise they get `Cache-Control: private, no-store`.
7. **Type plumbing assumes the app list.** `AppName` is used for `LOCAL_PORTS`, `programs.ts` (`id: AppName`, `satisfies Record<AppName>`), `PublicApp` is declared three times (`page-middleware.ts`, `page-access.ts`, tests), `env-validation.optionalSecretsFor` keys secrets by app, `scripts/preflight/requirements.ts` and `config.ts` list five apps, `BaseLayout` derives the canonical origin from `locals.product`, and `apps/admin/wrangler.toml` still carries `PUBLIC_SITE_URL_{WORSHIP,ACADEMY,PRODUCTION}`. Narrowing `AppName` must come last (Task 4.1) or every parallel agent breaks typecheck.
8. **Things that break silently on deletion:** `scripts/audit/workers.mjs` builds its `require` from `apps/academy/package.json`; `scripts/audit/phase1-journeys-e2e.test.mjs` and `browser-e2e.test.mjs` boot all five apps; `scripts/api/contract.test.ts` loops over five app names; `scripts/generate-favicons.mjs`, `generate-share-images.mjs`, `optimize-images.mjs`, `db/reset-local.mjs`, `preflight`, the `db:migrate:local` script (five wrangler calls) and ten Makefile targets list the apps; `.github/workflows/ci.yml` only mentions "six apps" in a comment.
9. **Ratchets are keyed by file path.** `ui-boundaries.test.ts` (raw-style baseline) and `frames.test.ts` (frame baseline) list `apps/academy/src/...` and `apps/production/src/...` paths; the move must re-key them mechanically without raising any count (they also fail when a count drops without the list being lowered).
10. **Static assets are already a union.** `apps/web/public/images` contains every file the other three have (checked with `diff -rq`: nothing exists only in academy, worship or production), the favicons and og image are byte-identical, and the three `app.css` files are identical two-liners. Only `site.webmanifest` differs (names); web's wins. No semantic-token overrides exist per program today, so `[data-section]` ships empty.
11. **Wrangler configs differ in only three ways:** academy's preview `STRIPE_TEST_CHECKOUT = "true"`, the production custom-domain route, and names. Bindings (`DB`, `MEDIA_BUCKET`, `SESSION`, `SESSION_KV`) and ids are identical. Secrets differ: web needs `RESEND_WEBHOOK_SECRET`, academy `CUSTOMER_LINK_SECRET`; `PII_HASH_SECRET`, `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` are in all four.
12. **In-flight work.** The tree has uncommitted shared-photo-frame work (`packages/ui/src/components/media`, `tokens.frame.css`, `frames.test.ts`, catalog) and other agents are changing forms, domain and admin code. Phase 2 starts only after the frame work is committed (its baselines move with the files); `git mv` keeps history for the rest.

## Global constraints

- AGENTS.md mission and copy rules: Christian, mission-driven PBC wording only; never nonprofit, charity, donation or tax wording; sample content labeled. Program order **Academy → Worship → Production** in every generated list (registry order is `PROGRAM_IDS`; a test pins it).
- This is a move, not a redesign: no copy, layout or visual change except links, titles' section suffix, and what the registry generates. Per-page screenshots before and after (Task 4.3) must match.
- Every page keeps: exactly one `<h1>`, axe WCAG 2.2 AA clean, no horizontal overflow at 360 px, targets at least 44 px, no inline scripts or handlers, pages on-demand (not prerendered), `Cache-Control: private, no-store` on pages, public cacheable crawler files.
- Hosts and ports from `packages/config/apps.ts`; links between sections only through `sectionPath()` / `sectionUrl()`; no hard-coded origin and no hard-coded section prefix outside the manifests, `sections/legacy-hosts.ts` and tests.
- Renamed or removed URLs get an entry in the owning section's `legacy-redirects.ts` (default 302; keep 301 for permanent moves and 303 for old form endpoints) under the **new prefixed path**.
- Fail closed unchanged: paid checkout 503 outside local and preview-with-flag; `assertStripeTestMode`; `ALLOW_*` local-only flags. `STRIPE_TEST_CHECKOUT` is fatal in production (existing check).
- Test economy: agents run only `pnpm exec tsx --test <file>` and one `astro check` of web at the end of their task; no build, no Playwright, no `pnpm check` in parallel agents. The lead runs `pnpm check:quick` per merged wave and the full `pnpm check` **once** at the end (Task 4.3), never while other runs share the machine. Astro commands run with `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT`.
- OpenAPI first applies to HTTP APIs only; this plan adds no API route (the Resend webhook already lives on web). If a task changes any route's contract, change `openapi/root.yaml` first.
- No new dependencies and no new providers. Logs name variables and error codes, never values.

## Review Focus

1. **Silent link breakage.** Any root-relative link, form action, `Astro.redirect`, `Location` header or breadcrumb inside a moved section that lacks the section prefix. (Task 1.4 static test; Task 3.2 crawl; smoke link check; reviewer greps `href="/`, `href={\``, `action=`, `Location`.)
2. **Redirect correctness.** One hop for every old sitemap and live-page URL; at most two for retired URLs; method preserved (308) for non-GET; query string preserved (emailed `?t=` and `?sent=` links); no loop with a section legacy rule (`/production/contact` must not bounce); old hosts' sitemap, robots and llms land on real files. (Tasks 1.6, 3.2.)
3. **Customer links, cookies, secrets.** Outbound emails use `sectionUrl('academy', …)`; the token verifies with the product key unchanged; the cookie is `Path=/academy`, `HttpOnly`, `SameSite=Lax`, `Secure`; the clear-cookie uses the same path; the owner copies `CUSTOMER_LINK_SECRET` and `PII_HASH_SECRET` unchanged. (Task 2.1, Task 5.1.)
4. **Section isolation.** No feature imports another feature; shared code (components, layouts, lib, data, sections) imports only `sections/registry.ts`, never a feature; deleting a section leaves no link, sitemap entry, robots rule, llms line, JSON-LD reference or nav item to it. (Tasks 1.4, 3.1 removal drill.)
5. **Headers and crawl policy.** Section pages carry the same CSP, Turnstile and `form-action` rules as before; transactional pages (`/academy/registrations`, `/academy/register`) stay in robots `Disallow`, `noindex`, `no-store`; new sitemap and robots routes are cacheable and bypass the page middleware's no-store rule.
6. **Config union.** `gamo-web` has every secret and var the four apps used (preview `STRIPE_TEST_CHECKOUT`, production never), `PUBLIC_SITE_URL_*` for web and admin only, preflight and env validation know the union, and fail-closed behavior is unchanged.
7. **Nothing lost.** Page count in the new sitemaps is at least the old inventory; every old sitemap URL is in the new ones; one `<h1>`, axe and 360 px checks cover all of them.
8. **Deletion order.** No worker or DNS record is removed before the redirects are verified in production; rollback is documented and rehearsed on paper.

## Target layout

```text
apps/web/src/
  sections/                      # shared section infrastructure
    types.ts                     # SectionManifest, SectionRegistry
    registry.ts                  # createRegistry(manifests); the ONLY importer of features/*/manifest
    nav.ts footer.ts sitemap.ts robots.ts llms.ts jsonld.ts redirects.ts
    legacy-hosts.ts              # old host -> prefix map, legacyHostTarget(), cloudflareRedirectRules()
  features/{academy,worship,production}/
    manifest.ts                  # id, labels, nav, card, sitemap(), privatePaths, legacyRedirects, jsonLd(), llms
    legacy-redirects.ts          # prefixed paths
    components/  data/  lib/     # moved from apps/<id>/src
  pages/{academy,worship,production}/...   # thin routes, moved from apps/<id>/src/pages
  pages/[section]/sitemap.xml.ts  # per-section sitemap (404 for unknown ids)
  pages/sitemap.xml.ts            # sitemap index
  pages/sitemap-site.xml.ts       # main-site pages
  pages/robots.txt.ts  pages/llms.txt.ts
  layouts/SiteLayout.astro  layouts/SectionLayout.astro
  site.config.ts                 # buildShell(sectionId?) from the registry
packages/config/programs.ts       # + SECTION_BASE_PATHS, sectionPath()
packages/ui/src/lib/sites.ts      # + sectionUrl()
scripts/audit/fixtures/old-public-urls.json   # captured once, from the OLD code
```

`SectionManifest` (typed, in `sections/types.ts`):

```ts
export interface SectionManifest {
  id: ProgramId;                      // 'academy' | 'worship' | 'production'
  basePath: `/${string}`;             // '/academy'
  label: string;                      // 'Academy'
  fullName: string;                   // 'Gamo Academy' (title suffix)
  nav: NavItem[];                     // section sub-links used by footer "Get involved"
  card: { audience: string; lead: string; summary: string; photo: PhotoKey; photoPosition?: string };
  sitemap: () => SitemapEntry[];      // paths relative to basePath; may read the section's data
  privatePaths: string[];             // relative; become robots Disallow rules
  legacyRedirects: LegacyRedirect[];  // already prefixed with basePath
  jsonLd: (origin: string) => object[]; // fragments that reference the Organization by @id, never redefine it
  llms: { description: string; links: { label: string; path: string; note: string }[] };
}
```

## Task list

| Phase | Task | Owner | Parallel |
| --- | --- | --- | --- |
| 0 | 0.1 Capture the old URL inventory | lead | no |
| 1 | 1.1 `sectionPath`, `sectionUrl` (additive) | lead | no |
| 1 | 1.2 Manifest type, registry, generators | lead | no |
| 1 | 1.3 Shell, layouts, crawler routes, middleware | lead | no |
| 1 | 1.4 Boundary lint and link audit | lead | no |
| 1 | 1.5 Merged runtime config (wrangler, env, preflight) | lead | no |
| 1 | 1.6 Gate tests (old-URL redirects, sitemap index, removal) | lead | no |
| 2 | 2.1 Move Academy | agent A | yes |
| 2 | 2.2 Move Worship | agent B | yes |
| 2 | 2.3 Move Production | agent C | yes |
| 2 | 2.4 Main-site links and program cards from the registry | agent D | yes |
| 2 | 2.5 Tooling scripts, Makefile, package scripts | agent E | yes |
| 2 | 2.6 Audit tests and e2e harness (not the two ratchets) | agent F | yes |
| 3 | 3.1 Re-key ratchets, merge, removal drill | lead | no |
| 4 | 4.1 Delete the three apps, narrow types, lockfile | lead | no |
| 4 | 4.2 Docs | lead | no |
| 4 | 4.3 Full verification | lead | no |
| 5 | 5.1 to 5.6 Owner steps (secrets, preview, deploy, redirect rules, DNS and worker deletion, Search Console) | owner | no |

---

## Phase 0: safety net (before touching anything)

### Task 0.1: Capture the old URL inventory from the old code

**Why first:** after deletion the old sitemaps, routes and redirect tables no longer exist. The redirect tests need them as data, so capture once from the current commit.

**Files:** Create `scripts/audit/capture-old-urls.ts` (deleted in Task 4.1), `scripts/audit/fixtures/old-public-urls.json`.

- [ ] Write the script. For each of `academy`, `worship`, `production` it records:
  1. **Sitemap paths:** import `apps/<id>/src/pages/sitemap.xml.ts`, call `GET` with a fake context at `siteOrigin(<id>)` (exactly like `scripts/audit/crawler-files.test.ts`), parse every `<loc>` to a path.
  2. **Page inventory:** walk `apps/<id>/src/pages`, skipping `api/`, `robots.txt.ts`, `sitemap.xml.ts`, `404`, `500`; static routes as they are; dynamic routes expanded from the old data modules (`instruments`, `lessons` via `lessonRef` for `register/[lesson]`, `instructors`, production `supportAreas`). Mark each `indexed` (in the sitemap) or `transactional` (`/registrations/*`, `/register/*`).
  3. **Retired URLs:** for every string `from` in the old `legacy-redirects.ts`, replace `/*` with `/x`, run `matchLegacyRedirect`, store `{ from, status, finalLocation }` (absolute `siteUrl(...)` results kept as given).
  4. **Crawler files:** `/robots.txt`, `/sitemap.xml` per old host.
- [ ] Write the JSON with `capturedFrom` (git sha), `capturedAt`, and counts. Commit the fixture. Cross-check against production when network is available: `curl -s https://academy.gamostudio.org/sitemap.xml | grep -o '<loc>[^<]*' | sort` for each host; record any difference in `docs/BUILD_LOG.md` (the code is authoritative; production may lag).
- [ ] Record baselines in `docs/BUILD_LOG.md`: page counts per old app, `apps/web` worker size from `pnpm --filter apps-web exec wrangler deploy --dry-run --env production --outdir /tmp/gamo-web-before` (the "Total Upload" line).

---

## Phase 1: foundation (lead, sequential)

### Task 1.1: `sectionPath()` and `sectionUrl()` (additive only)

**Files:** `packages/config/programs.ts` (+`programs.test.ts`), `packages/ui/src/lib/sites.ts` (+ new `packages/ui/src/lib/sites.test.ts`).

- [ ] Failing tests: `sectionPath('academy')` is `/academy`; `sectionPath('academy', '/lessons')` is `/academy/lessons`; `sectionPath('worship', '/')` is `/worship`; leading slash optional; query and hash pass through (`sectionPath('academy', '/lessons?ages=teen')`); unknown id throws `RangeError`; `sectionUrl('academy', '/lessons')` equals `siteUrl('web', '/academy/lessons')` in local, preview (`PUBLIC_ROOT_DOMAIN=gamostudio.workers.dev`) and production; `PROGRAMS` order is Academy, Worship, Production.
- [ ] Implement `SECTION_BASE_PATHS` derived from `PROGRAMS` (`/${id}`), `sectionPath`, and `sectionUrl` (= `siteUrl('web', sectionPath(...))`). Change `PROGRAMS[].id` typing to its own `ProgramId` literal union (stop using `AppName`). **Do not** narrow `AppName` or `SiteKey` yet (Task 4.1); mark `siteUrl('academy'|'worship'|'production', …)` `@deprecated` in its JSDoc.
- [ ] `pnpm exec tsx --test packages/config/programs.test.ts packages/ui/src/lib/sites.test.ts` → PASS. Commit.

### Task 1.2: Manifest type, registry and generators

**Files:** `apps/web/src/sections/{types,registry,nav,footer,sitemap,robots,llms,jsonld,redirects}.ts`; stub manifests `apps/web/src/features/{academy,worship,production}/manifest.ts` (labels and `card` copied from `apps/web/src/data/programs.ts`; empty sitemap and redirects for now); `scripts/audit/sections.test.ts`.

- [ ] Failing tests in `scripts/audit/sections.test.ts` using small fixture manifests passed to `createRegistry()`: sections appear in `PROGRAM_IDS` order regardless of the array order given (or the factory throws on a different order, pick one and test it); duplicate ids or overlapping base paths throw; `nav()` returns program items then Mission using `sectionPath`; `footerGroups()` builds Programs, Get involved (from each `nav`), Organization; `sitemapIndex(origin)` lists the site sitemap plus one per section at `/<id>/sitemap.xml`; `sectionSitemap(id, origin)` contains only `origin + basePath + …` URLs and throws for an unknown id; `robotsTxt()` Disallow list = `/api/`, `/preview/` plus each section's `privatePaths` prefixed; `llmsTxt()` links every section by path; `redirects()` = web-level rules + every section's rules + generated `/<id>/robots.txt` → `/robots.txt` and `/<id>/llms.txt` → `/llms.txt` (301); `jsonLdFor(id)` never contains an `Organization` node and references `<origin>/#organization`.
- [ ] Implement. `organizationJsonLd(origin)` moves out of `pages/index.astro` into `sections/jsonld.ts` (single node, `@id` `https://gamostudio.org/#organization`). `registry.ts` exports `registry = createRegistry([academy, worship, production])` and is the only file importing `features/*/manifest`.
- [ ] `pnpm exec tsx --test scripts/audit/sections.test.ts` → PASS. Commit.

### Task 1.3: Shell, layouts, crawler routes and middleware

**Files:** `apps/web/src/site.config.ts`, `apps/web/src/layouts/{SiteLayout,SectionLayout}.astro` (SectionLayout replaces the three `Layout.astro`), `packages/ui/src/components/BaseLayout.astro` (+ `ProgramLayout.astro`), `packages/ui/src/styles/tokens.semantic.css` (comment), `apps/web/src/pages/{sitemap.xml,sitemap-site.xml,robots.txt,llms.txt}.ts`, `apps/web/src/pages/[section]/sitemap.xml.ts`, `apps/web/src/middleware.ts`, `packages/domain/src/api/page-middleware.ts`, tests `scripts/audit/crawler-files.test.ts` (extended in 2.6) and `scripts/audit/security-headers.test.ts`.

- [ ] Failing tests: `applicationPages('web')` returns `public, max-age` (not `private, no-store`) for `/sitemap.xml`, `/sitemap-site.xml`, `/academy/sitemap.xml`, `/robots.txt`, `/llms.txt` and still `private, no-store` for `/academy/lessons`; a page under `/academy/register/x` gets Turnstile in CSP and its requested `form-action` origin, `connect-src 'self'`.
- [ ] Implement: `isCrawlerFile(pathname)` helper used by the middleware bypass (`/robots.txt`, `/llms.txt`, `/sitemap*.xml`, `/<id>/sitemap.xml`; no section names hard-coded: match the suffix and let the route 404). `site.config.ts` exports `buildShell(sectionId?)` (brand `programLabel` for a section, nav and footer from the registry, `contactHref` `/contact`). `BaseLayout` gets an optional `section` prop that renders `data-section` on the body; `SectionLayout` passes `section`, `programLabel` and `current` from the registry. Rename the reserved `data-program` hook comment in `tokens.semantic.css` to `data-section`; add no overrides (none exist today). Replace the `app` derivation for canonical URLs only if needed: with `locals.product` equal to `'web'` the canonical is already `https://gamostudio.org/<path>`.
- [ ] Routes: `sitemap.xml` is the index; `sitemap-site.xml` lists the main-site pages (current `sitemap.xml.ts` list); `[section]/sitemap.xml` calls `registry.sectionSitemap(params.section)` and answers 404 for unknown ids; `robots.txt` and `llms.txt` come from the registry (the PBC wording and no-nonprofit assertions in `crawler-files.test.ts` still apply). All `prerender = false`.
- [ ] Targeted tests PASS. `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT pnpm --filter apps-web exec astro check` has no new errors. Commit.

### Task 1.4: Boundary lint and link audit

**Files:** `eslint.config.js`, `scripts/audit/section-boundaries.test.ts`, `AGENTS.md` front-end rule list (one line, with Task 4.2).

- [ ] Failing tests in `section-boundaries.test.ts` (scans `apps/web/src/**/*.{ts,astro}` including `<script>` blocks, `import()` and `import.meta.glob`):
  1. A file under `features/<a>/` or `pages/<a>/` imports nothing from `features/<b>/` (relative or aliased).
  2. Files under `components/`, `layouts/`, `lib/`, `data/`, `sections/` (except `sections/registry.ts`) and top-level `pages/*` import nothing from `features/`.
  3. `packages/**` never imports `apps/**` (kept from `ui-boundaries.test.ts`).
  4. **Bare section links:** in `features/<id>/**` and `pages/<id>/**`, a string literal or template that starts with `/` and is used as `href`, `action`, `Location`, `redirect(` or breadcrumb `href` must start with `/<id>` or be an allowed main-site path (`/contact`, `/legal`, `/partners`, `/get-involved`, `/mission`, `/support`, `/faq`, `/get-started`, `/`-only when passed through `sectionPath`). `href="/"` alone is rejected (it now means the main site). Everything else must be written `sectionPath('<id>', …)`.
  5. No `siteUrl('academy' | 'worship' | 'production', …)` anywhere under `apps/` or `packages/` (the allowed form is `sectionUrl`).
- [ ] `eslint.config.js`: per-section `no-restricted-imports` overrides (features and pages of `<a>` may not match `**/features/<b>/**` for the other two ids; shared globs may not match `**/features/**`). Verify `eslint-plugin-astro` applies the rule to `.astro` frontmatter by adding a deliberate violation in a scratch file, seeing it fail, deleting it.
- [ ] The test is RED on the current tree for rules 4 and 5 (they apply once files move); mark rules 4 and 5 as the Phase 2 gate. Commit.

### Task 1.5: Merged runtime config

**Files:** `apps/web/package.json` (union of dependencies; the four are already near-identical, add `@gamo/auth` where a section needs it), `apps/web/wrangler.toml`, `apps/web/.dev.vars.example`, `packages/config/env-validation.ts` (+test), `packages/config/env.ts` (only if a var is missing), `scripts/preflight/{requirements,config}.ts` (+`preflight.test.ts`), `packages/domain/src/api/page-middleware.ts` (`PublicApp` re-exported from one place), `packages/auth/page-access.ts`.

- [ ] Failing tests: `validateEnv('web', …)` warns for a missing `CUSTOMER_LINK_SECRET`, `PII_HASH_SECRET` and `RESEND_WEBHOOK_SECRET` by name; preflight `requirementsFor('web')` lists the union (`PII_HASH_SECRET`, `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `RESEND_WEBHOOK_SECRET`, `CUSTOMER_LINK_SECRET`) and the existing `STRIPE_TEST_CHECKOUT` production check still applies to `web`; one declaration of `PublicApp` (`'web'`).
- [ ] `wrangler.toml`: remove `PUBLIC_SITE_URL_{WORSHIP,ACADEMY,PRODUCTION}` from local, preview and production; add `STRIPE_TEST_CHECKOUT = "true"` to preview vars only; bindings are already identical, nothing to union. Keep `www` and apex custom domains. Admin's wrangler loses the three `PUBLIC_SITE_URL_*` lines in Task 4.1 (with the type narrowing) so `siteOrigin` keeps working until then.
- [ ] `.dev.vars.example`: union of the four files (plus the commented `STRIPE_SECRET_KEY` line from academy's).
- [ ] Tests PASS (`pnpm exec tsx --test packages/config/env-validation.test.ts scripts/preflight/preflight.test.ts`). Commit.

### Task 1.6: Gate tests (written now, red until Phase 2 completes)

**Files:** `apps/web/src/sections/legacy-hosts.ts`, `scripts/audit/single-app.test.ts`.

- [ ] `legacy-hosts.ts` is the single source for old-host behavior: `LEGACY_HOSTS = { 'academy.gamostudio.org': '/academy', 'worship.gamostudio.org': '/worship', 'production.gamostudio.org': '/production' }`; `legacyHostTarget(url: URL): string | null` = `https://gamostudio.org` + prefix + the original path (root gives `<prefix>/`), query and hash preserved; `cloudflareRedirectRules()` returns the rule objects (name, `when`, `expression`, `status`) rendered in Task 5.4.
- [ ] Tests in `single-app.test.ts`, all read `scripts/audit/fixtures/old-public-urls.json`:
  1. **Every old URL redirects once to an existing page.** For each old `indexed` and `transactional` URL: `legacyHostTarget` yields `https://gamostudio.org/<id><path>`; `matchLegacyRedirect(registry.redirects(), newUrl)` is `null` (one hop); the new path exists as a route (`routeExists(path)` walks `apps/web/src/pages`, turns `[param]` into a pattern, and for dynamic segments requires the slug to be in the section's sitemap entries) and, for `indexed` URLs, is listed in the new section sitemap.
  2. **Retired URLs** (fixture `retired`): after `legacyHostTarget`, at most one section rule applies, the result is not itself redirected again, ends on an existing route or on a main-site/admin URL, and total hops are at most two. The expected final path equals the old final path prefixed with the section (`/account/x` → `/<id>`, `/hire/x` → `/<id>/request`, `/dashboard` → `/<id>` with status 301 kept), absolute `siteUrl('web', '/contact')` results kept as `/contact`.
  3. **Crawler files:** each old host's `/sitemap.xml` maps to `/<id>/sitemap.xml` (200, lists the fixture's indexed paths prefixed); `/robots.txt` and `/llms.txt` map through the generated 301 to the root files.
  4. **Sitemap index lists all sections:** `/sitemap.xml` contains `sitemap-site.xml` and one `/<id>/sitemap.xml` per `PROGRAM_IDS`; every child exists and is same-origin; the union of children covers every fixture `indexed` path (prefixed for sections, as-is for the site) and has no duplicates and no `/api/`, retired or private path.
  5. **Non-GET and query:** a table test asserts `cloudflareRedirectRules()` has a 301 rule (GET, HEAD) and a 308 rule (everything else) per old host, and that each expression keeps the query (it uses the full URI).
  6. **Section removal leaves nothing:** for each id, `createRegistry(allExcept(id))` generates nav, footer, sitemap index, robots, llms, JSON-LD and redirects with no `/<id>` path and no `<id>` link; a static scan of `apps/web/src` outside `features/<id>/`, `pages/<id>/`, `sections/registry.ts`, `sections/legacy-hosts.ts` finds no `sectionPath('<id>'`, `sectionUrl('<id>'`, or link literal to `/<id>` (prose may still say "Gamo Production").
- [ ] Run → FAIL (expected until Phase 2). Commit with the fixture.

---

## Phase 2: move the sections (parallel, disjoint ownership)

Every agent works in its own worktree, writes only the files it owns, runs only the named test files and one `astro check` of web at the end, and reports files changed. The three move tasks share one checklist (below), then add their section-specific steps.

**Move checklist (Tasks 2.1 to 2.3)**
- [ ] `git mv apps/<id>/src/{components,data,lib} apps/web/src/features/<id>/` and `apps/<id>/src/pages/**` to `apps/web/src/pages/<id>/` (drop `404`, `500`, `robots.txt.ts`, `sitemap.xml.ts`, `Layout.astro`, `site.config.ts`, `middleware.ts`; they are replaced by the shared ones). Do not touch `apps/<id>/` otherwise; Task 4.1 deletes it.
- [ ] Fix imports; pages import `../../layouts/SectionLayout.astro` with `section="<id>"`. Page frontmatter longer than about 40 lines of logic moves to `features/<id>/lib/*.ts` so routes stay thin.
- [ ] Rewrite every link: `grep -nE "href=[\"'{\`]/|action=|Astro\.redirect|Location|siteUrl\(" apps/web/src/{features,pages}/<id>` → `sectionPath('<id>', …)` for in-section links, plain `/contact` style paths for main-site links (replacing `siteUrl('web', …)`), `siteUrl('admin', …)` unchanged. Breadcrumb roots `{ label: '<Label>', href: '/' }` become `sectionPath('<id>')`.
- [ ] Fill `features/<id>/manifest.ts`: `sitemap()` reproduces the fixture's old sitemap entries (same priority and changefreq) from the section's data; `privatePaths`; `legacyRedirects` moved from the old table to `features/<id>/legacy-redirects.ts` with prefixed `from` and `to` and unchanged statuses; `card`, `nav`, `llms`, `jsonLd`.
- [ ] Run the section's slice of `scripts/audit/single-app.test.ts` and `scripts/audit/section-boundaries.test.ts` (rules 1 to 5) → PASS for this section; `astro check` shows no new errors. Commit: one sentence.

### Task 2.1: Move Academy (agent A)

**Owns:** `apps/web/src/features/academy/**`, `apps/web/src/pages/academy/**`, `packages/domain/src/services/{academy-registrations,customers}.ts` (+ their tests), `tests/e2e/academy-registration.spec.ts`.

- [ ] Failing tests first: `academy-registrations.test.ts` asserts the receipt and recovery emails contain `https://gamostudio.org/academy/registrations/open?t=` built from `sectionUrl` (no `origin` argument any more, or `origin` is the web origin and the path comes from `sectionPath('academy', '/registrations/open')`); `customers.test.ts` asserts the customer cookie is `Path=/academy` and the clear cookie uses the same `Path`, still `HttpOnly; SameSite=Lax; Secure` on https; a token issued for product `academy` still verifies (hash unchanged); the product key and the cookie name `__gamo_customer_academy` are unchanged.
- [ ] Implement the two domain changes; pages `register/[lesson]`, `registrations/{find,open,manage,receipt}`, `sponsored`, `lessons`, `instruments`, `instructors` move per the checklist; rate-limit route names (`academy.register`) and Turnstile actions stay. `requestSecurityHeaders` calls stay as they are. Robots `privatePaths`: `/register`, `/registrations` (the old `/host-apply` entry goes with the retired redirect, now `/academy/host-apply` → `/contact`).
- [ ] Legacy rules (prefixed): `/academy/register` 303 → `/academy/lessons`; `/academy/host-apply` 303 → `/contact`; `/academy/dashboard` 301 → `/academy`; `/academy/{account,family,instructor,host}/*` → `/academy`.
- [ ] `academy-registration.spec.ts`: origin `http://127.0.0.1:4321`, paths `/academy/...` (the spec is run by the lead in Task 4.3).
- [ ] `pnpm exec tsx --test packages/domain/src/services/academy-registrations.test.ts packages/domain/src/services/customers.test.ts` plus the Academy slice of the gate tests → PASS.

### Task 2.2: Move Worship (agent B)

**Owns:** `apps/web/src/features/worship/**`, `apps/web/src/pages/worship/**`.

- [ ] Pages: `index`, `apply`, `request` (placeholders until the forms plan's Task 2.3; the forms plan builds the real pages under the same paths). Legacy rules (prefixed): `/worship/account/*`, `/worship/opportunities`, `/worship/check-in/*` → `/worship`; `/worship/musician/*` → `/worship/apply`; `/worship/church/*` → `/worship/request`; `/worship/hire/*` 303 → `/worship/request`; `/worship/admin/*` 301 → `siteUrl('admin', '/worship/placement')`.
- [ ] Sitemap: `/`, `/apply`, `/request` (relative, becomes `/worship`, `/worship/apply`, `/worship/request`).
- [ ] Targeted tests: Worship slice of the gate tests → PASS.

### Task 2.3: Move Production (agent C)

**Owns:** `apps/web/src/features/production/**`, `apps/web/src/pages/production/**`.

- [ ] Pages: `index`, `services/index`, `services/[slug]`, `training`, `apply`, `request`. Legacy rules (prefixed): `/production/account/*` → `/production`; `/production/crew/*` → `/production/apply`; `/production/client/*` → `/production/request`; `/production/{assessment,consultation/*,contact}` 303 → `/production/request` (`/production/contact` must not collide with the main site's `/contact`: the rule is under the prefix, so it cannot).
- [ ] Remove the `.production-hero-title` global-CSS leftovers only if they already live in feature components; do not restyle.
- [ ] Targeted tests: Production slice of the gate tests → PASS.

### Task 2.4: Main-site links and program cards from the registry (agent D)

**Owns:** `apps/web/src/{pages/*.astro,pages/partners/**,pages/legal/**,components/**,data/**}` (not `features/`, not `sections/`).

- [ ] Replace `data/programs.ts` entries and every `siteUrl('academy'|'worship'|'production')` in `data/organization.ts`, home, mission, get-started, get-involved, partners and `components/catalog/ExistingCatalog.astro` with `registry.sections` (cards from `manifest.card`, links from `sectionPath`). Delete the duplicate `programs.ts` once nothing imports it. Program order comes from the registry.
- [ ] Failing test first: extend `scripts/audit/single-app.test.ts` rule 6 with the home page's program cards (render the data function with a registry minus one section; no card, no link).
- [ ] `inquiryUrl` and `siteUrl('web', …)` callers inside web switch to plain paths where they link within the site; admin links keep `siteUrl('admin', …)`.
- [ ] Targeted tests: `scripts/audit/single-app.test.ts` rule 6 and `legal-drafts.test.ts` → PASS.

### Task 2.5: Tooling scripts, Makefile, package scripts (agent E)

**Owns:** `scripts/{generate-favicons,generate-share-images,optimize-images}.mjs`, `scripts/db/reset-local.mjs`, `package.json`, `Makefile`, `.github/workflows/ci.yml`, `docs/RUNBOOK.md` is Task 4.2.

- [ ] `generate-favicons.mjs` apps `['web', 'admin']`; `generate-share-images.mjs` `['web']`; `optimize-images.mjs` `APP_PUBLIC_DIRS` web only (the manifest output is unchanged); `reset-local.mjs` `['web', 'admin']`.
- [ ] `package.json`: `db:migrate:local` applies to web and admin only; `dev:all` unchanged (filters `./apps/**`); no script names the three apps. `Makefile`: delete `dev|preview|deploy-{worship,academy,production}`, fix `preview-all`, `deploy-all` (web, admin), `verify-deployment`, help text, the `.PHONY` line; the web deploy target's comment says it serves the whole public site.
- [ ] `ci.yml` comment "build of all six apps" → "both apps".
- [ ] Verify with `node scripts/db/reset-local.mjs --help`-style dry check is not possible; instead run `pnpm exec tsx --test scripts/image-policy.test.mjs` and `make -n deploy-all preview-all verify-deployment` (prints, does not run) and grep that no removed app name remains in those files. No deploy command is ever executed.

### Task 2.6: Audit tests and e2e harness (agent F)

**Owns:** `scripts/audit/{legacy-redirects,private-routes,crawler-files,auth-surface,security,page-access,security-headers,forms-kit,legal-drafts}.test.ts`, `scripts/audit/{phase1-journeys-e2e,browser-e2e}.test.mjs`, `scripts/audit/workers.mjs`, `scripts/api/contract.test.ts`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`. **Not** `ui-boundaries.test.ts` or `frames.test.ts` (Task 3.1).

The exact inventory of tests that name the deleted apps and what changes:

| File | Change |
| --- | --- |
| `legacy-redirects.test.ts` | import the registry's `redirects()`; per-app cases become section-prefixed cases (`/worship/musician/x` → `/worship/apply`, 303 statuses kept, `/academy/register` 303, `/production/contact` 303 → `/production/request`); "nothing points at account pages" loops over the one rule list; keep web-level `/live/*` and `/legal/*` cases; no import of `apps/{worship,academy,production}` |
| `private-routes.test.ts` | one app (`web`): `PUBLIC_PAGES` lists the main site plus `/academy/...`, `/worship/...`, `/production/...` routes (walk `apps/web/src/pages`), middleware built from `registry.redirects()`; API allowlist unchanged (web only); every page file must still be listed |
| `crawler-files.test.ts` | one `robots.txt` (Disallow covers `/api/`, `/preview/`, `/academy/registrations`, `/academy/register`), sitemap index plus each child (same-origin, no duplicates, no retired or private paths: `RETIRED_ROOTS` checked under every section prefix), `llms.txt` links every section by path; per-section robots and llms 301s |
| `auth-surface.test.ts` | `APPS` becomes `['web']`; retired account URLs checked at `/account` and `/<id>/account`; no sign-in surface under any section |
| `security.test.ts` | the foreign-origin sample `https://academy.gamostudio.org` becomes `https://admin.gamostudio.org` (a sibling origin is still foreign); add a cross-origin POST test on `/academy/register/<lesson>` |
| `page-access.test.ts` | `isPrivatePage('web', '/academy/registrations/manage')` stays false (guard is not the mechanism; robots and noindex are) |
| `security-headers.test.ts` | `applicationPages('academy')` and `academy.example.test` become `'web'` and `gamostudio.org`-style URLs with `/academy/...` paths |
| `forms-kit.test.ts` | file-path assertions move to `apps/web/src/features/academy/components/registration/...` and `apps/web/src/pages/{worship,production}/{apply,request}.astro` |
| `legal-drafts.test.ts` | the footer-links loop reads the single `apps/web/src/site.config.ts` and the registry footer instead of four configs |
| `api-no-store.test.ts`, `cf-access.test.ts`, `email-domain.test.ts`, `admin-analytics-workspaces.test.ts` | no change (they mention `production` as an environment, `academy@gamostudio.org` as a sender address, or admin workspace names); re-read to confirm |
| `phase1-journeys-e2e.test.mjs`, `browser-e2e.test.mjs`, `workers.mjs` | `APPS` becomes web and admin; journey checks use section paths and the legacy table (`['worship', '/hire', …]` becomes `/worship/hire` → `/worship/request`); **`workers.mjs` builds `require` from `apps/web/package.json`** |
| `scripts/api/contract.test.ts` (line 67) | app loop becomes `['web', 'admin']` |
| `ui-boundaries.test.ts`, `frames.test.ts` | Task 3.1 (path-keyed baselines) |

- [ ] `playwright.config.ts`: `apps = [['web', 4321]]` plus admin (existing admin server on its fixed port); `E2E_APPS` accepts `web,admin`; the live-key scan runs for web only.
- [ ] `tests/e2e/smoke.spec.ts`, one origin, one test per sitemap so they parallelize: `site`, `academy`, `worship`, `production` (paths read from the sitemap index and its children), plus a test that every section in `PROGRAM_IDS` contributed at least one page and that the total is at least the fixture's old count. Per page keep: HTTP 200, one `<h1>`, no console or CSP errors, no broken images, valid JSON-LD (and exactly one `Organization` node, on `/`), cache header rule, **canonical equals `https://gamostudio.org` + path** (or the preview origin), no overflow at 360 px, axe serious/critical none. Link check keeps `maxRedirects: 0` and fails on 4xx and 5xx. Retired URLs per section redirect (302 or the table's status, `location` equals the table); crawler files are public and cacheable; unknown `/academy/nope` renders the branded 404 with one `<h1>`.
- [ ] Targeted run per file with `pnpm exec tsx --test <file>` (agents do not run Playwright). The lead runs the Playwright smoke once in Task 4.3.

---

## Phase 3: integrate (lead)

### Task 3.1: Merge waves, re-key ratchets, removal drill

- [ ] Merge worktrees in order A, B, C, D, E, F (conflicts are limited to `sections/registry.ts` and none are expected because Task 1.2 pre-registered all three sections).
- [ ] **Re-key the ratchets mechanically** (no count may rise): in `scripts/audit/ui-boundaries.test.ts` and `scripts/audit/frames.test.ts` rename path keys `apps/academy/src/components/` → `apps/web/src/features/academy/components/`, `apps/academy/src/pages/` → `apps/web/src/pages/academy/`, likewise production; sample strings such as `siteUrl('worship', '/x')` in the rule's own unit tests change to a still-forbidden pattern (`'worship'` program literal key). Run `UI_BOUNDARIES_DUMP=1 pnpm exec tsx --test scripts/audit/ui-boundaries.test.ts` and compare the dump with the renamed lists (identical numbers); same for `frames.test.ts`. The `packages/ui/.../legal/content/academy-*` allowlist entries are unchanged.
- [ ] `pnpm exec tsx --test scripts/audit/single-app.test.ts scripts/audit/section-boundaries.test.ts scripts/audit/sections.test.ts` → all PASS (the gate is green).
- [ ] **Removal drill** (once, then revert): on a scratch branch delete `features/production` and `pages/production` and remove its registry line; run `section-boundaries`, the rule 6 scan and `astro check` for web → no references remain, no type errors. Record the result in `docs/BUILD_LOG.md`, `git checkout` the deletion.
- [ ] `pnpm check:quick` and `pnpm typecheck:packages` → PASS. Commit.

---

## Phase 4: delete, document, verify

### Task 4.1: Delete the three apps and narrow the types

**Files:** delete `apps/{academy,worship,production}/` entirely (including their `wrangler.toml`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.dev.vars.example`; the three rule files are 9-line stubs, nothing to fold), `scripts/audit/capture-old-urls.ts`; edit `pnpm-lock.yaml` (regenerated), `packages/config/apps.ts`, `packages/ui/src/lib/sites.ts`, `packages/config/env-loader.ts` and `env-loader.test.ts` fixture names, `apps/admin/wrangler.toml`, `apps/web/wrangler.toml`.

- [ ] Failing test first: `packages/config/apps.test.ts` asserts `SUBDOMAINS`, `LOCAL_PORTS` and `LOCAL_INSPECTOR_PORTS` have exactly `web` and `admin`; `siteOrigin('web')` and `siteOrigin('admin')` work in all three modes; `PUBLIC_SITE_URL_*` variables other than WEB and ADMIN are not read; a repo-wide scan finds no `academy.gamostudio.org`, `worship.gamostudio.org`, `production.gamostudio.org` outside `sections/legacy-hosts.ts`, `docs/**`, `scripts/audit/fixtures/**` and the audit tests that assert them.
- [ ] Narrow `AppName` to `'web' | 'admin'` (ports 4321 and 4326, inspector 9321 and 9326); remove the three `PUBLIC_SITE_URL_*` lines from admin and web wrangler configs; `PUBLIC_ROOT_DOMAIN` handling for `workers.dev` previews keeps `gamo-web-preview`.
- [ ] `git rm -r apps/academy apps/worship apps/production`; `pnpm install --lockfile-only` (then `pnpm install --frozen-lockfile` once to confirm); check `git grep -nE "apps/(academy|worship|production)|apps-(academy|worship|production)|gamo-(academy|worship|production)"` is empty outside `docs/` history files.
- [ ] `pnpm typecheck:packages`, `pnpm exec tsx --test packages/config/apps.test.ts` → PASS. Commit.

### Task 4.2: Docs

**Files:** `docs/superpowers/specs/2026-11-16-single-public-app-design.md` (record the refinements from the survey: sitemaps per section, prefixed cookie path, two-hop note, no dual-host code), `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md` (sections 1, 3, 7, and a new "single public app owner actions" section holding Tasks 5.1 to 5.6), `docs/DEPLOYMENT.md`, `docs/BUILD_LOG.md`, `docs/SCREEN_INVENTORY.md`, `docs/FRONTEND_ARCHITECTURE.md` (shell section: one site config, manifests), `AGENTS.md` (hosts and ports, middleware order paragraph naming four public apps, test commands using `E2E_APPS=academy`, the "legacy-redirects per app" rule, one boundary-lint line), `README.md`, `ARCHITECTURE.md`, `DESIGN.md` (port and app mentions), `ROADMAP.md` if it lists apps.

- [ ] Update each file's app list, ports, make targets, `E2E_APPS` examples and Cloudflare owner steps. `docs/RUNBOOK.md` embeds the output of `cloudflareRedirectRules()` verbatim; a test (`single-app.test.ts` rule 5) fails if the RUNBOOK text drifts from the generator.
- [ ] `pnpm exec prettier --write` on touched markdown; `pnpm check:quick`. Commit.

### Task 4.3: Full verification (lead, once)

- [ ] `env -u CLAUDECODE -u AI_AGENT -u CLAUDE_CODE_ENTRYPOINT pnpm check` once, nothing else running → all green (typecheck of web and admin, lint with zero warnings, Prettier, unit and audit tests, `api:check`, build, journeys, Playwright smoke and academy registration spec, catalog).
- [ ] Browser evidence (real, from the running build, per AGENTS.md): screenshots of `/`, `/academy`, `/academy/lessons`, `/academy/register/<lesson>`, `/worship`, `/worship/apply`, `/production`, `/production/services`, at 1280 and 360 px, compared with the pre-move screenshots; store paths in `docs/BUILD_LOG.md`.
- [ ] Old versus new crawl against the local preview: for each fixture URL, request `legacyHostTarget(url)`'s path locally and expect 200 for `indexed` paths and the fixture's final location for retired ones; counts equal or higher than the baseline from Task 0.1.
- [ ] Worker size and startup: `pnpm --filter apps-web exec wrangler deploy --dry-run --env production --outdir /tmp/gamo-web-after` (compare "Total Upload" with the Task 0.1 baseline; limit 64 MiB uncompressed), then `pnpm --filter apps-web exec wrangler check startup` if available in the installed wrangler (startup limit 1 s). Record both numbers.
- [ ] Fresh whole-branch reviewer (opus) with this plan's Review Focus; one fix pass with RED to GREEN tests. Local commits only.

---

## Phase 5: owner steps (the owner performs these; the agent never deploys, edits DNS, rules or secrets)

### Task 5.1: Before deploying

- [ ] Confirm a Search Console **Domain property** for `gamostudio.org` exists (spec step 1).
- [ ] On the `gamo-web` Worker, set the secrets that only other workers had, **with the same values**: `CUSTOMER_LINK_SECRET` (from `gamo-academy`; if the original value is lost, generate a new one and accept that outstanding Academy manage links stop working, people then use "find my registration"), confirm `PII_HASH_SECRET` is the same value everywhere (RUNBOOK says it already is), `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` already on web; for preview add `STRIPE_SECRET_KEY` (test key) and `STRIPE_TEST_CHECKOUT=true`. Run `pnpm preflight web --env preview` then `--env production` (read-only).
- [ ] Turnstile: confirm the production widget's hostname list includes `gamostudio.org` (it does for web today) and the preview widget includes `gamo-web-preview.gamostudio.workers.dev`; the old subdomain hostnames can be removed from the widgets after Task 5.5.

### Task 5.2: Preview deploy and crawl

- [ ] `make preview-web`; open `/academy`, `/worship/apply`, `/production/services`, an Academy lesson registration (test mode), `sitemap.xml` and its children. Crawl the fixture's URL list against the preview origin (every indexed path is 200). Old preview Workers stay untouched.

### Task 5.3: Production deploy of the merged Worker

- [ ] `make deploy-web` (the owner runs it). Smoke the production URLs from Task 5.2. Do not touch the old Workers or DNS yet; the old subdomains keep working, so rollback is `wrangler rollback`.

### Task 5.4: Cloudflare Single Redirect rules (zone `gamostudio.org`: Rules, Redirect Rules, Create rule)

Create these six rules (Free allows 10). Hostnames must be proxied (orange cloud); Custom Domains on a Worker already are, and redirect rules run before the Worker, so the rules take effect while the old Workers still exist. Start every rule at **302**, verify, then switch to the final status. The exact strings are generated by `cloudflareRedirectRules()` and embedded in `docs/RUNBOOK.md`; for `academy` they are:

- **Rule `legacy-academy-get`** (301 after verification). When incoming requests match, *Custom filter expression*: `(http.host eq "academy.gamostudio.org" and http.request.method in {"GET" "HEAD"})`. Then, *URL redirect*, type *Dynamic*, expression: `wildcard_replace(http.request.full_uri, "http*://academy.gamostudio.org/*", "https://gamostudio.org/academy/${2}")`, status 302 first, then **301**. Preserve query string: not needed (the expression carries the full URI).
- **Rule `legacy-academy-other`** (308). When: `(http.host eq "academy.gamostudio.org" and not http.request.method in {"GET" "HEAD"})`. Then: the same dynamic expression, status 302 first, then **308** (keeps the method and body for any old form POST).
- The same pair for `worship` (`worship.gamostudio.org`, target `https://gamostudio.org/worship/${2}`) and `production` (`production.gamostudio.org`, target `https://gamostudio.org/production/${2}`).
- [ ] Verify with curl (expect the `Location` header to equal the target, query kept):
  `curl -sI "https://academy.gamostudio.org/lessons/<slug>?x=1"` → 302 (later 301), `https://gamostudio.org/academy/lessons/<slug>?x=1`
  `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' -X POST https://academy.gamostudio.org/registrations/find` → 302 (later 308)
  `curl -sI https://worship.gamostudio.org/` → `https://gamostudio.org/worship/`
  `curl -sI https://production.gamostudio.org/sitemap.xml` → `https://gamostudio.org/production/sitemap.xml`, then `curl -sI https://gamostudio.org/production/sitemap.xml` → 200 `application/xml`.
  Also open an old Academy manage email link and confirm it lands on `/academy/registrations/open?t=…`.
- [ ] After a clean day (or immediately if satisfied), edit each rule's status to 301 and 308. If the wildcard expression is rejected in the dashboard's validator, use the dashboard's *Wildcard pattern* rule type with request URL `http*://academy.gamostudio.org/*` and target `https://gamostudio.org/academy/${2}`, which is the same mapping (spec).

### Task 5.5: DNS and Worker deletion order (do not reorder)

1. Rules from Task 5.4 are live at 301 and 308 and verified.
2. For each old host (`academy`, `worship`, `production`): remove the **Custom Domain** from the old Worker (Workers & Pages, the Worker, Settings, Domains & Routes). Removing it may delete the DNS record.
3. Immediately ensure a **proxied placeholder record** exists in DNS for each host: type `AAAA`, name `academy` (and `worship`, `production`), content `100::`, proxy status Proxied (or `A` `192.0.2.1`, Proxied). Without a proxied record the redirect never fires. Keep these records for as long as the redirects stay (at least one year).
4. Re-run the curl checks of Task 5.4. If any fails: re-add the placeholder, or re-attach the custom domain to the old Worker (still deployed) as the rollback.
5. After a few days of clean logs, **delete** the Workers `gamo-academy`, `gamo-worship`, `gamo-production` and the previews `gamo-academy-preview`, `gamo-worship-preview`, `gamo-production-preview`. Only now remove the old hostnames from the Turnstile widgets.
6. Rollback at any point before step 5: disable the two rules per host, re-attach the custom domain to the old Worker; the merged Worker keeps serving `gamostudio.org`.

### Task 5.6: Search Console and monitoring

- [ ] Submit `https://gamostudio.org/sitemap.xml` (the index) in the Domain property. Change of Address does not apply to subdomain-to-path moves; the 301s do the work. Watch Search Console (Pages, Redirects, Crawl stats) and Workers logs for 4 to 8 weeks; keep the redirects at least a year. Record the dates in `docs/BUILD_LOG.md`.
- [ ] Fallback if two-hop retired URLs or rule limits ever matter: bind the old hostnames to `gamo-web` as custom domains and add a host-aware branch in the middleware using `legacyHostTarget()` (one hop for everything, no placeholder DNS). Not built unless needed.

---

## Parallelism and ownership summary

- **Sequential first (lead):** 0.1, then 1.1 to 1.6. Shared files (`eslint.config.js`, `page-middleware.ts`, `programs.ts`, `sites.ts`, `sections/*`, `BaseLayout`) are lead-only so Wave 2 agents never edit them.
- **Wave 2 (six parallel agents, six worktrees, disjoint files):** A Academy (`features/academy`, `pages/academy`, two domain services, one e2e spec), B Worship, C Production, D main-site pages and components, E tooling (`scripts/*.mjs`, `package.json`, `Makefile`, `ci.yml`), F audit tests and e2e harness (`scripts/audit/*` except the two ratchets, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`). Only A, B and C depend on the shell from Phase 1; D needs the registry; E and F need nothing from A to D except final paths, which the gate test defines.
- **Not parallel:** 3.1 (merge, ratchet re-key, removal drill), 4.1 (deletion and type narrowing break every other branch's typecheck), 4.3 (the single full check).
- Agents never run build, Playwright or `pnpm check`; the lead runs `pnpm check:quick` per wave and the full check once.

## Self-review checklist (lead, before Task 4.3)

- Spec coverage: sections and thin routes (2.1 to 2.3), manifests and registry generating nav, footer, sitemap, robots, redirects, JSON-LD (1.2, 1.3), `sectionPath()` (1.1) and the link replacement (2.x plus the static test 1.4), one site config (1.3), legacy redirect map and per-section prefixed rules (1.6, 2.x), merged env and wrangler (1.5), CSP and Turnstile verification (1.3 test, 5.1), Playwright reduced (2.6), audit-test inventory (2.6 table, 3.1), deletion of apps, workers, make targets, scripts and lockfile (2.5, 4.1), boundary lint (1.4), the five required test families (1.6 and 2.6 smoke), Cloudflare rules and deletion order (5.4, 5.5).
- Type consistency: `SectionManifest`, `sectionPath(id, path?)`, `sectionUrl(id, path?)`, `legacyHostTarget(url)`, `cloudflareRedirectRules()`, `registry.{sections, nav(), footerGroups(), sitemapIndex(), sectionSitemap(), robotsTxt(), llmsTxt(), redirects(), jsonLdFor()}` are named identically wherever they appear above.

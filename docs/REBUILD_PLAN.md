# Rebuild plan: everything except the marketing pages and the admin gate (2026-10-19)

The owner decided to rebuild the product side of Gamo Studios from scratch, as was done for the admin. **Kept:** the marketing pages of the five public apps (their look and content), and the new admin's Cloudflare Access gate and shell. **Rebuilt:** every app page that is not marketing (accounts, onboarding, dashboards, flows), every API route, the shared backend (`@gamo/domain`, `@gamo/auth` product sign-in, `@gamo/db` data model, `@gamo/integrations`, the API contracts), the demo-era UI in `@studio-gamo/ui`, the tests for all of that, and the rules and docs that describe how the apps work.

## Phase 1 — production inventory (read-only, done 2026-10-19)

Read-only `SELECT COUNT(*)` queries against D1 through the Cloudflare API. Nothing was written.

**Production (`gamo-db-production`), 17 migrations applied (0000–0017):**

| Data | Rows | What it is |
|---|---|---|
| users | 2 | the old admin's bootstrap superadmin and the "Gamo Live Listings" publisher account (roles `superadmin`, `staff_reviewer`) |
| admin_credentials / sessions | 1 / 17 (15 unexpired) | the old admin's password and its sessions |
| organizations / organizer_profiles / members | 1 / 1 / 1 | the Gamo Live Listings publisher (type `ministry`) |
| events | 20 | the imported Live catalog (2026-10-15): all `external_discovery`; 18 approved upcoming, 1 approved past, 2 drafts |
| event_performers / external_listing_revisions | 40 / 38 | performers and source revisions of that catalog |
| audit_logs | 40 | publisher provisioning and the catalog import/publish |
| everything else | 0 | no product accounts, persons, sign-up codes, provider profiles, participation requests, terms acceptances, customers, ticket tiers, orders, tickets, registrations, payments, emails |

**Preview (`gamo-db-preview`):** empty (0 users, 0 events), migrations only up to 0010.

**Conclusion:** production holds **no real user data**. The only content worth keeping is the 20-event Live catalog (its source data and import tooling are already in the repo: `docs/GAMO_LIVE_IMPORT_REPORT_2026-10-15.*`, `packages/domain/src/services/verified-catalog-2026-10-15.ts`, `scripts/live/editorial-cli.ts`). A fresh data model is safe.

**Also found:** public sign-up on gamostudio.org is broken in production today. The page's Content-Security-Policy blocks Clerk's script (`cdn.protect.clerk.com`) and an inline script, Clerk answers 400, and the form shows "We couldn't complete that step". No sign-up has ever completed in production (0 auth challenges, 0 product accounts).

Live workers today: `gamo-web`, `gamo-worship`, `gamo-academy`, `gamo-live`, `gamo-production`, `gamo-admin` (old admin, still live) and the five `*-preview` workers. There is no admin preview worker yet.

## Decisions (owner: "go with your recommendations", 2026-10-19)

1. **Fresh data model.** New schema designed per product; the Live catalog is re-imported from the repo's source data. Old migrations stay in git history; how the production database is replaced (new D1 database, or a reset of the existing one) is an owner-approved step at cutover, never automatic.
2. **Data-driven marketing pages** (Live `/`, `/events`, `/events/[id]`, `/artists`, `/venues`; web `/live`) keep a minimal read-only events query during the rebuild, so they keep showing the catalog.
3. **Marketing forms** (web contact/partners, Academy registration, Live RSVP/tickets) keep working where they work today and are replaced product by product.
4. **New admin** keeps its gate and shell; its queues are rebuilt on the new backend as each product lands.
5. **Public sign-in** is designed from scratch too (emailed codes vs Clerk, per product): the first design decision of the rebuild.
6. **Broken production sign-up:** open, owner to decide (quick CSP fix in the old code, or leave until the rebuild). No real users are affected yet.
7. **Order of products:** open, owner to decide after phase 2.

## Phases

1. ~~Production inventory~~ (done).
2. **Rules and docs reset.** A short new `AGENTS.md` with only true, permanent rules (mission and legal wording, owner process rules, security baselines, design system, single-admin Access); `README.md` and `ARCHITECTURE.md` rewritten to describe what exists; outdated docs deleted or archived (git keeps history); `GAMO_NONPROFIT_MODEL.md` (mission) and the legal texts kept.
3. **Removal**, in a few large commits: non-marketing pages, API routes, demo-era UI, domain services, old product auth, contracts, and their tests; marketing pages keep working per decisions 2–3.
4. **Rebuild product by product:** requirements → design → build → built-worker checks, like the admin.
5. **Production stays frozen** for the public apps until each rebuilt product is ready; nothing is deployed without the owner.

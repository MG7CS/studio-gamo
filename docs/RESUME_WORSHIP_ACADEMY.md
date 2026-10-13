# Worship and Academy interrupted-work recovery — 2026-10-12

The existing landing-page sections, photographic compositions, typed demo catalogs and Academy route work were preserved. No backend, payment, dispatch, identity provider or external integration was added.

## Completed work

- Worship: added missing `/hire/summary`, `/opportunities` and `/church/roster` destinations, with reusable OpportunityBoard, ChurchRoster and proposal-breakdown components. The board filters sample roles locally. Fair musician pay and an unapproved administrative allocation remain separate; no booking is created.
- Worship: repaired legacy `/apply/identity`, `/apply/logistics` and `/hire/success` routes with redirects to the current non-transactional previews. Removed old check-in UI assertions that attendance was recorded, a standby was dispatched or an email was sent. Check-in pages now illustrate states explicitly and have no POST controls.
- Worship: application/request demo forms validate required and malformed entries locally before navigating. No entered data is sent, persisted or carried to another route. A no-JavaScript link avoids sending form data.
- Academy: registration requires contact name/email and learner name/age. The local multi-step form checks visible controls before proceeding. Existing browsing, instrument pages, instructor profiles, lesson details, sponsored-program, church-hosting and student dashboard screens remain composed from reusable components.
- Data modules use narrow instrument-icon types without importing an Astro component into TypeScript data. Added normal Astro environment references. November sample worship schedules now match 2026 weekdays.

## Verification

- Installed tools inspected: Node v22.22.3, pnpm 11.6.0, Astro 7.3.8. Official Astro routing/component documentation consulted before edits.
- `pnpm --filter apps-worship exec tsc --noEmit` and Academy equivalent: pass.
- `pnpm --filter apps-worship build` and Academy equivalent: pass. Initial restricted Cloudflare log/socket attempts required the approved escalation; reruns completed successfully.
- `astro check` unavailable with installed TypeScript 7; Astro explicitly reports it unsupported. No dependency downgrade was made. Root lint script is a placeholder; no pre-existing app test scripts exist.
- Reproducible browser check: `node apps/worship/scripts/verify-frontends.mjs`, with local Worship `http://localhost:4322` and Academy `http://localhost:4323`. Optional `WORSHIP_URL` and `ACADEMY_URL` overrides.
- Browser skill was read; its required Node browser tool is not exposed in this session. Real installed Playwright was used as fallback. Screenshot-only styling hides the Astro development toolbar; product rendering is unchanged.
- Final browser result: **24 routes × 5 widths = 120 route/layout checks passed**, plus both landing pages at all five widths. All checked routes return 200 with one main h1 and no broken images; no horizontal overflow, page errors or console errors. Local required-field negative paths, valid navigation, role filter, registration completion, lesson empty-state and asynchronous reset all pass. Details in `docs/screenshots/2026-refresh/resume/worship-academy-checks.txt`.
- Desktop/mobile artifacts: `docs/screenshots/2026-refresh/resume/{worship,academy}-home-{1440,390}.png` and corresponding `hero` crops. Additional full-page screenshots at 1440 and 390 cover Worship summary/roster/opportunities and Academy piano/lesson/registration/dashboard.

## Concurrent-work preservation

An independent writer changed the Worship summary to a proposal-breakdown composition during this run. That work was preserved; the completion link was corrected to `/church/roster` to avoid returning to the summary through the legacy success redirect, and its sample Sunday date was corrected to November 1. The latest summary was rechecked at all five widths, both screenshot sizes refreshed, and its roster destination verified. The now-unused RequestSummary component created during recovery was removed. Root will run final consolidated builds against the settled working tree.

## Remaining boundaries

Visual acceptance belongs to the owner. All people, churches, lessons, services, amounts and status records remain explicitly fictional examples. No program launch, approved compensation tier, committed partner, scholarship availability or recognized tax-exempt status is claimed. Academy safeguarding, real registration, musician vetting, scheduling, accounts and any payments remain future functionality work. Older internal Worship admin prototypes and unused redirect-only check-in API stubs are preserved; they were not expanded or represented as production-ready.

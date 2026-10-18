# Gamo Studios — Multi-page frontend review

<!-- status-banner: 2026-10 foundation pass -->
> **Historical document** (design review snapshot). It is kept for the record and is not maintained; it may describe code, routes or decisions that no longer exist. Current reference: [DESIGN.md](../DESIGN.md), the browser smoke suite `tests/e2e/smoke.spec.ts`.

## Current deliverable

Recovered the interrupted Bright Cinematic Editorial public website phase on 2026-10-12. Asset processing/shared foundation, organization pages and all four public program applications have implemented frontend screens. No backend milestone or production launch is claimed. The organizational source of truth remains [GAMO_NONPROFIT_MODEL.md](GAMO_NONPROFIT_MODEL.md).

The approved homepage hero remains at `/`. The bright alternative is isolated at `/preview/hero-2026`; the founder has not accepted it as a replacement. All new pages are **UI ready, pending owner visual acceptance**. Program launch, sponsorship, safeguarding, formation and legal decisions remain pending.

## Local review URLs

| App | URL | Suggested review |
| --- | --- | --- |
| Organization | http://localhost:4321 | `/mission`, `/get-involved`, `/partners`, `/support`, `/contact`, `/preview/hero-2026` |
| Worship | http://localhost:4322 | Landing, `/apply`, `/hire/summary`, `/church/roster`, `/opportunities` |
| Academy | http://localhost:4323 | Landing, `/instruments`, `/lessons`, `/register`, `/dashboard` |
| Live | http://localhost:4324 | Landing, `/events`, `/promote/create`, `/organizer/dashboard`, `/organizer/scan` |
| Production | http://localhost:4325 | Landing, `/services`, `/assessment`, `/training`, `/consultation` |

These are local previews; the planned domains have not been deployed or changed. Keep the five app servers on ports 4321–4325 so `siteUrl()` sibling navigation works.

## Evidence and actual checks

- Organization: `node scripts/verify-public-ui.mjs` passed **60 route/viewport cases** (12 routes at 390/768/1024/1440/1920), image decode, no overflow, one main h1, 55 collected navigation destinations, console/page errors and eight interaction checks. Covered missing/invalid fields, local form review/reset with zero POST requests, mobile menu/Escape, FAQ and no-JavaScript disabled form.
- Worship/Academy: `node apps/worship/scripts/verify-frontends.mjs` passed **120 route/viewport cases** (24 routes at five widths), additional landing checks, image/overflow/error/navigation checks and local application/request/registration/filter negative paths. The final summary route was rechecked at five widths after concurrent edits. Detailed evidence: [RESUME_WORSHIP_ACADEMY.md](RESUME_WORSHIP_ACADEMY.md).
- Live: `node apps/live/scripts/verify-ui.mjs` passed **125 route/viewport cases** (25 routes at five widths), decoded images, local destinations and deterministic interactions: spotlight, filters/reset/empty, required and negative-price wizard checks, safe review text, tier continuity, zero/canceled-ticket blocking, simulated scan accepted/duplicate/invalid and outreach selection. Details: [RESUME_LIVE.md](RESUME_LIVE.md).
- Production: `node apps/production/scripts/verify-ui.mjs` passed **60 route/viewport cases** (12 rendered routes at five widths), legacy redirect, local required/invalid-email states, assessment review/Back, clean confirmation URL and no-JavaScript fallback. Details: [RESUME_PRODUCTION.md](RESUME_PRODUCTION.md).
- `pnpm run typecheck` passed across applications. `make test` passed four image-policy tests. `make images` successfully regenerated derivatives and supports configuration-aware caching. `git diff --check` passed.
- The full monorepo build passes with `pnpm run build`, which runs workspace builds sequentially. The earlier parallel build failed because multiple Cloudflare prerender workers selected the same inspector port; the root build/Makefile now avoid that collision.
- `pnpm run lint` is an unconfigured placeholder, **not** a lint pass. `astro check` rejects the installed TypeScript 7.0.2; Astro template diagnostics were unavailable. No dependencies were downgraded to mask this limitation.

Browser plugin instructions were read; the required in-app execution tool was unavailable. Evidence used the installed Playwright Chromium with authorized local process permissions. Initial sandbox browser/Cloudflare failures and failed assertions were corrected and rerun; they are not represented as successes.

## Real screenshots

Full-page desktop/mobile evidence and verification artifacts:

- `docs/screenshots/2026-refresh/web/`: all organization routes at 1440/390, including Mission, Partnerships, Get Involved and separate bright hero; `verification.json` records results.
- `docs/screenshots/2026-refresh/resume/`: Worship/Academy landings and heroes plus request summary, roster, opportunity board, piano, lesson, registration and dashboard; `worship-academy-checks.txt` records results.
- `docs/screenshots/2026-refresh/live-resume/`: Live homepage, event detail, builder, organizer, scanner, checkout and ticket at 1440/390; `apps/live/artifacts/verification.txt` records results.
- `docs/screenshots/2026-refresh/production-resume/`: every rendered Production route at 1440/390.
- `docs/screenshots/2026-refresh/sections/`: individual Mission programs/values, proposed hero and Production hero at 1440/390.

Captures come from running Astro UI. Images are decoded before full-page capture; only Astro's development toolbar is hidden. Screenshots are never production backgrounds. Earlier interrupted-run screenshots remain preserved in the evidence tree.

## Visual findings and corrections

Compared running desktop/mobile screens with the 2026 bright global/Academy/collage references, Live spotlight reference and original asset subjects. Shared pill navigation, Inter, cream/charcoal/terracotta, sculptural photography and differentiated program messaging remain coherent. Mission presents program panels/audiences/typographic values; Academy prioritizes instrument choice; Live is cinematic; Production balances technical diagrams and warm sections. No named partners, invented impact statistics or fictional verified status are used in the new public journeys.

Corrected an Academy electric-guitar card that showed an acoustic-guitar photograph; it now uses the established typographic instrument fallback. Repositioned the Academy mobile lesson preview beneath the main learner photo and shortened its label to preserve the playing hands. Removed the floating proposed-hero badge from the singer photo; review disclosure remains below the component. Corrected hidden/zero-height image evidence and retained visible content during scroll reveals. Small accent labels/links use the darker approved terracotta shade for contrast on cream; large headlines and button fills retain the primary brand color. Current screenshots still require founder aesthetic acceptance.

## Preserved work and remaining boundaries

Uncommitted work from the interruption was preserved. Another workspace writer changed Mission, Get Started, the bright hero, Worship summary and Live organizer/form components during this session. Incoming useful compositions were retained; a summary redirect loop and TypeScript imports were repaired. Alternate unreferenced compositions remain available on disk for comparison. Concurrent edits can invalidate evidence and must be rechecked after any further changes.

No accounts, real identity capture, vetting decisions, dispatch, event publishing, real ticket credentials, payments, donation checkout, provider emails or persistent application data were implemented. Admin expansion remains outside the public brief; only misleading published legal-document statuses were corrected to drafts pending counsel review. Final legal terms, nonprofit formation, safeguarding and operational policies require their existing owner/professional gates. Future integration plan: [FUNCTIONALITY_PHASE_PLAN.md](FUNCTIONALITY_PHASE_PLAN.md).

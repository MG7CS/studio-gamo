# Production frontend resume — 2026-10-12

<!-- status-banner: 2026-10 foundation pass -->
> **Historical document** (2026-10-12 work-resumption notes). It is kept for the record and is not maintained; it may describe code, routes or decisions that no longer exist. Current reference: [ARCHITECTURE.md](ARCHITECTURE.md), [CLEANUP_LOG.md](CLEANUP_LOG.md).

Resumed the interrupted component-first Production implementation without replacing its existing landing-page design or shared components. The program remains proposed and all forms remain local previews.

## Completed and preserved

- Landing page: sculptural engineer hero, technical ministry introduction, distinct audio/video/lighting sections, volunteer training, event planning, equipment guidance, honest project empty state and consultation invitation.
- Routes: `/`, `/services`, six `/services/<area>` detail pages, `/training`, `/assessment`, `/consultation`, `/consultation/confirmation`; legacy `/contact` redirects to `/consultation` (301).
- Assessment now validates church/city before advancing, renders a real local answer summary using safe `textContent`, preserves answers when moving Back, announces progress and focuses the new step heading. Nothing persists or transfers to the consultation page.
- Consultation validates name/email/church/area and navigates to the demonstration confirmation without putting contact information in the URL. JavaScript-disabled fallback cannot submit fields and offers a sample-confirmation link.
- Production data imports the shared TypeScript icon type, allowing TypeScript checks to resolve it.
- Reusable app check: `node apps/production/scripts/verify-ui.mjs`.

## Actual verification

- Node `v22.22.3`, pnpm `11.6.0`; inspected installed Astro CLI help before starting its supported background server.
- `pnpm --filter apps-production exec tsc --noEmit`: passed after shared exports were repaired by the coordinator.
- `pnpm --filter apps-production build`: passed with approved local port escalation. Initial sandbox build failed `listen EPERM 0.0.0.0:9229`; this was an environment restriction, not a successful build.
- `node apps/production/scripts/verify-ui.mjs`: passed 12 rendered routes × 390/768/1024/1440/1920 widths, plus the legacy redirect. Verified successful responses, one main h1, decoded visible images, no page overflow, no page errors/failed local responses, required and invalid-email paths, assessment summary/back, clean confirmation URL and no-JavaScript fallback.
- `git diff --check -- apps/production`: passed. Repository lint is a placeholder; no independent lint result is claimed.
- In-app browser skill was read. Its required Node REPL/browser tool was not available in the callable tools, so actual browser checks used installed Playwright Chromium after approved escalation.

## Browser evidence

Local URL: `http://127.0.0.1:4325/`.

24 full-page desktop/mobile screenshots: `docs/screenshots/2026-refresh/production-resume/`. Files use route names and `-1440.png` / `-390.png`; representative artifacts are `home-1440.png`, `home-390.png`, `assessment-390.png`, `consultation-390.png` and `services-audio-1440.png`.

Compared the Production hero/compositions with `design-reference/2026-brand-refresh/landing-page-concepts-grid.png` and inspected the original engineer photo. Cream surfaces, asymmetric type, curved photographic masks and restrained mixer/checklist previews match the direction while retaining Production-specific messaging. Actual mobile and desktop screenshots reviewed. Review is engineering evidence, not founder visual sign-off.

Screenshots scroll reveal sections into view before capture, use reduced motion and hide only Astro's developer toolbar. No screenshot backgrounds or synthetic screenshots are used.

## Asset inventory audit for coordinator

- Cache-listed brand refresh: 16 original photos, 33,056,992 source bytes (31.53 MiB), 1,820,614 bytes across one largest variant per photo (94.49% reduction).
- Zero missing cache-listed derivatives across the five public apps. Largest variants range 73,140–224,232 bytes (71.43–218.98 KiB), matching the inventory's approximate variant range.
- Inventory's `32.0 MB` source total should be clarified to exact bytes/MiB. Original filename mappings cannot be independently confirmed from renamed source files alone.
- Optimizer cache hashes image content but not quality/width configuration; future config changes need cache invalidation/signature changes to regenerate existing outputs.
- Catalog comments say missing optimized files fail the build, but implementation only checks manifest-stem presence. Actual served files require the browser/asset audit.
- Shared reveal animation originally made untouched below-fold full-page screenshots blank. Coordinator owns shared visibility behavior; the app check captures each section after real scrolling.

## Limits

No live consultation intake, training registration, completed-project claims, partner endorsements, payments, scheduling, external communication or backend implementation. No commit/push was performed by this delegated task. Founder visual review and future program/legal approvals remain outstanding.

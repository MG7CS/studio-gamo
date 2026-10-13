# Asset Inventory — 2026 Bright Brand Refresh

Source of truth for the photographs and design concepts delivered on 2026-10-12 into `assets/images/2026-brand-refresh/`.
Older (dark, Oct-12 10:50 AM) homepage photos remain documented in [`ASSET_MANIFEST.md`](ASSET_MANIFEST.md).

## Pipeline

- **Originals (kept intact, never served):** `assets/images/2026-brand-refresh/<category>/<name>.png`
- **Optimizer:** `make images` → `scripts/optimize-images.mjs` (Sharp). Brand-refresh pass emits AVIF (q55) + WebP (q80) at 480 / 800 / 1200 / 1600 px, plus the intrinsic width when smaller than 1600. Never upscales; metadata stripped; hash-cached in `.image-cache.json`.
- **Output:** `apps/{web,worship,academy,live,production}/public/images/optimized/<category>-<name>-<w>w.{avif,webp}` (synced copies so each Cloudflare app is self-contained).
- **Manifest:** `packages/ui/src/lib/image-manifest.json` (generated: stem, intrinsic size, widths).
- **Catalog:** `packages/ui/src/lib/images.ts` (hand-maintained: key → alt text, focal `object-position`, tone). Use via `<Photo name="…" sizes="…" />`; add `priority` only to a page's LCP image.
- **Verified result:** 16 originals, 33,056,992 bytes (31.53 MiB) PNG → 1,820,614 bytes across one largest variant per photo (94.49% aggregate reduction). Largest individual variants: 71.43–218.98 KiB (≈91–96% smaller).
- **Repeatability:** content hash plus encoder/width configuration signature; missing outputs regenerate even if the source is unchanged. Optimizer errors and `make images` propagate nonzero exit status. Responsive-width/no-upscale/invalid-input/cache-signature boundaries are tested by `make test`.

To add a photo: drop it in the right category folder with a descriptive kebab-case name, run `make images`, then add a catalog entry in `images.ts`.

## Photographs

| Catalog key | Original source file (as delivered) | Organized source | Size / orientation | Subject | Intended use |
|---|---|---|---|---|---|
| `worshipLeaderGolden` | ChatGPT Image Oct 12, 2026, 09_48_57 PM-1.png | worship/gospel-worship-leader-golden-light.png | 1122×1402 portrait | Female gospel worship leader singing, warm golden light | Proposed global hero, Worship hero, Mission |
| `boyGuitar` | ChatGPT Image Oct 12, 2026, 09_48_59 PM-2.png | academy/boy-learning-acoustic-guitar.png | 1122×1402 portrait | Boy learning acoustic guitar, sunlit room | Academy hero, global Academy card, Get Involved |
| `girlGuitar` | ChatGPT Image Oct 12, 2026, 09_49_00 PM-3.png | academy/girl-practicing-acoustic-guitar.png | 1122×1402 portrait | Girl practicing guitar with music stand | Academy hero/cards, Mission |
| `churchModernDay` | ChatGPT Image Oct 12, 2026, 09_49_01 PM-4.png | churches/modern-church-exterior-daylight.png | 1448×1086 landscape | Modern church exterior, daylight | Partners, Worship churches, Mission |
| `chapelSpring` | ChatGPT Image Oct 12, 2026, 09_49_02 PM-5.png | churches/white-chapel-steeple-spring.png | 1448×1086 landscape | White chapel with steeple, spring | Partners, Academy church-hosted, Support |
| `sanctuaryCongregation` | ChatGPT Image Oct 12, 2026, 09_49_03 PM-6.png | community/sunlit-sanctuary-congregation.png | 1448×1086 landscape | Congregation worshipping in sunlit sanctuary | Mission hero, Get Involved, Live worship gatherings |
| `concertCrowdWide` | ChatGPT Image Oct 12, 2026, 09_49_15 PM-1.png | live/worship-concert-crowd-wide.png | 1672×941 wide | Worship concert crowd beneath lit cross | Live hero spotlight |
| `acousticLeader` | ChatGPT Image Oct 12, 2026, 09_49_16 PM-2.png | worship/acoustic-worship-leader-stage.png | 1122×1402 portrait | Male worship leader with acoustic guitar | Worship musicians, Live events |
| `worshipNight` | ChatGPT Image Oct 12, 2026, 09_49_17 PM-3.png | live/worship-night-hands-raised.png | 1254×1254 square | Worship night audience, hands raised | Live cards, global Live card |
| `gospelVocalists` | ChatGPT Image Oct 12, 2026, 09_49_18 PM-4.png | live/gospel-vocalists-concert-stage.png | 1254×1254 square | Gospel vocalists leading a concert | Live gospel concerts |
| `worshipBand` | ChatGPT Image Oct 12, 2026, 09_49_19 PM-5.png | worship/worship-band-sanctuary.png | 1254×1254 square | Full worship team in bright sanctuary | Worship hero/teams, Production |
| `acousticLeaderAlt` | ChatGPT Image Oct 12, 2026, 09_49_20 PM-6.png | worship/acoustic-worship-leader-stage-alt.png | 1122×1402 portrait | Near-duplicate variant of `acousticLeader` | Spare; avoid placing beside its twin |
| `youngPianist` | ChatGPT Image Oct 12, 2026, 09_49_22 PM-7.png | academy/young-pianist-bright-classroom.png | 1122×1402 portrait | Young pianist in bright classroom | Academy piano, Mission |
| `churchGoldenHour` | ChatGPT Image Oct 12, 2026, 09_49_23 PM-8.png | churches/modern-church-exterior-golden-hour.png | 1122×1402 portrait | Contemporary church at golden hour | Partners, Support |
| `guitarMentor` | ChatGPT Image Oct 12, 2026, 09_49_24 PM-9.png | community/guitar-mentor-with-student.png | 1536×1024 landscape | Instructor mentoring young guitarist | Academy instructors, Get Involved (instructors), Production training |
| `soundEngineer` | ChatGPT Image Oct 12, 2026, 09_49_25 PM-10.png | production/sound-engineer-mixing-console.png | 1254×1254 square | Engineer at mixing console during worship | Production hero, global Production card |

## Design concepts (reference only — never embedded)

Moved to `design-reference/2026-brand-refresh/`. They contain UI, navigation and placeholder headlines; text inside them is illustrative unless separately approved.

| File | Original filename | Used as reference for |
|---|---|---|
| global-hero-bright-concept.png | GAMO Studios Worship Hero.png | Proposed global hero (`/preview/hero-2026`), Worship hero composition |
| landing-page-concepts-grid.png | GAMO Studios Worship Landing Page Concepts.png | Hero variants across programs |
| live-dark-event-spotlight-concept.png | Screenshot 2026-10-12 at 9.32.51 PM.png | Gamo Live dark spotlight hero |
| academy-bright-hero-concept.png | Screenshot 2026-10-12 at 9.33.13 PM.png | Gamo Academy hero |
| partners-collage-hero-concept.png | Screenshot 2026-10-12 at 9.33.33 PM.png | Partnerships / Get Involved collage |
| navigation-floating-pill.png | Screenshot 2026-10-12 at 9.34.11 PM.png | Shared light pill navigation |

## Gaps

- No photography yet for electric guitar, bass, drums or vocals lessons; Academy uses typographic/icon treatments for those cards instead of mismatched photos.
- No dedicated volunteer, lighting-rig, livestream-camera or Bible-study photography.
- All photos are AI-generated originals for Gamo Studios; review faces/hands at large sizes before any print use.

## Generated output map

Each pattern exists under every public apps public/images/optimized directory. Both AVIF and WebP are generated at every listed width; no source PNG is served.

| Organized source | Output filename pattern | Widths |
| --- | --- | --- |
| 2026-brand-refresh/academy/boy-learning-acoustic-guitar.png | academy-boy-learning-acoustic-guitar-{width}w.{avif,webp} | 480, 800, 1122 |
| 2026-brand-refresh/academy/girl-practicing-acoustic-guitar.png | academy-girl-practicing-acoustic-guitar-{width}w.{avif,webp} | 480, 800, 1122 |
| 2026-brand-refresh/academy/young-pianist-bright-classroom.png | academy-young-pianist-bright-classroom-{width}w.{avif,webp} | 480, 800, 1122 |
| 2026-brand-refresh/churches/modern-church-exterior-daylight.png | churches-modern-church-exterior-daylight-{width}w.{avif,webp} | 480, 800, 1200, 1448 |
| 2026-brand-refresh/churches/modern-church-exterior-golden-hour.png | churches-modern-church-exterior-golden-hour-{width}w.{avif,webp} | 480, 800, 1122 |
| 2026-brand-refresh/churches/white-chapel-steeple-spring.png | churches-white-chapel-steeple-spring-{width}w.{avif,webp} | 480, 800, 1200, 1448 |
| 2026-brand-refresh/community/guitar-mentor-with-student.png | community-guitar-mentor-with-student-{width}w.{avif,webp} | 480, 800, 1200, 1536 |
| 2026-brand-refresh/community/sunlit-sanctuary-congregation.png | community-sunlit-sanctuary-congregation-{width}w.{avif,webp} | 480, 800, 1200, 1448 |
| 2026-brand-refresh/live/gospel-vocalists-concert-stage.png | live-gospel-vocalists-concert-stage-{width}w.{avif,webp} | 480, 800, 1200, 1254 |
| 2026-brand-refresh/live/worship-concert-crowd-wide.png | live-worship-concert-crowd-wide-{width}w.{avif,webp} | 480, 800, 1200, 1600 |
| 2026-brand-refresh/live/worship-night-hands-raised.png | live-worship-night-hands-raised-{width}w.{avif,webp} | 480, 800, 1200, 1254 |
| 2026-brand-refresh/production/sound-engineer-mixing-console.png | production-sound-engineer-mixing-console-{width}w.{avif,webp} | 480, 800, 1200, 1254 |
| 2026-brand-refresh/worship/acoustic-worship-leader-stage-alt.png | worship-acoustic-worship-leader-stage-alt-{width}w.{avif,webp} | 480, 800, 1122 |
| 2026-brand-refresh/worship/acoustic-worship-leader-stage.png | worship-acoustic-worship-leader-stage-{width}w.{avif,webp} | 480, 800, 1122 |
| 2026-brand-refresh/worship/gospel-worship-leader-golden-light.png | worship-gospel-worship-leader-golden-light-{width}w.{avif,webp} | 480, 800, 1122 |
| 2026-brand-refresh/worship/worship-band-sanctuary.png | worship-worship-band-sanctuary-{width}w.{avif,webp} | 480, 800, 1200, 1254 |

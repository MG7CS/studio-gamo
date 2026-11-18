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

Since 2026-11-18 the photo set is free-licence photography (Unsplash and Pexels, no attribution needed). Source page, creator, licence and retrieval date of every photo are in [`ASSET_MANIFEST.md`](ASSET_MANIFEST.md) ("Free-licence photos"). Sources are JPEGs in `assets/images/2026-brand-refresh/<category>/`; the catalog key names the subject.

| Category | Catalog keys |
|---|---|
| `instruments` | `instrumentPianoKeyboard`, `instrumentAcousticGuitar`, `instrumentElectricGuitar`, `instrumentBassGuitar`, `instrumentDrums`, `instrumentVocals`, `instrumentViolin`, `instrumentCello`, `instrumentSaxophone`, `instrumentTrumpet`, `instrumentUkulele`, `instrumentMusicTheory` |
| `musicians` | `musicianWorshipLeader`, `musicianAcousticGuitarist`, `musicianElectricGuitarist`, `musicianKeysPlayer`, `musicianDrummer`, `musicianBassist`, `musicianChoir`, `musicianFullBand`, `musicianStrings`, `musicianBrass` |
| `tech` | `techAudio`, `techVideoCamera`, `techLighting`, `techLivestream`, `techStageSetup`, `techTraining`, `techSlides` |
| `software` | `softwareWebsite`, `softwareMobileApp`, `softwareTeam`, `softwareSupport` |
| `churches` | `churchModernDay`, `churchGoldenHour`, `chapelSpring`: the last AI-generated photos, kept until the owner supplies free-licence church-building photos (`DECISIONS.md`, 2026-11-18) |

The church email tile is an original illustration, `assets/illustrations/church-email.svg`, not a photo.

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

- No free-licence church-building photos yet (the three AI exteriors remain).
- No photo of a choir inside a church, a drummer inside a church, brass in a church setting, or a clean presentation-software operator.
- Some picks are portrait-only (`musicianWorshipLeader`, `musicianFullBand`, `instrumentPianoKeyboard` and most single-instrument photos), so they cannot fill wide or landscape frames; the frame ratio check enforces this at build time.
- The people pictured are not Gamo members or staff; photos are illustration only and are never captioned as if they were.

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

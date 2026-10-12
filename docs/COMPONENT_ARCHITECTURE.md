# Gamo Studios — Component ownership

## Three levels

- **`packages/ui/src/components/`**: shared, design-neutral building blocks reused across apps, such as `Button`, `Badge`, `Container`, `Logo`, and `ResponsivePicture`.
- **`apps/<app>/src/components/`**: app-specific UI and compositions. Do not move a component into the shared package solely because it is large.
- **`apps/<app>/src/pages/`**: route definitions and compositions, ideally importing smaller components rather than containing lengthy inline UI.

## Homepage structure

`apps/web/src/pages/index.astro` composes the hero, musicians, coverage, Academy, Live and final CTA components.

`apps/web/src/layouts/SiteLayout.astro` composes `SiteHeader`, the main landmark, and `SiteFooter`. Shared chrome is maintained in `apps/web/src/components/navigation/`, not copied onto individual pages.

## ResponsivePicture

`@studio-gamo/ui/components/ResponsivePicture.astro` displays **already optimized** AVIF/WebP files created by the repository image optimization workflow. It does not generate new images.

Example:

```astro
---
import ResponsivePicture from '@studio-gamo/ui/components/ResponsivePicture.astro';
---
<ResponsivePicture
  stem="church-rehearsal"
  widths={[480, 768, 1200]}
  sizes="(min-width: 768px) 50vw, 100vw"
  alt="Musicians rehearsing together"
  class="w-full h-full object-cover"
  loading="lazy"
/>
```

Only pass widths that exist in `/images/optimized/`: for example `church-rehearsal-480w.avif` and `church-rehearsal-480w.webp`. The component preserves author-supplied `sizes`, `alt`, `class`, `loading`, `decoding`, and optional `fetchpriority`. For the hero's LCP image use `loading="eager" fetchpriority="high"`, and normally lazy-load below-fold imagery.

The `stem` must be a safe lower-case filename stem with hyphens/numbers, matching the image script's generated filenames.

## Design preservation

Abstractions must preserve the approved editorial composition: image crops, art-directed curves, typography and floating interface cards remain section-owned. Avoid turning differentiated sections into identical generic grids.

## Verification before merge

1. Pull the PR into the local repository after saving uncommitted Antigravity work.
2. Run `make check && make lint && make build` (or the individual supported targets).
3. Inspect actual desktop and mobile screenshots and compare them against the pre-refactor screenshots.
4. Confirm that all optimized images load successfully and that header/footer appearance is unchanged.

**Review status:** This refactor was authored through the GitHub connector, which cannot run the local Astro build or browser checks; those remain required before merge.

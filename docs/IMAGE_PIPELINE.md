# Image Optimization Pipeline

To maintain premium cinematic photo quality while ensuring the website loads extremely fast, we process all original photography through a local `sharp`-based optimization pipeline.

## Directories

1. **Source**: Drop all original high-resolution photos into `assets/images/originals/`. Never commit raw >5MB PNGs to the `public/` directory directly.
2. **Output**: The pipeline automatically outputs optimized WebP and AVIF files into `apps/web/public/images/optimized/`.

## Usage

1. Add your new PNG/JPG/WebP files to `assets/images/originals/`.
2. Run `pnpm images:optimize` from the repository root.
3. To view storage savings without rebuilding, run `pnpm images:report`.

## How it works

The `scripts/optimize-images.mjs` script performs the following tasks:
- **Responsive Generation**: Creates responsive widths (480w, 768w, 1200w, 1600w, 1920w).
- **Format Conversion**: Generates both `.avif` (quality 60) and `.webp` (quality 85) to preserve fine instrument detail and skin textures without excessive banding.
- **Cache**: Uses `.image-cache.json` to skip already-processed images.
- **Orientation**: Applies EXIF-based rotation so mobile uploads don't appear sideways.

## Astro Integration

Always use the `<picture>` element with `srcset` to let the browser pick the best format and size. Do not use unoptimized images directly from `assets/`.

Example component usage (`Picture.astro` or inline):
```html
<picture>
  <source type="image/avif" srcset="/images/optimized/photo-1-768w.avif 768w, /images/optimized/photo-1-1200w.avif 1200w" sizes="(max-width: 768px) 100vw, 1200px" />
  <source type="image/webp" srcset="/images/optimized/photo-1-768w.webp 768w, /images/optimized/photo-1-1200w.webp 1200w" sizes="(max-width: 768px) 100vw, 1200px" />
  <img src="/images/optimized/photo-1-original.webp" alt="Worship moment" loading="lazy" width="1200" height="800" />
</picture>
```

- **Eager vs Lazy**: Use `loading="eager"` and `fetchpriority="high"` for the Hero (LCP) image. Use `loading="lazy"` for everything below the fold.

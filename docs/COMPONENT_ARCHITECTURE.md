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

## Public program component ownership (2026 refresh)

- Shared shell: `BaseLayout`, `SiteHeader`, `SiteFooter`, `ButtonLink`, `EditorialHeading`, `Photo`, `ProgramCard`, `ContentRail`, `AudienceSwitch`, `FaqAccordion`, `DemoNotice`, `FormField`, `StepIndicator` and `CtaInvitation` in `packages/ui`.
- Shared data utilities: `lib/sites.ts` supplies local/production sibling URLs; `lib/images.ts` supplies typed photo keys, descriptive alt text and focal points; `lib/icons.ts` supplies icon-name types. Package exports support both extensionless and explicit `.ts` library imports.
- Organization: `OrganizationHero`, `ParticipationPaths`, `PartnershipOpportunities`, `SupportPathways`, `ContactIntroduction`, `InquiryForm`, `AccountEntry`, `GetStartedRoutes` in `apps/web/src/components/organization`; Mission composes `WhyWeExist`, `FourPrograms`, `WhoWeServe`, `OurValues` from `components/mission`. OrganizationHero variants are specific to the hub. The proposed hero composes `HeroBrightSection` and `HeroProgramCards`; the approved `HeroSection` retains its layout. Alternate organization and hero compositions authored during concurrent recovery remain on disk for comparison; inspect each current route before creating more variants.
- Worship, Academy, Live and Production retain app-owned landing sections, typed demonstration catalogs and dedicated form/detail/dashboard components. Refer to each `src/components/` folder before creating new UI. Do not duplicate shared chrome.
- Inquiry forms only perform local validation. No-JavaScript fallback must prevent form submission; status copy must say preview, never imply a sent request. Sample wizard status pages may be directly navigable and are not evidence of real approval.
- Scroll-reveal content stays visible at all times; reduced-motion users receive no transition effects. Before full-page screenshots, decode lazy images and hide only the development toolbar.

## Verification workflow

1. Preserve existing work, inspect `git status`, and work directly on `main` for this founder-approved phase.
2. Run `make check`, `make test`, and `make build`. `make lint` currently reports an unconfigured placeholder and is not a lint pass. `astro check` currently rejects installed TypeScript 7; do not silently claim Astro template checks passed.
3. Inspect actual desktop and mobile screenshots and compare them against the pre-refactor screenshots.
4. Confirm that all optimized images load successfully and that header/footer appearance is unchanged.

**Review status:** Current local builds and actual browser evidence are recorded in [MULTIPAGE_DESIGN_REVIEW.md](MULTIPAGE_DESIGN_REVIEW.md). Founder visual acceptance remains pending.

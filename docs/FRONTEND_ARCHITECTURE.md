# Shared front-end architecture

The rules live in `AGENTS.md` → "Shared front-end architecture". This file records why, the sources, the
patterns to copy, and the current gaps. It supersedes `docs/COMPONENT_ARCHITECTURE.md`.

## Why

Polish has to land once and reach every app. Today each app rebuilds its own heroes, cards, containers and
step lists, and the shared header/footer/layouts hard-code the app list, so a fix to one hero fixes one page
and deleting an app leaves dead links in every other app. The rules invert that: shared pieces own the look
and the quality; apps own content and configuration.

## Sources (research 2026-11-16)

- One-way dependencies / boundary lint — ESLint `no-restricted-imports`: https://eslint.org/docs/latest/rules/no-restricted-imports
- Inversion of control for the shell — https://kentcdodds.com/blog/inversion-of-control
- Token tiers (base → semantic → component) — Primer token names https://primer.style/product/primitives/token-names/ ; Spectrum https://spectrum.adobe.com/page/design-tokens/
- Design Tokens format (W3C DTCG 2025.10, first stable) — https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/
- Core vs product tiers — Nathan Curtis https://eightshapes.com/articles/design-system-tiers/
- Recipes stay out of the core — Brad Frost https://bradfrost.com/blog/post/the-art-of-design-system-recipes/
- Slots and composition — Astro components https://docs.astro.build/en/basics/astro-components/
- Container queries, `@layer`, custom properties — MDN https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries , https://developer.mozilla.org/en-US/docs/Web/CSS/@layer
- Tailwind v4 `@theme` and `@source` — https://tailwindcss.com/docs/theme , https://tailwindcss.com/docs/detecting-classes-in-source-files
- Lint raw values — stylelint-declaration-strict-value https://www.npmjs.com/package/stylelint-declaration-strict-value ; Mozilla `no-base-design-tokens`
- Accessibility and visual regression per component — https://playwright.dev/docs/accessibility-testing , https://playwright.dev/docs/test-snapshots
- Islands / zero JS; Astro CSP is incompatible with `ClientRouter` — https://docs.astro.build/en/concepts/islands/
- Avoid premature abstraction — https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction ; https://bradfrost.com/blog/link/where-atomic-design-fell-short/
- Patterns and contribution — GOV.UK https://design-system.service.gov.uk/patterns/ ; Carbon tiers https://carbondesignsystem.com/all-about-carbon/what-is-carbon/

## Patterns

**App manifest into an app-agnostic shell**

```ts
// packages/ui/src/shell/types.ts
export interface NavItem { label: string; href: string; key?: string }
export interface ShellConfig {
  brand: { name: string; href: string };
  nav: NavItem[];
  cta?: NavItem;
  footer: { groups: { title: string; links: NavItem[] }[]; legal: NavItem[]; note?: string };
}
```

```astro
---
// apps/academy/src/layouts/Layout.astro
import BaseLayout from '@studio-gamo/ui/components/BaseLayout.astro';
import { shell } from '../site.config';
---
<BaseLayout shell={shell} {...Astro.props}><slot /></BaseLayout>
```

**Variants as data, theming by semantic tokens**

```css
@layer components {
  .btn { background: var(--btn-bg); color: var(--btn-fg); min-block-size: 44px; }
  .btn[data-variant='primary'] { --btn-bg: var(--color-action); --btn-fg: var(--color-on-action); }
}
[data-surface='dark'] { --color-surface: var(--ink); --color-text: var(--cream); }
```

**Components adapt to their container**

```css
@layer components {
  .card-host { container-type: inline-size; }
  @container (min-width: 32rem) { .media-card { grid-template-columns: 12rem 1fr; } }
}
```

## Gap list (audit 2026-11-16, ranked)

1. **Shell knows apps.** `SiteHeader` (calls `primaryNav()`), `SiteFooter` (hard-coded program links), `ProgramLayout` (`PROGRAM_NAMES`), `BaseLayout` default copy, `ErrorPage` contact link, `MarketingConsent` product keys, `sites.ts` `primaryNav`/`InquiryTopic`, `DashboardShell` admin routes, `scripts/optimize-images.mjs` app list, `packages/config/brand.ts` tagline. Fix: `ShellConfig` props + per-app `site.config.ts`.
2. **Missing primitives/patterns:** Container, Section (tones), PageHero, SplitHero, Card/LinkCard/MediaCard, Badge, NumberedSteps, FeatureGrid, FloatingPreviewCard, SelectField, Fieldset, ChoiceCard. Duplicates today: 5 landing heroes, 2 page intros, ~6 card types, 4 step lists, 6+ path grids, `FormComingSoon` copied in two apps.
3. **No semantic or size tokens:** `max-w-[1320px]` ×37 vs `max-w-7xl` ×20, `rounded-[28px]` ×21, `aspect-[4/5]` ×13, `text-[Npx]` (152 inside `packages/ui`).
4. **No enforcement:** no boundary lint, no raw-value lint, no catalog page, no visual regression.
5. **App content in shared code:** Academy legal documents in `packages/ui/.../legal/content`; one photo catalog copied to every app.
6. **Dead/misleading:** unused `ProgramCard`, `ContentRail`, root `FormField`; stale `docs/COMPONENT_ARCHITECTURE.md`.
7. **App global CSS:** page-ID focus overrides in `apps/web/src/app.css`, `.production-hero-title` in production.
8. **Admin palette copy:** 17 hex colours in `apps/admin/src/middleware.ts` inline page.

## Migration order

1. Boundary + raw-value audit tests (with a shrinking allowlist).
2. `ShellConfig` and per-app manifests; remove app knowledge from shared code.
3. Semantic and size tokens; replace arbitrary values.
4. Missing primitives/patterns, each with catalog entries; migrate duplicates app by app.
5. Catalog page with axe + screenshots as the shared-change gate.
6. Then the public UI/UX polish pass, fixing findings in shared pieces.

## Photo frames (decision 2026-11-16)

**Owner decision:** one calm frame language. Every photo is a rounded rectangle with one radius token and one of four fixed ratios, rendered only by the shared `Frame`; clusters only by the shared `PhotoGrid`. The organic masks (arch, leaf, pebble) are retired. Rule 14 in `AGENTS.md`.

**Research (2026-11-16) and what we took from it**
- Mature systems keep ratio sets small (Thumbprint five, Carbon four, others six to seven) and justify it as consistent proportions and easier development: https://thumbprint.design/guidelines/aspect-ratio. Ours is stricter (four) and has no exemption, so it is enforced in code.
- Nested radius: inner radius = outer radius − padding (clamped at 0); store one radius token and derive: https://cloudfour.com/thinks/the-math-behind-nesting-rounded-corners/. We avoid padded photos inside rounded cards; if unavoidable, `Frame` reads `--frame-radius`.
- Reserve space before load: width/height on `img` and `source` plus `aspect-ratio` on the frame, all `srcset` candidates in one ratio: https://web.dev/articles/optimize-cls.
- Focal point is catalog data mapped to `object-position`: https://developer.mozilla.org/en-US/docs/Web/CSS/object-position; validate which ratios a photo supports because one focal point cannot serve every ratio.
- Text on photos: captions outside the frame by default; overlays only through a scrim with known contrast (WCAG 1.4.3, 4.5:1 body / 3:1 large): https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html.
- Alt text required by type, decorative = `alt=""`: https://design-system.service.gov.uk/styles/images/, https://www.w3.org/WAI/tutorials/images/decision-tree/.
- LCP: one `priority` frame per page (`fetchpriority="high"`, eager), others lazy: https://web.dev/articles/fetch-priority.
- Safari clipping: rounded `overflow: hidden` fails with composited children; use `clip-path: inset(0 round R)` and no transforms on frames: https://bugs.webkit.org/show_bug.cgi?id=98538.
- Reveal motion: opacity fade only; under reduced motion show content directly.

**Tokens:** ratios `portrait` 4/5, `landscape` 3/2, `wide` 21/8, `square` 1/1; one radius `--radius-photo` (1.25rem); one `--photo-gap`; scrim `rgb(24 24 27 / .62–.72)` bottom gradient (about 4.7:1 for white text on a white pixel, to be verified on the real photos).

**`Frame` props:** `photo` (catalog id), `ratio` (required, four values), `alt` or `decorative`, `sizes` preset (`full` | `half` | `third` | `grid-tall`), `priority`, `caption`, `scrim`. No radius, fit, position, class-for-geometry or style props. `wide` falls back to `landscape` inside narrow containers (about 30rem).

**`PhotoGrid` layouts (2–4 photos, container-query collapse, apps pass ordered ids, never positions):** `pair`, `trio` (one tall), `quad` (mosaic), `hero-pair`. Five or more photos means two clusters in different sections.

## Clean style migration (2026-11-18)

The owner's clean layout rules (`DESIGN.md` §11) are permanent. Done (2026-11-18, home page approved by the owner): home page, `ButtonLink`, `SubmitButton`, `SiteHeader`, `CtaInvitation`, all eyebrow slots and props, pill controls, `LinkRows` for list pages, program hero widgets, and the guard test. Historical list of what carried the old pattern before: the `eyebrow` slot of `Section`, `PageHero`, `LinkCard` and `MediaCard`; `Badge` used as a card label; pill controls elsewhere (admin, program apps); identical card grids on other pages. Next: get sign-off on the home page, migrate the remaining shared components and the other pages, then add a ratcheting guard (eyebrow slots and pill radii) to `scripts/audit/ui-boundaries.test.ts`. Record the research and decision in `docs/DECISIONS.md` as each step lands.

## Header mega menu (2026-11-18)

`SiteHeader` renders a `NavMenu` for any nav item that has one: `MegaMenuPanel` (photo tiles left, text links and "all" link right) and `MenuTile` (a `Frame` at square, or a plain `<img>` for a static illustration, with the name under or beside it). The content is built in `packages/config/menus.ts` and attached by each app's `site.config.ts` with `withMenus(...)`; `packages/ui` names no program or photo. Behaviour (disclosure navigation, hover delays, mobile accordions) and the reasons are in `docs/DECISIONS.md`; the guards are `scripts/audit/mega-menu.test.ts` and `tests/e2e/mega-menu.spec.ts`. The `Frame` `tile` size preset serves these small squares.

## Shared defaults, no page-by-page flags (2026-11-19)

The layers are page, recipe, shared section, component, primitive, tokens. Pages only assemble. Five behaviours are
defaults of the shared layers and apply to every page of every app; no page sets a marker, flag or ratio for them.

| Behaviour | Where it lives |
| --- | --- |
| Headings in title case (small words lower case, first word capital, entities and words with inner capitals untouched) | `lib/title-case.ts` (`titleCase`, `titleCaseHtml`, `titleCaseHeadingsIn`) and `components/TitleCase.astro`; used by `Section`, `PageHero`, `SplitHero` (headings in its copy slot), `EditorialFeatureCard`, `CtaInvitation`, `EditorialHeading`, `MediaCard`, `LinkCard`, `LinkRows`, `NumberedSteps`, `FaqAccordion`, `ErrorPage`, legal and form section headings. No `text-transform` in the heading utilities. App heading markup outside these wraps its content in `<TitleCase>`. |
| Photo first when a photo and text stack (phone, iPad) | `SplitHero`, `EditorialFeatureCard`, `CtaInvitation`, `PageHero` (media slot). No prop. |
| Photo shape follows the photo (`ratio="auto"`) | `Frame` defaults to `auto`: `closestRatio(photo)` in `lib/images.ts` picks portrait, landscape or square, whichever crops least (always one the photo allows). `commonRatio(photos)` picks the one shape that crops a set least; `MediaCardGrid` uses it so a grid of cards always has equal shapes. A `ratio` or `photoRatio` prop is an override only. |
| No status badge or caption unless passed | `FloatingPreviewCard` has an empty `badge` slot; `Frame` and `EditorialFeatureCard` show a caption only when one is passed. |
| Narrow screens never overflow, at any zoom | `@layer base` in `tokens.css`: `min-width: 0` on grid and flex children, `overflow-wrap: anywhere` on headings and text, `max-width: 100%` on media, tables and `pre`, `text-size-adjust: 100%`; fluid heading sizes whose clamp minimum also shrinks with the viewport (`tokens.base.css`); `NumberedSteps`, `SplitHero`, `PageHero`, `EditorialFeatureCard`, cards and the header brand block shrink instead of overflowing. `xs` (24rem) and `2xs` (17rem) breakpoints exist for very narrow screens. |

An opt-out is added to a shared component only when a real page needs it, and is named for the exception, never for the default.

## Section bands (2026-11-19)

Neighbouring full-width sections are told apart by a pale background, automatically; a page sets nothing.

- **Marker.** Every page band carries `data-band` and `data-tone`: `Section`, `SplitHero`, `PageHero`, `EditorialFeatureCard` (the section, not its panel), `CtaInvitation`, `ProgramsShowcase` (row layout) and the app hero sections. A band on the default surface has `data-tone="default"`.
- **Rule.** `packages/ui/src/styles/bands.css` (imported by `tokens.css`, unlayered, pure CSS): in a run of neighbouring default bands the first stays on `--ui-surface` (cream), the second takes `--ui-surface-band`, the third goes back to cream, and so on (sibling combinators, eight deep). The hero is the first band and stays cream.
- **Token.** `--ui-surface-band` (Tailwind `bg-surface-band`) in `tokens.semantic.css`, with a value for each of the light, inset and dark wrappers: a pale sand, an even mix of cream and sand in light, so cards (ivory) still lift off it. Text on it passes AA (ink 15.3:1, muted 6.6:1, terracotta 4.5:1, deep terracotta 6.5:1).
- **Opt out.** An explicit tone (`raised`, `inset`, `dark`) keeps its own surface and ends the run, so the next default band starts on cream again. Use it only for a deliberate panel or emphasis, never to alternate by hand. A `Section` with `spacing="none"` is the body of the band above (a form or list under the hero): it gets `data-tone="continues"`, keeps that surface and the next band takes the pale one.
- **One dark band.** A dark band is deliberate emphasis: at most one in a page body and never directly above the footer (which is dark). Rounded panels inside a band (`EditorialFeatureCard`) keep their own tone, so they read against cream or the pale band.

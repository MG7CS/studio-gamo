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

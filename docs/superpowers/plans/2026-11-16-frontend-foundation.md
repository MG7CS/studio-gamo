# Front-end foundation plan

> Executed with superpowers:executing-plans and parallel agents (disjoint files, no broad suites in agents). TDD: audit test or catalog check first, watch it fail, then code. Commit messages: one short sentence.

**Goal:** make `packages/ui` the only place UI polish happens: app-neutral shell fed by app manifests, semantic and size tokens, the missing primitives and patterns, a catalog page as the regression gate, and guard tests — then migrate app duplicates onto it.

**Spec:** `AGENTS.md` → "Shared front-end architecture"; `docs/FRONTEND_ARCHITECTURE.md` (gap list, migration order); findings in `docs/UI_UX_AUDIT_2026-11-16.md`.

## Global constraints
- Program order Academy → Worship → Production wherever programs are listed or featured.
- Existing visual language stays (Inter, terracotta/ink/cream/sand, photography, masks); this is structure, not a redesign.
- No inline scripts; zero JS by default; ≥ 44 × 44 px targets; axe WCAG 2.2 AA; no overflow at 360 px; one `<h1>`.
- Pages stay on-demand; no new dependencies.

## Tasks

### F1 Guard tests (`scripts/audit/ui-boundaries.test.ts`)
- `packages/**` never imports from `apps/**`.
- `packages/ui/src/components/**` contains no app/program literals (`'worship'|'academy'|'production'|'admin'` as keys, `Gamo Worship|Gamo Academy|Gamo Production` copy) except an explicit allowlist that later tasks shrink to zero.
- `apps/*/src/**/*.astro|.ts|.css`: no hex/rgb colours, no arbitrary Tailwind values (`-[`), no `style=` except data-driven geometry, no `text-[Npx]` — current offenders recorded as a per-file count baseline that may only go down.

### F2 Tokens (`packages/ui/src/styles/`)
- Split into `tokens.base.css` (palette, scale) and `tokens.semantic.css` (roles) imported by `tokens.css`; keep existing utility names working (deprecated aliases marked).
- Semantic colours: `surface`, `surface-raised`, `surface-inset`, `surface-inverse`, `text`, `text-muted`, `text-inverse`, `action`, `action-strong`, `on-action`, `border`, `focus`, `danger`, `success`, `scrim`.
- Sizes as `@theme` utilities: containers `page` (82.5rem = 1320px), `prose` (42rem), `narrow` (56rem); radii `card` (28px), `panel` (2rem), `hero` (2.5rem), `pill`; aspect `portrait` (4/5), `landscape` (3/2), `wide` (21/8); small type steps `text-xs-13`… replacing `text-[12px]–[15px]` with named steps `caption` (12px), `small` (14px), `body-sm` (15px); tracking `eyebrow` (0.16em).
- `data-surface="dark|inset"` and `data-program` wrappers switch semantic tokens.

### F3 App-neutral shell
- `packages/ui/src/shell/types.ts`: `ShellConfig { brand: { name; programLabel?; href }; nav: NavItem[]; cta?: NavItem; footer: { description; groups: { title; links: NavItem[] }[]; legal: NavItem[]; social?: NavItem[] }; contactHref }`.
- `BaseLayout`, `SiteHeader`, `SiteFooter`, `ErrorPage`, `ProgramLayout` (program label string) take `shell`; `sites.primaryNav`/`InquiryTopic` program literals removed; `MarketingConsent` takes its wording as props; `DashboardShell` takes route paths as props.
- Each public app gets `src/site.config.ts`; a shared `packages/config/programs.ts` holds the ordered program list (Academy, Worship, Production) with IDs only, used by app manifests.
- Footer copy without events; nav order from config.

### F4 Primitives and patterns (`packages/ui/src/components/`)
`Container`, `Section` (tone, width, slots: eyebrow/title/actions), `Badge` (tone), `Card`/`LinkCard` (stretched link, heading level prop), `MediaCard` (scrim, on-media text), `PageHero` (breadcrumb, media slot), `SplitHero`, `FeatureGrid` (auto-fit, container queries, no orphan cell), `NumberedSteps`, `FloatingPreviewCard`, forms `SelectField`, `Fieldset`, `Checkbox` (44 px hit area), `ChoiceCard`, shared `FormComingSoon`. Remove unused `ProgramCard`, `ContentRail`, root `FormField`.

### F5 Catalog page
`apps/web/src/pages/preview/catalog.astro` (noindex; `/preview/` already disallowed) renders every primitive and pattern in every variant with labelled sample content. `tests/e2e/catalog.spec.ts`: axe clean, no overflow at 360 px and 1280 px, `toHaveScreenshot` baselines.

### F6 Migrate apps
Per app (parallel): replace hand-built heroes, cards, containers, badges, step lists, grids, selects/checkboxes and raw values with F2/F4 pieces; app layouts pass `site.config.ts`; delete duplicated components (e.g. `FormComingSoon` copies). Guard baseline shrinks; Academy first in any program list.

### Then
Apply `docs/UI_UX_AUDIT_2026-11-16.md` findings through these pieces, copy pass (Academy first), re-audit at 360 px and desktop.

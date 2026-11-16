# Shared components (`@studio-gamo/ui/components/*`)

Rules: `AGENTS.md` → "Shared front-end architecture"; rationale: `docs/FRONTEND_ARCHITECTURE.md`.
Import by path, e.g. `import Section from '@studio-gamo/ui/components/layout/Section.astro';`.

All pieces below are zero-JS, use semantic tokens only (`bg-surface`, `text-fg`, `text-fg-muted`,
`bg-action`, `border-border`, `bg-scrim`, `max-w-page`, `rounded-card` …), switch colour roles with
`data-surface`, expose their variant as a `data-*` attribute and adapt to their container, not the
viewport. Every component also takes `class`. Heading levels are props; only `PageHero` (or a
landing page's `SplitHero` copy) renders the page's `<h1>`.

## Layout primitives (`layout/`)

| Component   | Props                                                                                            | Slots                                                    |
| ----------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `Container` | `width` page \| narrow \| prose, `gutter` (true), `as`                                           | default                                                  |
| `Section`   | `tone` default \| raised \| inset \| dark, `width`, `spacing` default \| tight \| none, `align` start \| center, `title`, `titleAs` h2 \| h3, `id` | `eyebrow`, `title`, `intro`, `actions`, default |
| `Stack`     | `gap` xs–xl, `align` stretch \| start \| center, `as`                                            | default                                                  |

`Section` renders `<section aria-labelledby>` when it has a title, otherwise a `<div>`.

## Content primitives and patterns (`content/`)

| Component             | Props                                                                                                         | Slots                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Badge`               | `tone` neutral \| accent \| proposal \| sample \| success \| danger, `size` sm \| md                           | default (`sample` → "Sample", `proposal` → "Proposal")     |
| `Card`                | `tone` raised \| inset \| dark \| outline, `padding` none–lg, `as` div \| article \| li \| section \| aside   | default                                                    |
| `LinkCard`            | `href`, `title`, `headingLevel` h2–h4, `tone`, `padding`, `as`, `external`                                    | `eyebrow`, `title`, `body` (or default), `meta`            |
| `MediaCard`           | `image` (Photo props), `title`, `headingLevel`, `href`, `variant` adaptive \| overlay, `tone`, `as`           | `on-media`, `eyebrow`, `title`, default, `meta`            |
| `PageHero`            | `title`, `eyebrow`, `breadcrumbs` {label, href?}[], `tone` default \| inset \| dark, `width`, `align`         | `eyebrow`, `title`, `intro`, `actions`, `media`            |
| `SplitHero`           | `mediaSide` start \| end, `tone`, `width`, `spacing` hero \| section \| none, `as`                            | default (copy), `media`                                    |
| `FeatureGrid`         | `min` sm \| md \| lg, `max` 2 \| 3 \| 4, `lastRow` stretch \| center, `gap` md \| lg, `as` div \| ul \| ol    | default (items)                                            |
| `NumberedSteps`       | `items` {title, body?}[], `headingLevel` h3 \| h4, `tone` plain \| raised \| inset, `start`                   | none                                                       |
| `FloatingPreviewCard` | `title`, `tone` light \| dark, `as` div \| aside \| figure                                                    | `title`, `badge` (defaults to a Sample badge), default     |

Behaviour notes:

- `LinkCard` / `MediaCard` with `href`: the title link is stretched over the card (one link, whole
  card is the target, focus ring drawn around the card). Put no other links or buttons inside.
- `MediaCard` never puts text on a bare photo: `adaptive` keeps text on the card surface (photo
  beside the text from a 36rem container), `overlay` puts text in a scrim band with dark roles.
- `FeatureGrid` items share a row height; a short last row stretches or centres, never leaving an
  empty cell. Columns step up by the grid's own width.
- `NumberedSteps` is an `<ol>`; numbers are aligned, steps are top-aligned in one row from a 48rem
  container and stacked below that.
- Label fictional content with `<Badge tone="sample" />` and unapproved fees or tiers with
  `<Badge tone="proposal" />`.

## Existing components (root)

`ButtonLink`, `EditorialHeading`, `Photo`, `ResponsivePicture`, `Icon`, `StatusPill`, `StepIndicator`,
`EditorialFeatureCard`, `CtaInvitation`, `FaqAccordion`, `AudienceSwitch`; shell (`BaseLayout`,
`ProgramLayout`, `SiteHeader`, `SiteFooter`, `ErrorPage`, `Logo`); `forms/`, `dashboard/`, `legal/`.

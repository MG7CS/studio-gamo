# Shared components (`@studio-gamo/ui/components/*`)

Rules: `AGENTS.md` → "Shared front-end architecture"; rationale: `docs/FRONTEND_ARCHITECTURE.md`.
Import by path, e.g. `import Section from '@studio-gamo/ui/components/layout/Section.astro';`.

All pieces below are zero-JS, use semantic tokens only (`bg-surface`, `text-fg`, `text-fg-muted`,
`bg-action`, `border-border`, `bg-scrim`, `max-w-page`, `rounded-card` …), switch colour roles with
`data-surface`, expose their variant as a `data-*` attribute and adapt to their container, not the
viewport. Every component also takes `class`. Heading levels are props; only `PageHero` (or a
landing page's `SplitHero` copy) renders the page's `<h1>`; a second `PageHero` or `FormComingSoon` on
the same page takes `titleAs="h2"`.

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
| `Badge`               | `tone` neutral \| accent \| proposal \| sample \| success \| danger, `size` sm \| md, `wrap` (false)          | default (`sample` → "Sample", `proposal` → "Proposal")     |
| `Card`                | `tone` raised \| inset \| dark \| outline, `padding` none–lg, `as` div \| article \| li \| section \| aside   | default                                                    |
| `LinkCard`            | `href`, `title`, `headingLevel` h2–h4, `tone`, `padding`, `as`, `external`                                    | `eyebrow`, `title`, `body` (or default), `meta`            |
| `MediaCard`           | `image` (Photo props), `title`, `headingLevel`, `href`, `variant` adaptive \| overlay, `tone`, `as`           | `on-media`, `eyebrow`, `title`, default, `meta`            |
| `PageHero`            | `title`, `titleAs` h1 \| h2 (h1), `eyebrow`, `breadcrumbs` {label, href?}[], `tone` default \| inset \| dark, `width`, `align` | `eyebrow`, `title`, `intro`, `actions`, `media` |
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
  container and stacked below that. Up to 4 steps share a row; more wrap in rows of 3 (4 when the count
  divides by 4) and a short last row is centred (5 → 3 + 2, 6 → 3 + 3), never leaving an empty cell.
- `Badge` stays on one line and truncates unless `wrap` is set. Its default text ("Sample",
  "Proposal") only shows with no children: `<Badge tone="sample">{undefined}</Badge>` renders an empty
  badge, so omit the children when there is no text.
- Label fictional content with `<Badge tone="sample" />` and unapproved fees or tiers with
  `<Badge tone="proposal" />`.

## Forms (`forms/`)

Field primitives share one look from `forms/field.ts` (`CONTROL_CLASS`) and `FieldShell`/`FieldError`:
`text-fg` on `bg-surface-raised`, `border-fg-muted`, `rounded-xl`, `text-body-sm` labels, and one error
colour (`text-danger` / `border-danger`). `TextField` (and `EmailField`, `ConfirmEmailField`) is built
on `FieldShell`.

- `TermsConsent` (`documents`, `id`, `name`, `error`, `newTab`, `required` true) and `MarketingConsent`
  (`label`, `hint`, `id`, `name`): the whole row is the `<label>` (≥ 44 px), never pre-ticked; field names
  and the hidden `terms_slug` / `terms_version` pairs are unchanged. A required `TermsConsent` shows the
  required marker. Pass `required={false}` when the server decides (e.g. guardian consent).
- `ScaleField` with `error` marks every point with a danger border as well as the message.
- `FormComingSoon` takes `titleAs` h1 \| h2 (default h1).

## Root components

- `StatusPill`: `kind`, `tone`, `size` and exactly one of `label` (visible text) or `ariaLabel`
  (screen-reader text) — required by its TypeScript props, so it is never icon-only. No slot.
- `ButtonLink`: `variant` primary \| secondary \| ghost-dark \| light; `ghost-dark` and `light` are for
  dark bands and set `data-surface="dark"` on the link.
- `EditorialHeading`, `FaqAccordion`: `tone` light \| dark (dark sets `data-surface="dark"`).
- `EditorialFeatureCard`: `tone` inset (default) \| raised \| dark; `sand` → inset and `ivory` → raised are
  deprecated aliases.
- `BaseLayout`: `noindex` outputs `<meta name="robots" content="noindex, nofollow">` and drops
  canonical and social tags.
- Semantic colour role `accent` (`text-accent`): editorial eyebrows and accent lines (terracotta on light,
  terracotta-deep on inset, tan on dark).

## Existing components (root)

`ButtonLink`, `EditorialHeading`, `Photo`, `ResponsivePicture`, `Icon`, `StatusPill`, `StepIndicator`,
`EditorialFeatureCard`, `CtaInvitation`, `FaqAccordion`, `AudienceSwitch`; shell (`BaseLayout`,
`ProgramLayout`, `SiteHeader`, `SiteFooter`, `ErrorPage`, `Logo`); `forms/`, `dashboard/`, `legal/`.

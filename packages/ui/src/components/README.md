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
| `MediaCard`           | `image` {name, alt?, ratio?, sizes?, priority?} (shown in a `Frame`), `title`, `headingLevel`, `href`, `variant` adaptive \| overlay, `tone`, `as`           | `on-media`, `eyebrow`, `title`, default, `meta`            |
| `PageHero`            | `title`, `titleAs` h1 \| h2 (h1), `eyebrow`, `breadcrumbs` {label, href?}[], `tone` default \| inset \| dark, `width`, `align` | `eyebrow`, `title`, `intro`, `actions`, `media` |
| `SplitHero`           | `mediaSide` start \| end, `tone`, `width`, `spacing` hero \| section \| none, `as`                            | default (copy), `media`                                    |
| `FeatureGrid`         | `min` sm \| md \| lg, `max` 2 \| 3 \| 4, `lastRow` stretch \| center, `gap` md \| lg, `as` div \| ul \| ol    | default (items)                                            |
| `NumberedSteps`       | `items` {title, body?}[], `headingLevel` h3 \| h4, `tone` plain \| raised \| inset, `start`                   | none                                                       |
| `FloatingPreviewCard` | `title`, `tone` light \| dark, `as` div \| aside \| figure                                                    | `title`, `badge` (empty by default), default               |

Behaviour notes:

- `LinkCard` / `MediaCard` with `href`: the title link is stretched over the card (one link, whole
  card is the target, focus ring drawn around the card). Put no other links or buttons inside.
- `MediaCard` shows its photo in a `Frame` (never its own radius, mask or hover transform): `adaptive` is a
  padded card with text on the card surface (photo above, beside the text from a 36rem container; landscape
  ratio, concentric corners), `overlay` is the photo itself (portrait ratio) with the text on the Frame's
  bottom scrim in dark roles; with `href` the whole overlay card is wrapped in one link. `on-media` content
  is the first item of the text. A photo that cannot take the ratio fails the build (`image.ratio`).
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

## Photo frames (`media/`)

AGENTS.md rule 14; decision in `docs/DECISIONS.md` and `docs/FRONTEND_ARCHITECTURE.md` ("Photo frames").
Photos are shown only through `Frame` (one) or `PhotoGrid` (two to four). No class or style props, so an
app cannot set a radius, mask, aspect or crop; the catalog gives each photo's focal point and allowed ratios.

| Component   | Props                                                                                                                                  | Slots                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `Frame`     | `photo` (catalog id), `ratio` auto (default) \| portrait \| landscape \| wide \| square, `alt` OR `decorative: true`, `sizes` full \| half \| third \| tile \| grid-tall, `priority`, `caption`, `scrim` none \| bottom | default (overlay text, needs `scrim="bottom"`) |
| `PhotoGrid` | `layout` pair (2) \| trio (3) \| quad (4) \| hero (2), `photos` ordered `{ photo, alt \| decorative, caption?, priority? }[]`            | none                                    |

- `<Frame photo="guitarMentor" ratio="landscape" sizes="half" alt="Guitar instructor with a student" />`;
  `<PhotoGrid layout="trio" photos={[{ photo: 'worshipBand', alt: '…', priority: true }, { photo: 'boyGuitar', alt: '…' }, { photo: 'girlGuitar', decorative: true }]} />`.
- Ratios 4/5, 3/2, 21/8, 1/1; one radius `--radius-photo`; `wide` becomes landscape under 30rem. The build throws when
  a photo cannot be cropped to a ratio (see `ratios` on the catalog entry) or a grid gets the wrong count.
- `priority` on at most one frame per page (the likely LCP image). `caption` renders below the photo.
- Extra attributes (`data-reveal`, `id`, `aria-*`) go to the wrapper. Reveal on a frame is a fade only.
- A Frame is a size container: give it a width (block, grid or flex track). Inside a padded `Card` it takes the
  nested radius automatically. For a linked photo put the link outside: `<a href class="frame-link"><Frame … /></a>`
  so the focus ring is never clipped. Do not put focusable content near the edge of the scrim slot.
- `fill` on `Frame` is internal to `PhotoGrid`; apps must not pass it. `Photo` / `ResponsivePicture` are
  low-level pieces; shared components and pages use `Frame`.

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
  deprecated aliases. The photo is a `Frame` inset in the panel: `photo`, `photoAlt` (omit = catalog
  description, `''` = decorative), `photoRatio` override (default: auto), `caption` (below the photo, only when passed).
- `CtaInvitation`: `photo` and `photoAlt` (same convention), shown as an auto-shaped `Frame`; `photoRatio` overrides.
- `BaseLayout`: `noindex` outputs `<meta name="robots" content="noindex, nofollow">` and drops
  canonical and social tags.
- Semantic colour role `accent` (`text-accent`): editorial eyebrows and accent lines (terracotta on light,
  terracotta-deep on inset, tan on dark).

## Existing components (root)

`ButtonLink`, `EditorialHeading`, `Photo`, `ResponsivePicture`, `Icon`, `StatusPill`,
`EditorialFeatureCard`, `CtaInvitation`, `FaqAccordion`, `AudienceSwitch`; shell (`BaseLayout`,
`ProgramLayout`, `SiteHeader`, `SiteFooter`, `ErrorPage`, `Logo`); `forms/`, `dashboard/`, `legal/`.

## Clean style (owner, 2026-11-18; `DESIGN.md` §11)

There is no `eyebrow` slot or prop any more and the guard test fails if one returns. Do not use a `Badge` as a card label or a pill-shaped control: `ButtonLink`, `SubmitButton`, `SiteHeader`, chips and admin controls are `rounded-button`. For a list of links use `LinkRows` (flat rows, one title, one line, an arrow) instead of a grid of identical cards. Keep `Badge` only for labels the copy rules require (Sample, Proposal, Sponsored). For a photo-led card use `MediaCard variant="overlay"` (the whole card is the photo, the title sits on the scrim); a photo can only be used in the ratios the catalog lists for it.

## Header menu (`SiteHeader`, `MegaMenuPanel`, `MenuTile`)

- `SiteHeader` shows an image-led panel for each `ShellConfig.nav` item that has a `menu` (`NavMenu`: `tiles`, `links`, `all`); items without one stay plain links. Disclosure navigation, not `role="menu"`: no `aria-haspopup` on purpose. Chevron buttons and the open/close script are progressive enhancement; panels are `hidden` until opened so their images are not fetched.
- `MegaMenuPanel`: `menu` (a `NavMenu`). The grid of tiles plus the text links and the "all" link; the header owns the panel element.
- `MenuTile`: `tile` (`NavTile`: `label`, `href`, exactly one of `photo` catalog key or `src` static image), `variant` panel (default) \| row (48 px thumbnail, at least 44 px tall, used in the mobile drawer). The picture is decorative (`alt=""`): the label names the link.
- These components name no program or photo; the content comes from the app's `site.config.ts` (`packages/config/menus.ts`).

## Defaults every page gets (2026-11-19; `docs/FRONTEND_ARCHITECTURE.md`, "Shared defaults")

- **Title case**: every heading rendered by these components is title cased automatically by `TitleCase.astro`
  (`lib/title-case.ts`: small words stay lower case, the first word is capital, `&`, digits, entities and words like
  "FAQ" are kept). Type headings normally. App heading markup that bypasses the components wraps its content in
  `<TitleCase>`; headings inside the `SplitHero` copy slot are handled by `SplitHero`.
- **Photo first when stacked**: `SplitHero`, `PageHero` (media slot), `EditorialFeatureCard` and `CtaInvitation` put the
  photo before the text on phone and iPad. There is no prop for it.
- **Photo shape by the photo**: `Frame` `ratio` defaults to `auto` (`closestRatio`); `EditorialFeatureCard` and
  `CtaInvitation` pass it through (`photoRatio` is an override). `MediaCard` without `image.ratio` uses `auto`;
  `MediaCardGrid` (`items`, `variant`, `min`, `max`, `gap`, `ratio?`) gives every card of the grid the one shape that crops the
  set least (`commonRatio`).
- **No badge or caption by default**: `FloatingPreviewCard` shows a badge only if the `badge` slot is filled.
- **No overflow on narrow screens**: base-layer `min-width: 0`, `overflow-wrap`, `max-width: 100%`, fluid heading
  sizes; use `xs:` and `max-2xs:` for very narrow adjustments, never fixed widths wider than a phone.

## Section bands (2026-11-19; `docs/FRONTEND_ARCHITECTURE.md`, "Section bands")

- **Automatic.** Bands (`Section`, `SplitHero`, `PageHero`, `EditorialFeatureCard`, `CtaInvitation`) carry `data-band` and `data-tone`; `styles/bands.css` gives every second default band in a run the pale `--ui-surface-band` (`bg-surface-band`), so neighbouring sections differ without any page flag. The hero stays on the default surface.
- **Opt out** with an explicit `tone` (`raised`, `inset`, `dark`) for a deliberate panel or emphasis; it ends the run. Do not set a tone to alternate by hand. `Section spacing="none"` continues the band above it.
- **One dark band** at most per page body, never directly above the footer.

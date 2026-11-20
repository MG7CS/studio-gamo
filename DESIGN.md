# Gamo Studios — Cinematic Editorial Interface

<!-- status-banner: 2026-10 foundation pass -->
> Gamo Studios is a Christian, mission-driven Public Benefit Corporation, formed to be mission-driven and not only profit-seeking. Shared front-end rules: AGENTS.md "Shared front-end architecture" and [docs/FRONTEND_ARCHITECTURE.md](docs/FRONTEND_ARCHITECTURE.md). Tokens in code: `packages/ui/src/styles/tokens.base.css` and `tokens.semantic.css` (§4).

## 1. Approved 2026 public design phase

The founder's multi-page brief extends this system to **Bright Cinematic Editorial**: warm cream and ivory, large Inter headlines, asymmetric photographic compositions, sculptural masks and restrained floating previews. Organization pages and Academy lead with bright education/community photography; Worship balances warm light with preparation panels; Production alternates light technical education and dark event imagery. All share pill navigation and footer components from `packages/ui`.

The approved homepage hero is the current "Worship, Learning & Community" hero (`apps/web` `HomeEditorialHero`, owner-confirmed 2026-11-16); preserve it unless the owner says otherwise. References under `design-reference/2026-brand-refresh` are composition guides only, never embedded webpage screenshots. Delivered PNG originals stay under `assets/images/2026-brand-refresh`; only responsive AVIF/WebP derivatives are served. See [asset inventory](docs/ASSET_INVENTORY_2026.md), [front-end architecture](docs/FRONTEND_ARCHITECTURE.md) and [multi-page review](docs/MULTIPAGE_DESIGN_REVIEW.md).

Engineering review does not equal founder visual sign-off. All program launch, scholarship, partnership and transaction states remain clearly labeled previews. Reduced motion suppresses movement; scroll reveals keep content visible. Desktop/mobile evidence comes from actual running pages.

## 2. Design Identity

Gamo Studios follows a **Cinematic Editorial Interface** design language: a premium visual system combining authentic music photography, expressive editorial typography, sculptural geometric layouts, and refined, layered application interfaces.

The goal is to create the visual character of a sophisticated music brand while communicating the warmth, trustworthiness and reliability of a Christian, mission-driven organization serving students, families, churches and musicians. Messaging follows [docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md).

## 3. Core Principles

**Photography is structural.** Large photographs shape the composition rather than merely illustrating the content. Images may form full-bleed backgrounds, asymmetric mosaics, organically cropped regions, or visual anchors beneath product interface overlays.

**Layouts are deliberately asymmetric.** Favor varied visual proportions, editorial alignment, staggered image placement, and controlled overlaps over predictable centered layouts and equal-width grids.

**Geometry connects the experience.** Use broad organic curves, flowing masks, angled boundaries, and occasional sculptural transitions to connect photographic and typographic regions. Geometry should feel purposeful, not decorative.

**Typography is expressive.** Use Inter with bold, oversized headlines, tight visual proportions, intentional line breaks, and selective terracotta emphasis. Supporting copy remains brief and subordinate to the photography.

**Product interfaces live within the composition.** Present lesson details, musician profiles, form summaries and offer or invoice previews as elegant layered interface elements. Use restrained translucency, subtle borders, and readable contrast.

**Contrast establishes rhythm.** Alternate between cinematic charcoal regions and warm cream editorial surfaces. Terracotta serves as the recognizable brand accent. Allow the photography to supply additional tonal richness.

**Every section has a distinct composition.** Reuse underlying design-system components without forcing all sections into identical grids, cards, or hero templates.

## 4. Brand Tokens

Tokens live in code, not here: `packages/ui/src/styles/tokens.base.css` (tier 1, raw palette and scale) and `packages/ui/src/styles/tokens.semantic.css` (tier 2, roles such as `surface`, `fg`, `action`, `border`, `focus`, plus container widths, radii, type steps and aspect ratios). Component tokens (tier 3) exist only inside a component's CSS. Apps and pages use semantic tokens only; theming overrides semantic tokens on a wrapper (`data-surface`, `data-program`).

Brand palette (from `tokens.base.css`): terracotta `#B34E24`, deep `#8F3B18`, soft `#D98B62`, ink `#18181B`, cream `#F9F6F0`, sand `#EDE6DA`. Typography: Inter (self-hosted variable), titles weight 900 uppercase.

## 5. Photography

Use premium, believable photographs of professional musicians, worship services, music education and Christian concerts. Our existing imagery centers African and African-diaspora church communities, which remain welcome and important; broaden the photography over time so it reflects the diverse Christian communities Gamo serves. Imagery must never imply that program or event eligibility depends on ethnicity or nationality.

Favor natural expressions, realistic instruments, warm stage lighting, authentic environments, cinematic depth, and intentional editorial framing.

Avoid generic corporate stock imagery, excessive visual effects, artificial-looking anatomy, and photography that lacks relevance to the surrounding content.

## 6. Layout Implementation

Treat approved section references as binding composition targets rather than loose inspiration.

Before implementing a section, identify:

1. Its dominant photographic region.
2. Its typography region and visual hierarchy.
3. Major geometric boundaries and masks.
4. Supporting image groups and their proportions.
5. Overlapping interface elements.
6. Primary user action and navigation behavior.
7. Responsive adaptations.

Reconstruct the layout using genuine responsive Astro components, CSS Grid/Flexbox, CSS masks or clip paths, and reusable UI primitives.

Do not use complete design screenshots as webpage backgrounds.

## 7. Responsive Design

Mobile layouts must preserve the visual language and content hierarchy without attempting a literal desktop shrink.

Reorganize photographic mosaics, reduce complex overlays, preserve readable text, and keep the primary actions immediately understandable.

### Responsive edge cases (2026-10-13)

- Public split-photo heroes show the photo composition before the copy below the desktop breakpoint. Preserve desktop composition and keep interactive reading/focus order meaningful. Text-only forms and operational screens do not need decorative hero images.
- Short-height adjustments must also constrain width when intended only for mobile. Browser zoom and landscape windows can have desktop width and short height simultaneously.
- Allow normal vertical scrolling at increased zoom; do not shrink text or hide actions to force everything above the fold.
- Review image coverage, clipping, header collisions, and image/copy ordering in addition to document overflow. Check 320px mobile, landscape, and reduced CSS viewports corresponding to 110–400% zoom. A viewport simulation verifies reflow, not native browser zoom controls or text-only zoom.
- Regression command: `ACADEMY_PORT=4332 node scripts/verify-zoom-layout.mjs` (omit the override when Academy uses 4323). Captures and geometry results: `docs/screenshots/zoom-layout/`.

## 8. Visual Quality Standard

Correct fonts, colors, headings, and successful builds are not sufficient to establish design fidelity.

Review the rendered page against the approved reference for geometry, photographic composition, color distribution, typography, spacing, image cropping, and layering.

**Gamo Studios must feel like an immersive, carefully art-directed music experience—not a generic SaaS dashboard or conventional church website.**

## 9. Approved homepage narrative

The homepage introduces Gamo Studios as a **unified Christian music and community organization** and shows how its three programs work together, in order: Academy, Worship, Production. It must not read as a service that only supplies musicians to churches. Copy rules: [docs/GAMO_NONPROFIT_MODEL.md §6](docs/GAMO_NONPROFIT_MODEL.md#6-public-website-and-messaging).

1. **Hero — "Worship, Learning & Community"** The current `HomeEditorialHero` is the owner-approved hero (2026-11-16); preserve it. The earlier "Keep Worship Going" hero (`design-reference/homepage/01-hero-approved.png`) is historical. No invented stats. A rotating spotlight is **not implemented without explicit approval**; if approved: rotation ~8–10 s, manual controls, pause on interaction/focus, no auto-rotation under reduced motion; each slide labeled *Sponsored*, *Featured* or *Gamo Program* (and *Example* during design).
2. **Gamo Academy:** headline exactly **"Learn to Play the Instrument You Love."** Speaks first to students, parents and families; church-hosted and sponsored classes as a secondary pathway.
3. **Gamo Worship — musicians who serve:** musicians presented as skilled people who serve — preparation, trust, contribution and fair pay — never as inventory. Fictional names are labeled *Sample*. The roster is private; never visually boost musicians based on payment, sponsorship or partnership.
4. **How it works:** selector (rectangular tabs, §11) between *For churches* (request → offer → confirmation → invoice) and *Apply to serve* (application → staff review → private roster); no absolute attendance guarantee.
5. **Gamo Production:** technical support and volunteer training for churches.
6. **Final CTA:** "Get involved" invitation to students, families, churches and musicians; testimonials only once consented real statements exist.
7. **Footer:** Our Mission · Gamo Academy · Gamo Worship · Gamo Production · Church Partnerships · Contact and legal, with the approved PBC statement. Social links once verified.

**Planned sections requiring design approval (not built):** a *Church Partnerships* homepage section. Propose compositions through the design-lead before implementation; see [docs/SCREEN_INVENTORY.md](docs/SCREEN_INVENTORY.md).

### Homepage composition targets

- Treat `design-reference/homepage/02-musicians.png`, `03-worship-coverage.png`, `04-academy.png`, `06-testimonials-cta.png` and `07-footer.png` as **composition targets** for the global homepage below the hero (`05-live.png` is historical: Gamo Live was removed 2026-11-16).
- Preserve the approved hero (above).
- Use photographic mosaics, large asymmetric type, sculptural photo masks, restrained floating product UI and cream/charcoal transitions; avoid generic equal-width SaaS grids.
- Reconstruct responsive Astro markup from shared components, not screenshot backgrounds. Label all fictional musicians, bookings and story cards as sample content.
- Capture and compare full-page desktop and mobile screenshots before reporting visual sign-off.

### Sponsored content rules
- Sponsored placements use a visible, consistent "Sponsored" label (not color alone) and must remain visually distinct from editorial picks.
- Sponsored density is capped so the homepage still reads as an art-directed mission showcase, not an ad wall.
- Selectors are accessible tablists (arrow-key navigation, `aria-selected`) as small-radius rectangles, not pills (see §11; the current pill styling is being migrated).


## 10. UI/UX Design Standards: Design Restraint, Reference Fidelity & Professional Quality

Apply these rules by default across all Gamo Studios design, redesign, and implementation work (`apps/web`, `apps/academy`, `apps/worship`, `apps/production`, `apps/admin`, and `packages/ui`):

1. **Design Restraint Is Mandatory ("Less, But Better")**:
   - Minimize text, cards, badges, icons, buttons, and decorative components.
   - Every element must have a clear functional purpose; never add content simply to fill empty space.
   - Use generous, intentional whitespace and prioritize typography, proportions, alignment, imagery, and visual hierarchy.
   - Prefer one exceptionally executed visual element over several mediocre ones.
   - Before finalizing any design, ask: *What can be removed without compromising usability?*
2. **Respect Design References**:
   - Preserve overall composition, layout proportions, shapes, curves, distinctive geometry, spacing, whitespace, content density, typography hierarchy, image placement, and component relationships from approved references in `design-reference/`.
   - Do not use a reference merely as loose inspiration when the instruction is to follow it closely.
3. **Avoid Generic AI-Generated Interfaces**:
   - Never default to excessive rounded cards arranged in repetitive grids, unnecessary gradients/glowing effects, too many headings/subheadings/captions/explanatory paragraphs, repetitive feature lists, oversized dashboards with meaningless statistics, or excessive icons and badges.
4. **Design According to the Page's Purpose**:
   - A form prioritizes completing the form; a confirmation page states what happened and what comes next; an admin screen prioritizes real data and actions; a marketing page communicates a clear message.
   - Never combine multiple page purposes unnecessarily (e.g., do not turn a request form into a marketing page with feature descriptions, testimonials, or decorative cards).
5. **Content Density**:
   - Use the minimum amount of copy necessary to communicate clearly: short meaningful headings, one supporting sentence when necessary, no repeated information, no subheadings under every heading, progressive disclosure for secondary details, and visually obvious primary actions.
   - Minimalism must never compromise accessibility, error recovery, security, or essential instructions.
6. **Professional Design Execution & Functional Preservation**:
   - Maintain excellent typography, pixel-accurate spacing, well-considered component dimensions, authentic photography, restrained color usage, and responsive layouts while preserving all validation, accessibility, loading states, empty states, error messages, confirmations, and navigation.
7. **Mandatory 8-Point Design Review**:
   - Verify before completion: (1) faithful reference adherence, (2) zero unrequested additions, (3) no unnecessary text/repetition, (4) no excessive cards/icons/decorations, (5) one clear primary page purpose, (6) intentional whitespace, (7) mature commercial product quality, and (8) maximum simplification without losing functionality.

## 11. Clean layout rules (owner direction, 2026-11-18)

The owner rejects the layout most generated interfaces default to: **a pill or small uppercase label, then a big heading, then a grey subheading, then a button, then a grid of identical rounded cards, each with its own pill label.** Reference examples the owner called clean: spacex.com (a heading, one short paragraph, one square outlined button over a single large image) and tesla.com (photo-led cards with the title on the image, a price line and square buttons, plus flat blocks of different sizes: heading, one sentence, one button, a small image). These rules apply to every page of every app and to `packages/ui`.

1. **No eyebrows, no pills above headings.** Do not put a small uppercase line, label, chip or pill above a heading (page, section, hero or card). The first thing a visitor reads is the heading. This includes the `eyebrow` slot or prop of `Section`, `PageHero`, `CtaInvitation`, `LinkCard` and `MediaCard`.
2. **A heading, and a subheading only where the heading alone is unclear.** At most one short supporting line, usually none. Never a default stack of label, heading, intro paragraph and button. If you add a second line, say what it adds.
3. **Buttons and tabs are rectangles.** Use one small corner radius token (a `--radius-button`, about 4 to 6 px). Never `rounded-full` or `rounded-pill` on a button, link, tab, selector or chip. One main action per block (solid); a second action only when it is a different task (outlined, same shape). No arrow glyph is required.
4. **Cards are not a wall of identical tiles.** Prefer photo-led cards where the title sits on or directly under the image and the whole card is the link, and flat blocks (heading, one sentence, one button, optionally a small image). Vary scale and shape between cards; a row of six matching boxes is a smell. No category tag on a card: the title and photo say what it is.
5. **Restraint.** One strong image or one strong heading per section; few colours; no decorative gradients, glows, icons or ghost words. Text over a photo uses the scrim token. Spacing and type do the work that borders and boxes do in generic layouts.
6. **Required labels stay, but quiet.** Labels the copy rules require (Sample, Proposal, Sponsored), status chips in admin tables, form legends, breadcrumbs and navigation are information, not decoration: keep them, small, rectangular and used only where a rule requires them.
7. **When unsure, remove it.** Before finishing a screen, delete the one element you would miss least, then check again.

**Review test:** cover the page with your hand except for one section. If the first thing you see is a small label rather than the heading, or if two or more cards look the same, the section fails.

**Status:** adopted 2026-11-18 and applied across the sites: no eyebrow exists in the code any more and a guard (`scripts/audit/ui-boundaries.test.ts`) fails if one returns; buttons, tabs, chips and admin controls are `rounded-button` and round shapes are ratcheted; flat `LinkRows` replace grids of identical tiles for the audience and instrument lists. Still open: the sample preview widgets inside program sections, the Worship audience tabs with icon rows, and decorative circles in the admin dashboard library. A ratcheting guard that counts eyebrow slots and pill radii in `apps/*` and `packages/ui` will be added with that migration. New and changed UI must follow these rules now.

- **Subtle alternating section bands (owner direction 2026-11-19):** neighbouring full-width sections are told apart by a pale sand background that the shared layer applies automatically (`packages/ui/src/styles/bands.css`, token `--ui-surface-band`); pages never set it. Do not hand-set `raised` or `inset` tones to alternate; use a tone only for a deliberate panel or a dark band, with at most one dark band per page and none directly above the footer. See `docs/FRONTEND_ARCHITECTURE.md`, "Section bands".
- **Forms (owner direction 2026-11-20):** a form page shows one question per screen, and at most three together when they come from the same section. Heavy questions stand alone: paragraphs, file uploads, grids, checkboxes, scales, links and long choice lists. The header stays and the footer goes on form pages, so nothing pulls a visitor away mid-form. Every screen works without JavaScript (all questions are visible, one after the other) and the staff preview in the admin app shows the same wizard. Decisions: `docs/DECISIONS.md` (2026-11-20).
- **Landing heroes (owner direction 2026-11-19):** the main-site home and the Academy, Worship and Production landing heroes use the shared `PhotoTrioHero` (tall photo trio, photos first when stacked, heading on four or more lines at desktop widths); apps pass only the heading, buttons and photos.
- **Short headings, title case (owner direction 2026-11-19):** a heading fits on one line where possible and never runs past two lines. Headings are title cased automatically by the shared heading components (`TitleCase.astro`, `packages/ui/src/lib/title-case.ts`): every word starts with a capital except small words (a, an, the, and, but, or, nor, for, so, yet, as, at, by, in, of, on, to, from, with, into, onto, over, per, via, is), and the first word always does; words that already have capitals inside (FAQ, iPad) are kept. Type the heading normally; there is no page marker and no CSS capitalisation, and a heading written in app markup outside the shared components wraps its content in `<TitleCase>`.

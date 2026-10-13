# Gamo Studios — Cinematic Editorial Interface

## Approved 2026 public design phase

The founder's multi-page brief extends this system to **Bright Cinematic Editorial**: warm cream and ivory, large Inter headlines, asymmetric photographic compositions, sculptural masks and restrained floating previews. Organization pages and Academy lead with bright education/community photography; Worship balances warm light with preparation panels; Live uses a cinematic manual event spotlight; Production alternates light technical education and dark event imagery. All share pill navigation and footer components from `packages/ui`.

The original homepage hero remains approved and preserved. Its bright alternative is isolated at `/preview/hero-2026`; it does not replace `/` without visual acceptance. References under `design-reference/2026-brand-refresh` are composition guides only, never embedded webpage screenshots. Delivered PNG originals stay under `assets/images/2026-brand-refresh`; only responsive AVIF/WebP derivatives are served. See [asset inventory](docs/ASSET_INVENTORY_2026.md), [component ownership](docs/COMPONENT_ARCHITECTURE.md) and [multi-page review](docs/MULTIPAGE_DESIGN_REVIEW.md).

Engineering review does not equal founder visual sign-off. All program launch, scholarship, ticketing, partnership and transaction states remain clearly labeled previews. Reduced motion suppresses movement; scroll reveals keep content visible. Desktop/mobile evidence comes from actual running pages.

## Design Identity

Gamo Studios follows a **Cinematic Editorial Interface** design language: a premium visual system combining authentic music photography, expressive editorial typography, sculptural geometric layouts, and refined, layered application interfaces.

The goal is to create the visual character of a sophisticated music brand while communicating the warmth, trustworthiness and reliability of a Christian nonprofit serving churches, musicians, students and families. The visual system is preserved through the nonprofit transition; only messaging changes (see [docs/GAMO_NONPROFIT_MODEL.md](docs/GAMO_NONPROFIT_MODEL.md)).

## Core Principles

**Photography is structural.** Large photographs shape the composition rather than merely illustrating the content. Images may form full-bleed backgrounds, asymmetric mosaics, organically cropped regions, or visual anchors beneath product interface overlays.

**Layouts are deliberately asymmetric.** Favor varied visual proportions, editorial alignment, staggered image placement, and controlled overlaps over predictable centered layouts and equal-width grids.

**Geometry connects the experience.** Use broad organic curves, flowing masks, angled boundaries, and occasional sculptural transitions to connect photographic and typographic regions. Geometry should feel purposeful, not decorative.

**Typography is expressive.** Use Inter with bold, oversized headlines, tight visual proportions, intentional line breaks, and selective terracotta emphasis. Supporting copy remains brief and subordinate to the photography.

**Product interfaces live within the composition.** Present musician profiles, audition controls, booking summaries, standby assignments, and event cards as elegant layered interface elements. Use restrained translucency, subtle borders, and readable contrast.

**Contrast establishes rhythm.** Alternate between cinematic charcoal regions and warm cream editorial surfaces. Terracotta serves as the recognizable brand accent. Allow the photography to supply additional tonal richness.

**Every section has a distinct composition.** Reuse underlying design-system components without forcing all sections into identical grids, cards, or hero templates.

## Brand Tokens

- Primary terracotta: `#B65B35`
- Deep terracotta: `#8F432A`
- Deep charcoal: `#1D2323`
- Warm cream: `#F4EDE3`
- Soft copper: `#D7AD86`
- White: `#FFFFFF`
- Typography: Inter

## Photography

Use premium, believable photographs of professional musicians, worship services, music education and Christian concerts. Our existing imagery centers African and African-diaspora church communities, which remain welcome and important; broaden the photography over time so it reflects the diverse Christian communities Gamo serves. Imagery must never imply that program or event eligibility depends on ethnicity or nationality.

Favor natural expressions, realistic instruments, warm stage lighting, authentic environments, cinematic depth, and intentional editorial framing.

Avoid generic corporate stock imagery, excessive visual effects, artificial-looking anatomy, and photography that lacks relevance to the surrounding content.

## Layout Implementation

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

## Responsive Design

Mobile layouts must preserve the visual language and content hierarchy without attempting a literal desktop shrink.

Reorganize photographic mosaics, reduce complex overlays, preserve readable text, and keep the primary actions immediately understandable.

## Visual Quality Standard

Correct fonts, colors, headings, and successful builds are not sufficient to establish design fidelity.

Review the rendered page against the approved reference for geometry, photographic composition, color distribution, typography, spacing, image cropping, and layering.

**Gamo Studios must feel like an immersive, carefully art-directed music experience—not a generic SaaS dashboard or conventional church website.**

## Approved homepage narrative

The homepage introduces Gamo Studios as a **unified Christian music and community organization** and shows how its four programs work together. It must not read as a service that only supplies musicians to churches. Copy rules: [docs/GAMO_NONPROFIT_MODEL.md §6](docs/GAMO_NONPROFIT_MODEL.md#6-public-website-and-messaging).

1. **Hero — Keep Worship Going:** strong photo-led composition, two core paths, no invented stats. The hero has been refined to remove the laptop frame, left-side vertical navigation, search icon, hamburger icon; those changes take precedence over older mockups. Supporting copy now introduces the mission across programs. "Keep Worship Going" stays as the permanent brand message. A future dynamic spotlight (mission, sponsored programs, concerts, events, Academy, worship opportunities, church partnerships, nonprofit initiatives) may rotate **within the approved composition** — **not implemented without explicit approval**. If approved: rotation ~8–10 s, manual controls, pause on interaction/focus, no auto-rotation under reduced motion; each slide labeled *Sponsored*, *Featured* or *Gamo Program* (and *Example* during design).
2. **Meet the Musicians (The Gamo Collection):** musicians presented as skilled people who serve — preparation, trust, contribution and fair pay — never as inventory. Verified status only for actually verified members (sample names explicitly labeled). Never visually boost musicians based on payment, sponsorship or partnership.
3. **How It Works:** pill selector switching between *For Churches* and *Join the Collection*; framed as a community-supporting coordination process; primary/standby workflow; no absolute attendance guarantee.
4. **Gamo Academy:** headline exactly **"Learn to Play the Instrument You Love."** Speaks first to students, parents and families; church-hosted and sponsored classes as a secondary pathway.
5. **Gamo Live:** a trusted home for **Christian events** (no ethnic exclusivity). Pill selector: *Promote Event* (churches, ministries, artists, organizers; CTA "Promote an Event") and *Explore Events* (attendees; CTA "Explore Events"). Highlights free gatherings, concerts, recurring religious activities. *Sample* event previews until events are real.
6. **Final CTA:** "Get involved" invitation to churches, musicians, students, families and supporters; testimonials only once consented real statements exist.
7. **Footer:** Our Mission · Gamo Worship · Gamo Academy · Gamo Live · Gamo Production · Church Partnerships · Opportunities to Support · contact and legal, with the approved legal-status statement. Social links once verified.

**Planned sections requiring design approval (not built):** a *Church Partnerships* homepage section and a *Support Our Mission* section. Propose compositions through the design-lead before implementation; see [docs/SCREEN_INVENTORY.md](docs/SCREEN_INVENTORY.md).

### Sponsored content rules
- Sponsored placements use a visible, consistent "Sponsored" label (not color alone) and must remain visually distinct from editorial picks.
- Sponsored density is capped so the homepage still reads as an art-directed mission showcase, not an ad wall.
- Pill selectors are accessible tablists (arrow-key navigation, `aria-selected`) styled as terracotta-filled pills.


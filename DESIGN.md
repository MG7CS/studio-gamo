# Gamo Studios — Cinematic Editorial Interface

## Design Identity

Gamo Studios follows a **Cinematic Editorial Interface** design language: a premium visual system combining authentic music photography, expressive editorial typography, sculptural geometric layouts, and refined, layered application interfaces.

The goal is to create the visual character of a sophisticated music brand while communicating the reliability and usability of a professional musician marketplace.

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

Use premium, believable photographs of professional musicians, predominantly African and African-diaspora church communities, worship services, music education, and concerts.

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

1. **Hero — Keep Worship Going:** strong photo-led B2B/B2C split, two core paths, no invented stats. The first hero has been refined to remove the laptop frame, left-side vertical navigation, search icon, hamburger icon, and supporting paragraph. Those latest changes take precedence over older mockups.
2. **Meet the Musicians:** editorial artist gallery and demo audition cards; verified status only for actually verified roster members (sample names explicitly labeled).
3. **Your Sunday, Covered:** primary/standby workflow, booking steps and failover logic explained visually; no absolute attendance guarantee.
4. **Gamo Academy:** instructor-and-student photos, private lessons and church-hosted clinics.
5. **Gamo Live:** cinematic concert presentation and *demo* event preview until events are real.
6. **Final CTA:** audience-specific calls to action; testimonials only once consented real statements exist.
7. **Footer:** paths to each vertical, account access, contact, legal pages, social links once verified.


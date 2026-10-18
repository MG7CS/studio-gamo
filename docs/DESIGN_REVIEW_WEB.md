# Gamo Studios: Web Homepage Design Review

<!-- status-banner: 2026-10 foundation pass -->
> **Historical document** (design review snapshot). It is kept for the record and is not maintained; it may describe code, routes or decisions that no longer exist. Current reference: [DESIGN.md](../DESIGN.md).

> **Historical record (superseded).** This early review describes a pre-photography, pre-nonprofit version of the homepage (e.g. "Hire a Musician", verified badges on demo cards). Current composition rules: [HOMEPAGE_VISUAL_REVIEW.md](HOMEPAGE_VISUAL_REVIEW.md); current copy rules: [GAMO_NONPROFIT_MODEL.md](GAMO_NONPROFIT_MODEL.md). Do not use this file as guidance.

## Scope
Implementation of the global homepage (`apps/web/src/pages/index.astro`) according to the scoped constraints: design first, strict adherence to `design-reference`, and no functional integrations.

## Implemented Sections Walkthrough
1. **Global Navigation**: Transparent header overlaying the hero section, featuring the "GS" logo mark, standard site links, and clear Sign In / Get Started CTAs.
2. **Hero ("Keep Worship Going.")**: Full viewport height section with deep charcoal background (`#1D2323`), gradient overlays, and placeholder text for cinematic photography. Core messaging and primary CTAs ("Hire a Musician", "Join as a Musician") are prominent.
3. **Meet the Musicians (Roster)**: Responsive 4-column grid showcasing demo musician cards (Sarah M., David K., etc.) with verified badges, instruments, and profile links on a cream background (`#F4EDE3`).
4. **Your Sunday, Covered.**: Features a staggered layout explaining the dispatch workflow (1. Book primary, 2. Standby assigned, 3. Failover logic) paired with a mock UI graphic of the dispatch dashboard.
5. **Gamo Academy**: Dark theme card (`#1D2323`) introducing masterclasses and lessons.
6. **Gamo Live**: Terracotta theme card (`#B65B35`) for events and ticketing.
7. **Testimonials and Final CTA**: A placeholder testimonial block clearly labeled as demo content to prevent misrepresentation, followed by a bottom heavy CTA section leading to Hire/Contact forms.
8. **Footer**: Comprehensive navigation block and legal links on a dark background.

## Verified Design Elements
- **Typography**: Inter font is used globally.
- **Color Palette**: `#B65B35` (Terracotta), `#1D2323` (Charcoal), `#F4EDE3` (Cream), and `#DED6CC` (Border/Muted accents) are strictly applied.
- **Responsiveness**: Flexbox and CSS Grid configurations automatically reflow from single-column mobile (`390px` target) to multi-column desktop layouts (`1440px` max-width).

## Identified Technical Limitations & Differences
- **Photographic Assets**: The reference images rely heavily on premium, color-graded cinematic photography which we do not have licensed files for in the repo. These have been explicitly mocked out with descriptive placeholders (e.g., `[ Cinematic Worship Photography Placeholder ]`).
- **Interactive States**: Interactive elements (carousels, complex dropdowns) are currently static layout representations.
- **Mocked UI Elements**: The "App Mockup" in the workflow section is implemented via CSS/HTML to match the reference composition rather than a raw image, ensuring it remains crisp across pixel densities, but lacks the true visual nuance of a designed screenshot asset.

## Artifacts
Screenshots of the implemented page at desktop (1440px) and mobile (390px) breakpoints have been captured to `docs/homepage-desktop.png` and `docs/homepage-mobile.png`.

**Status:** Ready for Design Review. Development is paused pending approval of the current visual state before any functionality is initiated.

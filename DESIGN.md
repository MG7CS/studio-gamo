# Gamo Studios — Design System

**Status:** approved visual direction; exact UI/brand assets evolve through review.

## Brand and voice

- Brand: **Gamo Studios** (never change public brand to Studio Gamo solely because the repo is named `studio-gamo`).
- Positioning: worship continuity through trusted professionals; music education and live experiences as extensions.
- Tone: assured, warm, concise, modern, human; never overpromise.
- Visually: premium music editorial + modern product UI. Realistic photography, high image density, confident negative space, restrained text.
- Avoid: generic SaaS dashboards on marketing pages, fake reviews, fake attendance rates, neon/cyber styling, decorative floating icons, stock-looking 3D people.

## Typography

**Inter variable** is the approved universal interface typeface. Use local or reliable licensed/font CDN loading with fallback `system-ui, sans-serif`. Logo lettering is an independent vector mark: do not auto-rewrite logo assets when font CSS changes.

| Usage | Desktop | Mobile | Weight |
| --- | --- | --- | --- |
| Hero | clamp(3rem, 6vw, 5rem) | fluid | 700–800 |
| Section title | clamp(2.25rem, 4vw, 3.5rem) | fluid | 700 |
| Card title | 1.25–1.75rem | 1.125–1.5rem | 600 |
| Body | 1–1.125rem | 1rem | 400 |
| Nav/buttons | 0.875–1rem | 0.875–1rem | 500–600 |
| Eyebrows | 0.75–0.8125rem | 0.75rem | 600 |

Headings may use tight tracking (-0.025em to -0.045em); body line-height 1.5–1.65. Never sacrifice readability for oversized display type.

## Color tokens

| Token | Hex | Role |
| --- | --- | --- |
| `brand.terracotta` | `#B65B35` | accents, graphic treatments |
| `brand.terracottaDeep` | `#8F432A` | accessible primary CTA on cream/white |
| `brand.charcoal` | `#1D2323` | typography, dark sections |
| `brand.cream` | `#F4EDE3` | primary light section background |
| `brand.copper` | `#D7AD86` | subtle highlight |
| `neutral.white` | `#FFFFFF` | surfaces and contrast |
| `neutral.muted` | `#6B6B67` | secondary text (check contrast per surface) |
| `neutral.border` | `#DED6CC` | subtle stroke |
| `state.success` | `#26865B` | confirmed states with accessible text pairing |

Use accessibility-tested combinations. `#B65B35` on very light backgrounds may not always meet required small-text contrast; use darker deep terracotta for small CTA labels or large filled controls where needed. Verify with actual contrast tests.

## Site-wide layout

- Header: logo left, spare primary navigation, Sign In and terracotta Get Started. Keep mobile menu functional and accessible.
- Hero: dark cinematic photography (real worship musicians) and generous typographic zone. Main line: **Keep Worship Going.** Supporting line may read **Reliable musicians for every service.** Primary actions: **Hire a Musician** and **Join as a Musician**.
- Build alternating deep charcoal and warm cream compositions, not repetitive same-size feature card grids.
- Edges: occasional large radii (16–28px) for photography panels, smaller (8–12px) for UI controls; not indiscriminate pill shapes.
- Content width around 1200–1440px with generous gutters and responsive rhythm.
- Images should resemble real professional editorial photographs (skin texture, physical instruments, coherent stage light and hands), not illustration or plastic-looking imagery.
- Put headings and CTAs in accessible HTML, not baked into image files.
- Subdomains share logo, font, core tokens and accessible component primitives, but use distinctive brand expressions: Worship (continuity), Academy (learning), Live (concert energy), Production (technical craft), Admin (operational clarity).

## Approved homepage narrative

1. **Hero — Keep Worship Going:** strong photo-led B2B/B2C split, two core paths, no invented stats.
2. **Meet the Musicians:** editorial artist gallery and demo audition cards; verified status only for actually verified roster members (sample names explicitly labeled).
3. **Your Sunday, Covered:** primary/standby workflow, booking steps and failover logic explained visually; no absolute attendance guarantee.
4. **Gamo Academy:** instructor-and-student photos, private lessons and church-hosted clinics.
5. **Gamo Live:** cinematic concert presentation and *demo* event preview until events are real.
6. **Final CTA:** audience-specific calls to action; testimonials only once consented real statements exist.
7. **Footer:** paths to each vertical, account access, contact, legal pages, social links once verified.

## Product components

- `AppHeader`, `BrandLogo`, `PrimaryButton`, `SecondaryButton`, `SectionHeader`, `PhotoPanel`, `RosterPreviewCard`, `VerifiedStatus`, `GigCard`, `StandbyStatus`, `PlanSelector`, `AvailabilityPicker`, `CheckoutSummary`, `AuditStatus`, `FormStepper`, `Toast`, `EmptyState`.
- Forms: persistent labels, descriptive errors, progress indicators, keyboard support, server validation, submit idempotency.
- Dashboards: dense enough to act, not dense enough to overwhelm. Sunday dispatch prioritizes huge status and call-to-action, not decorative images.
- Include loading, empty, error, success and permission-denied views for all workflows.

## Responsive and motion

- Design and test at 360, 390, 768, 1024, 1440px widths.
- Do not crop musician faces/hands under critical overlay text; use responsive `<picture>` or CSS object-position.
- Respect `prefers-reduced-motion`; reserve motion for meaningful interactions.
- Aim WCAG 2.2 AA; test contrast, focus order, focus visibility, keyboard menus, semantic landmarks and forms.

## Source assets

Approved logo concept: warm terracotta waveform symbol, bold GAMO, lighter spaced STUDIOS; use actual versioned SVGs if supplied in repository, do not reproduce with emoji or a generic stock icon. Existing chat mockups are **visual inspiration**, not production assets or proof of real church/artist affiliations. Photograph/media licensing and consent are mandatory before production use.

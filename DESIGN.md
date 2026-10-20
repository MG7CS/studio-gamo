# Gamo Studios — Cinematic Editorial Interface

> The one design system for every Gamo Studios page. Tokens in code: `packages/ui/src/styles/tokens.css` (the values below). Wording rules: `AGENTS.md` §1 (Gamo Studios is a Christian, mission-driven Public Benefit Corporation, not a nonprofit). Rebuilt screens get an approved design before they are built; the admin's own design is in `docs/ADMIN_REQUIREMENTS.md`.

## Approved 2026 public design phase

The founder's multi-page brief extends this system to **Bright Cinematic Editorial**: warm cream and ivory, large Inter headlines, asymmetric photographic compositions, sculptural masks and restrained floating previews. Organization pages and Academy lead with bright education/community photography; Worship balances warm light with preparation panels; Live uses a cinematic manual event spotlight; Production alternates light technical education and dark event imagery. All share pill navigation and footer components from `packages/ui`.

The original homepage hero remains approved and preserved. References under `design-reference/2026-brand-refresh` are composition guides only, never embedded webpage screenshots. Delivered PNG originals stay under `assets/images/2026-brand-refresh`; only responsive AVIF/WebP derivatives are served (see [asset inventory](docs/ASSET_INVENTORY_2026.md) and [image pipeline](docs/IMAGE_PIPELINE.md)).

Engineering review does not equal founder visual sign-off. The products are launching: payment screens running against Stripe's test mode say "Test mode" plainly; nothing else is labeled "preview". Fictional people or events are still labeled *Sample* or *Example*. Reduced motion suppresses movement; scroll reveals keep content visible. Desktop/mobile evidence comes from actual running pages.

## Design Identity

Gamo Studios follows a **Cinematic Editorial Interface** design language: a premium visual system combining authentic music photography, expressive editorial typography, sculptural geometric layouts, and refined, layered application interfaces.

The goal is to create the visual character of a sophisticated music brand while communicating the warmth, trustworthiness and reliability of a Christian, mission-driven Public Benefit Corporation serving churches and other groups, musicians and technicians, learners of any age, and the people who organize and attend Christian events.

## Core Principles

**Photography is structural.** Large photographs shape the composition rather than merely illustrating the content. Images may form full-bleed backgrounds, asymmetric mosaics, organically cropped regions, or visual anchors beneath product interface overlays.

**Layouts are deliberately asymmetric.** Favor varied visual proportions, editorial alignment, staggered image placement, and controlled overlaps over predictable centered layouts and equal-width grids.

**Geometry connects the experience.** Use broad organic curves, flowing masks, angled boundaries, and occasional sculptural transitions to connect photographic and typographic regions. Geometry should feel purposeful, not decorative.

**Typography is expressive.** Use Inter with bold, oversized headlines, tight visual proportions, intentional line breaks, and selective terracotta emphasis. Supporting copy remains brief and subordinate to the photography.

**Product interfaces live within the composition.** Present musician profiles, audition controls, booking summaries, standby assignments, and event cards as elegant layered interface elements. Use restrained translucency, subtle borders, and readable contrast.

**Contrast establishes rhythm.** Alternate between cinematic charcoal regions and warm cream editorial surfaces. Terracotta serves as the recognizable brand accent. Allow the photography to supply additional tonal richness.

**Every section has a distinct composition.** Reuse underlying design-system components without forcing all sections into identical grids, cards, or hero templates.

## Brand Tokens

- Terracotta: `#B34E24` (accent, emphasis)
- Deep terracotta: `#8F3B18` (buttons and links with white text)
- Soft terracotta: `#D98B62`
- Ink: `#18181B` (text, dark regions)
- Cream: `#F9F6F0` (light surfaces); ivory `#FCFAF6`
- Sand: `#EDE6DA`; tan: `#D8C5AE`; line: `#DCD3C6`; muted text: `#57534E`
- Typography: Inter (self-hosted variable font)
- Status colors (shared, in `packages/ui/src/styles/tokens.css`; prefixed `status-` so they never clash with the admin's own `--color-success/warning/danger`). Each has a text color, a soft fill and a border line. Contrast of the text color, computed from the hex values (WCAG relative luminance), body-size text needs 4.5:1:

  | Token (text / soft fill / line) | Hex | on white | on its soft fill | on cream | on sand |
  | --- | --- | --- | --- | --- | --- |
  | `status-success` / `-soft` / `-line` | `#17643F` / `#E4F3EA` / `#B9DCC6` | 7.16 | 6.25 | 6.64 | 5.78 |
  | `status-warning` / `-soft` / `-line` | `#7A4D00` / `#FCF0D6` / `#ECD29A` | 7.27 | 6.43 | 6.74 | 5.86 |
  | `status-danger` / `-soft` / `-line` | `#A52A35` / `#FBE6E6` / `#E8B4B6` | 7.04 | 5.89 | 6.53 | 5.68 |

  White text on `status-danger` is 7.04:1. The line colors are decoration only and never carry text. Info and neutral use the brand palette (cream, sand, tan, ink), not a blue. Color never carries meaning alone: a word or icon always accompanies it.

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

1. **Hero — Keep Worship Going:** strong photo-led composition, two core paths, no invented stats. The hero has been refined to remove the laptop frame, left-side vertical navigation, search icon, hamburger icon; those changes take precedence over older mockups. Supporting copy now introduces the mission across programs. "Keep Worship Going" stays as the permanent brand message. A future dynamic spotlight (mission, sponsored programs, concerts, events, Academy, worship opportunities, church partnerships, mission initiatives) may rotate **within the approved composition** — **not implemented without explicit approval**. If approved: rotation ~8–10 s, manual controls, pause on interaction/focus, no auto-rotation under reduced motion; each slide labeled *Sponsored*, *Featured* or *Gamo Program* (and *Example* during design).
2. **Meet the Musicians (The Gamo Collection):** musicians presented as skilled people who serve — preparation, trust, contribution and fair pay — never as inventory. Verified status only for actually verified members (sample names explicitly labeled). Never visually boost musicians based on payment, sponsorship or partnership.
3. **How It Works:** pill selector switching between *For Churches* and *Join the Collection*; framed as a community-supporting coordination process; primary/standby workflow; no absolute attendance guarantee. *Audience note (2026-10-19):* Worship books musicians for any occasion and almost any person or group, not only churches; the live page still says *For Churches* and its copy fix is parked by the owner.
4. **Gamo Academy:** headline exactly **"Learn to Play the Instrument You Love."** Academy is for anyone who wants to learn an instrument, plus production training; classes can be sponsored by churches or any organization. (The live page's audience copy fix is parked by the owner.)
5. **Gamo Live:** a trusted home for **Christian events** (no ethnic exclusivity). Pill selector: *Promote Event* (churches, ministries, artists, organizers) and *Explore Events* (attendees; CTA "Explore Events"). Highlights free gatherings, concerts, recurring religious activities. *Sample* event previews until events are real. *Note:* the "Promote an Event" CTA pointed to the Promote page, which was removed (`/promote` redirects to `/organizer`); the marketing page is not changed until the owner names it.
6. **Final CTA:** "Get involved" invitation to churches, musicians, students, families and supporters; testimonials only once consented real statements exist.
7. **Footer:** Our Mission · Gamo Worship · Gamo Academy · Gamo Live · Gamo Production · Church Partnerships · Opportunities to Support · contact and legal, with the approved legal-status statement. Social links once verified.

**Planned sections requiring design approval (not built):** a *Church Partnerships* homepage section and a *Support Our Mission* section. Propose compositions for approval before implementation.

### Sponsored content rules
- Sponsored placements use a visible, consistent "Sponsored" label (not color alone) and must remain visually distinct from editorial picks.
- Sponsored density is capped so the homepage still reads as an art-directed mission showcase, not an ad wall.
- Pill selectors are accessible tablists (arrow-key navigation, `aria-selected`) styled as terracotta-filled pills.


## Responsive edge cases (2026-10-13)

- Public split-photo heroes show the photo composition before the copy below the desktop breakpoint. Preserve desktop composition and keep interactive reading/focus order meaningful. Text-only forms and operational screens do not need decorative hero images.
- Short-height adjustments must also constrain width when intended only for mobile. Browser zoom and landscape windows can have desktop width and short height simultaneously.
- Allow normal vertical scrolling at increased zoom; do not shrink text or hide actions to force everything above the fold.
- Review image coverage, clipping, header collisions, and image/copy ordering in addition to document overflow. Check 320px mobile, landscape, and reduced CSS viewports corresponding to 110–400% zoom. A viewport simulation verifies reflow, not native browser zoom controls or text-only zoom.

## UI/UX Design Standards: Design Restraint, Reference Fidelity & Professional Quality

Apply these rules by default across all Gamo Studios design, redesign, and implementation work (`apps/web`, `apps/worship`, `apps/academy`, `apps/live`, `apps/production`, `apps/admin` and `packages/ui`; the admin applies them within its claymorphism design):

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
   - A sign-in page prioritizes authentication; a registration page prioritizes completing registration; a dashboard prioritizes useful information and actions; a marketing page communicates a clear message.
   - Never combine multiple page purposes unnecessarily (e.g., do not turn a sign-in page into a marketing page with feature descriptions, testimonials, or decorative cards).
5. **Content Density**:
   - Use the minimum amount of copy necessary to communicate clearly: short meaningful headings, one supporting sentence when necessary, no repeated information, no subheadings under every heading, progressive disclosure for secondary details, and visually obvious primary actions.
   - Minimalism must never compromise accessibility, error recovery, security, or essential instructions.
6. **Professional Design Execution & Functional Preservation**:
   - Maintain excellent typography, pixel-accurate spacing, well-considered component dimensions, authentic photography, restrained color usage, and responsive layouts while preserving all validation, accessibility, loading states, empty states, error messages, account recovery, and navigation.
7. **Mandatory 8-Point Design Review**:
   - Verify before completion: (1) faithful reference adherence, (2) zero unrequested additions, (3) no unnecessary text/repetition, (4) no excessive cards/icons/decorations, (5) one clear primary page purpose, (6) intentional whitespace, (7) mature commercial product quality, and (8) maximum simplification without losing functionality.

## Primitives for Live's public and organizer screens

Shared components live in `packages/ui/src/components/ui/` (import with `@studio-gamo/ui/components/ui/Name.astro`). Pages compose these; they do not hand-roll buttons, banners, pills or empty states. All targets are at least 44 px, text at least 12 px, focus rings are visible, and none needs inline scripts.

| Component | Props | Use it for |
| --- | --- | --- |
| `Button` | `variant` primary / secondary / danger-outline / ghost, `size` md / lg, `block`, `href` (renders `<a>`), `type`, `name`, `value`, `id`, `form`, `disabled` | Every button and button-looking link. One primary per screen area. |
| `Notice` | `tone` info / success / warning / danger, `title?`, `id?`, `focusable?`, default slot | Messages: flash results, errors, warnings. Danger is `role="alert"`, the rest `role="status"`. |
| `Pill` | `tone` neutral / info / success / warning / danger, `dot?` | Short status words (Draft, Published, Cancelled). Never "Verified" unless an admin verified it. The older `StatusPill` stays for public trust labels. |
| `EmptyState` | `title`, `text?`, default slot for the next-step action | Every list that can be empty. |
| `Breadcrumbs` | `items: { label, href? }[]` | Pages two or more levels deep. The last item is `aria-current="page"`. |
| `PageHeader` | `title`, `description?`, slots `breadcrumbs`, `actions` | The one `<h1>` of a page, plus its one-line description and top-level actions. |
| `ConfirmAction` | `summaryLabel`, `confirmLabel`, `actionValue`, `actionName?` (default `action`), `formAction?`, default slot (consequence), slot `fields` | Destructive actions (cancel event, remove member). `<details>` reveals the consequence, then a real POST form. |
| `Stat` | `label`, `value`, `hint?` | One real number from a real query. Wrap several in a grid; no fake counts. |
| `DateTimeField` | `id`, `name`, `label`, `kind` date / time, `value?`, `min?`, `max?`, `required?`, `disabled?`, `disabledReason?`, `hint?`, `error?` | Native date and time pickers that match `SplitField`. |
| `SplitField` (existing) | adds `type` date / time / url, `required` on textarea, `disabled` styling, `disabledReason`, `min`, `max` | All other text, email, number, url, select and textarea inputs. |

Flash messages: `packages/ui/src/lib/flash.ts`. A POST handler ends with `return flashRedirect(Astro, '/path', 'event-saved')`; the next page calls `readFlash(Astro, { 'event-saved': 'Event saved.' })` and renders the text in a `Notice`. The cookie holds only a key from the page's allow-list (60 s, HttpOnly, SameSite=Lax), never request text.

### The bar every screen must meet

1. Exactly one `<h1>`, from `PageHeader`; titles are sentence case, semibold.
2. Shared primitives only; no hand-rolled buttons, banners, pills or empty states.
3. Every list has a real empty state with a next step.
4. Destructive actions have a confirm step with honest consequence text (`ConfirmAction`).
5. Feedback after an action is a redirect plus a flash message, not a re-rendered POST.
6. Forms use native date, time and url inputs and show all errors at once, each tied to its field.
7. Checked at 360 and 390 px with safe-area padding, 44 px targets and 12 px minimum text, and no horizontal scroll.
8. Plain, honest copy; never claim "Verified" unless an admin verified it; no invented numbers.
9. Verified in a browser with axe (serious and critical violations are zero).


## Split-screen pages: one screen, steps when needed

Sign-in, sign-up, registration, confirmation, organizer set-up, invitation, **ticket checkout (three steps: tickets, details, review and pay), find my tickets and the door staff PIN page** use the split layout (photo left, form right). Checkout shows every line item and the total on its review step, before the payment step; the gift step never preselects an amount and names who receives the gift. Order pages follow the centered ticket-page design (no photo). On desktop they never scroll: the page is one screen tall and the form is centered. If the fields do not fit, tighten type and spacing slightly, then split the form into steps rather than shrinking further. Each step is a server-rendered page with a thin progress bar ("Step N of M"), a Next button and a Back link; it validates its own fields and carries earlier answers forward. Phones may scroll. Verify at laptop heights (about 700 and 900 px).


## Dashboard composition and behaviour

- **Floating cards.** A dashboard page is a title plus separate cards on the page background: a toolbar card (search and filters), summary cards, the calendar card, and one card per list row or topic. A card never holds another card's contents; the search box, the filters and the list are three things. Pages list components, they do not draw.
- **Shared cards.** `Panel`, `Stat`, `Calendar`, `SearchField`, `FilterChips`, `EmptyState`, `Button`, `Pill` and `ConfirmAction` live in `packages/ui` and are used the same way in the organizer area and the admin.
- **Warm, not dark.** The organizer area uses the cream page, warm secondary text (`.organizer-theme` in `apps/live/src/styles/organizer.css`) and terracotta for active and selected states; near-black is for text only.
- **Behaviour.** Menus close on an outside press and Escape; pressable things show pointer, hover, focus and pressed states; forms cannot be double-submitted. These come from `packages/ui/src/scripts/interactions.ts` and `styles/interactions.css`, loaded by each dashboard layout.
- **Counts are links.** A stat card or a chip count opens the list it counts, filtered the same way, and equals that list's length. The card's accessible name is its visible text plus an `sr-only` "Opens …".
- **Shell.** Sidebar (collapsible to an icon rail, shared script), the person's menu at the bottom of the sidebar, an avatar button in the phone top bar, a bottom tab bar on phones, and the collapsed logo as an inline orange SVG. The top bar adds nothing the sidebar already says.
- **Accessible names and contrast.** Visible text is the accessible name; extra words are `sr-only` text inside the control, never a different `aria-label`. No `opacity` on text; solid colours that pass contrast. Status is a word, not only a colour.
- **Calendar.** Dates are shown with the shared `Calendar` (month, week, months and years pickers), driven by URL parameters and server-rendered. One calendar for every app.
- **Type scale in dashboards.** Calm and small: page titles about 26 px semibold, body 14 to 15 px, labels 12 to 13 px; large black headlines are for marketing only.
- **Sizes and clipping.** Dashboard scale: titles 22 to 26 px, descriptions 14 px, card and row titles 15 to 16 px, meta 12 to 13 px, big numbers about 28 px, sidebar about 250 px (88 collapsed), content at most about 1100 px. Menus and popovers are never inside an `overflow` container (scroll the inner list instead) and the shell sits at `z-30`. Verify in a browser with the sidebar open and collapsed and every menu open.
- **The door screen** (`/organizer/door/<date>` and staff links) is the one dashboard screen built for standing at a door: phone first, usable on a tablet, no sidebar for staff links, a Check in / Sell switch at the top, targets at least 56 px, big numbers for counts and totals, one card per step (scan or type, choose tickets, take payment, result). When the device is offline a danger notice says so and selling is disabled.
- **Money on screens.** Amounts are formatted from integer cents with the currency; every line item is its own row; "Test mode" is shown plainly on payment screens while Stripe runs in test mode.
- **Information architecture.** About four to six areas in the sidebar and phone tab bar; related screens are tabs inside one area (shared `FilterChips` with real counts), not separate menu items. Detail pages keep the area selected and link back. Plan the flow of each main task (how many presses, where the next step is) before placing a screen. Admin areas: Overview, Community, Gamo Live, Legal. Organizer areas: Overview, Events, Organization, Settings.


# Public UI/UX audit — 2026-11-16

Local build of branch `cleanup/forms-emails-invoices`, checked in Chrome at 1440 px, ~945 px and ~606 px
(the narrowest the browser window allows; 360 px is covered by the Playwright suite). Pages: web home,
mission, get-started, get-involved, contact; Worship home and `/apply`; Academy home, lessons, a lesson,
registration; Production home and a service page. Fixes follow `AGENTS.md` → "Shared front-end
architecture": each finding names the shared piece that should own the fix, so one change fixes every app.

## Automated checks

All checked pages: one `<h1>`, no horizontal overflow, no images without `alt`, no empty links, no console
errors. Exceptions:

| Page | Finding | Owner |
|---|---|---|
| Academy `/lessons` | Lesson title links are 25 px tall (below the 44 px rule); heading jumps h1 → h3 | `LinkCard`/`Card` primitive (stretched link, heading level prop) |
| Academy `/register/*` | Consent checkboxes 24 × 24 px | `ChoiceField`/`Checkbox` primitive (44 px hit area) |

## Findings (most important first)

### 1. Program order is wrong everywhere (owner: Academy → Worship → Production)
- Header nav reads Mission, Worship, Academy, Production; footer lists Worship, Academy, Production.
- Web home features Worship as the full-width dark card and numbers sections `01 Worship`, `02 Academy`.
- **Fix in shared:** the shell receives nav and footer from each app's `site.config.ts`; one ordered
  program list in config drives nav, footer, program grids and home sections.

### 2. Leftover Gamo Live and "events" copy
- Footer description: "…music education, Christian events and technical support."
- Footer "Stay in the Loop": "Updates on programs, upcoming events…".
- **Fix:** footer copy comes from the app manifest (shell neutrality), rewritten without events.

### 3. Tentative wording undermines trust
- "Gamo Worship · a developing program", "A proposed program…", "Academy is being designed…",
  "(proposed)" on tuition, "Planned · proposal" badges, "never separate commercial silos".
- Keep honest labels where a fee or structure really is unapproved (AGENTS.md), but say it once, in a
  consistent `Badge` ("Proposal"), not in headlines and body copy. Copy pass per program.

### 4. Text over photos is hard to read
- Academy instrument cards: the "AGES 6 AND UP" eyebrow on light photos is nearly invisible; body text
  on bright areas is low contrast.
- **Fix in shared:** `MediaCard` with a built-in scrim token (`--scrim`) and on-media text tokens; never
  raw text over an image.

### 5. Layout gaps and orphans
- Academy instrument grid leaves an empty cell beside "Drums" and a giant ghost word behind it.
- Worship "four calm steps": 02 and 04 are offset downward, reading as broken.
- Web home roster card floats beside a large empty area; Worship `/apply` is a narrow column on a wide page.
- Home program cards: eyebrows wrap to two lines and bullets wrap unevenly, so card heights differ.
- **Fix in shared:** `FeatureGrid` (auto-fit, container queries, no orphan cell), `NumberedSteps`
  (aligned), `SplitHero`/`PageHero` with defined media slots, `Badge`-style eyebrows that never wrap.

### 6. Header and navigation
- Between ~606 and ~1000 px the header shows only the logo, "Get Involved" and a menu button; at
  narrow widths "Get Involved" disappears. No program identity on Academy/Worship/Production pages
  beyond the active nav pill (logo always reads "Gamo Studios").
- **Fix in shared:** header takes `brand` (program name) and `cta` from the app; menu breakpoint by
  container width; CTA kept in the mobile menu.

### 7. Very long pages, repeated patterns
- Web home is ~10,700 px at 945 px wide (~11,500 at 606 px): a programs grid, then three spotlights
  repeating the same programs, then "find your place", then a CTA, then a large photo.
- **Fix:** one programs section (Academy first) plus a single path chooser; spotlights move to each
  program's own site.

### 8. Footer
- At tablet width the footer becomes one long column with large gaps; social icons without labels
  visible; "Organizational Status" link label is unclear.
- **Fix in shared:** footer groups from the manifest, responsive column grid by container width.

### 9. Forms and placeholders (Phase 2 will replace these)
- Contact/partner and `/apply`, `/request` placeholders: fine as interim, but the email button is the
  only action and the page feels empty. The registration form is clear; its checkbox size is the issue above.

## What is already good
Consistent palette, type and photography; clear headlines; working focus rings; breadcrumbs on Academy
interior pages; "Sample" labels on fictional content; registration summary panel; no overflow or console
errors.

## Order of work
1. Foundation migration (`docs/FRONTEND_ARCHITECTURE.md` → migration order): shell config, tokens,
   primitives (`Container`, `Section`, `PageHero`, `SplitHero`, `Card`/`LinkCard`/`MediaCard`, `Badge`,
   `NumberedSteps`, `FeatureGrid`, `Checkbox`/`ChoiceField`), catalog page.
2. Apply findings 1–8 through those pieces; program order from config.
3. Copy pass (findings 2–3) per program, Academy first.
4. Re-audit at 360 px (Playwright) and desktop; screenshots in `docs/BUILD_LOG.md`.

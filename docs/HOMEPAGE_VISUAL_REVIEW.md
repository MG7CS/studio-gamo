# Global Homepage — Visual Fidelity Review

**Scope:** \`apps/web\` sections beneath the approved hero. **Do not change the hero during this pass.**

The screenshots in \`design-reference/homepage/\` are the composition source of truth. These are design studies: recreate the HTML/CSS/photography composition instead of rendering the whole screenshot as a background.

## Composition checks

| Component | Reference | Must preserve |
| --- | --- | --- |
| \`MusiciansSection\` | \`02-musicians.png\` | Cream editorial introduction at left, large central keyboardist crop with sculpted edge, vocalist+bass+drums collage at right, overlapping audition mockup, six photographic instrument tiles below |
| \`WorshipCoverageSection\` | \`03-worship-coverage.png\` | Dark upper photographic feature; text to left, musician/stage imagery in middle, layered white primary/standby preview cards to right; light four-step illustrated process beneath |
| \`AcademySection\` | \`04-academy.png\` | Cream left text, large instructor/student photo right with sculpted edge, floating instructor/video interface, four photo-first lesson types and church-hosting panel below |
| \`LiveSection\` | \`05-live.png\` | Cream left headline, immersive concert photograph right with glass event overlay, lower events gallery with three photo cards |
| \`StoriesSection\` | \`06-testimonials-cta.png\` | Cream editorial introduction left and three tall story cards right; demo content cannot be represented as verified customer testimonials |
| \`FinalCTA\` and \`SiteFooter\` | \`07-footer.png\` | Terracotta/charcoal photograph split CTA; charcoal footer with grouped link columns, restrained newsletter preview and subtle congregation-photo continuation |

## Visual QA checklist

- Verify section geometry at **1536 × 1024 desktop** and at **390 × 844 mobile**, plus a 768px tablet width.
- Capture **full-page screenshots** and **individual screenshots of each section**, not just the first viewport.
- Compare the proportions of each text/image zone, mask/curve positions, image focal points, overlays, headline line breaks, card scale and whitespace.
- Check that all images load in the browser, with no empty blocks or distorted aspect ratios.
- Check mobile reading order: section headings and calls to action must remain understandable without horizontal overflow.
- Verify that \`make check\`, \`make lint\`, and \`make build\` pass (or document which targets are unavailable).
- Verify keyboard focus, heading order and link contrast.
- Confirm that demo people, church bookings, events and story previews are **labeled samples**; do not fabricate partner endorsements or scheduled concerts.

## Existing media constraint

The repository currently has a limited set of original musician/lesson/concert photographs, optimized in \`apps/web/public/images/optimized\`. Some reference sections show several distinct people/photos beyond what is currently available, so certain supporting tiles intentionally reuse different crops of existing assets. **Do not substitute the full design screenshots as production assets.** When additional standalone photographs are supplied, replace repetitive crops without changing layout geometry.

## Delivery gate

After local browser verification, provide a comparison for each section listing **matched, remaining differences, and next action**. The global website is not visually approved until the owner reviews rendered screenshots. Do not start a new subdomain application based solely on a successful build.

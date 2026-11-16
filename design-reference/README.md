# Gamo Studios design references — approved visual direction

These are **reference screenshots, not deployable UI or standalone photos**. Reconstruct as responsive Astro/Tailwind components. Never display a complete screenshot as a webpage background. Example musicians/events/testimonials and interface data are fictional illustrative content; label as demo or substitute neutral placeholders until real data is approved.

## Sequence and intent

1. `homepage/01-hero-approved.png` — **historical** (the earlier "Keep Worship Going" hero). The owner-approved hero is the current "Where Worship, Learning & Community Meet." hero in code (`apps/web` `HomeEditorialHero`, confirmed 2026-11-16).
2. `homepage/02-musicians.png` — musician discovery/editorial profiles.
3. `homepage/03-worship-coverage.png` — primary/standby and service coverage.
4. `homepage/04-academy.png` — private and church-hosted lessons.
5. `homepage/05-live.png` — **historical** (Gamo Live was removed 2026-11-16); do not build from it.
6. `homepage/06-testimonials-cta.png` — **layout only**, do NOT present invented testimonials as real.
7. `homepage/07-footer.png` — footer and bottom CTA.

Additional: `hero-standalone-alternative.png` is an alternative crop, not the primary hero; `header-navigation-reference.png` is a navigation-only reference. The approved hero lives in code, not in these images. Do not embed a laptop device mockup in the site. Logo SVGs in `branding/svg/` are supplied vector recreations; verify shapes and legibility at intended sizes.

Use **Inter** throughout. Palette: the tokens in `packages/ui/src/styles/tokens.base.css` are authoritative (terracotta `#B34E24`, deep `#8F3B18`, soft `#D98B62`, ink `#18181B`, cream `#F9F6F0`, sand `#EDE6DA`); apps use the semantic roles in `tokens.semantic.css`. Colours sampled from the screenshots are not tokens. Premium real-looking photography, dynamic section transitions, uncluttered copy, accessible contrast, mobile-first responsiveness. No fabricated statistics, verification guarantees, reviews, prices or operating claims.

**Copy note (2026-10-12, updated 2026-11-16):** the reference screenshots predate the current mission wording and may contain commercial marketplace wording. They remain binding for **composition only**; all text must follow [docs/GAMO_NONPROFIT_MODEL.md](../docs/GAMO_NONPROFIT_MODEL.md) (Gamo Studios is a Christian, mission-driven Public Benefit Corporation; use only the approved PBC statement; no unapproved fees).

Any photo depicted inside generated screenshots cannot be assumed to exist as a separate production-ready image. Use licensed, explicitly approved individual assets or tasteful safe placeholders; don't crop the full reference screenshot into background artwork.

`authentication/` is **historical**: public sign-in and accounts were removed on 2026-11-16.

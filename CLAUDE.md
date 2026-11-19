# CLAUDE.md

`AGENTS.md` is the project contract and the source of truth: read it first (mission, architecture, security, testing, git).

Three rules that are easy to forget and that the owner repeats:

- **Clean visual style (2026-11-18):** no eyebrow labels or pills above headings or card titles; a heading, and a subheading only where needed; buttons and tabs are small-radius rectangles, never pills; cards are photo-led and vary in size, not a wall of identical tiles; when unsure, remove the element. Details and the review test: `DESIGN.md` §11.
- **No old-URL redirects until the first public launch (2026-11-18):** the apps have never had real users, so removed addresses are simply removed; this ends at launch (`AGENTS.md`, "Renamed or removed URLs").
- **Minimal testing (2026-11-18):** tests only for money, access and security, personal data and uploads, migrations and public token links; none for layout, copy, photos or counts; run only the file you changed, and the full check once before a deploy (`AGENTS.md`, "Minimal testing").

# Age groups, levels and per-instrument ages

Owner direction 2026-11-19: these are structured data in one place, not text typed into pages. The ranges are a proposal until the Academy opens.

## Where the data lives

- `packages/config/academy-levels.ts`: `AGE_GROUPS` (id, label, `minAge`, `maxAge`; Kids 6–12, Teens 13–17, Adults 18 and up), `LEVELS` (Beginner, Developing, Advancing) and `FORMATS` (Private, Group, Church-hosted), plus the label helpers (`ageGroupRange`, `ageGroupWithRange`, `joinAgeGroups`, `levelLabel`, `formatLabel`).
- `packages/config/academy-instruments.ts`: each instrument's `minAge` and `levels`, with `instrumentAgeLabel` ("Ages 6 and up") and `instrumentAgeGroups` (every group that reaches the minimum age).

Instructors (`apps/academy/src/data/instructors.ts`) refer to ids only (`ageGroups: ['kids']`, `format: 'private'`), so a typo fails the type check. The Academy has no lessons catalog; the interest form offers the age groups, levels and formats.

## How to change things

- **An age range:** edit `minAge` or `maxAge` of the group in `AGE_GROUPS`. The instrument age groups and the interest form follow.
- **Add a level or format:** add one entry to `LEVELS` or `FORMATS`. Give an instrument the new level in its `levels`.
- **An instrument's minimum age:** change `minAge` in `ACADEMY_INSTRUMENTS`. The header panel, the Academy home and instruments pages and the main-site home all read it.
- **Add an age group:** add it to `AGE_GROUPS`.

## Who reads them

The instructor card and page, the Academy home (instruments), the instruments pages, the header panel and the main-site home.

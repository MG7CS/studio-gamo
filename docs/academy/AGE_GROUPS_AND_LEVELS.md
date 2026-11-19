# Age groups, levels and per-instrument ages

Owner direction 2026-11-19: these are structured data in one place, not text typed into pages. The ranges are a proposal until the Academy opens.

## Where the data lives

- `packages/config/academy-levels.ts`: `AGE_GROUPS` (id, label, `minAge`, `maxAge`; Kids 6–12, Teens 13–17, Adults 18 and up), `LEVELS` (Beginner, Developing, Advancing) and `FORMATS` (Private, Group, Church-hosted), plus the label helpers (`ageGroupRange`, `ageGroupWithRange`, `joinAgeGroups`, `levelLabel`, `formatLabel`).
- `packages/config/academy-instruments.ts`: each instrument's `minAge` and `levels`, with `instrumentAgeLabel` ("Ages 6 and up") and `instrumentAgeGroups` (every group that reaches the minimum age).

Lessons (`apps/academy/src/data/lessons.ts`) and instructors (`instructors.ts`) refer to ids only (`level: 'beginner'`, `ageGroups: ['kids']`, `format: 'private'`), so a typo fails the type check.

## How to change things

- **An age range:** edit `minAge` or `maxAge` of the group in `AGE_GROUPS`. The Academy home cards, the lesson filter labels and the instrument age groups follow.
- **Add a level or format:** add one entry to `LEVELS` or `FORMATS`. The lesson filters show it at once; give an instrument the new level in its `levels`, and use the id in a lesson.
- **An instrument's minimum age:** change `minAge` in `ACADEMY_INSTRUMENTS`. The header panel, the Academy home and instruments pages and the main-site home all read it.
- **Add an age group:** add it to `AGE_GROUPS`, then add its card copy and photo in `LearningPaths.astro` (the type check asks for it).

## Who reads them

The lesson filters (`apps/academy/src/lib/lesson-filters.ts`, `/lessons?ages=kids&level=beginner&format=private`), the lesson card, lesson page and registration summary, the instructor card and page, the Academy home (Age and Stage section, instruments), the instruments pages, the header panel and the main-site home.

/**
 * Lesson list filters (/lessons): the facets, their options, URL presets by id (`?ages=kids`) and matching.
 * The page and the client script in LessonFilters.astro apply the same rules.
 */
import { AGE_GROUPS, FORMATS, LEVELS, ageGroupWithRange } from '@gamo/config/academy-levels';
import { instruments } from '../data/instruments';
import type { Lesson } from '../data/lessons';

export type LessonFilterName = 'instrument' | 'ages' | 'level' | 'format';
export type LessonFilterValues = Partial<Record<LessonFilterName, string>>;

export const LESSON_FILTERS: {
  name: LessonFilterName;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  {
    name: 'instrument',
    label: 'Instrument',
    options: instruments.map((i) => ({ value: i.slug, label: i.short })),
  },
  {
    name: 'ages',
    label: 'Age group',
    options: AGE_GROUPS.map((g) => ({ value: g.id, label: ageGroupWithRange(g.id) })),
  },
  { name: 'level', label: 'Level', options: LEVELS.map((l) => ({ value: l.id, label: l.label })) },
  { name: 'format', label: 'Format', options: FORMATS.map((f) => ({ value: f.id, label: f.label })) },
];

/** Known filter values from the query string; anything else is ignored. */
export function lessonFiltersFromUrl(params: URLSearchParams): LessonFilterValues {
  const values: LessonFilterValues = {};
  for (const f of LESSON_FILTERS) {
    const v = params.get(f.name);
    if (v && f.options.some((o) => o.value === v)) values[f.name] = v;
  }
  return values;
}

export function lessonMatches(lesson: Lesson, values: LessonFilterValues): boolean {
  return (
    (!values.instrument || lesson.instrumentSlug === values.instrument) &&
    (!values.level || lesson.level === values.level) &&
    (!values.format || lesson.format === values.format) &&
    (!values.ages || (lesson.ageGroups as string[]).includes(values.ages))
  );
}

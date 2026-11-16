/**
 * Lesson list filters (/lessons): the facets, their options, URL presets (`?ages=Kids`) and matching.
 * The page and the client script in LessonFilters.astro apply the same rules.
 */
import { instruments } from '../data/instruments';
import type { Lesson } from '../data/lessons';

export type LessonFilterName = 'instrument' | 'ages' | 'level' | 'format';
export type LessonFilterValues = Partial<Record<LessonFilterName, string>>;

const plain = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

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
  { name: 'ages', label: 'Age group', options: plain(['Kids', 'Teens', 'Adults']) },
  { name: 'level', label: 'Level', options: plain(['Beginner', 'Developing', 'Advancing']) },
  { name: 'format', label: 'Format', options: plain(['Private', 'Group', 'Church-hosted']) },
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
    (!values.ages || (lesson.ages as string[]).includes(values.ages))
  );
}

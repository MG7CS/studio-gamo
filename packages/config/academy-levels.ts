/**
 * Gamo Academy age groups, levels and lesson formats: the one place they are defined (owner direction 2026-11-19).
 * Lessons, instructors, instruments, the lesson filters, the home page and registration all read these lists by id
 * and show the labels from here, so changing an age range, adding a level or renaming a format is an edit in this file.
 * Each instrument's minimum age and levels live next to the instrument in `academy-instruments.ts`.
 * The ranges are a proposal until the Academy opens. Pure data and tiny helpers: no framework imports.
 */

export const AGE_GROUPS = [
  { id: 'kids', label: 'Kids', minAge: 6, maxAge: 12 },
  { id: 'teens', label: 'Teens', minAge: 13, maxAge: 17 },
  { id: 'adults', label: 'Adults', minAge: 18, maxAge: null },
] as const;

export const LEVELS = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'developing', label: 'Developing' },
  { id: 'advancing', label: 'Advancing' },
] as const;

export const FORMATS = [
  { id: 'private', label: 'Private' },
  { id: 'group', label: 'Group' },
  { id: 'church-hosted', label: 'Church-hosted' },
] as const;

/** Offered by some instructors besides the formats above (how lessons are delivered, not a lesson format). */
export const ONLINE_LABEL = 'Online';

export type AgeGroup = (typeof AGE_GROUPS)[number];
export type AgeGroupId = AgeGroup['id'];
export type LevelId = (typeof LEVELS)[number]['id'];
export type FormatId = (typeof FORMATS)[number]['id'];

const ageGroup = (id: AgeGroupId): AgeGroup => AGE_GROUPS.find((g) => g.id === id)!;

/** "6–12", "13–17", "18 and up". */
export function ageGroupRange(group: AgeGroup): string {
  return group.maxAge === null ? `${group.minAge} and up` : `${group.minAge}–${group.maxAge}`;
}

/** "Kids". */
export const ageGroupLabel = (id: AgeGroupId): string => ageGroup(id).label;

/** "Kids (6–12)". */
export const ageGroupWithRange = (id: AgeGroupId): string =>
  `${ageGroup(id).label} (${ageGroupRange(ageGroup(id))})`;

/** "Kids", "Kids & Teens", "Kids, Teens & Adults". */
export function joinAgeGroups(ids: readonly AgeGroupId[]): string {
  const labels = ids.map(ageGroupLabel);
  return labels.length < 2
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
}

export const levelLabel = (id: LevelId): string => LEVELS.find((l) => l.id === id)!.label;
export const formatLabel = (id: FormatId): string => FORMATS.find((f) => f.id === id)!.label;

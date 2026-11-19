/**
 * The Academy instruments we selected (owner direction 2026-11-19): one list, used everywhere an instrument is named, so
 * the header panel, the Academy home and instruments pages, and the main-site home always agree on which instruments
 * exist, what they are called and the ages. Change the list here and every place follows.
 * Age groups, levels and formats are defined in `academy-levels.ts`.
 * Lesson details (blurb, first steps, icon) stay with the Academy app; the ages are a proposal until the Academy opens.
 */
import { AGE_GROUPS, type AgeGroupId, type LevelId } from './academy-levels.ts';

export interface AcademyInstrument {
  slug: string;
  /** The name shown everywhere (panel, lists, page headings). */
  name: string;
  /** Photo catalog key. */
  photo: string;
  /** Youngest age we teach this instrument to; the age groups and the "Ages 6 and up" text follow from it. */
  minAge: number;
  /** The levels offered (ids from `academy-levels.ts`). */
  levels: LevelId[];
}

const ALL_LEVELS: LevelId[] = ['beginner', 'developing', 'advancing'];

export const ACADEMY_INSTRUMENTS: readonly AcademyInstrument[] = [
  {
    slug: 'piano',
    name: 'Piano & Keyboards',
    photo: 'instrumentPianoKeyboard',
    minAge: 6,
    levels: ALL_LEVELS,
  },
  {
    slug: 'acoustic-guitar',
    name: 'Acoustic Guitar',
    photo: 'instrumentAcousticGuitar',
    minAge: 7,
    levels: ALL_LEVELS,
  },
  {
    slug: 'electric-guitar',
    name: 'Electric Guitar',
    photo: 'instrumentElectricGuitar',
    minAge: 9,
    levels: ALL_LEVELS,
  },
  { slug: 'bass', name: 'Bass Guitar', photo: 'instrumentBassGuitar', minAge: 9, levels: ALL_LEVELS },
  { slug: 'drums', name: 'Drums & Percussion', photo: 'instrumentDrums', minAge: 7, levels: ALL_LEVELS },
];

/** "Ages 6 and up". */
export const instrumentAgeLabel = (i: Pick<AcademyInstrument, 'minAge'>): string => `Ages ${i.minAge} and up`;

/** The age groups this instrument is offered to: every group that reaches the minimum age or goes beyond it. */
export const instrumentAgeGroups = (i: Pick<AcademyInstrument, 'minAge'>): AgeGroupId[] =>
  AGE_GROUPS.filter((g) => g.maxAge === null || g.maxAge >= i.minAge).map((g) => g.id);

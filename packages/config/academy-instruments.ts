/**
 * The Academy instruments we selected (owner direction 2026-11-19): one list, used everywhere an instrument is named, so
 * the header panel, the Academy home and instruments pages, and the main-site home always agree on which instruments
 * exist, what they are called and the ages. Change the list here and every place follows.
 * Lesson details (blurb, first steps, icon) stay with the Academy app; the ages are a proposal until the Academy opens.
 */
export interface AcademyInstrument {
  slug: string;
  /** The name shown everywhere (panel, lists, page headings). */
  name: string;
  /** Photo catalog key. */
  photo: string;
  ages: string;
}

export const ACADEMY_INSTRUMENTS: readonly AcademyInstrument[] = [
  { slug: 'piano', name: 'Piano & Keyboards', photo: 'instrumentPianoKeyboard', ages: 'Ages 6 and up' },
  {
    slug: 'acoustic-guitar',
    name: 'Acoustic Guitar',
    photo: 'instrumentAcousticGuitar',
    ages: 'Ages 7 and up',
  },
  {
    slug: 'electric-guitar',
    name: 'Electric Guitar',
    photo: 'instrumentElectricGuitar',
    ages: 'Ages 9 and up',
  },
  { slug: 'bass', name: 'Bass Guitar', photo: 'instrumentBassGuitar', ages: 'Ages 9 and up' },
  { slug: 'drums', name: 'Drums & Percussion', photo: 'instrumentDrums', ages: 'Ages 7 and up' },
  { slug: 'vocals', name: 'Vocals', photo: 'instrumentVocals', ages: 'Ages 8 and up' },
];

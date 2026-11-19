/**
 * Instrument catalog for Gamo Academy (design phase).
 * Which instruments exist, their names, photos, minimum ages and levels come from the shared list in `@gamo/config/academy-instruments`
 * (the same list the header panel and the main-site home use); this file adds the lesson details.
 * Lesson formats and age ranges (see `@gamo/config/academy-levels`) are proposals; nothing here is a live offering.
 */
import { ACADEMY_INSTRUMENTS, instrumentAgeGroups, instrumentAgeLabel } from '@gamo/config/academy-instruments';
import type { AgeGroupId } from '@gamo/config/academy-levels';
import type { PhotoKey } from '@studio-gamo/ui/lib/images.ts';
// Narrow instrument icons keep data independent of Astro component modules.
type InstrumentIcon = 'piano' | 'guitar' | 'drums' | 'music' | 'mic' | 'sliders';

export interface Instrument {
  slug: string;
  name: string;
  short: string;
  blurb: string;
  icon: InstrumentIcon;
  /** Only set when a genuinely matching photo exists; otherwise a typographic card is used. */
  photo?: PhotoKey;
  /** "Ages 6 and up", from the instrument's minimum age. */
  ages: string;
  ageGroups: AgeGroupId[];
  firstSteps: string[];
}

const details: Record<string, Omit<Instrument, 'name' | 'photo' | 'ages' | 'ageGroups'>> = {
  'piano': {
    slug: 'piano',
    short: 'Piano',
    icon: 'piano',
    blurb: 'Read music, play chords and grow from your first melody to accompanying others.',
    firstSteps: [
      'Finding Your Way Around the Keys',
      'Simple Melodies with Both Hands',
      'Chords and Accompaniment Basics',
    ],
  },
  'acoustic-guitar': {
    slug: 'acoustic-guitar',
    short: 'Acoustic',
    icon: 'guitar',
    blurb: 'Strum your first songs in weeks, then build rhythm, fingerstyle and confidence.',
    firstSteps: ['Holding the Guitar and Tuning', 'First Open Chords', 'Strumming Patterns and Simple Songs'],
  },
  'electric-guitar': {
    slug: 'electric-guitar',
    short: 'Electric',
    icon: 'guitar',
    blurb: 'Tone, riffs, lead lines and playing with a band, at a pace that fits you.',
    firstSteps: ['Amp and Tone Basics', 'Power Chords and Riffs', 'Playing Along with a Band Track'],
  },
  'bass': {
    slug: 'bass',
    short: 'Bass',
    icon: 'music',
    blurb: 'Lock in with the drums and learn the instrument that holds every song together.',
    firstSteps: ['Root Notes and Timing', 'Simple Grooves', 'Listening to and Following a Drummer'],
  },
  'drums': {
    slug: 'drums',
    short: 'Drums',
    icon: 'drums',
    blurb: 'Rhythm, coordination and groove, starting on practice pads and growing to a full kit.',
    firstSteps: ['Grip, Posture and Counting', 'Basic Rock and Ballad Grooves', 'Fills and Dynamics'],
  },
};

export const instruments: Instrument[] = ACADEMY_INSTRUMENTS.map((i) => ({
  ...details[i.slug]!,
  name: i.name,
  photo: i.photo as PhotoKey,
  ages: instrumentAgeLabel(i),
  ageGroups: instrumentAgeGroups(i),
}));

export const plannedInstruments = ['Violin', 'Cello', 'Saxophone', 'Trumpet', 'Ukulele', 'Music theory'];

export const instrumentBySlug = (slug: string) => instruments.find((i) => i.slug === slug);

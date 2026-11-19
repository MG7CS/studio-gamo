/**
 * Instrument catalog for Gamo Academy (design phase).
 * Lesson formats and age ranges are proposals; nothing here is a live offering.
 */
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
  ages: string;
  firstSteps: string[];
}

export const instruments: Instrument[] = [
  {
    slug: 'piano',
    name: 'Piano & Keyboards',
    short: 'Piano',
    icon: 'piano',
    photo: 'instrumentPianoKeyboard',
    blurb: 'Read music, play chords and grow from your first melody to accompanying others.',
    ages: 'Ages 6 and up',
    firstSteps: [
      'Finding Your Way Around the Keys',
      'Simple Melodies with Both Hands',
      'Chords and Accompaniment Basics',
    ],
  },
  {
    slug: 'acoustic-guitar',
    name: 'Acoustic Guitar',
    short: 'Acoustic',
    icon: 'guitar',
    photo: 'instrumentAcousticGuitar',
    blurb: 'Strum your first songs in weeks, then build rhythm, fingerstyle and confidence.',
    ages: 'Ages 7 and up',
    firstSteps: ['Holding the Guitar and Tuning', 'First Open Chords', 'Strumming Patterns and Simple Songs'],
  },
  {
    slug: 'electric-guitar',
    name: 'Electric Guitar',
    short: 'Electric',
    icon: 'guitar',
    photo: 'instrumentElectricGuitar',
    blurb: 'Tone, riffs, lead lines and playing with a band, at a pace that fits you.',
    ages: 'Ages 9 and up',
    firstSteps: ['Amp and Tone Basics', 'Power Chords and Riffs', 'Playing Along with a Band Track'],
  },
  {
    slug: 'bass',
    name: 'Bass Guitar',
    short: 'Bass',
    icon: 'music',
    photo: 'instrumentBassGuitar',
    blurb: 'Lock in with the drums and learn the instrument that holds every song together.',
    ages: 'Ages 9 and up',
    firstSteps: ['Root Notes and Timing', 'Simple Grooves', 'Listening to and Following a Drummer'],
  },
  {
    slug: 'drums',
    name: 'Drums & Percussion',
    short: 'Drums',
    icon: 'drums',
    photo: 'instrumentDrums',
    blurb: 'Rhythm, coordination and groove, starting on practice pads and growing to a full kit.',
    ages: 'Ages 7 and up',
    firstSteps: ['Grip, Posture and Counting', 'Basic Rock and Ballad Grooves', 'Fills and Dynamics'],
  },
  {
    slug: 'vocals',
    name: 'Vocals',
    short: 'Voice',
    icon: 'mic',
    photo: 'instrumentVocals',
    blurb: 'Breath, pitch and healthy technique for solo singing, choirs and harmony.',
    ages: 'Ages 8 and up',
    firstSteps: ['Breathing and Warm-Ups', 'Finding Your Comfortable Range', 'Pitch, Harmony and Confidence'],
  },
];

export const plannedInstruments = ['Violin', 'Cello', 'Saxophone', 'Trumpet', 'Ukulele', 'Music theory'];

export const instrumentBySlug = (slug: string) => instruments.find((i) => i.slug === slug);

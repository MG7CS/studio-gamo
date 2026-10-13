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
  photoPosition?: string;
  ages: string;
  firstSteps: string[];
  tint: string;
}

export const instruments: Instrument[] = [
  {
    slug: 'piano', name: 'Piano & keyboards', short: 'Piano', icon: 'piano', photo: 'youngPianist',
    blurb: 'Read music, play chords and grow from your first melody to accompanying others.',
    ages: 'Ages 6 and up', tint: 'bg-[#EFE2D3]',
    firstSteps: ['Finding your way around the keys', 'Simple melodies with both hands', 'Chords and accompaniment basics'],
  },
  {
    slug: 'acoustic-guitar', name: 'Acoustic guitar', short: 'Acoustic', icon: 'guitar', photo: 'girlGuitar',
    blurb: 'Strum your first songs in weeks, then build rhythm, fingerstyle and confidence.',
    ages: 'Ages 7 and up', tint: 'bg-[#F1E6D8]',
    firstSteps: ['Holding the guitar and tuning', 'First open chords', 'Strumming patterns and simple songs'],
  },
  {
    slug: 'electric-guitar', name: 'Electric guitar', short: 'Electric', icon: 'guitar',
    blurb: 'Tone, riffs, lead lines and playing with a band, at a pace that fits you.',
    ages: 'Ages 9 and up', tint: 'bg-[#E8DCCD]',
    firstSteps: ['Amp and tone basics', 'Power chords and riffs', 'Playing along with a band track'],
  },
  {
    slug: 'bass', name: 'Bass guitar', short: 'Bass', icon: 'music',
    blurb: 'Lock in with the drums and learn the instrument that holds every song together.',
    ages: 'Ages 9 and up', tint: 'bg-[#E9D7C6]',
    firstSteps: ['Root notes and timing', 'Simple grooves', 'Listening to and following a drummer'],
  },
  {
    slug: 'drums', name: 'Drums & percussion', short: 'Drums', icon: 'drums',
    blurb: 'Rhythm, coordination and groove, starting on practice pads and growing to a full kit.',
    ages: 'Ages 7 and up', tint: 'bg-[#F0DDCF]',
    firstSteps: ['Grip, posture and counting', 'Basic rock and ballad grooves', 'Fills and dynamics'],
  },
  {
    slug: 'vocals', name: 'Vocals', short: 'Voice', icon: 'mic', photo: 'worshipLeaderGolden',
    blurb: 'Breath, pitch and healthy technique for solo singing, choirs and harmony.',
    ages: 'Ages 8 and up', tint: 'bg-[#F3E4D2]',
    firstSteps: ['Breathing and warm-ups', 'Finding your comfortable range', 'Pitch, harmony and confidence'],
  },
];

export const plannedInstruments = ['Violin', 'Cello', 'Saxophone', 'Trumpet', 'Ukulele', 'Music theory'];

export const instrumentBySlug = (slug: string) => instruments.find((i) => i.slug === slug);

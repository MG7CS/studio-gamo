import { formatUsd } from '@studio-gamo/ui/lib/format';
/**
 * SAMPLE lesson listings for the design phase. Tuition amounts are proposals only
 * and stored as integer minor units (cents). No booking or payment exists yet.
 */
export type Level = 'Beginner' | 'Developing' | 'Advancing';
export type Age = 'Kids' | 'Teens' | 'Adults';
export type Format = 'Private' | 'Group' | 'Church-hosted';

export interface Lesson {
  slug: string;
  title: string;
  instrument: string;
  instrumentSlug: string;
  instructorSlug: string;
  level: Level;
  ages: Age[];
  format: Format;
  schedule: string;
  length: string;
  location: string;
  proposedTuitionCents: number | null;
  summary: string;
  outcomes: string[];
  /** Fictional preview listing (all of them today): registration works in local only (D-131). */
  sample: boolean;
}

export const lessons: Lesson[] = [
  {
    slug: 'first-piano-steps', title: 'First Piano Steps', instrument: 'Piano', instrumentSlug: 'piano',
    instructorSlug: 'maya-thompson', level: 'Beginner', ages: ['Kids'], format: 'Private',
    schedule: 'Weekly · 30 min', length: '10 weeks', location: 'Online or in person', proposedTuitionCents: 3000,
    summary: 'A gentle introduction to the keyboard for children ages 6–10, with a practice plan for families.',
    outcomes: ['Play simple melodies with both hands', 'Read basic notation', 'Build a 10-minute daily practice habit'],
    sample: true,
  },
  {
    slug: 'guitar-circle-teens', title: 'Teen Guitar Circle', instrument: 'Acoustic guitar', instrumentSlug: 'acoustic-guitar',
    instructorSlug: 'daniel-reyes', level: 'Beginner', ages: ['Teens'], format: 'Group',
    schedule: 'Saturdays · 60 min', length: '8 weeks', location: 'Community room', proposedTuitionCents: 1500,
    summary: 'Learn chords and strumming alongside friends, ending with a relaxed group play-through.',
    outcomes: ['Eight open chords', 'Three strumming patterns', 'Play a full song as a group'],
    sample: true,
  },
  {
    slug: 'church-hosted-voice', title: 'Voice & Harmony Workshop', instrument: 'Vocals', instrumentSlug: 'vocals',
    instructorSlug: 'grace-okafor', level: 'Developing', ages: ['Teens', 'Adults'], format: 'Church-hosted',
    schedule: 'Tuesdays · 75 min', length: '6 weeks', location: 'Host church fellowship hall', proposedTuitionCents: null,
    summary: 'A church-hosted workshop on breath, blend and harmony, open to the wider community.',
    outcomes: ['Warm-up routine you can repeat', 'Singing in two- and three-part harmony', 'Healthy range and projection'],
    sample: true,
  },
  {
    slug: 'drum-foundations', title: 'Drum Foundations', instrument: 'Drums & percussion', instrumentSlug: 'drums',
    instructorSlug: 'samuel-park', level: 'Beginner', ages: ['Kids', 'Teens'], format: 'Private',
    schedule: 'Weekly · 45 min', length: '12 weeks', location: 'Studio', proposedTuitionCents: 3500,
    summary: 'Grip, counting and first grooves, starting on a practice pad before moving to the full kit.',
    outcomes: ['Steady eighth-note grooves', 'Simple fills', 'Playing along to a click'],
    sample: true,
  },
  {
    slug: 'adult-electric-guitar', title: 'Electric Guitar for Adults', instrument: 'Electric guitar', instrumentSlug: 'electric-guitar',
    instructorSlug: 'daniel-reyes', level: 'Developing', ages: ['Adults'], format: 'Private',
    schedule: 'Evenings · 45 min', length: 'Ongoing', location: 'Online', proposedTuitionCents: 4000,
    summary: 'For adults returning to the guitar or ready to move beyond open chords into tone and lead lines.',
    outcomes: ['Barre and power chords', 'Pentatonic lead basics', 'Dialing in a usable tone'],
    sample: true,
  },
  {
    slug: 'bass-groove-lab', title: 'Bass Groove Lab', instrument: 'Bass guitar', instrumentSlug: 'bass',
    instructorSlug: 'samuel-park', level: 'Advancing', ages: ['Teens', 'Adults'], format: 'Group',
    schedule: 'Thursdays · 60 min', length: '6 weeks', location: 'Studio', proposedTuitionCents: 1800,
    summary: 'Small-group sessions on locking in with a drummer, walking lines and playing with dynamics.',
    outcomes: ['Locking with kick and snare', 'Walking bass basics', 'Reading chord charts'],
    sample: true,
  },
];

export const formatTuition = (cents: number | null) =>
  cents === null ? 'Sponsorship planned' : `${formatUsd(cents, { whole: true })} / session (proposed)`;

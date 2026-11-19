/**
 * Example instructor profiles, described by role (no names, towns or photos of people): they show
 * how a profile reads, not real instructors. The avatar renders the instrument icon.
 */
import type { IconName } from '@studio-gamo/ui/lib/icons';

export interface Instructor {
  slug: string;
  /** The role shown as the card title, e.g. "Piano and voice instructor". */
  name: string;
  icon: IconName;
  instruments: string[];
  instrumentSlugs: string[];
  teaches: string;
  formats: ('Private' | 'Group' | 'Online')[];
  bio: string;
  approach: string[];
  /** Avatar colours (semantic roles only). */
  tone: string;
}

export const instructors: Instructor[] = [
  {
    slug: 'piano-and-voice',
    name: 'Piano and voice instructor',
    icon: 'piano',
    instruments: ['Piano', 'Vocals'],
    instrumentSlugs: ['piano', 'vocals'],
    teaches: 'Kids & beginners',
    formats: ['Private', 'Online'],
    tone: 'bg-action text-on-action',
    bio: 'A patient piano and voice teacher who loves helping young students hear their first song come together.',
    approach: [
      'Short, focused lessons for younger students',
      'Reading music alongside playing by ear',
      'A practice plan families can follow at home',
    ],
  },
  {
    slug: 'guitar',
    name: 'Guitar instructor',
    icon: 'guitar',
    instruments: ['Acoustic guitar', 'Electric guitar'],
    instrumentSlugs: ['acoustic-guitar', 'electric-guitar'],
    teaches: 'Teens & adults',
    formats: ['Private', 'Group'],
    tone: 'bg-surface-inverse text-fg-inverse',
    bio: 'Guitarist and band coach focused on getting students playing real songs with other musicians early.',
    approach: ['Songs first, theory woven in', 'Small-group band sessions', 'Healthy technique from day one'],
  },
  {
    slug: 'voice-and-choir',
    name: 'Voice and choir instructor',
    icon: 'mic',
    instruments: ['Vocals'],
    instrumentSlugs: ['vocals'],
    teaches: 'All ages',
    formats: ['Private', 'Group', 'Online'],
    tone: 'bg-surface-inset text-fg',
    bio: 'Vocal coach for soloists and choirs, with a focus on breath, healthy range and harmony.',
    approach: [
      'Vocal health and warm-up routines',
      'Harmony and ensemble listening',
      'Confidence for first performances',
    ],
  },
  {
    slug: 'drums-and-bass',
    name: 'Drums and bass instructor',
    icon: 'drums',
    instruments: ['Drums & percussion', 'Bass guitar'],
    instrumentSlugs: ['drums', 'bass'],
    teaches: 'Kids, teens & adults',
    formats: ['Private', 'Group'],
    tone: 'bg-fg-muted text-fg-inverse',
    bio: 'Rhythm-section teacher who helps students feel time, play with dynamics and listen as a band.',
    approach: ['Practice-pad foundations', 'Groove and timing games', 'Playing together as a rhythm section'],
  },
];

export const instructorBySlug = (slug: string) => instructors.find((i) => i.slug === slug);

/**
 * Example instructor profiles, described by role (no names, towns or photos of people): they show
 * how a profile reads, not real instructors. The avatar renders the instrument icon.
 */
import type { IconName } from '@studio-gamo/ui/lib/icons';

export interface Instructor {
  slug: string;
  /** The role shown as the card title, e.g. "Piano and Voice Instructor". */
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
    name: 'Piano and Voice Instructor',
    icon: 'piano',
    instruments: ['Piano', 'Vocals'],
    instrumentSlugs: ['piano', 'vocals'],
    teaches: 'Kids & beginners',
    formats: ['Private', 'Online'],
    tone: 'bg-action text-on-action',
    bio: 'A patient piano and voice teacher who loves helping young students hear their first song come together.',
    approach: [
      'Short, Focused Lessons for Younger Students',
      'Reading Music alongside Playing by Ear',
      'A Practice Plan Families Can Follow at Home',
    ],
  },
  {
    slug: 'guitar',
    name: 'Guitar Instructor',
    icon: 'guitar',
    instruments: ['Acoustic guitar', 'Electric guitar'],
    instrumentSlugs: ['acoustic-guitar', 'electric-guitar'],
    teaches: 'Teens & adults',
    formats: ['Private', 'Group'],
    tone: 'bg-surface-inverse text-fg-inverse',
    bio: 'Guitarist and band coach focused on getting students playing real songs with other musicians early.',
    approach: ['Songs First, Theory Woven In', 'Small-Group Band Sessions', 'Healthy Technique from Day One'],
  },
  {
    slug: 'voice',
    name: 'Voice Instructor',
    icon: 'mic',
    instruments: ['Vocals'],
    instrumentSlugs: ['vocals'],
    teaches: 'All ages',
    formats: ['Private', 'Group', 'Online'],
    tone: 'bg-surface-inset text-fg',
    bio: 'Vocal coach for soloists and small groups, with a focus on breath, healthy range and harmony.',
    approach: [
      'Vocal Health and Warm-Up Routines',
      'Harmony and Ensemble Listening',
      'Confidence for First Performances',
    ],
  },
  {
    slug: 'drums-and-bass',
    name: 'Drums and Bass Instructor',
    icon: 'drums',
    instruments: ['Drums & percussion', 'Bass guitar'],
    instrumentSlugs: ['drums', 'bass'],
    teaches: 'Kids, teens & adults',
    formats: ['Private', 'Group'],
    tone: 'bg-fg-muted text-fg-inverse',
    bio: 'Rhythm-section teacher who helps students feel time, play with dynamics and listen as a band.',
    approach: ['Practice-Pad Foundations', 'Groove and Timing Games', 'Playing Together as a Rhythm Section'],
  },
];

export const instructorBySlug = (slug: string) => instructors.find((i) => i.slug === slug);

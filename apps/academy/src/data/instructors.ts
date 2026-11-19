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
    slug: 'piano',
    name: 'Piano Instructor',
    icon: 'piano',
    instruments: ['Piano'],
    instrumentSlugs: ['piano'],
    teaches: 'Kids & beginners',
    formats: ['Private', 'Online'],
    tone: 'bg-action text-on-action',
    bio: 'A patient piano teacher who loves helping young students hear their first song come together.',
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

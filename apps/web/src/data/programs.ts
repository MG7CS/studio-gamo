/**
 * The three interconnected Gamo Studios programs (organizational copy, not sample data), in owner order:
 * Gamo Academy, then Gamo Worship, then Gamo Production (AGENTS.md "Program order").
 */
import { siteUrl } from '@studio-gamo/ui/lib/sites';
import type { PhotoKey, PhotoRatio } from '@studio-gamo/ui/lib/images';

export interface Program {
  key: 'academy' | 'worship' | 'production';
  name: string;
  /** One-line lead; Academy's is the approved headline. */
  lead: string;
  summary: string;
  href: string;
  photo: PhotoKey;
  /** Frame ratio closest to `photo`'s own shape, for the program cards (crops as little as possible). */
  photoRatio: PhotoRatio;
  /** A landscape photo for the full-width leading card (Academy). */
  bannerPhoto?: PhotoKey;
  /** Frame ratio closest to `bannerPhoto`'s own shape. */
  bannerRatio?: PhotoRatio;
}

export const programs: Program[] = [
  {
    key: 'academy',
    name: 'Gamo Academy',
    lead: 'Learn to Play the Instrument You Love.',
    summary:
      'Patient, caring lessons in piano, guitar, voice, bass and drums for children, teens and adults, private or in small groups.',
    href: siteUrl('academy'),
    photo: 'girlGuitar',
    photoRatio: 'portrait',
    bannerPhoto: 'guitarMentor',
    bannerRatio: 'landscape',
  },
  {
    key: 'worship',
    name: 'Gamo Worship',
    lead: 'Prepared musicians for every service.',
    summary:
      'Vetted worship musicians who help churches keep Sunday services and special gatherings going, with musician pay always shown as its own line item.',
    href: siteUrl('worship'),
    photo: 'worshipBand',
    photoRatio: 'square',
  },
  {
    key: 'production',
    name: 'Gamo Production',
    lead: 'Clear sound, light and livestreams.',
    summary:
      'Practical audio, livestream and lighting support, a proposed software area for church websites, apps and email, and hands-on training for the church volunteers behind the board.',
    href: siteUrl('production'),
    photo: 'soundEngineer',
    photoRatio: 'square',
  },
];

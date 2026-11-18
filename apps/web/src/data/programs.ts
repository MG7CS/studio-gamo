/**
 * The three interconnected Gamo Studios programs (organizational copy, not sample data), in owner order:
 * Gamo Academy, then Gamo Worship, then Gamo Production (AGENTS.md "Program order").
 */
import { siteUrl } from '@studio-gamo/ui/lib/sites';
import type { PhotoKey } from '@studio-gamo/ui/lib/images';

export interface Program {
  key: 'academy' | 'worship' | 'production';
  name: string;
  /** One-line lead; Academy's is the approved headline. */
  lead: string;
  summary: string;
  href: string;
  photo: PhotoKey;
  /** A photo that crops to the wide ratio, for the leading card (Academy). */
  bannerPhoto?: PhotoKey;
}

export const programs: Program[] = [
  {
    key: 'academy',
    name: 'Gamo Academy',
    lead: 'Learn to Play the Instrument You Love.',
    summary:
      'Patient, caring lessons in piano, guitar, voice, bass and drums for children, teens and adults, private or in small groups.',
    href: siteUrl('academy'),
    photo: 'instrumentUkulele',
    bannerPhoto: 'instrumentMusicTheory',
  },
  {
    key: 'worship',
    name: 'Gamo Worship',
    lead: 'Prepared musicians for every service.',
    summary:
      'Vetted worship musicians who help churches keep Sunday services and special gatherings going, with musician pay always shown as its own line item.',
    href: siteUrl('worship'),
    photo: 'musicianChoir',
  },
  {
    key: 'production',
    name: 'Gamo Production',
    lead: 'Clear sound, light and livestreams.',
    summary:
      'Practical audio, livestream and lighting support, with hands-on training for the church volunteers behind the board.',
    href: siteUrl('production'),
    photo: 'techAudio',
  },
];

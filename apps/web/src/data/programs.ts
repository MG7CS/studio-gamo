/** The four connected Gamo Studios programs (organizational copy, not sample data). */
import { siteUrl } from '@studio-gamo/ui/lib/sites';
import type { PhotoKey } from '@studio-gamo/ui/lib/images';
import type { IconName } from '@studio-gamo/ui/lib/icons';

export interface Program {
  key: 'worship' | 'academy' | 'live' | 'production';
  name: string;
  short: string;
  summary: string;
  href: string;
  photo: PhotoKey;
  icon: IconName;
  accent: string;
}

export const programs: Program[] = [
  {
    key: 'worship', name: 'Gamo Worship', short: 'Musicians for any occasion',
    summary: 'Vetted worship musicians for services, concerts and events. Musician pay is always its own line item.',
    href: siteUrl('worship'), photo: 'worshipBand', icon: 'music', accent: 'var(--color-tan)',
  },
  {
    key: 'academy', name: 'Gamo Academy', short: 'Learn to Play the Instrument You Love.',
    summary: 'Music lessons for anyone, taught by caring instructors. Classes can be sponsored by a church or organization.',
    href: siteUrl('academy'), photo: 'boyGuitar', icon: 'school', accent: 'var(--color-sand)',
  },
  {
    key: 'live', name: 'Gamo Live', short: 'Christian events nationwide',
    summary: 'Find and share worship nights, concerts and gatherings across the country. Sponsored content is always labeled.',
    href: siteUrl('web', '/live'), photo: 'worshipNight', icon: 'calendar', accent: 'color-mix(in srgb, var(--color-terracotta-soft) 35%, var(--color-cream))',
  },
  {
    key: 'production', name: 'Gamo Production', short: 'Sound, light and media',
    summary: 'Technical guidance and production support so churches can serve their gatherings with clarity.',
    href: siteUrl('production'), photo: 'soundEngineer', icon: 'video', accent: 'var(--color-line)',
  },
];

/** The four interconnected Gamo Studios programs (organizational copy, not sample data). */
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
    key: 'worship', name: 'Gamo Worship', short: 'Find and request skilled worship musicians',
    summary: 'A vetted collection of worship musicians helping churches keep Sunday services and special gatherings going, with musician pay always shown as its own line item.',
    href: siteUrl('worship'), photo: 'worshipBand', icon: 'music', accent: 'var(--color-tan)',
  },
  {
    key: 'academy', name: 'Gamo Academy', short: 'Learn to play the instrument you love',
    summary: 'Music lessons for students and families, taught by caring instructors, with community and church-hosted programs being planned.',
    href: siteUrl('academy'), photo: 'boyGuitar', icon: 'school', accent: 'var(--color-sand)',
  },
  {
    key: 'live', name: 'Gamo Live', short: 'Discover Christian events nationwide',
    summary: 'A place to share and discover worship nights, concerts and Christian community events across the country, with sponsored content always labeled.',
    href: siteUrl('web', '/live'), photo: 'worshipNight', icon: 'calendar', accent: 'color-mix(in srgb, var(--color-terracotta-soft) 35%, var(--color-cream))',
  },
  {
    key: 'production', name: 'Gamo Production', short: 'Sound, light and media support',
    summary: 'Technical guidance and production support that helps churches and ministries serve their gatherings with clarity and care.',
    href: siteUrl('production'), photo: 'soundEngineer', icon: 'video', accent: 'var(--color-line)',
  },
];

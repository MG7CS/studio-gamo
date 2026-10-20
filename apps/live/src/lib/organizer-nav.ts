import type { IconName } from '@studio-gamo/ui/lib/icons';

export type OrganizerNavKey = 'overview' | 'events' | 'organization' | 'settings';

export interface OrganizerNavItem {
  key: OrganizerNavKey;
  label: string;
  shortLabel: string;
  href: string;
  icon: IconName;
  group: 'Menu' | 'You';
}

/** Only screens that exist are listed; each new organizer screen adds its item when it ships. */
export const ORGANIZER_NAV: OrganizerNavItem[] = [
  {
    key: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    href: '/organizer',
    icon: 'home',
    group: 'Menu',
  },
  {
    key: 'events',
    label: 'Events',
    shortLabel: 'Events',
    href: '/organizer/events',
    icon: 'calendar',
    group: 'Menu',
  },
  {
    key: 'organization',
    label: 'Organization',
    shortLabel: 'Organization',
    href: '/organizer/organization',
    icon: 'building',
    group: 'Menu',
  },
  {
    key: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    href: '/organizer/settings',
    icon: 'settings',
    group: 'You',
  },
];

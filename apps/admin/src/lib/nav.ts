/**
 * The admin navigation: exactly the screens that exist. A screen is added here in the same change that adds
 * its page; the list never advertises anything unbuilt. A badge is drawn only for a count that was read from
 * the database and is above zero.
 */
import type { IconName } from '@studio-gamo/ui/lib/icons';
import type { QueueCounts } from './inbox';

export type NavKey =
  | 'overview'
  | 'participation'
  | 'churches'
  | 'providers'
  | 'events'
  | 'organizations'
  | 'catalog'
  | 'maintenance'
  | 'legal';

export interface NavItem {
  key: NavKey;
  label: string;
  /** One short word for the phone's bottom tab bar. */
  shortLabel: string;
  href: string;
  icon: IconName;
  /** Which queue count (if any) this item shows. `live` is the sum of the three Gamo Live queues. */
  count?: keyof QueueCounts | 'live';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'overview', label: 'Overview', shortLabel: 'Overview', href: '/', icon: 'home' },
  {
    key: 'participation',
    label: 'Participation requests',
    shortLabel: 'Requests',
    href: '/participation',
    icon: 'mail',
    count: 'participation',
  },
  {
    key: 'churches',
    label: 'Church verification',
    shortLabel: 'Church',
    href: '/churches',
    icon: 'church',
    count: 'churches',
  },
  {
    key: 'providers',
    label: 'Provider review',
    shortLabel: 'Providers',
    href: '/providers',
    icon: 'verified',
    count: 'providers',
  },
  {
    key: 'events',
    label: 'Event review',
    shortLabel: 'Events',
    href: '/events',
    icon: 'ticket',
    count: 'events',
  },
  {
    key: 'organizations',
    label: 'Organizations',
    shortLabel: 'Orgs',
    href: '/organizations',
    icon: 'building',
    count: 'organizations',
  },
  {
    key: 'catalog',
    label: 'Catalog',
    shortLabel: 'Catalog',
    href: '/catalog',
    icon: 'list',
    count: 'catalog',
  },
  {
    key: 'maintenance',
    label: 'Live cleanup',
    shortLabel: 'Cleanup',
    href: '/maintenance',
    icon: 'settings',
  },
  { key: 'legal', label: 'Legal', shortLabel: 'Legal', href: '/legal', icon: 'file' },
];

export function badgeFor(item: NavItem, counts: QueueCounts | null | undefined): number | null {
  if (!item.count || !counts) return null;
  const value =
    item.count === 'live' ? counts.events + counts.organizations + counts.catalog : counts[item.count];
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** The Gamo Live screens share one tab on the phone's bottom bar; the three screens switch between each other. */
export const LIVE_KEYS: readonly NavKey[] = ['events', 'organizations', 'catalog', 'maintenance'];

/** The phone tab bar: every screen except the two that live under the "Live" tab. */
export const TAB_ITEMS: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => item.key !== 'organizations' && item.key !== 'catalog' && item.key !== 'maintenance',
).map((item) =>
  item.key === 'events' ? { ...item, label: 'Gamo Live', shortLabel: 'Live', count: 'live' as const } : item,
);

/** The tab that should look selected for the current screen. */
export function tabKeyFor(current: NavKey | null): NavKey | null {
  return current && LIVE_KEYS.includes(current) ? 'events' : current;
}

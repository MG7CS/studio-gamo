/**
 * The admin navigation: exactly the screens that exist. A screen is added here in the same change that adds
 * its page; the list never advertises anything unbuilt. A badge is drawn only for a count that was read from
 * the database and is above zero.
 */
import type { IconName } from '@studio-gamo/ui/lib/icons';
import type { QueueCounts } from './inbox';

export type NavKey = 'inbox' | 'participation' | 'churches' | 'providers' | 'events' | 'legal';

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: IconName;
  /** Which queue count (if any) this item shows. */
  count?: keyof QueueCounts;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'inbox', label: 'Inbox', href: '/', icon: 'home' },
  {
    key: 'participation',
    label: 'Participation requests',
    href: '/participation',
    icon: 'mail',
    count: 'participation',
  },
  { key: 'churches', label: 'Church verification', href: '/churches', icon: 'church', count: 'churches' },
  { key: 'providers', label: 'Provider review', href: '/providers', icon: 'verified', count: 'providers' },
  { key: 'events', label: 'First-event review', href: '/events', icon: 'ticket', count: 'events' },
  { key: 'legal', label: 'Legal', href: '/legal', icon: 'file' },
];

export function badgeFor(item: NavItem, counts: QueueCounts | null | undefined): number | null {
  if (!item.count || !counts) return null;
  const value = counts[item.count];
  return Number.isInteger(value) && value > 0 ? value : null;
}

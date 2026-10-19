/**
 * The admin navigation: exactly the areas that have a working backend. Adding an item here without a real
 * page behind it is a bug; there is no "coming soon" list.
 */
import type { QueueCounts } from './queue-counts';

export type NavKey = 'participation' | 'churches' | 'providers' | 'events' | 'legal' | 'security';

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  /** Which queue count (if any) this item shows. */
  count?: keyof QueueCounts;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'participation', label: 'Participation requests', href: '/participation', count: 'participation' },
  { key: 'churches', label: 'Church verification', href: '/review/churches', count: 'churches' },
  { key: 'providers', label: 'Provider review', href: '/review/providers', count: 'providers' },
  { key: 'events', label: 'First-event review', href: '/review/events', count: 'events' },
  { key: 'legal', label: 'Legal', href: '/legal' },
  { key: 'security', label: 'Password & security', href: '/security' },
];

/** A badge appears only for a count that was read successfully and is above zero. */
export function badgeFor(item: NavItem, counts: QueueCounts | null | undefined): number | null {
  if (!item.count || !counts) return null;
  const value = counts[item.count];
  return Number.isInteger(value) && value > 0 ? value : null;
}

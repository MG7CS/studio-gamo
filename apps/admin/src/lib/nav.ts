/**
 * The admin's structure. Four areas live in the sidebar and the phone tab bar; the screens of an area are tabs inside
 * it (shared chips with real counts), not menu items of their own. A screen is added here in the same change that
 * adds its page; nothing unbuilt is advertised. A badge or a tab count is drawn only for a number that was read from
 * the database and is above zero.
 *
 *   Overview   the home: what is waiting and what is scheduled
 *   Community  participation requests, church verification, provider review (the people of the programs)
 *   Gamo Live  event review, organizations, catalog, cleanup
 *   Legal      the registry of documents and acceptances
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

export type SectionKey = 'overview' | 'community' | 'live' | 'legal';

/** One screen of an area. `count` names the queue whose size it shows. */
export interface NavTab {
  key: NavKey;
  label: string;
  href: string;
  count?: keyof QueueCounts;
}

export interface NavSection {
  key: SectionKey;
  label: string;
  /** One short word for the phone's bottom tab bar. */
  shortLabel: string;
  icon: IconName;
  /** Where the area opens: its first screen. */
  href: string;
  tabs: readonly NavTab[];
}

export const SECTIONS: readonly NavSection[] = [
  {
    key: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    icon: 'home',
    href: '/',
    tabs: [{ key: 'overview', label: 'Overview', href: '/' }],
  },
  {
    key: 'community',
    label: 'Community',
    shortLabel: 'Community',
    icon: 'church',
    href: '/participation',
    tabs: [
      {
        key: 'participation',
        label: 'Participation requests',
        href: '/participation',
        count: 'participation',
      },
      { key: 'churches', label: 'Church verification', href: '/churches', count: 'churches' },
      { key: 'providers', label: 'Provider review', href: '/providers', count: 'providers' },
    ],
  },
  {
    key: 'live',
    label: 'Gamo Live',
    shortLabel: 'Live',
    icon: 'ticket',
    href: '/events',
    tabs: [
      { key: 'events', label: 'Event review', href: '/events', count: 'events' },
      { key: 'organizations', label: 'Organizations', href: '/organizations', count: 'organizations' },
      { key: 'catalog', label: 'Catalog', href: '/catalog', count: 'catalog' },
      { key: 'maintenance', label: 'Cleanup', href: '/maintenance' },
    ],
  },
  {
    key: 'legal',
    label: 'Legal',
    shortLabel: 'Legal',
    icon: 'file',
    href: '/legal',
    tabs: [{ key: 'legal', label: 'Legal', href: '/legal' }],
  },
];

/** The area a screen belongs to (it stays selected on that screen's detail pages too). */
export function sectionOf(current: NavKey | null): NavSection | null {
  return SECTIONS.find((s) => s.tabs.some((t) => t.key === current)) ?? null;
}

const valid = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

/** How many tabs' queues are waiting in total, or null when nothing is (or the counts could not be read). */
export function sectionBadge(section: NavSection, counts: QueueCounts | null | undefined): number | null {
  if (!counts) return null;
  const total = section.tabs.reduce(
    (sum, t) => sum + (t.count && valid(counts[t.count]) ? counts[t.count] : 0),
    0,
  );
  return total > 0 ? total : null;
}

/** One tab's own count, or null. */
export function tabCount(tab: NavTab, counts: QueueCounts | null | undefined): number | null {
  if (!tab.count || !counts) return null;
  const value = counts[tab.count];
  return valid(value) ? value : null;
}

/**
 * Admin navigation: the one place the areas of the staff dashboard are listed. `AdminLayout` turns it into
 * the shared shell's navigation; pages name their entry with `current`.
 */
import type { Workspace } from '@studio-gamo/ui/lib/dashboard';
import type { IconName } from '@studio-gamo/ui/lib/icons';

export type NavKey =
  | 'home'
  | 'forms'
  | 'submissions'
  | 'roster'
  | 'requests'
  | 'invoices'
  | 'security'
  | 'legal';

export interface NavItem {
  label: string;
  href: string;
  key: NavKey;
  icon: IconName;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', href: '/', key: 'home', icon: 'home' },
  { label: 'Submissions', href: '/submissions', key: 'submissions', icon: 'clipboard' },
  { label: 'Forms', href: '/forms', key: 'forms', icon: 'file' },
  { label: 'Roster', href: '/roster', key: 'roster', icon: 'users' },
  { label: 'Requests', href: '/requests', key: 'requests', icon: 'church' },
  { label: 'Invoices', href: '/invoices', key: 'invoices', icon: 'wallet' },
  { label: 'Security', href: '/security', key: 'security', icon: 'lock' },
  { label: 'Legal', href: '/legal', key: 'legal', icon: 'shield' },
];

/** The key's slug in the shared shell navigation (`''` is the home page). */
export const navSlug = (key: NavKey): string => (key === 'home' ? '' : key);

/**
 * The navigation in the shape the shared `DashboardShell` takes. There are no per-program workspaces:
 * admin is the one dashboard, so this is a single group.
 */
export const SHELL_WORKSPACE: Workspace = {
  id: 'admin',
  site: 'admin',
  basePath: '',
  program: 'Internal Operations',
  name: 'Gamo Studios Operations',
  role: 'Staff',
  permission: 'Staff sign-in required',
  staff: true,
  nav: [{ items: NAV_ITEMS.map((item) => ({ slug: navSlug(item.key), label: item.label, icon: item.icon })) }],
  screens: [],
};

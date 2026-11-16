/**
 * Gamo Studios Operations (admin) shell manifest: the routes and labels passed to the shared
 * `DashboardShell` and `ErrorPage`. Admin has no public header or footer.
 */
import type { ShellConfig } from '@studio-gamo/ui/shell';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

/** Props for `DashboardShell` (spread them: `<DashboardShell {...dashboard} …>`). */
export const dashboard = {
  homeHref: siteUrl('web', '/'),
  homeLabel: 'Gamo Studios home',
  securityHref: '/security',
  signOutHref: '/__admin_auth/logout',
} as const;

/** Brand and contact link for error pages. */
export const errorShell: Pick<ShellConfig, 'brand' | 'contactHref'> = {
  brand: { name: 'Gamo Studios Operations', href: '/' },
  contactHref: siteUrl('web', '/contact'),
};

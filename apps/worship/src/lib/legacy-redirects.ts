import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Worship URLs (public accounts, demo workspaces and moved staff tools). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/account/*', to: '/' },
  { from: '/musician/*', to: '/apply' },
  { from: '/church/*', to: '/request' },
  { from: '/opportunities', to: '/' },
  { from: '/check-in/*', to: '/' },
  { from: '/hire/*', to: '/request', status: 303 },
  { from: '/admin/*', to: () => siteUrl('admin', '/worship/placement'), status: 301 },
];

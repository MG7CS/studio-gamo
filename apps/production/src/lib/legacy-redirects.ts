import type { LegacyRedirect } from '@gamo/domain/page-middleware';

/** Retired Gamo Production URLs: public accounts, demo workspaces and the old assessment/consultation flows. */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/account/*', to: '/' },
  { from: '/crew/*', to: '/apply' },
  { from: '/client/*', to: '/request' },
  { from: '/assessment', to: '/request', status: 303 },
  { from: '/consultation/*', to: '/request', status: 303 },
  { from: '/contact', to: '/request', status: 303 },
];

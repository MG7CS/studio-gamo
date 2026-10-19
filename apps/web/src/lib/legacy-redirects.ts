import type { LegacyRedirect } from '@gamo/domain/page-middleware';

/** Retired gamostudio.org URLs (accounts and the partner area were removed in the rebuild). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/partner/*', to: '/contact' },
  { from: '/signin', to: '/get-started' },
  { from: '/account/*', to: '/get-started' },
];

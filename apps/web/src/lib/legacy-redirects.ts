import type { LegacyRedirect } from '@gamo/domain/page-middleware';

/** Retired gamostudio.org URLs. */
export const legacyRedirects: LegacyRedirect[] = [
  // Public accounts were retired (2026-11-16): sign-in, the account hub and inquiry history go home.
  { from: '/account/*', to: '/' },
  { from: '/signin', to: '/' },
  { from: '/partner/*', to: '/' },
  // Gamo Live was retired (2026-11-16); /live and anything below it go to the homepage.
  { from: '/live/*', to: '/' },
  // Its legal drafts were retired with it; their texts stay in git at tag four-programs-snapshot.
  { from: '/legal/ticket-terms', to: '/legal' },
  { from: '/legal/organizer-terms', to: '/legal' },
];

import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { safeReturnPath } from '@gamo/auth/page-access';

/** Retired gamostudio.org URLs. */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/partner/*', to: '/account/inquiries' },
  // Gamo Live was retired (2026-11-16); /live and anything below it go to the homepage.
  { from: '/live/*', to: '/' },
  {
    from: '/signin',
    to: (url) => {
      const next = url.searchParams.get('next');
      return next ? `/account/signin?next=${encodeURIComponent(safeReturnPath(next))}` : '/account/signin';
    },
  },
];

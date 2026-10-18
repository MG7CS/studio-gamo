import type { LegacyRedirect } from '@gamo/domain/src/api/page-middleware';
import { safeReturnPath } from '@gamo/auth/page-access';

/** Retired gamostudio.org URLs. */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/partner/*', to: '/account/inquiries' },
  {
    from: '/signin',
    to: (url) => {
      const next = url.searchParams.get('next');
      return next ? `/account/signin?next=${encodeURIComponent(safeReturnPath(next))}` : '/account/signin';
    },
  },
];

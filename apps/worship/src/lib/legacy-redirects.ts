import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { inquiryUrl, siteUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Worship URLs (demo flows and moved staff tools). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/hire/*', to: () => inquiryUrl('Church musician request') },
  { from: '/apply/*', to: () => inquiryUrl('Musician application') },
  { from: '/church/roster', to: '/church/musicians', status: 301 },
  { from: '/admin/*', to: () => siteUrl('admin', '/worship/placement'), status: 301 },
];

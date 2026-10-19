import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { providerSignupUrl, siteUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Worship URLs (demo flows and moved staff tools). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/hire/*', to: () => providerSignupUrl('worship', 'church'), status: 303 },
  { from: '/apply/*', to: () => providerSignupUrl('worship', 'musician'), status: 303 },
  { from: '/church/roster', to: '/church/musicians', status: 301 },
  // Former fake confirmation pages: online check-in is not available yet.
  { from: '/check-in/success', to: '/musician' },
  { from: '/check-in/standby-notified', to: '/musician' },
  { from: '/admin/*', to: () => siteUrl('admin', '/worship/placement'), status: 301 },
];

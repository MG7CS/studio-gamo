import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { providerSignupUrl, siteUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Academy URLs (demo flows and the old dashboard entry). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/register', to: () => siteUrl('academy', '/lessons'), status: 303 },
  { from: '/host-apply', to: () => providerSignupUrl('academy', 'church'), status: 303 },
  { from: '/dashboard', to: '/family', status: 301 },
];

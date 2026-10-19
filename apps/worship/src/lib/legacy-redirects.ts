import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { providerSignupUrl, siteUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Worship URLs (accounts, workspaces and demo flows were removed in the rebuild). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/hire/*', to: () => providerSignupUrl('worship', 'church'), status: 303 },
  { from: '/apply/*', to: () => providerSignupUrl('worship', 'musician'), status: 303 },
  { from: '/church/*', to: () => providerSignupUrl('worship', 'church') },
  { from: '/musician/*', to: () => providerSignupUrl('worship', 'musician') },
  { from: '/check-in/*', to: '/' },
  { from: '/account/*', to: '/' },
  { from: '/admin/*', to: () => siteUrl('admin', '/worship/placement'), status: 301 },
];

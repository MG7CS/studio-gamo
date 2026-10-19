import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { inquiryUrl, providerSignupUrl, siteUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Academy URLs (accounts, workspaces and registration were removed in the rebuild). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/register/*', to: () => inquiryUrl('Lesson interest'), status: 303 },
  { from: '/registrations/*', to: () => siteUrl('academy', '/lessons') },
  { from: '/host-apply', to: () => providerSignupUrl('academy', 'church'), status: 303 },
  { from: '/host/*', to: () => providerSignupUrl('academy', 'church') },
  { from: '/instructor/*', to: () => providerSignupUrl('academy', 'teacher') },
  { from: '/family/*', to: () => siteUrl('academy', '/lessons') },
  { from: '/dashboard', to: '/', status: 301 },
  { from: '/account/*', to: '/' },
];

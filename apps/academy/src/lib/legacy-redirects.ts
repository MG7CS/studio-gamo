import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { siteUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Academy URLs (demo flows, the old dashboard entry and public accounts). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/register', to: () => siteUrl('academy', '/lessons'), status: 303 },
  { from: '/host-apply', to: () => siteUrl('web', '/contact'), status: 303 },
  { from: '/dashboard', to: '/', status: 301 },
  // Public accounts and the demo family/instructor/host workspaces were retired (2026-11-16).
  { from: '/account/*', to: '/' },
  { from: '/family/*', to: '/' },
  { from: '/instructor/*', to: '/' },
  { from: '/host/*', to: '/' },
];

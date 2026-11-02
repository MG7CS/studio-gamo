import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { inquiryUrl, siteUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Production URLs (accounts, workspaces and the demo flows were removed in the rebuild). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/assessment', to: () => inquiryUrl('Production consultation'), status: 303 },
  { from: '/consultation/*', to: () => inquiryUrl('Production consultation'), status: 303 },
  { from: '/contact', to: () => inquiryUrl('Production consultation'), status: 303 },
  { from: '/client/*', to: () => inquiryUrl('Production consultation') },
  { from: '/crew/*', to: () => inquiryUrl('Production crew application') },
  { from: '/account/*', to: '/' },
  // Training is taught through Gamo Academy; the separate training page was removed.
  { from: '/training', to: () => siteUrl('academy', '/#production-training') },
];

import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { inquiryUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Production URLs: the assessment and consultation demo flows. */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/assessment', to: () => inquiryUrl('Production consultation'), status: 303 },
  { from: '/consultation/*', to: () => inquiryUrl('Production consultation'), status: 303 },
  { from: '/contact', to: () => inquiryUrl('Production consultation'), status: 303 },
];

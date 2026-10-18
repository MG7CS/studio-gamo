import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { inquiryUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Academy URLs (demo flows and the old dashboard entry). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/register', to: () => inquiryUrl('Lesson interest') },
  { from: '/host-apply', to: () => inquiryUrl('Church-hosted lessons') },
  { from: '/dashboard', to: '/family', status: 301 },
];

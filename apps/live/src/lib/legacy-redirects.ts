import type { LegacyRedirect } from '@gamo/domain/page-middleware';
import { inquiryUrl } from '@studio-gamo/ui/lib/sites';

/** Retired Gamo Live URLs (accounts, organizer tools and ticketing were removed in the rebuild). */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/promote/*', to: () => inquiryUrl('Event listing'), status: 303 },
  { from: '/organizer/*', to: () => inquiryUrl('Event listing') },
  { from: '/artist/*', to: '/artists' },
  { from: '/agent/*', to: '/artists' },
  { from: '/me/*', to: '/events' },
  { from: '/workspaces', to: '/events' },
  { from: '/account/*', to: '/events' },
  { from: '/tickets/*', to: '/events' },
  { from: '/ticket', to: '/events' },
  { from: '/my-tickets', to: '/events', status: 301 },
  { from: '/waitlist/*', to: '/events' },
  { from: '/scan/*', to: '/events' },
  { from: '/checkout', to: '/events', status: 301 },
  { from: /^\/events\/([^/]+)\/(tickets|register)$/, to: (_url, m) => `/events/${m?.[1] ?? ''}` },
  {
    from: /^\/organizers\/([^/]+)$/,
    to: (_url, m) => {
      const q = decodeURIComponent(m?.[1] ?? '')
        .trim()
        .replace(/-/g, ' ');
      return q ? `/events?q=${encodeURIComponent(q)}` : '/events';
    },
    status: 303,
  },
];

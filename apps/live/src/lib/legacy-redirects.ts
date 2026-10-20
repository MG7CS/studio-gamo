import type { LegacyRedirect } from '@gamo/domain/page-middleware';

/** Retired Gamo Live URLs (the old organizer tools, ticketing and account pages were replaced in the rebuild). */
export const legacyRedirects: LegacyRedirect[] = [
  // The old Promote flow lives on as the Promote page and the organizer area.
  { from: '/promote/create', to: '/promote', status: 303 },
  { from: '/promote/status', to: '/organizer' },
  { from: '/promote/events', to: '/organizer' },
  { from: '/workspaces', to: '/organizer' },
  { from: '/organizer/scan', to: '/organizer' },
  { from: '/artist/*', to: '/artists' },
  { from: '/agent/*', to: '/artists' },
  { from: '/me/*', to: '/events' },
  // Old account pages that no longer exist (sign-in, sign-up and signed-out are real pages again).
  { from: '/account/verify', to: '/account/signin' },
  { from: '/account/recover', to: '/account/signin' },
  { from: '/account/sso-callback', to: '/account/signin' },
  { from: '/account/access-denied', to: '/account/signin' },
  { from: '/account/profile', to: '/organizer/account' },
  { from: '/account/onboarding', to: '/organizer/start' },
  { from: '/account', to: '/organizer' },
  { from: '/tickets/*', to: '/events' },
  { from: '/ticket', to: '/events' },
  { from: '/my-tickets', to: '/events', status: 301 },
  { from: '/waitlist/*', to: '/events' },
  { from: '/scan/*', to: '/events' },
  { from: '/checkout', to: '/events', status: 301 },
  { from: /^\/events\/([^/]+)\/tickets$/, to: (_url, m) => `/events/${m?.[1] ?? ''}` },
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

import type { LegacyRedirect } from '@gamo/domain/page-middleware';

/** Retired Gamo Live URLs: per-role dashboards (now /workspaces) and old ticket/organizer paths. */
export const legacyRedirects: LegacyRedirect[] = [
  { from: '/promote', to: '/promote/create', status: 303 },
  { from: '/promote/status', to: '/workspaces' },
  { from: '/organizer/events/new', to: '/promote/create', status: 303 },
  { from: '/organizer/*', to: '/workspaces' },
  { from: '/artist/*', to: '/workspaces' },
  { from: '/agent/*', to: '/workspaces' },
  { from: '/me/*', to: '/workspaces' },
  { from: '/ticket', to: '/my-tickets' },
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

import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: organizer/artist/agent workspaces, ticketing and checkout, Promote Event flow.
// Public event, venue, artist and organizer pages stay open.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'live',
      privatePaths: [
        '/promote',
        '/my-tickets',
        '/ticket',
        '/checkout',
        '/workspaces',
        '/organizer/',
        '/organizer$',
        '/artist/',
        '/artist$',
        '/agent/',
        '/agent$',
        '/me/',
        '/me$',
        '/events/*/tickets',
        '/events/*/register',
      ],
    }),
  );

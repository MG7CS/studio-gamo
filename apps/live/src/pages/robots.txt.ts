import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// /api/ and /account stay disallowed for every crawler; registration and manage pages are personal.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'live',
      privatePaths: ['/registrations/', '/events/*/register', '/organizer'],
    }),
  );

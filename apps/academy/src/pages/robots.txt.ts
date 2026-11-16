import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: /register and /host-apply redirect elsewhere; guest registrations are private.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'academy',
      privatePaths: [
        '/register',
        '/host-apply',
        // Guest registration receipts, emailed-link landing and the private manage page (customer cookie).
        '/registrations',
      ],
    }),
  );

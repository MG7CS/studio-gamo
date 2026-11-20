import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: /host-apply redirects elsewhere; guest registrations are private.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'academy',
      privatePaths: [
        '/host-apply',
        // Guest registration receipts, emailed-link landing and the private manage page (customer cookie).
        '/registrations',
      ],
    }),
  );

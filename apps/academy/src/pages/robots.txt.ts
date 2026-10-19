import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: family/instructor/host workspaces and dashboard. /register and /host-apply redirect to the web inquiry form.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'academy',
      privatePaths: [
        '/family/',
        '/family$',
        '/instructor/',
        '/instructor$',
        '/host/',
        '/host$',
        '/dashboard',
        '/register',
        '/host-apply',
        // Guest registration receipts, emailed-link landing and the private manage page (customer cookie).
        '/registrations',
      ],
    }),
  );

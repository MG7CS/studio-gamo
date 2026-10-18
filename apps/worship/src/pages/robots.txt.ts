import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: church/musician workspaces, check-in, staff admin. /apply and /hire are transactional flows that redirect to the web inquiry form.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'worship',
      privatePaths: [
    '/church',
    '/musician',
    '/check-in',
    '/admin',
    '/apply',
    '/hire',
      ],
    }),
  );

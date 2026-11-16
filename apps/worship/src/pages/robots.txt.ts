import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: staff admin only (it redirects to the admin app). /hire is a retired flow that redirects to /request.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'worship',
      privatePaths: ['/admin', '/hire'],
    }),
  );

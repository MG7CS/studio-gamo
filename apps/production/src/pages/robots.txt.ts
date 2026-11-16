import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Assessment, consultation and contact are retired flows that redirect to /request.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'production',
      privatePaths: ['/assessment', '/consultation', '/contact'],
    }),
  );

import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// No product areas exist during the rebuild; /api/ and /account stay disallowed for every crawler.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'academy',
      privatePaths: [],
    }),
  );

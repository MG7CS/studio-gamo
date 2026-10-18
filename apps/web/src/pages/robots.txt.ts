import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: partner workspace, legacy /signin redirect, design previews.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'web',
      privatePaths: [
    '/partner/',
      '/partner$',
    '/signin',
    '/preview/',
      ],
    }),
  );

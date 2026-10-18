import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: client and crew workspaces. Assessment, consultation and contact redirect to the web inquiry form.
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'production',
      privatePaths: [
    '/client/',
      '/client$',
    '/crew/',
      '/crew$',
    '/assessment',
    '/consultation',
    '/contact',
      ],
    }),
  );

import type { APIRoute } from 'astro';
import { buildRobotsTxt, textResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

// Private: design previews and emailed offer links (the token is in the URL). (Retired /partner, /signin and /account URLs redirect home.)
export const GET: APIRoute = () =>
  textResponse(
    buildRobotsTxt({
      app: 'web',
      privatePaths: ['/preview/', '/worship/offers/'],
    }),
  );

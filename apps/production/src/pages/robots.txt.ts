import { robotsRoute } from '@gamo/site/lib/crawlers';

export const prerender = false;

// /api/ and /account stay disallowed for every crawler.
export const GET = robotsRoute('production');

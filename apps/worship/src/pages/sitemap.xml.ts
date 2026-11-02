import { sitemapRoute } from '@gamo/site/lib/crawlers';

export const prerender = false;

export const GET = sitemapRoute('worship', [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/opportunities', priority: '0.8', changefreq: 'weekly' },
]);

import { sitemapRoute } from '@gamo/site/lib/crawlers';
import { supportAreas } from '../data/production';

export const prerender = false;

export const GET = sitemapRoute('production', [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/services', priority: '0.9', changefreq: 'monthly' },
  ...supportAreas.map((a) => ({
    path: `/services/${a.slug}`,
    priority: '0.8',
    changefreq: 'monthly' as const,
  })),
]);

import type { APIRoute } from 'astro';
import { buildSitemapXml, xmlResponse } from '@studio-gamo/ui/lib/crawlers';
import { supportAreas } from '../data/production';

export const prerender = false;

export const GET: APIRoute = () =>
  xmlResponse(
    buildSitemapXml('production', [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/services', priority: '0.9', changefreq: 'monthly' },
      { path: '/training', priority: '0.8', changefreq: 'monthly' },
      ...supportAreas.map((a) => ({ path: `/services/${a.slug}`, priority: '0.8', changefreq: 'monthly' as const })),
    ]),
  );

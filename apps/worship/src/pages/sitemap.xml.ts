import type { APIRoute } from 'astro';
import { buildSitemapXml, xmlResponse } from '@studio-gamo/ui/lib/crawlers';

export const prerender = false;

export const GET: APIRoute = () =>
  xmlResponse(
    buildSitemapXml('worship', [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/opportunities', priority: '0.8', changefreq: 'weekly' },
    ]),
  );

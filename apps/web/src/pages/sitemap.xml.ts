import type { APIRoute } from 'astro';
import { buildSitemapXml, xmlResponse } from '@studio-gamo/ui/lib/crawlers';
import { TERMS_DOCUMENTS } from '@gamo/domain/terms';

export const prerender = false;

export const GET: APIRoute = () =>
  xmlResponse(
    buildSitemapXml('web', [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/mission', priority: '0.8', changefreq: 'monthly' },
      { path: '/get-started', priority: '0.8', changefreq: 'monthly' },
      { path: '/get-involved', priority: '0.8', changefreq: 'monthly' },
      { path: '/partners', priority: '0.8', changefreq: 'monthly' },
      { path: '/live', priority: '0.8', changefreq: 'monthly' },
      { path: '/support', priority: '0.8', changefreq: 'monthly' },
      { path: '/faq', priority: '0.8', changefreq: 'monthly' },
      { path: '/contact', priority: '0.8', changefreq: 'monthly' },
      { path: '/partners/interest', priority: '0.8', changefreq: 'monthly' },
      { path: '/legal', priority: '0.3', changefreq: 'yearly' },
      ...TERMS_DOCUMENTS.map((doc) => ({ path: doc.path, priority: '0.3', changefreq: 'yearly' as const })),
    ]),
  );

import type { APIRoute } from 'astro';
import { buildSitemapXml, xmlResponse } from '@studio-gamo/ui/lib/crawlers';
import { instruments } from '../data/instruments';
import { lessons } from '../data/lessons';
import { instructors } from '../data/instructors';

export const prerender = false;

export const GET: APIRoute = () =>
  xmlResponse(
    buildSitemapXml('academy', [
      { path: '/', priority: '1.0', changefreq: 'weekly' },
      { path: '/instruments', priority: '0.9', changefreq: 'monthly' },
      { path: '/lessons', priority: '0.9', changefreq: 'monthly' },
      { path: '/sponsored', priority: '0.7', changefreq: 'monthly' },
      ...instruments.map((i) => ({
        path: `/instruments/${i.slug}`,
        priority: '0.8',
        changefreq: 'monthly' as const,
      })),
      ...lessons.map((l) => ({
        path: `/lessons/${l.slug}`,
        priority: '0.8',
        changefreq: 'monthly' as const,
      })),
      ...instructors.map((i) => ({
        path: `/instructors/${i.slug}`,
        priority: '0.6',
        changefreq: 'monthly' as const,
      })),
    ]),
  );

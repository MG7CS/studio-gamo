import type { APIRoute } from 'astro';
import { getDb } from '@gamo/db';
import {
  LiveService,
  getRuntimeEnv,
  GAMO_LIVE_METROS,
} from '@gamo/domain';

export const prerender = false;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async (context) => {
  const reqOrigin = new URL(context.request.url).origin;
  const siteBase =
    reqOrigin.includes('127.0.0.1') || reqOrigin.includes('localhost')
      ? reqOrigin
      : 'https://live.gamostudio.org';

  let publishedSlugs: Array<{ slug: string; lastMod?: string }>;

  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const liveService = new LiveService(getDb(runtimeEnv.DB));
    await liveService.ensureVerifiedCatalogSeeded();
    const publishedEvents = await liveService.listDiscoverableEvents({ limit: 200 });

    publishedSlugs = publishedEvents
      .filter(
        (evt) =>
          evt.status === 'approved' &&
          (evt.listingType !== 'external_discovery' || evt.editorialStatus === 'published')
      )
      .map((evt) => {
        // Real dates only: last verification, else record creation. No date means no <lastmod>.
        const source = evt.lastVerifiedAt ?? evt.createdAt;
        const date = source ? new Date(source) : null;
        return {
          slug: evt.slug,
          lastMod: date && Number.isFinite(date.getTime()) ? date.toISOString().split('T')[0] : undefined,
        };
      });
  } catch {
    publishedSlugs = [];
  }

  const staticPaths = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/events', priority: '0.9', changefreq: 'daily' },
    { path: '/venues', priority: '0.8', changefreq: 'weekly' },
    { path: '/artists', priority: '0.7', changefreq: 'weekly' },
  ];

  const metroPaths = GAMO_LIVE_METROS.map((metro) => ({
    path: `/events/${metro.slug}`,
    priority: metro.isPrimaryLaunchMarket ? '0.9' : '0.8',
    changefreq: 'daily',
  }));

  const urlsXml: string[] = [];

  for (const item of [...staticPaths, ...metroPaths]) {
    urlsXml.push(
      `  <url>\n    <loc>${escapeXml(`${siteBase}${item.path}`)}</loc>\n    <changefreq>${item.changefreq}</changefreq>\n    <priority>${item.priority}</priority>\n  </url>`
    );
  }

  for (const evt of publishedSlugs) {
    urlsXml.push(
      `  <url>\n    <loc>${escapeXml(`${siteBase}/events/${evt.slug}`)}</loc>\n    ${evt.lastMod ? `<lastmod>${escapeXml(evt.lastMod)}</lastmod>\n    ` : ''}<changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml.join('\n')}\n</urlset>\n`;

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
    },
  });
};

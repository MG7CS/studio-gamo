import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '@gamo/config/runtime-env';
import { LiveCatalog, GAMO_LIVE_METROS } from '@gamo/domain';
import { asSqlDatabase } from '@gamo/platform/db';
import { sitemapRoute, type SitemapEntry } from '@gamo/site/lib/crawlers';

export const prerender = false;

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/events', priority: '0.9', changefreq: 'daily' },
  { path: '/venues', priority: '0.8', changefreq: 'weekly' },
  { path: '/artists', priority: '0.7', changefreq: 'weekly' },
];

async function publishedEventEntries(context: Parameters<APIRoute>[0]): Promise<SitemapEntry[]> {
  try {
    const runtimeEnv = await getRuntimeEnv(context);
    const liveService = new LiveCatalog(asSqlDatabase(runtimeEnv.LIVE_DB));
    const events = await liveService.listDiscoverableEvents({ limit: 200 });
    return events
      .filter(
        (evt) =>
          evt.status === 'approved' &&
          (evt.listingType !== 'external_discovery' || evt.editorialStatus === 'published'),
      )
      .map((evt) => {
        // Real dates only: last verification, else record creation. No date means no <lastmod>.
        const source = evt.lastVerifiedAt ?? evt.createdAt;
        const date = source ? new Date(source) : null;
        return {
          path: `/events/${evt.slug}`,
          priority: '0.8',
          changefreq: 'weekly' as const,
          lastmod: date && Number.isFinite(date.getTime()) ? date.toISOString().split('T')[0] : undefined,
        };
      });
  } catch {
    return [];
  }
}

async function allEntries(context: Parameters<APIRoute>[0]): Promise<SitemapEntry[]> {
  const metroEntries: SitemapEntry[] = GAMO_LIVE_METROS.map((metro) => ({
    path: `/events/${metro.slug}`,
    priority: metro.isPrimaryLaunchMarket ? '0.9' : '0.8',
    changefreq: 'daily',
  }));
  return [...STATIC_ENTRIES, ...metroEntries, ...(await publishedEventEntries(context))];
}

// Event listings change more often than the other apps' static pages, so the cache is 15 minutes.
export const GET = sitemapRoute('live', allEntries, 900);

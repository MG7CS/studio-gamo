/**
 * Crawler policy shared by every public Gamo Studios app.
 *
 * Each app serves its own /robots.txt and /sitemap.xml (they are separate origins), but the
 * bot lists and the rendering of both files live here so the policy is changed in one place.
 */
import { siteOrigin, type SiteKey } from './sites';

/** AI search / answer bots: fetch a page because a person asked an assistant about it. */
export const AI_ANSWER_BOTS = [
  'ChatGPT-User',
  'OAI-SearchBot',
  'Claude-User',
  'Claude-SearchBot',
  'Perplexity-User',
  'DuckAssistBot',
  'MistralAI-User',
  'PerplexityBot',
] as const;

/** Bots that collect content for model training. Remove a name here to stop allowing it everywhere. */
export const AI_TRAINING_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'meta-externalagent',
  'Amazonbot',
] as const;

/** Paths no app should ever expose to crawlers. */
const COMMON_PRIVATE_PATHS = ['/api/', '/account'];

export interface RobotsOptions {
  app: SiteKey;
  /** App-specific private or transactional paths (robots.txt prefix rules, `*` wildcards allowed). */
  privatePaths: readonly string[];
  /** Origin override, mainly for tests. Defaults to the app's canonical origin. */
  origin?: string;
  /** Set false for apps that publish no sitemap. */
  sitemap?: boolean;
}

function group(userAgents: readonly string[], rules: readonly string[]): string[] {
  return [...userAgents.map((ua) => `User-agent: ${ua}`), ...rules, ''];
}

/**
 * A crawler that matches a named group ignores the `*` group entirely, so every group
 * repeats the same Allow/Disallow rules.
 */
export function buildRobotsTxt({ app, privatePaths, origin, sitemap = true }: RobotsOptions): string {
  const base = origin ?? siteOrigin(app);
  const rules = ['Allow: /', ...[...COMMON_PRIVATE_PATHS, ...privatePaths].map((p) => `Disallow: ${p}`)];
  const lines = [
    '# Gamo Studios — public marketing pages are open to search engines and AI assistants.',
    '# Account, sign-in, dashboards, checkout and API routes are not.',
    '',
    '# Traditional search engines (Googlebot, Bingbot and all other crawlers)',
    ...group(['*'], rules),
    '# AI search and answer bots: fetch a page when a person asks an assistant about it',
    ...group(AI_ANSWER_BOTS, rules),
    '# AI training crawlers: collect content for model training',
    ...group(AI_TRAINING_BOTS, rules),
  ];
  if (sitemap) lines.push(`Sitemap: ${base}/sitemap.xml`, '');
  return lines.join('\n');
}

export interface SitemapEntry {
  path: string;
  priority?: string;
  changefreq?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  lastmod?: string;
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function buildSitemapXml(app: SiteKey, entries: readonly SitemapEntry[], origin?: string): string {
  const base = origin ?? siteOrigin(app);
  const urls = entries.map((e) => {
    const parts = [`    <loc>${escapeXml(base + e.path)}</loc>`];
    if (e.lastmod) parts.push(`    <lastmod>${escapeXml(e.lastmod)}</lastmod>`);
    if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (e.priority) parts.push(`    <priority>${e.priority}</priority>`);
    return `  <url>\n${parts.join('\n')}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export const textResponse = (body: string) =>
  new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });

export const xmlResponse = (body: string) =>
  new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });

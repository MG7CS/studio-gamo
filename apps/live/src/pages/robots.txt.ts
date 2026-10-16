import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const reqOrigin = new URL(context.request.url).origin;
  const siteBase =
    reqOrigin.includes('127.0.0.1') || reqOrigin.includes('localhost')
      ? reqOrigin
      : 'https://live.gamostudio.org';

  const body = [
    'User-agent: *',
    'Allow: /',
    'Allow: /events/',
    'Allow: /venues',
    'Allow: /artists',
    'Disallow: /api/',
    'Disallow: /admin/',
    'Disallow: /promote',
    'Disallow: /promote/',
    'Disallow: /my-tickets',
    'Disallow: /account/',
    'Disallow: /workspaces',
    '',
    `Sitemap: ${siteBase}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

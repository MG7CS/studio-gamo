import { getDb } from '@gamo/db';
import { resolveAuth, hasProductAccess } from '@gamo/auth';
import { canAccessPage, isPrivatePage, isIsolatedDemo, type PublicApp } from '@gamo/auth/page-access';
import { getRuntimeEnv } from './response';

type Context = { request: Request; url: URL; locals: Record<string, any>; redirect: (path: string, status?: 302 | 303) => Response };
export function applicationPages(app: PublicApp) {
  return async (context: Context, next: () => Promise<Response>): Promise<Response> => {
    const { pathname } = context.url;
    context.locals.product = app;
    // API handlers own their contract-specific authorization and status codes.
    if (pathname.startsWith('/api/') || pathname.startsWith('/_')) return next();
    const env = await getRuntimeEnv(context);
    context.locals.runtimeEnv = env;
    context.locals.auth = null;
    context.locals.isolatedDemo = isIsolatedDemo(context.request, env);
    let unavailable = false;
    let rawAuth = null;
    try {
      if (env.DB && env.SESSION_SECRET) rawAuth = await resolveAuth(context.request, getDb(env.DB), env.SESSION_SECRET);
    } catch { unavailable = true; }
    if (rawAuth && hasProductAccess(rawAuth, app)) {
      context.locals.auth = rawAuth;
    }
    const privatePage = isPrivatePage(app, pathname);
    if (privatePage && !context.locals.isolatedDemo) {
      if (unavailable) return new Response('Account service is temporarily unavailable. Please try again.', { status: 503, headers: { 'Cache-Control': 'no-store' } });
      if (!rawAuth) return new Response(null, { status: 303, headers: { Location: `/account/signin?next=${encodeURIComponent(pathname + context.url.search)}`, 'Cache-Control': 'no-store' } });
      if (!canAccessPage(app, pathname, rawAuth)) return new Response(null, { status: 303, headers: { Location: '/account/access-denied', 'Cache-Control': 'no-store' } });
    }
    const response = await next();
    // Personalized pages and redirects must never enter a shared cache.
    response.headers.set('Cache-Control', 'private, no-store');
    if (privatePage || pathname.startsWith('/account')) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  };
}


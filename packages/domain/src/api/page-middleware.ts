import { getDb } from '@gamo/db';
import { resolveAuth, hasProductAccess, resolveProductClerkConfig } from '@gamo/auth';
import {
  canAccessPage,
  isPrivatePage,
  isIsolatedDemo,
  pageCacheControl,
  type PublicApp,
} from '@gamo/auth/page-access';
import { getRuntimeEnv } from './response';

type Context = {
  request: Request;
  url: URL;
  locals: Record<string, any>;
  redirect: (path: string, status?: 302 | 303) => Response;
};
export function applicationPages(app: PublicApp) {
  return async (context: Context, next: () => Promise<Response>): Promise<Response> => {
    const { pathname } = context.url;
    context.locals.product = app;
    // API handlers own their contract-specific authorization and status codes.
    // robots.txt, sitemap.xml and llms.txt are public crawler files and must stay cacheable.
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_') ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml' ||
      pathname === '/llms.txt'
    )
      return next();
    const env = await getRuntimeEnv(context);
    context.locals.runtimeEnv = env;
    context.locals.auth = null;
    context.locals.isolatedDemo = isIsolatedDemo(context.request, env);
    let unavailable = false;
    let rawAuth = null;
    try {
      context.locals.clerkConfig = resolveProductClerkConfig(app, env);
      if (env.DB && (env.SESSION_SECRET || context.locals.clerkConfig?.isConfigured)) {
        rawAuth = await resolveAuth(context.request, getDb(env.DB), {
          secret: env.SESSION_SECRET,
          product: app,
          env,
        });
      }
    } catch {
      unavailable = true;
    }
    if (rawAuth && hasProductAccess(rawAuth, app)) {
      context.locals.auth = rawAuth;
    }
    const privatePage = isPrivatePage(app, pathname);
    context.locals.noindexPage = privatePage || pathname.startsWith('/account');
    if (privatePage && !context.locals.isolatedDemo) {
      if (unavailable)
        return new Response('Account service is temporarily unavailable. Please try again.', {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        });
      if (!rawAuth)
        return new Response(null, {
          status: 303,
          headers: {
            Location: `/account/signin?next=${encodeURIComponent(pathname + context.url.search)}`,
            'Cache-Control': 'no-store',
          },
        });
      if (!canAccessPage(app, pathname, rawAuth))
        return new Response(null, {
          status: 303,
          headers: { Location: '/account/access-denied', 'Cache-Control': 'no-store' },
        });
    }
    const response = await next();
    response.headers.set('Cache-Control', pageCacheControl(app, pathname));
    if (privatePage || pathname.startsWith('/account'))
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  };
}

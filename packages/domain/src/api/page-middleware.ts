import { getDb } from '@gamo/db';
import { resolveAuth, hasProductAccess, resolveProductClerkConfig } from '@gamo/auth';
import {
  canAccessPage,
  isPrivatePage,
  isIsolatedDemo,
  pageCacheControl,
  type PublicApp,
} from '@gamo/auth/page-access';
import type { GamoLocals } from '@gamo/auth/locals';
import { checkEnvOnce } from '@gamo/config/env-validation';
import type { GamoEnv } from '@gamo/config/env';
import { getRuntimeEnv } from './response';
import { withSecurityHeaders, type SecurityHeaderOptions } from '../http/security-headers.ts';

type Context = {
  request: Request;
  url: URL;
  locals: GamoLocals;
  redirect: (path: string, status?: 302 | 303) => Response;
};

/**
 * A retired URL that should keep working for old links and bookmarks.
 * `from` is an exact path, a prefix ending in `/*` (which also matches the bare prefix),
 * or a RegExp tested against the path (its match is passed to `to`).
 */
export interface LegacyRedirect {
  from: string | RegExp;
  to: string | ((url: URL, match: RegExpMatchArray | null) => string);
  status?: 301 | 302 | 303 | 308;
}

export function matchLegacyRedirect(redirects: readonly LegacyRedirect[], url: URL): Response | null {
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname;
  for (const rule of redirects) {
    let match: RegExpMatchArray | null = null;
    if (rule.from instanceof RegExp) {
      match = path.match(rule.from);
      if (!match) continue;
    } else if (rule.from.endsWith('/*')) {
      const base = rule.from.slice(0, -2);
      if (path !== base && !path.startsWith(`${base}/`)) continue;
    } else if (path !== rule.from) {
      continue;
    }
    const location = typeof rule.to === 'function' ? rule.to(url, match) : rule.to;
    return new Response(null, {
      status: rule.status ?? 302,
      headers: { Location: location, 'Cache-Control': 'no-store' },
    });
  }
  return null;
}

export interface ApplicationPagesOptions {
  legacyRedirects?: readonly LegacyRedirect[];
}

/**
 * Header options for one page response: Clerk and Turnstile origins from configuration
 * (`PUBLIC_TURNSTILE_SITE_KEY` present → Turnstile allowed), geolocation for Live, plus whatever the
 * page asked for with `requestSecurityHeaders(Astro.locals, …)` (form-action origins, camera).
 */
export function pageSecurityHeaderOptions(
  app: PublicApp,
  context: { url: URL; locals: GamoLocals },
  env: GamoEnv,
  enforceCsp: boolean,
): SecurityHeaderOptions {
  const requested = context.locals.securityRequest;
  const clerk = context.locals.clerkConfig;
  return {
    clerkFrontendApi: clerk?.isConfigured ? clerk.issuer : undefined,
    enforceCsp,
    https: context.url.protocol === 'https:',
    allowGeolocation: app === 'live',
    turnstile:
      typeof env.PUBLIC_TURNSTILE_SITE_KEY === 'string' && env.PUBLIC_TURNSTILE_SITE_KEY.trim() !== '',
    formActionOrigins: requested?.formActionOrigins,
    camera: requested?.camera === true,
    noReferrer: requested?.noReferrer === true,
  };
}

export function applicationPages(app: PublicApp, options: ApplicationPagesOptions = {}) {
  const handle = async (context: Context, next: () => Promise<Response>, env: GamoEnv): Promise<Response> => {
    const { pathname } = context.url;
    context.locals.product = app;
    const misconfigured = checkEnvOnce(app, env, context.request);
    if (misconfigured) return misconfigured;
    // API handlers own their contract-specific authorization and status codes.
    // robots.txt, sitemap.xml and llms.txt are public crawler files and must stay cacheable.
    if (pathname.startsWith('/api/')) {
      // Every API answer is private unless the handler said otherwise (D-123).
      const response = await next();
      if (response.headers.has('Cache-Control')) return response;
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    if (
      pathname.startsWith('/_') ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml' ||
      pathname === '/llms.txt'
    )
      return next();
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
    // After the private-page guard, so a retired private URL still asks anonymous visitors to sign in first.
    const legacy = options.legacyRedirects && matchLegacyRedirect(options.legacyRedirects, context.url);
    if (legacy) return legacy;
    const response = await next();
    response.headers.set('Cache-Control', pageCacheControl(app, pathname));
    if (privatePage || pathname.startsWith('/account'))
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  };

  return async (context: Context, next: () => Promise<Response>): Promise<Response> => {
    const env = await getRuntimeEnv(context);
    const response = await handle(context, next, env);
    // Read after `next()`: the page's frontmatter has run and may have called requestSecurityHeaders().
    return withSecurityHeaders(
      response,
      pageSecurityHeaderOptions(app, context, env, import.meta.env?.PROD === true),
    );
  };
}

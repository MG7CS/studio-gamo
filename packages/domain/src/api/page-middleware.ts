import type { GamoLocals } from '@gamo/auth/locals';
import { checkEnvOnce } from '@gamo/config/env-validation';
import type { GamoEnv } from '@gamo/config/env';
import { getRuntimeEnv } from './response';
import { withSecurityHeaders, type SecurityHeaderOptions } from '../http/security-headers.ts';

/** The four public sites. They have no accounts or sessions (public accounts were removed 2026-11-16). */
export type PublicApp = 'web' | 'worship' | 'academy' | 'production';

/**
 * Cache-Control for rendered (non-API) pages. Pages stay private/no-store until marketing caching is
 * deliberately turned on (forms render per-request CSRF/Turnstile state).
 */
export const PAGE_CACHE_CONTROL = 'private, no-store';

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
 * Header options for one page response: Turnstile allowed when `PUBLIC_TURNSTILE_SITE_KEY` is configured,
 * plus whatever the page asked for with `requestSecurityHeaders(Astro.locals, …)` (form-action origins,
 * no-referrer).
 */
export function pageSecurityHeaderOptions(
  _app: PublicApp,
  context: { url: URL; locals: GamoLocals },
  env: GamoEnv,
  enforceCsp: boolean,
): SecurityHeaderOptions {
  const requested = context.locals.securityRequest;
  return {
    enforceCsp,
    https: context.url.protocol === 'https:',
    turnstile:
      typeof env.PUBLIC_TURNSTILE_SITE_KEY === 'string' && env.PUBLIC_TURNSTILE_SITE_KEY.trim() !== '',
    formActionOrigins: requested?.formActionOrigins,
    noReferrer: requested?.noReferrer === true,
  };
}

/** Public-site middleware: env check → legacy redirects → page → security headers. No session, no guard. */
export function applicationPages(app: PublicApp, options: ApplicationPagesOptions = {}) {
  const handle = async (context: Context, next: () => Promise<Response>, env: GamoEnv): Promise<Response> => {
    const { pathname } = context.url;
    context.locals.product = app;
    const misconfigured = checkEnvOnce(app, env, context.request);
    if (misconfigured) return misconfigured;
    // API handlers own their contract-specific status codes.
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
    // robots.txt, sitemap.xml and llms.txt are public crawler files and must stay cacheable.
    if (
      pathname.startsWith('/_') ||
      pathname === '/robots.txt' ||
      pathname === '/sitemap.xml' ||
      pathname === '/llms.txt'
    )
      return next();
    context.locals.runtimeEnv = env;
    const legacy = options.legacyRedirects && matchLegacyRedirect(options.legacyRedirects, context.url);
    if (legacy) return legacy;
    const response = await next();
    response.headers.set('Cache-Control', PAGE_CACHE_CONTROL);
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

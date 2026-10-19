import type { GamoLocals } from '@gamo/auth/locals';
import type { PublicApp } from '@gamo/auth/page-access';
import { checkEnvOnce } from '@gamo/config/env-validation';
import type { GamoEnv } from '@gamo/config/env';
import { getRuntimeEnv } from './response';
import { withSecurityHeaders, type SecurityHeaderOptions } from '../http/security-headers.ts';

type Context = {
  request: Request;
  url: URL;
  locals: GamoLocals;
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

/** Header options for one page response; the marketing pages need no third-party origins. */
export function pageSecurityHeaderOptions(
  app: PublicApp,
  context: { url: URL; locals: GamoLocals },
  enforceCsp: boolean,
): SecurityHeaderOptions {
  const requested = context.locals.securityRequest;
  return {
    enforceCsp,
    https: context.url.protocol === 'https:',
    allowGeolocation: app === 'live',
    clerkFrontendApi: requested?.clerkFrontendApi,
    formActionOrigins: requested?.formActionOrigins,
    noReferrer: requested?.noReferrer === true,
  };
}

/**
 * Middleware for the marketing apps: environment check, `locals.product`, legacy redirects, then
 * security headers. There are no sessions; pages answer `no-store`.
 */
export function applicationPages(app: PublicApp, options: ApplicationPagesOptions = {}) {
  const handle = async (context: Context, next: () => Promise<Response>, env: GamoEnv): Promise<Response> => {
    const { pathname } = context.url;
    context.locals.product = app;
    const misconfigured = checkEnvOnce(app, env, context.request);
    if (misconfigured) return misconfigured;
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
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  };

  return async (context: Context, next: () => Promise<Response>): Promise<Response> => {
    const env = await getRuntimeEnv(context);
    const response = await handle(context, next, env);
    return withSecurityHeaders(
      response,
      pageSecurityHeaderOptions(app, context, import.meta.env?.PROD === true),
    );
  };
}

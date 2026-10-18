/**
 * Security headers for every response served by a Gamo Studios Worker.
 *
 * Static files under /_astro/ and public/ are served by Workers Static Assets before the Worker
 * runs; they get their headers from each app's public/_headers file instead.
 *
 * The Content-Security-Policy works because every app builds with `vite.build.assetsInlineLimit: 0`
 * and `build.inlineStylesheets: 'never'` (see each app's astro.config.mjs): Astro then emits every
 * script and stylesheet as a file, so `script-src` needs no 'unsafe-inline'. JSON-LD blocks are
 * data, not script, and are unaffected. `style-src` keeps 'unsafe-inline' for the few style=""
 * attributes in components.
 */

export interface SecurityHeaderOptions {
  /** Origin of this product's Clerk Frontend API (e.g. https://clerk.example.com), when Clerk is configured. */
  clerkFrontendApi?: string;
  /** Enforce the CSP (production builds). Off under `astro dev`, whose HMR client injects inline scripts. */
  enforceCsp: boolean;
  /** Request was served over HTTPS (enables HSTS and upgrade-insecure-requests). */
  https: boolean;
  /** Allow `navigator.geolocation` for this origin (Gamo Live "near me"). */
  allowGeolocation?: boolean;
}

const CLERK_SUPPORT_ORIGINS = {
  img: 'https://img.clerk.com',
  telemetry: 'https://clerk-telemetry.com',
  captcha: 'https://challenges.cloudflare.com',
};

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function buildContentSecurityPolicy(
  options: Pick<SecurityHeaderOptions, 'clerkFrontendApi' | 'https'>,
): string {
  const clerk = originOf(options.clerkFrontendApi);
  const withClerk = (...sources: string[]) => (clerk ? [...sources, clerk] : sources);
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': withClerk("'self'"),
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', ...(clerk ? [CLERK_SUPPORT_ORIGINS.img] : [])],
    'connect-src': withClerk("'self'", ...(clerk ? [CLERK_SUPPORT_ORIGINS.telemetry] : [])),
    'frame-src': ["'self'", ...(clerk ? [CLERK_SUPPORT_ORIGINS.captcha] : [])],
    'worker-src': ["'self'", 'blob:'],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, sources]) => `${name} ${sources.join(' ')}`);
  if (options.https) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export function securityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'browsing-topics=()',
      `geolocation=${options.allowGeolocation ? '(self)' : '()'}`,
    ].join(', '),
  };
  if (options.https) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  if (options.enforceCsp) headers['Content-Security-Policy'] = buildContentSecurityPolicy(options);
  return headers;
}

/** Sets the headers on `response`, copying it first if its headers are immutable. */
export function withSecurityHeaders(response: Response, options: SecurityHeaderOptions): Response {
  const headers = securityHeaders(options);
  let target = response;
  try {
    for (const [name, value] of Object.entries(headers)) target.headers.set(name, value);
  } catch {
    target = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) target.headers.set(name, value);
  }
  return target;
}

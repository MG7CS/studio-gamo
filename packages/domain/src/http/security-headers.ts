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
  /**
   * Cloudflare Turnstile is configured for this app (`PUBLIC_TURNSTILE_SITE_KEY` set): allow its
   * script and frame origin. Turnstile's CSP reference lists only `script-src` and `frame-src`
   * (`https://challenges.cloudflare.com`); its requests go through that frame, so `connect-src` stays as is.
   */
  turnstile?: boolean;
  /**
   * Extra exact `https://` origins appended to `form-action` for this response (e.g.
   * `https://checkout.stripe.com` on the page whose form POST 303s to Stripe Checkout — Chrome applies
   * `form-action` to redirects after a form submission). Anything that is not a plain https origin is dropped.
   */
  formActionOrigins?: readonly string[];
  /** `Permissions-Policy: camera=(self)` for this response (the door scanner); otherwise `camera=()`. */
  camera?: boolean;
}

/**
 * Per-page additions a page can request, through `requestSecurityHeaders(Astro.locals, …)` in the
 * page's frontmatter. The page middleware reads them after the page has rendered its head.
 */
export type PageSecurityRequest = Pick<SecurityHeaderOptions, 'formActionOrigins' | 'camera'>;

/** Turnstile's script and widget frame origin (also used by Clerk's bot protection). */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

const CLERK_SUPPORT_ORIGINS = {
  img: 'https://img.clerk.com',
  telemetry: 'https://clerk-telemetry.com',
  captcha: TURNSTILE_ORIGIN,
};

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/**
 * Keeps only exact `https://host[:port]` origins (no path, wildcard, credentials or other scheme),
 * de-duplicated, so a caller can never widen `form-action` by accident.
 */
export function exactHttpsOrigins(values: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const value of values ?? []) {
    if (typeof value !== 'string' || value.includes('*')) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    if (value.replace(/\/$/, '').toLowerCase() !== url.origin) continue;
    if (!out.includes(url.origin)) out.push(url.origin);
  }
  return out;
}

export function buildContentSecurityPolicy(
  options: Pick<SecurityHeaderOptions, 'clerkFrontendApi' | 'https' | 'turnstile' | 'formActionOrigins'>,
): string {
  const clerk = originOf(options.clerkFrontendApi);
  const withClerk = (...sources: string[]) => (clerk ? [...sources, clerk] : sources);
  // Turnstile (ours, or Clerk's bot protection) loads its script and frame from challenges.cloudflare.com.
  const captcha = clerk || options.turnstile ? [CLERK_SUPPORT_ORIGINS.captcha] : [];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': withClerk("'self'", ...captcha),
    'style-src': ["'self'", "'unsafe-inline'"],
    'font-src': ["'self'", 'data:'],
    'img-src': ["'self'", 'data:', 'blob:', ...(clerk ? [CLERK_SUPPORT_ORIGINS.img] : [])],
    'connect-src': withClerk("'self'", ...(clerk ? [CLERK_SUPPORT_ORIGINS.telemetry] : [])),
    'frame-src': ["'self'", ...captcha],
    'worker-src': ["'self'", 'blob:'],
    'form-action': ["'self'", ...exactHttpsOrigins(options.formActionOrigins)],
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
      `camera=${options.camera ? '(self)' : '()'}`,
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

/**
 * Lets a page ask for per-response CSP / Permissions-Policy additions. Call it in the **page's**
 * frontmatter (not a nested component: with streaming, only page frontmatter is guaranteed to run before
 * the middleware sets headers). Repeated calls merge.
 *
 *   requestSecurityHeaders(Astro.locals, { formActionOrigins: ['https://checkout.stripe.com'] });
 *   requestSecurityHeaders(Astro.locals, { camera: true });
 */
export function requestSecurityHeaders(
  locals: { securityRequest?: PageSecurityRequest },
  request: PageSecurityRequest,
): void {
  const current = locals.securityRequest ?? {};
  locals.securityRequest = {
    formActionOrigins: exactHttpsOrigins([
      ...(current.formActionOrigins ?? []),
      ...(request.formActionOrigins ?? []),
    ]),
    camera: Boolean(current.camera || request.camera),
  };
}

/** Sets the headers on `response`, copying it first if its headers are immutable. */
export function withSecurityHeaders(response: Response, options: SecurityHeaderOptions): Response {
  const headers = securityHeaders(options);
  // A response that already sandboxes itself (uploaded venue blueprints, Agent C) keeps its stricter CSP.
  if (/(^|;)\s*sandbox\b/.test(response.headers.get('content-security-policy') ?? ''))
    delete headers['Content-Security-Policy'];
  let target = response;
  try {
    for (const [name, value] of Object.entries(headers)) target.headers.set(name, value);
  } catch {
    target = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers)) target.headers.set(name, value);
  }
  return target;
}

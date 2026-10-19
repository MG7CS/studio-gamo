/**
 * Request guards shared by the apps. Product sign-in, sessions and Clerk were removed for the rebuild
 * (docs/REBUILD_PLAN.md); the admin is protected by Cloudflare Access (apps/admin/src/lib/gate.ts).
 */

export class AuthError extends Error {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'ORGANIZATION_FORBIDDEN';
  status: number;

  constructor(
    code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'ORGANIZATION_FORBIDDEN',
    message: string,
    status: number = 401,
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

/**
 * CSRF guard for state-changing requests. Browsers send `Origin` on every cross-origin POST/PUT/
 * PATCH/DELETE and `Sec-Fetch-Site` on all modern engines, so:
 * - a mismatched `Origin` (including sibling subdomains such as worship.gamostudio.org) is rejected;
 * - `Sec-Fetch-Site: cross-site` or `same-site` is rejected;
 * - without `Origin`, a mismatched `Referer` is rejected.
 * A request with none of these headers is not from a browser and cannot carry a victim's cookies.
 */
export function requireSameOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const expected = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  let crossOrigin =
    Boolean(origin && origin !== expected) || fetchSite === 'cross-site' || fetchSite === 'same-site';
  if (!origin && !crossOrigin) {
    const referer = request.headers.get('referer');
    if (referer) {
      try {
        crossOrigin = new URL(referer).origin !== expected;
      } catch {
        crossOrigin = true;
      }
    }
  }
  if (crossOrigin) {
    throw new AuthError('FORBIDDEN', 'Cross-origin mutation denied.', 403);
  }
}

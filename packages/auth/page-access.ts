import type { GamoEnv } from '@gamo/config/env';
import { hasProductAccess, type SessionData } from './index.ts';

export type PublicApp = 'web' | 'worship' | 'academy' | 'live' | 'production';
const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
export function isPrivatePage(app: PublicApp, path: string): boolean {
  if (/^\/account\/(signin|signup|verify|recover|access-denied|signed-out|sso-callback)\/?$/.test(path))
    return false;
  if (within(path, '/account')) return true;
  const roots: Record<PublicApp, string[]> = {
    web: ['/partner'],
    worship: ['/church', '/musician', '/check-in', '/admin', '/apply/status'],
    academy: ['/family', '/instructor', '/host', '/dashboard'],
    live: [
      '/organizer',
      '/artist',
      '/agent',
      '/me',
      '/workspaces',
      '/promote/create',
      '/promote/status',
      '/promote/events',
    ],
    production: ['/client', '/crew'],
  };
  return roots[app].some((base) => within(path, base));
}
/**
 * Cache-Control for rendered (non-API) pages. Private, account and personalized pages must
 * never carry a public directive. Marketing pages are still private/no-store because the shared
 * site header and the inquiry forms render the visitor's session (see docs/BUILD_LOG.md); flip
 * MARKETING_PAGES_CACHEABLE only after that state moves client-side.
 */
export const MARKETING_PAGES_CACHEABLE = false;
export const PUBLIC_PAGE_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';
export const PRIVATE_PAGE_CACHE = 'private, no-store';
export function pageCacheControl(app: PublicApp, path: string): string {
  if (
    !MARKETING_PAGES_CACHEABLE ||
    isPrivatePage(app, path) ||
    within(path, '/account') ||
    within(path, '/api')
  )
    return PRIVATE_PAGE_CACHE;
  return PUBLIC_PAGE_CACHE;
}
export function canAccessPage(app: PublicApp, path: string, auth: SessionData): boolean {
  if (!auth.user.verifiedEmailAt || auth.user.status !== 'active') return false;
  const role = (...roles: string[]) => roles.some((r) => auth.roles.includes(r));
  if (app === 'worship' && within(path, '/admin')) return role('staff_reviewer', 'dispatcher');
  if (!hasProductAccess(auth, app)) return false;
  if (app === 'worship' && (within(path, '/musician') || within(path, '/check-in')))
    return role('approved_musician', 'musician');
  // A church organization membership alone is not enough: staff must have verified (in person) the
  // church profile for that organization (design §4.4, docs/IDENTITY.md "Provider gates").
  if (app === 'worship' && within(path, '/church'))
    return auth.memberships.some(
      (m) =>
        m.orgType === 'church' &&
        ['owner', 'admin', 'coordinator'].includes(m.role) &&
        (auth.verifiedChurchOrganizationIds ?? []).includes(m.organizationId),
    );
  if (app === 'academy' && within(path, '/instructor')) return role('academy_instructor', 'instructor');
  if (app === 'academy' && within(path, '/host'))
    return auth.memberships.some(
      (m) => ['church', 'school'].includes(m.orgType) && ['owner', 'admin'].includes(m.role),
    );
  if (app === 'production' && within(path, '/crew')) return role('production_crew', 'staff_reviewer');
  // Live pages perform resource-scoped ownership checks; a Gamo Live account may start onboarding without a privileged role.
  return true;
}
export function isIsolatedDemo(request: Request, env: GamoEnv): boolean {
  return (
    env.ENVIRONMENT === 'local' &&
    env.ALLOW_PUBLIC_DEMO_WORKSPACES === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  );
}
export function safeReturnPath(value: string | null | undefined, fallback = '/account'): string {
  // Reject backslashes and ASCII control characters before URL parsing.
  // eslint-disable-next-line no-control-regex
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value))
    return fallback;
  try {
    const url = new URL(value, 'https://gamo.invalid');
    if (
      url.origin !== 'https://gamo.invalid' ||
      url.pathname.startsWith('/api/') ||
      /^\/account\/(signin|signup|verify|recover|signed-out|sso-callback)/.test(url.pathname)
    )
      return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

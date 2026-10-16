import { hasProductAccess, type SessionData } from './index.ts';

export type PublicApp = 'web' | 'worship' | 'academy' | 'live' | 'production';
const within = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
export function isPrivatePage(app: PublicApp, path: string): boolean {
  if (/^\/account\/(signin|signup|verify|recover|access-denied|signed-out)\/?$/.test(path)) return false;
  if (within(path, '/account')) return true;
  const roots: Record<PublicApp, string[]> = {
    web: ['/partner'],
    worship: ['/church', '/musician', '/check-in', '/admin', '/apply/status'],
    academy: ['/family', '/instructor', '/host', '/dashboard'],
    live: ['/organizer', '/artist', '/agent', '/me', '/workspaces', '/promote/create', '/promote/status', '/ticket', '/checkout'],
    production: ['/client', '/crew'],
  };
  return roots[app].some(base => within(path, base));
}
export function canAccessPage(app: PublicApp, path: string, auth: SessionData): boolean {
  if (!auth.user.verifiedEmailAt || auth.user.status !== 'active') return false;
  const role = (...roles: string[]) => auth.roles.includes('superadmin') || roles.some(r => auth.roles.includes(r));
  if (app === 'worship' && within(path, '/admin')) return role('staff_reviewer', 'dispatcher');
  if (!hasProductAccess(auth, app)) return false;
  if (app === 'worship' && (within(path, '/musician') || within(path, '/check-in'))) return role('approved_musician', 'musician');
  if (app === 'worship' && within(path, '/church')) return auth.memberships.some(m => m.orgType === 'church' && ['owner', 'admin', 'coordinator'].includes(m.role));
  if (app === 'academy' && within(path, '/instructor')) return role('academy_instructor', 'instructor');
  if (app === 'academy' && within(path, '/host')) return auth.memberships.some(m => ['church', 'school'].includes(m.orgType) && ['owner', 'admin'].includes(m.role));
  if (app === 'production' && within(path, '/crew')) return role('production_crew', 'staff_reviewer');
  // Live pages perform resource-scoped ownership checks; a Gamo Live account may start onboarding without a privileged role.
  return true;
}
export function isIsolatedDemo(request: Request, env: Record<string, unknown>): boolean {
  return env.ENVIRONMENT === 'local' && env.ALLOW_PUBLIC_DEMO_WORKSPACES === 'true'
    && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname);
}
export function safeReturnPath(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://gamo.invalid');
    if (url.origin !== 'https://gamo.invalid' || url.pathname.startsWith('/api/') || /^\/account\/(signin|signup|verify|recover|signed-out)/.test(url.pathname)) return fallback;
    return url.pathname + url.search;
  } catch { return fallback; }
}

import { DEMO_PERSONA, initialsFromName, type ViewerPersona } from './dashboard';

/** Identity is supplied only by the server's validated D1 session middleware. */
export async function resolveWorkspaceViewer(
  requestOrContext: Request | { request?: Request; locals?: Record<string, any> },
  _runtimeEnv: Record<string, any> = {},
): Promise<ViewerPersona> {
  const locals = 'locals' in requestOrContext ? requestOrContext.locals : undefined;
  const auth = locals?.auth ?? locals?.adminAuthSession;
  if (auth?.user?.verifiedEmailAt && auth.user.status === 'active') {
    const name = auth.user.displayName || auth.user.email;
    return {
      name,
      email: auth.user.email,
      initials: initialsFromName(name, auth.user.email),
      authenticated: true,
      note: 'Verified account',
      organization: auth.memberships?.[0]?.orgName,
      organizationRole: auth.memberships?.[0]?.role,
    };
  }
  if (locals?.isolatedDemo === true) return DEMO_PERSONA;
  return { name: 'Visitor', email: '', initials: 'G', authenticated: false, note: 'Sign in to continue' };
}

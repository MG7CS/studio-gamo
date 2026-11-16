import { initialsFromName, type ViewerPersona } from './dashboard';

/** Identity is supplied only by the admin middleware's validated staff session. */
export async function resolveWorkspaceViewer(
  requestOrContext: Request | { request?: Request; locals?: App.Locals },
): Promise<ViewerPersona> {
  const locals = 'locals' in requestOrContext ? requestOrContext.locals : undefined;
  const auth = locals?.adminAuthSession;
  if (auth?.user?.verifiedEmailAt && auth.user.status === 'active') {
    const name = auth.user.displayName || auth.user.email;
    return {
      name,
      email: auth.user.email,
      initials: initialsFromName(name, auth.user.email),
      authenticated: true,
      note: 'Staff account',
    };
  }
  return { name: 'Visitor', email: '', initials: 'G', authenticated: false, note: 'Staff sign-in required' };
}

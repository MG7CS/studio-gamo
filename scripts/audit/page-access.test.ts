/**
 * Public apps have no accounts (removed 2026-11-16); the only signed-in viewer is admin staff, whose
 * session the admin middleware validates and puts on `locals.adminAuthSession`. Route-level access for
 * public and admin pages is covered by private-routes.test.ts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkspaceViewer } from '../../packages/ui/src/lib/session-viewer.ts';

const staffAuth: any = {
  user: {
    id: 'staff_user',
    email: 'reviewer@example.test',
    displayName: 'Sample Reviewer',
    verifiedEmailAt: new Date(),
    status: 'active',
  },
  roles: ['staff_reviewer'],
  memberships: [],
};

test('unsigned profile hints and arbitrary session cookies never establish a viewer', async () => {
  const request = new Request('https://admin.gamostudio.org/', {
    headers: {
      cookie:
        '__session=anything; gamo_profile_hint=' +
        encodeURIComponent(JSON.stringify({ email: 'admin@example.test', orgRole: 'superadmin' })),
    },
  });
  assert.equal((await resolveWorkspaceViewer(request)).authenticated, false);
  assert.equal((await resolveWorkspaceViewer({ request, locals: {} as never })).authenticated, false);
});

test('only a validated, active admin staff session establishes the viewer', async () => {
  const request = new Request('https://admin.gamostudio.org/');
  const viewer = await resolveWorkspaceViewer({
    request,
    locals: { adminAuthSession: staffAuth } as never,
  });
  assert.equal(viewer.authenticated, true);
  assert.equal(viewer.email, staffAuth.user.email);
  for (const user of [
    { ...staffAuth.user, verifiedEmailAt: null },
    { ...staffAuth.user, status: 'disabled' },
  ]) {
    const denied = await resolveWorkspaceViewer({
      request,
      locals: { adminAuthSession: { ...staffAuth, user } } as never,
    });
    assert.equal(denied.authenticated, false);
  }
});

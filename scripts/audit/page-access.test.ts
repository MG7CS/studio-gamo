import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPrivatePage,
  canAccessPage,
  safeReturnPath,
  isIsolatedDemo,
} from '../../packages/auth/page-access.ts';
import { hasProductAccess } from '../../packages/auth/index.ts';
import { resolveWorkspaceViewer } from '../../packages/ui/src/lib/session-viewer.ts';

const academyAuth: any = {
  user: { id: 'academy_user', email: 'academy@example.test', verifiedEmailAt: new Date(), status: 'active' },
  roles: [],
  memberships: [],
  products: ['academy'],
  sessionProduct: 'academy',
};

const worshipAuth: any = {
  user: { id: 'worship_user', email: 'worship@example.test', verifiedEmailAt: new Date(), status: 'active' },
  roles: [],
  memberships: [],
  products: ['worship'],
  sessionProduct: 'worship',
};

const productionAuth: any = {
  user: { id: 'prod_user', email: 'prod@example.test', verifiedEmailAt: new Date(), status: 'active' },
  roles: [],
  memberships: [],
  products: ['production'],
  sessionProduct: 'production',
};

test('all application private route families are gated without gating public learning pages', () => {
  for (const [app, path] of [
    ['web', '/account'],
    ['web', '/partner/overview'],
    ['worship', '/church'],
    ['worship', '/musician/calendar'],
    ['worship', '/check-in/any'],
    ['academy', '/family'],
    ['academy', '/instructor'],
    ['academy', '/host'],
    ['production', '/crew'],
    ['production', '/client'],
  ] as const)
    assert.equal(isPrivatePage(app, path), true, `${app}${path}`);
  for (const app of ['web', 'worship', 'academy', 'production'] as const) {
    assert.equal(isPrivatePage(app, '/'), false);
    assert.equal(isPrivatePage(app, '/account/signin'), false);
    assert.equal(isPrivatePage(app, '/account/signup/'), false);
  }
  assert.equal(isPrivatePage('academy', '/instruments'), false);
  assert.equal(isPrivatePage('academy', '/lessons/sample-lesson'), false);
});

test('new accounts cannot assign themselves privileged program roles', () => {
  for (const [app, path] of [
    ['worship', '/musician'],
    ['worship', '/church'],
    ['worship', '/admin'],
  ] as const)
    assert.equal(canAccessPage(app, path, worshipAuth), false);
  for (const [app, path] of [
    ['academy', '/instructor'],
    ['academy', '/host'],
  ] as const)
    assert.equal(canAccessPage(app, path, academyAuth), false);
  assert.equal(canAccessPage('production', '/crew', productionAuth), false);
  assert.equal(
    canAccessPage('academy', '/account', {
      ...academyAuth,
      user: { ...academyAuth.user, verifiedEmailAt: null },
    }),
    false,
  );
});

test('product accounts are strictly isolated across Academy, Worship, Production, and Studios', () => {
  // Gamo Academy account can access Academy general family/account routes, but NEVER Worship, Production or Studios
  assert.equal(hasProductAccess(academyAuth, 'academy'), true);
  assert.equal(canAccessPage('academy', '/account', academyAuth), true);
  assert.equal(canAccessPage('academy', '/family', academyAuth), true);
  assert.equal(hasProductAccess(academyAuth, 'worship'), false);
  assert.equal(canAccessPage('worship', '/account', academyAuth), false);
  assert.equal(canAccessPage('production', '/account', academyAuth), false);
  assert.equal(canAccessPage('production', '/client', academyAuth), false);
  assert.equal(canAccessPage('web', '/account', academyAuth), false);

  // Gamo Worship account can access Worship general account/apply status, but NEVER Academy or Production
  assert.equal(canAccessPage('worship', '/account', worshipAuth), true);
  assert.equal(canAccessPage('worship', '/apply/status', worshipAuth), true);
  assert.equal(canAccessPage('academy', '/account', worshipAuth), false);
  assert.equal(canAccessPage('academy', '/family', worshipAuth), false);
  assert.equal(canAccessPage('production', '/account', worshipAuth), false);

  // Gamo Production account stays in Production
  assert.equal(canAccessPage('production', '/account', productionAuth), true);
  assert.equal(canAccessPage('academy', '/account', productionAuth), false);
  assert.equal(canAccessPage('worship', '/account', productionAuth), false);
});

test('return paths reject external redirects and authentication loops', () => {
  for (const path of [
    '//evil.test',
    '/\\evil.test',
    'https://evil.test',
    '/api/auth/session',
    '/account/signin?next=/account',
    '/\n/evil.test',
  ])
    assert.equal(safeReturnPath(path), '/account');
  assert.equal(safeReturnPath('/family?step=1'), '/family?step=1');
});

test('sample workspaces require explicit isolated local environment, never a query key', () => {
  const env = { ENVIRONMENT: 'local', ALLOW_PUBLIC_DEMO_WORKSPACES: 'true' };
  assert.equal(isIsolatedDemo(new Request('http://127.0.0.1:4321/account'), env), true);
  assert.equal(isIsolatedDemo(new Request('https://gamostudio.org/account?demo_key=anything'), env), false);
  assert.equal(
    isIsolatedDemo(new Request('http://localhost/account'), { ...env, ENVIRONMENT: 'production' }),
    false,
  );
});

test('unsigned profile hint and arbitrary session cookies never establish a viewer', async () => {
  const request = new Request('https://gamostudio.org/account', {
    headers: {
      cookie:
        '__session=anything; gamo_profile_hint=' +
        encodeURIComponent(JSON.stringify({ email: 'admin@example.test', orgRole: 'superadmin' })),
    },
  });
  assert.equal((await resolveWorkspaceViewer(request)).authenticated, false);
  assert.equal(
    (await resolveWorkspaceViewer({ request, locals: { auth: academyAuth } })).email,
    academyAuth.user.email,
  );
});

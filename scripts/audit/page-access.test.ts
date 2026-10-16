import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivatePage, canAccessPage, safeReturnPath, isIsolatedDemo } from '../../packages/auth/page-access.ts';
import { hasProductAccess } from '../../packages/auth/index.ts';
import { resolveWorkspaceViewer } from '../../packages/ui/src/lib/session-viewer.ts';

const liveAuth: any = {
  user: { id: 'live_user', email: 'live@example.test', verifiedEmailAt: new Date(), status: 'active' },
  roles: [],
  memberships: [],
  products: ['live'],
  sessionProduct: 'live',
};

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
  for (const [app, path] of [['web','/account'],['web','/partner/overview'],['worship','/church'],['worship','/musician/calendar'],['worship','/check-in/any'],['academy','/family'],['academy','/instructor'],['academy','/host'],['live','/artist'],['live','/agent/bookings'],['live','/organizer/scan'],['live','/workspaces'],['live','/promote/create'],['live','/ticket'],['production','/crew'],['production','/client']] as const) assert.equal(isPrivatePage(app,path),true,`${app}${path}`);
  for (const app of ['web','worship','academy','live','production'] as const) {
    assert.equal(isPrivatePage(app,'/'),false);
    assert.equal(isPrivatePage(app,'/account/signin'),false);
    assert.equal(isPrivatePage(app,'/account/signup/'),false);
  }
  assert.equal(isPrivatePage('live','/artists'),false);
  assert.equal(isPrivatePage('live','/organizers/public-ministry'),false);
});

test('new accounts cannot assign themselves privileged program roles', () => {
  for (const [app, path] of [['worship','/musician'],['worship','/church'],['worship','/admin']] as const) assert.equal(canAccessPage(app, path, worshipAuth), false);
  for (const [app, path] of [['academy','/instructor'],['academy','/host']] as const) assert.equal(canAccessPage(app, path, academyAuth), false);
  assert.equal(canAccessPage('production', '/crew', productionAuth), false);
  assert.equal(canAccessPage('live', '/organizer', liveAuth), true); // Scoped onboarding; records separately filtered.
  assert.equal(canAccessPage('live', '/account', { ...liveAuth, user: { ...liveAuth.user, verifiedEmailAt: null } }), false);
});

test('product accounts are strictly isolated across Gamo Live, Academy, Worship, Production, and Studios', () => {
  // Gamo Live account can access Live general onboarding/account routes, but NEVER Academy, Worship, Production, or Studios
  assert.equal(hasProductAccess(liveAuth, 'live'), true);
  assert.equal(canAccessPage('live', '/account', liveAuth), true);
  assert.equal(canAccessPage('live', '/workspaces', liveAuth), true);
  assert.equal(canAccessPage('live', '/promote/create', liveAuth), true);

  assert.equal(hasProductAccess(liveAuth, 'academy'), false);
  assert.equal(canAccessPage('academy', '/account', liveAuth), false);
  assert.equal(canAccessPage('academy', '/family', liveAuth), false);
  assert.equal(canAccessPage('worship', '/account', liveAuth), false);
  assert.equal(canAccessPage('production', '/account', liveAuth), false);
  assert.equal(canAccessPage('production', '/client', liveAuth), false);
  assert.equal(canAccessPage('web', '/account', liveAuth), false);

  // Gamo Academy account can access Academy general family/account routes, but NEVER Worship, Live, or Production
  assert.equal(hasProductAccess(academyAuth, 'academy'), true);
  assert.equal(canAccessPage('academy', '/account', academyAuth), true);
  assert.equal(canAccessPage('academy', '/family', academyAuth), true);
  assert.equal(canAccessPage('worship', '/account', academyAuth), false);
  assert.equal(canAccessPage('live', '/account', academyAuth), false);
  assert.equal(canAccessPage('live', '/workspaces', academyAuth), false);
  assert.equal(canAccessPage('production', '/account', academyAuth), false);

  // Gamo Worship account can access Worship general account/apply status, but NEVER Academy, Live, or Production
  assert.equal(canAccessPage('worship', '/account', worshipAuth), true);
  assert.equal(canAccessPage('worship', '/apply/status', worshipAuth), true);
  assert.equal(canAccessPage('academy', '/account', worshipAuth), false);
  assert.equal(canAccessPage('live', '/account', worshipAuth), false);
  assert.equal(canAccessPage('production', '/account', worshipAuth), false);
});

test('return paths reject external redirects and authentication loops', () => {
  for (const path of ['//evil.test','/\\evil.test','https://evil.test','/api/auth/session','/account/signin?next=/account','/\n/evil.test']) assert.equal(safeReturnPath(path),'/account');
  assert.equal(safeReturnPath('/promote/create?step=1'),'/promote/create?step=1');
});

test('sample workspaces require explicit isolated local environment, never a query key', () => {
  const env = {ENVIRONMENT:'local',ALLOW_PUBLIC_DEMO_WORKSPACES:'true'};
  assert.equal(isIsolatedDemo(new Request('http://127.0.0.1:4321/account'),env),true);
  assert.equal(isIsolatedDemo(new Request('https://gamostudio.org/account?demo_key=anything'),env),false);
  assert.equal(isIsolatedDemo(new Request('http://localhost/account'),{...env,ENVIRONMENT:'production'}),false);
});

test('unsigned profile hint and arbitrary session cookies never establish a viewer', async () => {
  const request = new Request('https://gamostudio.org/account',{headers:{cookie:'__session=anything; gamo_profile_hint='+encodeURIComponent(JSON.stringify({email:'admin@example.test',orgRole:'superadmin'}))}});
  assert.equal((await resolveWorkspaceViewer(request)).authenticated,false);
  assert.equal((await resolveWorkspaceViewer({request,locals:{auth:liveAuth}})).email,liveAuth.user.email);
});

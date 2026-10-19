import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivatePage, pageCacheControl, PRIVATE_PAGE_CACHE, type PublicApp } from './page-access.ts';

const PRIVATE_SAMPLES: Record<PublicApp, string[]> = {
  web: [
    '/partner',
    '/partner/workspace',
    '/account',
    '/account/onboarding',
    '/account/signin',
    '/api/auth/me',
  ],
  worship: [
    '/church',
    '/church/roster',
    '/musician/profile',
    '/check-in/success',
    '/admin',
    '/apply/status',
    '/account/signin',
  ],
  academy: ['/family', '/instructor/classes', '/host/rooms', '/dashboard', '/account/verify'],
  live: [
    '/organizer/dashboard',
    '/artist/profile',
    '/agent/clients',
    '/me/tickets',
    '/workspaces',
    '/promote/create',
    '/promote/status',
    '/promote/events/evt_1/edit',
    '/account/recover',
  ],
  production: ['/client', '/client/projects', '/crew/schedule', '/account/signin'],
};

describe('page Cache-Control', () => {
  for (const [app, paths] of Object.entries(PRIVATE_SAMPLES) as [PublicApp, string[]][]) {
    test(`${app}: private, account and API paths never get a public cache header`, () => {
      for (const path of paths) {
        const value = pageCacheControl(app, path);
        assert.equal(value, PRIVATE_PAGE_CACHE, `${app} ${path}`);
        assert.doesNotMatch(value, /public|s-maxage|max-age=[1-9]/i, `${app} ${path}`);
      }
    });
  }

  test('every path the route guard treats as private is no-store', () => {
    for (const [app, paths] of Object.entries(PRIVATE_SAMPLES) as [PublicApp, string[]][]) {
      for (const path of paths.filter((p) => isPrivatePage(app, p))) {
        assert.equal(pageCacheControl(app, path), PRIVATE_PAGE_CACHE);
      }
    }
  });
});

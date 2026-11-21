import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { legacyLessonDestination, legacyRedirects } from '../../apps/academy/src/lib/legacy-redirects.ts';

test('the old lesson list URL permanently redirects to the instrument list', () => {
  assert.deepEqual(legacyRedirects['/lessons'], { status: 301, destination: '/instruments' });
  assert.equal(legacyLessonDestination, '/instruments');
});

test('no configured redirect uses a dynamic source (the Cloudflare adapter rewrites its destination)', () => {
  for (const route of Object.keys(legacyRedirects)) {
    assert.equal(/[[\]:*]/.test(route), false, `${route} is dynamic; use a page route instead`);
  }
});

test('old lesson pages are redirected by the catch-all page route to exactly the instrument list', () => {
  const page = readFileSync('apps/academy/src/pages/lessons/[...slug].astro', 'utf8');
  assert.match(page, /export const prerender = false;/);
  assert.match(page, /Astro\.redirect\(legacyLessonDestination, 301\)/);
});

test('no redirect points at another redirect or keeps a page file behind it', () => {
  for (const [route, { destination }] of Object.entries(legacyRedirects)) {
    assert.equal(destination in legacyRedirects, false, `${route} redirects to a redirect`);
    const file = route.replace(/^\//, '');
    assert.equal(existsSync(`apps/academy/src/pages/${file}.astro`), false, `${route} still has a page`);
    assert.equal(existsSync(`apps/academy/src/pages/${file}/index.astro`), false);
  }
});

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { legacyRedirects } from '../../apps/academy/src/lib/legacy-redirects.ts';

test('the old lesson URLs permanently redirect to the instrument list', () => {
  for (const route of ['/lessons', '/lessons/[slug]']) {
    assert.deepEqual(legacyRedirects[route], { status: 301, destination: '/instruments' });
  }
});

test('no redirect points at another redirect or keeps a page file behind it', () => {
  for (const [route, { destination }] of Object.entries(legacyRedirects)) {
    assert.equal(destination in legacyRedirects, false, `${route} redirects to a redirect`);
    const file = route.replace(/^\//, '');
    assert.equal(existsSync(`apps/academy/src/pages/${file}.astro`), false, `${route} still has a page`);
    assert.equal(existsSync(`apps/academy/src/pages/${file}/index.astro`), false);
  }
});

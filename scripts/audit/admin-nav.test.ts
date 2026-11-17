/**
 * Admin navigation (apps/admin/src/data/nav.ts). Admin is the only dashboard (owner decision 2026-11-16):
 * one list of areas, every entry reachable, nothing that claims a status Gamo does not have.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { NAV_ITEMS, SHELL_WORKSPACE, navSlug } from '../../apps/admin/src/data/nav.ts';
import { screenHref } from '../../packages/ui/src/lib/dashboard.ts';

test('NAV_ITEMS lists the admin areas in order with unique keys and local hrefs', () => {
  assert.deepEqual(
    NAV_ITEMS.map((i) => [i.label, i.href, i.key]),
    [
      ['Home', '/', 'home'],
      ['Submissions', '/submissions', 'submissions'],
      ['Forms', '/forms', 'forms'],
      ['Roster', '/roster', 'roster'],
      ['Requests', '/requests', 'requests'],
      ['Invoices', '/invoices', 'invoices'],
      ['Security', '/security', 'security'],
      ['Legal', '/legal', 'legal'],
    ],
  );
  assert.equal(new Set(NAV_ITEMS.map((i) => i.key)).size, NAV_ITEMS.length);
  for (const item of NAV_ITEMS) assert.match(item.href, /^\/[a-z]*$/, item.label);
});

test('the shared shell navigation links exactly the NAV_ITEMS hrefs and has no demo screens', () => {
  assert.equal(SHELL_WORKSPACE.screens.length, 0);
  assert.equal(SHELL_WORKSPACE.nav.length, 1);
  const hrefs = SHELL_WORKSPACE.nav[0]!.items.map((item) => screenHref(SHELL_WORKSPACE, item.slug));
  assert.deepEqual(
    hrefs,
    NAV_ITEMS.map((i) => i.href),
  );
  assert.deepEqual(
    NAV_ITEMS.map((i) => navSlug(i.key)),
    SHELL_WORKSPACE.nav[0]!.items.map((i) => i.slug),
  );
  // The mobile tab bar shows the first four entries: the areas staff open most.
  assert.deepEqual(
    SHELL_WORKSPACE.nav[0]!.items.slice(0, 4).map((i) => i.label),
    ['Home', 'Submissions', 'Forms', 'Roster'],
  );
});

test('every navigation entry has a page', () => {
  for (const item of NAV_ITEMS) {
    const name = item.key === 'home' ? 'index' : item.key;
    const found =
      existsSync(`apps/admin/src/pages/${name}.astro`) ||
      existsSync(`apps/admin/src/pages/${name}/index.astro`);
    assert.ok(found, `${item.label} (${item.href}) has no page under apps/admin/src/pages`);
  }
});

test('navigation labels never claim a legal or tax status', () => {
  const labels = JSON.stringify(SHELL_WORKSPACE);
  assert.ok(!/501\(c\)|non-?profit|tax-?(exempt|deductible)|donat/i.test(labels));
});

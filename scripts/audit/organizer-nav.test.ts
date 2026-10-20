/** The organizer's menu: a handful of areas, each with a real page, and screens reached from inside their area. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ORGANIZER_NAV } from '../../apps/live/src/lib/organizer-nav.ts';

const PAGES = new URL('../../apps/live/src/pages/', import.meta.url).pathname;

test('the organizer menu holds a handful of areas, each with a real page and a unique key', () => {
  assert.ok(ORGANIZER_NAV.length >= 3 && ORGANIZER_NAV.length <= 6, 'not every screen is a menu item');
  assert.equal(new Set(ORGANIZER_NAV.map((i) => i.key)).size, ORGANIZER_NAV.length);
  for (const item of ORGANIZER_NAV) {
    const base = `${PAGES}${item.href.replace(/^\//, '')}`;
    assert.ok(existsSync(`${base}.astro`) || existsSync(`${base}/index.astro`), `${item.href} has no page`);
  }
});

test('screens that belong to an event are reached from the event, not from the menu', () => {
  const hrefs = ORGANIZER_NAV.map((i) => i.href);
  for (const inside of ['/organizer/events/new', '/organizer/check-in', 'registrations', '/edit'])
    assert.ok(!hrefs.some((h) => h.includes(inside)), `${inside} is not a menu item`);
});

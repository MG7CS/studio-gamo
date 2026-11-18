/**
 * Header mega menu data guard (docs/DECISIONS.md, 2026-11-18): every tile names a real catalog photo or
 * an existing static image, the panels have the agreed tiles, and every link is a valid absolute URL
 * on the right site. The browser behaviour is covered by tests/e2e/mega-menu.spec.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { programMenus, withMenus, ACADEMY_MENU_INSTRUMENTS } from '../../packages/config/menus.ts';
import { programNavItems, PROGRAM_IDS } from '../../packages/config/programs.ts';
import { photos } from '../../packages/ui/src/lib/images.ts';
import { assertFrameRatio } from '../../packages/ui/src/components/media/frame.ts';
import { instruments } from '../../apps/academy/src/data/instruments.ts';
import type { AppName } from '../../packages/config/apps.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const site = (app: AppName, path = '/') => `https://${app}.example.test${path}`;
const menus = programMenus(site);
const PUBLIC_APPS = ['web', 'academy', 'worship', 'production'] as const;

test('panels have the agreed tile counts, in program order', () => {
  assert.deepEqual(PROGRAM_IDS, ['academy', 'worship', 'production']);
  assert.equal(menus.academy.tiles.length, 6);
  assert.equal(menus.worship.tiles.length, 8);
  assert.equal(menus.production.tiles.length, 7);
  assert.deepEqual(
    menus.academy.links.map((l) => l.label),
    ['Browse lessons', 'Instructors', 'Find my registration', 'Sponsored programs'],
  );
  assert.deepEqual(
    [menus.academy.all.label, menus.worship.all.label, menus.production.all.label],
    ['All of Academy', 'All of Worship', 'All of Production'],
  );
});

test('every tile has exactly one of photo or src, and the photo exists in the catalog at square', () => {
  for (const [id, menu] of Object.entries(menus)) {
    for (const tile of menu.tiles) {
      const where = `${id}: ${tile.label}`;
      assert.ok(Boolean(tile.photo) !== Boolean(tile.src), `${where}: exactly one of photo or src`);
      if (tile.photo) {
        assert.ok(tile.photo in photos, `${where}: "${tile.photo}" is not in the photo catalog`);
        assert.doesNotThrow(() => assertFrameRatio(tile.photo as keyof typeof photos, 'square'), where);
      }
      if (tile.src) {
        for (const app of PUBLIC_APPS) {
          assert.ok(
            existsSync(join(ROOT, 'apps', app, 'public', tile.src)),
            `${where}: ${app} lacks ${tile.src}`,
          );
        }
      }
    }
  }
});

test('every href is an absolute URL on a Gamo site', () => {
  for (const [id, menu] of Object.entries(menus)) {
    const all = [...menu.tiles, ...menu.links, menu.all];
    for (const link of all) {
      assert.match(
        link.href,
        /^https:\/\/(web|academy|worship|production)\.example\.test\//,
        `${id}: ${link.label}`,
      );
      assert.ok(link.label.trim().length > 0);
    }
  }
});

test('academy tiles link to real instrument pages and use the instrument photo', () => {
  const bySlug = new Map(instruments.map((i) => [i.slug, i]));
  ACADEMY_MENU_INSTRUMENTS.forEach(([, photo, slug], i) => {
    assert.ok(bySlug.has(slug), `no instrument page for ${slug}`);
    assert.equal(bySlug.get(slug)?.photo, photo, `${slug}: tile photo differs from the instrument photo`);
    assert.equal(menus.academy.tiles[i]?.href, site('academy', `/instruments/${slug}`));
  });
});

test('worship tiles point at the instruments section of the worship home', () => {
  for (const tile of menus.worship.tiles) assert.equal(tile.href, site('worship', '/#instruments-title'));
});

test('withMenus attaches a panel to each program item and leaves other items alone', () => {
  const items = withMenus(
    programNavItems((id) => site(id)),
    site,
  );
  assert.deepEqual(
    items.map((i) => i.menu !== undefined),
    [true, true, true],
  );
  const other = withMenus([{ key: 'mission', label: 'Mission', href: '/m' }], site);
  assert.equal(other[0]?.menu, undefined);
});

test('the worship anchor exists on the worship home page', async () => {
  const { readFileSync } = await import('node:fs');
  const section = readFileSync(
    join(ROOT, 'apps/worship/src/components/home/InstrumentsSection.astro'),
    'utf8',
  );
  assert.match(section, /<Section id="instruments-title"/);
});

test('academy text links lead to pages and anchors that exist', async () => {
  const { readFileSync } = await import('node:fs');
  const pages = join(ROOT, 'apps/academy/src/pages');
  assert.ok(existsSync(join(pages, 'registrations/find.astro')));
  assert.ok(existsSync(join(pages, 'lessons/index.astro')));
  assert.ok(existsSync(join(pages, 'sponsored.astro')));
  const home = readFileSync(join(ROOT, 'apps/academy/src/components/home/InstructorsPreview.astro'), 'utf8');
  assert.match(home, /<Section id="instructors"/);
  const hrefs = menus.academy.links.map((l) => l.href);
  assert.ok(hrefs.includes(site('academy', '/#instructors')));
  assert.ok(hrefs.includes(site('academy', '/registrations/find')));
});

/**
 * The wizard photo map: every public form has a default photo, every section of every seeded form resolves
 * to a photo that exists in the catalog, neighbouring screens differ, and an unknown form kind is safe.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFormSeeds } from '../../packages/domain/src/forms/seeds.ts';
import { photos } from '../../packages/ui/src/lib/images.ts';
import { formPhotosFor } from '../../packages/ui/src/lib/form-photos.ts';

const catalog = new Set(Object.keys(photos));

test('every seeded form has a default photo from the catalog', () => {
  for (const seed of defaultFormSeeds()) {
    const map = formPhotosFor(seed.kind, seed.slug);
    assert.ok(catalog.has(map.default), `${seed.kind}: default ${map.default}`);
  }
});

test('every section resolves to a catalog photo', () => {
  for (const seed of defaultFormSeeds()) {
    const map = formPhotosFor(seed.kind, seed.slug);
    for (const section of seed.schema.sections) {
      const key = map.bySection[section.id] ?? map.default;
      assert.ok(catalog.has(key), `${seed.kind}/${section.id}: ${key}`);
    }
    for (const [id, key] of Object.entries(map.bySection)) {
      assert.ok(catalog.has(key), `${seed.kind}/${id}: ${key}`);
      assert.ok(
        seed.schema.sections.some((s) => s.id === id),
        `${seed.kind}: mapped section ${id} does not exist in the seed`,
      );
    }
  }
});

test('adjacent sections never share a photo when three or more photos are mapped', () => {
  for (const seed of defaultFormSeeds()) {
    const map = formPhotosFor(seed.kind, seed.slug);
    const keys = seed.schema.sections.map((s) => map.bySection[s.id] ?? map.default);
    if (new Set(keys).size < 3) continue;
    for (let i = 1; i < keys.length; i++) {
      assert.notEqual(keys[i], keys[i - 1], `${seed.kind}: sections ${i - 1} and ${i} share ${keys[i]}`);
    }
  }
});

test('an unknown kind returns a catalog photo', () => {
  const map = formPhotosFor('something_new');
  assert.ok(catalog.has(map.default));
  assert.deepEqual(map.bySection, {});
});

test('every mapped photo can be framed as portrait and landscape', () => {
  for (const seed of defaultFormSeeds()) {
    const map = formPhotosFor(seed.kind, seed.slug);
    for (const key of [map.default, ...Object.values(map.bySection)]) {
      const allowed = photos[key as keyof typeof photos].ratios;
      assert.ok(allowed.includes('portrait') && allowed.includes('landscape'), `${seed.kind}: ${key}`);
    }
  }
});

const NEW_SLUGS = ['academy-teach', 'academy-host', 'volunteer', 'academy-interest'];

test('every section of the four new forms resolves to a catalog photo that frames both ways', () => {
  for (const slug of NEW_SLUGS) {
    const seed = defaultFormSeeds().find((s) => s.slug === slug);
    assert.ok(seed, slug);
    const map = formPhotosFor(seed.kind, slug);
    const keys = seed.schema.sections.map((s) => map.bySection[s.id] ?? map.default);
    for (const key of keys) {
      assert.ok(catalog.has(key), `${slug}: ${key}`);
      const allowed = photos[key as keyof typeof photos].ratios;
      assert.ok(allowed.includes('portrait') && allowed.includes('landscape'), `${slug}: ${key}`);
    }
    for (const id of Object.keys(map.bySection)) {
      assert.ok(
        seed.schema.sections.some((s) => s.id === id),
        `${slug}: mapped section ${id} does not exist`,
      );
    }
    if (new Set(keys).size >= 3) {
      for (let i = 1; i < keys.length; i++) assert.notEqual(keys[i], keys[i - 1], `${slug}: ${i}`);
    }
  }
});

test('a slug entry wins over the kind entry, and an unknown slug falls back to the kind', () => {
  const kindMap = formPhotosFor('contact');
  const volunteer = formPhotosFor('contact', 'volunteer');
  const interest = formPhotosFor('contact', 'academy-interest');
  assert.notDeepEqual(volunteer, kindMap);
  assert.notDeepEqual(interest, volunteer);
  assert.deepEqual(formPhotosFor('contact', 'no-such-form'), kindMap);
  assert.deepEqual(formPhotosFor('contact', undefined), kindMap);
});

test('the instructor form uses instrument or musician photos on teaching and media', () => {
  const map = formPhotosFor('instructor_application', 'academy-teach');
  for (const id of ['teaching', 'media']) {
    assert.match(map.bySection[id] ?? '', /^(instrument|musician)/, id);
  }
});

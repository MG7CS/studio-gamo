import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '@gamo/db/testing';
import { checkPublishable, FORM_KINDS, REQUIRED_BINDS } from './schema.ts';
import { FormsService } from './service.ts';
import { defaultFormSeeds, seedDefaultForms } from './seeds.ts';

const NOW = 1_900_000_000;
const PROGRAMS = ['academy', 'worship', 'production', 'web'];
const NEW_SLUGS = ['academy-teach', 'academy-host', 'volunteer', 'academy-interest'];

test('there are ten seeds with unique slugs, known kinds and valid programs', () => {
  const seeds = defaultFormSeeds();
  assert.equal(seeds.length, 10);
  assert.equal(new Set(seeds.map((s) => s.slug)).size, seeds.length);
  for (const seed of seeds) {
    assert.ok((FORM_KINDS as readonly string[]).includes(seed.kind), `${seed.slug}: kind ${seed.kind}`);
    assert.ok(PROGRAMS.includes(seed.program), `${seed.slug}: program ${seed.program}`);
  }
});

test('the four new seeds exist with the expected kind and program', () => {
  const by = new Map(defaultFormSeeds().map((s) => [s.slug, s]));
  assert.deepEqual(
    NEW_SLUGS.map((s) => [by.get(s)?.kind, by.get(s)?.program]),
    [
      ['instructor_application', 'academy'],
      ['partner_interest', 'web'],
      ['contact', 'web'],
      ['contact', 'academy'],
    ],
  );
});

test('every seed passes the publish check for its kind and carries the required binds', () => {
  for (const seed of defaultFormSeeds()) {
    const check = checkPublishable(seed.kind, seed.schema);
    assert.deepEqual(check.errors, [], `${seed.slug}`);
    const binds = new Set(
      seed.schema.sections.flatMap((s) => s.questions.map((q) => (q as { bind?: string }).bind)),
    );
    for (const required of REQUIRED_BINDS[seed.kind]) {
      assert.ok(binds.has(required), `${seed.slug}: missing ${required}`);
    }
  }
});

test('the instructor form records teaching and ends with consent, with no guardian section', () => {
  const seed = defaultFormSeeds().find((s) => s.slug === 'academy-teach')!;
  const ids = seed.schema.sections.map((s) => s.id);
  assert.deepEqual(ids, ['about', 'teaching', 'availability', 'church', 'media', 'agree']);
  const canTeach = seed.schema.sections
    .flatMap((s) => s.questions)
    .find((q) => (q as { bind?: string }).bind === 'roster.can_teach') as { options: string[] };
  assert.deepEqual(canTeach.options, ['Yes']);
});

test('no seed uses forbidden mission wording', () => {
  const text = JSON.stringify(defaultFormSeeds()).toLowerCase();
  for (const word of ['nonprofit', 'non-profit', 'tax-exempt', 'donation', 'donor', 'charity']) {
    assert.ok(!text.includes(word), word);
  }
});

test('seeding an empty database creates and publishes all ten, and a second run changes nothing', async () => {
  const d1 = await createMigratedD1();
  const first = await seedDefaultForms(d1, NOW);
  assert.equal(first.created.length, 10);
  assert.deepEqual(first.skipped, []);
  const forms = new FormsService(d1, { now: NOW });
  for (const slug of first.created) {
    const form = await forms.getPublished(slug);
    assert.ok(form, `${slug} published`);
  }
  const second = await seedDefaultForms(d1, NOW);
  assert.deepEqual(second.created, []);
  assert.equal(second.skipped.length, 10);
});

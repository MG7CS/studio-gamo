import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '../../packages/db/testing.ts';
import { defaultFormSeeds, seedDefaultForms } from '../../packages/domain/src/forms/all.ts';
import { runBuilderAction } from '../../apps/admin/src/lib/forms-builder/actions.ts';

const NOW = 1_900_000_000;
const NEW_SLUGS = ['academy-teach', 'academy-host', 'volunteer', 'academy-interest'];

async function withOriginalSix() {
  const d1 = await createMigratedD1();
  // Seed everything, then remove the four new forms to mimic a production database that has only the original six.
  await seedDefaultForms(d1, NOW);
  for (const slug of NEW_SLUGS) {
    await d1
      .prepare('DELETE FROM form_versions WHERE form_id IN (SELECT id FROM forms WHERE slug = ?)')
      .bind(slug)
      .run();
    await d1.prepare('DELETE FROM forms WHERE slug = ?').bind(slug).run();
  }
  return d1;
}

const versions = async (d1: Awaited<ReturnType<typeof createMigratedD1>>) =>
  (
    await d1
      .prepare(
        'SELECT f.slug, f.revision, v.version, v.published_by_user_id FROM forms f JOIN form_versions v ON v.form_id = f.id ORDER BY f.slug',
      )
      .all()
  ).results as { slug: string; revision: number; version: number; published_by_user_id: string }[];

test('forms.seed_defaults adds only the missing default forms, attributed to the staff member', async () => {
  const d1 = await withOriginalSix();
  const before = await versions(d1);
  assert.equal(before.length, defaultFormSeeds().length - NEW_SLUGS.length);

  const out = await runBuilderAction(
    { db: d1, staff: { userId: 'staff-42' }, now: NOW + 5 },
    null,
    'forms.seed_defaults',
    {},
  );
  assert.ok(out.ok);
  assert.equal(out.notice, 'defaults-added-4');
  assert.deepEqual([...(out.data.created as string[])].sort(), [...NEW_SLUGS].sort());

  const after = await versions(d1);
  assert.equal(after.length, defaultFormSeeds().length);
  for (const row of after.filter((r) => NEW_SLUGS.includes(r.slug))) {
    assert.equal(row.published_by_user_id, 'staff-42');
    assert.equal(row.version, 1);
  }
  // Existing forms are untouched.
  for (const row of before) {
    assert.deepEqual(
      after.find((r) => r.slug === row.slug),
      row,
    );
  }
  const published = await d1.prepare("SELECT count(*) AS n FROM forms WHERE status = 'published'").first();
  assert.equal((published as { n: number } | null)?.n, defaultFormSeeds().length);
});

test('forms.seed_defaults is a no-op the second time', async () => {
  const d1 = await withOriginalSix();
  await runBuilderAction(
    { db: d1, staff: { userId: 'staff-42' }, now: NOW },
    null,
    'forms.seed_defaults',
    {},
  );
  const before = await versions(d1);
  const out = await runBuilderAction(
    { db: d1, staff: { userId: 'staff-43' }, now: NOW + 9 },
    null,
    'forms.seed_defaults',
    {},
  );
  assert.ok(out.ok);
  assert.equal(out.notice, 'defaults-none');
  assert.deepEqual(out.data.created, []);
  assert.deepEqual(await versions(d1), before);
});

/**
 * `apps/web/src/lib/form-page.ts` GET behaviour for a form that is not published yet (what production shows until
 * someone opens admin Forms), a published form with pre-filled values, and a forged confirmation link. The POST path
 * is covered by `packages/domain/src/forms/http.test.ts` and the browser specs. The Astro global is a small fake.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMigratedD1 } from '../../packages/db/testing.ts';
import { seedDefaultForms } from '../../packages/domain/src/forms/seeds.ts';
import { loadFormPage } from '../../apps/web/src/lib/form-page.ts';

type AstroGlobal = Parameters<typeof loadFormPage>[0];

function astroFor(db: unknown, url: string) {
  const response = { status: 200, headers: new Headers() };
  const rewrites: string[] = [];
  const astro = {
    request: new Request(url),
    url: new URL(url),
    locals: {
      runtimeEnv: { ENVIRONMENT: 'local', DB: db, FORM_UPLOAD_SECRET: 'form-page-test-secret-0000000000001' },
    },
    response,
    rewrite: async (path: string) => {
      rewrites.push(path);
      return new Response(null, { status: 404 });
    },
  } as unknown as AstroGlobal;
  return { astro, response, rewrites };
}

test('an unpublished form is a 404 rewrite, or the page fallback when the page asks for one', async () => {
  const db = await createMigratedD1();
  const hard = astroFor(db, 'https://gamostudio.org/worship/apply');
  const page = await loadFormPage(hard.astro, 'worship-apply');
  assert.ok('response' in page);
  assert.deepEqual(hard.rewrites, ['/404']);

  const soft = astroFor(db, 'https://gamostudio.org/contact');
  assert.deepEqual(await loadFormPage(soft.astro, 'contact', { fallbackWhenMissing: true }), {
    view: 'missing',
  });
  assert.deepEqual(soft.rewrites, []);
});

test('a published form renders with the values the page pre-fills; a forged confirmation shows the form', async () => {
  const db = await createMigratedD1();
  await seedDefaultForms(db, 1_900_000_000);

  const plain = astroFor(db, 'https://gamostudio.org/contact');
  const shown = await loadFormPage(plain.astro, 'contact', { prefill: { topic: 'Gamo Academy' } });
  assert.ok('view' in shown && shown.view === 'form');
  if ('view' in shown && shown.view === 'form') {
    assert.equal(shown.form.slug, 'contact');
    assert.deepEqual(shown.values, { topic: 'Gamo Academy' });
    assert.ok(shown.idempotencyKey.length >= 16);
  }

  const forged = astroFor(db, 'https://gamostudio.org/contact?sent=GS-2030-0001.9999999999.forged');
  const again = await loadFormPage(forged.astro, 'contact');
  assert.ok('view' in again && again.view === 'form', 'a forged reference is not a confirmation');
});

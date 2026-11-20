import assert from 'node:assert/strict';
import { test } from 'node:test';
import { instrumentOptionFor } from '../../apps/web/src/lib/academy-interest.ts';
import { instruments } from '../../apps/academy/src/data/instruments.ts';
import { defaultFormSeeds } from '../../packages/domain/src/forms/seeds.ts';

test('every Academy instrument slug maps to an option the interest form offers', () => {
  const seed = defaultFormSeeds().find((s) => s.slug === 'academy-interest')!;
  const question = seed.schema.sections.flatMap((s) => s.questions).find((q) => q.id === 'instruments') as {
    options: string[];
  };
  for (const i of instruments) {
    const option = instrumentOptionFor(i.slug);
    assert.ok(option && question.options.includes(option), i.slug);
  }
});

test('unknown, empty and inherited slugs give no prefill', () => {
  for (const slug of ['violin', '', null, undefined, 'constructor', '__proto__']) {
    assert.equal(instrumentOptionFor(slug), undefined);
  }
});

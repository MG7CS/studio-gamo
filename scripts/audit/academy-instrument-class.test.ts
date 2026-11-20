import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACADEMY_INSTRUMENTS } from '../../packages/config/academy-instruments.ts';
import {
  findInstrument,
  instrumentClassRef,
  registrationClassTitle,
} from '../../apps/academy/src/lib/instrument-class.ts';

test('an unknown instrument slug finds nothing', () => {
  assert.equal(findInstrument('kazoo'), null);
  assert.equal(findInstrument(undefined), null);
});

test('every instrument yields an unscheduled, unpriced class reference', () => {
  for (const instrument of ACADEMY_INSTRUMENTS) {
    const found = findInstrument(instrument.slug);
    assert.ok(found);
    const ref = instrumentClassRef(found);
    assert.equal(ref.programSlug, instrument.slug);
    assert.equal(ref.slug, null);
    assert.equal(ref.title, instrument.name);
    assert.equal(ref.sample, false);
    assert.equal(ref.amountCents, null);
    assert.equal(ref.location, '');
    assert.equal(ref.scheduleText, '');
  }
});

test('a stored registration shows its instrument name', () => {
  assert.equal(registrationClassTitle('piano'), 'Piano & Keyboards');
  assert.equal(registrationClassTitle('unknown'), 'Class');
});

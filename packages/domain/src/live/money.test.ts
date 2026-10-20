import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCents, parseDollarsToCents } from './money.ts';
import { DEFAULT_GIFT_PRESETS, giftPresetsFromForm, parseGiftPresets, readGiftChoice } from './gifts.ts';
import { PaidError } from './paid-types.ts';

test('cents format as dollars and typed dollars parse to cents', () => {
  assert.equal(formatCents(0), '$0.00');
  assert.equal(formatCents(123_456), '$1,234.56');
  assert.equal(formatCents(-300), '−$3.00');
  assert.equal(parseDollarsToCents('25'), 2500);
  assert.equal(parseDollarsToCents('$1,025.5'), 102_550);
  for (const bad of ['', '-5', '1.234', 'abc', '1e3', null])
    assert.equal(parseDollarsToCents(bad), null, String(bad));
});

test('gift presets: defaults when unset or malformed, sorted and capped', () => {
  assert.deepEqual(parseGiftPresets(null), [...DEFAULT_GIFT_PRESETS]);
  assert.deepEqual(parseGiftPresets('not json'), [...DEFAULT_GIFT_PRESETS]);
  assert.deepEqual(parseGiftPresets('[2500, 500, 500, 50]'), [500, 2500]);
  assert.equal(giftPresetsFromForm('10, 5 25'), '[500,1000,2500]');
  assert.throws(() => giftPresetsFromForm('0.5'), PaidError);
  assert.throws(() => giftPresetsFromForm('1,2,3,4,5'), PaidError);
});

test('the gift is none unless chosen; custom and preset amounts are checked', () => {
  const presets = [500, 1000];
  assert.equal(readGiftChoice({ enabled: true, presets, choice: undefined }), 0);
  assert.equal(readGiftChoice({ enabled: true, presets, choice: 'none' }), 0);
  assert.equal(readGiftChoice({ enabled: true, presets, choice: '1000' }), 1000);
  assert.equal(readGiftChoice({ enabled: true, presets, choice: 'custom', custom: '12.50' }), 1250);
  const refused = (input: Parameters<typeof readGiftChoice>[0]) =>
    assert.throws(
      () => readGiftChoice(input),
      (e: unknown) => e instanceof PaidError && e.detail === 'gift',
    );
  refused({ enabled: true, presets, choice: '777' });
  refused({ enabled: true, presets, choice: 'custom', custom: '0.50' });
  refused({ enabled: false, presets, choice: '500' });
});

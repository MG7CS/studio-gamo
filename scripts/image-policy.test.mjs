import test from 'node:test';
import assert from 'node:assert/strict';
import { responsiveWidths, configurationSignature } from './image-policy.mjs';

test('portrait sources retain intrinsic width without upscaling', () => {
  assert.deepEqual(responsiveWidths(1122, [480, 800, 1200, 1600]), [480, 800, 1122]);
  assert.deepEqual(responsiveWidths(320, [480, 800, 1200, 1600]), [320]);
});
test('large sources cap variants and deduplicate targets', () => {
  assert.deepEqual(responsiveWidths(4000, [1600, 480, 800, 800, 1200]), [480, 800, 1200, 1600]);
  assert.deepEqual(responsiveWidths(1600, [480, 800, 1200, 1600]), [480, 800, 1200, 1600]);
});
test('invalid dimensions fail instead of producing unusable variants', () => {
  for (const width of [0, -1, NaN, 1.5]) assert.throws(() => responsiveWidths(width, [480]));
  assert.throws(() => responsiveWidths(1000, []));
  assert.throws(() => responsiveWidths(1000, [480, 0]));
});
test('encoding and size changes invalidate the cache', () => {
  const first = configurationSignature([480, 800], [{ format: 'avif', options: { quality: 55 } }]);
  assert.equal(first, configurationSignature([480, 800], [{ format: 'avif', options: { quality: 55 } }]));
  assert.notEqual(first, configurationSignature([480, 800], [{ format: 'avif', options: { quality: 60 } }]));
  assert.notEqual(first, configurationSignature([480, 1200], [{ format: 'avif', options: { quality: 55 } }]));
});

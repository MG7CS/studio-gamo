import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesDeclaredType, normalizeContentType, uploadKindFor } from './upload-checks.ts';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => Uint8Array.from(value, (c) => c.charCodeAt(0));

test('uploadKindFor accepts only the allowlist (parameters and case ignored)', () => {
  assert.equal(uploadKindFor('video/mp4'), 'video');
  assert.equal(uploadKindFor('Video/Quicktime; codecs=x'), 'video');
  assert.equal(uploadKindFor('video/webm'), 'video');
  for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    assert.equal(uploadKindFor(t), 'image');
  assert.equal(uploadKindFor('application/pdf'), 'pdf');
  for (const t of [
    'text/html',
    'image/gif',
    'image/svg+xml',
    'application/zip',
    'video/x-matroska',
    '',
    'audio/mpeg',
  ])
    assert.equal(uploadKindFor(t), null, t);
  assert.equal(normalizeContentType(' Image/PNG ;x=y'), 'image/png');
});

test('matchesDeclaredType checks the documented signatures', () => {
  const ftyp = (brand: string) => Uint8Array.from([0, 0, 0, 24, ...text('ftyp'), ...text(brand), 0, 0, 0, 0]);
  assert.ok(matchesDeclaredType('video/mp4', ftyp('isom')));
  assert.ok(matchesDeclaredType('video/quicktime', ftyp('qt  ')));
  assert.ok(matchesDeclaredType('image/heic', ftyp('heic')));
  assert.ok(!matchesDeclaredType('image/heic', ftyp('isom')), 'an mp4 is not a heic');
  assert.ok(matchesDeclaredType('video/webm', bytes(0x1a, 0x45, 0xdf, 0xa3, 1)));
  assert.ok(matchesDeclaredType('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)));
  assert.ok(matchesDeclaredType('image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)));
  assert.ok(
    matchesDeclaredType('image/webp', Uint8Array.from([...text('RIFF'), 1, 2, 3, 4, ...text('WEBPVP8 ')])),
  );
  assert.ok(
    !matchesDeclaredType('image/webp', Uint8Array.from([...text('RIFF'), 1, 2, 3, 4, ...text('WAVEfmt ')])),
  );
  assert.ok(matchesDeclaredType('application/pdf', text('%PDF-1.7')));
  const html = text('<!doctype html><script>alert(1)</script>');
  for (const t of ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    assert.ok(!matchesDeclaredType(t, html), t);
  assert.ok(!matchesDeclaredType('video/mp4', bytes()), 'empty never matches');
  assert.ok(!matchesDeclaredType('text/html', html));
});

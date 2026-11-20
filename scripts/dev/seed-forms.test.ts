import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLocalD1File, localStateDir } from './seed-forms.ts';

const root = '/work/gamo';
const ok = `${localStateDir(root, 'worship')}/abc123.sqlite`;

test('accepts only an app database inside this checkout local state directory', () => {
  assert.equal(isLocalD1File(root, ok), true);
  assert.equal(isLocalD1File(root, `${localStateDir(root, 'admin')}/abc123.sqlite`), true);
});

test('refuses everything else', () => {
  assert.equal(isLocalD1File(root, `${localStateDir(root, 'worship')}/metadata.sqlite`), false);
  assert.equal(isLocalD1File(root, `${localStateDir(root, 'worship')}/abc123.sqlite-wal`), false);
  assert.equal(isLocalD1File(root, `${localStateDir(root, 'unknown')}/abc123.sqlite`), false);
  assert.equal(isLocalD1File(root, `${localStateDir('/other/checkout', 'worship')}/abc123.sqlite`), false);
  assert.equal(isLocalD1File(root, `${localStateDir(root, 'worship')}/../../x.sqlite`), false);
  assert.equal(isLocalD1File(root, `${localStateDir(root, 'worship')}/sub/abc123.sqlite`), false);
  assert.equal(isLocalD1File(root, '/Users/x/.wrangler/state/v3/d1/abc.sqlite'), false);
  assert.equal(isLocalD1File(root, ''), false);
});

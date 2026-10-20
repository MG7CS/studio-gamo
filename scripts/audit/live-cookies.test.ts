import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCookie, safeDecode } from '../../apps/live/src/lib/cookie-parse.ts';

test('a malformed percent-encoded cookie reads as absent instead of throwing', () => {
  for (const bad of ['%', '%E0%A4%A', '%zz', 'abc%']) {
    assert.equal(safeDecode(bad), null, bad);
    assert.doesNotThrow(() => parseCookie(`gl_organizer=${bad}`, 'gl_organizer'), bad);
    assert.equal(parseCookie(`gl_organizer=${bad}`, 'gl_organizer'), null, bad);
  }
});

test('well-formed cookies are found among others and decoded', () => {
  const header = 'a=1; gl_org=org%5F123; gl_organizer=tok-en_1 ; theme=dark';
  assert.equal(parseCookie(header, 'gl_org'), 'org_123');
  assert.equal(parseCookie(header, 'gl_organizer'), 'tok-en_1');
  assert.equal(parseCookie(header, 'missing'), null);
  assert.equal(parseCookie(null, 'a'), null);
  assert.equal(parseCookie('', 'a'), null);
  // A bad cookie elsewhere in the header does not hide a good one.
  assert.equal(parseCookie('x=%; gl_org=ok', 'gl_org'), 'ok');
});

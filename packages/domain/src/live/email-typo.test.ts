import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, emailTypoHint } from './email-typo.ts';

test('common domain slips get a hint', () => {
  assert.equal(emailTypoHint('ruth@gmial.com'), 'ruth@gmail.com');
  assert.equal(emailTypoHint('ruth@gmail.con'), 'ruth@gmail.com');
  assert.equal(emailTypoHint('ruth@gmail.cmo'), 'ruth@gmail.com');
  assert.equal(emailTypoHint('Ruth@Hotmal.com'), 'ruth@hotmail.com');
  assert.equal(emailTypoHint('ruth@yaho.com'), 'ruth@yahoo.com');
  assert.equal(emailTypoHint('ruth@outlok.com'), 'ruth@outlook.com');
  assert.equal(emailTypoHint('ruth@icloud.co'), 'ruth@icloud.com');
  assert.equal(emailTypoHint('ruth@comcast.nte'), 'ruth@comcast.net');
  assert.equal(emailTypoHint('pastor@gracechurch.ogr'), 'pastor@gracechurch.org');
  assert.equal(emailTypoHint('pastor@gracechurch.con'), 'pastor@gracechurch.com');
});

test('real addresses, including look-alike domains, get none', () => {
  for (const email of [
    'ruth@gmail.com',
    'ruth@ymail.com',
    'ruth@mail.com',
    'ruth@live.com',
    'ruth@me.com',
    'ruth@gmx.com',
    'ruth@googlemail.com',
    'pastor@gracechurch.org',
    'not-an-email',
    '@gmail.con',
  ])
    assert.equal(emailTypoHint(email), null, email);
});

test('editDistance counts a transposition as one edit', () => {
  assert.equal(editDistance('gmial.com', 'gmail.com'), 1);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('', 'ab'), 2);
});

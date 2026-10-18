import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, emailsMatch, emailTypoSuggestion, suggestEmailDomain } from './email-typo.ts';

test('edit distance counts swaps as one edit and stops at the cap', () => {
  assert.equal(editDistance('gmail', 'gmail'), 0);
  assert.equal(editDistance('gmial', 'gmail'), 1);
  assert.equal(editDistance('gmal', 'gmail'), 1);
  assert.equal(editDistance('hotmial', 'hotmail'), 1);
  assert.equal(editDistance('icould', 'icloud'), 2);
  assert.equal(editDistance('abcdefgh', 'z', 2), 3);
});

test('common provider typos get a suggestion, keeping the local part as typed', () => {
  const cases: Record<string, string> = {
    'Sam.Lee+tix@gmial.com': 'Sam.Lee+tix@gmail.com',
    'sam@gamil.com': 'sam@gmail.com',
    'sam@gmai.com': 'sam@gmail.com',
    'sam@gnail.com': 'sam@gmail.com',
    'sam@gmail.con': 'sam@gmail.com',
    'sam@gmail.cmo': 'sam@gmail.com',
    'sam@gmail.co': 'sam@gmail.com',
    'sam@gmailcom': 'sam@gmail.com',
    'sam@gmial.con': 'sam@gmail.com',
    'sam@googlemial.com': 'sam@googlemail.com',
    'sam@yaho.com': 'sam@yahoo.com',
    'sam@yahooo.com': 'sam@yahoo.com',
    'sam@hotmal.com': 'sam@hotmail.com',
    'sam@hotmail.cm': 'sam@hotmail.com',
    'sam@outlok.com': 'sam@outlook.com',
    'sam@iclod.com': 'sam@icloud.com',
    'sam@icould.com': 'sam@icloud.com',
    'sam@aol.con': 'sam@aol.com',
    'sam@ive.com': 'sam@live.com',
    'sam@mns.com': 'sam@msn.com',
    'sam@comcast.nte': 'sam@comcast.net',
    'sam@comcats.net': 'sam@comcast.net',
    'sam@verizn.net': 'sam@verizon.net',
    'sam@att.nte': 'sam@att.net',
    'pastor@firstchurch.ogr': 'pastor@firstchurch.org',
    '  sam@GMIAL.COM  ': 'sam@gmail.com',
  };
  for (const [typed, expected] of Object.entries(cases))
    assert.equal(emailTypoSuggestion(typed), expected, typed);
});

test('correct, unknown or regional domains get no suggestion', () => {
  for (const email of [
    'sam@gmail.com',
    'sam@googlemail.com',
    'sam@yahoo.com',
    'sam@yahoo.co.uk',
    'sam@yahoo.ca',
    'sam@hotmail.fr',
    'sam@outlook.de',
    'sam@live.ca',
    'sam@comcast.net',
    'sam@att.net',
    'sam@mail.com',
    'sam@email.com',
    'sam@ymail.com',
    'sam@gmx.com',
    'sam@me.com',
    'sam@mac.com',
    'sam@aim.com',
    'sam@proton.me',
    'sam@firstbaptist.org',
    'sam@example.org',
    'sam@horizon.net',
    'sam@stmarys.church',
    'sam@university.edu',
  ])
    assert.equal(emailTypoSuggestion(email), null, email);
});

test('never suggests for gamostudio.org', () => {
  assert.equal(emailTypoSuggestion('hello@gamostudio.org'), null);
  assert.equal(emailTypoSuggestion('hello@live.gamostudio.org'), null);
  assert.equal(suggestEmailDomain('gamostudio.org'), null);
});

test('malformed input gets no suggestion', () => {
  for (const email of ['', 'sam', '@gmial.com', 'sam@', 'sam@@gmial.com', 'sa m@gmial.com', 'sam@gm ial.com'])
    assert.equal(emailTypoSuggestion(email), null, JSON.stringify(email));
  assert.equal(emailTypoSuggestion(undefined as unknown as string), null);
});

test('confirm email compares trimmed and case-insensitively', () => {
  assert.ok(emailsMatch('Sam@Example.org ', 'sam@example.org'));
  assert.ok(!emailsMatch('sam@example.org', 'sam@example.com'));
});

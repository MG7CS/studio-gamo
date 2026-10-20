import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canceledEmail,
  cleanEmailText,
  codeEmail,
  confirmationEmail,
  eventCanceledEmail,
  eventDecisionEmail,
  invitationEmail,
} from './mail.ts';

const EVIL = 'Eve\r\nBcc: victim@example.com\u202e https://evil.com/login www.evil.com';
const e = { title: EVIL, whenLabel: 'Sat 7 pm', venueLabel: 'Hall, visit http://evil.com' };

const assertSafe = (subject: string, text: string) => {
  assert.ok(!/[\r\n]/.test(subject), `subject has a line break: ${JSON.stringify(subject)}`);
  assert.ok(!/[\u202e\u200b]/.test(subject + text));
  assert.ok(
    !text.replace(/https:\/\/live\.gamostudio\.org\S*/g, '').includes('://'),
    'foreign link survived',
  );
  assert.ok(!/evil\.com/i.test(subject + text), 'attacker address survived');
  assert.ok(!/www\./i.test(subject + text));
};

test('cleanEmailText strips control characters, joins lines and neutralizes links', () => {
  assert.equal(cleanEmailText('Hi\r\nthere\tfriend', 50), 'Hi there friend');
  assert.equal(cleanEmailText('a\u0000b\u202ec\u200bd', 50), 'abcd');
  assert.equal(cleanEmailText('Go to https://evil.com/x now', 100), 'Go to evil dot com/x now');
  assert.ok(!cleanEmailText('Go to https://evil.com/x now', 100).includes('://'));
  assert.ok(!/https?:|www\./i.test(cleanEmailText('HTTP://a.test and www.b.test and ftp://c.test', 100)));
  assert.equal(cleanEmailText('see www.evil.com', 100), 'see evil dot com');
  assert.equal(cleanEmailText('visit evil.com today', 100), 'visit evil dot com today');
  assert.equal(cleanEmailText(null, 10), '');
  assert.equal(cleanEmailText('x'.repeat(50), 10).length, 10);
});

test('cleanEmailText multiline keeps single line breaks but not control characters', () => {
  const out = cleanEmailText('Line one\r\nLine two\n\n\n\nLine three\u0007 https://evil.com', 500, {
    multiline: true,
  });
  assert.equal(out, 'Line one\nLine two\n\nLine three evil dot com');
});

test('every template cleans person-supplied names and titles (no header injection, no attacker links)', () => {
  const mails = [
    codeEmail('a@example.org', EVIL, '123456', e),
    confirmationEmail('a@example.org', EVIL, 2, e, 'https://live.gamostudio.org/registrations/tok', '123456'),
    canceledEmail('a@example.org', EVIL, e),
    invitationEmail('a@example.org', EVIL, EVIL, 'https://live.gamostudio.org/organizer/invite/tok'),
    eventCanceledEmail(
      'a@example.org',
      EVIL,
      { title: EVIL, whenLabel: 'Sat', organizationName: EVIL },
      `Sorry!\r\nSee https://evil.com/refund or www.evil.com`,
    ),
    eventDecisionEmail('a@example.org', {
      title: EVIL,
      decision: 'approved',
      note: 'ok',
      eventUrl: 'https://live.gamostudio.org/events/x',
      manageUrl: 'https://live.gamostudio.org/organizer',
    }),
  ];
  for (const m of mails) assertSafe(m.subject, m.text);
});

test('the recipient address cannot carry extra recipients or line breaks', () => {
  const m = codeEmail('a@example.org\r\nBcc: x@example.org', 'Ann', '123456', e);
  assert.ok(!/[\r\n\s]/.test(m.to));
});

test('the trusted admin note keeps its links but loses control characters; the manage links are untouched', () => {
  const m = eventDecisionEmail('a@example.org', {
    title: 'Night',
    decision: 'changes_requested',
    note: 'Please add the venue.\u0007\u202e See https://live.gamostudio.org/help',
    eventUrl: 'https://live.gamostudio.org/events/x',
    manageUrl: 'https://live.gamostudio.org/organizer/events/x/edit',
  });
  assert.ok(m.text.includes('https://live.gamostudio.org/help'));
  assert.ok(m.text.includes('https://live.gamostudio.org/organizer/events/x/edit'));
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\u0007\u202e]/.test(m.text));
});

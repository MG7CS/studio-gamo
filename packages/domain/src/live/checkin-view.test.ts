import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInMessage, doorSummary } from './checkin-view.ts';
import { checkInWindow } from './events.ts';

const when = (s: number) => `T${s}`;

test('every check-in outcome says what the door volunteer should do', () => {
  assert.deepEqual(checkInMessage({ ok: true, name: 'Ana', partySize: 1 }, when, 0), {
    ok: true,
    message: 'Welcome, Ana. Admit 1 person.',
  });
  assert.equal(
    checkInMessage({ ok: true, name: 'Ben', partySize: 3 }, when, 0).message,
    'Welcome, Ben. Admit 3 people.',
  );
  assert.equal(
    checkInMessage({ ok: false, reason: 'already_admitted', name: 'Ana', checkedInAt: 7 }, when, 0).message,
    'Ana was already admitted at T7.',
  );
  assert.equal(
    checkInMessage({ ok: false, reason: 'already_admitted', name: 'Ana' }, when, 99).message,
    'Ana was already admitted at T99.',
    'without a time it falls back to now',
  );
  assert.match(
    checkInMessage({ ok: false, reason: 'canceled', name: 'Ana' }, when, 0).message,
    /Do not admit/,
  );
  assert.match(checkInMessage({ ok: false, reason: 'outside_window' }, when, 0).message, /Open check-in now/);
  const unknown = checkInMessage({ ok: false, reason: 'unknown_code' }, when, 0);
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /not on this event/);
});

test('the door summary says whether it is open, why, and which button makes sense', () => {
  const starts = 1_000_000;
  const at = (hours: number) => starts + hours * 3600;
  const summary = (now: number, openedAt: number | null = null) =>
    doorSummary(checkInWindow({ startsAt: starts, opensHours: 3, openedAt }, now), 3, when, now);
  const early = summary(at(-5));
  assert.equal(early.title, 'Check-in is closed');
  assert.equal(early.canOpen, true);
  assert.match(early.description, /opens by itself/);
  const open = summary(at(-1));
  assert.equal(open.title, 'Check-in is open');
  assert.match(open.description, /opened 3 hours before/);
  assert.equal(open.canClose, false, 'it opened by itself, so there is nothing to close by hand');
  const manual = summary(at(-5), at(-5));
  assert.equal(manual.title, 'Check-in is open');
  assert.equal(manual.canClose, true);
  const ended = summary(at(13));
  assert.equal(ended.title, 'Check-in is closed');
  assert.equal(ended.canOpen, false, 'nothing to open after the window ended');
  assert.match(ended.description, /ended more than 12 hours ago/);
});

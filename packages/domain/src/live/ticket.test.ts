import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventIcs, icsDate, icsEscape, icsFold, mapsSearchUrl, ticketView } from './ticket.ts';

const base = {
  status: 'confirmed' as const,
  checkedInAt: null,
  hasCheckinCode: true,
  startsAt: 2_000_000_000,
  occurrenceOver: false,
  eventCanceled: false,
  now: 1_900_000_000,
};

test('a confirmed ticket before the event shows the QR, the calendar and cancel', () => {
  const v = ticketView(base);
  assert.equal(v.pill.label, 'Confirmed');
  assert.deepEqual([v.showQr, v.showCalendar, v.canCancel], [true, true, true]);
});

test('no QR when the event has none; no cancel once the date started', () => {
  const noQr = ticketView({ ...base, hasCheckinCode: false });
  assert.equal(noQr.showQr, false);
  assert.equal(noQr.doorHint, 'Give your name at the door.');
  assert.equal(ticketView(base).doorHint, null);
  const started = ticketView({ ...base, startsAt: base.now - 10 });
  assert.equal(started.canCancel, false);
  assert.equal(started.showQr, true, 'still needed at the door while the event is on');
});

test('checked in, canceled, expired, event canceled and ended', () => {
  const checked = ticketView({ ...base, checkedInAt: 1 });
  assert.equal(checked.pill.label, 'Checked in');
  assert.equal(checked.showQr, false);
  assert.equal(ticketView({ ...base, status: 'canceled' }).pill.label, 'Canceled');
  assert.equal(ticketView({ ...base, status: 'canceled' }).state, 'canceled');
  assert.equal(ticketView({ ...base, status: 'expired' }).pill.label, 'Expired');
  assert.equal(ticketView({ ...base, status: 'pending' }).state, 'expired');
  const eventCanceled = ticketView({ ...base, eventCanceled: true });
  assert.equal(eventCanceled.pill.label, 'Event canceled');
  assert.equal(eventCanceled.showQr || eventCanceled.canCancel, false);
  const over = ticketView({ ...base, occurrenceOver: true, startsAt: 1 });
  assert.deepEqual(
    [over.showQr, over.showCalendar, over.showMaps, over.canCancel],
    [false, false, false, false],
  );
  assert.equal(over.note, 'This event has ended.');
});

test('mapsSearchUrl skips empty parts and encodes the rest', () => {
  assert.equal(
    mapsSearchUrl(['Sample Hall', null, '1 Main St', 'Phoenix', 'AZ']),
    'https://www.google.com/maps/search/?api=1&query=Sample%20Hall%2C%201%20Main%20St%2C%20Phoenix%2C%20AZ',
  );
});

test('icsDate is UTC and zero padded', () => {
  assert.equal(icsDate(new Date(Date.UTC(2026, 0, 5, 3, 4, 5))), '20260105T030405Z');
});

test('icsEscape escapes separators and removes injected line breaks and control characters', () => {
  assert.equal(icsEscape('A, B; C\\D'), 'A\\, B\\; C\\\\D');
  assert.equal(icsEscape('Line1\r\nLine2'), 'Line1\\nLine2');
  assert.equal(icsEscape('x\u0000y\u0007z'), 'xyz');
});

test('icsFold keeps every line within 75 octets and never splits a character', () => {
  const folded = icsFold('SUMMARY:' + 'é'.repeat(100));
  for (const line of folded.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), 'SUMMARY:' + 'é'.repeat(100));
});

test('buildEventIcs makes one valid event with CRLF endings and a default length', () => {
  const ics = buildEventIcs({
    uid: 'reg_abc@live.gamostudio.org',
    title: 'Sample night, with friends',
    startsAt: new Date(Date.UTC(2026, 9, 24, 1, 0, 0)),
    location: 'Sample Hall, Phoenix, AZ',
    description: 'Free event\nHosted by Sample Church',
    url: 'https://live.gamostudio.org/events/sample',
    now: new Date(Date.UTC(2026, 9, 19, 12, 0, 0)),
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line break is CRLF');
  assert.match(ics, /DTSTART:20261024T010000Z\r\n/);
  assert.match(ics, /DTEND:20261024T030000Z\r\n/);
  assert.match(ics, /SUMMARY:Sample night\\, with friends\r\n/);
  assert.match(ics, /DESCRIPTION:Free event\\nHosted by Sample Church\r\n/);
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 1);
});

test('buildEventIcs uses the real end time when there is one', () => {
  const ics = buildEventIcs({
    uid: 'u',
    title: 'T',
    startsAt: new Date(Date.UTC(2026, 9, 24, 1, 0, 0)),
    endsAt: new Date(Date.UTC(2026, 9, 24, 2, 30, 0)),
    now: new Date(0),
  });
  assert.match(ics, /DTEND:20261024T023000Z\r\n/);
});

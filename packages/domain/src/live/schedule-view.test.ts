import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizationScheduleView } from './schedule-view.ts';
import type { ScheduledDate } from './events.ts';

const NOW = Date.UTC(2026, 9, 20, 12) / 1000;
const date = (
  id: string,
  eventId: string,
  title: string,
  iso: string,
  extra: Partial<ScheduledDate> = {},
): ScheduledDate => ({
  id,
  eventId,
  title,
  status: 'published',
  timeZone: 'America/Phoenix',
  startsAt: Date.parse(`${iso}T19:00:00-07:00`) / 1000,
  endsAt: null,
  canceled: false,
  confirmedPeople: 0,
  ...extra,
});
const dates = [
  date('a1', 'evt_a', 'Worship Night', '2026-10-25', { confirmedPeople: 3 }),
  date('b1', 'evt_b', 'Youth Concert', '2026-10-25'),
  date('a2', 'evt_a', 'Worship Night', '2026-11-01', { canceled: true }),
  date('c1', 'evt_c', 'Old Retreat', '2026-10-04'),
];

test('the schedule opens on the next date and lists every event on the chosen day, each linking to its page', () => {
  const v = organizationScheduleView({
    dates,
    now: NOW,
    params: new URLSearchParams(''),
    anchor: '#schedule',
  });
  assert.equal(v.chosenDate, '2026-10-25');
  assert.equal(v.chosenLabel, 'Sun, Oct 25, 2026');
  assert.equal(v.total, 4);
  assert.equal(v.upcoming, 2, 'the canceled and the past dates are not upcoming');
  assert.deepEqual(
    v.items.map((i) => i.title),
    ['Worship Night', 'Youth Concert'],
  );
  assert.equal(v.items[0].timeLabel, '7:00 PM');
  assert.equal(v.items[0].confirmedPeople, 3);
  assert.equal(v.items[0].href, '/organizer/events/evt_a?date=2026-10-25#calendar');
  assert.ok(v.model.nextHref!.endsWith('#schedule'));
  const cell = v.model.weeks!.flat().find((c) => c.iso === '2026-10-25')!;
  assert.equal(cell.data!.items.length, 2);
  assert.equal(cell.data!.items[0].detail, 'Worship Night');
});

test('a chosen day and month come from the address; a day without dates is ignored; no dates at all is fine', () => {
  const nov = organizationScheduleView({
    dates,
    now: NOW,
    params: new URLSearchParams('month=2026-11&date=2026-11-01'),
  });
  assert.equal(nov.model.title, 'November 2026');
  assert.equal(nov.items[0].canceled, true);
  const empty = organizationScheduleView({ dates: [], now: NOW, params: new URLSearchParams('') });
  assert.equal(empty.chosenDate, null);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.total, 0);
});

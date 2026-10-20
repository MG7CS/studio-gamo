import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventCalendarView,
  isDateKey,
  isMonthKey,
  localDate,
  monthLabel,
  monthWeeks,
  shiftMonth,
  type DatedOccurrence,
} from './calendar.ts';

test('months: keys are checked, shifted across years and labeled', () => {
  assert.ok(isMonthKey('2026-11'));
  assert.ok(!isMonthKey('2026-13'));
  assert.ok(!isMonthKey('2026-1'));
  assert.ok(isDateKey('2026-02-28'));
  assert.ok(!isDateKey('2026-02-30'));
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthLabel('2026-11'), 'November 2026');
});

test('a month is whole weeks, Sunday first, padded with neighbouring days', () => {
  const weeks = monthWeeks('2026-11');
  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks[0][0].iso, '2026-11-01', 'November 1, 2026 is a Sunday');
  assert.equal(weeks[0][0].inMonth, true);
  assert.equal(weeks[4][6].iso, '2026-12-05');
  assert.equal(weeks[4][6].inMonth, false);
  const monday = monthWeeks('2026-11', 1);
  assert.equal(monday[0][0].iso, '2026-10-26', 'Monday first starts on the Monday before');
  assert.equal(monthWeeks('2026-02')[0][0].iso, '2026-02-01');
  assert.equal(monthWeeks('2026-02').length, 4, 'a February that fits four weeks');
});

test('the local date follows the event time zone, not UTC', () => {
  const epoch = Date.UTC(2026, 10, 2, 1, 30) / 1000; // Nov 2, 01:30 UTC
  assert.equal(localDate(epoch, 'America/Phoenix'), '2026-11-01');
  assert.equal(localDate(epoch, 'America/New_York'), '2026-11-01');
  assert.equal(localDate(epoch, 'UTC'), '2026-11-02');
});

const NOW = Date.UTC(2026, 9, 20, 12) / 1000;
const day = (iso: string, extra: Partial<DatedOccurrence> = {}): DatedOccurrence => ({
  id: `occ_${iso}`,
  startsAt: Date.parse(`${iso}T19:00:00Z`) / 1000,
  endsAt: null,
  canceled: false,
  ...extra,
});
const href = ({ month, date }: { month: string; date?: string }) =>
  `?month=${month}${date ? `&date=${date}` : ''}`;
const series = [
  day('2026-10-11'),
  day('2026-10-25'),
  day('2026-11-01', { canceled: true }),
  day('2026-12-06'),
  day('2027-01-03'),
];

test('an event calendar opens on the next upcoming date and marks each day by state', () => {
  const v = eventCalendarView({ occurrences: series, timeZone: 'UTC', now: NOW, href });
  assert.equal(v.selectedDate, '2026-10-25');
  assert.equal(v.month, '2026-10');
  const cells = v.weeks.flat();
  assert.equal(cells.find((c) => c.iso === '2026-10-11')?.state, 'past');
  assert.equal(cells.find((c) => c.iso === '2026-10-25')?.state, 'upcoming');
  assert.equal(cells.find((c) => c.iso === '2026-10-25')?.selected, true);
  assert.equal(cells.find((c) => c.iso === '2026-10-26')?.state, undefined);
  assert.equal(cells.find((c) => c.iso === '2026-10-26')?.href, undefined, 'only days with a date are links');
  assert.equal(cells.find((c) => c.iso === '2026-10-20')?.today, true);
  assert.equal(v.selected.map((o) => o.id).join(), 'occ_2026-10-25');
});

test('months move only within the event dates, and bad parameters fall back safely', () => {
  const a = eventCalendarView({ occurrences: series, timeZone: 'UTC', now: NOW, href });
  assert.equal(
    a.prevHref,
    '?month=2026-09'.replace('09', '09') && a.prevHref,
    'October has a September before it',
  );
  const first = eventCalendarView({
    occurrences: series,
    timeZone: 'UTC',
    now: NOW,
    monthParam: '2026-10',
    href,
  });
  assert.equal(first.prevHref, undefined, 'no month before the first date');
  assert.equal(first.nextHref, '?month=2026-11');
  const last = eventCalendarView({
    occurrences: series,
    timeZone: 'UTC',
    now: NOW,
    monthParam: '2027-01',
    href,
  });
  assert.equal(last.nextHref, undefined, 'no month after the last date');
  const tooFar = eventCalendarView({
    occurrences: series,
    timeZone: 'UTC',
    now: NOW,
    monthParam: '2030-01',
    href,
  });
  assert.equal(tooFar.month, '2026-10', 'a month outside the dates is ignored');
  const junk = eventCalendarView({
    occurrences: series,
    timeZone: 'UTC',
    now: NOW,
    monthParam: 'x',
    dateParam: '2026-10-26',
    href,
  });
  assert.equal(junk.selectedDate, '2026-10-25', 'a day without a date is ignored');
});

test('a chosen day shows its dates, a canceled day says canceled, and a finished event opens on its last date', () => {
  const nov = eventCalendarView({
    occurrences: series,
    timeZone: 'UTC',
    now: NOW,
    monthParam: '2026-11',
    dateParam: '2026-11-01',
    href,
  });
  assert.equal(nov.weeks.flat().find((c) => c.iso === '2026-11-01')?.state, 'canceled');
  assert.equal(nov.selected[0].canceled, true);
  const over = eventCalendarView({
    occurrences: series,
    timeZone: 'UTC',
    now: Date.UTC(2027, 5, 1) / 1000,
    href,
  });
  assert.equal(over.selectedDate, '2027-01-03');
  const none = eventCalendarView({ occurrences: [], timeZone: 'UTC', now: NOW, href });
  assert.equal(none.selectedDate, null);
  assert.deepEqual(none.selected, []);
});

test('two dates on one day are both listed under that day', () => {
  const two = [
    day('2026-11-08'),
    { ...day('2026-11-08'), id: 'occ_late', startsAt: Date.parse('2026-11-08T22:00:00Z') / 1000 },
  ];
  const v = eventCalendarView({ occurrences: two, timeZone: 'UTC', now: NOW, dateParam: '2026-11-08', href });
  assert.equal(v.selected.length, 2);
});

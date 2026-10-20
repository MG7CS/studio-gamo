import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  calendarModel,
  calendarQuery,
  eventCalendarData,
  isDateKey,
  isMonthKey,
  localDate,
  monthLabel,
  monthWeeks,
  readCalendarState,
  shiftMonth,
  weekDays,
  weekLabel,
  yearBlockStart,
  type CalendarState,
  type DatedOccurrence,
} from './calendar.ts';

test('keys are checked, months shift across years and read in words', () => {
  assert.ok(isMonthKey('2026-11') && !isMonthKey('2026-13') && !isMonthKey('2026-1'));
  assert.ok(isDateKey('2026-02-28') && !isDateKey('2026-02-30'));
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthLabel('2026-11'), 'November 2026');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('a month is whole weeks, Sunday first by default, padded with neighbouring days', () => {
  const weeks = monthWeeks('2026-11');
  assert.equal(weeks.length, 5);
  assert.equal(weeks[0][0].iso, '2026-11-01');
  assert.equal(weeks[4][6].iso, '2026-12-05');
  assert.equal(weeks[4][6].inMonth, false);
  assert.equal(monthWeeks('2026-11', 1)[0][0].iso, '2026-10-26');
  assert.equal(monthWeeks('2026-02').length, 4);
});

test('a week is the seven days around a date, labeled across months and years', () => {
  assert.deepEqual(weekDays('2026-10-28'), [
    '2026-10-25',
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
  ]);
  assert.equal(weekDays('2026-10-28', 1)[0], '2026-10-26');
  assert.equal(weekLabel(weekDays('2026-10-28')), 'Oct 25 – 31, 2026');
  assert.equal(weekLabel(weekDays('2026-11-01')), 'Nov 1 – 7, 2026');
  assert.equal(weekLabel(weekDays('2026-10-28', 1)), 'Oct 26 – Nov 1, 2026');
  assert.equal(weekLabel(weekDays('2026-12-30')), 'Dec 27, 2026 – Jan 2, 2027');
});

test('the local date follows the time zone, not UTC', () => {
  const epoch = Date.UTC(2026, 10, 2, 1, 30) / 1000;
  assert.equal(localDate(epoch, 'America/Phoenix'), '2026-11-01');
  assert.equal(localDate(epoch, 'UTC'), '2026-11-02');
});

const get = (q: string) => new URLSearchParams(q);
const bounds = { min: '2026-10', max: '2027-01' };

test('the address is read safely: bad values fall back, bounds pull a month back in', () => {
  const s = readCalendarState(get(''), { fallbackDate: '2026-10-25', bounds });
  assert.deepEqual(s, {
    mode: 'month',
    picker: null,
    month: '2026-10',
    date: null,
    week: '2026-10-25',
    year: 2026,
  });
  const bad = readCalendarState(get('view=zzz&pick=x&month=nope&date=2026-02-30&week=junk&year=20'), {
    fallbackDate: '2026-10-25',
    bounds,
  });
  assert.equal(bad.mode, 'month');
  assert.equal(bad.picker, null);
  assert.equal(bad.month, '2026-10');
  assert.equal(bad.date, null);
  assert.equal(bad.year, 2026);
  assert.equal(
    readCalendarState(get('month=2030-05'), { fallbackDate: '2026-10-25', bounds }).month,
    '2027-01',
  );
  assert.equal(
    readCalendarState(get('month=2020-05'), { fallbackDate: '2026-10-25', bounds }).month,
    '2026-10',
  );
  const w = readCalendarState(get('view=week&week=2026-11-04&date=2026-11-04'), {
    fallbackDate: '2026-10-25',
    bounds,
  });
  assert.equal(w.mode, 'week');
  assert.equal(w.month, '2026-11', 'the month follows the week');
  assert.equal(readCalendarState(get('pick=years&year=2031'), { fallbackDate: '2026-10-25' }).year, 2031);
});

test('a state becomes a short address and reads back the same', () => {
  const state: CalendarState = {
    mode: 'week',
    picker: null,
    month: '2026-11',
    date: '2026-11-04',
    week: '2026-11-04',
    year: 2026,
  };
  const q = calendarQuery(state, get('tab=a&date=old'));
  assert.equal(q, '?tab=a&view=week&week=2026-11-04&date=2026-11-04');
  assert.deepEqual(readCalendarState(get(q), { fallbackDate: '2026-10-25' }), state);
  assert.equal(calendarQuery({ ...state, mode: 'month', date: null }), '?month=2026-11');
});

const NOW = Date.UTC(2026, 9, 20, 12) / 1000;
const occ = (iso: string, extra: Partial<DatedOccurrence> = {}): DatedOccurrence => ({
  id: `occ_${iso}`,
  startsAt: Date.parse(`${iso}T19:00:00Z`) / 1000,
  endsAt: null,
  canceled: false,
  ...extra,
});
const series = [
  occ('2026-10-11'),
  occ('2026-10-25'),
  occ('2026-11-01', { canceled: true }),
  occ('2026-12-06'),
  occ('2027-01-03'),
];
const data = eventCalendarData({
  occurrences: series,
  timeZone: 'UTC',
  now: NOW,
  describe: (o) => ({ label: '7 PM', detail: o.id }),
});
const href = (s: CalendarState) => calendarQuery(s);
const model = (state: CalendarState, selectable: 'all' | 'marked' = 'marked') =>
  calendarModel({ state, today: data.today, days: data.days, bounds: data.bounds, selectable, href });
const open = readCalendarState(get(''), { fallbackDate: data.openOn, bounds: data.bounds });

test('event dates become days: upcoming, past, canceled, with the bounds of the series', () => {
  assert.equal(data.openOn, '2026-10-25');
  assert.equal(data.today, '2026-10-20');
  assert.deepEqual(data.bounds, { min: '2026-10', max: '2027-01' });
  assert.equal(data.days['2026-10-11'].state, 'past');
  assert.equal(data.days['2026-10-25'].state, 'upcoming');
  assert.equal(data.days['2026-11-01'].state, 'canceled');
  assert.equal(data.days['2026-10-25'].items[0].detail, 'occ_2026-10-25');
});

test('the month view links only days with dates, marks the chosen day and today, and moves within the dates', () => {
  const m = model({ ...open, date: '2026-10-25' });
  assert.equal(m.kind, 'month');
  assert.equal(m.title, 'October 2026');
  const cells = m.weeks!.flat();
  assert.equal(cells.find((c) => c.iso === '2026-10-25')!.selected, true);
  assert.equal(cells.find((c) => c.iso === '2026-10-20')!.today, true);
  assert.equal(cells.find((c) => c.iso === '2026-10-26')!.href, undefined, 'marked days only');
  const anyDay = model({ ...open, date: '2026-10-25' }, 'all').weeks!.flat();
  assert.ok(
    anyDay.find((c) => c.iso === '2026-10-26')!.href!.includes('date=2026-10-26'),
    'any day when selectable is all',
  );
  assert.ok(cells.find((c) => c.iso === '2026-10-25')!.href!.includes('date=2026-10-25'));
  assert.equal(m.prevHref, undefined, 'nothing before the first month');
  assert.ok(m.nextHref!.includes('month=2026-11'));
  assert.equal(m.todayHref, undefined, 'already in the month of today');
  assert.ok(model({ ...open, month: '2026-12' }).todayHref!.includes('month=2026-10'));
  assert.equal(model({ ...open, month: '2027-01' }).nextHref, undefined);
});

test('the title opens the month picker, then the year picker; choosing goes back down', () => {
  const m = model(open);
  assert.ok(m.titleHref!.includes('pick=months') && m.titleHref!.includes('year=2026'));
  const months = model({ ...open, picker: 'months', year: 2026 });
  assert.equal(months.kind, 'months');
  assert.equal(months.title, '2026');
  assert.equal(months.months!.length, 12);
  const oct = months.months!.find((x) => x.label === 'Oct')!;
  assert.equal(oct.current, true);
  assert.equal(oct.count, 2, 'two days with dates in October');
  assert.ok(oct.href!.includes('month=2026-10') && !oct.href!.includes('pick='));
  assert.equal(
    months.months!.find((x) => x.label === 'Jan')!.href,
    undefined,
    'a month before the first date is not a link',
  );
  assert.equal(months.months!.find((x) => x.label === 'Dec')!.count, 1);
  assert.equal(months.prevHref, undefined, 'no year before the first date');
  assert.ok(months.nextHref!.includes('year=2027'));
  assert.ok(months.titleHref!.includes('pick=years'));
  const years = model({ ...open, picker: 'years', year: 2026 });
  assert.equal(years.kind, 'years');
  assert.equal(years.years!.length, 12);
  assert.equal(years.title, `${yearBlockStart(2026)} – ${yearBlockStart(2026) + 11}`);
  const y2027 = years.years!.find((x) => x.label === '2027')!;
  assert.ok(y2027.href!.includes('pick=months') && y2027.href!.includes('year=2027'));
  assert.equal(y2027.count, 1);
  assert.equal(
    years.years!.find((x) => x.label === '2016')!.href,
    undefined,
    'a year before the first date is not a link',
  );
});

test('the week view shows seven days, moves a week at a time and switches back to the month', () => {
  const w = model({ ...open, mode: 'week', week: '2026-10-25', date: '2026-10-25' });
  assert.equal(w.kind, 'week');
  assert.equal(w.days!.length, 7);
  assert.equal(w.title, 'Oct 25 – 31, 2026');
  assert.equal(w.days![0].data?.items.length, 1);
  assert.ok(w.prevHref!.includes('week=2026-10-18'), 'October is still inside the dates');
  assert.equal(
    model({ ...open, mode: 'week', week: '2026-09-27' }).prevHref,
    undefined,
    'the week before the first week of dates is not offered',
  );
  assert.ok(w.nextHref!.includes('week=2026-11-01'));
  assert.ok(w.modes.month.href!.includes('month=2026-10'));
  assert.equal(w.modes.week.active, true);
  const m = model({ ...open, date: '2026-10-25' });
  assert.ok(m.modes.week.href!.includes('view=week') && m.modes.week.href!.includes('week=2026-10-25'));
  assert.equal(m.modes.month.active, true);
});

test('dates from several events in different zones keep their own local day', () => {
  const two = [
    { ...occ('2026-11-02'), startsAt: Date.UTC(2026, 10, 2, 2) / 1000, zone: 'America/Phoenix' },
    { ...occ('2026-11-02'), id: 'b', startsAt: Date.UTC(2026, 10, 2, 2) / 1000, zone: 'UTC' },
  ];
  const d = eventCalendarData({
    occurrences: two,
    timeZone: (o) => o.zone,
    now: NOW,
    describe: () => ({ label: 'x' }),
  });
  assert.deepEqual(Object.keys(d.days).sort(), ['2026-11-01', '2026-11-02']);
});

test('an event with no dates still gives a calendar for today', () => {
  const none = eventCalendarData({
    occurrences: [],
    timeZone: 'UTC',
    now: NOW,
    describe: () => ({ label: '' }),
  });
  assert.equal(none.openOn, '2026-10-20');
  assert.deepEqual(none.bounds, {});
  assert.equal(none.firstDate, null);
});

test('Today moves to today and chooses that day only when it has a date', () => {
  const away = model({ ...open, month: '2026-12' });
  assert.ok(away.todayHref!.includes('month=2026-10'));
  assert.ok(!away.todayHref!.includes('date=2026-10-20'), 'an empty day is not chosen');
  const withDate = eventCalendarData({
    occurrences: [occ('2026-10-20'), occ('2026-12-06')],
    timeZone: 'UTC',
    now: NOW,
    describe: () => ({ label: 'x' }),
  });
  const m = calendarModel({
    state: { ...open, month: '2026-12' },
    today: withDate.today,
    days: withDate.days,
    bounds: withDate.bounds,
    href,
  });
  assert.ok(m.todayHref!.includes('date=2026-10-20'), 'a day that has a date is chosen');
});

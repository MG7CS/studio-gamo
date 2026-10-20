/**
 * Month calendars: the grid of a month, moving between months, and the view of an event's dates on a calendar
 * (which days have a date, whether it is upcoming, past or canceled, which day is selected). Pure and unit-tested;
 * the `Calendar` component only draws what this returns, so any screen can show dates the same way.
 */

/** A month as "YYYY-MM". */
export type MonthKey = string;
export const isMonthKey = (value: unknown): value is MonthKey =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Rebuilding the date catches days that do not exist (February 30 would roll into March).
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (month: MonthKey) => ({ y: Number(month.slice(0, 4)), m: Number(month.slice(5, 7)) });

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const { y, m } = parts(month);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthOfDate(date: string): MonthKey {
  return date.slice(0, 7);
}

/** "November 2026". */
export function monthLabel(month: MonthKey): string {
  const { y, m } = parts(month);
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1, 12)),
  );
}

export interface CalendarCell {
  /** YYYY-MM-DD. */
  iso: string;
  day: number;
  inMonth: boolean;
}

/** The weeks of a month (Sunday first unless `weekStart` is 1), padded with the neighbouring months' days. */
export function monthWeeks(month: MonthKey, weekStart: 0 | 1 = 0): CalendarCell[][] {
  const { y, m } = parts(month);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() - weekStart + 7) % 7;
  const total = Math.ceil((offset + new Date(Date.UTC(y, m, 0)).getUTCDate()) / 7) * 7;
  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < total; i += 7) {
    weeks.push(
      Array.from({ length: 7 }, (_, j) => {
        const d = new Date(Date.UTC(y, m - 1, 1 - offset + i + j));
        const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
        return { iso, day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
      }),
    );
  }
  return weeks;
}

/** The local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(epochSeconds: number, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochSeconds * 1000));
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export interface DatedOccurrence {
  id: string;
  startsAt: number;
  endsAt: number | null;
  canceled: boolean;
}

export type DayState = 'upcoming' | 'past' | 'canceled';

export interface CalendarViewCell extends CalendarCell {
  state?: DayState;
  selected: boolean;
  today: boolean;
  /** Set only for days that have a date, so they are the only links. */
  href?: string;
}

export interface EventCalendarView {
  month: MonthKey;
  label: string;
  weeks: CalendarViewCell[][];
  prevHref?: string;
  nextHref?: string;
  /** The selected day, if the event has any date. */
  selectedDate: string | null;
  /** The occurrences on the selected day, in time order. */
  selected: DatedOccurrence[];
  firstDate: string | null;
  lastDate: string | null;
}

/**
 * Lays an event's dates on a month calendar. The month and the selected day come from the address (`monthParam`,
 * `dateParam`) but only when they are real: a month outside the event's dates or a day without a date falls back to
 * the next upcoming date (else the last one). Previous and next months exist only within the event's dates, so
 * nobody pages through empty years.
 */
export function eventCalendarView(input: {
  occurrences: readonly DatedOccurrence[];
  timeZone: string;
  now: number;
  monthParam?: string | null;
  dateParam?: string | null;
  /** Builds the link for a day or month change; the page keeps its own address scheme. */
  href: (target: { month: MonthKey; date?: string }) => string;
}): EventCalendarView {
  const sorted = [...input.occurrences].sort((a, b) => a.startsAt - b.startsAt);
  const byDay = new Map<string, DatedOccurrence[]>();
  for (const o of sorted) {
    const day = localDate(o.startsAt, input.timeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), o]);
  }
  const dayState = (list: DatedOccurrence[]): DayState => {
    const live = list.filter((o) => !o.canceled);
    if (live.length === 0) return 'canceled';
    return live.some((o) => (o.endsAt ?? o.startsAt) > input.now) ? 'upcoming' : 'past';
  };
  const days = [...byDay.keys()].sort();
  const nextUpcoming = sorted.find((o) => !o.canceled && (o.endsAt ?? o.startsAt) > input.now);
  const fallbackDate = nextUpcoming
    ? localDate(nextUpcoming.startsAt, input.timeZone)
    : (days[days.length - 1] ?? null);
  const selectedDate =
    isDateKey(input.dateParam) && byDay.has(input.dateParam) ? input.dateParam : fallbackDate;
  const firstDate = days[0] ?? null;
  const lastDate = days[days.length - 1] ?? null;
  const today = localDate(input.now, input.timeZone);
  const firstMonth = firstDate ? monthOfDate(firstDate) : monthOfDate(today);
  const lastMonth = lastDate ? monthOfDate(lastDate) : firstMonth;
  let month: MonthKey = selectedDate ? monthOfDate(selectedDate) : firstMonth;
  if (isMonthKey(input.monthParam) && input.monthParam >= firstMonth && input.monthParam <= lastMonth)
    month = input.monthParam;

  const weeks = monthWeeks(month).map((week) =>
    week.map((cell): CalendarViewCell => {
      const list = cell.inMonth ? byDay.get(cell.iso) : undefined;
      return {
        ...cell,
        state: list ? dayState(list) : undefined,
        selected: cell.inMonth && cell.iso === selectedDate,
        today: cell.inMonth && cell.iso === today,
        href: list ? input.href({ month, date: cell.iso }) : undefined,
      };
    }),
  );
  return {
    month,
    label: monthLabel(month),
    weeks,
    prevHref: month > firstMonth ? input.href({ month: shiftMonth(month, -1) }) : undefined,
    nextHref: month < lastMonth ? input.href({ month: shiftMonth(month, 1) }) : undefined,
    selectedDate,
    selected: selectedDate ? (byDay.get(selectedDate) ?? []) : [],
    firstDate,
    lastDate,
  };
}

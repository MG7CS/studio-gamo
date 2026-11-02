/**
 * A calendar that any screen can use: months, weeks, a month picker and a year picker, with the state of the view kept
 * in the address (plain links, no JavaScript). This file is the whole behaviour: the grid of a month or a week, moving
 * between them, what the toolbar offers, and which day, week or year is showing. The `Calendar` component (in the UI
 * package) only draws the model returned here, so the organizer's event dates, a booking calendar or an availability
 * picker in another app all behave the same.
 *
 * Address parameters (all optional, all checked; bad values fall back to something real):
 *   view=month|week   which view          pick=months|years   an open picker
 *   month=YYYY-MM     the month shown      date=YYYY-MM-DD     the chosen day
 *   week=YYYY-MM-DD   any day of the week shown (week view)      year=YYYY   the year of an open picker
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
export const isYear = (value: unknown): value is string => typeof value === 'string' && /^\d{4}$/.test(value);

const pad = (n: number) => String(n).padStart(2, '0');
const parts = (month: MonthKey) => ({ y: Number(month.slice(0, 4)), m: Number(month.slice(5, 7)) });
const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);
const isoOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fmt = (d: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(d);

export function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const { y, m } = parts(month);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export const monthOfDate = (date: string): MonthKey => date.slice(0, 7);
export const addDays = (date: string, days: number): string =>
  isoOf(new Date(utc(date).getTime() + days * 86_400_000));

/** "November 2026". */
export function monthLabel(month: MonthKey): string {
  const { y, m } = parts(month);
  return fmt(new Date(Date.UTC(y, m - 1, 1, 12)), { month: 'long', year: 'numeric' });
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
        return { iso: isoOf(d), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
      }),
    );
  }
  return weeks;
}

/** The seven days of the week that contains `date`. */
export function weekDays(date: string, weekStart: 0 | 1 = 0): string[] {
  const offset = (utc(date).getUTCDay() - weekStart + 7) % 7;
  const first = addDays(date, -offset);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** "Oct 25 – 31, 2026", "Oct 28 – Nov 3, 2026" or "Dec 28, 2026 – Jan 3, 2027". */
export function weekLabel(days: readonly string[]): string {
  const a = utc(days[0]);
  const b = utc(days[days.length - 1]);
  if (a.getUTCFullYear() !== b.getUTCFullYear())
    return `${fmt(a, { month: 'short', day: 'numeric', year: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  if (a.getUTCMonth() !== b.getUTCMonth())
    return `${fmt(a, { month: 'short', day: 'numeric' })} – ${fmt(b, { month: 'short', day: 'numeric' })}, ${a.getUTCFullYear()}`;
  return `${fmt(a, { month: 'short', day: 'numeric' })} – ${b.getUTCDate()}, ${a.getUTCFullYear()}`;
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

// --- State -----------------------------------------------------------------------------------------------

export type CalendarMode = 'month' | 'week';
export type CalendarPicker = 'months' | 'years' | null;

export interface CalendarState {
  mode: CalendarMode;
  picker: CalendarPicker;
  /** The month shown (month view), or the month of the week shown. */
  month: MonthKey;
  /** The chosen day, if any. */
  date: string | null;
  /** Any day of the week shown (week view). */
  week: string;
  /** The year an open picker is centered on. */
  year: number;
}

export interface CalendarBounds {
  /** The first and last month that may be shown (inclusive). Unbounded when left out. */
  min?: MonthKey;
  max?: MonthKey;
}

const clampMonth = (month: MonthKey, b: CalendarBounds): MonthKey =>
  b.min && month < b.min ? b.min : b.max && month > b.max ? b.max : month;

/**
 * The view an address asks for, made safe: unknown values are ignored, a month or week outside the bounds is pulled
 * back in, and anything missing falls back to `fallbackDate` (the day to open on) so the calendar always shows
 * something real.
 */
export function readCalendarState(
  params: URLSearchParams | { get(name: string): string | null },
  input: { fallbackDate: string; bounds?: CalendarBounds },
): CalendarState {
  const bounds = input.bounds ?? {};
  const get = (k: string) => params.get(k);
  const mode: CalendarMode = get('view') === 'week' ? 'week' : 'month';
  const picker: CalendarPicker =
    get('pick') === 'months' ? 'months' : get('pick') === 'years' ? 'years' : null;
  const date = isDateKey(get('date')) ? (get('date') as string) : null;
  const anchor = date ?? input.fallbackDate;
  let week = isDateKey(get('week')) ? (get('week') as string) : anchor;
  let month = clampMonth(isMonthKey(get('month')) ? (get('month') as string) : monthOfDate(anchor), bounds);
  // A week outside the bounds is pulled back to the nearest day inside.
  if (bounds.min && monthOfDate(week) < bounds.min) week = `${bounds.min}-01`;
  if (bounds.max && monthOfDate(week) > bounds.max) week = weekDays(`${bounds.max}-01`)[0];
  if (mode === 'week') month = monthOfDate(week);
  const year = isYear(get('year')) ? Number(get('year')) : Number(month.slice(0, 4));
  return { mode, picker, month, date, week, year };
}

/** The address query for a state, leaving out what is the default so addresses stay short. */
export function calendarQuery(state: CalendarState, extra?: URLSearchParams): string {
  const q = new URLSearchParams(extra);
  for (const k of ['view', 'pick', 'month', 'date', 'week', 'year']) q.delete(k);
  if (state.mode === 'week') q.set('view', 'week');
  if (state.picker) q.set('pick', state.picker);
  if (state.mode === 'week') q.set('week', state.week);
  else q.set('month', state.month);
  if (state.date) q.set('date', state.date);
  if (state.picker) q.set('year', String(state.year));
  return `?${q.toString()}`;
}

// --- The model the component draws --------------------------------------------------------------------------

export type DayState = 'upcoming' | 'past' | 'canceled';
export interface DayItem {
  /** Short text for a cell or week column, e.g. "7:00 PM". */
  label: string;
  /** A second, quieter line, e.g. "3 registered". */
  detail?: string;
  state: DayState;
  /** Where this item leads, when it is more than a label (an event's page). */
  href?: string;
}
export interface DayData {
  state: DayState;
  items: DayItem[];
}

export interface ModelCell extends CalendarCell {
  data?: DayData;
  selected: boolean;
  today: boolean;
  href?: string;
}
export interface ModelLink {
  label: string;
  href?: string;
  active?: boolean;
}

export interface CalendarModel {
  kind: 'month' | 'week' | 'months' | 'years';
  /** The text of the toolbar title, e.g. "October 2026". */
  title: string;
  /** Pressing the title opens the month picker, or (inside it) the year picker. */
  titleHref?: string;
  prevHref?: string;
  nextHref?: string;
  prevLabel: string;
  nextLabel: string;
  /** Back to today's month or week; absent when already there or out of bounds. */
  todayHref?: string;
  modes: { month: ModelLink; week: ModelLink };
  weeks?: ModelCell[][];
  days?: ModelCell[];
  months?: Array<ModelLink & { count: number; current: boolean }>;
  years?: Array<ModelLink & { count: number; current: boolean }>;
  /** A way out of an open picker. */
  closeHref?: string;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The first year of the 12-year block a picker shows for `year`. */
export const yearBlockStart = (year: number): number => Math.floor(year / 12) * 12;

export function calendarModel(input: {
  state: CalendarState;
  today: string;
  days: Readonly<Record<string, DayData>>;
  bounds?: CalendarBounds;
  weekStart?: 0 | 1;
  /**
   * Which days can be chosen: `all` (a booking calendar: any day) or `marked` (only days that have something, as for an
   * event's dates). Default `all`.
   */
  selectable?: 'all' | 'marked';
  /** Builds the address for a state; the page decides the path and keeps its other parameters. */
  href: (state: CalendarState) => string;
}): CalendarModel {
  const { state, today, days, href } = input;
  const bounds = input.bounds ?? {};
  const weekStart = input.weekStart ?? 0;
  const inBounds = (m: MonthKey) => (!bounds.min || m >= bounds.min) && (!bounds.max || m <= bounds.max);
  const to = (patch: Partial<CalendarState>): string => href({ ...state, picker: null, ...patch });
  const countIn = (prefix: string) => Object.keys(days).filter((d) => d.startsWith(prefix)).length;
  const todayMonth = monthOfDate(today);
  const modeFocus = state.date ?? (monthOfDate(today) === state.month ? today : `${state.month}-01`);

  const modes = {
    month: {
      label: 'Month',
      active: state.mode === 'month' && !state.picker,
      href: to({ mode: 'month', month: monthOfDate(state.mode === 'week' ? state.week : modeFocus) }),
    },
    week: {
      label: 'Week',
      active: state.mode === 'week' && !state.picker,
      href: to({ mode: 'week', week: state.mode === 'week' ? state.week : modeFocus }),
    },
  };
  const base = { prevLabel: 'Previous', nextLabel: 'Next', modes };

  // Year picker: 12 years, a link for each year that has something inside the bounds.
  if (state.picker === 'years') {
    const start = yearBlockStart(state.year);
    const minY = bounds.min ? Number(bounds.min.slice(0, 4)) : -Infinity;
    const maxY = bounds.max ? Number(bounds.max.slice(0, 4)) : Infinity;
    return {
      ...base,
      kind: 'years',
      title: `${start} – ${start + 11}`,
      prevLabel: 'Previous 12 years',
      nextLabel: 'Next 12 years',
      prevHref: start - 12 + 11 >= minY ? href({ ...state, year: start - 1 }) : undefined,
      nextHref: start + 12 <= maxY ? href({ ...state, year: start + 12 }) : undefined,
      closeHref: to({ picker: 'months', year: state.year }),
      years: Array.from({ length: 12 }, (_, i) => {
        const y = start + i;
        const ok = y >= minY && y <= maxY;
        return {
          label: String(y),
          count: countIn(`${y}-`),
          current: y === Number(state.month.slice(0, 4)),
          href: ok ? href({ ...state, picker: 'months', year: y }) : undefined,
        };
      }),
    };
  }

  // Month picker: the 12 months of a year; the year title opens the year picker.
  if (state.picker === 'months') {
    return {
      ...base,
      kind: 'months',
      title: String(state.year),
      titleHref: href({ ...state, picker: 'years', year: state.year }),
      prevLabel: 'Previous year',
      nextLabel: 'Next year',
      prevHref:
        inBounds(`${state.year - 1}-12`) || (bounds.min ? bounds.min < `${state.year}-01` : true)
          ? href({ ...state, year: state.year - 1 })
          : undefined,
      nextHref: bounds.max
        ? bounds.max >= `${state.year + 1}-01`
          ? href({ ...state, year: state.year + 1 })
          : undefined
        : href({ ...state, year: state.year + 1 }),
      closeHref: to({}),
      months: MONTH_NAMES.map((name, i) => {
        const key = `${state.year}-${pad(i + 1)}`;
        return {
          label: name,
          count: countIn(`${key}-`),
          current: key === state.month,
          href: inBounds(key) ? to({ mode: 'month', month: key }) : undefined,
        };
      }),
    };
  }

  const cellFor = (c: CalendarCell, show: boolean): ModelCell => ({
    ...c,
    data: show ? days[c.iso] : undefined,
    selected: show && c.iso === state.date,
    today: show && c.iso === today,
    href:
      show && (input.selectable === 'marked' ? Boolean(days[c.iso]) : true)
        ? to({ date: c.iso, ...(state.mode === 'month' ? { month: state.month } : { week: state.week }) })
        : undefined,
  });

  if (state.mode === 'week') {
    const week = weekDays(state.week, weekStart);
    const prev = addDays(week[0], -7);
    const next = addDays(week[0], 7);
    const weekOk = (d: string) => inBounds(monthOfDate(d));
    return {
      ...base,
      kind: 'week',
      title: weekLabel(week),
      titleHref: href({ ...state, picker: 'months', year: Number(monthOfDate(week[0]).slice(0, 4)) }),
      prevLabel: 'Previous week',
      nextLabel: 'Next week',
      prevHref: weekOk(addDays(week[0], -1)) ? to({ week: prev }) : undefined,
      nextHref: weekOk(next) ? to({ week: next }) : undefined,
      todayHref:
        weekDays(today, weekStart)[0] === week[0] || !weekOk(today)
          ? undefined
          : to({ week: today, ...(days[today] ? { date: today } : {}) }),
      days: week.map((iso) => cellFor({ iso, day: Number(iso.slice(8)), inMonth: true }, true)),
    };
  }

  const month = state.month;
  return {
    ...base,
    kind: 'month',
    title: monthLabel(month),
    titleHref: href({ ...state, picker: 'months', year: Number(month.slice(0, 4)) }),
    prevLabel: 'Previous month',
    nextLabel: 'Next month',
    prevHref: inBounds(shiftMonth(month, -1)) ? to({ month: shiftMonth(month, -1) }) : undefined,
    nextHref: inBounds(shiftMonth(month, 1)) ? to({ month: shiftMonth(month, 1) }) : undefined,
    todayHref:
      month === todayMonth || !inBounds(todayMonth)
        ? undefined
        : to({ month: todayMonth, ...(days[today] ? { date: today } : {}) }),
    weeks: monthWeeks(month, weekStart).map((w) => w.map((c) => cellFor(c, c.inMonth))),
  };
}

// --- An event's dates --------------------------------------------------------------------------------------

export interface DatedOccurrence {
  id: string;
  startsAt: number;
  endsAt: number | null;
  canceled: boolean;
}

export interface EventCalendarData<T extends DatedOccurrence = DatedOccurrence> {
  days: Record<string, DayData>;
  byDay: Map<string, T[]>;
  bounds: CalendarBounds;
  firstDate: string | null;
  lastDate: string | null;
  /** The day to open on: the next upcoming date, else the last one, else today. */
  openOn: string;
  today: string;
}

/**
 * Lays dates on a calendar's days. `describe` gives each date its short texts (the time, how many registered, where it
 * leads); the state of a day is upcoming when any of its dates still is, canceled when all are. Dates may come from
 * several events in different time zones: pass `timeZone` as a function of the date.
 */
export function eventCalendarData<T extends DatedOccurrence>(input: {
  occurrences: readonly T[];
  timeZone: string | ((o: T) => string);
  now: number;
  /** The zone "today" is judged in (a single event's zone, or the viewer's). */
  todayZone?: string;
  describe: (o: T) => { label: string; detail?: string; href?: string };
}): EventCalendarData<T> {
  const zone = (o: T) => (typeof input.timeZone === 'function' ? input.timeZone(o) : input.timeZone);
  const sorted = [...input.occurrences].sort((a, b) => a.startsAt - b.startsAt);
  const byDay = new Map<string, T[]>();
  for (const o of sorted) {
    const day = localDate(o.startsAt, zone(o));
    byDay.set(day, [...(byDay.get(day) ?? []), o]);
  }
  const stateOf = (o: T): DayState =>
    o.canceled ? 'canceled' : (o.endsAt ?? o.startsAt) > input.now ? 'upcoming' : 'past';
  const days: Record<string, DayData> = {};
  for (const [iso, list] of byDay) {
    const items = list.map((o) => ({ ...input.describe(o), state: stateOf(o) }));
    const live = items.filter((i) => i.state !== 'canceled');
    days[iso] = {
      state: live.length === 0 ? 'canceled' : live.some((i) => i.state === 'upcoming') ? 'upcoming' : 'past',
      items,
    };
  }
  const keys = [...byDay.keys()].sort();
  const next = sorted.find((o) => stateOf(o) === 'upcoming');
  const todayZone = input.todayZone ?? (sorted[0] ? zone(sorted[0]) : 'UTC');
  const today = localDate(input.now, todayZone);
  return {
    days,
    byDay,
    today,
    firstDate: keys[0] ?? null,
    lastDate: keys[keys.length - 1] ?? null,
    bounds: keys.length ? { min: monthOfDate(keys[0]), max: monthOfDate(keys[keys.length - 1]) } : {},
    openOn: next ? localDate(next.startsAt, zone(next)) : (keys[keys.length - 1] ?? today),
  };
}

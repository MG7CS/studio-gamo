/**
 * The organizer's whole schedule on one calendar (the Overview): every date of every public or in-review event, in
 * the calendar's days, with the chosen day's dates listed beside it. Pure: the page passes the dates, the clock and
 * the address, and draws what comes back.
 */
import {
  calendarModel,
  calendarQuery,
  eventCalendarData,
  readCalendarState,
  type CalendarModel,
} from '../calendar.ts';
import { checkInWindow, type ScheduledDate } from './events.ts';

export interface ScheduleDayItem {
  id: string;
  eventId: string;
  title: string;
  timeLabel: string;
  status: string;
  canceled: boolean;
  past: boolean;
  confirmedPeople: number;
  /** The event's page, opened on this date. */
  href: string;
  /** The door is open for this date now: the person can go straight to check-in. */
  checkInOpen: boolean;
  checkInHref: string;
}

/** A date whose check-in is open right now (shown first on the overview, one press from the door). */
export interface OpenCheckIn {
  occurrenceId: string;
  eventId: string;
  title: string;
  timeLabel: string;
  href: string;
}

export interface OrganizationScheduleView {
  model: CalendarModel;
  chosenDate: string | null;
  chosenLabel: string | null;
  items: ScheduleDayItem[];
  total: number;
  upcoming: number;
  /** Dates of public events whose check-in is open now, soonest first. */
  openNow: OpenCheckIn[];
}

const timeOf = (epoch: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(epoch * 1000),
  );

export function organizationScheduleView(input: {
  dates: readonly ScheduledDate[];
  now: number;
  params: URLSearchParams | { get(name: string): string | null };
  /** The fragment to scroll to after a link, e.g. "#schedule". */
  anchor?: string;
}): OrganizationScheduleView {
  const anchor = input.anchor ?? '';
  const data = eventCalendarData({
    occurrences: input.dates,
    timeZone: (d) => d.timeZone,
    todayZone: input.dates[0]?.timeZone ?? 'America/Phoenix',
    now: input.now,
    describe: (d) => ({
      label: timeOf(d.startsAt, d.timeZone),
      detail: d.title,
      href: `/organizer/events/${d.eventId}`,
    }),
  });
  const state = readCalendarState(input.params, { fallbackDate: data.openOn, bounds: data.bounds });
  const chosenDate = state.date ?? (data.byDay.has(data.openOn) ? data.openOn : null);
  const model = calendarModel({
    state: { ...state, date: chosenDate },
    today: data.today,
    days: data.days,
    bounds: data.bounds,
    selectable: 'marked',
    href: (s) => `${calendarQuery(s)}${anchor}`,
  });
  const onDay = chosenDate ? (data.byDay.get(chosenDate) ?? []) : [];
  const doorOpen = (d: ScheduledDate) =>
    d.status === 'published' &&
    !d.canceled &&
    !!d.checkIn?.enabled &&
    checkInWindow(
      { startsAt: d.startsAt, opensHours: d.checkIn.opensHours, openedAt: d.checkIn.openedAt },
      input.now,
    ).open;
  return {
    model,
    chosenDate,
    chosenLabel: chosenDate
      ? new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${chosenDate}T12:00:00Z`))
      : null,
    items: onDay.map((d) => ({
      id: d.id,
      eventId: d.eventId,
      title: d.title,
      timeLabel: timeOf(d.startsAt, d.timeZone),
      status: d.status,
      canceled: d.canceled,
      past: (d.endsAt ?? d.startsAt) <= input.now,
      confirmedPeople: d.confirmedPeople,
      href: `/organizer/events/${d.eventId}?date=${chosenDate}#calendar`,
      checkInOpen: doorOpen(d),
      checkInHref: `/organizer/door/${d.id}?mode=checkin`,
    })),
    total: input.dates.length,
    upcoming: input.dates.filter((d) => !d.canceled && (d.endsAt ?? d.startsAt) > input.now).length,
    openNow: input.dates.filter(doorOpen).map((d) => ({
      occurrenceId: d.id,
      eventId: d.eventId,
      title: d.title,
      timeLabel: timeOf(d.startsAt, d.timeZone),
      href: `/organizer/door/${d.id}?mode=checkin`,
    })),
  };
}

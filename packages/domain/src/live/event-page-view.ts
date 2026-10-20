/**
 * What the organizer's event page can offer, as pure functions: which actions an event's status allows, and the dates
 * calendar with the chosen day. The page only passes the event, the clock and the address, and draws what comes back.
 */
import {
  calendarModel,
  calendarQuery,
  eventCalendarData,
  readCalendarState,
  type CalendarModel,
} from '../calendar.ts';
import type { OrganizerEventDetail } from './events.ts';

const EDITABLE = ['draft', 'pending_review', 'changes_requested', 'rejected', 'published'];
const REMOVABLE = ['draft', 'pending_review', 'changes_requested', 'rejected'];
const SUBMITTABLE = ['draft', 'changes_requested', 'rejected'];

export interface EventPermissions {
  canSubmit: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canDelete: boolean;
}

/** What can be done with an event now. Nothing can be changed while the organization is suspended. */
export function eventPermissions(status: string, organizationActive: boolean): EventPermissions {
  return {
    canSubmit: organizationActive && SUBMITTABLE.includes(status),
    canEdit: organizationActive && EDITABLE.includes(status),
    canCancel: organizationActive && status === 'published',
    canDelete: organizationActive && REMOVABLE.includes(status),
  };
}

export interface EventDatesView {
  model: CalendarModel;
  chosenDate: string;
  chosenLabel: string | null;
  selectedIds: string[];
}

const timeOf = (epoch: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(epoch * 1000),
  );

export function eventDatesView(input: {
  event: Pick<OrganizerEventDetail, 'occurrences' | 'admission'>;
  timeZone: string;
  now: number;
  params: URLSearchParams | { get(name: string): string | null };
}): EventDatesView {
  const { event, timeZone: tz } = input;
  const data = eventCalendarData({
    occurrences: event.occurrences,
    timeZone: tz,
    now: input.now,
    describe: (o) => ({
      label: timeOf(o.startsAt, tz),
      detail: event.admission === 'free_registration' ? `${o.confirmedPeople} registered` : undefined,
    }),
  });
  const state = readCalendarState(input.params, { fallbackDate: data.openOn, bounds: data.bounds });
  const chosenDate = state.date ?? data.openOn;
  const model = calendarModel({
    state: { ...state, date: chosenDate },
    today: data.today,
    days: data.days,
    bounds: data.bounds,
    selectable: 'marked',
    href: (s) => `${calendarQuery(s)}#calendar`,
  });
  return {
    model,
    chosenDate,
    chosenLabel: data.byDay.has(chosenDate)
      ? new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${chosenDate}T12:00:00Z`))
      : null,
    selectedIds: (data.byDay.get(chosenDate) ?? []).map((o) => o.id),
  };
}

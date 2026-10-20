/**
 * The admin's calendar: every date of every organizer event and catalog listing on one calendar, so Gamo can see what
 * is coming and which events still waiting for review start soon. `listAdminSchedule` reads the dates;
 * `adminScheduleView` is pure (dates, clock and address in, what to draw out), like the organizer's schedule view.
 * Organization verification meetings (scheduled or held) are on the same calendar (`source: 'meeting'`), linking to the
 * organization's page where the meeting step lives (docs/LIVE_SCREENS.md C5).
 */
import {
  calendarModel,
  calendarQuery,
  eventCalendarData,
  readCalendarState,
  type CalendarModel,
} from '../calendar.ts';
import { allRows, type SqlDatabase } from '../security/sql-database.ts';

export type AdminScheduleScope = 'all' | 'catalog';
export type AdminScheduleSource = 'organizer' | 'catalog' | 'meeting';

export interface AdminScheduledDate {
  id: string;
  /** The event's id; for a verification meeting, the meeting's id. */
  eventId: string;
  /** The organization a verification meeting is with (meetings only). */
  organizationId?: string | null;
  title: string;
  /** The event's status: published, pending_review, hidden or (catalog only) rejected; a meeting's: meeting_scheduled or meeting_held. */
  status: string;
  source: AdminScheduleSource;
  organizationName: string | null;
  timeZone: string;
  startsAt: number;
  endsAt: number | null;
  canceled: boolean;
}

/** An event still waiting for review that starts within this many days is "starting soon". */
export const SOON_DAYS = 7;
/** How far back the calendar reads: older dates are history nobody reviews. */
export const HISTORY_DAYS = 90;
const DAY = 86_400;

const ORGANIZER_STATUSES = ['published', 'pending_review', 'hidden'];
const CATALOG_STATUSES = ['published', 'pending_review', 'hidden'];

const inList = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

export async function listAdminSchedule(
  db: SqlDatabase,
  input: { scope: AdminScheduleScope; now: number; limit?: number },
): Promise<AdminScheduledDate[]> {
  const catalogStatuses = input.scope === 'catalog' ? [...CATALOG_STATUSES, 'rejected'] : CATALOG_STATUSES;
  const where =
    input.scope === 'catalog'
      ? `e.origin = 'catalog' AND e.status IN (${inList(catalogStatuses)})`
      : `((e.origin = 'organizer' AND e.status IN (${inList(ORGANIZER_STATUSES)}))
          OR (e.origin = 'catalog' AND e.status IN (${inList(catalogStatuses)})))`;
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT o.id, o.event_id, e.title, e.status, e.origin, e.timezone, g.name AS organization_name,
                 o.starts_at, o.ends_at, o.status AS occ_status
            FROM event_occurrences o
            JOIN events e ON e.id = o.event_id
            LEFT JOIN organizations g ON g.id = e.organization_id
           WHERE ${where} AND o.starts_at >= ?1
           ORDER BY o.starts_at, e.title LIMIT ?2`,
    params: [input.now - HISTORY_DAYS * DAY, input.limit ?? 2000],
  });
  const dates: AdminScheduledDate[] = rows.map((r) => ({
    id: String(r.id),
    eventId: String(r.event_id),
    title: String(r.title),
    status: String(r.status),
    source: r.origin === 'catalog' ? 'catalog' : 'organizer',
    organizationName: r.organization_name == null ? null : String(r.organization_name),
    timeZone: String(r.timezone),
    startsAt: Number(r.starts_at),
    endsAt: r.ends_at == null ? null : Number(r.ends_at),
    canceled: r.occ_status === 'canceled',
  }));
  if (input.scope === 'catalog') return dates;
  const meetings = await listVerificationMeetingDates(db, { now: input.now });
  return [...dates, ...meetings].sort((a, b) => a.startsAt - b.startsAt || a.title.localeCompare(b.title));
}

/** How long a verification meeting is drawn on the calendar (the real length is not recorded). */
export const MEETING_CALENDAR_SECONDS = 3600;

/** Scheduled and held verification meetings with organizations, for the admin's calendar. Canceled ones stay off. */
export async function listVerificationMeetingDates(
  db: SqlDatabase,
  input: { now: number; limit?: number },
): Promise<AdminScheduledDate[]> {
  const rows = await allRows<Record<string, unknown>>(db, {
    sql: `SELECT vm.id, vm.subject_id, vm.starts_at, vm.timezone, vm.status, g.name
            FROM verification_meetings vm JOIN organizations g ON g.id = vm.subject_id
           WHERE vm.subject_type = 'organization' AND vm.status IN ('scheduled', 'held') AND vm.starts_at >= ?1
           ORDER BY vm.starts_at, g.name LIMIT ?2`,
    params: [input.now - HISTORY_DAYS * DAY, input.limit ?? 500],
  });
  return rows.map((r) => ({
    id: String(r.id),
    eventId: String(r.id),
    organizationId: String(r.subject_id),
    title: `Verification meeting: ${String(r.name)}`,
    status: r.status === 'held' ? 'meeting_held' : 'meeting_scheduled',
    source: 'meeting' as const,
    organizationName: String(r.name),
    timeZone: String(r.timezone),
    startsAt: Number(r.starts_at),
    endsAt: Number(r.starts_at) + MEETING_CALENDAR_SECONDS,
    canceled: false,
  }));
}

export interface AdminDayItem {
  id: string;
  eventId: string;
  title: string;
  timeLabel: string;
  source: AdminScheduleSource;
  organizationName: string | null;
  statusLabel: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  canceled: boolean;
  past: boolean;
  /** Waiting for review and starting within `SOON_DAYS`. */
  soon: boolean;
  /** Where Gamo decides about it: the review card, the published list or the catalog listing. */
  href: string;
}

export interface AdminSoonItem {
  eventId: string;
  title: string;
  whenLabel: string;
  source: AdminScheduleSource;
  href: string;
}

export interface AdminScheduleView {
  model: CalendarModel;
  chosenDate: string | null;
  chosenLabel: string | null;
  items: AdminDayItem[];
  total: number;
  upcoming: number;
  /** Events waiting for review that start within a week, soonest first (one row per event). */
  soon: AdminSoonItem[];
}

const timeOf = (epoch: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(epoch * 1000),
  );
const dayOf = (epoch: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(
    new Date(epoch * 1000),
  );

/** Where Gamo acts on a date's event (or, for a verification meeting, on the organization). */
export function adminEventHref(
  d: Pick<AdminScheduledDate, 'source' | 'status' | 'eventId'> & { organizationId?: string | null },
): string {
  if (d.source === 'meeting')
    return `/organizations/${encodeURIComponent(d.organizationId ?? '')}#verification`;
  if (d.source === 'catalog') return `/catalog#listing-${d.eventId}`;
  return d.status === 'pending_review'
    ? `/events#event-${d.eventId}`
    : `/events?view=published#published-${d.eventId}`;
}

const STATUS: Record<string, { label: string; tone: AdminDayItem['tone'] }> = {
  published: { label: 'Published', tone: 'success' },
  pending_review: { label: 'Waiting for review', tone: 'warning' },
  hidden: { label: 'Hidden', tone: 'neutral' },
  rejected: { label: 'Failed editorial rules', tone: 'danger' },
  meeting_scheduled: { label: 'Verification meeting', tone: 'info' },
  meeting_held: { label: 'Meeting held', tone: 'neutral' },
};

export function adminScheduleView(input: {
  dates: readonly AdminScheduledDate[];
  now: number;
  params: URLSearchParams | { get(name: string): string | null };
  /** The fragment to scroll to after a link, e.g. "#schedule". */
  anchor?: string;
}): AdminScheduleView {
  const anchor = input.anchor ?? '';
  const data = eventCalendarData({
    occurrences: input.dates,
    timeZone: (d) => d.timeZone,
    todayZone: 'America/Phoenix',
    now: input.now,
    describe: (d) => ({ label: timeOf(d.startsAt, d.timeZone), detail: d.title, href: adminEventHref(d) }),
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
  const soonUntil = input.now + SOON_DAYS * DAY;
  const isSoon = (d: AdminScheduledDate) =>
    d.status === 'pending_review' && !d.canceled && d.startsAt > input.now && d.startsAt <= soonUntil;
  const onDay = chosenDate ? (data.byDay.get(chosenDate) ?? []) : [];
  const soon: AdminSoonItem[] = [];
  for (const d of input.dates) {
    if (!isSoon(d) || soon.some((s) => s.eventId === d.eventId)) continue;
    soon.push({
      eventId: d.eventId,
      title: d.title,
      whenLabel: `${dayOf(d.startsAt, d.timeZone)}, ${timeOf(d.startsAt, d.timeZone)}`,
      source: d.source,
      href: adminEventHref(d),
    });
  }
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
    items: onDay.map((d) => {
      const status = STATUS[d.status] ?? { label: d.status, tone: 'neutral' as const };
      return {
        id: d.id,
        eventId: d.eventId,
        title: d.title,
        timeLabel: timeOf(d.startsAt, d.timeZone),
        source: d.source,
        organizationName: d.organizationName,
        statusLabel: status.label,
        tone: status.tone,
        canceled: d.canceled,
        past: (d.endsAt ?? d.startsAt) <= input.now,
        soon: isSoon(d),
        href: adminEventHref(d),
      };
    }),
    total: input.dates.length,
    upcoming: input.dates.filter((d) => !d.canceled && (d.endsAt ?? d.startsAt) > input.now).length,
    soon: soon.slice(0, 5),
  };
}

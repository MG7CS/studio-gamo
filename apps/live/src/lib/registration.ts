/** Shared helpers for the registration pages (A4–A6 in docs/LIVE_SCREENS.md). */
import {
  LiveCatalog,
  RegistrationError,
  asSqlDatabase,
  formatLocalEventSchedule,
  getRuntimeEnv,
  waitPhrase,
  type LiveEventDetail,
  type RegisterDateOption,
  type RegistrationErrorCode,
  type SqlDatabase,
} from '@gamo/domain';

export interface LiveContext {
  env: Awaited<ReturnType<typeof getRuntimeEnv>>;
  db: SqlDatabase;
  catalog: LiveCatalog;
}

/** The Live database for this request. Throws when it is not bound (the page then shows "unavailable"). */
export async function openLive(astro: { locals: unknown }): Promise<LiveContext> {
  const env = await getRuntimeEnv(astro);
  const db = asSqlDatabase(env.LIVE_DB);
  return { env, db, catalog: new LiveCatalog(db) };
}

/** Time and place wording used in pages and emails. */
export function whenWhere(event: LiveEventDetail, startsAt: Date = event.startsAt) {
  const schedule = formatLocalEventSchedule(null, null, event.timezone, startsAt);
  return {
    title: event.title,
    whenLabel: schedule.fullLabel,
    venueLabel: [event.venueName, event.address, `${event.city}, ${event.state}`].filter(Boolean).join(', '),
  };
}

/** What a person sees for each registration problem. Never reveals who else registered. */
export const REGISTRATION_ERRORS: Record<RegistrationErrorCode, string> = {
  invalid: 'Please check your name, email address and the number of people.',
  not_found: 'This event is not open for registration.',
  not_open: 'This event does not take registrations here.',
  closed_past: 'This event has already taken place. Registration is closed.',
  full: 'There are not enough seats left for that many people.',
  duplicate: 'We sent an email with your registration details.',
  rate_limited: 'Too many tries. Please wait a little while and try again.',
  wrong_code: 'That code is not right.',
  expired: 'This registration expired. Please start again.',
  locked: 'That code has expired or was tried too many times. Send a new code to continue.',
  already_canceled: 'This registration is already canceled.',
};

export function registrationMessage(error: unknown): { code: RegistrationErrorCode; text: string } | null {
  if (!(error instanceof RegistrationError)) return null;
  const base = REGISTRATION_ERRORS[error.code];
  const extra =
    error.code === 'wrong_code' && typeof error.attemptsLeft === 'number'
      ? ` ${error.attemptsLeft} ${error.attemptsLeft === 1 ? 'try' : 'tries'} left.`
      : '';
  if (error.code === 'rate_limited' && error.retryAfterSeconds)
    return {
      code: error.code,
      text: `Too many tries. Please wait ${waitPhrase(error.retryAfterSeconds)} and try again.`,
    };
  return { code: error.code, text: base + extra };
}

/** Remaining seats for the occurrence (null = unlimited). */
export function seatsLeft(capacity: number | null, seatsTaken: number): number | null {
  return capacity == null ? null : Math.max(0, capacity - seatsTaken);
}

/** The dates a person can still register for: not canceled and not yet started (the server applies the same rule). */
export function upcomingDates(event: LiveEventDetail, nowMs: number = Date.now()) {
  return event.occurrences.filter((o) => !o.canceled && o.startsAt.getTime() > nowMs);
}

/** Those dates as options for the form's date select. */
export function dateOptions(event: LiveEventDetail, nowMs: number = Date.now()): RegisterDateOption[] {
  return upcomingDates(event, nowMs).map((o) => ({
    id: o.id,
    label: formatLocalEventSchedule(null, null, event.timezone, o.startsAt).fullLabel,
    seatsLeft: seatsLeft(event.capacity, o.seatsTaken),
  }));
}

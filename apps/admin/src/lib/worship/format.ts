/** Display helpers for the roster and request screens. Pure; every value is plain text (the page escapes). */
import { DEFAULT_SERVICE_TIME_ZONE, formatClockTime, formatServiceDate } from '@gamo/domain/worship';

export { formatServiceDate };

/** `Mon, Mar 17, 2030` for an epoch-seconds instant, in UTC (W-9 dates are stored as a UTC calendar date). */
export function formatUtcDay(epoch: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epoch * 1000));
}

/** `YYYY-MM-DD` for a date input's value. */
export const isoDay = (epoch: number): string => new Date(epoch * 1000).toISOString().slice(0, 10);

/** `Sun, Mar 17, 10:00 AM MST` in the service time zone (an unknown zone falls back to the default). */
export function formatInstant(epoch: number, timeZone: string = DEFAULT_SERVICE_TIME_ZONE): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  };
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(new Date(epoch * 1000));
  } catch {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: DEFAULT_SERVICE_TIME_ZONE }).format(
      new Date(epoch * 1000),
    );
  }
}

/** The staff screen's one-line service time: `Sunday, March 24, 2030, 10:00 AM` or just the date. */
export function formatService(date: string, time: string | null): string {
  return time ? `${formatServiceDate(date)}, ${formatClockTime(time)}` : formatServiceDate(date);
}

/** `Ana R.` style short name for button labels (first name and last initial). */
export function shortName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

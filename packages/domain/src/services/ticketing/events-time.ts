/**
 * Event time in the venue's IANA time zone (design §7 "Time zones").
 *
 * - All instants are UTC epoch seconds; everything a person reads or types is venue-local.
 * - `zonedLocalToUtc` is the DST-safe conversion that replaces the old one-pass offset helper: it
 *   iterates the offset until it is stable, then resolves the two DST edge cases explicitly:
 *     * a local time that does not exist (spring-forward gap, e.g. 02:30 on the change night) is
 *       moved forward by the gap (02:30 → 03:30), the usual calendar behaviour;
 *     * a local time that exists twice (fall-back overlap) takes the earlier instant (daylight time).
 * - `formatEventDateTime` shows the date, time and zone abbreviation ("Sat, Mar 20, 2027 · 7:00 PM MST").
 * - `venueDayKey` is the venue-local `YYYY-MM-DD` used for scanner presence and multi-day passes.
 */

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(\d{2}):(\d{2})$/;

/** True when `zone` is an IANA time zone this runtime knows. */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length < 1 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Time zones offered in the event form (Christian events nationwide: US zones first). */
export const EVENT_TIME_ZONES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'America/New_York', label: 'Eastern (New York)' },
  { id: 'America/Chicago', label: 'Central (Chicago)' },
  { id: 'America/Denver', label: 'Mountain (Denver)' },
  { id: 'America/Phoenix', label: 'Arizona (Phoenix, no daylight saving)' },
  { id: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { id: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { id: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { id: 'America/Puerto_Rico', label: 'Atlantic (Puerto Rico)' },
  { id: 'America/Detroit', label: 'Eastern (Detroit)' },
  { id: 'America/Indiana/Indianapolis', label: 'Eastern (Indianapolis)' },
  { id: 'America/Boise', label: 'Mountain (Boise)' },
  { id: 'Pacific/Guam', label: 'Chamorro (Guam)' },
];

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsInZone(epochMs: number, zone: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(epochMs))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset of `zone` from UTC at an instant, in milliseconds (positive east of UTC). */
export function zoneOffsetMs(epochMs: number, zone: string): number {
  const p = partsInZone(epochMs, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

export interface LocalDateTime {
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM` (24 h). */
  time: string;
}

export type ZonedConversion =
  | { ok: true; epochSeconds: number; adjusted: 'none' | 'gap_forward' | 'overlap_earlier' }
  | { ok: false; reason: 'invalid_date' | 'invalid_time' | 'invalid_zone' };

/**
 * Venue-local date + time → UTC epoch seconds, DST-safe (see module header).
 */
export function zonedLocalToUtc(input: LocalDateTime & { zone: string }): ZonedConversion {
  const d = LOCAL_DATE.exec(input.date?.trim() ?? '');
  if (!d) return { ok: false, reason: 'invalid_date' };
  const t = LOCAL_TIME.exec(input.time?.trim() ?? '');
  if (!t) return { ok: false, reason: 'invalid_time' };
  if (!isValidTimeZone(input.zone)) return { ok: false, reason: 'invalid_zone' };
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = [Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return { ok: false, reason: 'invalid_date' };
  if (h > 23 || mi > 59) return { ok: false, reason: 'invalid_time' };
  const wallAsUtc = Date.UTC(y, mo - 1, da, h, mi, 0);
  const check = new Date(wallAsUtc);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== da)
    return { ok: false, reason: 'invalid_date' };

  // Candidate instants from the offsets in force a day either side of the wall time. In a stable
  // period both agree; across a DST change they give the two possible offsets.
  const offsets = new Set([
    zoneOffsetMs(wallAsUtc - 86_400_000, input.zone),
    zoneOffsetMs(wallAsUtc + 86_400_000, input.zone),
    zoneOffsetMs(wallAsUtc, input.zone),
  ]);
  const matches: number[] = [];
  for (const off of offsets) {
    const candidate = wallAsUtc - off;
    if (zoneOffsetMs(candidate, input.zone) === off) matches.push(candidate);
  }
  if (matches.length > 0) {
    matches.sort((a, b) => a - b);
    const unique = [...new Set(matches)];
    return {
      ok: true,
      epochSeconds: Math.floor(unique[0] / 1000),
      adjusted: unique.length > 1 ? 'overlap_earlier' : 'none',
    };
  }
  // Gap: the wall time never happens. Use the offset before the change (moves the time forward).
  const before = zoneOffsetMs(wallAsUtc - 86_400_000, input.zone);
  return { ok: true, epochSeconds: Math.floor((wallAsUtc - before) / 1000), adjusted: 'gap_forward' };
}

/** UTC epoch seconds → venue-local `{ date, time }`. */
export function utcToZonedLocal(epochSeconds: number, zone: string): LocalDateTime {
  const p = partsInZone(epochSeconds * 1000, zone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Venue-local calendar date (`YYYY-MM-DD`) of an instant: the scanner `day_key`. */
export function venueDayKey(epochSeconds: number, zone: string): string {
  return utcToZonedLocal(epochSeconds, isValidTimeZone(zone) ? zone : 'UTC').date;
}

/** Short zone name at that instant, e.g. `MST`, `EDT`, or `GMT-7` where no abbreviation exists. */
export function zoneAbbreviation(epochSeconds: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(
    new Date(epochSeconds * 1000),
  );
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone;
}

/** "Sat, Mar 20, 2027" in the venue zone. */
export function formatEventDate(epochSeconds: number, zone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(epochSeconds * 1000));
}

/** "7:00 PM MST" in the venue zone. */
export function formatEventTime(epochSeconds: number, zone: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(epochSeconds * 1000));
  return `${time} ${zoneAbbreviation(epochSeconds, zone)}`;
}

/** "Sat, Mar 20, 2027 · 7:00 PM MST". */
export function formatEventDateTime(epochSeconds: number, zone: string): string {
  const z = isValidTimeZone(zone) ? zone : 'UTC';
  return `${formatEventDate(epochSeconds, z)} · ${formatEventTime(epochSeconds, z)}`;
}

/** "$12.50" from integer cents (US dollars; the only currency sold today). */
export function formatMoney(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100,
  );
}

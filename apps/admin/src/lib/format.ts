/** "3 days ago" style text for epoch seconds. `now` is injectable for tests. */
export function timeAgo(epochSeconds: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor(now / 1000) - epochSeconds);
  if (seconds < 60) return 'just now';
  const units: [number, string][] = [
    [86_400 * 30, 'month'],
    [86_400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

/**
 * "Oct 19, 2026, 9:30 AM MST" for epoch seconds in an IANA zone. Not `dateStyle`/`timeStyle`: those cannot be
 * combined with `timeZoneName`, and the combination throws.
 */
export function formatWhen(epochSeconds: number, timeZone = 'America/Phoenix'): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(epochSeconds * 1000));
}

/** Small formatting helpers shared by the inbox and the detail page. Times are UTC and say so. */

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-16 12:05 UTC` from epoch seconds. */
export function formatUtc(seconds: number): string {
  const d = new Date(seconds * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** `2026-11-16` from epoch seconds (UTC). */
export function formatUtcDate(seconds: number): string {
  return formatUtc(seconds).slice(0, 10);
}

/** `1.4 MB`, `820 KB`, `12 B`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Whole days from `now` to `at` (rounded up), for "will be deleted in N days"; never negative. */
export function daysUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 86_400));
}

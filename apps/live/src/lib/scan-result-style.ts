/**
 * How each scan result looks on the scanner (server-rendered panel and the client script share this):
 * a tone (colour), an icon and a short verb, so a result is never conveyed by colour alone.
 */
export type ScanTone = 'go' | 'wait' | 'stop';

export const RESULT_TONE: Record<string, ScanTone> = {
  admitted: 'go',
  override_admitted: 'go',
  exited: 'go',
  already_inside: 'wait',
  already_used: 'wait',
  reentry_denied: 'wait',
  not_inside: 'wait',
  not_open_yet: 'wait',
  wrong_zone: 'wait',
  wrong_event: 'stop',
  voided: 'stop',
  refunded: 'stop',
  stale_version: 'stop',
  invalid: 'stop',
  not_found: 'stop',
  event_cancelled: 'stop',
};

/** Classes per tone (contrast checked against white/ink text). */
export const TONE_CLASSES: Record<ScanTone, string> = {
  go: 'bg-emerald-700 text-white',
  wait: 'bg-amber-300 text-ink',
  stop: 'bg-red-700 text-white',
};

/** Spoken/visible verb before the title ("Go", "Check", "Stop"). */
export const TONE_LABEL: Record<ScanTone, string> = { go: 'Go', wait: 'Check', stop: 'Stop' };

/** SVG path data for the tone icon (24×24, stroke). */
export const TONE_ICON: Record<ScanTone, string> = {
  go: 'M5 12.5l4.5 4.5L19 7.5',
  wait: 'M12 7v6M12 17h.01',
  stop: 'M7 7l10 10M17 7L7 17',
};

export function toneOf(result: string): ScanTone {
  return RESULT_TONE[result] ?? 'stop';
}

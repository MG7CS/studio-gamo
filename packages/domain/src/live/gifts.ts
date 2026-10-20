/**
 * The optional gift to the organizer at checkout (docs/LIVE_REQUIREMENTS.md §8.2 item 19). A gift goes to the
 * organization named next to it, never to Gamo; it is never preselected, carries no Gamo fee (proposal 5) and is
 * recorded as its own ledger entry (`gift`, `third_party_payable`). Gamo makes no tax claim about it.
 */
import { isCents, parseDollarsToCents } from './money.ts';
import { PaidError } from './paid-types.ts';

export const GIFT_MIN_CENTS = 100;
export const GIFT_MAX_CENTS = 1_000_000;
export const GIFT_PRESETS_MAX = 4;
/** Used when an organizer turns gifts on without choosing amounts. */
export const DEFAULT_GIFT_PRESETS: readonly number[] = [500, 1000, 2500];

/** Reads `event_ticketing.gift_presets` (JSON cents); anything malformed falls back to the defaults. */
export function parseGiftPresets(json: unknown): number[] {
  if (typeof json !== 'string' || !json) return [...DEFAULT_GIFT_PRESETS];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [...DEFAULT_GIFT_PRESETS];
    const ok = parsed.filter((n): n is number => isCents(n, GIFT_MIN_CENTS, GIFT_MAX_CENTS));
    const unique = [...new Set(ok)].sort((a, b) => a - b).slice(0, GIFT_PRESETS_MAX);
    return unique.length ? unique : [...DEFAULT_GIFT_PRESETS];
  } catch {
    return [...DEFAULT_GIFT_PRESETS];
  }
}

/** Validates presets typed by the organizer (dollars, comma separated) and returns the JSON to store. */
export function giftPresetsFromForm(text: unknown): string {
  const parts = String(text ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length === 0 || parts.length > GIFT_PRESETS_MAX)
    throw new PaidError('invalid', { detail: 'gift_presets' });
  const cents = parts.map((p) => parseDollarsToCents(p));
  if (cents.some((c) => c === null || c < GIFT_MIN_CENTS || c > GIFT_MAX_CENTS))
    throw new PaidError('invalid', { detail: 'gift_presets' });
  return JSON.stringify([...new Set(cents as number[])].sort((a, b) => a - b));
}

/**
 * The gift a buyer chose: `choice` is "none", a preset in cents, or "custom" with `custom` in dollars.
 * Returns 0 for no gift. Throws `PaidError('invalid', { detail: 'gift' })` when gifts are off or the amount is wrong.
 */
export function readGiftChoice(input: {
  enabled: boolean;
  presets: readonly number[];
  choice: unknown;
  custom?: unknown;
}): number {
  const choice = String(input.choice ?? 'none').trim();
  if (choice === '' || choice === 'none') return 0;
  if (!input.enabled) throw new PaidError('invalid', { detail: 'gift' });
  if (choice === 'custom') {
    const cents = parseDollarsToCents(input.custom);
    if (cents === null || cents < GIFT_MIN_CENTS || cents > GIFT_MAX_CENTS)
      throw new PaidError('invalid', { detail: 'gift' });
    return cents;
  }
  const preset = Number(choice);
  if (!input.presets.includes(preset)) throw new PaidError('invalid', { detail: 'gift' });
  return preset;
}

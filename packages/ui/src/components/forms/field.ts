/**
 * Shared helpers for the form primitives in this folder (ids, choice options, hints). Plain functions so
 * the dynamic form renderer and the server can reuse them.
 */

/** Value sent for the "Other" choice; the typed text is sent as `${name}_other`. */
export const OTHER_VALUE = '__other__';

/** One choice in a radio group, checkbox group, select or choice card. */
export interface ChoiceOption {
  value: string;
  label: string;
  /** Helper line under the option (radio/checkbox groups only). */
  hint?: string;
  disabled?: boolean;
}

/** Element ids derived from a field id: `${id}-hint`, `${id}-error`, and the aria-describedby list. */
export function fieldIds(id: string, hasHint: boolean, extra: (string | null | undefined)[] = []) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hasHint ? hintId : null, ...extra, errorId].filter(Boolean).join(' ');
  return { hintId, errorId, describedBy };
}

/** "Choose at least 2." / "Choose up to 3." / "Choose exactly 2." / "Choose 1 to 3." — or null. */
export function rangeHint(min?: number, max?: number): string | null {
  const lo = min && min > 0 ? min : undefined;
  const hi = max && max > 0 ? max : undefined;
  if (lo && hi) return lo === hi ? `Choose exactly ${lo}.` : `Choose ${lo} to ${hi}.`;
  if (lo) return `Choose at least ${lo}.`;
  if (hi) return `Choose up to ${hi}.`;
  return null;
}

/** Joins hint fragments into one sentence string, or undefined when all are empty. */
export function joinHints(...parts: (string | null | undefined)[]): string | undefined {
  const text = parts.filter((p) => p && p.trim()).join(' ');
  return text || undefined;
}

/** "PDF or JPEG. Up to 10 MB each, up to 5 files." — the requirements shown before a file picker. */
export function fileRequirements(
  typesLabel: string,
  maxSizeMb?: number,
  maxFiles?: number,
  multiple = false,
) {
  const parts = [`Accepted: ${typesLabel}.`];
  const size = maxSizeMb ? `Up to ${maxSizeMb} MB${multiple ? ' each' : ''}` : null;
  const count = multiple && maxFiles ? `up to ${maxFiles} file${maxFiles === 1 ? '' : 's'}` : null;
  if (size && count) parts.push(`${size}, ${count}.`);
  else if (size) parts.push(`${size}.`);
  else if (count) parts.push(`${count[0].toUpperCase()}${count.slice(1)}.`);
  return parts.join(' ');
}

/** Classes for a boxed control (input, textarea, select): 44 px tall, ≥ 3:1 border, error state. */
export const CONTROL_CLASS = [
  'mt-2 block min-h-11 w-full rounded-xl border-fg-muted bg-surface-raised px-4 py-2.5 text-base text-fg',
  'border placeholder:text-fg-muted focus:border-action',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-invalid:border-2 aria-invalid:border-danger',
].join(' ');

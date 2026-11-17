/**
 * Class strings the builder components share. Semantic tokens only (no hex, no arbitrary values); every
 * interactive target is at least 44 px tall (min-h-11).
 */
const BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-pill px-5 py-2.5 text-body-sm font-semibold transition-colors';

export const BTN_PRIMARY = `${BUTTON} bg-action text-on-action hover:bg-action-strong`;
export const BTN_SECONDARY = `${BUTTON} border border-fg-muted bg-surface-raised text-fg hover:bg-surface-inset`;
export const BTN_DANGER = `${BUTTON} border-2 border-danger bg-surface-raised text-danger hover:bg-surface-inset`;
export const BTN_SMALL =
  'inline-flex min-h-11 items-center justify-center rounded-pill border border-fg-muted bg-surface-raised px-4 py-2 text-small font-semibold text-fg transition-colors hover:bg-surface-inset';
export const LINK =
  'inline-flex min-h-11 items-center font-semibold text-action-strong underline underline-offset-4 hover:text-fg';
export const PANEL = 'rounded-card border border-border bg-surface-raised p-4 sm:p-5';
export const HELP = 'text-small text-fg-muted';

export const CHIP_TONES = {
  neutral: 'border-fg-muted text-fg',
  ok: 'border-success text-success',
  warn: 'border-action-strong text-action-strong',
} as const;
export const TAB =
  'inline-flex min-h-11 items-center border-b-2 px-1 text-body-sm font-semibold text-fg hover:text-action-strong';

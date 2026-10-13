import { createHash } from 'node:crypto';

/** Generate capped responsive widths. Smaller sources keep their native size. */
export function responsiveWidths(intrinsicWidth, targets) {
  if (!Number.isInteger(intrinsicWidth) || intrinsicWidth <= 0 || !targets.length || targets.some((w) => !Number.isInteger(w) || w <= 0)) {
    throw new Error('Image dimensions and target widths must be positive integers');
  }
  const cap = Math.max(...targets);
  const widths = targets.filter((w) => w <= intrinsicWidth);
  if (intrinsicWidth < cap) widths.push(intrinsicWidth);
  return [...new Set(widths)].sort((a, b) => a - b);
}

/** Cache invalidates when encoder quality, effort, formats or target widths change. */
export function configurationSignature(widths, formats) {
  return createHash('sha256').update(JSON.stringify({ widths, formats })).digest('hex');
}

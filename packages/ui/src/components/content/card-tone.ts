/**
 * Shared surface mapping for card-like components (Card, LinkCard, MediaCard).
 * A tone sets semantic colour roles only; `data-surface` re-maps the roles for the subtree so
 * text, borders and the focus ring inside the card stay readable on its background.
 */
export type CardTone = 'raised' | 'inset' | 'dark' | 'outline';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export const cardToneClass: Record<CardTone, string> = {
  raised: 'bg-surface-raised text-fg shadow-raised',
  inset: 'bg-surface text-fg',
  dark: 'bg-surface text-fg',
  outline: 'border border-border text-fg',
};

/** Value for the card's `data-surface` attribute (undefined keeps the parent's roles). */
export function cardSurface(tone: CardTone): 'inset' | 'dark' | undefined {
  return tone === 'inset' || tone === 'dark' ? tone : undefined;
}

export const cardPaddingClass: Record<CardPadding, string> = {
  none: '',
  sm: 'p-5',
  md: 'p-6',
  lg: 'p-8',
};

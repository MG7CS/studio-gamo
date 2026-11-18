/**
 * Shared constants and validation for `Frame` and `PhotoGrid` (docs/FRONTEND_ARCHITECTURE.md
 * "Photo frames (decision 2026-11-16)"). Plain TypeScript so tests and Astro components share it.
 */
import { photos, PHOTO_RATIOS, type PhotoKey, type PhotoRatio } from '../../lib/images';

/** The only four ratios a photo may have. */
export type FrameRatio = PhotoRatio;
export const FRAME_RATIOS = PHOTO_RATIOS;
export const FRAME_RATIO_NAMES = Object.keys(FRAME_RATIOS) as FrameRatio[];

/** Viewport breakpoints (px) the `sizes` presets are built from; the page container is `max-w-page`. */
export const FRAME_BREAKPOINTS = { md: 768, lg: 1024, page: 1320 } as const;

const { md, lg, page } = FRAME_BREAKPOINTS;
const px = (n: number) => `(min-width: ${n}px)`;

/**
 * `sizes` presets by how much of the page a frame covers. The photo pipeline already offers
 * 480–1672 px widths; these tell the browser which one to fetch.
 *  - full: the whole page container.
 *  - half: half of it from the md breakpoint (two columns).
 *  - third: a third from lg, half from md (three-up lists).
 *  - tile: a small square tile (header panel, about 200 px; a fifth of the page from lg).
 *  - grid-tall: the tall or dominant cell of a PhotoGrid mosaic, about 40% from md.
 */
export const FRAME_SIZES = {
  full: `${px(page)} ${page}px, 100vw`,
  half: `${px(page)} ${Math.round(page / 2)}px, ${px(md)} 50vw, 100vw`,
  third: `${px(page)} ${Math.round(page / 3)}px, ${px(lg)} 33vw, ${px(md)} 50vw, 100vw`,
  tile: `${px(page)} 200px, ${px(lg)} 20vw, 40vw`,
  'grid-tall': `${px(page)} ${Math.round(page * 0.4)}px, ${px(md)} 40vw, 100vw`,
} as const;
export type FrameSizes = keyof typeof FRAME_SIZES;

/** Alt text is required by type: a description, or `decorative: true` for alt="". */
export type FrameAlt = { alt: string; decorative?: never } | { decorative: true; alt?: never };

/** Throws when `ratio` is not one of the four, or the photo cannot be cropped to it. */
export function assertFrameRatio(photo: PhotoKey, ratio: FrameRatio): void {
  if (!(ratio in FRAME_RATIOS)) {
    throw new Error(`Frame: unknown ratio "${String(ratio)}"; use ${FRAME_RATIO_NAMES.join(', ')}.`);
  }
  const entry = photos[photo];
  if (!entry) throw new Error(`Frame: unknown photo "${String(photo)}" (not in the photo catalog).`);
  if (!entry.ratios.includes(ratio)) {
    throw new Error(
      `Frame: photo "${photo}" (${entry.width}×${entry.height}) cannot be cropped to ratio "${ratio}" ` +
        `without losing most of the picture. Allowed ratios: ${entry.ratios.join(', ')}. ` +
        `Pick one of those or another photo.`,
    );
  }
}

/** Throws unless exactly one of `alt` (a string) or `decorative: true` is given. */
export function assertAlt(where: string, props: { alt?: unknown; decorative?: unknown }): void {
  const hasAlt = typeof props.alt === 'string';
  const decorative = props.decorative === true;
  if (hasAlt === decorative) {
    throw new Error(`${where}: pass either alt="…" or decorative (exactly one).`);
  }
}

export type GridLayout = 'pair' | 'trio' | 'quad' | 'hero';

export interface GridCell {
  /** Ratio used for the image's width/height attributes (its narrow-container shape). */
  nominal: FrameRatio;
  /** Every ratio the cell takes across the container-query states; the photo must allow all. */
  ratios: FrameRatio[];
  sizes: FrameSizes;
}

/**
 * Cells per layout, in the order apps pass photos. Shapes (container queries on the grid itself):
 *  - pair: stacked landscapes → two portraits from 32rem.
 *  - trio: landscape on top of two squares → one tall photo left, two landscapes right from 40rem.
 *  - quad: 2×2 squares → mosaic from 48rem (portrait left, two squares and a landscape right).
 *  - hero: dominant landscape; from 48rem a portrait companion beside it (hidden below).
 */
export const GRID_LAYOUTS: Record<GridLayout, GridCell[]> = {
  pair: [
    { nominal: 'landscape', ratios: ['landscape', 'portrait'], sizes: 'half' },
    { nominal: 'landscape', ratios: ['landscape', 'portrait'], sizes: 'half' },
  ],
  trio: [
    { nominal: 'landscape', ratios: ['landscape', 'portrait'], sizes: 'grid-tall' },
    { nominal: 'square', ratios: ['square', 'landscape'], sizes: 'half' },
    { nominal: 'square', ratios: ['square', 'landscape'], sizes: 'half' },
  ],
  quad: [
    { nominal: 'square', ratios: ['square', 'portrait'], sizes: 'half' },
    { nominal: 'square', ratios: ['square'], sizes: 'third' },
    { nominal: 'square', ratios: ['square'], sizes: 'third' },
    { nominal: 'square', ratios: ['square', 'landscape'], sizes: 'half' },
  ],
  hero: [
    { nominal: 'landscape', ratios: ['landscape'], sizes: 'full' },
    { nominal: 'portrait', ratios: ['portrait'], sizes: 'third' },
  ],
};

/** One photo of a PhotoGrid, in the order the layout fills its cells. */
export type GridPhoto = { photo: PhotoKey; caption?: string; priority?: boolean } & FrameAlt;

/** Loose shape `assertGridPhotos` accepts (so it can also reject a missing alt at runtime). */
export interface GridPhotoInput {
  photo: PhotoKey;
  alt?: string;
  decorative?: boolean;
  caption?: string;
  priority?: boolean;
}

/** Throws a clear message when the photo list does not fit the layout. */
export function assertGridPhotos(layout: GridLayout, list: readonly GridPhotoInput[]): void {
  const cells = GRID_LAYOUTS[layout];
  if (!cells)
    throw new Error(
      `PhotoGrid: unknown layout "${String(layout)}"; use ${Object.keys(GRID_LAYOUTS).join(', ')}.`,
    );
  if (list.length !== cells.length) {
    throw new Error(
      `PhotoGrid layout "${layout}" takes exactly ${cells.length} photos, got ${list.length}. ` +
        `Use another layout, or split five or more photos into two clusters in different sections.`,
    );
  }
  list.forEach((item, i) => {
    const where = `PhotoGrid "${layout}" photo ${i + 1} (${String(item.photo)})`;
    assertAlt(where, item);
    if (item.priority && i > 0) {
      throw new Error(`${where}: priority is allowed on the first photo only (one LCP image per page).`);
    }
    const entry = photos[item.photo];
    if (!entry) throw new Error(`${where}: not in the photo catalog.`);
    for (const ratio of cells[i]!.ratios) {
      if (!entry.ratios.includes(ratio)) {
        throw new Error(
          `${where}: this cell is cropped to ${ratio} at some container widths, which the photo does not allow ` +
            `(allowed: ${entry.ratios.join(', ')}). Reorder the photos or pick another.`,
        );
      }
    }
  });
}

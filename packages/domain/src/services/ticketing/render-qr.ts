/**
 * QR module matrix for a ticket payload (design §6): `uqr` (MIT, zero dependencies) picks the
 * alphanumeric segment mode for `GL1.<TICKET>.<V>.<MAC>` (≈ 58 characters → version 4), error
 * correction M. The matrix has no quiet zone; every renderer adds 4 modules of white around it.
 */
import { encode } from 'uqr';

/** Modules of white around the code (QR spec minimum). */
export const QR_QUIET_ZONE = 4;

export interface QrMatrix {
  /** Modules per side (without the quiet zone). */
  size: number;
  /** QR version (1–40). */
  version: number;
  /** `modules[y][x]` true = dark. */
  modules: boolean[][];
}

export function qrMatrix(payload: string): QrMatrix {
  const result = encode(payload, { ecc: 'M', border: 0 });
  return { size: result.size, version: result.version, modules: result.data };
}

/**
 * The dark modules as horizontal runs `[x, y, width]` (fewer rectangles than one per module:
 * smaller SVG/PDF output and faster drawing).
 */
export function qrRuns(matrix: QrMatrix): Array<[number, number, number]> {
  const runs: Array<[number, number, number]> = [];
  for (let y = 0; y < matrix.size; y++) {
    let x = 0;
    while (x < matrix.size) {
      if (!matrix.modules[y][x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < matrix.size && matrix.modules[y][x]) x++;
      runs.push([start, y, x - start]);
    }
  }
  return runs;
}

/**
 * Reads a QR code the way a phone camera would, from the server-made SVG (uqr's `renderSVG`: one `M x,y h w v h`
 * square per dark module). The squares are painted into a pixel buffer and decoded with jsQR. Used by
 * tests/e2e/live-door.spec.ts to follow the buyer's-phone QR and to read a ticket's credential.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

function loadJsQr(): JsQr {
  const require = createRequire(import.meta.url);
  try {
    return require('jsqr') as JsQr;
  } catch {
    // jsQR is in the workspace store (no package declares it); find it there.
    const store = join(process.cwd(), 'node_modules', '.pnpm');
    const dir = readdirSync(store).find((d) => d.startsWith('jsqr@'));
    if (!dir) throw new Error('jsQR is not installed; the QR code cannot be read');
    return require(join(store, dir, 'node_modules', 'jsqr', 'dist', 'jsQR.js')) as JsQr;
  }
}

export function decodeQrSvg(svg: string): string {
  const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (!box) throw new Error('not a QR SVG');
  const width = Number(box[1]);
  const height = Number(box[2]);
  // A white margin around the code, as on a screen.
  const pad = 24;
  const w = width + pad * 2;
  const h = height + pad * 2;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const m of svg.matchAll(/M(\d+),(\d+)h(\d+)v(\d+)/g)) {
    const [x, y, mw, mh] = m.slice(1).map(Number);
    for (let j = y; j < y + mh; j++)
      for (let i = x; i < x + mw; i++) {
        const o = ((j + pad) * w + (i + pad)) * 4;
        data[o] = data[o + 1] = data[o + 2] = 0;
      }
  }
  const found = loadJsQr()(data, w, h);
  if (!found) throw new Error('the QR code could not be read');
  return found.data;
}

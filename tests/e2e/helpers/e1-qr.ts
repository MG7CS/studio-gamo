/**
 * Reads the text of a ticket QR code from the server-made SVG on the order page (uqr's `renderSVG`: a white square and
 * one black path of `M x,y h w v h h -w z` modules), so the end-to-end spec can present the ticket at the door the way
 * a scanner would. The modules are drawn into a bitmap and decoded with jsQR (already in the workspace's store as a
 * dependency of another package; no new dependency).
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

const root = fileURLToPath(new URL('../../../', import.meta.url));
let decoder: JsQr | null = null;
function jsQr(): JsQr {
  if (decoder) return decoder;
  const store = join(root, 'node_modules/.pnpm');
  const dir = readdirSync(store).find((d) => d.startsWith('jsqr@'));
  if (!dir) throw new Error('jsqr is not in node_modules/.pnpm; the QR code cannot be read');
  const loaded = createRequire(import.meta.url)(join(store, dir, 'node_modules/jsqr')) as
    JsQr | { default: JsQr };
  decoder = typeof loaded === 'function' ? loaded : loaded.default;
  return decoder;
}

/** The text a QR code SVG carries, or throws when it cannot be read. */
export function decodeQrSvg(svg: string): string {
  const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  const path = /<path[^>]*\sd="([^"]+)"/.exec(svg);
  if (!box || !path) throw new Error('not a QR code SVG');
  const scale = 2;
  const width = Number(box[1]) * scale;
  const height = Number(box[2]) * scale;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const m of path[1].matchAll(/M(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)h(\d+(?:\.\d+)?)v(\d+(?:\.\d+)?)/g)) {
    const [x, y, w, h] = m.slice(1, 5).map((n) => Math.round(Number(n) * scale));
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++) {
        const i = (row * width + col) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
  }
  const result = jsQr()(pixels, width, height);
  if (!result?.data) throw new Error('the QR code could not be read');
  return result.data;
}

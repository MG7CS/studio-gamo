/**
 * QR-only PNG for emails (design T-06): a tiny PNG encoder — 1-bit greyscale, black on white, with the
 * 4-module quiet zone — compressed with the platform's `CompressionStream('deflate')` (zlib format, as
 * PNG requires). No dependencies; works in Workers and Node ≥ 18.
 */
import { QR_QUIET_ZONE, qrMatrix, type QrMatrix } from './render-qr.ts';

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Exported for tests. */
export function pngCrc32(bytes: Uint8Array): number {
  return crc32(bytes);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Encodes a bitmap where `dark(x, y)` is true for black pixels, as a 1-bit greyscale PNG.
 */
export async function encodeMonochromePng(
  width: number,
  height: number,
  dark: (x: number, y: number) => boolean,
): Promise<Uint8Array> {
  const rowBytes = Math.ceil(width / 8);
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (rowBytes + 1);
    raw[offset] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      // greyscale 1-bit: 1 = white, 0 = black
      if (!dark(x, y)) raw[offset + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const parts = [
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', await deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The QR code as a PNG: `scale` pixels per module (default 8 → 296 px for version 4) plus the quiet zone. */
export async function renderQrPng(payloadOrMatrix: string | QrMatrix, scale = 8): Promise<Uint8Array> {
  const matrix = typeof payloadOrMatrix === 'string' ? qrMatrix(payloadOrMatrix) : payloadOrMatrix;
  const modules = matrix.size + QR_QUIET_ZONE * 2;
  const px = modules * scale;
  return encodeMonochromePng(px, px, (x, y) => {
    const mx = Math.floor(x / scale) - QR_QUIET_ZONE;
    const my = Math.floor(y / scale) - QR_QUIET_ZONE;
    return mx >= 0 && my >= 0 && mx < matrix.size && my < matrix.size && matrix.modules[my][mx];
  });
}

/** Standard base64 (for email attachments). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  return btoa(binary);
}

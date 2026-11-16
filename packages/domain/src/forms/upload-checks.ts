/**
 * Pure upload rules for public forms: the content-type allowlist, size caps, first-bytes ("magic") checks
 * and filename sanitising. No I/O, so it is unit-testable and shared by `uploads.ts` and the serving handler.
 *
 * Decisions (spec 2026-11-16-forms-emails-invoices-design.md, "Uploads (cheap video)"):
 *  - Types come from OUR allowlist only; the browser-declared type is a hint that must match, never a source
 *    of truth. Anything else is rejected at start (`other` is never accepted from the public).
 *  - Caps: video 500 MB (mp4/quicktime/webm), photo 10 MB (jpeg/png/webp/heic), PDF 10 MB each and at most 5
 *    per session, at most 10 files per session.
 *  - After upload the first 64 bytes must match the declared type (ftyp at offset 4 for mp4/mov/heic,
 *    EBML 1A45DFA3 for webm, FFD8FF jpeg, 89504E47 png, RIFF....WEBP webp, %PDF- pdf).
 */
import type { UploadKind } from './schema.ts';

/** 8 MiB: above R2's 5 MiB minimum part size, so every part but the last is valid for R2. */
export const UPLOAD_PART_SIZE = 8_388_608;

export const UPLOAD_LIMITS = {
  partSize: UPLOAD_PART_SIZE,
  /** Files a session may start, ever (deleting one does not give the slot back). */
  maxFilesPerSession: 10,
  /** PDFs that may be live (started, uploaded or verified) in a session. */
  maxPdfsPerSession: 5,
  sessionTtlSeconds: 2 * 60 * 60,
  /** Bytes read from the start of a finished object for the magic check. */
  magicBytes: 64,
  video: { maxBytes: 524_288_000, types: ['video/mp4', 'video/quicktime', 'video/webm'] },
  photo: { maxBytes: 10_485_760, types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] },
  pdf: { maxBytes: 10_485_760, types: ['application/pdf'] },
  /** Photos are re-encoded to at most this many pixels wide. */
  photoMaxWidth: 1200,
  filenameMaxLength: 120,
} as const;

export type PublicUploadKind = Exclude<UploadKind, 'other'>;

/** Lower-cases and drops parameters: `Video/MP4; codecs=avc1` -> `video/mp4`. */
export function normalizeContentType(contentType: string): string {
  return String(contentType).split(';')[0].trim().toLowerCase();
}

/** The kind our allowlist assigns to a declared content type, or null when it is not accepted. */
export function uploadKindFor(contentType: string): PublicUploadKind | null {
  const type = normalizeContentType(contentType);
  if ((UPLOAD_LIMITS.video.types as readonly string[]).includes(type)) return 'video';
  if ((UPLOAD_LIMITS.photo.types as readonly string[]).includes(type)) return 'image';
  if ((UPLOAD_LIMITS.pdf.types as readonly string[]).includes(type)) return 'pdf';
  return null;
}

export function maxBytesFor(kind: PublicUploadKind): number {
  return kind === 'video'
    ? UPLOAD_LIMITS.video.maxBytes
    : kind === 'image'
      ? UPLOAD_LIMITS.photo.maxBytes
      : UPLOAD_LIMITS.pdf.maxBytes;
}

/** Number of parts for a declared size (a file that fits one part is a single part). */
export function partsFor(size: number): number {
  return Math.max(1, Math.ceil(size / UPLOAD_PART_SIZE));
}

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

/** Does the start of the object look like the declared type? */
export function matchesDeclaredType(contentType: string, head: Uint8Array): boolean {
  switch (normalizeContentType(contentType)) {
    case 'video/mp4':
    case 'video/quicktime':
      return ascii(head, 4, 'ftyp');
    case 'image/heic':
      return ascii(head, 4, 'ftyp') && HEIC_BRANDS.some((brand) => ascii(head, 8, brand));
    case 'video/webm':
      return startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'image/jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47]);
    case 'image/webp':
      return ascii(head, 0, 'RIFF') && ascii(head, 8, 'WEBP');
    case 'application/pdf':
      return ascii(head, 0, '%PDF-');
    default:
      return false;
  }
}

/**
 * The original filename is shown to staff only. Strip any path, control and bidi characters and anything
 * that could matter in a header or a path; never used for the storage key.
 */
export function sanitizeUploadFilename(name: string): string {
  const base = String(name).replace(/^.*[\\/]/, '');
  const clean = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩"<>:|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+/, '')
    .trim();
  return clean.slice(0, UPLOAD_LIMITS.filenameMaxLength).trim() || 'file';
}

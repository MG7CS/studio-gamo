/**
 * Streams an uploaded file to a signed-in staff member (`GET /files/{id}`). The route has already passed the
 * staff gate; this builds the response.
 *
 * Why every header is here (spec 2026-11-16-form-builder-ux-design.md, decision 14):
 * - `Content-Type` is chosen by the upload service from OUR allowlist, never from the browser-declared value
 *   or the file name; anything unexpected is `application/octet-stream`.
 * - `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`: a hostile file cannot run
 *   as a page or script in the admin origin even if a browser guessed wrong.
 * - Images and video are `inline` (shown in the submission page); PDFs and everything else download.
 * - `Cache-Control: private, no-store`: applicant files never sit in a shared or disk cache.
 * - A single byte range (206) is supported so video can seek; an unsatisfiable one is 416.
 * - Unknown, rejected, unverified, deleted and malformed ids all answer the same 404, and no storage key
 *   or object path is ever returned.
 */
import { errorResponse } from '@gamo/domain';
import { UPLOAD_LIMITS, sanitizeUploadFilename, type ServedUpload } from '@gamo/domain/forms';
import { ID_PATTERN } from './statuses.ts';

export type RangeOutcome =
  { kind: 'full' } | { kind: 'partial'; start: number; end: number } | { kind: 'unsatisfiable' };

/**
 * `Range: bytes=a-b | a- | -n` against a known size. Anything that is not one well-formed byte range is
 * ignored (the whole file is sent), as RFC 9110 allows; a well-formed range that starts at or past the end
 * is unsatisfiable.
 */
export function parseRange(header: string | null, size: number): RangeOutcome {
  if (header === null) return { kind: 'full' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return { kind: 'full' };
  if (size <= 0) return { kind: 'unsatisfiable' };
  if (m[1] === '') {
    const suffix = Number(m[2]);
    if (!Number.isSafeInteger(suffix)) return { kind: 'full' };
    if (suffix === 0) return { kind: 'unsatisfiable' };
    return { kind: 'partial', start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Number(m[2]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return { kind: 'full' };
  if (m[2] !== '' && end < start) return { kind: 'full' };
  if (start >= size) return { kind: 'unsatisfiable' };
  return { kind: 'partial', start, end: Math.min(end, size - 1) };
}

/** RFC 5987 `attr-char` encoding (stricter than `encodeURIComponent`). */
function encodeRfc5987(text: string): string {
  return encodeURIComponent(text).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** `inline|attachment; filename="<ascii>"; filename*=UTF-8''<encoded>` with a name that cannot break the header. */
export function contentDisposition(disposition: 'inline' | 'attachment', filename: string): string {
  const clean = sanitizeUploadFilename(filename);
  const ascii =
    clean
      .replace(/[^A-Za-z0-9._ -]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'file';
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(clean)}`;
}

const ALLOWED_TYPES = new Set<string>([
  ...UPLOAD_LIMITS.video.types,
  ...UPLOAD_LIMITS.photo.types,
  ...UPLOAD_LIMITS.pdf.types,
]);

type Serve = (
  uploadId: string,
  options?: { range?: { offset: number; length?: number } },
) => Promise<ServedUpload | null>;

const notFound = () =>
  errorResponse('NOT_FOUND', 'File not found.', 404, undefined, { 'Cache-Control': 'private, no-store' });

function baseHeaders(served: ServedUpload): Headers {
  const type = ALLOWED_TYPES.has(served.contentType) ? served.contentType : 'application/octet-stream';
  const inline = served.disposition === 'inline' && (type.startsWith('image/') || type.startsWith('video/'));
  const headers = new Headers();
  headers.set('Content-Type', type);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', 'sandbox');
  headers.set('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', served.filename));
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return headers;
}

export async function serveUpload(request: Request, uploadId: string, serve: Serve): Promise<Response> {
  if (!ID_PATTERN.test(uploadId)) return notFound();
  const full = await serve(uploadId);
  if (!full) return notFound();
  const size = Number.isFinite(full.object.size) ? full.object.size : full.size;

  const range = parseRange(request.headers.get('range'), size);
  const headers = baseHeaders(full);

  if (range.kind === 'unsatisfiable') {
    await full.object.body.cancel().catch(() => undefined);
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (range.kind === 'full') {
    headers.set('Content-Length', String(size));
    return new Response(full.object.body, { status: 200, headers });
  }

  const length = range.end - range.start + 1;
  await full.object.body.cancel().catch(() => undefined);
  const part = await serve(uploadId, { range: { offset: range.start, length } });
  if (!part) return notFound();
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  headers.set('Content-Length', String(length));
  return new Response(part.object.body, { status: 206, headers });
}

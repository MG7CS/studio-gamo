/**
 * UploadService: chunked, verified uploads for public forms, stored in R2 (Task 2.4).
 *
 * Research (Cloudflare docs, checked 2026-11-16):
 *  - R2 Workers API (https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ and
 *    .../workers-multipart-usage/): `bucket.createMultipartUpload(key, opts)` returns an R2MultipartUpload;
 *    `bucket.resumeMultipartUpload(key, uploadId)` is synchronous and does NOT check the id, so every call on
 *    it needs error handling; `uploadPart(n, value)` returns `{partNumber, etag}`; `complete(parts)` needs the
 *    etags of the parts to keep; `abort()` ends the upload. A part body of unknown length (stream) is a
 *    TypeError, so parts are passed as ArrayBuffer/Uint8Array.
 *  - Part rules (https://developers.cloudflare.com/r2/objects/upload-objects/): minimum 5 MiB except the last
 *    part, all non-last parts the same size, at most 10,000 parts, incomplete uploads are aborted after 7 days.
 *    We use 8 MiB parts (> 5 MiB), and the last part may be any size from 1 byte to 8 MiB.
 *    Re-sending a part number replaces that part (the etag changes), so a retry is safe; `complete` must then
 *    be given the NEWEST etag, which we keep per part number.
 *  - Images binding (https://developers.cloudflare.com/images/optimization/binding/): `env.IMAGES.input(stream)`
 *    (max 20 MB input) `.transform({...}).output({format, quality})` resolves to a result with `.response()`;
 *    `transform.metadata: 'none'` drops EXIF (WebP output always drops metadata), `fit: 'scale-down'` never
 *    enlarges; HEIC is an accepted input format (https://developers.cloudflare.com/images/get-started/limits/).
 *
 * Decisions:
 *  - The session token is 32 random bytes plus a short HMAC tag (FORM_UPLOAD_SECRET) so garbage is rejected
 *    before any DB read; ONLY sha256(token) is stored in upload_sessions. One error code (UPLOAD_TOKEN_INVALID)
 *    covers malformed, unknown and expired tokens so the answer is not an oracle.
 *  - A file of one part (<= 8 MiB) is stored with a single `put` when its part arrives (there is nowhere to
 *    buffer it until `complete`); larger files use multipart, completed in `complete`.
 *  - The final size check (`head().size === declared size`) is authoritative: part rules bound how much a
 *    client can send (at most ceil(size / partSize) parts) but a declared size that lies is rejected on complete.
 *  - `parts_json` holds an OBJECT keyed by part number (`{"3":{"etag":"…","size":123}}`), updated with one
 *    atomic `json_set` so parallel part uploads cannot lose each other's updates.
 *  - `form_uploads.status`: started -> uploaded (a complete() is processing; second callers get
 *    UPLOAD_SEQUENCE) -> verified | rejected; deleted when discarded. A failure after the multipart is
 *    completed rejects the upload with reason `storage_error` (the client restarts that file).
 *  - Per-session file cap counts files STARTED (deleting a file does not give the slot back); the PDF cap
 *    counts PDFs that are still live. Both are enforced atomically in SQL.
 *  - Errors and logs name codes only: never tokens, keys, filenames or object contents.
 *
 * Callers (route handlers) verify Turnstile, same-origin and rate limits BEFORE `startSession`/`start`, must
 * refuse a part request whose Content-Length exceeds `UPLOAD_LIMITS.partSize` before reading the body, and must
 * pass the session token to `attach` so a submission cannot claim another visitor's uploads.
 *
 * Access model: PUBLIC methods (startSession, start, putPart, complete, abort/delete, attach) require the
 * session token and scope every lookup by session id. STAFF/INTERNAL methods (attachAsStaff, getForServing,
 * moveToDeclined, deleteForSubmission, deletePendingOlderThan) take no token and must never be reachable from
 * a public route.
 */
import {
  bytesToBase64Url,
  constantTimeEqual,
  hmacSha256Hex,
  randomBytes,
  requireSecret,
  sha256Hex,
} from '../security/crypto.ts';
import { newPrefixedId } from '../security/ids.ts';
import { changesOf, type SqlDatabase, type SqlParam } from '../security/sql-database.ts';
import type { UploadKind, UploadRef } from './schema.ts';
import {
  UPLOAD_LIMITS,
  UPLOAD_PART_SIZE,
  matchesDeclaredType,
  maxBytesFor,
  normalizeContentType,
  partsFor,
  sanitizeUploadFilename,
  uploadKindFor,
} from './upload-checks.ts';

export { UPLOAD_LIMITS, uploadKindFor };

// ---------------------------------------------------------------------------------------------------------
// Binding shapes (the subset of R2Bucket and ImagesBinding used here)
// ---------------------------------------------------------------------------------------------------------

export interface UploadedPartLike {
  partNumber: number;
  etag: string;
}

export interface UploadMultipartLike {
  uploadPart(partNumber: number, value: ArrayBuffer | Uint8Array): Promise<UploadedPartLike>;
  complete(parts: UploadedPartLike[]): Promise<unknown>;
  abort(): Promise<void>;
}

export interface UploadObjectBodyLike {
  size: number;
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface UploadBucketLike {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(
    key: string,
    options?: { range?: { offset: number; length?: number } },
  ): Promise<UploadObjectBodyLike | null>;
  head(key: string): Promise<{ size: number } | null>;
  delete(keys: string | string[]): Promise<void>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<{ uploadId: string } & UploadMultipartLike>;
  resumeMultipartUpload(key: string, uploadId: string): UploadMultipartLike;
}

export interface ImagesHandleLike {
  transform(options: {
    width?: number;
    fit?: string;
    metadata?: 'none' | 'copyright' | 'keep';
  }): ImagesHandleLike;
  output(options: { format: string; quality?: number }): Promise<{ response(): Response }>;
}

/** Minimal `env.IMAGES` (Cloudflare Images binding). */
export interface ImagesBindingLike {
  input(stream: ReadableStream<Uint8Array>): ImagesHandleLike;
}

/** The environment values this service reads (kept local: packages/config is edited elsewhere). */
export interface UploadEnvLike {
  FORM_UPLOAD_SECRET?: string;
  MEDIA_BUCKET?: UploadBucketLike;
  IMAGES?: ImagesBindingLike;
}

export interface UploadServiceOptions {
  /** FORM_UPLOAD_SECRET (>= 32 characters). A missing or short secret throws SecretNotConfiguredError. */
  secret: string | undefined;
  images?: ImagesBindingLike;
  /** Clock in epoch SECONDS (default: Date.now() / 1000). */
  now?: () => number;
}

// ---------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------

export type UploadErrorCode =
  | 'UPLOAD_TOKEN_INVALID'
  | 'UPLOAD_LIMIT'
  | 'UPLOAD_TYPE'
  | 'UPLOAD_SIZE'
  | 'UPLOAD_SEQUENCE'
  | 'UPLOAD_NOT_FOUND'
  | 'UPLOAD_INVALID'
  | 'UPLOAD_ATTACH'
  | 'UPLOAD_ATTACHED'
  | 'UPLOAD_STORAGE'
  | 'UPLOAD_UNAVAILABLE';

const ERROR_DEFAULTS: Record<UploadErrorCode, { status: number; message: string }> = {
  UPLOAD_TOKEN_INVALID: { status: 401, message: 'The upload session is not valid or has expired.' },
  UPLOAD_LIMIT: { status: 400, message: 'Too many files for this upload session.' },
  UPLOAD_TYPE: { status: 400, message: 'This file type is not accepted.' },
  UPLOAD_SIZE: { status: 400, message: 'The file size is not allowed.' },
  UPLOAD_SEQUENCE: { status: 409, message: 'The upload is not in a state that allows this step.' },
  UPLOAD_NOT_FOUND: { status: 404, message: 'Upload not found.' },
  UPLOAD_INVALID: { status: 400, message: 'The upload request is not valid.' },
  UPLOAD_ATTACH: { status: 409, message: 'These uploads cannot be attached.' },
  UPLOAD_ATTACHED: { status: 409, message: 'The upload is already part of a submission.' },
  UPLOAD_STORAGE: { status: 503, message: 'File storage is temporarily unavailable.' },
  UPLOAD_UNAVAILABLE: { status: 503, message: 'File uploads are not available.' },
};

/** Typed upload failure. `status` is the HTTP status a handler should answer with. Never carries secrets. */
export class UploadError extends Error {
  readonly code: UploadErrorCode;
  readonly status: number;
  constructor(code: UploadErrorCode, options: { status?: number; message?: string } = {}) {
    super(options.message ?? ERROR_DEFAULTS[code].message);
    this.name = 'UploadError';
    this.code = code;
    this.status = options.status ?? ERROR_DEFAULTS[code].status;
  }
}

export function isUploadError(error: unknown): error is UploadError {
  return error instanceof UploadError;
}

// ---------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------

export type RejectReason = 'size_mismatch' | 'content_mismatch' | 'image_unreadable' | 'storage_error';

export type CompleteResult = { status: 'verified' } | { status: 'rejected'; reason: RejectReason };

export interface AttachedUpload extends UploadRef {
  questionId: string;
  contentType: string;
  originalName: string | null;
}

export interface ServedUpload {
  object: UploadObjectBodyLike;
  /** From OUR allowlist only (never the browser-declared value); `application/octet-stream` as a fallback. */
  contentType: string;
  /** Images and video are shown inline, everything else downloads. */
  disposition: 'inline' | 'attachment';
  size: number;
  kind: UploadKind;
  /** Sanitised original name for the Content-Disposition filename. */
  filename: string;
}

export interface CleanupResult {
  uploads: number;
  sessions: number;
  failures: number;
}

interface SessionRow {
  id: string;
  form_slug: string;
  expires_at: number;
}

interface UploadRow {
  id: string;
  session_id: string | null;
  submission_id: string | null;
  question_id: string;
  kind: UploadKind;
  content_type: string;
  original_name: string | null;
  bytes: number;
  r2_key: string;
  multipart_upload_id: string | null;
  parts_json: string;
  status: 'started' | 'uploaded' | 'verified' | 'rejected' | 'deleted';
  reject_reason: string | null;
}

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}\.[0-9a-f]{22}$/;
const TOKEN_PURPOSE = 'form-upload-session';
const QUESTION_ID = /^[A-Za-z0-9_-]{1,80}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const FORM_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_ATTACH = 20;
const CLEANUP_BATCH = 1000;

const SERVED_TYPES = new Set<string>([
  ...UPLOAD_LIMITS.video.types,
  ...UPLOAD_LIMITS.photo.types,
  ...UPLOAD_LIMITS.pdf.types,
]);

const UPLOAD_COLUMNS =
  'id, session_id, submission_id, question_id, kind, content_type, original_name, bytes, r2_key, multipart_upload_id, parts_json, status, reject_reason';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Builds the service from Worker bindings. Throws UPLOAD_UNAVAILABLE (503) when MEDIA_BUCKET is missing. */
export function uploadServiceFromEnv(db: SqlDatabase, env: UploadEnvLike, now?: () => number): UploadService {
  if (!env.MEDIA_BUCKET) throw new UploadError('UPLOAD_UNAVAILABLE');
  return new UploadService(db, env.MEDIA_BUCKET, { secret: env.FORM_UPLOAD_SECRET, images: env.IMAGES, now });
}

// ---------------------------------------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------------------------------------

export class UploadService {
  private readonly secret: string;
  private readonly images: ImagesBindingLike | undefined;
  private readonly clock: () => number;

  constructor(
    private readonly db: SqlDatabase,
    private readonly bucket: UploadBucketLike,
    options: UploadServiceOptions,
  ) {
    this.secret = requireSecret('FORM_UPLOAD_SECRET', options.secret);
    this.images = options.images;
    this.clock = options.now ?? nowSeconds;
  }

  // -- sessions -------------------------------------------------------------------------------------------

  /** Caller has already passed Turnstile and the per-IP rate limit. */
  async startSession(input: {
    formSlug: string;
    ipHash: string | null;
    now?: number;
  }): Promise<{ token: string; expiresAt: number }> {
    if (!FORM_SLUG.test(input.formSlug)) throw new UploadError('UPLOAD_INVALID');
    const now = input.now ?? this.clock();
    const random = bytesToBase64Url(randomBytes(32));
    const tag = (await hmacSha256Hex(this.secret, `${TOKEN_PURPOSE}|${random}`)).slice(0, 22);
    const token = `${random}.${tag}`;
    const expiresAt = now + UPLOAD_LIMITS.sessionTtlSeconds;
    await this.run(
      'INSERT INTO upload_sessions (id, form_slug, token_hash, ip_hash, expires_at, created_at, file_count) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [newPrefixedId('ups'), input.formSlug, await sha256Hex(token), input.ipHash, expiresAt, now],
    );
    return { token, expiresAt };
  }

  // -- uploads --------------------------------------------------------------------------------------------

  async start(input: {
    token: string;
    questionId: string;
    filename: string;
    size: number;
    contentType: string;
    now?: number;
  }): Promise<{ uploadId: string; partSize: number; parts: number }> {
    const now = input.now ?? this.clock();
    if (typeof input.questionId !== 'string' || !QUESTION_ID.test(input.questionId))
      throw new UploadError('UPLOAD_INVALID');
    if (typeof input.filename !== 'string' || input.filename.length < 1 || input.filename.length > 255)
      throw new UploadError('UPLOAD_INVALID');
    const kind = uploadKindFor(String(input.contentType));
    if (!kind) throw new UploadError('UPLOAD_TYPE');
    if (!Number.isInteger(input.size) || input.size < 1) throw new UploadError('UPLOAD_SIZE');
    if (input.size > maxBytesFor(kind)) throw new UploadError('UPLOAD_SIZE', { status: 413 });

    const session = await this.requireSession(input.token, now);

    // Atomic slot: a concurrent burst cannot exceed the cap.
    const slot = await this.run(
      'UPDATE upload_sessions SET file_count = file_count + 1 WHERE id = ? AND file_count < ?',
      [session.id, UPLOAD_LIMITS.maxFilesPerSession],
    );
    if (slot === 0) throw new UploadError('UPLOAD_LIMIT');

    const contentType = normalizeContentType(input.contentType);
    const parts = partsFor(input.size);
    const uploadId = newPrefixedId('fup');
    const key = `forms/pending/${session.id}/${crypto.randomUUID()}`;
    let multipartId: string | null = null;
    try {
      if (parts > 1) {
        const mp = await this.bucket.createMultipartUpload(key, { httpMetadata: { contentType } });
        multipartId = mp.uploadId;
      }
    } catch {
      await this.releaseSlot(session.id);
      throw new UploadError('UPLOAD_STORAGE');
    }

    let inserted: number;
    try {
      // The PDF cap is part of the insert so two parallel starts cannot both take the last slot.
      inserted = await this.run(
        `INSERT INTO form_uploads
           (id, session_id, submission_id, question_id, kind, content_type, original_name, bytes, r2_key,
            multipart_upload_id, parts_json, status, created_at)
         SELECT ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, '{}', 'started', ?
         WHERE ? <> 'pdf' OR (SELECT COUNT(*) FROM form_uploads
                              WHERE session_id = ? AND kind = 'pdf' AND status IN ('started', 'uploaded', 'verified')) < ?`,
        [
          uploadId,
          session.id,
          input.questionId,
          kind,
          contentType,
          sanitizeUploadFilename(input.filename),
          input.size,
          key,
          multipartId,
          now,
          kind,
          session.id,
          UPLOAD_LIMITS.maxPdfsPerSession,
        ],
      );
    } catch (error) {
      await this.abortQuietly(key, multipartId);
      await this.releaseSlot(session.id);
      throw error;
    }
    if (inserted === 0) {
      await this.abortQuietly(key, multipartId);
      await this.releaseSlot(session.id);
      throw new UploadError('UPLOAD_LIMIT');
    }
    return { uploadId, partSize: UPLOAD_PART_SIZE, parts };
  }

  /** Idempotent per part number: sending part n again replaces it. */
  async putPart(
    uploadId: string,
    token: string,
    partNumber: number,
    body: ArrayBuffer | Uint8Array,
  ): Promise<{ partNumber: number; etag: string }> {
    const session = await this.requireSession(token, this.clock());
    const row = await this.loadUpload(uploadId, session.id);
    if (!row) throw new UploadError('UPLOAD_NOT_FOUND');
    if (row.status !== 'started') throw new UploadError('UPLOAD_SEQUENCE');
    const total = partsFor(row.bytes);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > total)
      throw new UploadError('UPLOAD_SEQUENCE');

    const length = body.byteLength;
    if (length < 1) throw new UploadError('UPLOAD_SIZE');
    if (length > UPLOAD_PART_SIZE) throw new UploadError('UPLOAD_SIZE', { status: 413 });
    if (partNumber < total && length !== UPLOAD_PART_SIZE) throw new UploadError('UPLOAD_SIZE');

    let etag: string;
    try {
      if (total === 1) {
        const stored = (await this.bucket.put(row.r2_key, body, {
          httpMetadata: { contentType: row.content_type },
        })) as { etag?: string } | null;
        etag = stored?.etag ?? 'single';
      } else {
        if (!row.multipart_upload_id) throw new UploadError('UPLOAD_SEQUENCE');
        const uploaded = await this.bucket
          .resumeMultipartUpload(row.r2_key, row.multipart_upload_id)
          .uploadPart(partNumber, body);
        etag = uploaded.etag;
      }
    } catch (error) {
      if (isUploadError(error)) throw error;
      throw new UploadError('UPLOAD_STORAGE');
    }

    const changes = await this.run(
      "UPDATE form_uploads SET parts_json = json_set(parts_json, ?, json(?)) WHERE id = ? AND status = 'started'",
      [`$."${partNumber}"`, JSON.stringify({ etag, size: length }), row.id],
    );
    if (changes === 0) throw new UploadError('UPLOAD_SEQUENCE');
    return { partNumber, etag };
  }

  /**
   * Completes the multipart upload and verifies it. A repeat call returns the stored result and never
   * re-verifies. Rejected uploads have their object deleted.
   */
  async complete(uploadId: string, token: string): Promise<CompleteResult> {
    const now = this.clock();
    const session = await this.requireSession(token, now);
    const row = await this.loadUpload(uploadId, session.id);
    if (!row || row.status === 'deleted') throw new UploadError('UPLOAD_NOT_FOUND');
    const stored = this.storedResult(row);
    if (stored) return stored;
    if (row.status !== 'started') throw new UploadError('UPLOAD_SEQUENCE');

    const total = partsFor(row.bytes);
    const recorded = this.parseParts(row.parts_json);
    const list: UploadedPartLike[] = [];
    for (let n = 1; n <= total; n++) {
      const part = recorded[String(n)];
      if (!part) throw new UploadError('UPLOAD_SEQUENCE');
      list.push({ partNumber: n, etag: part.etag });
    }

    const claimed = await this.run(
      "UPDATE form_uploads SET status = 'uploaded' WHERE id = ? AND status = 'started'",
      [row.id],
    );
    if (claimed === 0) {
      const again = await this.loadUpload(uploadId, session.id);
      const result = again ? this.storedResult(again) : null;
      if (result) return result;
      throw new UploadError('UPLOAD_SEQUENCE');
    }

    if (total > 1) {
      try {
        if (!row.multipart_upload_id) throw new Error('missing multipart id');
        await this.bucket.resumeMultipartUpload(row.r2_key, row.multipart_upload_id).complete(list);
      } catch {
        // Parts are intact: let the client fix or resend parts and call complete again.
        await this.run("UPDATE form_uploads SET status = 'started' WHERE id = ? AND status = 'uploaded'", [
          row.id,
        ]);
        throw new UploadError('UPLOAD_STORAGE');
      }
    }
    return this.verify(row, now);
  }

  /** Abandons an upload that belongs to the session and is not attached yet. Missing uploads are a no-op. */
  async abort(uploadId: string, token: string): Promise<{ deleted: boolean }> {
    const session = await this.requireSession(token, this.clock());
    const row = await this.loadUpload(uploadId, session.id);
    if (!row || row.status === 'deleted') return { deleted: false };
    if (row.submission_id) throw new UploadError('UPLOAD_ATTACHED');
    if (!(await this.discard(row))) throw new UploadError('UPLOAD_STORAGE');
    return { deleted: true };
  }

  /** Same as `abort` (the HTTP verb is DELETE). */
  delete(uploadId: string, token: string): Promise<{ deleted: boolean }> {
    return this.abort(uploadId, token);
  }

  // -- submissions ----------------------------------------------------------------------------------------

  /**
   * PUBLIC (session token required). Binds the session's verified uploads to a submission and moves their
   * objects to `forms/submissions/{submissionId}/…` (copy, then delete the old key). Only uploads that belong
   * to the token's session can be attached; ids of other sessions and ids that do not exist both answer
   * UPLOAD_NOT_FOUND, so existence is not revealed. A missing or invalid token always throws
   * UPLOAD_TOKEN_INVALID: there is no id-only fallback. An expired token still proves ownership (people finish
   * long forms). Repeat calls are safe.
   */
  async attach(
    uploadIds: string[],
    submissionId: string,
    now: number,
    opts: { token: string },
  ): Promise<AttachedUpload[]> {
    const token = (opts as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string') throw new UploadError('UPLOAD_TOKEN_INVALID');
    const session = await this.requireSession(token, now, true);
    return this.attachRows(uploadIds, submissionId, session.id);
  }

  /**
   * STAFF / INTERNAL ONLY. Attaches uploads of ANY session with no ownership check. Never call this from a
   * public route handler, and never pass it ids that came from a visitor: use `attach` with the session token.
   */
  attachAsStaff(uploadIds: string[], submissionId: string, _now: number): Promise<AttachedUpload[]> {
    return this.attachRows(uploadIds, submissionId, null);
  }

  private async attachRows(
    uploadIds: string[],
    submissionId: string,
    sessionId: string | null,
  ): Promise<AttachedUpload[]> {
    if (!SAFE_ID.test(submissionId)) throw new UploadError('UPLOAD_INVALID');
    const ids = [...new Set(uploadIds)];
    if (ids.length > MAX_ATTACH) throw new UploadError('UPLOAD_LIMIT');

    const rows: UploadRow[] = [];
    for (const id of ids) {
      const row = sessionId ? await this.loadUpload(id, sessionId) : await this.loadUploadById(id);
      if (!row || row.status === 'deleted') throw new UploadError('UPLOAD_NOT_FOUND');
      if (row.submission_id === submissionId && row.status === 'verified') {
        rows.push(row);
        continue;
      }
      if (row.status !== 'verified' || row.submission_id !== null) throw new UploadError('UPLOAD_ATTACH');
      rows.push(row);
    }

    const attached: AttachedUpload[] = [];
    for (const row of rows) {
      if (row.submission_id !== submissionId) {
        const newKey = `forms/submissions/${submissionId}/${crypto.randomUUID()}`;
        await this.copyObject(row.r2_key, newKey, row.content_type);
        const changes = await this.run(
          "UPDATE form_uploads SET submission_id = ?, r2_key = ? WHERE id = ? AND status = 'verified' AND submission_id IS NULL AND r2_key = ?",
          [submissionId, newKey, row.id, row.r2_key],
        );
        if (changes === 0) {
          await this.bucket.delete(newKey).catch(() => undefined);
          throw new UploadError('UPLOAD_ATTACH');
        }
        await this.bucket.delete(row.r2_key).catch(() => undefined);
      }
      attached.push({
        uploadId: row.id,
        kind: row.kind,
        bytes: row.bytes,
        questionId: row.question_id,
        contentType: row.content_type,
        originalName: row.original_name,
      });
    }
    return attached;
  }

  /** STAFF / INTERNAL ONLY (no token). Declined submissions keep their files 90 days in `forms/declined/{submissionId}/…`. Returns files moved. */
  async moveToDeclined(submissionId: string): Promise<number> {
    if (!SAFE_ID.test(submissionId)) throw new UploadError('UPLOAD_INVALID');
    const rows = await this.rows<UploadRow>(
      `SELECT ${UPLOAD_COLUMNS} FROM form_uploads WHERE submission_id = ? AND status = 'verified'`,
      [submissionId],
    );
    let moved = 0;
    for (const row of rows) {
      if (row.r2_key.startsWith('forms/declined/')) continue;
      const newKey = `forms/declined/${submissionId}/${crypto.randomUUID()}`;
      await this.copyObject(row.r2_key, newKey, row.content_type);
      const changes = await this.run(
        "UPDATE form_uploads SET r2_key = ? WHERE id = ? AND status = 'verified' AND r2_key = ?",
        [newKey, row.id, row.r2_key],
      );
      if (changes === 0) {
        await this.bucket.delete(newKey).catch(() => undefined);
        continue;
      }
      await this.bucket.delete(row.r2_key).catch(() => undefined);
      moved++;
    }
    return moved;
  }

  /** STAFF / INTERNAL ONLY (no token). Retention: removes every file of a submission (object deleted, row kept as `deleted` without the name). */
  async deleteForSubmission(submissionId: string): Promise<{ deleted: number; failures: number }> {
    if (!SAFE_ID.test(submissionId)) throw new UploadError('UPLOAD_INVALID');
    const rows = await this.rows<UploadRow>(
      `SELECT ${UPLOAD_COLUMNS} FROM form_uploads WHERE submission_id = ? AND status <> 'deleted'`,
      [submissionId],
    );
    let deleted = 0;
    let failures = 0;
    for (const row of rows) {
      if (await this.discard(row)) deleted++;
      else failures++;
    }
    return { deleted, failures };
  }

  // -- serving (staff handlers only) ----------------------------------------------------------------------

  /**
   * STAFF ONLY (no token, no session scope): call it only from a handler that already passed `requireStaff`.
   * Null when the upload is missing, not verified (rejected, pending, deleted) or its object is gone. */
  async getForServing(
    uploadId: string,
    options: { range?: { offset: number; length?: number } } = {},
  ): Promise<ServedUpload | null> {
    const row = await this.loadUploadById(uploadId);
    if (!row || row.status !== 'verified') return null;
    const object = await this.bucket
      .get(row.r2_key, options.range ? { range: options.range } : undefined)
      .catch(() => null);
    if (!object) return null;
    const known = SERVED_TYPES.has(row.content_type) || row.content_type === 'image/webp';
    const contentType = known ? row.content_type : 'application/octet-stream';
    const inline = known && (row.kind === 'image' || row.kind === 'video');
    return {
      object,
      contentType,
      disposition: inline ? 'inline' : 'attachment',
      size: row.bytes,
      kind: row.kind,
      filename: sanitizeUploadFilename(row.original_name ?? 'file'),
    };
  }

  // -- retention ------------------------------------------------------------------------------------------

  /**
   * STAFF / CRON ONLY (no token). Daily cron: files that never reached a submission (created more than `seconds` ago) are aborted or
   * deleted and marked `deleted`; sessions that expired more than `seconds` ago are purged. A file whose
   * object could not be deleted stays as it is for the next run.
   */
  async deletePendingOlderThan(seconds: number, now: number): Promise<CleanupResult> {
    const cutoff = now - seconds;
    const rows = await this.rows<UploadRow>(
      `SELECT ${UPLOAD_COLUMNS} FROM form_uploads
       WHERE submission_id IS NULL AND status <> 'deleted' AND created_at < ?
       ORDER BY created_at LIMIT ${CLEANUP_BATCH}`,
      [cutoff],
    );
    let uploads = 0;
    let failures = 0;
    for (const row of rows) {
      if (await this.discard(row)) uploads++;
      else failures++;
    }
    const sessions = await this.run('DELETE FROM upload_sessions WHERE expires_at < ?', [cutoff]);
    return { uploads, sessions, failures };
  }

  // -- internals ------------------------------------------------------------------------------------------

  private async requireSession(token: string, now: number, allowExpired = false): Promise<SessionRow> {
    if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) throw new UploadError('UPLOAD_TOKEN_INVALID');
    const [random, tag] = token.split('.');
    const expected = (await hmacSha256Hex(this.secret, `${TOKEN_PURPOSE}|${random}`)).slice(0, 22);
    if (!constantTimeEqual(expected, tag)) throw new UploadError('UPLOAD_TOKEN_INVALID');
    const row = await this.first<SessionRow>(
      'SELECT id, form_slug, expires_at FROM upload_sessions WHERE token_hash = ?',
      [await sha256Hex(token)],
    );
    if (!row || (!allowExpired && row.expires_at <= now)) throw new UploadError('UPLOAD_TOKEN_INVALID');
    return row;
  }

  private loadUpload(uploadId: string, sessionId: string): Promise<UploadRow | null> {
    return this.first<UploadRow>(
      `SELECT ${UPLOAD_COLUMNS} FROM form_uploads WHERE id = ? AND session_id = ?`,
      [String(uploadId), sessionId],
    );
  }

  private loadUploadById(uploadId: string): Promise<UploadRow | null> {
    return this.first<UploadRow>(`SELECT ${UPLOAD_COLUMNS} FROM form_uploads WHERE id = ?`, [
      String(uploadId),
    ]);
  }

  private storedResult(row: UploadRow): CompleteResult | null {
    if (row.status === 'verified') return { status: 'verified' };
    if (row.status === 'rejected')
      return { status: 'rejected', reason: (row.reject_reason as RejectReason | null) ?? 'content_mismatch' };
    return null;
  }

  private parseParts(json: string): Record<string, { etag: string; size: number }> {
    try {
      const value = JSON.parse(json) as unknown;
      return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, { etag: string; size: number }>)
        : {};
    } catch {
      return {};
    }
  }

  /** Size, magic bytes and (for photos) re-encode, after the object is whole in R2. */
  private async verify(row: UploadRow, now: number): Promise<CompleteResult> {
    let key = row.r2_key;
    let bytes = row.bytes;
    let contentType = row.content_type;
    try {
      const head = await this.bucket.head(key);
      if (!head || head.size !== row.bytes) return await this.reject(row, 'size_mismatch', now);

      const start = await this.bucket.get(key, { range: { offset: 0, length: UPLOAD_LIMITS.magicBytes } });
      if (!start) return await this.reject(row, 'storage_error', now);
      const first = new Uint8Array(await start.arrayBuffer());
      if (!matchesDeclaredType(row.content_type, first))
        return await this.reject(row, 'content_mismatch', now);

      if (row.kind === 'image' && this.images) {
        const original = await this.bucket.get(key);
        if (!original) return await this.reject(row, 'storage_error', now);
        const encoded = await this.reencode(original.body);
        if (!encoded) return await this.reject(row, 'image_unreadable', now);
        const newKey = `forms/pending/${row.session_id ?? 'orphan'}/${crypto.randomUUID()}`;
        await this.bucket.put(newKey, encoded, { httpMetadata: { contentType: 'image/webp' } });
        await this.run('UPDATE form_uploads SET r2_key = ?, bytes = ?, content_type = ? WHERE id = ?', [
          newKey,
          encoded.byteLength,
          'image/webp',
          row.id,
        ]);
        await this.bucket.delete(key);
        key = newKey;
        bytes = encoded.byteLength;
        contentType = 'image/webp';
      }
    } catch (error) {
      if (isUploadError(error)) throw error;
      return this.reject({ ...row, r2_key: key }, 'storage_error', now);
    }
    await this.run(
      "UPDATE form_uploads SET status = 'verified', reject_reason = NULL, completed_at = ?, multipart_upload_id = NULL, r2_key = ?, bytes = ?, content_type = ? WHERE id = ?",
      [now, key, bytes, contentType, row.id],
    );
    return { status: 'verified' };
  }

  /** At most 1200 px wide WebP, no metadata. Null when the bytes are not a decodable image. */
  private async reencode(stream: ReadableStream<Uint8Array>): Promise<Uint8Array | null> {
    if (!this.images) return null;
    try {
      const result = await this.images
        .input(stream)
        .transform({ width: UPLOAD_LIMITS.photoMaxWidth, fit: 'scale-down', metadata: 'none' })
        .output({ format: 'image/webp', quality: 82 });
      const out = new Uint8Array(await result.response().arrayBuffer());
      if (out.byteLength < 1 || out.byteLength > UPLOAD_LIMITS.photo.maxBytes) return null;
      return matchesDeclaredType('image/webp', out) ? out : null;
    } catch {
      return null;
    }
  }

  private async reject(row: UploadRow, reason: RejectReason, now: number): Promise<CompleteResult> {
    await this.bucket.delete(row.r2_key).catch(() => undefined);
    await this.run(
      "UPDATE form_uploads SET status = 'rejected', reject_reason = ?, completed_at = ?, multipart_upload_id = NULL WHERE id = ?",
      [reason, now, row.id],
    );
    return { status: 'rejected', reason };
  }

  /** Aborts a multipart upload or deletes the object, then marks the row deleted. False when R2 failed. */
  private async discard(row: UploadRow): Promise<boolean> {
    try {
      if (row.status === 'started' && row.multipart_upload_id) {
        // Already completed or aborted uploads throw NoSuchUpload: harmless; R2 expires them after 7 days.
        await this.bucket
          .resumeMultipartUpload(row.r2_key, row.multipart_upload_id)
          .abort()
          .catch(() => undefined);
      }
      await this.bucket.delete(row.r2_key);
    } catch {
      return false;
    }
    await this.run(
      "UPDATE form_uploads SET status = 'deleted', original_name = NULL, multipart_upload_id = NULL, parts_json = '{}' WHERE id = ?",
      [row.id],
    );
    return true;
  }

  private async copyObject(from: string, to: string, contentType: string): Promise<void> {
    try {
      const source = await this.bucket.get(from);
      if (!source) throw new Error('source missing');
      await this.bucket.put(to, source.body, { httpMetadata: { contentType } });
    } catch {
      throw new UploadError('UPLOAD_STORAGE');
    }
  }

  private async abortQuietly(key: string, multipartId: string | null): Promise<void> {
    if (!multipartId) return;
    await this.bucket
      .resumeMultipartUpload(key, multipartId)
      .abort()
      .catch(() => undefined);
  }

  private async releaseSlot(sessionId: string): Promise<void> {
    await this.run('UPDATE upload_sessions SET file_count = file_count - 1 WHERE id = ? AND file_count > 0', [
      sessionId,
    ]);
  }

  private async run(sql: string, params: SqlParam[]): Promise<number> {
    return changesOf(
      await this.db
        .prepare(sql)
        .bind(...params)
        .run(),
    );
  }

  private async first<T>(sql: string, params: SqlParam[]): Promise<T | null> {
    return (
      ((await this.db
        .prepare(sql)
        .bind(...params)
        .first()) as T | null | undefined) ?? null
    );
  }

  private async rows<T>(sql: string, params: SqlParam[]): Promise<T[]> {
    const result = await this.db
      .prepare(sql)
      .bind(...params)
      .all();
    return (result.results ?? []) as T[];
  }
}

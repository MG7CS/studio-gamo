/**
 * Browser uploader for public-form files (`file_upload` questions), the client half of the contract in
 * `openapi/paths/forms-upload*.yaml`:
 *
 *   POST   /api/forms/{slug}/upload-session      { turnstileToken }                 -> { token, expiresAt }
 *   POST   /api/forms/uploads                    { token, questionId, filename,
 *                                                  size, contentType }              -> { uploadId, partSize, parts }
 *   PUT    /api/forms/uploads/{id}/parts/{n}     raw bytes, X-Upload-Token          -> { etag? }
 *   POST   /api/forms/uploads/{id}/complete      X-Upload-Token                     -> { status, reason? }
 *   DELETE /api/forms/uploads/{id}               X-Upload-Token                     -> 204
 *
 * Rules
 * - Same origin only: every request is a root-relative path built from encoded parts, sent with
 *   `credentials: 'same-origin'`. Nothing here can name another host.
 * - Parts are the size the server returns (8 MiB, `PART_SIZE`), numbered from 1 and sent one at a time.
 *   Each part is retried up to `MAX_PART_RETRIES` (3) times after the first try, with backoff
 *   (`BACKOFF_MS`, or `Retry-After` for a 429), only for failures that can pass: lost connection, 408, 429
 *   and 5xx. A part is idempotent on the server, so a retry is safe. `complete` is idempotent too and is
 *   retried the same way; `session` and `start` are never retried (a Turnstile token is single use and
 *   `start` opens a new multipart upload).
 * - Progress is reported per finished part (`fetch` has no upload progress), so a file of one part jumps
 *   from 0 to 100 %. Abort with the `signal` option: the upload stops before the next request and the
 *   pending object is deleted (best effort).
 * - Failures are `UploadFailure`s with a plain-language `message` and `linkInstead`: true when the person
 *   can still send a video by pasting a YouTube, Vimeo, Google Drive or Dropbox link, which the page offers.
 * - The client checks type and size first so an obviously wrong file never reaches the network; the server
 *   re-checks everything (type, size, magic bytes) and is the authority.
 *
 * No DOM, no Astro: `fetch`, `sleep` and `now` are injectable, so the whole flow is unit-tested with a fake
 * `fetch` (`chunked-upload.test.ts`).
 */

/** Bytes per part (8 MiB), the value the server returns as `partSize`. */
export const PART_SIZE = 8_388_608;
/** Extra tries per part after the first. */
export const MAX_PART_RETRIES = 3;
/** Wait before retry 1, 2 and 3 (milliseconds). */
export const BACKOFF_MS: readonly number[] = [500, 1500, 4000];
/** A `Retry-After` longer than this is not waited out; the normal backoff applies instead. */
const MAX_RETRY_AFTER_MS = 10_000;

export type ClientUploadKind = 'image' | 'video' | 'pdf';

/**
 * Per-kind limits the browser checks before uploading. Kept equal to `UPLOAD_LIMITS` in the domain
 * (`packages/domain/src/forms/upload-checks.ts`) by `scripts/audit/dynamic-form.test.ts`.
 */
export const CLIENT_UPLOAD_LIMITS = {
  video: { maxBytes: 524_288_000, types: ['video/mp4', 'video/quicktime', 'video/webm'] },
  image: { maxBytes: 10_485_760, types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] },
  pdf: { maxBytes: 10_485_760, types: ['application/pdf'] },
} as const;

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
};

/** Message appended to a failure when a link can stand in for the video. */
export const LINK_INSTEAD_MESSAGE = 'You can share a YouTube, Vimeo, Google Drive or Dropbox link instead.';

/** Lower-cases and drops parameters: `Video/MP4; codecs=avc1` becomes `video/mp4`. */
function normalizeType(type: string): string {
  return String(type).split(';')[0]!.trim().toLowerCase();
}

/** The kind our allowlist gives a declared content type, or null. */
export function uploadKindForType(contentType: string): ClientUploadKind | null {
  const type = normalizeType(contentType);
  for (const kind of ['video', 'image', 'pdf'] as const) {
    if ((CLIENT_UPLOAD_LIMITS[kind].types as readonly string[]).includes(type)) return kind;
  }
  return null;
}

/** The content type to declare for a file: the browser's, else one guessed from the extension. */
export function declaredContentType(file: { name: string; type: string }): string {
  const type = normalizeType(file.type);
  if (type && uploadKindForType(type)) return type;
  const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_TYPES[ext] ?? type;
}

export type UploadFailureCode =
  | 'aborted'
  | 'security'
  | 'session'
  | 'type'
  | 'size'
  | 'limit'
  | 'rejected'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'failed';

const MESSAGES: Record<UploadFailureCode, string> = {
  aborted: 'The upload was cancelled.',
  security: "The security check hasn't finished. Wait a moment, then choose the file again.",
  session: 'Your upload session has expired. Reload the page, then choose the file again.',
  type: "This file type isn't accepted.",
  size: 'This file is too large.',
  limit: 'You have reached the number of files allowed for this form.',
  rejected: "We couldn't accept this file. Try a different file.",
  rate_limited: 'Too many uploads right now. Wait a minute, then try again.',
  unavailable: "File uploads aren't available right now.",
  network: 'The upload was interrupted. Check your connection, then try again.',
  failed: 'The upload did not finish. Try again.',
};
/** Failures after which a link is a real alternative (the file itself is the problem or uploads are down). */
const LINK_CODES: ReadonlySet<UploadFailureCode> = new Set<UploadFailureCode>([
  'type',
  'size',
  'rejected',
  'unavailable',
  'network',
  'failed',
]);

/** A failed upload. `message` is safe to show; `linkInstead` says a pasted video link would work. */
export class UploadFailure extends Error {
  readonly code: UploadFailureCode;
  readonly status?: number | undefined;
  readonly linkInstead: boolean;
  /** Server reason code when the file was rejected after upload. */
  readonly reason?: string | undefined;
  constructor(code: UploadFailureCode, options: { status?: number; reason?: string; message?: string } = {}) {
    super(options.message ?? MESSAGES[code]);
    this.name = 'UploadFailure';
    this.code = code;
    this.status = options.status;
    this.reason = options.reason;
    this.linkInstead = LINK_CODES.has(code);
  }
}

/** The failure text, with the link suggestion added when the page has somewhere to paste one. */
export function describeFailure(failure: UploadFailure, linkAvailable: boolean): string {
  return linkAvailable && failure.linkInstead
    ? `${failure.message} ${LINK_INSTEAD_MESSAGE}`
    : failure.message;
}

export interface UploadProgress {
  /** Bytes in finished parts. */
  loaded: number;
  total: number;
  /** Parts finished and parts in all. */
  part: number;
  parts: number;
}

/** What the uploader needs of a `File`. */
export interface UploadSource {
  name: string;
  size: number;
  type: string;
  slice(start: number, end: number): Blob;
}

export interface UploadedFile {
  uploadId: string;
  kind: ClientUploadKind;
  bytes: number;
  filename: string;
}

export interface UploadOptions {
  questionId: string;
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  /** A smaller per-file limit than the kind's (the question's own `maxMb`). */
  maxBytes?: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ChunkedUploaderOptions {
  formSlug: string;
  /** Returns the Turnstile token the page holds; asked once per upload session. */
  getTurnstileToken: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Called after a session was created with its token: the page resets its single-use Turnstile widget and
   * posts the token with the form, because the server needs it to attach the finished files.
   */
  onSessionCreated?: (token: string) => void;
  fetch?: FetchLike;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Milliseconds since the epoch. */
  now?: () => number;
  /** Per-part backoff override (tests). */
  backoffMs?: readonly number[];
}

interface Session {
  token: string;
  /** Epoch milliseconds; 0 when the response had no usable expiry. */
  expiresAt: number;
}

interface ErrorBody {
  code?: string;
}

const SESSION_SKEW_MS = 60_000;

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadFailure('aborted'));
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UploadFailure('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
async function errorCode(response: Response): Promise<string | undefined> {
  const body = (await readJson(response)) as { error?: ErrorBody } | null;
  const code = body?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

function parseExpiry(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/** Maps a failed response to a failure and says whether trying again could help. */
async function failureFor(
  response: Response,
): Promise<{ failure: UploadFailure; retryable: boolean; waitMs?: number }> {
  const status = response.status;
  const code = await errorCode(response);
  const opts = { status };
  if (status === 401 || code === 'UPLOAD_TOKEN_INVALID')
    return { failure: new UploadFailure('session', opts), retryable: false };
  if (status === 429) {
    const seconds = Number(response.headers.get('Retry-After'));
    const waitMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
    return { failure: new UploadFailure('rate_limited', opts), retryable: true, waitMs };
  }
  if (status === 413 || code === 'UPLOAD_SIZE')
    return { failure: new UploadFailure('size', opts), retryable: false };
  if (code === 'UPLOAD_TYPE') return { failure: new UploadFailure('type', opts), retryable: false };
  if (code === 'UPLOAD_LIMIT') return { failure: new UploadFailure('limit', opts), retryable: false };
  if (code === 'UPLOAD_UNAVAILABLE')
    return { failure: new UploadFailure('unavailable', opts), retryable: false };
  if (status === 408 || status >= 500) {
    return { failure: new UploadFailure(status === 503 ? 'unavailable' : 'failed', opts), retryable: true };
  }
  return { failure: new UploadFailure('failed', opts), retryable: false };
}

export class ChunkedUploader {
  private readonly options: ChunkedUploaderOptions;
  private readonly doFetch: FetchLike;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly now: () => number;
  private readonly backoff: readonly number[];
  private session: Session | null = null;

  constructor(options: ChunkedUploaderOptions) {
    this.options = options;
    this.doFetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.backoff = options.backoffMs ?? BACKOFF_MS;
  }

  // -- requests -------------------------------------------------------------------------------------

  private async request(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    if (!url.startsWith('/')) throw new UploadFailure('failed'); // same origin only; unreachable by construction
    if (signal?.aborted) throw new UploadFailure('aborted');
    try {
      return await this.doFetch(url, { ...init, credentials: 'same-origin', signal });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) throw new UploadFailure('aborted');
      throw new UploadFailure('network');
    }
  }

  /** One request that is retried (backoff, Retry-After) while the failure can pass. */
  private async withRetries(
    url: string,
    makeInit: () => RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    let attempt = 0;
    for (;;) {
      let failure: UploadFailure;
      let waitMs: number | undefined;
      try {
        const response = await this.request(url, makeInit(), signal);
        if (response.ok) return response;
        const mapped = await failureFor(response);
        if (!mapped.retryable) throw mapped.failure;
        failure = mapped.failure;
        waitMs = mapped.waitMs;
      } catch (error) {
        if (!(error instanceof UploadFailure) || error.code !== 'network') throw error;
        failure = error;
      }
      if (attempt >= MAX_PART_RETRIES) throw failure;
      const wait =
        waitMs !== undefined && waitMs <= MAX_RETRY_AFTER_MS
          ? waitMs
          : (this.backoff[Math.min(attempt, this.backoff.length - 1)] ?? 0);
      attempt += 1;
      await this.sleep(wait, signal);
    }
  }

  // -- session --------------------------------------------------------------------------------------

  /** Returns a valid session token, creating a session (one Turnstile token) when needed. */
  async ensureSession(signal?: AbortSignal): Promise<string> {
    if (
      this.session &&
      (this.session.expiresAt === 0 || this.session.expiresAt - SESSION_SKEW_MS > this.now())
    ) {
      return this.session.token;
    }
    this.session = null;
    const turnstileToken = await this.options.getTurnstileToken();
    if (!turnstileToken) throw new UploadFailure('security');
    const response = await this.request(
      `/api/forms/${encodeURIComponent(this.options.formSlug)}/upload-session`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ turnstileToken }),
      },
      signal,
    );
    if (!response.ok) {
      const code = await errorCode(response);
      if (response.status === 400 || response.status === 403)
        throw new UploadFailure('security', { status: response.status });
      if (response.status === 401 || code === 'UPLOAD_TOKEN_INVALID')
        throw new UploadFailure('session', { status: 401 });
      throw (await failureFor(response)).failure;
    }
    const body = (await readJson(response)) as { token?: unknown; expiresAt?: unknown } | null;
    if (!body || typeof body.token !== 'string' || body.token === '') throw new UploadFailure('failed');
    this.session = { token: body.token, expiresAt: parseExpiry(body.expiresAt) };
    try {
      this.options.onSessionCreated?.(this.session.token);
    } catch {
      // The page's hook must never break an upload.
    }
    return this.session.token;
  }

  // -- upload ---------------------------------------------------------------------------------------

  /** Uploads one file and resolves with its verified reference; rejects with an `UploadFailure`. */
  async upload(file: UploadSource, options: UploadOptions): Promise<UploadedFile> {
    const { questionId, onProgress, signal } = options;
    const contentType = declaredContentType(file);
    const kind = uploadKindForType(contentType);
    if (!kind) throw new UploadFailure('type');
    if (!Number.isFinite(file.size) || file.size <= 0)
      throw new UploadFailure('size', { message: 'This file is empty.' });
    const cap = Math.min(CLIENT_UPLOAD_LIMITS[kind].maxBytes, options.maxBytes ?? Infinity);
    if (file.size > cap) throw new UploadFailure('size');
    if (signal?.aborted) throw new UploadFailure('aborted');

    const token = await this.ensureSession(signal);
    const start = await this.request(
      '/api/forms/uploads',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          token,
          questionId,
          filename: file.name.slice(0, 255) || 'file',
          size: file.size,
          contentType,
        }),
      },
      signal,
    );
    if (!start.ok) {
      const { failure } = await failureFor(start);
      if (failure.code === 'session') this.session = null;
      throw failure;
    }
    const opened = (await readJson(start)) as {
      uploadId?: unknown;
      partSize?: unknown;
      parts?: unknown;
    } | null;
    const uploadId = opened?.uploadId;
    const partSize = opened?.partSize;
    const parts = opened?.parts;
    if (
      typeof uploadId !== 'string' ||
      uploadId === '' ||
      typeof partSize !== 'number' ||
      !Number.isInteger(partSize) ||
      partSize <= 0 ||
      typeof parts !== 'number' ||
      !Number.isInteger(parts) ||
      parts < 1 ||
      parts !== Math.ceil(file.size / partSize)
    ) {
      throw new UploadFailure('failed');
    }

    const id = encodeURIComponent(uploadId);
    const headers = { 'X-Upload-Token': token };
    try {
      onProgress?.({ loaded: 0, total: file.size, part: 0, parts });
      for (let n = 1; n <= parts; n++) {
        const from = (n - 1) * partSize;
        const to = Math.min(file.size, from + partSize);
        await this.withRetries(
          `/api/forms/uploads/${id}/parts/${n}`,
          () => ({
            method: 'PUT',
            headers: { ...headers, 'Content-Type': 'application/octet-stream' },
            body: file.slice(from, to),
          }),
          signal,
        );
        onProgress?.({ loaded: to, total: file.size, part: n, parts });
      }
      const done = await this.withRetries(
        `/api/forms/uploads/${id}/complete`,
        () => ({ method: 'POST', headers: { ...headers, Accept: 'application/json' } }),
        signal,
      );
      const result = (await readJson(done)) as { status?: unknown; reason?: unknown } | null;
      if (result?.status === 'verified') return { uploadId, kind, bytes: file.size, filename: file.name };
      if (result?.status === 'rejected') {
        // The server already deleted the object.
        throw new UploadFailure('rejected', {
          reason: typeof result.reason === 'string' ? result.reason : undefined,
        });
      }
      throw new UploadFailure('failed');
    } catch (error) {
      const failure = error instanceof UploadFailure ? error : new UploadFailure('failed');
      if (failure.code !== 'rejected' && failure.code !== 'session') await this.remove(uploadId);
      throw failure;
    }
  }

  /** Abandons or deletes an upload (best effort; a missing upload counts as deleted). */
  async remove(uploadId: string): Promise<boolean> {
    const token = this.session?.token;
    if (!token) return false;
    try {
      const response = await this.request(`/api/forms/uploads/${encodeURIComponent(uploadId)}`, {
        method: 'DELETE',
        headers: { 'X-Upload-Token': token },
      });
      return response.status === 204 || response.ok;
    } catch {
      return false;
    }
  }
}

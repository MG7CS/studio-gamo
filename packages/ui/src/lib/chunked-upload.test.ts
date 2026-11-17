import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKOFF_MS,
  ChunkedUploader,
  CLIENT_UPLOAD_LIMITS,
  LINK_INSTEAD_MESSAGE,
  MAX_PART_RETRIES,
  PART_SIZE,
  UploadFailure,
  declaredContentType,
  describeFailure,
  uploadKindForType,
  type UploadProgress,
} from './chunked-upload.ts';

// ---------------------------------------------------------------------------------------------------------
// A fake upload server behind a fake `fetch`
// ---------------------------------------------------------------------------------------------------------

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  size?: number;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const legacyError = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { success: false, error: { code, message: 'x' } }, headers);

type Handler = (call: Call) => Response | Promise<Response> | undefined;

class FakeServer {
  calls: Call[] = [];
  sleeps: number[] = [];
  partSize = 4;
  token = 'session-token';
  sessionExpiresAt: unknown = new Date(Date.now() + 2 * 3600_000).toISOString();
  overrides: Handler[] = [];
  stored = new Map<string, Map<number, number>>();
  deleted: string[] = [];
  completeStatus: 'verified' | 'rejected' = 'verified';

  fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers as Record<string, string>) ?? {}))
      headers[k.toLowerCase()] = v;
    const body = init.body;
    const call: Call = {
      method: init.method ?? 'GET',
      url: input,
      headers,
      body: typeof body === 'string' ? JSON.parse(body) : body,
      size: body instanceof Blob ? body.size : undefined,
    };
    this.calls.push(call);
    if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const handler of this.overrides) {
      const response = await handler(call);
      if (response) return response;
    }
    return this.respond(call);
  };

  sleep = async (ms: number) => {
    this.sleeps.push(ms);
  };

  private respond(call: Call): Response {
    if (call.method === 'POST' && /\/upload-session$/.test(call.url)) {
      return json(200, { token: this.token, expiresAt: this.sessionExpiresAt });
    }
    if (call.method === 'POST' && call.url === '/api/forms/uploads') {
      const { size } = call.body as { size: number };
      const id = `upl_${this.stored.size + 1}`;
      this.stored.set(id, new Map());
      return json(200, {
        uploadId: id,
        partSize: this.partSize,
        parts: Math.max(1, Math.ceil(size / this.partSize)),
      });
    }
    const part = /^\/api\/forms\/uploads\/([^/]+)\/parts\/(\d+)$/.exec(call.url);
    if (call.method === 'PUT' && part) {
      this.stored.get(part[1]!)?.set(Number(part[2]), call.size ?? 0);
      return json(200, { etag: `etag-${part[2]}` });
    }
    if (call.method === 'POST' && /\/complete$/.test(call.url)) {
      return json(
        200,
        this.completeStatus === 'verified'
          ? { status: 'verified' }
          : { status: 'rejected', reason: 'content_mismatch' },
      );
    }
    const del = /^\/api\/forms\/uploads\/([^/]+)$/.exec(call.url);
    if (call.method === 'DELETE' && del) {
      this.deleted.push(decodeURIComponent(del[1]!));
      return new Response(null, { status: 204 });
    }
    return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'x' } });
  }

  uploader(extra: Partial<ConstructorParameters<typeof ChunkedUploader>[0]> = {}) {
    return new ChunkedUploader({
      formSlug: 'worship-apply',
      getTurnstileToken: () => 'turnstile-token',
      fetch: this.fetch,
      sleep: this.sleep,
      ...extra,
    });
  }

  urls(method?: string) {
    return this.calls.filter((c) => !method || c.method === method).map((c) => `${c.method} ${c.url}`);
  }
}

function fileOf(size: number, name = 'audition.mp4', type = 'video/mp4') {
  return new File([new Uint8Array(size).fill(7)], name, { type });
}

async function failureOf(promise: Promise<unknown>): Promise<UploadFailure> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof UploadFailure, `expected an UploadFailure, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the upload to fail');
}

// ---------------------------------------------------------------------------------------------------------

test('constants: 8 MiB parts, three retries, three backoff steps', () => {
  assert.equal(PART_SIZE, 8 * 1024 * 1024);
  assert.equal(MAX_PART_RETRIES, 3);
  assert.equal(BACKOFF_MS.length, 3);
});

test('content types: declared by the browser or guessed from the extension, allowlist only', () => {
  assert.equal(uploadKindForType('video/mp4'), 'video');
  assert.equal(uploadKindForType('Video/MP4; codecs=avc1'), 'video');
  assert.equal(uploadKindForType('image/heic'), 'image');
  assert.equal(uploadKindForType('application/pdf'), 'pdf');
  assert.equal(uploadKindForType('text/html'), null);
  assert.equal(declaredContentType({ name: 'a.MOV', type: '' }), 'video/quicktime');
  assert.equal(declaredContentType({ name: 'a.heic', type: '' }), 'image/heic');
  assert.equal(declaredContentType({ name: 'a.mp4', type: 'application/octet-stream' }), 'video/mp4');
  assert.equal(
    declaredContentType({ name: 'a.exe', type: 'application/x-msdownload' }),
    'application/x-msdownload',
  );
  assert.equal(CLIENT_UPLOAD_LIMITS.video.maxBytes, 524_288_000);
});

test('uploads a multi-part file in order, with the token on every part and a progress callback', async () => {
  const server = new FakeServer();
  const progress: UploadProgress[] = [];
  const result = await server
    .uploader()
    .upload(fileOf(10), { questionId: 'video', onProgress: (p) => progress.push(p) });

  assert.deepEqual(result, { uploadId: 'upl_1', kind: 'video', bytes: 10, filename: 'audition.mp4' });
  assert.deepEqual(server.urls(), [
    'POST /api/forms/worship-apply/upload-session',
    'POST /api/forms/uploads',
    'PUT /api/forms/uploads/upl_1/parts/1',
    'PUT /api/forms/uploads/upl_1/parts/2',
    'PUT /api/forms/uploads/upl_1/parts/3',
    'POST /api/forms/uploads/upl_1/complete',
  ]);
  assert.deepEqual(server.calls[0]!.body, { turnstileToken: 'turnstile-token' });
  assert.deepEqual(server.calls[1]!.body, {
    token: 'session-token',
    questionId: 'video',
    filename: 'audition.mp4',
    size: 10,
    contentType: 'video/mp4',
  });
  const parts = server.calls.filter((c) => c.method === 'PUT');
  assert.deepEqual(
    parts.map((c) => c.size),
    [4, 4, 2],
  );
  for (const c of [...parts, server.calls.at(-1)!])
    assert.equal(c.headers['x-upload-token'], 'session-token');
  assert.deepEqual(
    parts.map((c) => c.headers['content-type']),
    Array(3).fill('application/octet-stream'),
  );
  assert.deepEqual(
    progress.map((p) => [p.part, p.loaded]),
    [
      [0, 0],
      [1, 4],
      [2, 8],
      [3, 10],
    ],
  );
  assert.ok(progress.every((p) => p.total === 10 && p.parts === 3));
  assert.deepEqual(server.sleeps, []);
});

test('a file that fits one part is a single PUT', async () => {
  const server = new FakeServer();
  server.partSize = PART_SIZE;
  await server.uploader().upload(fileOf(1000, 'headshot.jpg', 'image/jpeg'), { questionId: 'photo' });
  assert.equal(server.urls('PUT').length, 1);
  assert.equal(
    server.calls[1]!.body && (server.calls[1]!.body as { contentType: string }).contentType,
    'image/jpeg',
  );
});

test('every request is a same-origin, root-relative path with credentials limited to same-origin', async () => {
  const server = new FakeServer();
  const seen: (string | undefined)[] = [];
  const wrapped = (input: string, init?: RequestInit) => {
    seen.push(init?.credentials);
    return server.fetch(input, init);
  };
  await server.uploader({ fetch: wrapped, formSlug: 'we ird/slug' }).upload(fileOf(10), { questionId: 'v' });
  assert.ok(server.calls.every((c) => c.url.startsWith('/') && !c.url.startsWith('//')));
  assert.ok(server.calls.every((c) => !/^[a-z]+:/i.test(c.url)));
  assert.equal(server.calls[0]!.url, '/api/forms/we%20ird%2Fslug/upload-session');
  assert.ok(seen.every((c) => c === 'same-origin'));
});

test('a failing part is retried with backoff and the upload still completes', async () => {
  const server = new FakeServer();
  let tries = 0;
  server.overrides.push((call) => {
    if (call.method === 'PUT' && call.url.endsWith('/parts/2')) {
      tries += 1;
      if (tries === 1) return legacyError(500, 'UPLOAD_STORAGE');
      if (tries === 2) throw new TypeError('network down'); // a dropped connection
    }
    return undefined;
  });
  const result = await server.uploader().upload(fileOf(10), { questionId: 'v' });
  assert.equal(result.bytes, 10);
  assert.deepEqual(server.sleeps, [BACKOFF_MS[0], BACKOFF_MS[1]]);
  assert.equal(server.urls('PUT').filter((u) => u.endsWith('/parts/2')).length, 3);
  assert.equal(server.stored.get('upl_1')!.size, 3);
});

test('after three retries a part fails: network error, upload deleted, a link is suggested', async () => {
  const server = new FakeServer();
  server.overrides.push((call) => {
    if (call.method === 'PUT' && call.url.endsWith('/parts/1')) throw new TypeError('offline');
    return undefined;
  });
  const failure = await failureOf(server.uploader().upload(fileOf(10), { questionId: 'v' }));
  assert.equal(failure.code, 'network');
  assert.equal(failure.linkInstead, true);
  assert.equal(server.urls('PUT').length, 1 + MAX_PART_RETRIES);
  assert.deepEqual(server.sleeps, [...BACKOFF_MS]);
  assert.deepEqual(server.deleted, ['upl_1']);
  assert.match(describeFailure(failure, true), new RegExp(LINK_INSTEAD_MESSAGE));
  assert.doesNotMatch(describeFailure(failure, false), /YouTube/);
});

test('errors that cannot pass are not retried (413, 401, 409)', async () => {
  for (const [status, code, expected] of [
    [413, 'UPLOAD_SIZE', 'size'],
    [401, 'UPLOAD_TOKEN_INVALID', 'session'],
    [409, 'UPLOAD_SEQUENCE', 'failed'],
  ] as const) {
    const server = new FakeServer();
    server.overrides.push((call) => (call.method === 'PUT' ? legacyError(status, code) : undefined));
    const failure = await failureOf(server.uploader().upload(fileOf(10), { questionId: 'v' }));
    assert.equal(failure.code, expected, String(status));
    assert.equal(server.urls('PUT').length, 1, `${status} is tried once`);
    assert.deepEqual(server.sleeps, []);
  }
});

test('a 429 waits for Retry-After (seconds) instead of the backoff', async () => {
  const server = new FakeServer();
  let limited = true;
  server.overrides.push((call) => {
    if (call.method === 'PUT' && limited) {
      limited = false;
      return legacyError(429, 'RATE_LIMITED', { 'Retry-After': '2' });
    }
    return undefined;
  });
  await server.uploader().upload(fileOf(3), { questionId: 'v' });
  assert.deepEqual(server.sleeps, [2000]);
});

test('an enormous Retry-After falls back to the normal backoff', async () => {
  const server = new FakeServer();
  let limited = true;
  server.overrides.push((call) => {
    if (call.method === 'PUT' && limited) {
      limited = false;
      return legacyError(429, 'RATE_LIMITED', { 'Retry-After': '3600' });
    }
    return undefined;
  });
  await server.uploader().upload(fileOf(3), { questionId: 'v' });
  assert.deepEqual(server.sleeps, [BACKOFF_MS[0]]);
});

test('aborting stops before the next part and deletes the pending upload', async () => {
  const server = new FakeServer();
  const controller = new AbortController();
  const result = server.uploader().upload(fileOf(10), {
    questionId: 'v',
    signal: controller.signal,
    onProgress: (p) => {
      if (p.part === 1) controller.abort();
    },
  });
  const failure = await failureOf(result);
  assert.equal(failure.code, 'aborted');
  assert.equal(failure.linkInstead, false);
  assert.equal(server.urls('PUT').length, 1, 'no part after the abort');
  assert.deepEqual(server.deleted, ['upl_1']);
});

test('an abort during the backoff wait ends the upload', async () => {
  const server = new FakeServer();
  const controller = new AbortController();
  server.overrides.push((call) => (call.method === 'PUT' ? legacyError(500, 'UPLOAD_STORAGE') : undefined));
  const uploader = server.uploader({
    sleep: async (_ms, signal) => {
      controller.abort();
      if (signal?.aborted) throw new UploadFailure('aborted');
    },
  });
  const failure = await failureOf(
    uploader.upload(fileOf(10), { questionId: 'v', signal: controller.signal }),
  );
  assert.equal(failure.code, 'aborted');
  assert.deepEqual(server.deleted, ['upl_1']);
});

test('a file the server rejects after upload fails as rejected, without a delete call', async () => {
  const server = new FakeServer();
  server.completeStatus = 'rejected';
  const failure = await failureOf(server.uploader().upload(fileOf(10, 'fake.mp4'), { questionId: 'v' }));
  assert.equal(failure.code, 'rejected');
  assert.equal(failure.reason, 'content_mismatch');
  assert.equal(failure.linkInstead, true);
  assert.deepEqual(server.deleted, []);
});

test('complete is retried like a part', async () => {
  const server = new FakeServer();
  let tries = 0;
  server.overrides.push((call) => {
    if (call.url.endsWith('/complete') && tries++ < 1) return legacyError(503, 'UPLOAD_STORAGE');
    return undefined;
  });
  const result = await server.uploader().upload(fileOf(10), { questionId: 'v' });
  assert.equal(result.uploadId, 'upl_1');
  assert.equal(server.urls('POST').filter((u) => u.endsWith('/complete')).length, 2);
});

test('start errors map to plain failures and are never retried', async () => {
  for (const [status, code, expected] of [
    [400, 'UPLOAD_TYPE', 'type'],
    [400, 'UPLOAD_LIMIT', 'limit'],
    [400, 'UPLOAD_SIZE', 'size'],
    [401, 'UPLOAD_TOKEN_INVALID', 'session'],
    [503, 'UPLOAD_UNAVAILABLE', 'unavailable'],
    [429, 'RATE_LIMITED', 'rate_limited'],
  ] as const) {
    const server = new FakeServer();
    server.overrides.push((call) =>
      call.url === '/api/forms/uploads' ? legacyError(status, code) : undefined,
    );
    const failure = await failureOf(server.uploader().upload(fileOf(10), { questionId: 'v' }));
    assert.equal(failure.code, expected, code);
    assert.equal(server.urls('POST').filter((u) => u.endsWith('/uploads')).length, 1);
    assert.equal(server.urls('PUT').length, 0);
    assert.deepEqual(server.sleeps, []);
  }
});

test('a wrong file never reaches the network', async () => {
  const server = new FakeServer();
  const uploader = server.uploader();
  assert.equal(
    (await failureOf(uploader.upload(fileOf(10, 'page.html', 'text/html'), { questionId: 'v' }))).code,
    'type',
  );
  assert.equal((await failureOf(uploader.upload(fileOf(0), { questionId: 'v' }))).code, 'size');
  const big = {
    name: 'big.mp4',
    type: 'video/mp4',
    size: CLIENT_UPLOAD_LIMITS.video.maxBytes + 1,
    slice: () => new Blob(),
  };
  assert.equal((await failureOf(uploader.upload(big, { questionId: 'v' }))).code, 'size');
  const photo = {
    name: 'big.jpg',
    type: 'image/jpeg',
    size: CLIENT_UPLOAD_LIMITS.image.maxBytes + 1,
    slice: () => new Blob(),
  };
  assert.equal((await failureOf(uploader.upload(photo, { questionId: 'v' }))).code, 'size');
  assert.equal(
    (await failureOf(uploader.upload(fileOf(2000), { questionId: 'v', maxBytes: 1000 }))).code,
    'size',
  );
  assert.deepEqual(server.calls, []);
});

test('without a finished security check there is no session and no request', async () => {
  const server = new FakeServer();
  const failure = await failureOf(
    server.uploader({ getTurnstileToken: () => '' }).upload(fileOf(10), { questionId: 'v' }),
  );
  assert.equal(failure.code, 'security');
  assert.deepEqual(server.calls, []);
});

test('a refused security token is a security failure, not a retry', async () => {
  const server = new FakeServer();
  server.overrides.push((call) =>
    call.url.endsWith('/upload-session') ? legacyError(400, 'TURNSTILE_FAILED') : undefined,
  );
  const failure = await failureOf(server.uploader().upload(fileOf(10), { questionId: 'v' }));
  assert.equal(failure.code, 'security');
  assert.equal(server.calls.length, 1);
});

test('the session is created once and reused; an expired one is replaced; the hook runs per session', async () => {
  const server = new FakeServer();
  let clock = Date.now();
  let hooks = 0;
  const uploader = server.uploader({ now: () => clock, onSessionCreated: () => void hooks++ });
  await uploader.upload(fileOf(3), { questionId: 'a' });
  await uploader.upload(fileOf(3), { questionId: 'b' });
  assert.equal(server.urls('POST').filter((u) => u.endsWith('/upload-session')).length, 1);
  assert.equal(hooks, 1);
  clock += 3 * 3600_000;
  await uploader.upload(fileOf(3), { questionId: 'c' });
  assert.equal(server.urls('POST').filter((u) => u.endsWith('/upload-session')).length, 2);
  assert.equal(hooks, 2);
});

test('the session expiry may be epoch seconds or milliseconds', async () => {
  for (const expiresAt of [Math.floor(Date.now() / 1000) + 7200, Date.now() + 7200_000]) {
    const server = new FakeServer();
    server.sessionExpiresAt = expiresAt;
    const uploader = server.uploader();
    await uploader.upload(fileOf(3), { questionId: 'a' });
    await uploader.upload(fileOf(3), { questionId: 'b' });
    assert.equal(server.urls('POST').filter((u) => u.endsWith('/upload-session')).length, 1);
  }
});

test('a start answer that does not add up fails instead of sending garbage', async () => {
  const server = new FakeServer();
  server.overrides.push((call) =>
    call.url === '/api/forms/uploads' ? json(200, { uploadId: 'upl_x', partSize: 4, parts: 99 }) : undefined,
  );
  const failure = await failureOf(server.uploader().upload(fileOf(10), { questionId: 'v' }));
  assert.equal(failure.code, 'failed');
  assert.equal(server.urls('PUT').length, 0);
});

test('remove deletes an upload with the session token and reports the result', async () => {
  const server = new FakeServer();
  const uploader = server.uploader();
  assert.equal(await uploader.remove('upl_9'), false, 'no session yet');
  await uploader.upload(fileOf(3), { questionId: 'v' });
  assert.equal(await uploader.remove('upl_1'), true);
  assert.deepEqual(server.deleted, ['upl_1']);
  const del = server.calls.at(-1)!;
  assert.equal(del.method, 'DELETE');
  assert.equal(del.headers['x-upload-token'], 'session-token');
});

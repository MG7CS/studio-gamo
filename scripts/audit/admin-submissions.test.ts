/**
 * Admin submissions: the inbox, the detail view model, status/note/decision/bulk/export routes and the
 * staff-only file handler (apps/admin/src/pages/submissions, pages/api/submissions, pages/files).
 *
 * The route modules are called directly with a real staff session in an in-memory D1, the real services
 * and a fake media bucket. Run: `pnpm exec tsx --test scripts/audit/admin-submissions.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createMigratedD1, type SqliteD1 } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { createSession } from '../../packages/auth/index.ts';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity.ts';
import { FormsService } from '../../packages/domain/src/forms/service.ts';
import type { UploadBucketLike, UploadObjectBodyLike } from '../../packages/domain/src/forms/uploads.ts';
import { buildContentSecurityPolicy } from '../../packages/domain/src/http/security-headers.ts';
import { noticeFrom } from '../../apps/admin/src/lib/flash.ts';
import { SUBMISSION_NOTICES, submissionNoticeKey } from '../../apps/admin/src/lib/submissions/notices.ts';
import {
  dayStartUtc,
  inboxQueryString,
  parseInboxQuery,
} from '../../apps/admin/src/lib/submissions/filters.ts';
import { findNeighbours } from '../../apps/admin/src/lib/submissions/neighbours.ts';
import { buildDetailView, linkViewOf, shownQuestionIds } from '../../apps/admin/src/lib/submissions/view.ts';
import { buildTimeline } from '../../apps/admin/src/lib/submissions/timeline.ts';
import { contentDisposition, parseRange } from '../../apps/admin/src/lib/submissions/files.ts';
import { YOUTUBE_EMBED_ALLOWED } from '../../apps/admin/src/lib/submissions/embeds.ts';
import { parseSettableStatus } from '../../apps/admin/src/lib/submissions/statuses.ts';
import { FormsError } from '../../packages/domain/src/forms/service.ts';

const ADMIN = 'apps/admin/src';
const SECRET = 'admin-submissions-test-session-secret-0123456789';
const UPLOAD_SECRET = 'admin-submissions-upload-secret-0123456789ab';
const T0 = 1_900_000_000;
const ORIGIN = 'http://localhost';

// ---- route modules ---------------------------------------------------------------------------------------

type Handler = (context: never) => Promise<Response>;
interface RouteModule {
  GET?: Handler;
  POST?: Handler;
}
const load = async (path: string): Promise<RouteModule> =>
  (await import(`../../${ADMIN}/pages/${path}`)) as RouteModule;
const routes = {
  list: await load('api/submissions/index.ts'),
  get: await load('api/submissions/[id]/index.ts'),
  status: await load('api/submissions/[id]/status.ts'),
  note: await load('api/submissions/[id]/note.ts'),
  approve: await load('api/submissions/[id]/approve.ts'),
  decline: await load('api/submissions/[id]/decline.ts'),
  bulk: await load('api/submissions/bulk.ts'),
  exportCsv: await load('api/submissions/export.ts'),
  file: await load('files/[id].ts'),
};

// ---- fake media bucket -----------------------------------------------------------------------------------

class FakeBucket implements UploadBucketLike {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>) {
    this.objects.set(key, value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer));
    return {};
  }
  async get(
    key: string,
    options?: { range?: { offset: number; length?: number } },
  ): Promise<UploadObjectBodyLike | null> {
    const found = this.objects.get(key);
    if (!found) return null;
    const start = options?.range?.offset ?? 0;
    const end = options?.range?.length === undefined ? found.length : start + options.range.length;
    const slice = found.slice(start, end);
    return {
      size: found.length,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(slice);
          controller.close();
        },
      }),
      arrayBuffer: async () =>
        slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer,
    };
  }
  async head(key: string) {
    const found = this.objects.get(key);
    return found ? { size: found.length } : null;
  }
  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
  async createMultipartUpload(): Promise<never> {
    throw new Error('not used');
  }
  resumeMultipartUpload(): never {
    throw new Error('not used');
  }
  /** Copy support used by `moveToDeclined` (the service copies through get + put). */
}

// ---- fixtures --------------------------------------------------------------------------------------------

const contactSchema = (nameLabel = 'Your name') => ({
  sections: [
    {
      id: 's1',
      title: 'About you',
      questions: [
        { id: 'name', type: 'short_text', label: nameLabel, required: true, bind: 'contact.name' },
        {
          id: 'email',
          type: 'short_text',
          label: 'Your email',
          required: true,
          bind: 'contact.email',
          validation: { kind: 'email' },
        },
        {
          id: 'topic',
          type: 'multiple_choice',
          label: 'Topic',
          options: ['Booking', 'Something else'],
          required: true,
        },
        { id: 'details', type: 'paragraph', label: 'Details <script>alert(1)</script>', required: false },
      ],
    },
    {
      id: 's2',
      title: 'Extras',
      questions: [
        { id: 'amount', type: 'short_text', label: 'Amount', validation: { kind: 'number' } },
        {
          id: 'booking_date',
          type: 'short_text',
          label: 'Booking date',
          showIf: { join: 'all', rules: [{ questionId: 'topic', op: 'eq', value: 'Booking' }] },
        },
        { id: 'clip', type: 'link', label: 'Video link' },
        { id: 'photo', type: 'file_upload', label: 'Photo', accept: ['image'], maxFiles: 2, maxMb: 10 },
      ],
    },
  ],
});

const applySchema = {
  sections: [
    {
      id: 'a1',
      title: 'You',
      questions: [
        { id: 'name', type: 'short_text', label: 'Name', required: true, bind: 'contact.name' },
        {
          id: 'email',
          type: 'short_text',
          label: 'Email',
          required: true,
          bind: 'contact.email',
          validation: { kind: 'email' },
        },
        {
          id: 'roles',
          type: 'checkboxes',
          label: 'Roles',
          options: ['Drums', 'Keys'],
          required: true,
          bind: 'roster.roles',
        },
        { id: 'city', type: 'short_text', label: 'City', bind: 'roster.city' },
        {
          id: 'sample',
          type: 'file_upload',
          label: 'Audition video',
          accept: ['video'],
          maxFiles: 1,
          maxMb: 100,
        },
      ],
    },
  ],
};

let keyCounter = 0;
const key = () => `idem-${++keyCounter}`;

async function world() {
  const d1 = await createMigratedD1();
  const db = createDb(d1 as never);
  const identity = new StaffIdentityService(db);
  const staff = await identity.findOrCreateUser('reviewer@example.org', 'Sample Reviewer');
  await identity.assignSystemRole(staff.id, 'staff_reviewer');
  const outsider = await identity.findOrCreateUser('plain@example.org', 'Sample Person');
  const cookieFor = async (userId: string) =>
    `__session=${encodeURIComponent((await createSession(db, userId, SECRET)).cookieValue)}`;
  const cookie = await cookieFor(staff.id);
  const outsiderCookie = await cookieFor(outsider.id);
  const bucket = new FakeBucket();
  const env = {
    ENVIRONMENT: 'local',
    DB: d1,
    SESSION_SECRET: SECRET,
    MEDIA_BUCKET: bucket,
    FORM_UPLOAD_SECRET: UPLOAD_SECRET,
  };
  const forms = new FormsService(d1, { now: T0 });

  async function publishForm(
    slug: string,
    kind: 'contact' | 'musician_application',
    schema: unknown,
    program: 'web' | 'worship',
  ) {
    const form = await forms.create({
      slug,
      program,
      kind,
      title: slug === 'contact' ? 'Contact message' : 'Musician application',
      staffId: staff.id,
    });
    const { revision } = await forms.saveDraft({
      formId: form.id,
      schema,
      expectedRevision: form.revision,
      staffId: staff.id,
    });
    await forms.publish({ formId: form.id, expectedRevision: revision, staffId: staff.id });
    return form;
  }

  async function submit(
    slug: string,
    raw: Record<string, string | string[]>,
    at: number,
    uploads: Record<string, never[]> = {},
  ) {
    const f = new FormsService(d1, { now: at });
    const result = await f.submit({ slug, raw, uploads, idempotencyKey: key() });
    return result.submission;
  }

  function context(request: Request, params: Record<string, string> = {}) {
    return { request, params, url: new URL(request.url), locals: { runtime: { env } } } as never;
  }
  function req(
    method: string,
    path: string,
    options: {
      cookie?: string | null;
      form?: Record<string, string | string[]>;
      json?: unknown;
      origin?: string | null;
      headers?: Record<string, string>;
    } = {},
  ) {
    const headers: Record<string, string> = { ...options.headers };
    const cookieValue = options.cookie === undefined ? cookie : options.cookie;
    if (cookieValue) headers.cookie = cookieValue;
    if (options.origin !== null && method !== 'GET') headers.origin = options.origin ?? ORIGIN;
    let body: string | undefined;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      headers.accept = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(options.form))
        for (const item of Array.isArray(v) ? v : [v]) params.append(k, item);
      body = params.toString();
    }
    return new Request(`${ORIGIN}${path}`, { method, headers, body });
  }
  const call = (handler: Handler | undefined, request: Request, params?: Record<string, string>) => {
    assert.ok(handler, 'route handler exists');
    return handler(context(request, params));
  };

  const contact = await publishForm('contact', 'contact', contactSchema(), 'web');
  const apply = await publishForm('apply', 'musician_application', applySchema, 'worship');

  const row = <T = Record<string, unknown>>(sql: string, ...p: (string | number | null)[]) =>
    d1.sqlite.prepare(sql).get(...p) as T | undefined;
  const rows = <T = Record<string, unknown>>(sql: string, ...p: (string | number | null)[]) =>
    d1.sqlite.prepare(sql).all(...p) as T[];
  const run = (sql: string, ...p: (string | number | null)[]) => d1.sqlite.prepare(sql).run(...p);

  /** A verified upload row attached to a submission, with its bytes in the fake bucket. */
  function addUpload(
    submissionId: string,
    over: Partial<{
      id: string;
      kind: string;
      contentType: string;
      name: string | null;
      bytes: Uint8Array;
      status: string;
      question: string;
    }> = {},
  ) {
    const id = over.id ?? `upl_${Math.random().toString(36).slice(2, 12)}`;
    const bytes = over.bytes ?? new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
    const r2Key = `forms/submissions/${submissionId}/${id}`;
    bucket.objects.set(r2Key, bytes);
    run(
      `INSERT INTO form_uploads (id, submission_id, question_id, kind, content_type, original_name, bytes, r2_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      submissionId,
      over.question ?? 'photo',
      over.kind ?? 'image',
      over.contentType ?? 'image/jpeg',
      over.name === undefined ? 'photo.jpg' : over.name,
      bytes.length,
      r2Key,
      over.status ?? 'verified',
      T0,
    );
    return { id, r2Key, bytes };
  }

  return {
    d1: d1 as SqliteD1,
    db,
    staff,
    outsider,
    cookie,
    outsiderCookie,
    bucket,
    env,
    forms,
    contact,
    apply,
    submit,
    req,
    call,
    row,
    rows,
    run,
    addUpload,
    publishForm,
  };
}
type World = Awaited<ReturnType<typeof world>>;

const goodAnswers = (name: string, extra: Record<string, string> = {}) => ({
  name,
  email: `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.org`,
  topic: 'Something else',
  ...extra,
});

async function seedInbox(w: World) {
  // Eight contact submissions, one per minute, mixed statuses.
  const subs = [];
  for (let i = 0; i < 8; i++) {
    subs.push(await w.submit('contact', goodAnswers(`Person${String.fromCharCode(65 + i)}`), T0 + i * 60));
  }
  return subs;
}

// ---------------------------------------------------------------------------------------------------------
// filters (pure)
// ---------------------------------------------------------------------------------------------------------

test('filters: parses form, version, status, dates, attachments and search; ignores what it cannot read', () => {
  const q = parseInboxQuery(
    new URLSearchParams(
      'form=frm_abc&version=2&status=in_review&from=2026-11-01&to=2026-11-16&attachments=1&q=%20Ana%20',
    ),
  );
  assert.deepEqual(q.ignored, []);
  assert.equal(q.filter.formId, 'frm_abc');
  assert.equal(q.filter.version, 2);
  assert.equal(q.filter.status, 'in_review');
  assert.equal(q.filter.from, Date.UTC(2026, 10, 1) / 1000);
  // The end date is inclusive: the filter uses the start of the next day.
  assert.equal(q.filter.to, Date.UTC(2026, 10, 17) / 1000);
  assert.equal(q.filter.hasAttachments, true);
  assert.equal(q.filter.q, 'Ana');

  const bad = parseInboxQuery(
    new URLSearchParams(
      'form=a%20b&version=0&status=bogus&from=2026-02-30&to=nope&cursor=x&q=' + 'z'.repeat(101),
    ),
  );
  assert.deepEqual(bad.filter, {});
  assert.deepEqual(
    bad.ignored.sort(),
    ['form', 'from date', 'page', 'search', 'status', 'to date', 'version'].sort(),
  );
  assert.equal(dayStartUtc('2026-02-29'), null);
  assert.notEqual(dayStartUtc('2028-02-29'), null);
  assert.equal(parseInboxQuery(new URLSearchParams('status=all')).filter.status, undefined);
});

test('filters: links keep the filter, carry the cursor only when asked, and encode user text', () => {
  const q = parseInboxQuery(
    new URLSearchParams('form=frm_abc&q=Ana%20Reyes%20%26%20co&attachments=1&cursor=100:fsub_x'),
  );
  const qs = inboxQueryString(q.values, { cursor: q.cursor });
  assert.match(qs, /^\?/);
  const back = new URLSearchParams(qs);
  assert.equal(back.get('q'), 'Ana Reyes & co');
  assert.equal(back.get('cursor'), '100:fsub_x');
  assert.equal(inboxQueryString(q.values).includes('cursor'), false);
  assert.equal(inboxQueryString({}), '');
});

// ---------------------------------------------------------------------------------------------------------
// authentication and same-origin
// ---------------------------------------------------------------------------------------------------------

test('every submissions route needs a staff session: anonymous is 401, a non-staff user is 403', async () => {
  const w = await world();
  const [sub] = await seedInbox(w);
  const cases: [Handler | undefined, string, string, Record<string, string>][] = [
    [routes.list.GET, 'GET', '/api/submissions', {}],
    [routes.get.GET, 'GET', `/api/submissions/${sub!.id}`, { id: sub!.id }],
    [routes.status.POST, 'POST', `/api/submissions/${sub!.id}/status`, { id: sub!.id }],
    [routes.note.POST, 'POST', `/api/submissions/${sub!.id}/note`, { id: sub!.id }],
    [routes.approve.POST, 'POST', `/api/submissions/${sub!.id}/approve`, { id: sub!.id }],
    [routes.decline.POST, 'POST', `/api/submissions/${sub!.id}/decline`, { id: sub!.id }],
    [routes.bulk.POST, 'POST', '/api/submissions/bulk', {}],
    [routes.exportCsv.POST, 'POST', '/api/submissions/export', {}],
    [routes.file.GET, 'GET', '/files/upl_x', { id: 'upl_x' }],
  ];
  for (const [handler, method, path, params] of cases) {
    const anon = await w.call(
      handler,
      w.req(method, path, { cookie: null, form: method === 'POST' ? { status: 'handled' } : undefined }),
      params,
    );
    assert.equal(anon.status, 401, `anonymous ${method} ${path}`);
    const plain = await w.call(
      handler,
      w.req(method, path, {
        cookie: w.outsiderCookie,
        form: method === 'POST' ? { status: 'handled' } : undefined,
      }),
      params,
    );
    assert.equal(plain.status, 403, `non-staff ${method} ${path}`);
  }
  assert.equal(
    w.row<{ status: string }>('SELECT status FROM form_submissions WHERE id = ?', sub!.id)?.status,
    'new',
  );
});

test('state-changing routes refuse a cross-origin request and change nothing', async () => {
  const w = await world();
  const [sub] = await seedInbox(w);
  const evil = 'https://evil.example';
  const post = (
    handler: Handler | undefined,
    path: string,
    form: Record<string, string | string[]>,
    params: Record<string, string> = {},
  ) => w.call(handler, w.req('POST', path, { form, origin: evil }), params);

  assert.equal(
    (
      await post(
        routes.status.POST,
        `/api/submissions/${sub!.id}/status`,
        { status: 'spam' },
        { id: sub!.id },
      )
    ).status,
    403,
  );
  assert.equal(
    (await post(routes.note.POST, `/api/submissions/${sub!.id}/note`, { note: 'x' }, { id: sub!.id })).status,
    403,
  );
  assert.equal(
    (await post(routes.bulk.POST, '/api/submissions/bulk', { action: 'handled', ids: [sub!.id] })).status,
    403,
  );
  assert.equal(
    (await post(routes.exportCsv.POST, '/api/submissions/export', { form: w.contact.id })).status,
    403,
  );
  assert.equal(
    (await post(routes.approve.POST, `/api/submissions/${sub!.id}/approve`, {}, { id: sub!.id })).status,
    403,
  );
  assert.equal(
    (await post(routes.decline.POST, `/api/submissions/${sub!.id}/decline`, {}, { id: sub!.id })).status,
    403,
  );

  assert.equal(
    w.row<{ status: string }>('SELECT status FROM form_submissions WHERE id = ?', sub!.id)?.status,
    'new',
  );
  assert.equal(
    w.row<{ c: number }>(
      "SELECT count(*) AS c FROM form_submission_events WHERE kind IN ('status','note','export')",
    )?.c,
    0,
  );
  // Sec-Fetch-Site cross-site is refused too, even without an Origin header.
  const sneaky = await w.call(
    routes.status.POST,
    w.req('POST', `/api/submissions/${sub!.id}/status`, {
      form: { status: 'spam' },
      origin: null,
      headers: { 'sec-fetch-site': 'cross-site' },
    }),
    { id: sub!.id },
  );
  assert.equal(sneaky.status, 403);
});

// ---------------------------------------------------------------------------------------------------------
// list, filters and pagination through the API
// ---------------------------------------------------------------------------------------------------------

test('list API: newest first, keyset pages join up with no gaps or repeats, and every filter narrows', async () => {
  const w = await world();
  const subs = await seedInbox(w);
  await w.forms.setStatus({ submissionId: subs[2]!.id, status: 'handled', staffId: w.staff.id });
  await w.forms.setStatus({ submissionId: subs[5]!.id, status: 'spam', staffId: w.staff.id });
  w.addUpload(subs[1]!.id);

  const page = async (query: string) => {
    const res = await w.call(routes.list.GET, w.req('GET', `/api/submissions${query}`));
    assert.equal(res.status, 200);
    return (await res.json()) as {
      success: true;
      data: { id: string; status: string }[];
      meta: { nextCursor: string | null };
    };
  };

  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const body = await page(`?limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    seen.push(...body.data.map((d) => d.id));
    cursor = body.meta.nextCursor;
    pages += 1;
  } while (cursor);
  assert.equal(pages, 3);
  assert.deepEqual(seen, subs.map((s) => s.id).reverse());

  assert.deepEqual(
    (await page('?status=handled')).data.map((d) => d.id),
    [subs[2]!.id],
  );
  assert.deepEqual(
    (await page('?status=spam')).data.map((d) => d.id),
    [subs[5]!.id],
  );
  assert.deepEqual(
    (await page('?attachments=1')).data.map((d) => d.id),
    [subs[1]!.id],
  );
  assert.equal((await page(`?formId=${w.apply.id}`)).data.length, 0);
  assert.equal((await page(`?form=${w.contact.id}&version=1`)).data.length, 8);
  assert.equal((await page('?version=2')).data.length, 0);
  assert.deepEqual(
    (await page('?q=personh')).data.map((d) => d.id),
    [subs[7]!.id],
  );
  const day = new Date(T0 * 1000).toISOString().slice(0, 10);
  assert.equal((await page(`?from=${day}&to=${day}`)).data.length, 8);
  assert.equal((await page('?from=2100-01-01')).data.length, 0);
});

test('list API: unknown filters and bad limits are 400 with field names only, never an echo', async () => {
  const w = await world();
  const bad = await w.call(routes.list.GET, w.req('GET', '/api/submissions?status=<script>&limit=3'));
  assert.equal(bad.status, 400);
  const text = await bad.text();
  assert.equal(text.includes('<script>'), false);
  assert.equal((await w.call(routes.list.GET, w.req('GET', '/api/submissions?limit=0'))).status, 400);
  assert.equal((await w.call(routes.list.GET, w.req('GET', '/api/submissions?limit=101'))).status, 400);
  assert.equal((await w.call(routes.list.GET, w.req('GET', '/api/submissions?cursor=1:x%20y'))).status, 400);
});

test('get API: the submission comes with the schema of the version it answered and no storage keys', async () => {
  const w = await world();
  const sub = await w.submit('contact', goodAnswers('Ana Reyes', { details: 'Hello' }), T0);
  const up = w.addUpload(sub.id, { name: 'a.jpg' });
  const res = await w.call(routes.get.GET, w.req('GET', `/api/submissions/${sub.id}`), { id: sub.id });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text.includes('forms/submissions'), false, 'no R2 key in the JSON');
  const body = JSON.parse(text).data;
  assert.equal(body.reference, sub.reference);
  assert.equal(body.kind, 'contact');
  assert.equal(body.schema.sections[0].questions[0].label, 'Your name');
  assert.equal(body.uploads[0].id, up.id);
  assert.equal(body.uploads[0].filename, 'a.jpg');
  assert.equal(
    (await w.call(routes.get.GET, w.req('GET', '/api/submissions/nope'), { id: 'nope' })).status,
    404,
  );
  assert.equal(
    (await w.call(routes.get.GET, w.req('GET', '/api/submissions/bad%20id'), { id: 'bad id' })).status,
    404,
  );
});

// ---------------------------------------------------------------------------------------------------------
// status, notes
// ---------------------------------------------------------------------------------------------------------

test('status: a form post changes it, records a status event with the note, and redirects with a generic notice', async () => {
  const w = await world();
  const [sub] = await seedInbox(w);
  const res = await w.call(
    routes.status.POST,
    w.req('POST', `/api/submissions/${sub!.id}/status`, {
      form: {
        status: 'in_review',
        notes: 'Looking into <b>this</b>',
        return: `/submissions/${sub!.id}?form=frm_x&q=Ana`,
      },
    }),
    { id: sub!.id },
  );
  assert.equal(res.status, 303);
  const location = res.headers.get('location')!;
  assert.equal(location, `/submissions/${sub!.id}?form=frm_x&q=Ana&notice=status-changed`);
  assert.equal(location.includes('<b>'), false);
  const detail = await w.forms.getSubmission(sub!.id);
  assert.equal(detail!.submission.status, 'in_review');
  const event = detail!.events.find((e) => e.kind === 'status')!;
  assert.deepEqual(event.change, { from: 'new', to: 'in_review', note: 'Looking into <b>this</b>' });
  assert.equal(event.actorUserId, w.staff.id);

  // The same status again is a no-op: no second event, a different (still fixed) notice.
  const again = await w.call(
    routes.status.POST,
    w.req('POST', `/api/submissions/${sub!.id}/status`, { form: { status: 'in_review' } }),
    { id: sub!.id },
  );
  assert.equal(again.headers.get('location'), `/submissions/${sub!.id}?notice=status-unchanged`);
  assert.equal((await w.forms.getSubmission(sub!.id))!.events.filter((e) => e.kind === 'status').length, 1);
});

test('status: JSON clients get { id, status }; the contract alias closed means handled; approve/decline are not settable', async () => {
  const w = await world();
  const [sub] = await seedInbox(w);
  const ok = await w.call(
    routes.status.POST,
    w.req('POST', `/api/submissions/${sub!.id}/status`, { json: { status: 'closed', notes: 'done' } }),
    { id: sub!.id },
  );
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { id: sub!.id, status: 'handled' });
  assert.equal(parseSettableStatus('approved'), null);
  assert.equal(parseSettableStatus('declined'), null);
  assert.equal(parseSettableStatus(42), null);
  for (const status of ['approved', 'declined', 'bogus', '']) {
    const res = await w.call(
      routes.status.POST,
      w.req('POST', `/api/submissions/${sub!.id}/status`, { json: { status } }),
      { id: sub!.id },
    );
    assert.equal(res.status, 400, status);
  }
  const unknown = await w.call(
    routes.status.POST,
    w.req('POST', '/api/submissions/nope/status', { json: { status: 'spam' } }),
    { id: 'nope' },
  );
  assert.equal(unknown.status, 404);
  const form = await w.call(
    routes.status.POST,
    w.req('POST', `/api/submissions/${sub!.id}/status`, { form: { status: 'nonsense' } }),
    { id: sub!.id },
  );
  assert.equal(form.status, 303);
  assert.equal(form.headers.get('location'), `/submissions/${sub!.id}?notice=invalid`);
});

test('a return path outside /submissions is ignored, so a form post can never redirect off-site', async () => {
  const w = await world();
  const [sub] = await seedInbox(w);
  for (const bad of [
    'https://evil.example/',
    '//evil.example',
    '/api/staff/provision',
    '/submissions/x\r\nSet-Cookie: a=b',
    '/submissions/../x',
  ]) {
    const res = await w.call(
      routes.status.POST,
      w.req('POST', `/api/submissions/${sub!.id}/status`, { form: { status: 'handled', return: bad } }),
      { id: sub!.id },
    );
    assert.equal(res.status, 303);
    assert.match(res.headers.get('location')!, new RegExp(`^/submissions/${sub!.id}\\?notice=`));
  }
});

test('notes: appended with the author, never editable, empty or oversized notes refused, notices never echo the note', async () => {
  const w = await world();
  const [sub] = await seedInbox(w);
  const add = (note: string) =>
    w.call(
      routes.note.POST,
      w.req('POST', `/api/submissions/${sub!.id}/note`, {
        form: { note, return: `/submissions/${sub!.id}` },
      }),
      { id: sub!.id },
    );
  const first = await add('First <script>alert(1)</script> note');
  assert.equal(first.headers.get('location'), `/submissions/${sub!.id}?notice=note-added`);
  await add('Second note');
  const notes = (await w.forms.getSubmission(sub!.id))!.events.filter((e) => e.kind === 'note');
  assert.deepEqual(
    notes.map((n) => n.body),
    ['First <script>alert(1)</script> note', 'Second note'],
  );
  assert.equal((await add('   ')).headers.get('location'), `/submissions/${sub!.id}?notice=invalid`);
  assert.equal(
    (await add('x'.repeat(2500))).headers.get('location'),
    `/submissions/${sub!.id}?notice=invalid`,
  );
  assert.equal((await w.forms.getSubmission(sub!.id))!.events.filter((e) => e.kind === 'note').length, 2);
  const json = await w.call(
    routes.note.POST,
    w.req('POST', `/api/submissions/${sub!.id}/note`, { json: { note: 'Via API' } }),
    { id: sub!.id },
  );
  assert.equal(json.status, 201);
});

test('notices: only keys the page declares produce text, so a crafted link never writes on a staff screen', () => {
  const table = SUBMISSION_NOTICES;
  const url = (notice: string) =>
    new URL(`https://admin.example/submissions?notice=${encodeURIComponent(notice)}`);
  assert.equal(noticeFrom(url('<script>alert(1)</script>'), table), null);
  assert.equal(noticeFrom(url('__proto__'), table), null);
  assert.equal(noticeFrom(url('toString'), table), null);
  assert.equal(noticeFrom(url('note-added'), table)?.kind, 'ok');
  for (const [name, notice] of Object.entries(table)) {
    assert.match(name, /^[a-z0-9-]{1,40}$/, 'valid for see()');
    assert.equal(/[<>&"]|\$\{/.test(notice.text), false, `${name} text has no markup or placeholders`);
  }
  // Every key an error can map to exists in the table.
  const errors: unknown[] = [
    new FormsError('NOT_FOUND', 'secret detail'),
    new FormsError('INVALID_INPUT', 'secret detail'),
    new FormsError('INVALID_TRANSITION', 'secret detail'),
    new FormsError('CONFLICT', 'secret detail'),
    new Error('boom'),
  ];
  for (const err of errors) assert.ok(submissionNoticeKey(err) in table);
});

// ---------------------------------------------------------------------------------------------------------
// bulk
// ---------------------------------------------------------------------------------------------------------

test('bulk: only the ticked rows change, and a non-destructive action applies at once', async () => {
  const w = await world();
  const subs = await seedInbox(w);
  const res = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', {
      form: { action: 'handled', ids: [subs[0]!.id, subs[3]!.id], return: '/submissions?status=new' },
    }),
  );
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/submissions?status=new&notice=bulk-done');
  const statuses = w
    .rows<{ id: string; status: string }>('SELECT id, status FROM form_submissions')
    .reduce<Record<string, string>>((m, r) => ({ ...m, [r.id]: r.status }), {});
  for (const [i, s] of subs.entries())
    assert.equal(statuses[s.id], i === 0 || i === 3 ? 'handled' : 'new', `row ${i}`);
  // One status event per changed row, none for the others.
  assert.equal(
    w.row<{ c: number }>("SELECT count(*) AS c FROM form_submission_events WHERE kind = 'status'")?.c,
    2,
  );
});

test('bulk: archive and spam go to a confirmation page first; confirm=1 applies; JSON must say confirm', async () => {
  const w = await world();
  const subs = await seedInbox(w);
  const ids = [subs[1]!.id, subs[2]!.id, subs[4]!.id];
  const first = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', {
      form: { action: 'spam', ids, return: '/submissions?q=person' },
    }),
  );
  assert.equal(first.status, 303);
  const location = new URL(first.headers.get('location')!, ORIGIN);
  assert.equal(location.pathname, '/submissions/confirm');
  assert.equal(location.searchParams.get('action'), 'spam');
  assert.deepEqual(location.searchParams.getAll('ids'), ids);
  assert.equal(location.searchParams.get('return'), '/submissions?q=person');
  assert.equal(
    w.row<{ c: number }>("SELECT count(*) AS c FROM form_submissions WHERE status = 'spam'")?.c,
    0,
    'nothing changed yet',
  );

  const done = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', {
      form: { action: 'spam', ids, confirm: '1', return: '/submissions' },
    }),
  );
  assert.equal(done.headers.get('location'), '/submissions?notice=bulk-done');
  assert.equal(
    w.row<{ c: number }>("SELECT count(*) AS c FROM form_submissions WHERE status = 'spam'")?.c,
    3,
  );

  const jsonNo = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', { json: { action: 'archived', ids: [subs[5]!.id] } }),
  );
  assert.equal(jsonNo.status, 400);
  assert.equal((await jsonNo.json()).error.code, 'CONFIRMATION_REQUIRED');
  const jsonYes = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', {
      json: { action: 'archived', ids: [subs[5]!.id], confirm: true },
    }),
  );
  assert.equal(jsonYes.status, 200);
  assert.equal((await jsonYes.json()).data.changed, 1);
});

test('bulk: no ids, a bad action, too many ids, unknown ids and decided applications are all handled safely', async () => {
  const w = await world();
  const subs = await seedInbox(w);
  const app = await w.submit('apply', { name: 'Ana', email: 'ana@example.org', roles: ['Drums'] }, T0 + 1000);
  await w.call(routes.approve.POST, w.req('POST', `/api/submissions/${app.id}/approve`, { form: {} }), {
    id: app.id,
  });
  assert.equal(
    w.row<{ status: string }>('SELECT status FROM form_submissions WHERE id = ?', app.id)?.status,
    'approved',
  );

  const none = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', { form: { action: 'handled' } }),
  );
  assert.equal(none.headers.get('location'), '/submissions?notice=bulk-none');
  const bad = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', { form: { action: 'delete', ids: [subs[0]!.id] } }),
  );
  assert.equal(bad.headers.get('location'), '/submissions?notice=bulk-bad-action');
  const many = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', {
      form: { action: 'handled', ids: Array.from({ length: 101 }, (_, i) => `fsub_${i}`) },
    }),
  );
  assert.equal(many.headers.get('location'), '/submissions?notice=bulk-too-many');

  const mixed = await w.call(
    routes.bulk.POST,
    w.req('POST', '/api/submissions/bulk', {
      form: {
        action: 'handled',
        ids: [subs[0]!.id, app.id, 'does_not_exist', "x'; DROP TABLE form_submissions;--"],
      },
    }),
  );
  assert.equal(mixed.headers.get('location'), '/submissions?notice=bulk-partial');
  assert.equal(
    w.row<{ status: string }>('SELECT status FROM form_submissions WHERE id = ?', app.id)?.status,
    'approved',
    'decided application untouched',
  );
  assert.equal(
    w.row<{ status: string }>('SELECT status FROM form_submissions WHERE id = ?', subs[0]!.id)?.status,
    'handled',
  );
  assert.ok(w.row('SELECT 1 AS x FROM form_submissions LIMIT 1'), 'table still there');
});

// ---------------------------------------------------------------------------------------------------------
// approve and decline
// ---------------------------------------------------------------------------------------------------------

test('approve: adds one roster member, is idempotent, and only applications can be approved', async () => {
  const w = await world();
  const app = await w.submit(
    'apply',
    { name: 'Ana Reyes', email: 'Ana@Example.org', roles: ['Drums', 'Keys'], city: 'Phoenix' },
    T0,
  );
  const go = () =>
    w.call(
      routes.approve.POST,
      w.req('POST', `/api/submissions/${app.id}/approve`, { json: { notes: 'Great audition' } }),
      { id: app.id },
    );
  const first = await go();
  assert.equal(first.status, 200);
  const data = (await first.json()).data;
  assert.equal(data.status, 'approved');
  assert.equal(data.changed, true);
  assert.match(data.rosterMemberId, /^ros_/);
  assert.equal(w.row<{ c: number }>('SELECT count(*) AS c FROM roster_members')?.c, 1);

  const second = (await (await go()).json()).data;
  assert.equal(second.changed, false);
  assert.equal(second.rosterMemberId, data.rosterMemberId);
  assert.equal(w.row<{ c: number }>('SELECT count(*) AS c FROM roster_members')?.c, 1);
  assert.equal(
    w.row<{ c: number }>("SELECT count(*) AS c FROM form_submission_events WHERE kind = 'note'")?.c,
    1,
    'the note is kept once',
  );

  const [contactSub] = await seedInbox(w);
  const notApp = await w.call(
    routes.approve.POST,
    w.req('POST', `/api/submissions/${contactSub!.id}/approve`, { json: {} }),
    { id: contactSub!.id },
  );
  assert.equal(notApp.status, 409);
  const form = await w.call(
    routes.approve.POST,
    w.req('POST', `/api/submissions/${contactSub!.id}/approve`, { form: {} }),
    { id: contactSub!.id },
  );
  assert.equal(form.headers.get('location'), `/submissions/${contactSub!.id}?notice=not-application`);
  assert.equal(w.row<{ c: number }>('SELECT count(*) AS c FROM roster_members')?.c, 1);
  assert.equal(
    (
      await w.call(routes.approve.POST, w.req('POST', '/api/submissions/nope/approve', { json: {} }), {
        id: 'nope',
      })
    ).status,
    404,
  );
});

test('decline: stores the decision, moves the applicant files to the declined area, repeats safely', async () => {
  const w = await world();
  const app = await w.submit('apply', { name: 'Ben Cruz', email: 'ben@example.org', roles: ['Keys'] }, T0);
  const file = w.addUpload(app.id, {
    kind: 'video',
    contentType: 'video/mp4',
    name: 'audition.mp4',
    question: 'sample',
    bytes: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 1, 2, 3]),
  });
  const go = () =>
    w.call(
      routes.decline.POST,
      w.req('POST', `/api/submissions/${app.id}/decline`, {
        form: { notes: 'Not a fit right now', return: `/submissions/${app.id}` },
      }),
      { id: app.id },
    );
  const first = await go();
  assert.equal(first.headers.get('location'), `/submissions/${app.id}?notice=declined`);
  const row = w.row<{ status: string; delete_after: number }>(
    'SELECT status, delete_after FROM form_submissions WHERE id = ?',
    app.id,
  )!;
  assert.equal(row.status, 'declined');
  assert.ok(row.delete_after > 0);
  const moved = w.row<{ r2_key: string }>('SELECT r2_key FROM form_uploads WHERE id = ?', file.id)!;
  assert.match(moved.r2_key, new RegExp(`^forms/declined/${app.id}/`));
  assert.equal(w.bucket.objects.has(file.r2Key), false, 'old object removed');
  assert.ok(w.bucket.objects.has(moved.r2_key), 'object now under the declined prefix');

  const again = await go();
  assert.equal(again.headers.get('location'), `/submissions/${app.id}?notice=already-decided`);
  assert.equal(
    w.row<{ c: number }>(
      "SELECT count(*) AS c FROM form_submission_events WHERE kind = 'status' AND submission_id = ?",
      app.id,
    )?.c,
    1,
  );

  const [contactSub] = await seedInbox(w);
  const notApp = await w.call(
    routes.decline.POST,
    w.req('POST', `/api/submissions/${contactSub!.id}/decline`, { json: {} }),
    { id: contactSub!.id },
  );
  assert.equal(notApp.status, 409);
});

test('decline: if the files cannot be moved the decision stands and the notice says so', async () => {
  const w = await world();
  const app = await w.submit('apply', { name: 'Cy Dunn', email: 'cy@example.org', roles: ['Keys'] }, T0);
  delete (w.env as Partial<typeof w.env>).MEDIA_BUCKET;
  const res = await w.call(
    routes.decline.POST,
    w.req('POST', `/api/submissions/${app.id}/decline`, { form: {} }),
    { id: app.id },
  );
  assert.equal(res.headers.get('location'), `/submissions/${app.id}?notice=declined-files-pending`);
  assert.equal(
    w.row<{ status: string }>('SELECT status FROM form_submissions WHERE id = ?', app.id)?.status,
    'declined',
  );
});

// ---------------------------------------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------------------------------------

test('export: a safe text/csv attachment, formula starters neutralised, numbers kept, filters honoured, audited', async () => {
  const w = await world();
  await w.submit(
    'contact',
    {
      ...goodAnswers('Formula Person', { details: '@SUM(1+1)', amount: '-5' }),
      name: '=HYPERLINK("http://evil.example","click")',
    },
    T0,
  );
  await w.submit(
    'contact',
    {
      ...goodAnswers('Phone Person', { details: 'line1\nline2, "quoted"', amount: '12.5' }),
      name: '+1 555 0100',
    },
    T0 + 60,
  );
  const third = await w.submit('contact', goodAnswers('Plain Person', { details: '-2+3' }), T0 + 120);
  await w.forms.setStatus({ submissionId: third.id, status: 'handled', staffId: w.staff.id });

  const res = await w.call(
    routes.exportCsv.POST,
    w.req('POST', '/api/submissions/export', { form: { form: w.contact.id, return: '/submissions' } }),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(
    res.headers.get('content-disposition')!,
    /^attachment; filename="contact-submissions-\d{4}-\d{2}-\d{2}\.csv"; filename\*=UTF-8''contact-submissions-/,
  );
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('x-export-rows'), '3');
  const csv = await res.text();
  assert.ok(csv.startsWith('"Reference","Submitted (UTC)","Status"'));
  assert.ok(
    csv.includes('"\'=HYPERLINK(""http://evil.example"",""click"")"'),
    'formula neutralised and quotes doubled',
  );
  assert.ok(csv.includes('"\'@SUM(1+1)"'));
  assert.ok(csv.includes('"\'+1 555 0100"'));
  assert.ok(csv.includes('"\'-2+3"'), 'a leading minus in free text is neutralised too');
  assert.ok(
    csv.includes('"line1\nline2, ""quoted"""'),
    'embedded newline, comma and quote stay inside one quoted cell',
  );
  assert.ok(csv.includes('"-5"') && !csv.includes("'-5"), 'a validated negative number keeps its sign');
  for (const line of csv.split('\r\n').filter(Boolean)) assert.equal(/^[=+\-@]/.test(line), false);

  // Audit: one export event per exported row, one audit log row, ids only.
  assert.equal(
    w.row<{ c: number }>("SELECT count(*) AS c FROM form_submission_events WHERE kind = 'export'")?.c,
    3,
  );
  const audit = w.row<{ action: string; entity_id: string; payload_json: string; actor_user_id: string }>(
    "SELECT * FROM audit_logs WHERE action = 'submissions.exported'",
  )!;
  assert.equal(audit.entity_id, w.contact.id);
  assert.equal(audit.actor_user_id, w.staff.id);
  assert.deepEqual(JSON.parse(audit.payload_json), { rows: 3, truncated: 0 });

  // The filter is honoured.
  const only = await w.call(
    routes.exportCsv.POST,
    w.req('POST', '/api/submissions/export', { form: { form: w.contact.id, status: 'handled' } }),
  );
  assert.equal(only.headers.get('x-export-rows'), '1');
  assert.equal((await only.text()).includes('HYPERLINK'), false);
});

test('export: needs a form; a form post is sent back with a notice, JSON gets 400', async () => {
  const w = await world();
  const form = await w.call(
    routes.exportCsv.POST,
    w.req('POST', '/api/submissions/export', { form: { status: 'new', return: '/submissions?status=new' } }),
  );
  assert.equal(form.status, 303);
  assert.equal(form.headers.get('location'), '/submissions?status=new&notice=export-needs-form');
  const json = await w.call(routes.exportCsv.POST, w.req('POST', '/api/submissions/export', { json: {} }));
  assert.equal(json.status, 400);
  const unknown = await w.call(
    routes.exportCsv.POST,
    w.req('POST', '/api/submissions/export', { json: { form: 'frm_nope' } }),
  );
  assert.equal(unknown.status, 404);
  assert.equal(
    w.row<{ c: number }>("SELECT count(*) AS c FROM audit_logs WHERE action = 'submissions.exported'")?.c,
    0,
  );
});

// ---------------------------------------------------------------------------------------------------------
// the file handler
// ---------------------------------------------------------------------------------------------------------

async function getFile(w: World, id: string, headers: Record<string, string> = {}) {
  return w.call(routes.file.GET, w.req('GET', `/files/${id}`, { headers }), { id });
}

test('files: an image is inline with the full set of hardening headers and never reveals the storage key', async () => {
  const w = await world();
  const sub = await w.submit('contact', goodAnswers('Ana Reyes'), T0);
  const file = w.addUpload(sub.id, { name: 'photo.jpg' });
  const res = await getFile(w, file.id);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('content-security-policy'), 'sandbox');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('content-length'), String(file.bytes.length));
  assert.equal(
    res.headers.get('content-disposition'),
    `inline; filename="photo.jpg"; filename*=UTF-8''photo.jpg`,
  );
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), file.bytes);
  const headerText = JSON.stringify([...res.headers.entries()]);
  assert.equal(headerText.includes('forms/'), false, 'no storage key in headers');
});

test('files: PDFs and unexpected types download; the type comes from our allowlist, never the stored name or label', async () => {
  const w = await world();
  const sub = await w.submit('contact', goodAnswers('Ana Reyes'), T0);
  const pdf = w.addUpload(sub.id, {
    kind: 'pdf',
    contentType: 'application/pdf',
    name: 'chart.pdf',
    bytes: new TextEncoder().encode('%PDF-1.7 test'),
  });
  const res = await getFile(w, pdf.id);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition')!, /^attachment; /);
  assert.equal(res.headers.get('content-security-policy'), 'sandbox');

  for (const [contentType, kind] of [
    ['text/html', 'image'],
    ['image/svg+xml', 'image'],
    ['application/x-msdownload', 'other'],
    ['text/html', 'video'],
  ] as const) {
    const odd = w.addUpload(sub.id, {
      kind,
      contentType,
      name: 'page.html',
      bytes: new TextEncoder().encode('<script>alert(1)</script>'),
    });
    const r = await getFile(w, odd.id);
    assert.equal(r.status, 200, `${contentType}`);
    assert.equal(
      r.headers.get('content-type'),
      'application/octet-stream',
      `${contentType} is not passed through`,
    );
    assert.match(r.headers.get('content-disposition')!, /^attachment; /, `${contentType} downloads`);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('files: video is inline and supports single byte ranges (206), suffix and open ranges; bad ranges are ignored or 416', async () => {
  const w = await world();
  const sub = await w.submit('contact', goodAnswers('Ana Reyes'), T0);
  const bytes = new Uint8Array(Array.from({ length: 100 }, (_, i) => i));
  const video = w.addUpload(sub.id, { kind: 'video', contentType: 'video/mp4', name: 'clip.mp4', bytes });

  const full = await getFile(w, video.id);
  assert.match(full.headers.get('content-disposition')!, /^inline; /);
  assert.equal(full.status, 200);

  const part = await getFile(w, video.id, { range: 'bytes=10-19' });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 10-19/100');
  assert.equal(part.headers.get('content-length'), '10');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], Array.from(bytes.slice(10, 20)));
  assert.equal(part.headers.get('content-security-policy'), 'sandbox');
  assert.equal(part.headers.get('x-content-type-options'), 'nosniff');

  const open = await getFile(w, video.id, { range: 'bytes=95-' });
  assert.equal(open.headers.get('content-range'), 'bytes 95-99/100');
  const suffix = await getFile(w, video.id, { range: 'bytes=-3' });
  assert.equal(suffix.headers.get('content-range'), 'bytes 97-99/100');
  const clamped = await getFile(w, video.id, { range: 'bytes=90-500' });
  assert.equal(clamped.headers.get('content-range'), 'bytes 90-99/100');

  const beyond = await getFile(w, video.id, { range: 'bytes=100-120' });
  assert.equal(beyond.status, 416);
  assert.equal(beyond.headers.get('content-range'), 'bytes */100');
  assert.equal((await getFile(w, video.id, { range: 'bytes=-0' })).status, 416);

  for (const ignored of ['bytes=5-2', 'bytes=0-1,5-6', 'items=0-5', 'bytes=a-b', 'bytes=', 'garbage']) {
    const r = await getFile(w, video.id, { range: ignored });
    assert.equal(r.status, 200, `${ignored} is ignored`);
    assert.equal((await r.arrayBuffer()).byteLength, 100);
  }
});

test('files: unknown, malformed, rejected, unfinished and deleted uploads all answer the same 404', async () => {
  const w = await world();
  const sub = await w.submit('contact', goodAnswers('Ana Reyes'), T0);
  const ids: string[] = [];
  for (const status of ['rejected', 'started', 'uploaded', 'deleted'])
    ids.push(w.addUpload(sub.id, { status }).id);
  const gone = w.addUpload(sub.id);
  w.bucket.objects.delete(gone.r2Key);
  ids.push(gone.id, 'upl_does_not_exist', 'bad%20id', '..%2Fetc', 'x'.repeat(200));
  const bodies = new Set<string>();
  for (const id of ids) {
    const res = await getFile(w, id);
    assert.equal(res.status, 404, id);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
    bodies.add(await res.text());
  }
  assert.equal(bodies.size, 1, 'no difference between "never existed" and "rejected"');
  assert.equal([...bodies][0]!.includes('forms/'), false);
});

test('files: a hostile or non-ASCII file name cannot break out of Content-Disposition', async () => {
  const w = await world();
  const sub = await w.submit('contact', goodAnswers('Ana Reyes'), T0);
  const hostile = [
    'evil"\r\nSet-Cookie: pwned=1\r\n.jpg',
    'a"; filename="b.exe',
    '../../etc/passwd',
    'C:\\temp\\x.jpg',
    'résumé 文書 (final)*.jpg',
    "o'brien.jpg",
    '\u202Egpj.exe',
    '',
    null,
  ];
  for (const name of hostile) {
    const f = w.addUpload(sub.id, { name });
    const res = await getFile(w, f.id);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null, `no injected header for ${JSON.stringify(name)}`);
    const cd = res.headers.get('content-disposition')!;
    assert.equal(/[\r\n]/.test(cd), false);
    const m = /^(inline|attachment); filename="([^"]*)"; filename\*=UTF-8''([A-Za-z0-9%._~!$&+^`|#-]*)$/.exec(
      cd,
    );
    assert.ok(m, `well-formed header for ${JSON.stringify(name)}: ${cd}`);
    assert.equal(/[\\/"]/.test(m![2]!), false, 'the quoted fallback has no quote, slash or backslash');
    assert.equal(m![3]!.includes("'"), false);
    assert.equal(decodeURIComponent(m![3]!).includes('/'), false);
  }
  const f = w.addUpload(sub.id, { name: 'résumé 文書.jpg' });
  assert.match(
    (await getFile(w, f.id)).headers.get('content-disposition')!,
    /filename\*=UTF-8''r%C3%A9sum%C3%A9%20%E6%96%87%E6%9B%B8\.jpg$/,
  );
  // Direct helper checks.
  assert.equal(contentDisposition('attachment', 'a\r\nb.pdf').includes('\n'), false);
  assert.equal(contentDisposition('inline', '').startsWith('inline; filename="file"'), true);
});

test('files: parseRange follows RFC 9110 for a single range', () => {
  assert.deepEqual(parseRange(null, 10), { kind: 'full' });
  assert.deepEqual(parseRange('bytes=0-0', 10), { kind: 'partial', start: 0, end: 0 });
  assert.deepEqual(parseRange('bytes=2-', 10), { kind: 'partial', start: 2, end: 9 });
  assert.deepEqual(parseRange('bytes=-4', 10), { kind: 'partial', start: 6, end: 9 });
  assert.deepEqual(parseRange('bytes=-40', 10), { kind: 'partial', start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=10-12', 10), { kind: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=0-1', 0), { kind: 'unsatisfiable' });
  assert.deepEqual(parseRange('bytes=1-0', 10), { kind: 'full' });
  assert.deepEqual(parseRange('bytes=99999999999999999999-', 10), { kind: 'full' });
});

// ---------------------------------------------------------------------------------------------------------
// the detail view model
// ---------------------------------------------------------------------------------------------------------

test('detail: contact and request cards come first, hidden-by-logic questions are omitted, files and links are summarised', async () => {
  const w = await world();
  const booking = await w.submit(
    'contact',
    goodAnswers('Ana Reyes', {
      topic: 'Booking',
      booking_date: '2026-12-24',
      clip: 'https://youtu.be/dQw4w9WgXcQ',
      amount: '5',
    }),
    T0,
  );
  const other = await w.submit('contact', goodAnswers('Ben Cruz', { topic: 'Something else' }), T0 + 60);
  w.addUpload(booking.id, { name: 'photo.jpg' });

  const a = buildDetailView((await w.forms.getSubmission(booking.id))!);
  assert.deepEqual(
    a.contact.map((i) => i.label),
    ['Your name', 'Your email'],
  );
  assert.equal(a.requestTitle, 'Request');
  const labelsA = a.sections.flatMap((s) => s.items.map((i) => i.label));
  assert.ok(labelsA.includes('Booking date'));
  assert.equal(labelsA.includes('Your name'), false, 'bound answers are not repeated in the sections');
  const photo = a.sections.flatMap((s) => s.items).find((i) => i.label === 'Photo')!;
  assert.deepEqual(photo.answer, { kind: 'files', count: 1 });
  assert.equal(a.attachments.length, 1);
  assert.equal(a.attachments[0]!.href, `/files/${a.attachments[0]!.id}`);
  assert.equal(a.attachments[0]!.kind, 'image');

  const b = buildDetailView((await w.forms.getSubmission(other.id))!);
  const labelsB = b.sections.flatMap((s) => s.items.map((i) => i.label));
  assert.equal(labelsB.includes('Booking date'), false, 'its show-if rule was not met');
  assert.deepEqual(b.sections.flatMap((s) => s.items).find((i) => i.label === 'Video link')!.answer, {
    kind: 'none',
  });
});

test('detail: labels come from the version the person answered, not the current draft or version', async () => {
  const w = await world();
  const old = await w.submit('contact', goodAnswers('Ana Reyes'), T0);
  // Publish version 2 with a renamed question.
  const edit = await w.forms.getForEdit(w.contact.id);
  const { revision } = await w.forms.saveDraft({
    formId: w.contact.id,
    schema: contactSchema('Your full legal name'),
    expectedRevision: edit.revision,
    staffId: w.staff.id,
  });
  await w.forms.publish({ formId: w.contact.id, expectedRevision: revision, staffId: w.staff.id });
  const fresh = await w.submit('contact', goodAnswers('Ben Cruz'), T0 + 60);

  assert.deepEqual(
    buildDetailView((await w.forms.getSubmission(old.id))!).contact.map((i) => i.label),
    ['Your name', 'Your email'],
  );
  assert.deepEqual(
    buildDetailView((await w.forms.getSubmission(fresh.id))!).contact.map((i) => i.label),
    ['Your full legal name', 'Your email'],
  );
});

test('detail: staff text is kept as plain strings for Astro to escape; the components never emit raw HTML', async () => {
  const w = await world();
  const sub = await w.submit(
    'contact',
    goodAnswers('<img src=x onerror=alert(1)>', { details: '<script>alert("x")</script>' }),
    T0,
  );
  w.addUpload(sub.id, { name: '<svg onload=alert(1)>.jpg' });
  const detail = (await w.forms.getSubmission(sub.id))!;
  const view = buildDetailView(detail);
  const details = view.sections.flatMap((s) => s.items).find((i) => i.label.startsWith('Details'))!;
  assert.equal(details.label, 'Details <script>alert(1)</script>');
  assert.deepEqual(details.answer, { kind: 'text', text: '<script>alert("x")</script>', multiline: true });
  assert.equal(view.attachments[0]!.name, '<svg onload=alert(1)>.jpg');
  // Nothing in the model is pre-escaped (that would double-escape); the render side never injects HTML.
  const dirs = [`${ADMIN}/components/submissions`, `${ADMIN}/pages/submissions`];
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(astro|ts)$/.test(name)) sources.push(p);
    }
  };
  dirs.forEach(walk);
  assert.ok(sources.length >= 10);
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    assert.equal(
      /set:html|set:text=\{[^}]*\}\s*\/>.*html|innerHTML|insertAdjacentHTML|is:inline|<script\b|dangerouslySetInnerHTML|\sstyle=/.test(
        text,
      ),
      false,
      `${file}: raw HTML, scripts or inline styles`,
    );
    assert.equal(/\son[a-z]+=/.test(text), false, `${file}: inline event handler`);
  }
});

test('detail: a link answer is a link only for an https allow-listed host; the embed stays off while the CSP forbids it', () => {
  const youtube = linkViewOf({
    provider: 'youtube',
    id: 'dQw4w9WgXcQ',
    canonical: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  });
  assert.equal(youtube?.href, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(youtube?.providerLabel, 'YouTube');
  assert.equal(
    youtube?.embedSrc,
    YOUTUBE_EMBED_ALLOWED ? 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' : null,
  );
  for (const bad of [
    { canonical: 'javascript:alert(1)' },
    { canonical: 'http://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { canonical: 'https://evil.example/watch?v=dQw4w9WgXcQ' },
    { canonical: 'https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { canonical: 42 },
    {},
    null,
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  ]) {
    assert.equal(linkViewOf(bad), null, JSON.stringify(bad));
  }
  assert.equal(
    linkViewOf({ canonical: 'https://vimeo.com/123456789' })?.embedSrc,
    null,
    'only YouTube is embeddable',
  );
  const csp = buildContentSecurityPolicy({ https: true });
  const frameSrc = /frame-src ([^;]*)/.exec(csp)![1]!;
  if (YOUTUBE_EMBED_ALLOWED)
    assert.ok(frameSrc.includes('https://www.youtube-nocookie.com'), 'embed enabled but the CSP blocks it');
  else assert.equal(frameSrc.includes('youtube'), false);
});

test('detail: show-if is evaluated on the stored answers like the server does on submit', () => {
  const schema = {
    sections: [
      {
        id: 's',
        title: 'S',
        questions: [
          { id: 'a', type: 'multiple_choice', label: 'A', options: ['yes', 'no'], required: false },
          {
            id: 'b',
            type: 'short_text',
            label: 'B',
            showIf: { join: 'all', rules: [{ questionId: 'a', op: 'eq', value: 'yes' }] },
          },
          {
            id: 'c',
            type: 'short_text',
            label: 'C',
            showIf: { join: 'all', rules: [{ questionId: 'b', op: 'answered' }] },
          },
          {
            id: 'd',
            type: 'short_text',
            label: 'D',
            showIf: {
              join: 'any',
              rules: [
                { questionId: 'a', op: 'in', value: ['no', 'maybe'] },
                { questionId: 'zzz', op: 'eq', value: 'x' },
              ],
            },
          },
          {
            id: 'e',
            type: 'short_text',
            label: 'E',
            showIf: { join: 'all', rules: [{ questionId: 'a', op: 'neq', value: 'yes' }] },
          },
        ],
      },
    ],
  };
  const parsed = schema as never;
  assert.deepEqual([...shownQuestionIds(parsed, { a: 'yes', b: 'x' })].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...shownQuestionIds(parsed, { a: 'no' })].sort(), ['a', 'd', 'e']);
  assert.deepEqual([...shownQuestionIds(parsed, {})].sort(), ['a', 'e']);
});

test('detail: timeline lists status changes, notes and exports with who and when (UTC), without mixing them up', () => {
  const names = new Map([['u1', 'Sample Reviewer']]);
  const t = buildTimeline(
    [
      {
        id: '1',
        kind: 'status',
        actorUserId: 'u1',
        body: null,
        change: { from: 'new', to: 'in_review', note: 'checking' },
        createdAt: T0,
      },
      { id: '2', kind: 'note', actorUserId: 'u1', body: 'A note', change: null, createdAt: T0 + 60 },
      {
        id: '3',
        kind: 'status',
        actorUserId: 'u2',
        body: 'approved: added to roster',
        change: null,
        createdAt: T0 + 120,
      },
      { id: '4', kind: 'export', actorUserId: null, body: '{}', change: null, createdAt: T0 + 180 },
    ],
    names,
  );
  assert.deepEqual(
    t.notes.map((n) => [n.body, n.who]),
    [['A note', 'Sample Reviewer']],
  );
  assert.deepEqual(
    t.history.map((h) => h.text),
    ['New to In review', 'approved: added to roster', 'Included in a CSV export'],
  );
  assert.equal(t.history[0]!.note, 'checking');
  assert.equal(t.history[1]!.who, 'Staff');
  assert.equal(t.history[2]!.who, 'System');
  assert.match(t.history[0]!.when, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
});

// ---------------------------------------------------------------------------------------------------------
// previous / next
// ---------------------------------------------------------------------------------------------------------

test('neighbours: newer and older agree with the order of listSubmissions under every filter', async () => {
  const w = await world();
  const subs = await seedInbox(w);
  // Two submissions in the same second exercise the id tie-break.
  await w.submit('contact', goodAnswers('TieOne'), T0 + 600);
  await w.submit('contact', goodAnswers('TieTwo'), T0 + 600);
  await w.forms.setStatus({ submissionId: subs[1]!.id, status: 'handled', staffId: w.staff.id });
  await w.forms.setStatus({ submissionId: subs[4]!.id, status: 'handled', staffId: w.staff.id });
  w.addUpload(subs[2]!.id);
  w.addUpload(subs[6]!.id);

  const filters = [
    {},
    { status: 'handled' as const },
    { hasAttachments: true },
    { q: 'person' },
    { q: 'tie' },
    { from: T0 + 120, to: T0 + 400 },
    { formId: w.contact.id, version: 1 },
  ];
  for (const filter of filters) {
    const list: { id: string; reference: string; submittedAt: number }[] = [];
    let cursor: string | undefined;
    do {
      const page = await w.forms.listSubmissions({ ...filter, cursor, limit: 3 });
      list.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.ok(list.length > 0, JSON.stringify(filter));
    for (const [i, item] of list.entries()) {
      const n = await findNeighbours(w.d1 as never, filter, item);
      assert.equal(
        n.newer?.id ?? null,
        list[i - 1]?.id ?? null,
        `newer of #${i} under ${JSON.stringify(filter)}`,
      );
      assert.equal(
        n.older?.id ?? null,
        list[i + 1]?.id ?? null,
        `older of #${i} under ${JSON.stringify(filter)}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------------------------------------
// structure
// ---------------------------------------------------------------------------------------------------------

test('structure: every route runs the staff gate first and never imports storage keys; the delete action is deliberately absent', () => {
  const read = (p: string) => readFileSync(p, 'utf8');
  const routeFiles = [
    'pages/api/submissions/index.ts',
    'pages/api/submissions/[id]/index.ts',
    'pages/api/submissions/[id]/status.ts',
    'pages/api/submissions/[id]/note.ts',
    'pages/api/submissions/[id]/approve.ts',
    'pages/api/submissions/[id]/decline.ts',
    'pages/api/submissions/bulk.ts',
    'pages/api/submissions/export.ts',
    'pages/files/[id].ts',
  ];
  for (const file of routeFiles) {
    const text = read(`${ADMIN}/${file}`);
    assert.match(text, /export const prerender = false/, file);
    const gate = text.indexOf('submissionsApi(context)');
    assert.ok(gate > 0, `${file} runs the staff gate`);
    const body = text.search(/readBody\(|serveUpload\(|forms\.|approveApplication\(|declineApplication\(/);
    assert.ok(body === -1 || gate < body, `${file} gates before it reads or writes`);
    assert.equal(/r2_key|r2Key/.test(text), false, `${file} never touches storage keys`);
  }
  for (const file of [
    'pages/submissions/index.astro',
    'pages/submissions/[id].astro',
    'pages/submissions/confirm.astro',
  ]) {
    const text = read(`${ADMIN}/${file}`);
    assert.match(text, /submissionsPage\(Astro\)/, file);
    assert.match(text, /export const prerender = false/, file);
    assert.equal((text.match(/<h1/g) ?? []).length, 0, `${file}: the h1 comes from AdminLayout`);
  }
  assert.equal(
    readdirSync(`${ADMIN}/pages/api/submissions`).some((n) => /delete|purge/.test(n)),
    false,
  );
});

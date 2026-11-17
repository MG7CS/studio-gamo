/**
 * Admin foundation (apps/admin/src/lib, data/nav.ts): the helper contract every admin screen builds on.
 * Pages cannot be compiled by node:test, so the page-level checks run the real admin middleware with a
 * stand-in handler that calls `adminPage` exactly as a page does, and read the page sources.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { provisionStaffSchema } from '../../packages/domain/src/api/validation.ts';
import { AuthError, createSession, buildAdminGateCookie, resolveAuth } from '../../packages/auth/index.ts';
import { StaffIdentityService } from '../../packages/domain/src/services/staff-identity.ts';
import { createDb } from '../../packages/db/index.ts';
import { createMigratedD1, type SqliteD1 } from '../../packages/db/testing.ts';
import {
  FormAnswersError,
  FormConflictError,
  FormPublishError,
  FormsError,
  FormsService,
} from '../../packages/domain/src/forms/all.ts';
import { InvoiceError } from '../../packages/domain/src/invoices/all.ts';
import { WorshipError } from '../../packages/domain/src/worship/index.ts';
import { UploadError } from '../../packages/domain/src/forms/uploads.ts';
import { asSqlDatabase } from '../../packages/domain/src/security/sql-database.ts';
import {
  adminApi,
  adminPage,
  jsonOrSee,
  readBody,
  see,
  wantsJson,
} from '../../apps/admin/src/lib/admin-page.ts';
import { noticeFrom, type Notice } from '../../apps/admin/src/lib/flash.ts';
import { domainErrorResponse, noticeKeyForError } from '../../apps/admin/src/lib/domain-errors.ts';
import { getHomeCounts } from '../../apps/admin/src/lib/home-counts.ts';

const ORIGIN = 'https://admin.gamostudio.org';
const secret = 'admin-foundation-secret-0123456789abcdef';

// ---------------------------------------------------------------------------------------------
// see / wantsJson / jsonOrSee
// ---------------------------------------------------------------------------------------------

test('see() answers 303 with no-store and a notice before any fragment', () => {
  const plain = see('/forms');
  assert.equal(plain.status, 303);
  assert.equal(plain.headers.get('Location'), '/forms');
  assert.equal(plain.headers.get('Cache-Control'), 'no-store');

  assert.equal(see('/forms', 'saved').headers.get('Location'), '/forms?notice=saved');
  assert.equal(see('/forms?q=a', 'saved').headers.get('Location'), '/forms?q=a&notice=saved');
  assert.equal(
    see('/forms/1/edit?q=abc#question-abc', 'saved').headers.get('Location'),
    '/forms/1/edit?q=abc&notice=saved#question-abc',
  );
  assert.equal(see('/forms#top', 'moved').headers.get('Location'), '/forms?notice=moved#top');
});

test('see() replaces an existing notice and drops notice keys that are not safe', () => {
  assert.equal(see('/forms?notice=old&q=1', 'new').headers.get('Location'), '/forms?q=1&notice=new');
  for (const bad of ['Has Space', 'UPPER', 'a/b', 'x&y=1', '', 'a'.repeat(41), 'new\r\nSet-Cookie: x=1']) {
    assert.equal(see('/forms', bad).headers.get('Location'), '/forms', `notice ${JSON.stringify(bad)}`);
  }
  assert.equal(see('/forms', 'a'.repeat(40)).headers.get('Location'), `/forms?notice=${'a'.repeat(40)}`);
});

test('see() never redirects off site or with header injection', () => {
  for (const bad of [
    'https://evil.invalid/x',
    '//evil.invalid/x',
    '/\\evil.invalid',
    'forms',
    '/forms\r\nSet-Cookie: a=b',
    '',
  ]) {
    assert.equal(see(bad).headers.get('Location'), '/', `location ${JSON.stringify(bad)}`);
    assert.equal(see(bad, 'saved').headers.get('Location'), '/?notice=saved');
  }
});

test('wantsJson reads Accept and Content-Type', () => {
  const req = (headers: Record<string, string>) =>
    new Request(`${ORIGIN}/api/x`, { method: 'POST', headers });
  assert.equal(wantsJson(req({ accept: 'application/json' })), true);
  assert.equal(wantsJson(req({ accept: 'text/html, application/json;q=0.9' })), true);
  assert.equal(wantsJson(req({ 'content-type': 'application/json; charset=utf-8' })), true);
  assert.equal(wantsJson(req({ accept: 'text/html,application/xhtml+xml,*/*;q=0.8' })), false);
  assert.equal(wantsJson(req({ 'content-type': 'application/x-www-form-urlencoded' })), false);
  assert.equal(wantsJson(req({})), false);
});

test('jsonOrSee answers JSON clients with the envelope and form posts with a redirect', async () => {
  const json = jsonOrSee(
    new Request(`${ORIGIN}/x`, { method: 'POST', headers: { accept: 'application/json' } }),
    { data: { id: 'a' }, location: '/forms', notice: 'saved', status: 201 },
  );
  assert.equal(json.status, 201);
  assert.deepEqual(await json.json(), { success: true, data: { id: 'a' } });
  assert.equal(json.headers.get('Cache-Control'), 'no-store');

  const defaultStatus = jsonOrSee(
    new Request(`${ORIGIN}/x`, { method: 'POST', headers: { 'content-type': 'application/json' } }),
    { data: 1, location: '/forms' },
  );
  assert.equal(defaultStatus.status, 200);

  const form = jsonOrSee(new Request(`${ORIGIN}/x`, { method: 'POST' }), {
    data: { id: 'a' },
    location: '/forms#row-a',
    notice: 'saved',
    status: 201,
  });
  assert.equal(form.status, 303);
  assert.equal(form.headers.get('Location'), '/forms?notice=saved#row-a');
});

// ---------------------------------------------------------------------------------------------
// readBody
// ---------------------------------------------------------------------------------------------

const post = (body: BodyInit, contentType?: string) =>
  new Request(`${ORIGIN}/x`, {
    method: 'POST',
    body,
    headers: contentType ? { 'content-type': contentType } : undefined,
  });

test('readBody reads urlencoded fields, repeating keys become arrays', async () => {
  const body = await readBody(post('title=Hello&tag=a&tag=b&empty=', 'application/x-www-form-urlencoded'));
  assert.deepEqual(body, { title: 'Hello', tag: ['a', 'b'], empty: '' });
});

test('readBody reads multipart text fields and ignores files', async () => {
  const fd = new FormData();
  fd.set('title', 'Hi');
  fd.append('role', 'bass');
  fd.append('role', 'drums');
  fd.set('file', new File(['x'], 'x.txt'));
  const body = await readBody(new Request(`${ORIGIN}/x`, { method: 'POST', body: fd }));
  assert.deepEqual(body, { title: 'Hi', role: ['bass', 'drums'] });
});

test('readBody reads a JSON object and turns values into strings', async () => {
  const body = await readBody(
    post(
      JSON.stringify({ a: 'x', n: 3, ok: true, list: ['1', 2, null, { z: 1 }], none: null }),
      'application/json',
    ),
  );
  assert.deepEqual(body, { a: 'x', n: '3', ok: 'true', list: ['1', '2'], none: '' });
});

test('readBody is prototype-pollution safe', async () => {
  const json = await readBody(
    post('{"__proto__":{"polluted":"yes"},"constructor":"x","prototype":"y","safe":"1"}', 'application/json'),
  );
  assert.deepEqual(json, { safe: '1' });
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.getPrototypeOf(json), Object.prototype);

  const form = await readBody(
    post('__proto__=bad&constructor=bad&prototype=bad&ok=1', 'application/x-www-form-urlencoded'),
  );
  assert.deepEqual(form, { ok: '1' });
  assert.equal(({} as Record<string, unknown>).bad, undefined);
});

test('readBody refuses bodies over 256 KB, arrays, scalars and malformed JSON with a Response', async () => {
  const big = 'a='.concat('x'.repeat(256 * 1024 + 1));
  await assert.rejects(readBody(post(big, 'application/x-www-form-urlencoded')), (e: unknown) => {
    assert.ok(e instanceof Response);
    assert.equal(e.status, 413);
    return true;
  });
  // The limit also holds when Content-Length is absent or false (a streamed body).
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const chunk = new TextEncoder().encode('a=' + 'x'.repeat(64 * 1024));
      for (let i = 0; i < 5; i++) controller.enqueue(chunk);
      controller.close();
    },
  });
  await assert.rejects(
    readBody(
      new Request(`${ORIGIN}/x`, {
        method: 'POST',
        body: stream,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        // @ts-expect-error duplex is required for streaming request bodies
        duplex: 'half',
      }),
    ),
    (e: unknown) => e instanceof Response && e.status === 413,
  );
  for (const bad of ['[1,2]', '3', '"x"', 'null', '{broken']) {
    await assert.rejects(
      readBody(post(bad, 'application/json')),
      (e: unknown) => e instanceof Response && e.status === 400,
      bad,
    );
  }
  const exactly = 'a='.concat('x'.repeat(256 * 1024 - 2));
  assert.equal(
    (await readBody(post(exactly, 'application/x-www-form-urlencoded'))).a?.length,
    256 * 1024 - 2,
  );
});

// ---------------------------------------------------------------------------------------------
// flash
// ---------------------------------------------------------------------------------------------

test('noticeFrom returns only notices present in the table and never reflects the query text', () => {
  const table: Record<string, Notice> = {
    saved: { kind: 'ok', text: 'Saved.' },
    conflict: { kind: 'error', text: 'Someone else saved first.' },
  };
  assert.deepEqual(noticeFrom(new URL(`${ORIGIN}/forms?notice=saved`), table), table.saved);
  assert.deepEqual(noticeFrom(new URL(`${ORIGIN}/forms?notice=conflict`), table), table.conflict);
  assert.equal(noticeFrom(new URL(`${ORIGIN}/forms`), table), null);
  for (const key of [
    '<script>alert(1)</script>',
    'unknown',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    '',
  ]) {
    assert.equal(noticeFrom(new URL(`${ORIGIN}/forms?notice=${encodeURIComponent(key)}`), table), null, key);
  }
  // Only the first notice parameter counts.
  assert.deepEqual(noticeFrom(new URL(`${ORIGIN}/f?notice=saved&notice=conflict`), table), table.saved);
});

// ---------------------------------------------------------------------------------------------
// domain errors
// ---------------------------------------------------------------------------------------------

/** A real ZodError from the domain package's own copy of zod. */
function zodError(): unknown {
  try {
    provisionStaffSchema.parse({ email: 'not-an-email' });
  } catch (e) {
    return e;
  }
  throw new Error('schema accepted invalid input');
}

async function bodyOf(res: Response) {
  return (await res.json()) as {
    success: boolean;
    error: { code: string; message: string; details?: unknown };
  };
}

test('domainErrorResponse maps every domain error class to a status and the standard error body', async () => {
  const cases: [unknown, number, string][] = [
    [new FormsError('NOT_FOUND', 'No such form.'), 404, 'NOT_FOUND'],
    [new FormsError('SLUG_TAKEN', 'That address is taken.'), 409, 'SLUG_TAKEN'],
    [new FormsError('INVALID_INPUT', 'Too long.'), 400, 'INVALID_INPUT'],
    [new InvoiceError('INVOICE_NOT_FOUND', 'No such invoice.'), 404, 'INVOICE_NOT_FOUND'],
    [new WorshipError('NOT_FOUND', 'No such person.'), 404, 'NOT_FOUND'],
    [new WorshipError('INVALID_INPUT', 'Bad value.'), 400, 'INVALID_INPUT'],
    [new WorshipError('INVALID_STATE', 'Already decided.'), 409, 'INVALID_STATE'],
    [new UploadError('UPLOAD_NOT_FOUND'), 404, 'UPLOAD_NOT_FOUND'],
    [new UploadError('UPLOAD_STORAGE'), 503, 'UPLOAD_STORAGE'],
    [new AuthError('UNAUTHENTICATED', 'Sign in.', 401), 401, 'UNAUTHENTICATED'],
    [new AuthError('FORBIDDEN', 'No.', 403), 403, 'FORBIDDEN'],
  ];
  for (const [err, status, code] of cases) {
    const res = domainErrorResponse(err);
    assert.equal(res.status, status, String(code));
    const body = await bodyOf(res);
    assert.equal(body.success, false);
    assert.equal(body.error.code, code);
    assert.ok(body.error.message.length > 0);
  }
});

test('domainErrorResponse: conflict carries the current revision, publish and answer errors are 422', async () => {
  const conflict = domainErrorResponse(new FormConflictError(7, 'stf_other', 1_780_000_000));
  assert.equal(conflict.status, 409);
  const cb = await bodyOf(conflict);
  assert.equal(cb.error.code, 'REVISION_CONFLICT');
  assert.deepEqual(cb.error.details, { currentRevision: 7, updatedAt: 1_780_000_000 });
  // Who changed it is shown by the screen from its own lookup; the user id never leaves in this body.
  assert.ok(!JSON.stringify(cb).includes('stf_other'));

  const publish = domainErrorResponse(new FormPublishError(['Question 2 has no label.'], ['Link text']));
  assert.equal(publish.status, 422);
  const pb = await bodyOf(publish);
  assert.equal(pb.error.code, 'PUBLISH_BLOCKED');
  assert.deepEqual(pb.error.details, { errors: ['Question 2 has no label.'], warnings: ['Link text'] });

  const answers = domainErrorResponse(
    new FormAnswersError([{ questionId: 'q1', message: 'This question is required.' }]),
  );
  assert.equal(answers.status, 422);
  assert.equal((await bodyOf(answers)).error.code, 'ANSWERS_INVALID');
});

test('domainErrorResponse: invoice field errors, Zod issues and Response pass-through', async () => {
  const invoice = domainErrorResponse(
    new InvoiceError('INVOICE_INVALID', 'Check the lines.', [
      { index: 1, code: 'required', message: 'Description is required.' },
    ]),
  );
  assert.equal(invoice.status, 400);
  assert.deepEqual((await bodyOf(invoice)).error.details, [
    { index: 1, code: 'required', message: 'Description is required.' },
  ]);

  const zod = zodError();
  assert.equal((zod as Error).name, 'ZodError');
  const zr = domainErrorResponse(zod);
  assert.equal(zr.status, 400);
  assert.equal((await bodyOf(zr)).error.code, 'VALIDATION_ERROR');

  const passThrough = new Response('x', { status: 413 });
  assert.equal(domainErrorResponse(passThrough), passThrough);
});

test('domainErrorResponse: unknown errors are a generic 500 that leaks nothing', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const leaky = new Error(
      'SQLITE_ERROR: no such table: users at /Users/x/repo/file.ts sk_live_secret123 stack...',
    );
    for (const err of [leaky, 'a string', null, { message: 'x' }, new TypeError('boom')]) {
      const res = domainErrorResponse(err);
      assert.equal(res.status, 500);
      const text = JSON.stringify(await bodyOf(res));
      assert.ok(text.includes('INTERNAL_ERROR'));
      assert.ok(!/sqlite|sk_live|\/Users|stack|boom|table/i.test(text), text);
    }
    // A trusted-looking prefix on an unknown Error must not be echoed as a domain refusal.
    assert.equal(domainErrorResponse(new Error('NOT_FOUND: users row 42')).status, 500);
  } finally {
    console.error = originalError;
  }
});

test('noticeKeyForError returns generic keys that match the notice key shape', () => {
  const key = (e: unknown) => noticeKeyForError(e);
  assert.equal(key(new FormConflictError(2, null, 1)), 'conflict');
  assert.equal(key(new FormsError('REVISION_CONFLICT', 'x')), 'conflict');
  assert.equal(key(new FormsError('SLUG_TAKEN', 'x')), 'conflict');
  assert.equal(key(new FormsError('NOT_FOUND', 'x')), 'not-found');
  assert.equal(key(new InvoiceError('INVOICE_NOT_FOUND', 'x')), 'not-found');
  assert.equal(key(new WorshipError('NOT_FOUND', 'x')), 'not-found');
  assert.equal(key(new FormsError('INVALID_INPUT', 'x')), 'invalid');
  assert.equal(key(new WorshipError('INVALID_INPUT', 'x')), 'invalid');
  assert.equal(key(new InvoiceError('INVOICE_INVALID', 'x')), 'invalid');
  assert.equal(key(new InvoiceError('INVOICE_STATE', 'x')), 'blocked');
  assert.equal(key(new InvoiceError('GAMO_ADMIN_NOT_APPROVED', 'x')), 'blocked');
  assert.equal(key(new InvoiceError('PAYMENT_NOT_CONFIGURED', 'x')), 'unavailable');
  assert.equal(key(new FormAnswersError([])), 'invalid');
  assert.equal(key(new FormPublishError(['x'], [])), 'blocked');
  assert.equal(key(new WorshipError('INVALID_STATE', 'x')), 'blocked');
  assert.equal(key(new FormsError('INVALID_TRANSITION', 'x')), 'blocked');
  assert.equal(key(new UploadError('UPLOAD_STORAGE')), 'unavailable');
  assert.equal(key(zodError()), 'invalid');
  // Anything else is not something to redirect with: the caller answers with domainErrorResponse.
  assert.equal(key(new Error('boom')), null);
  assert.equal(key(new AuthError('FORBIDDEN', 'No', 403)), null);
  assert.equal(key('x'), null);
  for (const err of [
    new FormConflictError(2, null, 1),
    new FormPublishError([], []),
    new WorshipError('INVALID_STATE', 'x'),
    new UploadError('UPLOAD_STORAGE'),
  ]) {
    assert.match(key(err) ?? '', /^[a-z0-9-]{1,40}$/);
  }
});

// ---------------------------------------------------------------------------------------------
// home counts
// ---------------------------------------------------------------------------------------------

const NOW = 1_780_000_000;

async function seedHome(d1: SqliteD1) {
  const forms = new FormsService(d1, { now: NOW });
  const f1 = await forms.create({
    slug: 'worship-apply',
    program: 'worship',
    kind: 'musician_application',
    title: 'Apply',
    staffId: 's',
  });
  await forms.create({ slug: 'contact', program: 'web', kind: 'contact', title: 'Contact', staffId: 's' });
  const run = (sql: string, ...p: (string | number | null)[]) => d1.sqlite.prepare(sql).run(...p);
  run(
    "INSERT INTO form_versions (id, form_id, version, schema_json, published_at) VALUES ('v1', ?, 1, '{\"sections\":[]}', ?)",
    f1.id,
    NOW,
  );
  const sub = (id: string, status: string) =>
    run(
      "INSERT INTO form_submissions (id, form_id, form_version_id, reference, status, answers_json, idempotency_key, submitted_at) VALUES (?, ?, 'v1', ?, ?, '{}', ?, ?)",
      id,
      f1.id,
      `GS-${id}`,
      status,
      `k-${id}`,
      NOW,
    );
  sub('s1', 'new');
  sub('s2', 'new');
  sub('s3', 'handled');
  const req = (id: string, subId: string, status: string) =>
    run(
      "INSERT INTO service_requests (id, submission_id, program, church_name, contact_email_normalized, service_date, status, created_at) VALUES (?, ?, 'worship', 'Sample Church', 'c@example.invalid', '2026-12-01', ?, ?)",
      id,
      subId,
      status,
      NOW,
    );
  req('r1', 's1', 'new');
  req('r2', 's2', 'matching');
  req('r3', 's3', 'completed');
  run(
    "INSERT INTO roster_members (id, submission_id, program, display_name, email_normalized, roles_json, status, approved_at) VALUES ('m1', 's3', 'worship', 'Sample Musician', 'm@example.invalid', '[]', 'active', ?)",
    NOW,
  );
  return run;
}

test('getHomeCounts counts from SQL and shows zeros on an empty database', async () => {
  const empty = await createMigratedD1();
  assert.deepEqual(await getHomeCounts(asSqlDatabase(empty), NOW), {
    newSubmissions: 0,
    openRequests: 0,
    pendingOffers: 0,
    unpaidInvoices: 0,
    draftsWithChanges: 0,
  });
});

test('getHomeCounts counts new submissions, open requests, live offers, open invoices and drafts with changes', async () => {
  const d1 = await createMigratedD1();
  try {
    const run = await seedHome(d1);
    const offer = (id: string, status: string, expires: number) =>
      run(
        "INSERT INTO offers (id, request_id, roster_member_id, role, pay_cents, token_hash, expires_at, status, sent_at, responded_at) VALUES (?, 'r1', 'm1', ?, 5000, ?, ?, ?, ?, ?)",
        id,
        `role-${id}`,
        `hash-${id}`,
        expires,
        status,
        NOW,
        status === 'pending' ? null : NOW,
      );
    offer('o1', 'pending', NOW + 3600);
    offer('o2', 'pending', NOW - 10); // past its expiry: not pending any more
    offer('o3', 'accepted', NOW + 3600);
    const inv = (id: string, status: string) =>
      run(
        "INSERT INTO invoices (id, number, source_type, bill_to_name, bill_to_email_normalized, status, total_cents, paid_at, paid_method, created_at) VALUES (?, ?, 'manual', 'Sample', 'b@example.invalid', ?, 100, ?, ?, ?)",
        id,
        `GS-2026-${id}`,
        status,
        status === 'paid' ? NOW : null,
        status === 'paid' ? 'check' : null,
        NOW,
      );
    inv('i1', 'open');
    inv('i2', 'open');
    inv('i3', 'draft');
    inv('i4', 'paid');
    const counts = await getHomeCounts(asSqlDatabase(d1), NOW);
    assert.equal(counts.newSubmissions, 2);
    assert.equal(counts.openRequests, 2);
    assert.equal(counts.pendingOffers, 1);
    assert.equal(counts.unpaidInvoices, 2);
    // Both forms are drafts that were never published (no published version matches the draft).
    assert.equal(counts.draftsWithChanges, 2);
  } finally {
    d1.sqlite.close();
  }
});

test('getHomeCounts keeps the page up when one query fails (null, never a thrown error)', async () => {
  const d1 = await createMigratedD1();
  try {
    d1.sqlite.exec('DROP TABLE offers');
    const counts = await getHomeCounts(asSqlDatabase(d1), NOW);
    assert.equal(counts.pendingOffers, null);
    assert.equal(counts.newSubmissions, 0);
  } finally {
    d1.sqlite.close();
  }
});

// ---------------------------------------------------------------------------------------------
// admin pages through the middleware
// ---------------------------------------------------------------------------------------------

async function adminFixture() {
  const d1 = await createMigratedD1();
  const db = createDb(d1);
  const identity = new StaffIdentityService(db);
  const staff = await identity.findOrCreateUser('reviewer@example.invalid', 'Sample Reviewer');
  await identity.assignSystemRole(staff.id, 'staff_reviewer');
  const session = await createSession(db, staff.id, secret);
  const gate = await buildAdminGateCookie(session.sessionId, staff.id, session.expiresAt, secret, {
    secure: true,
    sameSite: 'Lax',
    path: '/',
  });
  const cookie = [`__session=${encodeURIComponent(session.cookieValue)}`, gate.split(';')[0]].join('; ');
  return { d1, staff, cookie };
}

async function loadMiddleware() {
  const { onRequest } = await import('../../apps/admin/src/middleware.ts');
  return async (context: any, next: () => Promise<Response>): Promise<Response> => {
    const result = await onRequest(context, next);
    assert.ok(result instanceof Response);
    return result;
  };
}

/** The same two lines every admin page starts with. */
async function pageHandler(context: any): Promise<Response> {
  try {
    const admin = await adminPage(context);
    return Response.json({ staff: admin.staff, hasDb: typeof admin.db.prepare === 'function' });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

test('admin pages render through the middleware for a staff session and answer 401 without one', async () => {
  const onRequest = await loadMiddleware();
  const f = await adminFixture();
  try {
    const env = {
      DB: f.d1,
      ENVIRONMENT: 'production',
      REQUIRE_ADMIN_AUTH: 'true',
      SESSION_SECRET: secret,
      CF_ACCESS_AUD: 'aud-tag-123',
      CF_ACCESS_TEAM_NAME: 'gamoteam',
    };
    const run = async (path: string, headers: Record<string, string> = {}) => {
      const request = new Request(`${ORIGIN}${path}`, { headers });
      const context: any = {
        request,
        params: {},
        locals: { runtime: { env } },
      };
      return onRequest(context, async () => pageHandler(context));
    };
    for (const path of ['/', '/forms', '/submissions', '/roster', '/requests', '/invoices', '/security']) {
      const anon = await run(path);
      assert.equal(anon.status, 401, `${path} without a session`);
      assert.equal(anon.headers.get('Cache-Control'), 'no-store');

      const staff = await run(path, { cookie: f.cookie });
      assert.equal(staff.status, 200, `${path} with a staff session`);
      const body = (await staff.json()) as {
        staff: { userId: string; email: string; name: string };
        hasDb: boolean;
      };
      assert.equal(body.staff.email, 'reviewer@example.invalid');
      assert.equal(body.staff.userId, f.staff.id);
      assert.equal(body.hasDb, true);
    }
    // A forged cookie value is not a session.
    assert.equal((await run('/', { cookie: '__session=forged; __admin_gate=forged' })).status, 401);
  } finally {
    f.d1.sqlite.close();
  }
});

test('adminPage throws a 401 Response without a staff session and 403 for a cross-origin write', async () => {
  const d1 = await createMigratedD1();
  try {
    const env = { DB: d1, SESSION_SECRET: secret };
    const req = (method = 'GET', headers: Record<string, string> = {}) =>
      new Request(`${ORIGIN}/forms`, { method, headers });
    await assert.rejects(
      adminPage({ request: req(), locals: { runtime: { env } } as never }),
      (e: unknown) => e instanceof Response && e.status === 401,
    );
    const fixture = await adminFixture();
    try {
      // A validated session present in locals, a POST from another origin.
      const auth = await resolveAuth(
        new Request(`${ORIGIN}/`, { headers: { cookie: fixture.cookie } }),
        createDb(fixture.d1),
        secret,
      );
      assert.ok(auth);
      const locals = { runtime: { env: { DB: fixture.d1, SESSION_SECRET: secret } }, adminAuthSession: auth };
      const ok = await adminPage({ request: req(), locals: locals as never });
      assert.equal(ok.staff.email, 'reviewer@example.invalid');
      assert.equal(ok.auth.user.id, fixture.staff.id);
      await assert.rejects(
        adminPage({ request: req('POST', { origin: 'https://evil.invalid' }), locals: locals as never }),
        (e: unknown) => e instanceof Response && e.status === 403,
      );
      const okPost = await adminPage({
        request: req('POST', { origin: ORIGIN }),
        locals: locals as never,
      });
      assert.equal(okPost.staff.userId, fixture.staff.id);
      // Without a database binding the page gets a 503 Response, not a crash.
      await assert.rejects(
        adminPage({
          request: req(),
          locals: { runtime: { env: { SESSION_SECRET: secret } }, adminAuthSession: auth } as never,
        }),
        (e: unknown) => e instanceof Response && e.status === 503,
      );
    } finally {
      fixture.d1.sqlite.close();
    }
  } finally {
    d1.sqlite.close();
  }
});

test('adminApi runs the staff gate: unauthenticated and cross-origin requests are refused, staff pass', async () => {
  const f = await adminFixture();
  try {
    const env = { DB: f.d1, ENVIRONMENT: 'production', SESSION_SECRET: secret };
    const call = (method: string, headers: Record<string, string>) =>
      adminApi({
        request: new Request(`${ORIGIN}/api/forms`, { method, headers }),
        locals: { runtime: { env } },
        params: {},
      } as never);
    await assert.rejects(call('GET', {}), (e: unknown) => e instanceof AuthError && e.status === 401);
    await assert.rejects(
      call('POST', { cookie: f.cookie, origin: 'https://evil.invalid' }),
      (e: unknown) => e instanceof AuthError && e.status === 403,
    );
    const ok = await call('POST', { cookie: f.cookie, origin: ORIGIN });
    assert.equal(ok.staff.email, 'reviewer@example.invalid');
    assert.equal(ok.staff.userId, f.staff.id);
    assert.equal(typeof ok.db.prepare, 'function');
    assert.equal(ok.auth.user.id, f.staff.id);
    assert.deepEqual(Object.keys(ok).sort(), ['auth', 'db', 'env', 'staff']);
    // domainErrorResponse turns the refusal into the standard 401/403 body.
    const refused = await call('GET', {}).catch((e) => domainErrorResponse(e));
    assert.equal((refused as Response).status, 401);
  } finally {
    f.d1.sqlite.close();
  }
});

// ---------------------------------------------------------------------------------------------
// page sources
// ---------------------------------------------------------------------------------------------

test('every admin page except the 500 page uses AdminLayout and the old demo workspace is gone', () => {
  const dir = 'apps/admin/src/pages';
  const pages = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.astro'))
    .map((e) => `${e.parentPath}/${e.name}`.replace(/\\/g, '/'));
  assert.ok(pages.length >= 3);
  for (const page of pages) {
    if (page.endsWith('/500.astro')) continue;
    const source = readFileSync(page, 'utf8');
    assert.match(source, /AdminLayout/, `${page} must compose AdminLayout`);
    assert.doesNotMatch(
      source,
      /DashboardShell|adminWorkspace|data\/workspace/,
      `${page} must not use the demo shell`,
    );
  }
  for (const gone of ['apps/admin/src/data/workspace.ts', 'apps/admin/src/pages/[...slug].astro']) {
    assert.throws(() => readFileSync(gone), /ENOENT/, `${gone} must be deleted`);
  }
  assert.throws(() => readdirSync('apps/admin/src/data/admin'), /ENOENT/);
});

test('AdminLayout has exactly one h1, status/alert notice roles and no inline script or style', () => {
  const source = readFileSync('apps/admin/src/components/AdminLayout.astro', 'utf8');
  assert.equal((source.match(/<h1\b/g) ?? []).length, 1);
  assert.match(source, /role=\{?["']?(?:notice\.kind === 'error' \? 'alert' : 'status'|status)/);
  assert.match(source, /tabindex="-1"/);
  assert.doesNotMatch(source, /<script\s+is:inline|\sstyle=|\son[a-z]+=/);
});

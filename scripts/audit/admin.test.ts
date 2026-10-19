/**
 * The admin (apps/admin): single-admin Cloudflare Access gate, honest Inbox data and source rules.
 * Browser checks (CSP, axe, 360 px) run against the built worker separately.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, createSign, generateKeyPairSync } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createInMemoryD1, applyMigrations, readMigrations } from '../../packages/db/testing.ts';
import { checkGate, isLocalRuntime } from '../../apps/admin/src/lib/gate.ts';
import { NAV_ITEMS } from '../../apps/admin/src/lib/nav.ts';
import { loadInbox, tallyCounts } from '../../apps/admin/src/lib/inbox.ts';
import {
  handleReply,
  inquiryFilterFrom,
  loadInquiries,
  outcomeFrom as replyOutcome,
} from '../../apps/admin/src/lib/participation.ts';
import { handleEventForm, loadPendingEvents, outcomeFrom } from '../../apps/admin/src/lib/event-review.ts';
import {
  loadAcceptanceCounts,
  registrySummary,
  summarizeLegal,
} from '../../apps/admin/src/lib/legal-data.ts';
import { TERMS_DOCUMENTS, recordTermsAcceptance } from '../../packages/domain/src/terms/index.ts';
import { formatWhen, timeAgo } from '../../apps/admin/src/lib/format.ts';

const APP = 'apps/admin/src';
const TEAM = 'gamo-test';
const AUD = 'admin-test-aud-0123456789abcdef';
const ADMIN = 'owner@example.invalid';
const b64 = (input: Buffer | string) => Buffer.from(input).toString('base64url');

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const jwks = {
  keys: [{ ...createPublicKey(publicKey).export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }],
};

function assertion(email: string, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const payload = b64(
    JSON.stringify({
      aud: [AUD],
      email,
      iat: now,
      nbf: now,
      exp: now + 600,
      iss: `https://${TEAM}.cloudflareaccess.com`,
      type: 'app',
      identity_nonce: 'n',
      sub: 'sub-1',
      ...overrides,
    }),
  );
  return `${header}.${payload}.${b64(createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey))}`;
}

/** Runs `fn` with the Access key set answered locally and every other outbound request refused. */
async function withAccessKeys<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`) return Response.json(jwks);
    throw new Error(`outbound request refused in test: ${url}`);
  }) as typeof fetch;
  const originalError = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
    console.error = originalError;
  }
}

const prod = { ENVIRONMENT: 'production', ADMIN_EMAIL: ADMIN, CF_ACCESS_TEAM_NAME: TEAM, CF_ACCESS_AUD: AUD };
const at = (url: string, headers: Record<string, string> = {}) => ({
  request: new Request(url, { headers }),
  url: new URL(url),
});

test('only the one admin passes the gate (valid Access assertion for ADMIN_EMAIL)', async () => {
  await withAccessKeys(async () => {
    const { request, url } = at('https://admin.example.test/', {
      'cf-access-jwt-assertion': assertion(ADMIN),
    });
    assert.deepEqual(await checkGate(request, prod, url), { ok: true, email: ADMIN });
    // The address comparison ignores case and surrounding space, nothing else.
    const loud = at('https://admin.example.test/', {
      'cf-access-jwt-assertion': assertion('OWNER@Example.Invalid'),
    });
    assert.equal((await checkGate(loud.request, { ...prod, ADMIN_EMAIL: ` ${ADMIN} ` }, loud.url)).ok, true);
  });
});

test('everyone else is denied: other emails, bad signatures, wrong audience or issuer, expired, no assertion', async () => {
  await withAccessKeys(async () => {
    const attempts: [string, Record<string, string>, number][] = [
      ['another person', { 'cf-access-jwt-assertion': assertion('someone.else@example.invalid') }, 403],
      ['lookalike address', { 'cf-access-jwt-assertion': assertion(`x${ADMIN}`) }, 403],
      ['forged signature', { 'cf-access-jwt-assertion': `${assertion(ADMIN).slice(0, -6)}AAAAAA` }, 401],
      ['wrong audience', { 'cf-access-jwt-assertion': assertion(ADMIN, { aud: ['other'] }) }, 401],
      [
        'wrong issuer',
        { 'cf-access-jwt-assertion': assertion(ADMIN, { iss: 'https://evil.cloudflareaccess.com' }) },
        401,
      ],
      ['expired', { 'cf-access-jwt-assertion': assertion(ADMIN, { exp: 1 }) }, 401],
      ['garbage', { 'cf-access-jwt-assertion': 'not-a-jwt' }, 401],
      ['no assertion', {}, 401],
      // Emergency-style credentials open nothing.
      ['bearer token', { authorization: 'Bearer a-very-long-emergency-token' }, 401],
      ['x-admin-key', { 'x-admin-key': 'a-very-long-emergency-key' }, 401],
      ['basic auth', { authorization: `Basic ${btoa('admin:a-very-long-emergency-pass')}` }, 401],
      // The email header Cloudflare also sets is not proof; only the signed assertion is.
      ['plain email header', { 'cf-access-authenticated-user-email': ADMIN }, 401],
    ];
    for (const [name, headers, status] of attempts) {
      const { request, url } = at('https://admin.example.test/legal', headers);
      const result = await checkGate(request, prod, url);
      assert.equal(result.ok, false, name);
      assert.equal(!result.ok && result.status, status, name);
    }
  });
});

test('the admin is not configured: no ADMIN_EMAIL (or a malformed one) answers 503, even with a valid assertion', async () => {
  await withAccessKeys(async () => {
    for (const ADMIN_EMAIL of [undefined, '', '   ', 'not-an-email']) {
      const { request, url } = at('https://admin.example.test/', {
        'cf-access-jwt-assertion': assertion(ADMIN),
      });
      const result = await checkGate(request, { ...prod, ADMIN_EMAIL }, url);
      assert.equal(!result.ok && result.status, 503, String(ADMIN_EMAIL));
    }
  });
});

test('the local identity works only on a loopback host with ENVIRONMENT=local and the explicit flag', async () => {
  const local = { ENVIRONMENT: 'local', ADMIN_EMAIL: ADMIN, ALLOW_LOCAL_ADMIN_IDENTITY: 'true' };
  const ok = at('http://127.0.0.1:4326/');
  assert.deepEqual(await checkGate(ok.request, local, ok.url), { ok: true, email: ADMIN });
  const denied: [string, Record<string, string | undefined>, string][] = [
    ['flag off', { ...local, ALLOW_LOCAL_ADMIN_IDENTITY: undefined }, 'http://127.0.0.1:4326/'],
    ['flag not true', { ...local, ALLOW_LOCAL_ADMIN_IDENTITY: 'yes' }, 'http://127.0.0.1:4326/'],
    ['real hostname', local, 'https://admin.gamostudio.org/'],
    ['preview', { ...local, ENVIRONMENT: 'preview' }, 'http://127.0.0.1:4326/'],
    ['production', { ...local, ENVIRONMENT: 'production' }, 'http://127.0.0.1:4326/'],
    ['unset', { ...local, ENVIRONMENT: undefined }, 'http://127.0.0.1:4326/'],
    ['LOCAL', { ...local, ENVIRONMENT: 'LOCAL' }, 'http://127.0.0.1:4326/'],
  ];
  for (const [name, env, target] of denied) {
    const { request, url } = at(target);
    assert.equal((await checkGate(request, env, url)).ok, false, name);
  }
  assert.equal(isLocalRuntime({ ENVIRONMENT: 'local' }, new URL('http://localhost:4326/')), true);
  assert.equal(isLocalRuntime({ ENVIRONMENT: 'local' }, new URL('http://evil.localhost.example/')), false);
});

test('the middleware serves nothing without the gate: every path, method and API answers 401/403/503', async () => {
  const { onRequest } = await import('../../apps/admin/src/middleware.ts');
  const paths = [
    '/',
    '/legal',
    '/review/events',
    '/api/anything',
    '/signin',
    '/not-a-page',
    '/500',
    '/_astro/x.js',
  ];
  for (const env of [prod, { ...prod, ADMIN_EMAIL: undefined }]) {
    for (const path of paths) {
      for (const method of ['GET', 'POST', 'DELETE']) {
        const request = new Request(`https://admin.example.test${path}`, { method });
        let reached = false;
        const response = (await onRequest(
          { request, url: new URL(request.url), params: {}, locals: { runtime: { env } } } as never,
          (async () => {
            reached = true;
            return new Response('page');
          }) as never,
        )) as Response;
        assert.equal(reached, false, `${method} ${path} reached a page`);
        assert.ok([401, 403, 503].includes(response.status), `${method} ${path} answered ${response.status}`);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/);
        assert.ok(!response.headers.get('set-cookie'));
      }
    }
  }
});

test('with the gate passed, the middleware runs the page and records who the admin is', async () => {
  const { onRequest } = await import('../../apps/admin/src/middleware.ts');
  const env = { ENVIRONMENT: 'local', ADMIN_EMAIL: ADMIN, ALLOW_LOCAL_ADMIN_IDENTITY: 'true' };
  const request = new Request('http://127.0.0.1:4326/');
  const locals: Record<string, unknown> = { runtime: { env } };
  const response = (await onRequest(
    { request, url: new URL(request.url), params: {}, locals } as never,
    (async () => new Response('page')) as never,
  )) as Response;
  assert.equal(await response.text(), 'page');
  assert.equal(locals.adminEmail, ADMIN);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

// ---------------------------------------------------------------------------------------------
// Inbox: real numbers only.
// ---------------------------------------------------------------------------------------------

async function migrated() {
  const d1 = createInMemoryD1();
  await applyMigrations(d1, readMigrations());
  return d1;
}

test('the Inbox counts and the waiting list come from the database, and nothing else', async () => {
  const d1 = await migrated();
  assert.deepEqual(await loadInbox(d1), {
    counts: { participation: 0, churches: 0, providers: 0, events: 0 },
    oldest: [],
  });
  const now = Math.floor(Date.now() / 1000);
  const run = (sql: string) => d1.exec(sql);
  run(
    `INSERT INTO persons (id,email_normalized,email_verified_at,created_at,updated_at) VALUES ('p1','a@example.invalid',${now},${now},${now}),('p2','b@example.invalid',${now},${now},${now}),('p3','c@example.invalid',${now},${now},${now})`,
  );
  run(`INSERT INTO provider_profiles (id,person_id,role,product_origin,display_name,status,requires_staff_review,created_at,updated_at) VALUES
    ('c_open','p1','church','worship','Sample Church','submitted',1,${now - 400},${now - 400}),
    ('c_done','p2','church','worship','Sample Verified','verified',1,${now},${now}),
    ('m_open','p2','musician','worship','Sample Musician','in_review',1,${now - 200},${now - 200}),
    ('t_open','p3','teacher','academy','Sample Teacher','meeting_scheduled',1,${now - 100},${now - 100}),
    ('t_no','p1','teacher','academy','Sample Rejected','rejected',1,${now},${now})`);
  run(
    `INSERT INTO organizations (id,name,slug,type,status,created_at) VALUES ('o1','Sample Org','sample-org','church','active',${now})`,
  );
  run(
    `INSERT INTO organizer_profiles (id,organization_id,kind,verification_status,created_at,always_review) VALUES ('op1','o1','church','verified',${now},0)`,
  );
  run(`INSERT INTO events (id,organizer_id,title,slug,category,description,venue_name,city,state,starts_at,timezone,status,created_at) VALUES
    ('e1','op1','Sample Pending Event','sample-pending','concert','x','Hall','Phoenix','AZ',${now + 1000},'America/Phoenix','pending_review',${now - 300}),
    ('e2','op1','Sample Published Event','sample-published','concert','x','Hall','Phoenix','AZ',${now + 1000},'America/Phoenix','approved',${now})`);
  run(
    `INSERT INTO users (id,email,verified_email_at,status,created_at) VALUES ('u1','v@example.invalid',${now},'active',${now})`,
  );
  run(`INSERT INTO participation_inquiries (id,user_id,kind,interest,name,message,status,created_at) VALUES
    ('i1','u1','general','Worship','Sample Visitor','Sample message one',  'pending',${now - 500}),
    ('i2','u1','general','Worship','Sample Visitor','Sample message two',  'reviewed',${now}),
    ('i3','u1','general','Academy','Sample Visitor','Sample message three','closed',${now})`);
  const inbox = await loadInbox(d1);
  assert.deepEqual(inbox?.counts, { participation: 1, churches: 1, providers: 2, events: 1 });
  // Oldest first, only what is waiting, labeled by queue.
  assert.deepEqual(
    inbox?.oldest.map((i) => [i.title, i.kind]),
    [
      ['Worship · Sample Visitor', 'Participation request'],
      ['Sample Church', 'Church verification'],
      ['Sample Pending Event', 'Event review'],
      ['Sample Musician', 'Provider review'],
      ['Sample Teacher', 'Provider review'],
    ],
  );
  assert.equal((await loadInbox(d1, 2))?.oldest.length, 2);
});

test('the Inbox is null (a visible error, not zeros) when the database cannot be read', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await loadInbox(undefined), null);
    assert.equal(
      await loadInbox({
        prepare: () => {
          throw new Error('down');
        },
        batch: async () => [],
      }),
      null,
    );
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(
    tallyCounts([
      { k: 'church', n: '2' },
      { k: 'musician', n: 1 },
      { k: 'organizer', n: 9 },
    ]),
    {
      participation: 0,
      churches: 2,
      providers: 1,
      events: 0,
    },
  );
});

test('timeAgo says how long something has waited', () => {
  const now = Date.UTC(2026, 9, 19, 12);
  const s = (offset: number) => Math.floor(now / 1000) - offset;
  assert.equal(timeAgo(s(5), now), 'just now');
  assert.equal(timeAgo(s(60), now), '1 minute ago');
  assert.equal(timeAgo(s(3 * 3600), now), '3 hours ago');
  assert.equal(timeAgo(s(86_400), now), '1 day ago');
  assert.equal(timeAgo(s(86_400 * 45), now), '1 month ago');
  assert.equal(timeAgo(s(-500), now), 'just now');
});

test('first-event review: list, decisions, conflicts, and the organizer switch', async () => {
  const d1 = await migrated();
  const now = Math.floor(Date.now() / 1000);
  d1.exec(
    `INSERT INTO organizations (id,name,slug,type,status,created_at) VALUES ('o1','Sample Org','sample-org','church','active',${now})`,
  );
  d1.exec(
    `INSERT INTO organizer_profiles (id,organization_id,kind,verification_status,created_at,always_review) VALUES ('op1','o1','church','verified',${now},0)`,
  );
  const event = (id: string, title: string, status: string, created: number) =>
    d1.exec(
      `INSERT INTO events (id,organizer_id,title,slug,category,description,venue_name,city,state,starts_at,timezone,status,created_at) VALUES ('${id}','op1','${title}','${id}','concert','x','Hall','Phoenix','AZ',${now + 1000},'America/Phoenix','${status}',${created})`,
    );
  event('e_old', 'Sample Older Event', 'pending_review', now - 500);
  event('e_new', 'Sample Newer Event', 'pending_review', now - 100);
  event('e_live', 'Sample Published Event', 'approved', now);
  const env = { DB: d1, ENVIRONMENT: 'local' } as never;
  const post = (fields: Record<string, string>, origin = 'http://127.0.0.1:4326') =>
    new Request('http://127.0.0.1:4326/events', {
      method: 'POST',
      headers: { origin },
      body: new URLSearchParams(fields),
    });

  const listed = await loadPendingEvents(d1);
  assert.deepEqual(
    listed.map((e) => [e.title, e.firstEvent, e.alwaysReview]),
    [
      ['Sample Older Event', true, false],
      ['Sample Newer Event', true, false],
    ],
  );

  assert.deepEqual(
    await handleEventForm(
      post({ kind: 'decision', event_id: 'e_old', decision: 'approved' }, 'https://evil.example'),
      env,
      'owner@example.invalid',
    ),
    { ok: false, status: 403, message: 'That request came from another site and was refused.' },
  );
  const noNote = await handleEventForm(
    post({ kind: 'decision', event_id: 'e_old', decision: 'rejected' }),
    env,
    'owner@example.invalid',
  );
  assert.equal(!noNote.ok && noNote.status, 400);
  assert.equal(
    (
      await handleEventForm(
        post({ kind: 'decision', event_id: 'e_old', decision: 'maybe' }),
        env,
        'owner@example.invalid',
      )
    ).ok,
    false,
  );

  const approved = await handleEventForm(
    post({ kind: 'decision', event_id: 'e_old', decision: 'approved' }),
    env,
    'owner@example.invalid',
  );
  assert.deepEqual(approved, { ok: true, location: '/events?done=approved&first=1' });
  assert.equal(
    outcomeFrom(new URL('http://x/events?done=approved&first=1')),
    'Event approved. This was the organizer’s first approved event.',
  );
  assert.equal(outcomeFrom(new URL('http://x/events?done=<script>')), null);
  const again = await handleEventForm(
    post({ kind: 'decision', event_id: 'e_old', decision: 'rejected', notes: 'late' }),
    env,
    'owner@example.invalid',
  );
  assert.equal(!again.ok && again.status, 409);
  const missing = await handleEventForm(
    post({ kind: 'decision', event_id: 'e_nope', decision: 'approved' }),
    env,
    'owner@example.invalid',
  );
  assert.equal(!missing.ok && missing.status, 404);

  // Not the organizer's first event any more; the switch brings it back into review.
  assert.equal((await loadPendingEvents(d1))[0].firstEvent, false);
  assert.deepEqual(
    await handleEventForm(
      post({ kind: 'organizer', organizer_id: 'op1', always_review: 'on' }),
      env,
      'owner@example.invalid',
    ),
    { ok: true, location: '/events?done=always_review_on' },
  );
  assert.equal((await loadPendingEvents(d1))[0].alwaysReview, true);
  const changes = await handleEventForm(
    post({ kind: 'decision', event_id: 'e_new', decision: 'revision_requested', notes: 'Add the address.' }),
    env,
    'owner@example.invalid',
  );
  assert.deepEqual(changes, { ok: true, location: '/events?done=revision_requested' });

  const rows = d1.sqlite
    .prepare(
      "SELECT subject_id, action, staff_user_id, staff_name, notes FROM verification_records WHERE subject_type = 'event' ORDER BY rowid",
    )
    .all() as Record<string, unknown>[];
  assert.deepEqual(
    rows.map((r) => [r.subject_id, r.action, r.staff_user_id, r.staff_name]),
    [
      ['e_old', 'approve_event', 'admin', 'owner@example.invalid'],
      ['e_new', 'request_changes', 'admin', 'owner@example.invalid'],
    ],
  );
  assert.deepEqual(await loadPendingEvents(d1), []);
});

test('participation requests: list order, reply, close, conflicts, and what the person sees', async () => {
  const d1 = await migrated();
  const now = Math.floor(Date.now() / 1000);
  d1.exec(
    `INSERT INTO users (id,email,verified_email_at,status,created_at) VALUES ('u1','v@example.invalid',${now},'active',${now})`,
  );
  const inquiry = (id: string, status: string, created: number) =>
    d1.exec(
      `INSERT INTO participation_inquiries (id,user_id,kind,interest,name,message,status,created_at) VALUES ('${id}','u1','general','Worship','Sample Visitor','Sample message for ${id}','${status}',${created})`,
    );
  inquiry('i_old', 'pending', now - 900);
  inquiry('i_new', 'pending', now - 100);
  inquiry('i_done', 'closed', now - 500);
  const env = { DB: d1, ENVIRONMENT: 'local' } as never;
  const post = (fields: Record<string, string>, origin = 'http://127.0.0.1:4326') =>
    new Request('http://127.0.0.1:4326/participation', {
      method: 'POST',
      headers: { origin },
      body: new URLSearchParams(fields),
    });

  assert.deepEqual(
    (await loadInquiries(d1, 'pending')).items.map((i) => i.id),
    ['i_old', 'i_new'],
  );
  assert.deepEqual(
    (await loadInquiries(d1, 'all')).items.map((i) => i.id),
    ['i_new', 'i_done', 'i_old'],
  );
  assert.equal(inquiryFilterFrom(new URL('http://x/participation?status=bogus')), 'pending');

  const refused = await handleReply(
    post({ id: 'i_old', status: 'reviewed', notes: 'Hi' }, 'https://evil.example'),
    env,
  );
  assert.equal(!refused.ok && refused.status, 403);
  assert.equal(
    ((await handleReply(post({ id: 'i_old', status: 'reviewed', notes: '   ' }), env)) as { status: number })
      .status,
    400,
  );
  assert.equal(
    ((await handleReply(post({ id: 'i_old', status: 'pending', notes: 'Hi' }), env)) as { status: number })
      .status,
    400,
  );
  assert.equal(
    (
      (await handleReply(post({ id: "i_old'; --", status: 'reviewed', notes: 'Hi' }), env)) as {
        status: number;
      }
    ).status,
    400,
  );

  assert.deepEqual(
    await handleReply(post({ id: 'i_old', status: 'reviewed', notes: 'We will call you.' }), env),
    { ok: true, location: '/participation?done=reviewed' },
  );
  assert.deepEqual(await handleReply(post({ id: 'i_new', status: 'closed', notes: 'Not available.' }), env), {
    ok: true,
    location: '/participation?done=closed',
  });
  assert.equal(
    (
      (await handleReply(post({ id: 'i_new', status: 'reviewed', notes: 'Reopen' }), env)) as {
        status: number;
      }
    ).status,
    409,
  );
  assert.equal(
    ((await handleReply(post({ id: 'i_nope', status: 'reviewed', notes: 'Hi' }), env)) as { status: number })
      .status,
    404,
  );
  assert.equal(
    replyOutcome(new URL('http://x/participation?done=closed')),
    'Reply saved and the inquiry is closed.',
  );
  assert.equal(replyOutcome(new URL('http://x/participation?done=<b>')), null);

  // The reply is what the sender sees; no reviewer account is recorded.
  const row = d1.sqlite
    .prepare(
      "SELECT status, review_notes, reviewed_by_user_id, reviewed_at FROM participation_inquiries WHERE id = 'i_old'",
    )
    .get() as Record<string, unknown>;
  assert.equal(row.status, 'reviewed');
  assert.equal(row.review_notes, 'We will call you.');
  assert.equal(row.reviewed_by_user_id, null);
  assert.ok(row.reviewed_at);
  assert.deepEqual((await loadInquiries(d1, 'pending')).items, []);
});

test('legal: registry, review status and acceptance counts are real, read-only and honest when unavailable', async () => {
  const d1 = await migrated();
  const before = d1.sqlite.prepare('SELECT COUNT(*) AS n FROM terms_documents').get() as { n: number };
  const counts = await loadAcceptanceCounts(d1);
  assert.equal(counts?.size, 0);
  assert.equal(
    (d1.sqlite.prepare('SELECT COUNT(*) AS n FROM terms_documents').get() as { n: number }).n,
    before.n,
    'reading the page writes nothing',
  );
  const empty = registrySummary(counts);
  assert.equal(empty.documents, TERMS_DOCUMENTS.length);
  assert.equal(empty.totalAcceptances, 0);
  assert.ok(empty.rows.every((r) => r.accepted === 0));

  const doc = TERMS_DOCUMENTS[0];
  for (const email of ['a@example.invalid', 'b@example.invalid'])
    await recordTermsAcceptance(d1, {
      documents: [{ slug: doc.slug, version: doc.version }],
      subject: { email },
      context: 'admin-test',
      now: Math.floor(Date.now() / 1000),
    });
  const summary = registrySummary(await loadAcceptanceCounts(d1));
  assert.equal(summary.rows.find((r) => r.doc.slug === doc.slug)?.accepted, 2);
  assert.equal(summary.totalAcceptances, 2);
  assert.equal(
    summary.reviewed,
    TERMS_DOCUMENTS.filter((d) => (d.legalReviewStatus as string) === 'reviewed').length,
  );

  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await loadAcceptanceCounts(undefined), null);
  } finally {
    console.error = originalError;
  }
  const unavailable = summarizeLegal(TERMS_DOCUMENTS, null);
  assert.equal(unavailable.totalAcceptances, null);
  assert.ok(
    unavailable.rows.every((r) => r.accepted === null),
    'unavailable is never shown as zero',
  );
});

test('formatWhen formats a meeting time in its zone without throwing', () => {
  assert.equal(formatWhen(Date.UTC(2030, 6, 1, 16) / 1000, 'America/Phoenix'), 'Jul 1, 2030, 9:00 AM MST');
  assert.equal(formatWhen(Date.UTC(2030, 0, 1, 16) / 1000, 'America/New_York'), 'Jan 1, 2030, 11:00 AM EST');
});

// ---------------------------------------------------------------------------------------------
// Source rules.
// ---------------------------------------------------------------------------------------------

function sources(dir = APP): { path: string; text: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : [{ path, text: readFileSync(path, 'utf8') }];
  });
}

test('navigation lists only screens that exist', () => {
  for (const item of NAV_ITEMS) {
    const candidates =
      item.href === '/'
        ? [`${APP}/pages/index.astro`]
        : [`${APP}/pages${item.href}.astro`, `${APP}/pages${item.href}/index.astro`];
    assert.ok(
      candidates.some((file) => existsSync(file)),
      `${item.href} has no page`,
    );
  }
});

test('every page renders through AdminLayout; no public layout, brand tokens, demo shell or sessions', () => {
  for (const { path, text } of sources()) {
    if (path.includes('/pages/') && path.endsWith('.astro') && !path.endsWith('/index.astro'))
      assert.match(text, /<AdminLayout\b/, `${path} does not render through AdminLayout`);
    if (path.endsWith('/pages/index.astro')) assert.match(text, /<AdminLayout\b/);
    assert.ok(
      !/components\/BaseLayout|components\/SiteHeader|components\/SiteFooter|components\/dashboard\/|lib\/dashboard|styles\/tokens\.css|DEMO_PERSONA|WorkspaceScreen/.test(
        text,
      ),
      `${path} imports the public layout, brand tokens or the demo shell`,
    );
    assert.ok(
      !/resolveAuth|createSession|requireStaff|__session|admin_credentials|password/i.test(text),
      `${path} mentions sessions or passwords`,
    );
  }
});

test('no mock data, placeholder text or literal counts in the admin source', () => {
  for (const { path, text } of sources()) {
    assert.ok(
      !/gradient|bg-linear|bg-radial|bg-conic|\bfrom-|\bvia-/.test(
        text.replace(/No gradients anywhere/g, ''),
      ),
      `${path}: gradients are not used in the admin`,
    );
    assert.ok(
      !/coming soon|lorem ipsum|placeholder|\bTODO\b|\bFIXME\b|\bmock\b|fake data/i.test(text),
      `${path}: placeholder or mock text`,
    );
    assert.ok(!/\bbadge\s*[:=]\s*['"{]?\s*\d/.test(text), `${path}: literal badge value`);
    assert.ok(!/\bvalue=\{?\d+\}?[ />]/.test(text), `${path}: literal stat value`);
  }
});

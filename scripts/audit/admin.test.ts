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
import { createSqliteD1 } from '../../packages/db/testing.ts';
import { checkGate, isLocalRuntime } from '../../apps/admin/src/lib/gate.ts';
import { NAV_ITEMS } from '../../apps/admin/src/lib/nav.ts';
import { loadInbox, tallyCounts } from '../../apps/admin/src/lib/inbox.ts';
import {
  handleReply,
  inquiryFilterFrom,
  loadInquiries,
  outcomeFrom as replyOutcome,
} from '../../apps/admin/src/lib/participation.ts';
import {
  handleCatalogForm,
  handleEventForm,
  handleOrganizationForm,
  outcomeFrom,
} from '../../apps/admin/src/lib/live-admin.ts';
import {
  getAdminOrganization,
  listAdminCatalog,
  listAdminOrganizations,
  listPendingEvents,
} from '../../packages/domain/src/live/admin.ts';
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

const PHONE = 'f3a9c1d27b6e48a0951c7d2e8b4a6f10c3d5e7a9b1c2d3e4';
const phoneEnv = {
  ENVIRONMENT: 'local',
  ADMIN_EMAIL: ADMIN,
  ALLOW_LOCAL_ADMIN_IDENTITY: 'true',
  GAMO_DEV_PHONE_TOKEN: PHONE,
};
const PHONE_HOST = 'http://192.168.1.20:4326';
const cookieFrom = (setCookie: string) => setCookie.split(';')[0]!;

async function runMiddleware(
  env: Record<string, unknown>,
  target: string,
  init: RequestInit = {},
): Promise<{ response: Response; reached: boolean }> {
  const { onRequest } = await import('../../apps/admin/src/middleware.ts');
  const request = new Request(target, init);
  let reached = false;
  const response = (await onRequest(
    { request, url: new URL(request.url), params: {}, locals: { runtime: { env } } } as never,
    (async () => {
      reached = true;
      return new Response('page');
    }) as never,
  )) as Response;
  return { response, reached };
}

test('phone access: a valid ?phone= secret on a private-network host redirects to the clean path and sets the cookie', async () => {
  const { request, url } = at(`${PHONE_HOST}/review/events?status=open&phone=${PHONE}&page=2`);
  const result = await checkGate(request, phoneEnv, url);
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.status === 303);
  if (result.ok || result.status !== 303) return;
  assert.equal(result.location, '/review/events?status=open&page=2');
  assert.ok(!result.location.includes(PHONE) && !result.location.includes('phone'));
  assert.match(result.setCookie, /^gamo_dev_phone=[0-9a-f]{64}; /);
  assert.ok(!result.setCookie.includes(PHONE), 'the cookie is not the secret from the link');
  for (const part of ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=28800'])
    assert.ok(result.setCookie.includes(part), part);
  assert.ok(!/secure/i.test(result.setCookie), 'the link is http: a Secure cookie would never be stored');
  // A path that starts with slashes cannot turn the redirect into another site.
  const sneaky = at(`${PHONE_HOST}//evil.example/x?phone=${PHONE}`);
  const sneakyResult = await checkGate(sneaky.request, phoneEnv, sneaky.url);
  assert.ok(!sneakyResult.ok && sneakyResult.status === 303 && sneakyResult.location === '/evil.example/x');
});

test('phone access: the cookie from the redirect then gets in, as ADMIN_EMAIL, on any path and method', async () => {
  const first = await runMiddleware(phoneEnv, `${PHONE_HOST}/legal?phone=${PHONE}`);
  assert.equal(first.reached, false, 'the redirect itself serves no page');
  assert.equal(first.response.status, 303);
  assert.equal(first.response.headers.get('location'), '/legal');
  assert.equal(await first.response.text(), '');
  assert.equal(first.response.headers.get('cache-control'), 'no-store');
  const cookie = cookieFrom(first.response.headers.get('set-cookie') ?? '');
  for (const method of ['GET', 'POST']) {
    const next = await runMiddleware(phoneEnv, `${PHONE_HOST}/legal`, {
      method,
      headers: { cookie: `a=b; ${cookie}; c=d` },
    });
    assert.equal(next.reached, true, method);
    assert.equal(next.response.status, 200, method);
  }
  const { request, url } = at(`${PHONE_HOST}/`, { cookie });
  assert.deepEqual(await checkGate(request, phoneEnv, url), { ok: true, email: ADMIN });
});

test('phone access: anything without the exact secret is denied with 403 and no content, never saying why', async () => {
  const good = cookieFrom(
    (await runMiddleware(phoneEnv, `${PHONE_HOST}/?phone=${PHONE}`)).response.headers.get('set-cookie') ?? '',
  );
  const wrongSecret = `${PHONE.slice(0, -1)}0`;
  const attempts: [string, string, RequestInit][] = [
    ['no secret', `${PHONE_HOST}/`, {}],
    ['wrong secret', `${PHONE_HOST}/?phone=${wrongSecret}`, {}],
    ['empty secret', `${PHONE_HOST}/?phone=`, {}],
    ['prefix of the secret', `${PHONE_HOST}/?phone=${PHONE.slice(0, 20)}`, {}],
    ['secret plus extra', `${PHONE_HOST}/?phone=${PHONE}x`, {}],
    ['secret under another name', `${PHONE_HOST}/?token=${PHONE}`, {}],
    ['wrong cookie', `${PHONE_HOST}/`, { headers: { cookie: 'gamo_dev_phone=deadbeef' } }],
    ['the raw secret as cookie', `${PHONE_HOST}/`, { headers: { cookie: `gamo_dev_phone=${PHONE}` } }],
    [
      'cookie of another name',
      `${PHONE_HOST}/`,
      { headers: { cookie: good.replace('gamo_dev_phone', 'other') } },
    ],
    [
      'secret in a header',
      `${PHONE_HOST}/`,
      { headers: { 'x-gamo-dev-phone': PHONE, authorization: `Bearer ${PHONE}` } },
    ],
    ['10.x host, no secret', 'http://10.0.0.5:4326/', {}],
    ['172.16 host, no secret', 'http://172.16.4.2:4326/', {}],
    ['a .local name, no secret', 'http://macbook.local:4326/', {}],
  ];
  for (const [name, target, init] of attempts) {
    const { response, reached } = await runMiddleware(phoneEnv, target, init);
    assert.equal(reached, false, name);
    assert.equal(response.status, 403, name);
    assert.equal(response.headers.get('location'), null, name);
    assert.ok(!response.headers.get('set-cookie'), name);
    const body = await response.text();
    assert.ok(
      !body.includes(PHONE) && !/phone|secret|token/i.test(body),
      `${name}: the answer reveals nothing`,
    );
  }
  // The cookie of one run is worthless against the next run's secret.
  const next = await runMiddleware({ ...phoneEnv, GAMO_DEV_PHONE_TOKEN: 'e'.repeat(48) }, `${PHONE_HOST}/`, {
    headers: { cookie: good },
  });
  assert.equal(next.response.status, 403);
});

test('phone access: a spoofed loopback Host header cannot skip the secret, and a short secret opens nothing', async () => {
  // While the admin is on the network the Host header proves nothing, so the local identity needs the secret too.
  for (const host of ['http://127.0.0.1:4326', 'http://localhost:4326']) {
    const without = await runMiddleware(phoneEnv, `${host}/`);
    assert.equal(without.reached, false, host);
    assert.equal(without.response.status, 403, host);
    const withSecret = await runMiddleware(phoneEnv, `${host}/?phone=${PHONE}`);
    assert.equal(withSecret.response.status, 303, host);
  }
  const short = { ...phoneEnv, GAMO_DEV_PHONE_TOKEN: 'abc' };
  for (const target of [
    `${PHONE_HOST}/?phone=abc`,
    'http://127.0.0.1:4326/?phone=abc',
    'http://127.0.0.1:4326/',
  ]) {
    const { response, reached } = await runMiddleware(short, target);
    assert.equal(reached, false, target);
    assert.equal(response.status, 403, target);
  }
});

test('phone access: the redirect is only for GET with a valid secret', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const valid = await runMiddleware(phoneEnv, `${PHONE_HOST}/legal?phone=${PHONE}`, { method });
    assert.equal(valid.reached, false, method);
    assert.equal(valid.response.status, 403, method);
    assert.equal(valid.response.headers.get('location'), null, method);
    assert.ok(!valid.response.headers.get('set-cookie'), method);
  }
  const wrong = await runMiddleware(phoneEnv, `${PHONE_HOST}/legal?phone=nope`);
  assert.equal(wrong.response.status, 403);
  assert.equal(wrong.response.headers.get('location'), null);
});

test('phone access is off everywhere else: public hosts, preview, production, no token; loopback is unchanged', async () => {
  const q = `?phone=${PHONE}`;
  const denied: [string, Record<string, unknown>, string][] = [
    ['public host', phoneEnv, `https://admin.gamostudio.org/${q}`],
    ['lookalike private name', phoneEnv, `http://192.168.1.20.evil.example/${q}`],
    ['172.32 is public', phoneEnv, `http://172.32.0.1:4326/${q}`],
    ['public IP', phoneEnv, `http://8.8.8.8:4326/${q}`],
    ['preview', { ...phoneEnv, ENVIRONMENT: 'preview' }, `${PHONE_HOST}/${q}`],
    ['production', { ...phoneEnv, ENVIRONMENT: 'production' }, `${PHONE_HOST}/${q}`],
    ['no token configured', { ...phoneEnv, GAMO_DEV_PHONE_TOKEN: undefined }, `${PHONE_HOST}/${q}`],
    ['empty token', { ...phoneEnv, GAMO_DEV_PHONE_TOKEN: '  ' }, `${PHONE_HOST}/${q}`],
    ['no token, empty secret', { ...phoneEnv, GAMO_DEV_PHONE_TOKEN: undefined }, `${PHONE_HOST}/?phone=`],
  ];
  for (const [name, env, target] of denied) {
    const { response, reached } = await runMiddleware(env, target);
    assert.equal(reached, false, name);
    assert.ok([401, 403, 503].includes(response.status), `${name}: ${response.status}`);
    assert.equal(response.headers.get('location'), null, name);
    assert.ok(!response.headers.get('set-cookie'), name);
  }
  // Production never honors the cookie either.
  const cookie = cookieFrom(
    (await runMiddleware(phoneEnv, `${PHONE_HOST}/?phone=${PHONE}`)).response.headers.get('set-cookie') ?? '',
  );
  const inProd = await runMiddleware(
    { ...prod, GAMO_DEV_PHONE_TOKEN: PHONE },
    'https://admin.example.test/',
    {
      headers: { cookie },
    },
  );
  assert.equal(inProd.reached, false);
  assert.ok([401, 403, 503].includes(inProd.response.status));

  // Without a token, loopback is exactly what it was: the local identity, no cookie, no redirect.
  const local = { ENVIRONMENT: 'local', ADMIN_EMAIL: ADMIN, ALLOW_LOCAL_ADMIN_IDENTITY: 'true' };
  for (const target of ['http://127.0.0.1:4326/', `http://127.0.0.1:4326/${q}`, 'http://localhost:4326/']) {
    const ok = await runMiddleware(local, target);
    assert.equal(ok.reached, true, target);
    assert.equal(ok.response.status, 200, target);
    assert.ok(!ok.response.headers.get('set-cookie'), target);
  }
  // A private host without a token is refused as before (the flag alone never opens the network).
  const lan = await runMiddleware(local, `${PHONE_HOST}/`);
  assert.equal(lan.reached, false);
  assert.equal(lan.response.status, 401);
});

test('phone access: the secret is never logged', async () => {
  const logged: string[] = [];
  const originals = [console.log, console.error, console.warn, console.info];
  console.log =
    console.error =
    console.warn =
    console.info =
      (...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      };
  try {
    await runMiddleware(phoneEnv, `${PHONE_HOST}/?phone=${PHONE}`);
    await runMiddleware(phoneEnv, `${PHONE_HOST}/?phone=wrong`);
  } finally {
    [console.log, console.error, console.warn, console.info] = originals as [
      typeof console.log,
      typeof console.error,
      typeof console.warn,
      typeof console.info,
    ];
  }
  assert.ok(!logged.join('\n').includes(PHONE));
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

/** Gamo Live's own database with its migrations, as the admin binds it (LIVE_DB). */
async function liveMigrated() {
  const d1 = createSqliteD1();
  const dir = join('packages/db/live/migrations');
  for (const name of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await d1.exec(readFileSync(join(dir, name), 'utf8'));
  return d1;
}

test('the Inbox counts and the waiting list come from the databases, and nothing else', async () => {
  const d1 = await migrated();
  const live = await liveMigrated();
  assert.deepEqual(await loadInbox({ DB: d1, LIVE_DB: live }), {
    counts: { participation: 0, churches: 0, providers: 0, events: 0, organizations: 0, catalog: 0 },
    oldest: [],
    liveAvailable: true,
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
  live.sqlite.exec(
    `INSERT INTO organizations (id,name,slug,kind,created_at,updated_at) VALUES ('g1','Sample Org','sample-org','church',${now - 900},${now - 900}), ('g2','Sample Verified Org','sample-verified','church',${now},${now})`,
  );
  live.sqlite.exec(`UPDATE organizations SET verified_at = ${now} WHERE id = 'g2'`);
  live.sqlite.exec(
    `INSERT INTO venues (id,name,city,state,timezone) VALUES ('v1','Hall','Phoenix','AZ','America/Phoenix')`,
  );
  live.sqlite
    .exec(`INSERT INTO events (id,organization_id,origin,slug,title,category,venue_id,timezone,admission,external_url,status,created_at,updated_at) VALUES
    ('e1','g1','organizer','sample-pending','Sample Pending Event','concert','v1','America/Phoenix','free_open',NULL,'pending_review',${now - 300},${now - 300}),
    ('e2','g1','organizer','sample-published','Sample Published Event','concert','v1','America/Phoenix','free_open',NULL,'published',${now},${now}),
    ('c1',NULL,'catalog','sample-catalog','Sample Catalog Listing','concert','v1','America/Phoenix','external_tickets','https://tickets.example.invalid/x','pending_review',${now - 100},${now - 100})`);
  run(
    `INSERT INTO users (id,email,verified_email_at,status,created_at) VALUES ('u1','v@example.invalid',${now},'active',${now})`,
  );
  run(`INSERT INTO participation_inquiries (id,user_id,kind,interest,name,message,status,created_at) VALUES
    ('i1','u1','general','Worship','Sample Visitor','Sample message one',  'pending',${now - 500}),
    ('i2','u1','general','Worship','Sample Visitor','Sample message two',  'reviewed',${now}),
    ('i3','u1','general','Academy','Sample Visitor','Sample message three','closed',${now})`);
  const inbox = await loadInbox({ DB: d1, LIVE_DB: live });
  assert.deepEqual(inbox?.counts, {
    participation: 1,
    churches: 1,
    providers: 2,
    events: 1,
    organizations: 1,
    catalog: 1,
  });
  // Oldest first, only what is waiting, labeled by queue.
  assert.deepEqual(
    inbox?.oldest.map((i) => [i.title, i.kind]),
    [
      ['Sample Org', 'Organization verification'],
      ['Worship · Sample Visitor', 'Participation request'],
      ['Sample Church', 'Church verification'],
      ['Sample Pending Event', 'Event review'],
      ['Sample Musician', 'Provider review'],
      ['Sample Teacher', 'Provider review'],
    ].slice(0, 5),
  );
  assert.equal((await loadInbox({ DB: d1, LIVE_DB: live }, 2))?.oldest.length, 2);
  // Gamo Live unreachable: its cards are left out and the rest still shows.
  const originalError = console.error;
  console.error = () => {};
  try {
    const without = await loadInbox({ DB: d1 });
    assert.equal(without?.liveAvailable, false);
    assert.deepEqual(without?.counts, {
      participation: 1,
      churches: 1,
      providers: 2,
      events: 0,
      organizations: 0,
      catalog: 0,
    });
  } finally {
    console.error = originalError;
  }
});

test('the Inbox is null (a visible error, not zeros) when the database cannot be read', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await loadInbox({}), null);
    assert.equal(
      await loadInbox({
        DB: {
          prepare: () => {
            throw new Error('down');
          },
          batch: async () => [],
        },
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
      organizations: 0,
      catalog: 0,
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

test('Gamo Live event review: list, decisions, conflicts, notes, and the first approval', async () => {
  const live = await liveMigrated();
  const now = Math.floor(Date.now() / 1000);
  live.sqlite.exec(
    `INSERT INTO organizations (id,name,slug,kind) VALUES ('g1','Sample Org','sample-org','church')`,
  );
  live.sqlite.exec(
    `INSERT INTO venues (id,name,city,state,timezone) VALUES ('v1','Hall','Phoenix','AZ','America/Phoenix')`,
  );
  const event = (id: string, title: string, status: string, created: number, startsAt = now + 86_400) =>
    live.sqlite
      .exec(`INSERT INTO events (id,organization_id,origin,slug,title,category,description,venue_id,timezone,admission,status,created_at,updated_at)
      VALUES ('${id}','g1','organizer','${id}','${title}','concert','A sample event description.','v1','America/Phoenix','free_open','${status}',${created},${created});
      INSERT INTO event_occurrences (id,event_id,starts_at) VALUES ('o_${id}','${id}',${startsAt});`);
  event('e_old', 'Sample Older Event', 'pending_review', now - 500);
  event('e_new', 'Sample Newer Event', 'pending_review', now - 100);
  event('e_past', 'Sample Past Event', 'pending_review', now - 50, now - 3600);
  event('e_live', 'Sample Published Event', 'published', now);
  const env = { LIVE_DB: live, ENVIRONMENT: 'local' } as never;
  const post = (fields: Record<string, string>, origin = 'http://127.0.0.1:4326') =>
    new Request('http://127.0.0.1:4326/events', {
      method: 'POST',
      headers: { origin },
      body: new URLSearchParams(fields),
    });

  const listed = await listPendingEvents(live);
  assert.deepEqual(
    listed.map((e) => [e.title, e.reason]),
    [
      ['Sample Older Event', 'first_event'],
      ['Sample Newer Event', 'first_event'],
      ['Sample Past Event', 'first_event'],
    ],
  );

  assert.deepEqual(
    await handleEventForm(post({ event_id: 'e_old', decision: 'approved' }, 'https://evil.example'), env),
    {
      ok: false,
      status: 403,
      message: 'That request came from another site and was refused.',
    },
  );
  const noNote = await handleEventForm(post({ event_id: 'e_old', decision: 'rejected' }), env);
  assert.equal(!noNote.ok && noNote.status, 400);
  assert.equal((await handleEventForm(post({ event_id: 'e_old', decision: 'maybe' }), env)).ok, false);
  const pastApproval = await handleEventForm(post({ event_id: 'e_past', decision: 'approved' }), env);
  assert.equal(
    !pastApproval.ok && pastApproval.status,
    409,
    'an event whose dates have all passed cannot be approved',
  );

  const approved = await handleEventForm(post({ event_id: 'e_old', decision: 'approved' }), env);
  assert.deepEqual(approved, { ok: true, location: '/events?done=approved&first=1&emailed=no' });
  assert.equal(
    outcomeFrom(new URL('http://x/events?done=approved&first=1&emailed=no')),
    'Event approved and published. This was the organization’s first approved event. The owners could not be emailed; tell them directly if they need to act.',
  );
  assert.equal(outcomeFrom(new URL('http://x/events?done=<script>')), null);
  assert.equal(
    (live.sqlite.prepare("SELECT status FROM events WHERE id = 'e_old'").get() as { status: string }).status,
    'published',
  );
  const again = await handleEventForm(post({ event_id: 'e_old', decision: 'rejected', notes: 'late' }), env);
  assert.equal(!again.ok && again.status, 409);
  const missing = await handleEventForm(post({ event_id: 'e_nope', decision: 'approved' }), env);
  assert.equal(!missing.ok && missing.status, 404);

  // The organization is now approved: later events are not "first events" any more.
  assert.equal((await listPendingEvents(live))[0].reason, 'every_event');
  const changes = await handleEventForm(
    post({ event_id: 'e_new', decision: 'changes_requested', notes: 'Add the address.' }),
    env,
  );
  assert.deepEqual(changes, { ok: true, location: '/events?done=changes_requested&emailed=no' });

  const rows = live.sqlite
    .prepare(
      "SELECT subject_id, decision, note FROM review_decisions WHERE subject_type = 'event' ORDER BY rowid",
    )
    .all() as Record<string, unknown>[];
  assert.deepEqual(
    rows.map((r) => [r.subject_id, r.decision, r.note]),
    [
      ['e_old', 'approved', null],
      ['e_new', 'changes_requested', 'Add the address.'],
    ],
  );
  assert.equal(
    (
      live.sqlite
        .prepare('SELECT COUNT(*) AS n FROM organizations WHERE first_event_approved_at IS NOT NULL')
        .get() as { n: number }
    ).n,
    1,
  );
});

test('Gamo Live organizations: verify, suspend (note required), the review switch, and the history', async () => {
  const live = await liveMigrated();
  const now = Math.floor(Date.now() / 1000);
  live.sqlite.exec(
    `INSERT INTO organizations (id,name,slug,kind,created_at,updated_at) VALUES ('g1','Sample Org','sample-org','church',${now},${now}), ('g2','Another Org','another','ministry',${now},${now})`,
  );
  live.sqlite.exec(
    `INSERT INTO venues (id,name,city,state,timezone) VALUES ('v1','Hall','Phoenix','AZ','America/Phoenix')`,
  );
  live.sqlite.exec(
    `INSERT INTO events (id,organization_id,origin,slug,title,category,venue_id,timezone,admission,status) VALUES ('e1','g1','organizer','e1','Sample Event','concert','v1','America/Phoenix','free_open','published')`,
  );
  const env = { LIVE_DB: live, ENVIRONMENT: 'local' } as never;
  const post = (fields: Record<string, string>, origin = 'http://127.0.0.1:4326') =>
    new Request('http://127.0.0.1:4326/organizations/g1', {
      method: 'POST',
      headers: { origin },
      body: new URLSearchParams(fields),
    });

  assert.deepEqual(
    (await listAdminOrganizations(live)).map((o) => o.name),
    ['Sample Org'],
    'waiting = has events, not verified',
  );
  assert.equal((await listAdminOrganizations(live, { filter: 'all' })).length, 2);
  assert.equal(
    (await handleOrganizationForm(post({ action: 'verify' }, 'https://evil.example'), env, 'g1')).ok,
    false,
  );
  assert.deepEqual(
    await handleOrganizationForm(post({ action: 'verify', notes: 'Visited in person.' }), env, 'g1'),
    {
      ok: true,
      location: '/organizations/g1?done=verified',
    },
  );
  assert.deepEqual(
    (await listAdminOrganizations(live)).map((o) => o.name),
    [],
  );
  const noNote = await handleOrganizationForm(post({ action: 'suspend' }), env, 'g1');
  assert.equal(!noNote.ok && noNote.status, 400);
  assert.deepEqual(
    await handleOrganizationForm(post({ action: 'suspend', notes: 'Reported misuse.' }), env, 'g1'),
    {
      ok: true,
      location: '/organizations/g1?done=suspended',
    },
  );
  assert.equal((await handleOrganizationForm(post({ action: 'review_on' }), env, 'g1')).ok, true);
  assert.equal((await handleOrganizationForm(post({ action: 'review_on' }), env, 'g_nope')).ok, false);
  assert.equal((await handleOrganizationForm(post({ action: 'dance' }), env, 'g1')).ok, false);
  const detail = await getAdminOrganization(live, 'g1');
  assert.equal(detail?.status, 'suspended');
  assert.equal(detail?.verified, true);
  assert.equal(detail?.reviewEveryEvent, true);
  assert.deepEqual(detail?.decisions.map((d) => d.decision).reverse(), ['verified', 'suspended']);
  await handleOrganizationForm(post({ action: 'reinstate' }), env, 'g1');
  assert.equal((await getAdminOrganization(live, 'g1'))?.status, 'active');
  assert.equal(await getAdminOrganization(live, 'g_nope'), null);
});

test('Gamo Live catalog: approve, hide and feature; listings that failed the editorial rules stay out', async () => {
  const live = await liveMigrated();
  live.sqlite.exec(
    `INSERT INTO venues (id,name,city,state,timezone) VALUES ('v1','Hall','Phoenix','AZ','America/Phoenix')`,
  );
  live.sqlite
    .exec(`INSERT INTO events (id,origin,slug,title,category,venue_id,timezone,admission,external_url,status) VALUES
    ('c1','catalog','c1','Sample Listing','concert','v1','America/Phoenix','external_tickets','https://tickets.example.invalid/1','pending_review'),
    ('c2','catalog','c2','Sample Rejected Listing','concert','v1','America/Phoenix','external_tickets','https://tickets.example.invalid/2','rejected')`);
  const env = { LIVE_DB: live, ENVIRONMENT: 'local' } as never;
  const post = (fields: Record<string, string>, origin = 'http://127.0.0.1:4326') =>
    new Request('http://127.0.0.1:4326/catalog', {
      method: 'POST',
      headers: { origin },
      body: new URLSearchParams(fields),
    });
  assert.equal(
    (await handleCatalogForm(post({ event_id: 'c1', action: 'publish' }, 'https://evil.example'), env)).ok,
    false,
  );
  assert.deepEqual(
    (await listAdminCatalog(live)).map((r) => [r.title, r.status]),
    [
      ['Sample Listing', 'pending_review'],
      ['Sample Rejected Listing', 'rejected'],
    ],
  );
  const rejected = await handleCatalogForm(post({ event_id: 'c2', action: 'publish' }), env);
  assert.equal(!rejected.ok && rejected.status, 409);
  const notYet = await handleCatalogForm(post({ event_id: 'c1', action: 'feature' }), env);
  assert.equal(!notYet.ok && notYet.status, 409, 'only published listings can be featured');
  assert.deepEqual(await handleCatalogForm(post({ event_id: 'c1', action: 'publish' }), env), {
    ok: true,
    location: '/catalog?done=listing_published',
  });
  assert.deepEqual(await handleCatalogForm(post({ event_id: 'c1', action: 'feature' }), env), {
    ok: true,
    location: '/catalog?done=featured_on',
  });
  assert.equal((await listAdminCatalog(live)).find((r) => r.id === 'c1')?.featured, true);
  assert.deepEqual(await handleCatalogForm(post({ event_id: 'c1', action: 'hide' }), env), {
    ok: true,
    location: '/catalog?done=listing_hidden',
  });
  assert.deepEqual(await handleCatalogForm(post({ event_id: 'c1', action: 'publish' }), env), {
    ok: true,
    location: '/catalog?done=listing_published',
  });
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

test('every page renders through AdminLayout; no public layout, demo shell or sessions', () => {
  for (const { path, text } of sources()) {
    // ProfilePage renders its own AdminLayout (church and provider profiles share it).
    if (path.includes('/pages/') && path.endsWith('.astro'))
      assert.match(text, /<AdminLayout\b|<ProfilePage\b/, `${path} does not render through AdminLayout`);
    assert.ok(
      !/components\/BaseLayout|components\/SiteHeader|components\/SiteFooter|components\/dashboard\/|lib\/dashboard|DEMO_PERSONA|WorkspaceScreen/.test(
        text,
      ),
      `${path} imports the public layout or the demo shell`,
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

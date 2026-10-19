import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import {
  IdentityService,
  LiveService,
  AdminService,
  createEventSchema,
  handleApiError,
  orderVerificationCode,
  readConfirmToken,
  svixSignature,
  getTermsDocument,
} from '../../packages/domain/index.ts';
import { createSession } from '../../packages/auth/index.ts';
import { validateContract } from '../../packages/api-contracts/src/runtime.ts';
import { onRequest } from '../../apps/admin/src/middleware.ts';
import { LOCAL_TURNSTILE, signupTerms } from '../audit/auth-test-kit.ts';
const spec = JSON.parse(readFileSync('openapi/bundled/internal.json', 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', ...spec });
const d1 = createInMemoryD1();
const db = createDb(d1);
const services = {
  identity: new IdentityService(db),
  live: new LiveService(db),
  admin: new AdminService(db),
};
const secret = 'contract-test-session-signing-material-only';
const env: Record<string, unknown> = {
  DB: d1,
  ENVIRONMENT: 'local',
  SESSION_SECRET: secret,
  ALLOW_DEMO_SESSION: 'true',
  ALLOW_AUTH_SIMULATION: 'true',
  STRIPE_SECRET_KEY: 'mock_test_key',
  STRIPE_WEBHOOK_SECRET: 'contract-test-webhook-material',
  STRIPE_TEST_CHECKOUT: 'true',
  RESEND_WEBHOOK_SECRET: 'whsec_Y29udHJhY3QtdGVzdC1yZXNlbmQtd2ViaG9vaw==',
  RESEND_API_KEY: 're_mock_contract',
  ENABLE_BREAK_GLASS_AUTH: 'true',
  ADMIN_ACCESS_TOKEN: 'contract-test-emergency-material',
};
const servers: Server[] = [];
const origins: Record<string, string> = {};
const covered = new Set<string>();
const nativeFetch = globalThis.fetch;
let eventId: string, orgId: string, cookie: string, otherCookie: string, staffCookie: string;
const input = {
  organizationId: 'placeholder',
  title: 'Sample Christian community gathering',
  category: 'worship',
  description: 'A sample Christian gathering for isolated contract tests.',
  venueName: 'Sample venue',
  city: 'Phoenix',
  state: 'AZ',
  startsAt: '2026-12-15T18:00:00+00:00',
  timezone: 'America/Phoenix',
  tiers: [{ name: 'Free admission', priceCents: 0, capacity: 100 }],
};
before(async () => {
  globalThis.fetch = ((url: any, options: any) => {
    const host = new URL(typeof url === 'string' ? url : (url.url ?? url.toString())).hostname;
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(host),
      'Contract tests must never call external endpoints.',
    );
    return nativeFetch(url, options);
  }) as typeof fetch;
  await applyMigrations(
    d1,
    readdirSync('packages/db/migrations')
      .filter((x) => x.endsWith('.sql'))
      .sort()
      .map((x) => readFileSync(`packages/db/migrations/${x}`, 'utf8')),
  );
  d1.sqlite.exec('PRAGMA foreign_keys=ON');
  const owner = await services.identity.findOrCreateUser('owner@example.invalid', 'Sample owner');
  d1.sqlite
    .prepare('UPDATE users SET verified_email_at = ? WHERE id = ?')
    .run(Math.floor(Date.now() / 1000), owner.id);
  const other = await services.identity.findOrCreateUser('other@example.invalid');
  // Explicit internal demo reviewer matches existing fallback; does not claim Access-to-D1 identity mapping.
  d1.sqlite
    .prepare('INSERT INTO users (id,email,status,created_at) VALUES (?,?,?,?)')
    .run('staff_reviewer_demo', 'reviewer@example.invalid', 'active', Math.floor(Date.now() / 1000));
  await services.identity.assignSystemRole('staff_reviewer_demo', 'staff_reviewer');
  staffCookie = `__session=${encodeURIComponent((await createSession(db, 'staff_reviewer_demo', secret)).cookieValue)}`;
  orgId = (
    await services.identity.createOrganization('Sample ministry', 'contract-ministry', 'church', owner.id)
  ).id;
  input.organizationId = orgId;
  // Live private APIs require a Gamo Live product account (created by signing up through Live).
  for (const id of [owner.id, other.id]) await services.identity.ensureProductAccount(id, 'live');
  cookie = `__session=${encodeURIComponent((await createSession(db, owner.id, secret)).cookieValue)}`;
  otherCookie = `__session=${encodeURIComponent((await createSession(db, other.id, secret)).cookieValue)}`;
  for (const app of ['web', 'live', 'admin', 'worship', 'academy', 'production']) {
    const operations: any[] = [];
    for (const [path, item] of Object.entries<any>(spec.paths))
      for (const [method, op] of Object.entries<any>(item))
        if (
          op.operationId &&
          (op['x-application'] === app || op['x-replicated-applications']?.includes(app))
        ) {
          const module = await import(
            `../../${op['x-source'].replace(`apps/${op['x-application']}/`, `apps/${app}/`)}`
          );
          operations.push({
            path,
            method,
            op,
            handler: module[method.toUpperCase()],
            regex: new RegExp('^' + path.replace('{id}', '([^/]+)') + '$'),
          });
        }
    const server = createServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const url = new URL(req.url!, origins[app]);
        const route = operations.find(
          (x) => x.method === req.method!.toLowerCase() && x.regex.test(url.pathname),
        );
        assert.ok(route, `Unknown ${app} route ${req.url}`);
        const match = url.pathname.match(route.regex);
        const request = new Request(url, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        });
        const context: any = {
          request,
          params: { id: match?.[1] },
          locals: {
            runtime: {
              env: {
                ...env,
                ...(req.headers['x-contract-production']
                  ? { ENVIRONMENT: 'production', ALLOW_DEMO_SESSION: 'false' }
                  : {}),
                ...(req.headers['x-contract-no-resend'] ? { RESEND_WEBHOOK_SECRET: undefined } : {}),
              },
            },
          },
          redirect: (location: string, status: number) =>
            new Response(null, { status, headers: { Location: location } }),
        };
        const next = () => route.handler(context);
        const response: Response = app === 'admin' ? await onRequest(context, next) : await next();
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      } catch (error) {
        res.writeHead(599);
        res.end(String(error));
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    origins[app] = `http://127.0.0.1:${(server.address() as any).port}`;
  }
});
after(async () => {
  globalThis.fetch = nativeFetch;
  for (const server of servers) await new Promise<void>((resolve) => server.close(() => resolve()));
  d1.sqlite.close();
  console.log(
    `Contract coverage: ${covered.size} application operations over loopback HTTP. Astro routing/edge behavior remains separate verification.`,
  );
});
async function call(
  app: string,
  method: string,
  path: string,
  expected: number,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(origins[app] + path, {
    method,
    redirect: 'manual',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await response.text();
  assert.equal(response.status, expected, text);
  const template = Object.keys(spec.paths)
    .filter(
      (x) =>
        spec.paths[x][method.toLowerCase()]?.['x-application'] === app ||
        spec.paths[x][method.toLowerCase()]?.['x-replicated-applications']?.includes(app),
    )
    .sort((a, b) => Number(a.includes('{')) - Number(b.includes('{')))
    .find((x) => new RegExp('^' + x.replace('{id}', '[^/]+') + '$').test(path.split('?')[0]))!;
  const operation = spec.paths[template][method.toLowerCase()];
  covered.add(`${app}:${operation.operationId}`);
  let declared = operation.responses[String(expected)];
  if (declared.$ref)
    declared = declared.$ref
      .split('/')
      .slice(1)
      .reduce((x: any, k: string) => x[k], spec);
  for (const [name, header] of Object.entries<any>(declared.headers ?? {})) {
    const value = response.headers.get(name);
    if (header.schema?.const) assert.equal(value, header.schema.const);
  }
  let parsed: any;
  if (declared.content) {
    const type = response.headers.get('content-type')?.split(';')[0];
    assert.ok(declared.content[type!], `Undocumented content type: ${type}`);
    parsed = type === 'application/json' ? JSON.parse(text) : text;
    const schema = structuredClone(declared.content[type!].schema);
    const rewrite = (x: any): any =>
      Array.isArray(x)
        ? x.map(rewrite)
        : x && typeof x === 'object'
          ? Object.fromEntries(
              Object.entries(x).map(([k, v]) => [k, k === '$ref' ? `contract${v}` : rewrite(v)]),
            )
          : x;
    const validate = ajv.compile(rewrite(schema));
    assert.ok(validate(parsed), JSON.stringify(validate.errors));
  }
  return { body: parsed, response };
}
test('session creation is explicitly local-only; invalid JSON, fields and media type denied', async () => {
  const good = await call('web', 'POST', '/api/auth/session', 200, { email: 'demo@example.invalid' });
  assert.match(good.response.headers.get('set-cookie')!, /HttpOnly/);
  assert.doesNotMatch(good.response.headers.get('set-cookie')!, /Domain=/i);
  await call(
    'web',
    'POST',
    '/api/auth/session',
    403,
    { email: 'owner@example.invalid' },
    { 'x-contract-production': '1' },
  );
  await call('web', 'POST', '/api/auth/session', 400, { email: 'invalid' });
  await call('web', 'POST', '/api/auth/session', 400, { email: 'demo@example.invalid', role: 'superadmin' });
  await call('web', 'POST', '/api/auth/session', 400, '{');
  await call(
    'web',
    'POST',
    '/api/auth/session',
    400,
    { email: 'demo@example.invalid' },
    { 'Content-Type': 'text/plain' },
  );
  const logout = await call('web', 'DELETE', '/api/auth/session', 200, undefined, {
    cookie: good.response.headers.get('set-cookie')!.split(';')[0],
  });
  assert.match(logout.response.headers.get('set-cookie')!, /1970/);
  assert.doesNotMatch(logout.response.headers.get('set-cookie')!, /Domain=/i);
  await call('web', 'DELETE', '/api/auth/session', 200);
});
test('verified email challenge, session inspection, organization onboarding, and staff provisioning contracts', async () => {
  await call('web', 'POST', '/api/auth/challenge', 400, { email: 'not-an-email', ...LOCAL_TURNSTILE });
  const challengeRes = await call('web', 'POST', '/api/auth/challenge', 200, {
    email: 'verified-leader@example.invalid',
    displayName: 'Verified Leader',
    intent: 'signup',
    ...LOCAL_TURNSTILE,
  });
  assert.equal(challengeRes.body.data.deliveryStatus, 'simulated');
  await call('web', 'POST', '/api/auth/verify', 401, {
    email: 'verified-leader@example.invalid',
    code: '000000',
  });
  // Issue fresh known challenge via service to verify HTTP verify route contract
  const issued = await services.identity.issueEmailChallenge('verified-leader@example.invalid', {
    product: 'web',
    intent: 'signup',
  });
  const verified = await call('web', 'POST', '/api/auth/verify', 200, {
    email: 'verified-leader@example.invalid',
    code: issued.code,
    displayName: 'Verified Leader',
    intent: 'signup',
    terms: signupTerms(),
  });
  assert.ok(verified.body.data.user.verifiedEmailAt);
  const verifiedCookie = verified.response.headers.get('set-cookie')!.split(';')[0];
  // Replay of consumed challenge must fail with 401
  await call('web', 'POST', '/api/auth/verify', 401, {
    email: 'verified-leader@example.invalid',
    code: issued.code,
  });
  await call('web', 'GET', '/api/auth/me', 401);
  const meBeforeOrg = await call('web', 'GET', '/api/auth/me', 200, undefined, { cookie: verifiedCookie });
  assert.equal(meBeforeOrg.body.data.user.email, 'verified-leader@example.invalid');
  // Unverified user session cannot create an organization (403)
  await call(
    'web',
    'POST',
    '/api/organizations',
    403,
    { name: 'Unverified Org', slug: 'unverified-org', type: 'church' },
    { cookie: otherCookie },
  );
  // Verified user can onboard an organization (201) and duplicate slug returns 409
  const createdOrg = await call(
    'web',
    'POST',
    '/api/organizations',
    201,
    { name: 'Grace Fellowship Ministry', slug: 'grace-fellowship-ministry', type: 'church' },
    { cookie: verifiedCookie },
  );
  assert.equal(createdOrg.body.data.membershipRole, 'owner');
  await call(
    'web',
    'POST',
    '/api/organizations',
    409,
    { name: 'Duplicate Slug Org', slug: 'grace-fellowship-ministry', type: 'ministry' },
    { cookie: verifiedCookie },
  );
  const meAfterOrg = await call('web', 'GET', '/api/auth/me', 200, undefined, { cookie: verifiedCookie });
  assert.equal(meAfterOrg.body.data.memberships.length, 1);
  assert.equal(meAfterOrg.body.data.memberships[0].organizationSlug, 'grace-fellowship-ministry');
  // Staff provisioning requires superadmin + Access boundary
  await call('admin', 'POST', '/api/staff/provision', 401, {
    email: 'new-reviewer@example.invalid',
    role: 'staff_reviewer',
    accessSubject: 'cf-sub-reviewer-1',
  });
  const reviewerHeaders = { authorization: `Bearer ${env.ADMIN_ACCESS_TOKEN}`, cookie: staffCookie };
  await call(
    'admin',
    'POST',
    '/api/staff/provision',
    403,
    { email: 'new-reviewer@example.invalid', role: 'staff_reviewer', accessSubject: 'cf-sub-reviewer-1' },
    reviewerHeaders,
  );
  const superUser = await services.identity.findOrCreateUser(
    'superadmin@example.invalid',
    'Sample Superadmin',
  );
  await services.identity.assignSystemRole(superUser.id, 'superadmin');
  const superCookie = `__session=${encodeURIComponent((await createSession(db, superUser.id, secret)).cookieValue)}`;
  const superHeaders = { authorization: `Bearer ${env.ADMIN_ACCESS_TOKEN}`, cookie: superCookie };
  const prov = await call(
    'admin',
    'POST',
    '/api/staff/provision',
    200,
    {
      email: 'new-reviewer@example.invalid',
      role: 'staff_reviewer',
      accessSubject: 'cf-sub-reviewer-1',
      displayName: 'Provisioned Reviewer',
    },
    superHeaders,
  );
  assert.equal(prov.body.data.accessSubject, 'cf-sub-reviewer-1');
  await call(
    'admin',
    'POST',
    '/api/staff/provision',
    409,
    { email: 'another-staff@example.invalid', role: 'staff_reviewer', accessSubject: 'cf-sub-reviewer-1' },
    superHeaders,
  );
});
test('event creation checks identity, membership and contract; draft details hidden', async () => {
  await call('live', 'POST', '/api/events', 401, input);
  await call('live', 'POST', '/api/events', 401, input, { 'x-demo-organizer': 'bypass' });
  await call('live', 'POST', '/api/events', 403, input, { cookie: otherCookie });
  await call('live', 'POST', '/api/events', 400, { ...input, startsAt: 1234 }, { cookie });
  await call('live', 'POST', '/api/events', 400, { ...input, timezone: 'Invalid/Timezone' }, { cookie });
  await call('live', 'POST', '/api/events', 400, { ...input, extra: true }, { cookie });
  const created = await call('live', 'POST', '/api/events', 201, input, { cookie });
  eventId = created.body.data.event.id;
  await call('live', 'GET', `/api/events/${eventId}`, 404);
  await call('live', 'GET', '/api/events/not-found', 404);
});
test('admin routes deny unauthenticated HTTP; documented boundary-only success with isolated reviewer', async () => {
  await call('admin', 'GET', '/api/events/pending', 401);
  await call('admin', 'POST', `/api/events/${eventId}/review`, 401, { decision: 'approved' });
  const headers = { authorization: `Bearer ${env.ADMIN_ACCESS_TOKEN}`, cookie: staffCookie };
  await call('admin', 'GET', '/api/events/pending', 403, undefined, { ...headers, cookie: otherCookie });
  const pending = await call('admin', 'GET', '/api/events/pending', 200, undefined, headers);
  assert.equal(pending.body.data.length, 1);
  await call('admin', 'POST', `/api/events/${eventId}/review`, 400, { decision: 'invalid' }, headers);
  await call('admin', 'POST', '/api/events/evt_missing/review', 404, { decision: 'approved' }, headers);
  await call('admin', 'POST', `/api/events/${eventId}/review`, 200, { decision: 'approved' }, headers);
  await call('live', 'GET', `/api/events/${eventId}`, 200);
  await call('live', 'GET', '/api/events?category=invalid', 400);
  await call('live', 'GET', '/api/events?category=', 400);
  await call('live', 'GET', '/api/events?city=', 400);
  await call('live', 'GET', '/api/events?city=Phoenix&city=Tucson', 400);
  await call('live', 'GET', '/api/events?city=X', 400);
  await call('live', 'GET', '/api/events?limit=0', 400);
  const listed = await call('live', 'GET', '/api/events?city=Phoenix&category=worship', 200);
  assert.equal(listed.body.data.length, 1);
});
const TURNSTILE = { 'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX' };
const TERMS = ['ticket-terms', 'privacy-policy'].map((slug) => ({
  slug,
  version: getTermsDocument(slug)!.version,
}));
let orderSeq = 0;
function orderBody(categoryId: string, email: string, quantity = 1, extra: Record<string, unknown> = {}) {
  orderSeq++;
  return {
    items: [{ categoryId, quantity }],
    purchaserName: 'Sample Buyer',
    email,
    emailConfirm: email,
    termsAccepted: true,
    termsDocuments: TERMS,
    idempotencyKey: `idem_contract_${orderSeq}_${'x'.repeat(12)}`,
    ...TURNSTILE,
    ...extra,
  };
}
let customerCookie = '';
let freeOrderId = '';
test('free RSVP: validation, sold-out counts, identical answers, email-code confirmation and customer cookie', async () => {
  const tierId = `tier_${eventId}_0`;
  await call('live', 'POST', `/api/events/${eventId}/register`, 400, {
    ...orderBody(tierId, 'no'),
    emailConfirm: 'no',
  });
  await call('live', 'POST', `/api/events/${eventId}/register`, 400, {
    ...orderBody(tierId, 'a@example.org'),
    extra: 1,
  });
  await call(
    'live',
    'POST',
    `/api/events/${eventId}/register`,
    400,
    orderBody('tier_missing', 'a@example.org'),
  );
  await call('live', 'POST', `/api/events/${eventId}/register`, 400, {
    ...orderBody(tierId, 'a@example.org'),
    termsAccepted: false,
  });
  await call('live', 'POST', `/api/events/${eventId}/register`, 400, orderBody(tierId, 'a@example.org', 11));
  await call('live', 'POST', '/api/events/evt_missing/register', 404, orderBody(tierId, 'a@example.org'));
  await call('live', 'POST', `/api/events/${eventId}/register`, 403, orderBody(tierId, 'cross@example.org'), {
    'sec-fetch-site': 'cross-site',
  });
  const body = orderBody(tierId, 'sample@example.invalid', 2);
  const first = await call('live', 'POST', `/api/events/${eventId}/register`, 202, body);
  const again = await call('live', 'POST', `/api/events/${eventId}/register`, 202, body);
  assert.equal(first.body.data.confirmToken, again.body.data.confirmToken);
  assert.equal(first.body.data.registration, undefined);
  // Wrong code, then the right one (derived with the local development key).
  freeOrderId = (await readConfirmToken(env, first.body.data.confirmToken, Math.floor(Date.now() / 1000)))!;
  const code = await orderVerificationCode(env, freeOrderId);
  await call('live', 'POST', '/api/orders/confirm', 400, {
    confirmToken: first.body.data.confirmToken,
    code: code === '000000' ? '111111' : '000000',
  });
  const confirmed = await call('live', 'POST', '/api/orders/confirm', 200, {
    confirmToken: first.body.data.confirmToken,
    code,
  });
  assert.equal(confirmed.body.data.ticketsIssued, 2);
  customerCookie = confirmed.response.headers.get('set-cookie')!.split(';')[0];
  assert.match(customerCookie, /^__gamo_customer_live=/);
  const replay = await call('live', 'POST', '/api/orders/confirm', 200, {
    confirmToken: first.body.data.confirmToken,
    code,
  });
  assert.equal(replay.body.data.ticketsIssued, 0);
  // Sold out answers 409 with remaining counts.
  const small = await services.live.createEvent(
    orgId,
    createEventSchema.parse({
      ...input,
      title: 'Sample small RSVP',
      tiers: [{ name: 'Only two', priceCents: 0, capacity: 2 }],
    }),
  );
  await services.admin.reviewEvent('staff_reviewer_demo', small.event.id, { decision: 'approved' });
  await call(
    'live',
    'POST',
    `/api/events/${small.event.id}/register`,
    202,
    orderBody(small.tiers[0].id, 'b1@example.org', 2),
  );
  const soldOut = await call(
    'live',
    'POST',
    `/api/events/${small.event.id}/register`,
    409,
    orderBody(small.tiers[0].id, 'b2@example.org', 1),
  );
  assert.deepEqual(
    soldOut.body.error.details.remaining.map((r: any) => r.remaining),
    [0],
  );
  await call('live', 'POST', `/api/events/${small.event.id}/waitlist`, 202, {
    email: 'b2@example.org',
    categoryId: small.tiers[0].id,
    quantity: 1,
    ...TURNSTILE,
  });
  await call('live', 'POST', `/api/events/${small.event.id}/waitlist`, 400, {
    email: 'b2@example.org',
    quantity: 50,
    ...TURNSTILE,
  });
});
let paidEventId = '';
let paidOrderId = '';
test('paid checkout: production always 503, local mock session, cross-origin refused, free total takes the free flow', async () => {
  const paid = await services.live.createEvent(
    orgId,
    createEventSchema.parse({
      ...input,
      title: 'Sample paid concert',
      admissionType: 'paid',
      tiers: [{ name: 'Seat', priceCents: 2500, capacity: 10 }],
    }),
  );
  await services.admin.reviewEvent('staff_reviewer_demo', paid.event.id, { decision: 'approved' });
  paidEventId = paid.event.id;
  const tierId = paid.tiers[0].id;
  await call('live', 'POST', '/api/checkout/session', 400, {});
  await call(
    'live',
    'POST',
    `/api/events/${paidEventId}/register`,
    400,
    orderBody(tierId, 'payer@example.org'),
  );
  const holdsBefore = (d1.sqlite.prepare('SELECT COUNT(*) AS n FROM ticket_holds').get() as any).n;
  const closed = await call(
    'live',
    'POST',
    '/api/checkout/session',
    503,
    { eventId: paidEventId, ...orderBody(tierId, 'payer@example.org') },
    { 'x-contract-production': '1' },
  );
  assert.match(closed.body.error.message, /not available|unavailable/);
  assert.equal((d1.sqlite.prepare('SELECT COUNT(*) AS n FROM ticket_holds').get() as any).n, holdsBefore);
  await call(
    'live',
    'POST',
    '/api/checkout/session',
    403,
    { eventId: paidEventId, ...orderBody(tierId, 'payer@example.org') },
    { origin: 'https://evil.example' },
  );
  const started = await call('live', 'POST', '/api/checkout/session', 200, {
    eventId: paidEventId,
    ...orderBody(tierId, 'payer@example.org', 2),
  });
  assert.equal(started.body.data.mock, true);
  assert.match(started.body.data.checkoutUrl, /\/local-test\/stripe-checkout\/cs_test_local_/);
  paidOrderId = started.body.data.orderId;
  assert.equal(
    (d1.sqlite.prepare('SELECT total_cents AS t FROM ticket_orders WHERE id = ?').get(paidOrderId) as any).t,
    5000,
  );
  const freeTotal = await call('live', 'POST', '/api/checkout/session', 202, {
    eventId,
    ...orderBody(`tier_${eventId}_0`, 'freebie@example.org'),
  });
  assert.equal(freeTotal.body.data.status, 'verification_required');
});
async function signed(event: any, expected = event.livemode ? 400 : 200) {
  const body = JSON.stringify(event),
    timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET as string),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
  return call('live', 'POST', '/api/webhook/stripe', expected, body, {
    'stripe-signature': `t=${timestamp},v1=${hex}`,
  });
}
test('webhook accepts real *.updated payloads that carry data.previous_attributes', async () => {
  await signed({
    id: 'evt_contract_updated',
    object: 'event',
    type: 'customer.updated',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: { id: 'cus_1', object: 'customer' }, previous_attributes: { email: null } },
  });
});
test('webhook verifies raw signature, rejects live events, accepts ignored test event and deduplicates', async () => {
  await call('live', 'POST', '/api/webhook/stripe', 400, {});
  await call('live', 'POST', '/api/webhook/stripe', 400, {}, { 'stripe-signature': 'invalid' });
  const event = {
    id: 'evt_contract_ignored',
    type: 'contract.test.ignored',
    livemode: false,
    data: { object: {} },
  };
  await signed({ ...event, livemode: true });
  await signed({ id: 'evt_contract_invalid', type: 'contract.test', livemode: false }, 400);
  await signed(event);
  const duplicate = await signed(event);
  assert.equal(duplicate.body.deduplicated, true);
});
test('sandbox completion issues the paid tickets once, never applies allocations, and a mismatch is never fulfilled', async () => {
  const sessionId = (
    d1.sqlite
      .prepare('SELECT stripe_checkout_session_id AS s FROM ticket_orders WHERE id = ?')
      .get(paidOrderId) as any
  ).s;
  const completion = {
    id: 'evt_contract_completion',
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: sessionId,
        payment_status: 'paid',
        amount_total: 5000,
        currency: 'usd',
        payment_intent: 'pi_test_contract_1',
        metadata: { orderId: paidOrderId },
      },
    },
  };
  const done = await signed(completion);
  assert.equal(done.body.ticketsIssued, 2);
  assert.equal((await signed(completion)).body.deduplicated, true);
  assert.equal(
    (d1.sqlite.prepare('SELECT count(*) AS n FROM tickets WHERE order_id = ?').get(paidOrderId) as any).n,
    2,
  );
  const rows = d1.sqlite
    .prepare('SELECT category FROM ledger_entries WHERE source_id IN (?, ?)')
    .all(paidEventId, paidOrderId) as any;
  assert.deepEqual(rows, []);
});
test('standalone Live platform workflows: teams, verified ticket lookup, QR scan replay protection, artists, agents, bookings, paid sandbox fulfillment, refunds, and linked production', async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const coOrgUser = await services.identity.findOrCreateUser('coorg@example.invalid', 'Co-Organizer');
  const artistUser = await services.identity.findOrCreateUser('artist@example.invalid', 'Sample Artist');
  const agentUser = await services.identity.findOrCreateUser('agent@example.invalid', 'Sample Agent');
  const agent2User = await services.identity.findOrCreateUser('agent2@example.invalid', 'Second Agent');
  for (const u of [coOrgUser, artistUser, agentUser, agent2User]) {
    d1.sqlite.prepare('UPDATE users SET verified_email_at = ? WHERE id = ?').run(nowSec, u.id);
    await services.identity.ensureProductAccount(u.id, 'live');
  }
  const coOrgCookie = `__session=${encodeURIComponent((await createSession(db, coOrgUser.id, secret)).cookieValue)}`;
  const artistCookie = `__session=${encodeURIComponent((await createSession(db, artistUser.id, secret)).cookieValue)}`;
  const agentCookie = `__session=${encodeURIComponent((await createSession(db, agentUser.id, secret)).cookieValue)}`;

  // 1. Event team assignment & strict separation of publishing vs financial/refund authority
  await call(
    'live',
    'POST',
    `/api/events/${eventId}/team`,
    201,
    { userId: coOrgUser.id, role: 'co_organizer' },
    { cookie },
  );
  // Co-organizer has edit_content but CANNOT grant finance_contact / refund approval authority
  await call(
    'live',
    'POST',
    `/api/events/${eventId}/team`,
    403,
    { userId: agentUser.id, role: 'finance_contact', canApproveRefunds: true },
    { cookie: coOrgCookie },
  );

  // 2. Ticket recovery: one answer for every address (a link is emailed only when tickets exist).
  const unknownLookup = await call('live', 'POST', '/api/tickets/lookup', 202, {
    email: 'nobody@example.org',
    ...TURNSTILE,
  });
  const knownLookup = await call('live', 'POST', '/api/tickets/lookup', 202, {
    email: 'sample@example.invalid',
    ...TURNSTILE,
  });
  assert.equal(unknownLookup.body.data.message, knownLookup.body.data.message);
  await call('live', 'POST', '/api/tickets/lookup', 400, { email: 'x@example.org' });
  // A pre-0013 RSVP pass (legacy gamt_ token) stays scannable through the legacy path.
  const freeQrToken = 'gamt_contract_0123456789abcdef0123456789abcdef'.replace('contract', 'evtlegcy');
  d1.sqlite.exec(
    `INSERT INTO ticket_orders (id, order_number, event_id, purchaser_name, purchaser_email, quantity, order_kind, idempotency_key, status, created_at) VALUES ('ord_contract_legacy', 'GL-LEGACY-C1', '${eventId}', 'Sample Legacy', 'legacy@example.invalid', 1, 'free', 'legacy_contract', 'confirmed', ${nowSec});
     INSERT INTO tickets (id, order_id, event_id, holder_name, holder_email, qr_token, qr_signature_hash, status, created_at) VALUES ('tkt_contract_legacy', 'ord_contract_legacy', '${eventId}', 'Sample Legacy', 'legacy@example.invalid', '${freeQrToken}', 'x', 'valid', ${nowSec});`,
  );

  // 3. Door QR pass scan & replay protection
  await call(
    'live',
    'POST',
    '/api/tickets/scan',
    200,
    { eventId, qrToken: freeQrToken, gateLabel: 'Main Gate' },
    { cookie },
  );
  await call(
    'live',
    'POST',
    '/api/tickets/scan',
    409,
    { eventId, qrToken: freeQrToken, gateLabel: 'Main Gate' },
    { cookie },
  );

  // 4. Artist profile, representative authorization, exclusive conflict detection, and revocation
  const createdArtist = await call(
    'live',
    'POST',
    '/api/artists',
    201,
    { stageName: 'Selah Collective', genre: 'worship', allowSelfBooking: true },
    { cookie: artistCookie },
  );
  const artistId = createdArtist.body.data.id;
  // New artist profiles start as drafts and are not listed until staff verify them (Phase 2 identity).
  assert.equal(createdArtist.body.data.verificationStatus, 'draft');
  const draftList = await call('live', 'GET', '/api/artists', 200);
  assert.ok(!draftList.body.data.some((a: any) => a.id === artistId));
  await d1
    .prepare("UPDATE artist_profiles SET verification_status = 'verified' WHERE id = ?")
    .bind(artistId)
    .run();
  const artistList = await call('live', 'GET', '/api/artists', 200);
  assert.ok(artistList.body.data.some((a: any) => a.id === artistId));

  const repAuth1 = await call(
    'live',
    'POST',
    `/api/artists/${artistId}/representatives`,
    201,
    {
      representativeUserId: agentUser.id,
      agencyName: 'Covenant Booking Agency',
      roleKind: 'booking_agent',
      contactEmail: 'agent@example.invalid',
      scope: 'booking_and_negotiation',
      exclusivity: 'exclusive',
      territory: 'US',
      canViewFinancials: false,
      commissionRateBps: 1000,
    },
    { cookie: artistCookie },
  );
  const repAuthId = repAuth1.body.data.id;

  // Conflicting exclusive representation on the same artist/territory must fail with 409
  await call(
    'live',
    'POST',
    `/api/artists/${artistId}/representatives`,
    409,
    {
      representativeUserId: agent2User.id,
      agencyName: 'Second Agency',
      roleKind: 'manager',
      contactEmail: 'agent2@example.invalid',
      scope: 'full_management',
      exclusivity: 'exclusive',
      territory: 'US',
    },
    { cookie: artistCookie },
  );

  // 5. Booking inquiry, agent counteroffer, and organizer acceptance creating confirmed engagement
  const inqRes = await call(
    'live',
    'POST',
    '/api/bookings/inquiries',
    201,
    {
      organizationId: orgId,
      eventId,
      artistId,
      proposedStartsAt: '2026-12-15T18:00:00+00:00',
      venueName: 'Sample venue',
      city: 'Phoenix',
      state: 'AZ',
      performanceScope: '60-minute worship set',
      proposedArtistFeeCents: 150000,
      agentCommissionCents: 15000,
      platformAdminAllocationCents: 0,
    },
    { cookie },
  );
  const inquiryId = inqRes.body.data.inquiry.id;

  // Authorized agent submits counteroffer
  const counterOffer = await call(
    'live',
    'POST',
    `/api/bookings/inquiries/${inquiryId}/offers`,
    201,
    {
      artistFeeCents: 180000,
      agentCommissionCents: 18000,
      platformAdminAllocationCents: 0,
      travelStipendCents: 25000,
      performanceMinutes: 75,
      termsSummary: '75-minute headline set plus travel stipend',
    },
    { cookie: agentCookie },
  );
  const counterOfferId = counterOffer.body.data.id;

  // Agent cannot accept their own counteroffer (403)
  await call('live', 'POST', `/api/bookings/offers/${counterOfferId}/accept`, 403, undefined, {
    cookie: agentCookie,
  });
  // Organizer accepts the agent's counteroffer (200)
  const accepted = await call(
    'live',
    'POST',
    `/api/bookings/offers/${counterOfferId}/accept`,
    200,
    undefined,
    { cookie },
  );
  assert.equal(accepted.body.data.engagement.depositCollectionStatus, 'disabled_pending_policy');

  // Revoke representation and verify revoked agent can no longer negotiate on new inquiries
  const revoked = await call(
    'live',
    'POST',
    `/api/representations/${repAuthId}/revoke`,
    200,
    { reason: 'Representation term concluded' },
    { cookie: artistCookie },
  );
  assert.equal(revoked.body.data.status, 'revoked');

  // 6. Verified organizer paid ticket checkout, webhook fulfillment, and permission-scoped refund
  d1.sqlite
    .prepare(
      'UPDATE organizer_profiles SET verification_status = ?, ticketing_authorized_at = ? WHERE organization_id = ?',
    )
    .run('verified', nowSec, orgId);
  const paidEvent = await services.live.createEvent(
    orgId,
    createEventSchema.parse({
      ...input,
      title: 'Verified Paid Concert',
      admissionType: 'paid',
      tiers: [{ name: 'Reserved Seating', priceCents: 3000, capacity: 20 }],
    }),
  );
  await services.admin.reviewEvent('staff_reviewer_demo', paidEvent.event.id, { decision: 'approved' });

  const paidCheckout = await call('live', 'POST', '/api/checkout/session', 200, {
    eventId: paidEvent.event.id,
    ...orderBody(paidEvent.tiers[0].id, 'buyer@example.org', 2),
  });
  const workflowOrderId = paidCheckout.body.data.orderId;
  const buyerCookie = paidCheckout.response.headers.get('set-cookie')!.split(';')[0];
  const workflowSession = (
    d1.sqlite
      .prepare('SELECT stripe_checkout_session_id AS s FROM ticket_orders WHERE id = ?')
      .get(workflowOrderId) as any
  ).s;

  // Fulfill via signed sandbox webhook
  const fulfilled = await signed(
    {
      id: 'evt_paid_order_fulfilled_1',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: workflowSession,
          payment_status: 'paid',
          amount_total: 6000,
          currency: 'usd',
          payment_intent: 'pi_test_contract_workflow',
          metadata: { orderId: workflowOrderId, eventId: paidEvent.event.id },
        },
      },
    },
    200,
  );
  assert.equal(fulfilled.body.ticketsIssued, 2);
  const [firstTicket, secondTicket] = d1.sqlite
    .prepare('SELECT id FROM tickets WHERE order_id = ? ORDER BY seq')
    .all(workflowOrderId) as Array<{ id: string }>;

  // Co-organizer without approve_refunds cannot refund (403); primary owner refunds one ticket (200)
  await call(
    'live',
    'POST',
    `/api/events/${paidEvent.event.id}/team`,
    201,
    { userId: coOrgUser.id, role: 'co_organizer' },
    { cookie },
  );
  await call('live', 'POST', `/api/orders/${workflowOrderId}/refund`, 401, {
    reason: 'Anonymous refund attempt',
  });
  await call(
    'live',
    'POST',
    `/api/orders/${workflowOrderId}/refund`,
    403,
    { reason: 'Unauthorized refund attempt' },
    { cookie: coOrgCookie },
  );
  const refunded = await call(
    'live',
    'POST',
    `/api/orders/${workflowOrderId}/refund`,
    200,
    { reason: 'Attendee requested a refund for one ticket', ticketIds: [firstTicket.id] },
    { cookie },
  );
  assert.deepEqual([refunded.body.data.status, refunded.body.data.amountCents], ['processed', 3000]);
  const repeat = await call(
    'live',
    'POST',
    `/api/orders/${workflowOrderId}/refund`,
    200,
    { reason: 'Repeat', ticketIds: [firstTicket.id] },
    { cookie },
  );
  assert.equal(repeat.body.data.status, 'nothing_to_do');

  // The buyer transfers the other ticket (customer cookie); a stale transfer of it later is refused.
  await call('live', 'POST', `/api/tickets/${secondTicket.id}/transfer`, 401, {
    toName: 'Jo Sample',
    toEmail: 'jo@example.org',
    toEmailConfirm: 'jo@example.org',
  });
  await call(
    'live',
    'POST',
    `/api/tickets/${secondTicket.id}/transfer`,
    400,
    { toName: 'Jo Sample', toEmail: 'jo@example.org', toEmailConfirm: 'other@example.org' },
    { cookie: buyerCookie },
  );
  const moved = await call(
    'live',
    'POST',
    `/api/tickets/${secondTicket.id}/transfer`,
    200,
    { toName: 'Jo Sample', toEmail: 'jo@example.org', toEmailConfirm: 'jo@example.org' },
    { cookie: buyerCookie },
  );
  assert.equal(moved.body.data.version, 2);
  await call(
    'live',
    'POST',
    `/api/tickets/${secondTicket.id}/transfer`,
    404,
    { toName: 'Al Sample', toEmail: 'al@example.org', toEmailConfirm: 'al@example.org' },
    { cookie: buyerCookie },
  );
  // Organizer reissue (manage_ticketing) needs a reason.
  await call('live', 'POST', `/api/tickets/${secondTicket.id}/reissue`, 400, { reason: '' }, { cookie });
  await call(
    'live',
    'POST',
    `/api/tickets/${secondTicket.id}/reissue`,
    403,
    { reason: 'Lost phone' },
    { cookie: agentCookie },
  );
  const reissued = await call(
    'live',
    'POST',
    `/api/tickets/${secondTicket.id}/reissue`,
    200,
    { reason: 'Lost phone' },
    { cookie },
  );
  assert.equal(reissued.body.data.version, 3);

  // Event changes: reschedule notifies holders; anonymous and unauthorised callers are refused.
  const newDate = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
  const reschedule = {
    kind: 'rescheduled',
    startDate: newDate,
    startTime: '19:30',
    timezone: 'America/Phoenix',
  };
  await call('live', 'POST', `/api/events/${paidEvent.event.id}/changes`, 401, reschedule);
  await call('live', 'POST', `/api/events/${paidEvent.event.id}/changes`, 403, reschedule, {
    cookie: agentCookie,
  });
  await call(
    'live',
    'POST',
    `/api/events/${paidEvent.event.id}/changes`,
    400,
    { ...reschedule, startTime: '7pm' },
    { cookie },
  );
  const changed = await call('live', 'POST', `/api/events/${paidEvent.event.id}/changes`, 200, reschedule, {
    cookie,
  });
  assert.ok(changed.body.data.changeId);

  // Organizer form shape: create (first approved event exists → publishes) and edit with policies.
  const formEvent = {
    organizationId: orgId,
    title: 'Sample organizer form event',
    category: 'worship',
    description: 'A sample worship gathering created through the organizer form.',
    venueName: 'Sample Hall',
    city: 'Phoenix',
    state: 'AZ',
    timezone: 'America/Phoenix',
    start: { date: newDate, time: '18:00' },
    admissionType: 'free',
    categories: [{ name: 'General', kind: 'general', price: '0', capacity: '40' }],
    policy: { maxTicketsPerOrder: 6, refundPolicy: 'until_24h' },
  };
  await call(
    'live',
    'POST',
    '/api/events',
    400,
    { ...formEvent, policy: { maxTicketsPerOrder: 99 } },
    { cookie },
  );
  const createdForm = await call('live', 'POST', '/api/events', 201, formEvent, { cookie });
  const formEventId = createdForm.body.data.eventId;
  await call('live', 'PATCH', `/api/events/${formEventId}`, 401, formEvent);
  await call('live', 'PATCH', `/api/events/${formEventId}`, 403, formEvent, { cookie: agentCookie });
  const edited = await call(
    'live',
    'PATCH',
    `/api/events/${formEventId}`,
    200,
    { ...formEvent, title: 'Sample organizer form event (edited)' },
    { cookie },
  );
  assert.match(edited.body.data.message, /Changes saved/);

  // Resend webhook: 503 without the secret; signed events update email_log.
  await call(
    'live',
    'POST',
    '/api/webhook/resend',
    503,
    { type: 'email.delivered', data: {} },
    { 'x-contract-production': '1', 'x-contract-no-resend': '1' },
  );
  const resendBody = JSON.stringify({
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: { email_id: 'msg_contract_missing', bounce: { type: 'Permanent' } },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await svixSignature(env.RESEND_WEBHOOK_SECRET as string, 'msg_svix_1', ts, resendBody);
  const resend = await call('live', 'POST', '/api/webhook/resend', 200, resendBody, {
    'svix-id': 'msg_svix_1',
    'svix-timestamp': ts,
    'svix-signature': `v1,${sig}`,
  });
  assert.equal(resend.body.applied, false);
  await call('live', 'POST', '/api/webhook/resend', 400, resendBody, {
    'svix-id': 'msg_svix_1',
    'svix-timestamp': ts,
    'svix-signature': 'v1,AAAA',
  });

  // 7. Linked Gamo Production requests
  const prodReq = await call(
    'live',
    'POST',
    `/api/events/${eventId}/production-requests`,
    201,
    {
      category: 'audio',
      scopeSummary: 'FOH line array and monitor console for 450-seat sanctuary',
    },
    { cookie },
  );
  assert.equal(prodReq.body.data.eventId, eventId);
  const prodList = await call('live', 'GET', `/api/events/${eventId}/production-requests`, 200, undefined, {
    cookie,
  });
  assert.equal(prodList.body.data.length, 1);
});
test('legacy list cap, stable ordering and response schema negative controls', async () => {
  for (let n = 0; n < 51; n++) {
    const created = await services.live.createEvent(
      orgId,
      createEventSchema.parse({ ...input, title: `Sample collection boundary ${n}` }),
    );
    await services.admin.reviewEvent('staff_reviewer_demo', created.event.id, { decision: 'approved' });
  }
  const list = await call('live', 'GET', '/api/events', 200);
  assert.equal(list.body.data.length, 50);
  assert.equal(list.body.meta.total, 50);
  assert.deepEqual(
    list.body.data.map((e: any) => e.id),
    list.body.data.map((e: any) => e.id).sort(),
  );
  const value = structuredClone(list.body.data[0]);
  validateContract('EventDetails', value);
  assert.throws(() => validateContract('EventDetails', { ...value, unexpected: true }));
  delete value.title;
  assert.throws(() => validateContract('EventDetails', value));
  assert.throws(() => validateContract('TicketCheckoutInput', { eventId, quantity: null }));
  const response = handleApiError(new Error('sensitive implementation detail'));
  assert.ok(!(await response.text()).includes('sensitive implementation detail'));
  assert.equal(covered.size, 35);
});

test('all public apps expose the same isolated auth and organization contract, and participation inquiries match OpenAPI contracts', async () => {
  for (const app of ['web', 'live', 'worship', 'academy', 'production']) {
    const email = `replicated-${app}@example.invalid`;
    await call(app, 'POST', '/api/auth/session', 200, { email: `demo-${app}@example.invalid` });
    const challenge = await call(app, 'POST', '/api/auth/challenge', 200, {
      email,
      intent: 'signup',
      ...LOCAL_TURNSTILE,
    });
    const code = challenge.body.data.message.match(/Local test code: (\d{6})/)[1];
    const verified = await call(app, 'POST', '/api/auth/verify', 200, {
      email,
      code,
      displayName: 'Sample participant',
      intent: 'signup',
      terms: signupTerms(),
    });
    const appCookie = verified.response.headers.get('set-cookie')!.split(';')[0];
    await call(app, 'GET', '/api/auth/me', 200, undefined, { cookie: appCookie });
    await call(
      app,
      'POST',
      '/api/organizations',
      201,
      { name: `Sample ${app}`, slug: `sample-${app}`, type: 'ministry' },
      { cookie: appCookie },
    );
    await call(app, 'DELETE', '/api/auth/session', 200, undefined, { cookie: appCookie });
    await call(app, 'GET', '/api/auth/me', 401, undefined, { cookie: appCookie });
    await call(
      app,
      'POST',
      '/api/auth/challenge',
      503,
      { email, ...LOCAL_TURNSTILE },
      { 'x-contract-production': '1' },
    );
  }
  await call('web', 'POST', '/api/participation', 401, {
    kind: 'general',
    interest: 'Gamo Worship',
    name: 'Sample Applicant',
    message: 'Unauthenticated inquiry must fail',
  });
  const createdInq = await call(
    'web',
    'POST',
    '/api/participation',
    201,
    {
      kind: 'partnership',
      interest: 'Gamo Worship',
      name: 'Sample Applicant',
      organization: 'Sample Fellowship',
      message: 'Exploring worship coverage coordination for Sunday services.',
    },
    { cookie },
  );
  const inquiryId = createdInq.body.data.inquiry.id;
  const myInquiries = await call('web', 'GET', '/api/participation', 200, undefined, { cookie });
  assert.equal(myInquiries.body.data.inquiries.length, 1);
  const headers = { authorization: `Bearer ${env.ADMIN_ACCESS_TOKEN}`, cookie: staffCookie };
  const queue = await call('admin', 'GET', '/api/participation/review-queue', 200, undefined, headers);
  assert.ok(queue.body.data.inquiries.some((item: any) => item.id === inquiryId));
  const reviewed = await call(
    'admin',
    'POST',
    `/api/participation/${inquiryId}/review`,
    200,
    { status: 'reviewed', notes: 'Followed up with church leadership.' },
    headers,
  );
  assert.equal(reviewed.body.data.inquiry.status, 'reviewed');
  assert.equal(covered.size, 63);
});

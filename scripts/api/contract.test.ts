import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { IdentityService, handleApiError, svixSignature } from '../../packages/domain/index.ts';
import { createSession } from '../../packages/auth/index.ts';
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
};
const secret = 'contract-test-session-signing-material-only';
const env: Record<string, unknown> = {
  DB: d1,
  ENVIRONMENT: 'local',
  SESSION_SECRET: secret,
  ALLOW_DEMO_SESSION: 'true',
  ALLOW_AUTH_SIMULATION: 'true',
  RESEND_WEBHOOK_SECRET: 'whsec_Y29udHJhY3QtdGVzdC1yZXNlbmQtd2ViaG9vaw==',
  RESEND_API_KEY: 're_mock_contract',
  ENABLE_BREAK_GLASS_AUTH: 'true',
  ADMIN_ACCESS_TOKEN: 'contract-test-emergency-material',
};
const servers: Server[] = [];
const origins: Record<string, string> = {};
const covered = new Set<string>();
const nativeFetch = globalThis.fetch;
let cookie: string, otherCookie: string, staffCookie: string;
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
  await services.identity.createOrganization('Sample ministry', 'contract-ministry', 'church', owner.id);
  cookie = `__session=${encodeURIComponent((await createSession(db, owner.id, secret)).cookieValue)}`;
  otherCookie = `__session=${encodeURIComponent((await createSession(db, other.id, secret)).cookieValue)}`;
  for (const app of ['web', 'admin', 'worship', 'academy', 'production']) {
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
test('web receives signed Resend events: 503 without the secret, 400 on a bad signature, 200 with applied', async () => {
  const operation = spec.paths['/api/webhook/resend'].post;
  assert.equal(operation['x-application'], 'web');
  assert.equal(operation['x-source'], 'apps/web/src/pages/api/webhook/resend.ts');
  assert.equal(operation['x-replicated-applications'], undefined);
  await call(
    'web',
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
  const resend = await call('web', 'POST', '/api/webhook/resend', 200, resendBody, {
    'svix-id': 'msg_svix_1',
    'svix-timestamp': ts,
    'svix-signature': `v1,${sig}`,
  });
  assert.equal(resend.body.received, true);
  assert.equal(resend.body.applied, false);
  await call('web', 'POST', '/api/webhook/resend', 400, resendBody, {
    'svix-id': 'msg_svix_1',
    'svix-timestamp': ts,
    'svix-signature': 'v1,AAAA',
  });
});
test('error responses never leak implementation details', async () => {
  const response = handleApiError(new Error('sensitive implementation detail'));
  assert.ok(!(await response.text()).includes('sensitive implementation detail'));
});

test('all public apps expose the same isolated auth and organization contract, and participation inquiries match OpenAPI contracts', async () => {
  for (const app of ['web', 'worship', 'academy', 'production']) {
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
  assert.equal(covered.size, 30);
});

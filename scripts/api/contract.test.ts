import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createInMemoryD1, applyMigrations } from '../../packages/db/testing.ts';
import { createDb } from '../../packages/db/index.ts';
import { roles, userRoles, users } from '../../packages/db/schema.ts';
import { handleApiError, svixSignature } from '../../packages/domain/index.ts';
import { createSession } from '../../packages/auth/index.ts';
import { onRequest } from '../../apps/admin/src/middleware.ts';
const spec = JSON.parse(readFileSync('openapi/bundled/internal.json', 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', ...spec });
const d1 = createInMemoryD1();
const db = createDb(d1);
/** Seeds a staff user directly in D1 (public accounts were removed in contract 4.0.0). */
async function seedStaff(id: string, email: string, roleCode: string) {
  await db.insert(users).values({ id, email, status: 'active', createdAt: new Date() });
  await db
    .insert(roles)
    .values({ id: `role_${roleCode}`, code: roleCode })
    .onConflictDoNothing();
  await db
    .insert(userRoles)
    .values({ id: `ur_${id}`, userId: id, roleId: `role_${roleCode}`, createdAt: new Date() });
}
const secret = 'contract-test-session-signing-material-only';
const env: Record<string, unknown> = {
  DB: d1,
  ENVIRONMENT: 'local',
  SESSION_SECRET: secret,
  RESEND_WEBHOOK_SECRET: 'whsec_Y29udHJhY3QtdGVzdC1yZXNlbmQtd2ViaG9vaw==',
  RESEND_API_KEY: 're_mock_contract',
  ENABLE_BREAK_GLASS_AUTH: 'true',
  ADMIN_ACCESS_TOKEN: 'contract-test-emergency-material',
};
const servers: Server[] = [];
const origins: Record<string, string> = {};
const covered = new Set<string>();
const nativeFetch = globalThis.fetch;
let staffCookie: string, superCookie: string;
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
  await seedStaff('staff_reviewer_demo', 'reviewer@example.invalid', 'staff_reviewer');
  staffCookie = `__session=${encodeURIComponent((await createSession(db, 'staff_reviewer_demo', secret)).cookieValue)}`;
  await seedStaff('superadmin_demo', 'superadmin@example.invalid', 'superadmin');
  superCookie = `__session=${encodeURIComponent((await createSession(db, 'superadmin_demo', secret)).cookieValue)}`;
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
                ...(req.headers['x-contract-production'] ? { ENVIRONMENT: 'production' } : {}),
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
test('staff provisioning requires the Access boundary and a superadmin session', async () => {
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

test('only the staff provisioning and Resend webhook operations remain (public accounts removed in 4.0.0)', () => {
  const operations = Object.entries<any>(spec.paths)
    .flatMap(([path, item]) =>
      Object.entries<any>(item)
        .filter(([, op]) => op?.operationId)
        .map(([method, op]) => `${op['x-application']} ${method.toUpperCase()} ${path}`),
    )
    .sort();
  assert.deepEqual(operations, ['admin POST /api/staff/provision', 'web POST /api/webhook/resend']);
  assert.equal(spec.info.version, '4.0.0');
  for (const name of Object.keys(spec.components.schemas))
    assert.doesNotMatch(
      name,
      /^(Auth|Session|Logout|Clerk|Organization|Participation|PersonLink|ProviderAccount|ProviderReview|TermsDocumentRef)/,
    );
  for (const op of Object.values<any>(spec.paths).flatMap((item) => Object.values<any>(item)))
    assert.equal(op['x-replicated-applications'], undefined);
});
test('contract coverage reaches every remaining operation', () => {
  assert.equal(covered.size, 2);
});

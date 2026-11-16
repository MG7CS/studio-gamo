import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(new URL('../../apps/academy/package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const dir = mkdtempSync(join(tmpdir(), 'gamo-browser-e2e-'));
const d1Dir = join(dir, 'd1');
const output = join(dir, 'worker.mjs');

await build({
  entryPoints: ['scripts/audit/worker.ts'],
  outfile: output,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  define: { 'import.meta.env': '{}' },
  logLevel: 'warning',
});

const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: 'browser-e2e',
        modules: true,
        script: readFileSync(output, 'utf8'),
        compatibilityDate: '2024-09-23',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: 'browser-e2e-db' },
        r2Buckets: ['ASSETS'],
        bindings: {
          SESSION_SECRET: 'browser-e2e-workerd-secret-0123456789abcdef',
          ENVIRONMENT: 'local',
        },
      },
    ],
  }),
  resourcePersistencePath: d1Dir,
});

const browser = await chromium.launch({ headless: true });

try {
  const baseUrl = (await mf.ready).toString().replace(/\/$/, '');
  const db = await mf.getD1Database('DB');

  for (const file of readdirSync('packages/db/migrations')
    .filter((x) => x.endsWith('.sql'))
    .sort()) {
    for (const raw of readFileSync(`packages/db/migrations/${file}`, 'utf8').split(
      '--> statement-breakpoint',
    )) {
      const sql = raw.replace(/^\s*--.*$/gm, '').trim();
      if (sql) await db.exec(sql.replace(/\n/g, ' '));
    }
  }

  // Public accounts were removed (2026-11-16): the only signed-in users are admin staff. The staff
  // session comes from the test fixture route (it stands in for the admin gateway sign-in, which
  // tests/e2e/admin-signin.spec.ts drives in a real browser); the session cookie then travels with
  // real browser requests to the real provisioning route.
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto(`${baseUrl}/test/r2`, { waitUntil: 'domcontentloaded' });
  assert.deepEqual(JSON.parse((await page.textContent('body')) || '{}'), { denied: true, owner: true });

  const provision = (body) =>
    page.evaluate(async (payload) => {
      const res = await fetch('/api/staff/provision', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cf-access-authenticated-user-email': 'root@gamostudio.org',
          'cf-access-authenticated-user-id': 'cf-access-sub-super-e2e',
        },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.json() };
    }, body);
  const reviewer = {
    email: 'reviewer-e2e@gamostudio.org',
    displayName: 'E2E Staff Reviewer',
    role: 'staff_reviewer',
    accessSubject: 'cf-access-sub-browser-e2e',
  };

  // 1. Without a staff session the browser is refused.
  const anonymous = await provision(reviewer);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error.code, 'UNAUTHENTICATED');

  // 2. A superadmin session (bound to its Access subject) provisions the reviewer.
  const signIn = await page.evaluate(async () => {
    const res = await fetch('/test/staff-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'root@gamostudio.org', role: 'superadmin' }),
    });
    return { status: res.status, body: await res.json() };
  });
  assert.equal(signIn.status, 200);
  await db
    .prepare(
      "INSERT INTO external_identities (id, user_id, provider, provider_subject, provider_email, verified_at, created_at) VALUES ('ext_super_e2e', ?, 'cloudflare_access', 'cf-access-sub-super-e2e', 'root@gamostudio.org', unixepoch(), unixepoch())",
    )
    .bind(signIn.body.data.user.id)
    .run();
  assert.ok((await context.cookies()).some((c) => c.name === '__session'));
  const ok = await provision(reviewer);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.role, 'staff_reviewer');
  const row = await db
    .prepare(
      "SELECT provider_subject FROM external_identities WHERE provider_email = 'reviewer-e2e@gamostudio.org'",
    )
    .first();
  assert.equal(row?.provider_subject, 'cf-access-sub-browser-e2e');

  // 3. A spoofed Access subject for the signed-in superadmin is refused.
  const spoofed = await page.evaluate(async () => {
    const res = await fetch('/api/staff/provision', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-access-authenticated-user-email': 'root@gamostudio.org',
        'cf-access-authenticated-user-id': 'cf-access-sub-spoofed',
      },
      body: JSON.stringify({ email: 'x@gamostudio.org', role: 'staff_reviewer', accessSubject: 'cf-sub-x' }),
    });
    return res.status;
  });
  assert.equal(spoofed, 403);

  console.log('PLAYWRIGHT_BROWSER_E2E_WORKERD_D1_OK');
} finally {
  await browser.close();
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

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
          ALLOW_AUTH_SIMULATION: 'true',
        },
      },
    ],
  }),
  resourcePersistencePath: d1Dir,
});

const browser = await chromium.launch({ headless: true });

// Current terms version, read from the registry source (this .mjs test cannot import TypeScript).
const TERMS_VERSION = /TERMS_DRAFT_VERSION = '([^']+)'/.exec(
  readFileSync('packages/domain/src/terms/registry.ts', 'utf8'),
)[1];
const signupTerms = () => ['site-terms', 'privacy-policy'].map((slug) => ({ slug, version: TERMS_VERSION }));
const hashOtp = async (email, code) => {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${email.toLowerCase()}:signin:academy:signup:${code}`),
  );
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
};

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

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(5000);

  // 1. Navigate to /account/signin and request an email verification challenge
  await page.goto(`${baseUrl}/account/signin`, { waitUntil: 'networkidle' });
  await page.fill('[data-step-challenge] input[name="email"]', 'organizer@grace-e2e.org');
  await page.fill('[data-step-challenge] input[name="displayName"]', 'Pastor Grace E2E');
  await page.click('[data-btn-challenge]');

  await page.waitForSelector('[data-step-verify]:not([hidden])');
  const statusAfterChallenge = await page.textContent('[data-auth-status]');
  assert.match(statusAfterChallenge || '', /Verification code sent/);

  // 2. Verify challenge row was persisted in D1 and complete verification in browser
  const knownCode = '482910';
  const codeHash = await hashOtp('organizer@grace-e2e.org', knownCode);
  const updateRes = await db
    .prepare("UPDATE auth_challenges SET code_hash = ? WHERE email = 'organizer@grace-e2e.org'")
    .bind(codeHash)
    .run();
  assert.equal(updateRes.meta.changes, 1);

  await page.fill('[data-step-verify] input[name="code"]', knownCode);
  await page.click('[data-btn-verify]');

  await page.waitForSelector('[data-step-authenticated]:not([hidden])');
  const sessionSummary = await page.textContent('[data-session-summary]');
  assert.equal(sessionSummary?.trim(), 'organizer@grace-e2e.org (Verified)');

  // 3. Onboard a new organization in browser and verify active org membership
  await page.fill('[data-form-org] input[name="name"]', 'Grace Chapel E2E');
  await page.fill('[data-form-org] input[name="slug"]', 'grace-chapel-e2e');
  await page.selectOption('[data-form-org] select[name="type"]', 'church');
  await page.click('[data-btn-create-org]');

  await page.waitForSelector('[data-org-current]:not([hidden])');
  const orgSummary = await page.textContent('[data-org-summary]');
  assert.equal(orgSummary?.trim(), 'Grace Chapel E2E (church · owner)');
  const orgId = await page.getAttribute('[data-org-current]', 'data-org-id');
  assert.ok(orgId?.startsWith('org_'));

  // 4. Provision a superadmin + staff reviewer in D1/API; the reviewer signs in with a verified code
  await mf.dispatchFetch(`${baseUrl}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'root@gamostudio.org',
      displayName: 'Root Superadmin',
      intent: 'signup',
      'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
    }),
  });
  const superCodeHash = await hashOtp('root@gamostudio.org', '111222');
  await db
    .prepare("UPDATE auth_challenges SET code_hash = ? WHERE email = 'root@gamostudio.org'")
    .bind(superCodeHash)
    .run();
  const superVerify = await mf.dispatchFetch(`${baseUrl}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'root@gamostudio.org',
      code: '111222',
      displayName: 'Root Superadmin',
      intent: 'signup',
      terms: signupTerms(),
    }),
  });
  const superCookie = superVerify.headers.get('set-cookie').split(';')[0];
  const superBody = await superVerify.json();
  const superUserId = superBody.data.user.id;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO roles (id, code) VALUES ('role_superadmin', 'superadmin')"),
    db
      .prepare(
        "INSERT INTO user_roles (id, user_id, role_id, created_at) VALUES ('ur_super_e2e', ?, 'role_superadmin', unixepoch())",
      )
      .bind(superUserId),
    db
      .prepare(
        "INSERT INTO external_identities (id, user_id, provider, provider_subject, provider_email, verified_at, created_at) VALUES ('ext_super_e2e', ?, 'cloudflare_access', 'cf-access-sub-super-e2e', 'root@gamostudio.org', unixepoch(), unixepoch())",
      )
      .bind(superUserId),
  ]);

  const provRes = await mf.dispatchFetch(`${baseUrl}/api/staff/provision`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: superCookie,
      'cf-access-authenticated-user-email': 'root@gamostudio.org',
      'cf-access-authenticated-user-id': 'cf-access-sub-super-e2e',
    },
    body: JSON.stringify({
      email: 'reviewer-e2e@gamostudio.org',
      displayName: 'E2E Staff Reviewer',
      role: 'staff_reviewer',
      accessSubject: 'cf-access-sub-browser-e2e',
    }),
  });
  assert.equal(provRes.status, 200);

  await mf.dispatchFetch(`${baseUrl}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'reviewer-e2e@gamostudio.org',
      intent: 'signup',
      'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
    }),
  });
  const staffCodeHash = await hashOtp('reviewer-e2e@gamostudio.org', '333444');
  await db
    .prepare("UPDATE auth_challenges SET code_hash = ? WHERE email = 'reviewer-e2e@gamostudio.org'")
    .bind(staffCodeHash)
    .run();
  const staffVerify = await mf.dispatchFetch(`${baseUrl}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'reviewer-e2e@gamostudio.org',
      code: '333444',
      intent: 'signup',
      terms: signupTerms(),
    }),
  });
  assert.equal(staffVerify.status, 200);
  assert.ok(staffVerify.headers.get('set-cookie')?.includes('='));

  // 5. Navigate back to /account/signin, click Sign out, and verify session termination in browser
  await page.goto(`${baseUrl}/account/signin`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-step-authenticated]:not([hidden])');
  await page.click('[data-btn-signout]');
  await page.waitForSelector('[data-step-challenge]:not([hidden])');

  const meAfterLogout = await page.evaluate(async () => {
    const res = await fetch('/api/auth/me');
    return { status: res.status, body: await res.json() };
  });
  assert.equal(meAfterLogout.status, 401);
  assert.equal(meAfterLogout.body.error.code, 'UNAUTHENTICATED');

  console.log('PLAYWRIGHT_BROWSER_E2E_WORKERD_D1_OK');
} finally {
  await browser.close();
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

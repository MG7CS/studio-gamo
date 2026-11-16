import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const APPS = [
  { name: 'web', port: 14321 },
  { name: 'worship', port: 14322 },
  { name: 'academy', port: 14323 },
  { name: 'production', port: 14325 },
  { name: 'admin', port: 14326 },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const dir = mkdtempSync(join(tmpdir(), 'gamo-phase1-e2e-'));
const d1Dir = join(dir, 'd1');

const SESSION_SECRET = 'phase1-e2e-shared-session-secret-0123456789abcdef';
const ADMIN_ACCESS_TOKEN = 'phase1-e2e-admin-break-glass-token-0123456789';

// Bundle each built Astro worker entry.mjs into a self-contained ESM script for Miniflare
const workerConfigs = [];
for (const app of APPS) {
  const outfile = join(dir, `${app.name}.mjs`);
  await build({
    entryPoints: [`apps/${app.name}/dist/server/entry.mjs`],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['cloudflare:workers', 'node:*'],
    logLevel: 'error',
  });
  workerConfigs.push({
    name: `app-${app.name}`,
    modules: true,
    script: readFileSync(outfile, 'utf8'),
    compatibilityDate: '2024-09-23',
    compatibilityFlags: ['nodejs_compat'],
    d1Databases: { DB: 'phase1-shared-db' },
    kvNamespaces: { SESSION: 'phase1-session-kv', SESSION_KV: 'phase1-session-kv' },
    r2Buckets: { MEDIA_BUCKET: 'phase1-media-bucket' },
    serviceBindings: {
      ASSETS: async (request) => {
        const url = new URL(request.url);
        let rel = decodeURIComponent(url.pathname);
        if (rel.endsWith('/')) rel += 'index.html';
        const clientRoot = join(process.cwd(), 'apps', app.name, 'dist', 'client');
        const candidates = [
          join(clientRoot, normalize(rel)),
          join(clientRoot, normalize(`${rel}.html`)),
          join(clientRoot, normalize(join(rel, 'index.html'))),
        ];
        for (const candidate of candidates) {
          if (candidate.startsWith(clientRoot) && existsSync(candidate) && statSync(candidate).isFile()) {
            const ext = extname(candidate).toLowerCase();
            return new Response(readFileSync(candidate), {
              status: 200,
              headers: { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' },
            });
          }
        }
        return new Response('Not found', { status: 404 });
      },
    },
    bindings: {
      ENVIRONMENT: 'local',
      SESSION_SECRET,
      ALLOW_AUTH_SIMULATION: 'true',
      ALLOW_DEMO_SESSION: 'false',
      ALLOW_PUBLIC_DEMO_WORKSPACES: 'false',
      STRIPE_SANDBOX_ENABLED: 'false',
      ENABLE_BREAK_GLASS_AUTH: 'true',
      ADMIN_ACCESS_TOKEN,
      PUBLIC_ROOT_DOMAIN: 'localhost',
      PUBLIC_SITE_URL_WEB: 'http://127.0.0.1:14321',
      PUBLIC_SITE_URL_WORSHIP: 'http://127.0.0.1:14322',
      PUBLIC_SITE_URL_ACADEMY: 'http://127.0.0.1:14323',
      PUBLIC_SITE_URL_PRODUCTION: 'http://127.0.0.1:14325',
      PUBLIC_SITE_URL_ADMIN: 'http://127.0.0.1:14326',
    },
  });
}

const routerScript = `
export default {
  async fetch(request, env) {
    const target = request.headers.get('x-target-app') || 'web';
    return env['APP_' + target.toUpperCase()].fetch(request);
  }
};
`;

const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: 'router',
        modules: true,
        script: routerScript,
        compatibilityDate: '2024-09-23',
        d1Databases: { DB: 'phase1-shared-db' },
        serviceBindings: Object.fromEntries(
          APPS.map((a) => [`APP_${a.name.toUpperCase()}`, `app-${a.name}`]),
        ),
      },
      ...workerConfigs,
    ],
  }),
  resourcePersistencePath: d1Dir,
});

const servers = [];
const browser = await chromium.launch({ headless: true });

try {
  await mf.ready;
  const db = await mf.getD1Database('DB');

  // Apply all tracked D1 migrations (0000 through 0008)
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

  for (const app of APPS) {
    const server = createServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const origin = `http://127.0.0.1:${app.port}`;
        const url = new URL(req.url || '/', origin);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (Array.isArray(v)) v.forEach((item) => headers.append(k, item));
          else if (v !== undefined) headers.set(k, v);
        }
        headers.set('x-target-app', app.name);
        const response = await mf.dispatchFetch(url.toString(), {
          method: req.method,
          headers,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
          redirect: 'manual',
        });
        const outHeaders = {};
        response.headers.forEach((v, k) => {
          if (k.toLowerCase() !== 'set-cookie') outHeaders[k] = v;
        });
        const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
        if (setCookies.length) outHeaders['set-cookie'] = setCookies;
        res.writeHead(response.status, outHeaders);
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(String(err));
      }
    });
    server.listen(app.port, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
  }

  const urls = Object.fromEntries(APPS.map((a) => [a.name, `http://127.0.0.1:${a.port}`]));

  // =========================================================================
  // CHECK 1 & 5: Unauthenticated visitor reaches meaningful public pages,
  // legacy mock forms redirect to /contact?interest=..., and private routes are blocked
  // =========================================================================
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  anonPage.setDefaultTimeout(10000);

  const publicChecks = [
    ['web', '/', 'Gamo Studios'],
    ['web', '/get-involved', "There's a place"],
    ['web', '/contact', 'Send an inquiry'],
    ['worship', '/', 'Gamo Worship'],
    ['academy', '/', 'Learn to Play the Instrument You Love'],
    ['production', '/', 'Gamo Production'],
  ];
  for (const [app, path, expectedText] of publicChecks) {
    const res = await anonPage.goto(`${urls[app]}${path}`, { waitUntil: 'domcontentloaded' });
    assert.equal(res.status(), 200, `Expected 200 on ${app}${path}`);
    const bodyText = await anonPage.textContent('body');
    assert.ok(bodyText.includes(expectedText), `Expected "${expectedText}" on ${app}${path}`);
    assert.ok(!bodyText.includes('Jordan Avery'), `Must not expose demo persona on ${app}${path}`);
  }

  // Legacy mock multi-step forms redirect to persistent /contact?interest=... flow
  // Provider roles go to their product's own sign-up with the role chosen; lessons to /lessons;
  // production consultations (clients) stay on the inquiry form.
  for (const [app, path, expected] of [
    ['worship', '/apply', /\/account\/signup\?role=musician$/],
    ['worship', '/hire', /\/account\/signup\?role=church$/],
    ['academy', '/register', /\/lessons$/],
    ['academy', '/host-apply', /\/account\/signup\?role=church$/],
    ['production', '/assessment', /\/contact\?interest=/],
    ['production', '/consultation', /\/contact\?interest=/],
  ]) {
    const res = await fetch(`${urls[app]}${path}`, { redirect: 'manual' });
    assert.equal(res.status, 303, `Expected 303 redirect on legacy form ${app}${path}`);
    assert.match(res.headers.get('location') || '', expected, `${app}${path}`);
  }

  // Private routes across all apps redirect unauthenticated visitors to /account/signin (even with ?demo_key=)
  const privateRouteChecks = [
    ['web', '/account'],
    ['web', '/partner'],
    ['worship', '/account'],
    ['worship', '/church'],
    ['worship', '/musician'],
    ['worship', '/check-in'],
    ['worship', '/admin'],
    ['academy', '/account'],
    ['academy', '/family'],
    ['academy', '/instructor'],
    ['academy', '/host'],
    ['production', '/account'],
    ['production', '/client'],
    ['production', '/crew'],
  ];
  for (const [app, path] of privateRouteChecks) {
    const res = await fetch(`${urls[app]}${path}?demo_key=bypass_attempt`, { redirect: 'manual' });
    assert.equal(res.status, 303, `Expected 303 on private route ${app}${path}`);
    assert.match(res.headers.get('location') || '', /^\/account\/signin\?next=/);
  }

  // Admin blocks unauthenticated requests with 401 Operations Gateway
  const adminAnonRes = await fetch(`${urls.admin}/participation`, { redirect: 'manual' });
  assert.equal(adminAnonRes.status, 401);
  await anonContext.close();

  // =========================================================================
  // CHECK 2, 3, 4, 6, 7: Gamo Studios (apps/web) + Admin (apps/admin)
  // Real signup, verification, empty states, participation inquiry submission,
  // persistence across logout/sign-in, and staff review workflow
  // =========================================================================
  const webContext = await browser.newContext();
  const webPage = await webContext.newPage();
  webPage.setDefaultTimeout(10000);

  await webPage.goto(`${urls.web}/account/signup`, { waitUntil: 'networkidle' });
  await webPage.fill('[data-step-challenge] input[name="firstName"]', 'Ruth');
  await webPage.fill('[data-step-challenge] input[name="lastName"]', 'Tekle');
  await webPage.fill('[data-step-challenge] input[name="email"]', 'ruth.leader@example.org');
  await webPage.check('[data-step-challenge] input[name="terms_accept"]');
  await webPage.click('[data-step-challenge] button[type="submit"]');

  await webPage.waitForSelector('[data-step-verify]:not([hidden])');
  const challengeMsg = await webPage.textContent('[data-auth-status]');
  const codeMatch = challengeMsg.match(/Local test code: (\d{6})/);
  assert.ok(codeMatch, `Expected simulated 6-digit code in "${challengeMsg}"`);

  // Verify wrong code is rejected honestly (Check 8)
  await webPage.fill('[data-step-verify] input[name="code"]', '000000');
  await webPage.click('[data-step-verify] button[type="submit"]');
  await webPage.waitForFunction(() => {
    const el = document.querySelector('[data-auth-status]');
    return el && (el.textContent || '').includes('Invalid or expired verification code');
  });

  // Enter valid code and complete verification -> redirects to /account
  await webPage.fill('[data-step-verify] input[name="code"]', codeMatch[1]);
  await Promise.all([
    webPage.waitForURL(`${urls.web}/account`),
    webPage.click('[data-step-verify] button[type="submit"]'),
  ]);

  // Check 6: New user sees appropriate empty states on /account
  const accountHeading = await webPage.textContent('#account-title');
  assert.match(accountHeading || '', /Welcome, Ruth Tekle\./);
  const emptyAccountBody = await webPage.textContent('main#main-content');
  assert.match(emptyAccountBody || '', /No organizations linked yet\./);
  assert.match(emptyAccountBody || '', /You have not submitted any inquiries\./);

  // Navigate to /contact?interest=Worship+support and submit a real participation inquiry
  await webPage.goto(`${urls.web}/contact?interest=Worship+support`, { waitUntil: 'networkidle' });
  await webPage.fill('[data-inquiry-form] input[name="name"]', 'Ruth Tekle');
  await webPage.fill('[data-inquiry-form] input[name="organization"]', 'Bethel Covenant Fellowship');
  await webPage.fill(
    '[data-inquiry-form] textarea[name="message"]',
    'Our congregation would like to explore Sunday morning worship coverage and keyboard mentorship.',
  );
  await webPage.click('[data-inquiry-form] button[type="submit"]');
  await webPage.waitForFunction(() => {
    const el = document.querySelector('[data-inquiry-result]');
    return el && (el.textContent || '').includes('Inquiry saved. Reference');
  });

  // Check 7: Log out, confirm /account is blocked, sign back in, and verify inquiry persists
  await webPage.goto(`${urls.web}/account`, { waitUntil: 'networkidle' });
  const beforeLogoutBody = await webPage.textContent('main#main-content');
  assert.match(beforeLogoutBody || '', /Worship support · General inquiry/);
  assert.match(beforeLogoutBody || '', /Pending staff review/);

  await Promise.all([
    webPage.waitForURL(`${urls.web}/account/signin`),
    webPage.click('[data-account-logout]'),
  ]);

  // Confirm /account is blocked after logout
  await webPage.goto(`${urls.web}/account`, { waitUntil: 'networkidle' });
  assert.match(webPage.url(), /\/account\/signin\?next=%2Faccount/);

  // Sign back in on /account/signin?next=%2Faccount
  await webPage.fill('[data-step-challenge] input[name="email"]', 'ruth.leader@example.org');
  await webPage.click('[data-step-challenge] button[type="submit"]');
  await webPage.waitForSelector('[data-step-verify]:not([hidden])');
  const reloginMsg = await webPage.textContent('[data-auth-status]');
  const reloginCode = reloginMsg.match(/Local test code: (\d{6})/)[1];
  await webPage.fill('[data-step-verify] input[name="code"]', reloginCode);
  await Promise.all([
    webPage.waitForURL(`${urls.web}/account`),
    webPage.click('[data-step-verify] button[type="submit"]'),
  ]);

  const afterReloginBody = await webPage.textContent('main#main-content');
  assert.match(
    afterReloginBody || '',
    /Our congregation would like to explore Sunday morning worship coverage/,
  );

  // Provision a staff reviewer and review the inquiry in apps/admin (/participation)
  const staffChallenge = await fetch(`${urls.web}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: urls.web },
    body: JSON.stringify({
      email: 'staff.reviewer@gamostudio.org',
      intent: 'signup',
      'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
    }),
  });
  const staffChalBody = await staffChallenge.json();
  const staffCode = staffChalBody.data.message.match(/Local test code: (\d{6})/)[1];
  const staffVerify = await fetch(`${urls.web}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: urls.web },
    body: JSON.stringify({
      email: 'staff.reviewer@gamostudio.org',
      code: staffCode,
      displayName: 'Staff Reviewer',
      intent: 'signup',
      terms: ['site-terms', 'privacy-policy'].map((slug) => ({
        slug,
        version: /TERMS_DRAFT_VERSION = '([^']+)'/.exec(
          readFileSync('packages/domain/src/terms/registry.ts', 'utf8'),
        )[1],
      })),
    }),
  });
  const staffSessionCookie = staffVerify.headers.get('set-cookie').split(';')[0];
  const staffVerifyBody = await staffVerify.json();
  const staffUserId = staffVerifyBody.data.user.id;
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO roles (id, code) VALUES ('role_staff_reviewer', 'staff_reviewer')"),
    db
      .prepare(
        "INSERT INTO user_roles (id, user_id, role_id, created_at) VALUES ('ur_staff_e2e', ?, 'role_staff_reviewer', unixepoch())",
      )
      .bind(staffUserId),
  ]);

  // Open apps/admin/participation in browser with staff session + break-glass header
  const adminContext = await browser.newContext({
    extraHTTPHeaders: { Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}` },
  });
  await adminContext.addCookies([
    {
      name: '__session',
      value: staffSessionCookie.split('=')[1],
      domain: '127.0.0.1',
      path: '/',
    },
  ]);
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`${urls.admin}/participation`, { waitUntil: 'networkidle' });
  const adminQueueText = await adminPage.textContent('main#main-content');
  assert.match(adminQueueText || '', /Bethel Covenant Fellowship/);
  assert.match(adminQueueText || '', /Ruth Tekle/);

  await adminPage.selectOption('[data-review-inquiry] select[name="status"]', 'reviewed');
  await adminPage.fill(
    '[data-review-inquiry] textarea[name="notes"]',
    'Connected Ruth with the Gamo Worship regional coordinator for an introductory call.',
  );
  await Promise.all([
    adminPage.waitForNavigation({ waitUntil: 'networkidle' }),
    adminPage.click('[data-review-inquiry] button[type="submit"]'),
  ]);
  await adminContext.close();

  // Reload user's /account page on apps/web and confirm staff update is visible
  await webPage.reload({ waitUntil: 'networkidle' });
  const reviewedAccountText = await webPage.textContent('main#main-content');
  assert.match(reviewedAccountText || '', /Reviewed/);
  assert.match(
    reviewedAccountText || '',
    /Connected Ruth with the Gamo Worship regional coordinator for an introductory call\./,
  );
  await webContext.close();

  // =========================================================================
  // CHECK 4, 5, 6: Cross-product account isolation & Role-gated workspaces across Worship, Academy, Production
  // =========================================================================
  const progContext = await browser.newContext();
  const progPage = await progContext.newPage();
  progPage.setDefaultTimeout(10000);

  // Verify that ruth.leader@example.org (who registered on Gamo Studios web) CANNOT sign in to Gamo Worship without creating a Worship account first
  await progPage.goto(`${urls.worship}/account/signin`, { waitUntil: 'networkidle' });
  const worshipH1 = await progPage.textContent('h1');
  assert.match(worshipH1 || '', /Welcome back/);
  await progPage.fill('[data-step-challenge] input[name="email"]', 'ruth.leader@example.org');
  await progPage.click('[data-step-challenge] button[type="submit"]');
  // Designed behaviour: sign-in for an address with no Worship account answers like any address (code step,
  // nothing about other products) and no code can create the account; sign-up is the only way in.
  await progPage.waitForSelector('[data-step-verify]:not([hidden])');
  const neutral = (await progPage.textContent('[data-auth-status]')) || '';
  assert.doesNotMatch(neutral, /Gamo Studios|No Gamo Worship account was found/);
  await progPage.fill('[data-step-verify] input[name="code"]', '123456');
  await progPage.click('[data-step-verify] button[type="submit"]');
  await progPage.waitForFunction(() =>
    (document.querySelector('[data-auth-status]')?.textContent || '').includes('Invalid or expired'),
  );

  // Explicitly create a Gamo Worship account on /account/signup
  await progPage.goto(`${urls.worship}/account/signup`, { waitUntil: 'networkidle' });
  assert.equal((await progPage.textContent('h1'))?.trim(), 'Create your Gamo Worship account');
  await progPage.fill('[data-step-challenge] input[name="firstName"]', 'Ruth');
  await progPage.fill('[data-step-challenge] input[name="lastName"]', 'Tekle');
  await progPage.fill('[data-step-challenge] input[name="email"]', 'ruth.leader@example.org');
  await progPage.check('[data-step-challenge] input[name="terms_accept"]');
  await progPage.click('[data-step-challenge] button[type="submit"]');
  await progPage.waitForSelector('[data-step-verify]:not([hidden])');
  const worshipCode = (await progPage.textContent('[data-auth-status]')).match(/Local test code: (\d{6})/)[1];
  await progPage.fill('[data-step-verify] input[name="code"]', worshipCode);
  await Promise.all([
    progPage.waitForURL(`${urls.worship}/account`),
    progPage.click('[data-step-verify] button[type="submit"]'),
  ]);

  // Signed-in Worship user without approved_musician role cannot access /musician -> redirected to 403 /account/access-denied
  const deniedMusicianRes = await progPage.goto(`${urls.worship}/musician`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(progPage.url(), `${urls.worship}/account/access-denied`);
  assert.equal(deniedMusicianRes.status(), 403);
  assert.match((await progPage.textContent('h1')) || '', /This area needs access you don't have yet/);

  // A Worship session is not a session for Gamo Academy at all (product mismatch is rejected when the
  // session is resolved), so /family treats the visitor as signed out and asks them to sign in.
  const crossProductDeniedRes = await progPage.goto(`${urls.academy}/family`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(progPage.url(), `${urls.academy}/account/signin?next=%2Ffamily`);
  assert.equal(crossProductDeniedRes.status(), 200);

  // Explicitly register for Gamo Academy on /account/signup?next=%2Ffamily and verify /family renders honest empty workspace while /instructor is blocked with 403
  await progPage.goto(`${urls.academy}/account/signup?next=%2Ffamily`, { waitUntil: 'networkidle' });
  assert.equal((await progPage.textContent('h1'))?.trim(), 'Create your Gamo Academy account');
  await progPage.fill('[data-step-challenge] input[name="firstName"]', 'Ruth');
  await progPage.fill('[data-step-challenge] input[name="lastName"]', 'Tekle');
  await progPage.fill('[data-step-challenge] input[name="email"]', 'ruth.leader@example.org');
  await progPage.check('[data-step-challenge] input[name="terms_accept"]');
  await progPage.click('[data-step-challenge] button[type="submit"]');
  await progPage.waitForSelector('[data-step-verify]:not([hidden])');
  const academyCode = (await progPage.textContent('[data-auth-status]')).match(/Local test code: (\d{6})/)[1];
  await progPage.fill('[data-step-verify] input[name="code"]', academyCode);
  await Promise.all([
    progPage.waitForURL(`${urls.academy}/family`),
    progPage.click('[data-step-verify] button[type="submit"]'),
  ]);
  assert.match(
    (await progPage.textContent('main#main-content')) || '',
    /There are no operational records available here yet\./,
  );

  const deniedInstructorRes = await progPage.goto(`${urls.academy}/instructor`, {
    waitUntil: 'domcontentloaded',
  });
  assert.equal(progPage.url(), `${urls.academy}/account/access-denied`);
  assert.equal(deniedInstructorRes.status(), 403);
  await progContext.close();

  console.log('PHASE1_FRESH_BROWSER_JOURNEYS_E2E_OK');
} finally {
  await browser.close();
  for (const s of servers) await new Promise((resolve) => s.close(resolve));
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

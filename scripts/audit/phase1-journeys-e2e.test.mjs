import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(new URL('../../apps/live/package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const APPS = [
  { name: 'web', port: 14321 },
  { name: 'worship', port: 14322 },
  { name: 'academy', port: 14323 },
  { name: 'live', port: 14324 },
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
      PUBLIC_SITE_URL_LIVE: 'http://127.0.0.1:14324',
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
    ['live', '/', 'Gamo Live'],
    ['live', '/events', 'Find a gathering worth showing up for.'],
    ['live', '/artists', 'Artists on tour & artist onboarding'],
    ['live', '/tickets/find', 'Find your tickets.'],
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

  // Legacy promotional /promote on standalone Gamo Live redirects directly into event creation (/promote/create)
  const promoteRedirectRes = await fetch(`${urls.live}/promote`, { redirect: 'manual' });
  assert.equal(promoteRedirectRes.status, 303, 'Expected 303 redirect on legacy promotional live/promote');
  assert.match(promoteRedirectRes.headers.get('location') || '', /\/promote\/create$/);

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
    ['live', '/account'],
    ['live', '/workspaces'],
    ['live', '/promote/create'],
    ['live', '/organizer'],
    ['live', '/artist'],
    ['live', '/agent'],
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
  assert.doesNotMatch(neutral, /Gamo Studios|Gamo Live|No Gamo Worship account was found/);
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

  // =========================================================================
  // CHECK 2, 3, 4, 6, 7, 8: Gamo Live (apps/live) End-to-End Public-to-Workspace
  // & Verified Ticket Recovery Journey
  // =========================================================================
  const liveContext = await browser.newContext();
  const livePage = await liveContext.newPage();
  livePage.setDefaultTimeout(10000);

  // Visitor clicks "List an event" -> redirected to /account/signin?next=%2Fpromote%2Fcreate -> switches to Create account
  await livePage.goto(`${urls.live}/promote/create`, { waitUntil: 'networkidle' });
  assert.equal(livePage.url(), `${urls.live}/account/signin?next=%2Fpromote%2Fcreate`);
  await livePage.click('a[href^="/account/signup"]');
  await livePage.waitForURL(`${urls.live}/account/signup?next=%2Fpromote%2Fcreate`);

  await livePage.fill('[data-step-challenge] input[name="firstName"]', 'Pastor Daniel');
  await livePage.fill('[data-step-challenge] input[name="lastName"]', 'Bekele');
  await livePage.fill('[data-step-challenge] input[name="email"]', 'organizer.live@example.org');
  await livePage.check('[data-step-challenge] input[name="terms_accept"]');
  await livePage.click('[data-step-challenge] button[type="submit"]');
  await livePage.waitForSelector('[data-step-verify]:not([hidden])');
  const liveCode = (await livePage.textContent('[data-auth-status]')).match(/Local test code: (\d{6})/)[1];
  await livePage.fill('[data-step-verify] input[name="code"]', liveCode);
  await Promise.all([
    livePage.waitForURL(`${urls.live}/promote/create`),
    livePage.click('[data-step-verify] button[type="submit"]'),
  ]);

  // Without an organization, /promote/create prompts the user to set up their organization first
  assert.match((await livePage.textContent('main#main-content')) || '', /Set up your organization first/);

  // Go to /account, create an organization, and verify persistence
  await livePage.goto(`${urls.live}/account`, { waitUntil: 'networkidle' });
  await livePage.click('details summary');
  await livePage.fill('[data-organization-form] input[name="name"]', 'New Jerusalem Fellowship');
  await livePage.fill('[data-organization-form] input[name="slug"]', 'new-jerusalem-fellowship');
  await livePage.selectOption('[data-organization-form] select[name="type"]', 'church');
  await Promise.all([
    livePage.waitForNavigation({ waitUntil: 'networkidle' }),
    livePage.click('[data-organization-form] button[type="submit"]'),
  ]);
  assert.match((await livePage.textContent('main#main-content')) || '', /New Jerusalem Fellowship/);

  // Return to /promote/create and submit a real event listing
  await livePage.goto(`${urls.live}/promote/create`, { waitUntil: 'networkidle' });
  const eventDay = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);
  await livePage.fill('#title', 'Autumn Night of Worship & Prayer');
  await livePage.selectOption('#category', 'worship');
  await livePage.fill(
    '#description',
    'An evening of congregational worship, scripture reading, and prayer open to the community.',
  );
  await livePage.fill('#venueName', 'New Jerusalem Sanctuary');
  await livePage.fill('#city', 'Dallas');
  await livePage.fill('#state', 'TX');
  await livePage.selectOption('#timezone', 'America/Chicago');
  await livePage.fill('#startDate', eventDay);
  await livePage.fill('#startTime', '19:00');
  await livePage.fill('[id="cat.0.capacity"]', '150');
  await Promise.all([
    livePage.waitForURL(/\/promote\/events\/evt_.*\/edit\?saved=/),
    livePage.click('#event-form button[type="submit"]'),
  ]);
  await livePage.goto(`${urls.live}/workspaces`, { waitUntil: 'networkidle' });

  // Verify /workspaces displays the pending event and allows creating an artist profile
  const workspacesText1 = await livePage.textContent('main#main-content');
  assert.match(workspacesText1 || '', /Autumn Night of Worship & Prayer/);
  assert.match(workspacesText1 || '', /Dallas, TX · pending review/);
  assert.match(workspacesText1 || '', /Create an artist profile to manage your presence on Gamo Live\./);

  await livePage.fill('#artist-profile input[name="stageName"]', 'New Jerusalem Worship Collective');
  await livePage.fill('#artist-profile input[name="genre"]', 'Worship');
  await livePage.fill('#artist-profile input[name="homeCity"]', 'Dallas');
  await livePage.fill('#artist-profile input[name="homeState"]', 'TX');
  await livePage.click('#artist-profile button[type="submit"]');
  await livePage.waitForFunction(() => {
    const el = document.querySelector('#artist-feedback');
    return el && (el.textContent || '').includes('Your profile has been saved');
  });
  await livePage.reload({ waitUntil: 'networkidle' });
  assert.match((await livePage.textContent('main#main-content')) || '', /New Jerusalem Worship Collective/);

  // Logout from Gamo Live, sign back in, and verify event + artist profile persist
  await livePage.goto(`${urls.live}/account`, { waitUntil: 'networkidle' });
  await Promise.all([
    livePage.waitForURL(`${urls.live}/account/signin`),
    livePage.click('[data-account-logout]'),
  ]);
  await livePage.goto(`${urls.live}/account/signin?next=%2Fworkspaces`, { waitUntil: 'networkidle' });
  await livePage.fill('[data-step-challenge] input[name="email"]', 'organizer.live@example.org');
  await livePage.click('[data-step-challenge] button[type="submit"]');
  await livePage.waitForSelector('[data-step-verify]:not([hidden])');
  const liveReloginCode = (await livePage.textContent('[data-auth-status]')).match(
    /Local test code: (\d{6})/,
  )[1];
  await livePage.fill('[data-step-verify] input[name="code"]', liveReloginCode);
  await Promise.all([
    livePage.waitForURL(`${urls.live}/workspaces`),
    livePage.click('[data-step-verify] button[type="submit"]'),
  ]);
  const workspacesAfterRelogin = await livePage.textContent('main#main-content');
  assert.match(workspacesAfterRelogin || '', /Autumn Night of Worship & Prayer/);
  assert.match(workspacesAfterRelogin || '', /New Jerusalem Worship Collective/);

  // Staff approves the event -> public visitor gets tickets and recovers them on /tickets/find
  const pendingEventRow = await db
    .prepare("SELECT id FROM events WHERE title = 'Autumn Night of Worship & Prayer' LIMIT 1")
    .first();
  assert.ok(pendingEventRow?.id);
  const approveEventRes = await fetch(`${urls.admin}/api/events/${pendingEventRow.id}/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: urls.admin,
      Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}`,
      Cookie: staffSessionCookie,
    },
    body: JSON.stringify({ decision: 'approved', notes: 'Approved for public listing' }),
  });
  assert.equal(approveEventRes.status, 200);

  // Public attendee reserves tickets with the shared form kit (no account), confirms the emailed code
  // (read from the local test inbox) and lands on the order page with her tickets.
  const attendeeEmail = 'miriam.attendee@example.org';
  const tierRow = await db
    .prepare('SELECT id FROM ticket_tiers WHERE event_id = ? LIMIT 1')
    .bind(pendingEventRow.id)
    .first();
  await livePage.goto(`${urls.live}/events/${pendingEventRow.id}/register`, { waitUntil: 'networkidle' });
  assert.match((await livePage.textContent('h1')) || '', /Autumn Night of Worship & Prayer/);
  await livePage.fill(`[id="qty.${tierRow.id}"]`, '2');
  await livePage.fill('#purchaser-name', 'Miriam Attendee');
  await livePage.fill('#email', attendeeEmail);
  await livePage.fill('#email-confirm', attendeeEmail);
  await livePage.check('#terms-accept');
  await Promise.all([
    livePage.waitForURL(/\/tickets\/confirm\?t=/),
    livePage.click('#order-form button[type="submit"]'),
  ]);

  const readInbox = async (kind) => {
    const html = await (
      await fetch(`${urls.live}/local-test/inbox?email=${encodeURIComponent(attendeeEmail)}`)
    ).text();
    const m = new RegExp(`data-kind="${kind}"[\\s\\S]*?<pre[^>]*>([\\s\\S]*?)</pre>`).exec(html);
    return m ? m[1] : '';
  };
  const code = (await readInbox('order_verification')).match(/Your code: (\d{6})/)[1];
  // A wrong code must not issue tickets.
  await livePage.fill('#code', code === '000001' ? '000002' : '000001');
  await livePage.click('form button[type="submit"]');
  await livePage.waitForSelector('[data-error-summary]');
  assert.equal((await db.prepare('SELECT count(*) n FROM tickets').first()).n, 0);
  await livePage.fill('#code', code);
  await Promise.all([
    livePage.waitForURL(/\/tickets\/orders\/ord_/),
    livePage.click('form button[type="submit"]'),
  ]);
  assert.equal(await livePage.locator('[data-ticket-card]').count(), 2);

  // Attendee recovers the same tickets by email link from /tickets/find (new browser context, no cookies).
  const recoveryContext = await browser.newContext();
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto(`${urls.live}/tickets/find`, { waitUntil: 'networkidle' });
  await recoveryPage.fill('#email', 'nobody.here@example.org');
  await recoveryPage.click('form button[type="submit"]');
  const unknownAnswer = await recoveryPage.textContent('#recovery-answer');
  await recoveryPage.goto(`${urls.live}/tickets/find`, { waitUntil: 'networkidle' });
  await recoveryPage.fill('#email', attendeeEmail);
  await recoveryPage.click('form button[type="submit"]');
  assert.equal(
    await recoveryPage.textContent('#recovery-answer'),
    unknownAnswer,
    'same answer for every address',
  );
  const link = (await readInbox('ticket_recovery')).match(/(http:\/\/\S+\/link\?t=[A-Za-z0-9_-]+)/)[1];
  await recoveryPage.goto(link);
  await Promise.all([
    recoveryPage.waitForURL(`${urls.live}/tickets/manage`),
    recoveryPage.click('button:has-text("Open my tickets")'),
  ]);
  assert.match(
    (await recoveryPage.textContent('main#main-content')) || '',
    /Autumn Night of Worship & Prayer/,
  );
  await recoveryContext.close();

  await liveContext.close();
  console.log('PHASE1_FRESH_BROWSER_JOURNEYS_E2E_OK');
} finally {
  await browser.close();
  for (const s of servers) await new Promise((resolve) => s.close(resolve));
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

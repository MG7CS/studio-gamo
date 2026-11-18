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

  // Apply all tracked D1 migrations
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
  // Public accounts were removed (2026-11-16). Anonymous visitors reach every public page, retired demo
  // flows and account/workspace URLs redirect to the public apply/request pages or home, and the admin
  // app (the only signed-in area) refuses anonymous requests. Admin staff sign-in is covered in a real
  // browser by tests/e2e/admin-signin.spec.ts.
  // =========================================================================
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  anonPage.setDefaultTimeout(10000);

  const publicChecks = [
    ['web', '/', 'Gamo Studios'],
    ['web', '/get-involved', "There's a place"],
    ['web', '/contact', 'hello@gamostudio.org'],
    ['worship', '/', 'Gamo Worship'],
    ['academy', '/', 'Learn to Play the Instrument You Love'],
    ['production', '/', 'Gamo Production'],
  ];
  for (const [app, path, expectedText] of publicChecks) {
    const res = await anonPage.goto(`${urls[app]}${path}`, { waitUntil: 'domcontentloaded' });
    assert.equal(res.status(), 200, `Expected 200 on ${app}${path}`);
    assert.equal(await anonPage.locator('h1').count(), 1, `one <h1> on ${app}${path}`);
    const bodyText = await anonPage.textContent('body');
    assert.ok(bodyText.includes(expectedText), `Expected "${expectedText}" on ${app}${path}`);
    assert.ok(!bodyText.includes('Jordan Avery'), `Must not expose demo persona on ${app}${path}`);
    assert.ok(!/\/account\/sign(in|up)/.test(await anonPage.content()), `No sign-in link on ${app}${path}`);
  }

  // The forms live on the main site now (/worship/apply and friends); the old addresses redirect there.
  for (const [app, path] of [
    ['worship', '/apply'],
    ['worship', '/request'],
    ['production', '/apply'],
    ['production', '/request'],
  ]) {
    const res = await fetch(`${urls[app]}${path}`, { redirect: 'manual' });
    assert.equal(res.status, 302, `Expected 302 on ${app}${path}`);
    assert.match(res.headers.get('location') || '', new RegExp(`/${app}${path}$`), `${app}${path}`);
  }

  // Retired multi-step demo forms keep their 303 and go to the public request page or lessons.
  for (const [app, path, expected] of [
    ['worship', '/hire', /^\/request$/],
    ['academy', '/register', /\/lessons$/],
    ['production', '/assessment', /^\/request$/],
    ['production', '/consultation', /^\/request$/],
  ]) {
    const res = await fetch(`${urls[app]}${path}`, { redirect: 'manual' });
    assert.equal(res.status, 303, `Expected 303 redirect on legacy form ${app}${path}`);
    assert.match(res.headers.get('location') || '', expected, `${app}${path}`);
  }

  // Retired account pages and demo workspaces redirect (even with ?demo_key=); nothing renders.
  for (const [app, path, expected] of [
    ['web', '/account', '/'],
    ['web', '/account/signin', '/'],
    ['web', '/partner', '/'],
    ['worship', '/account/signup', '/'],
    ['worship', '/church', '/request'],
    ['worship', '/musician', '/apply'],
    ['worship', '/check-in/sample', '/'],
    ['worship', '/opportunities', '/'],
    ['academy', '/account', '/'],
    ['academy', '/family', '/'],
    ['academy', '/instructor', '/'],
    ['academy', '/host', '/'],
    ['production', '/account', '/'],
    ['production', '/client', '/request'],
    ['production', '/crew', '/apply'],
  ]) {
    const res = await fetch(`${urls[app]}${path}?demo_key=bypass_attempt`, { redirect: 'manual' });
    assert.ok(
      [301, 302].includes(res.status),
      `Expected a redirect on retired ${app}${path}, got ${res.status}`,
    );
    assert.equal(res.headers.get('location'), expected, `${app}${path}`);
  }

  // Admin blocks unauthenticated requests with the 401 Operations Gateway.
  for (const path of ['/', '/security']) {
    const adminAnonRes = await fetch(`${urls.admin}${path}`, { redirect: 'manual' });
    assert.equal(adminAnonRes.status, 401, `admin ${path}`);
  }
  await anonContext.close();

  console.log('PHASE1_FRESH_BROWSER_JOURNEYS_E2E_OK');
} finally {
  await browser.close();
  for (const s of servers) await new Promise((resolve) => s.close(resolve));
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

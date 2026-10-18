import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(new URL('../../apps/live/package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const dir = mkdtempSync(join(tmpdir(), 'gamo-auth-ui-'));
const d1Dir = join(dir, 'd1');
const screenshotDir = resolve('docs/screenshots/2026-refresh/auth-ui');
mkdirSync(screenshotDir, { recursive: true });

const SESSION_SECRET = 'auth-ui-e2e-shared-session-secret-0123456789abcdef';

const APPS = [
  { name: 'web', port: 15321 },
  { name: 'worship', port: 15322 },
  { name: 'academy', port: 15323 },
  { name: 'live', port: 15324 },
  { name: 'production', port: 15325 },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

const workerConfigs = [];
for (const app of APPS) {
  const entry = join(process.cwd(), 'apps', app.name, 'dist', 'server', 'entry.mjs');
  const outfile = join(dir, `${app.name}.worker.mjs`);
  await build({
    entryPoints: [entry],
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
    d1Databases: { DB: 'auth-ui-shared-db' },
    kvNamespaces: { SESSION: 'auth-ui-session-kv', SESSION_KV: 'auth-ui-session-kv' },
    r2Buckets: { MEDIA_BUCKET: 'auth-ui-media-bucket' },
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
      PLATFORM_BRAND: 'Gamo Live',
      PUBLIC_ROOT_DOMAIN: 'localhost',
      PUBLIC_SITE_URL_WEB: 'http://127.0.0.1:15321',
      PUBLIC_SITE_URL_WORSHIP: 'http://127.0.0.1:15322',
      PUBLIC_SITE_URL_ACADEMY: 'http://127.0.0.1:15323',
      PUBLIC_SITE_URL_LIVE: 'http://127.0.0.1:15324',
      PUBLIC_SITE_URL_PRODUCTION: 'http://127.0.0.1:15325',
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
        d1Databases: { DB: 'auth-ui-shared-db' },
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

  const urls = {};
  for (const app of APPS) {
    const server = createServer(async (req, res) => {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const origin = `http://127.0.0.1:${app.port}`;
        const url = new URL(req.url || '/', origin);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v);
          else if (Array.isArray(v)) headers.set(k, v.join(', '));
        }
        headers.set('x-target-app', app.name);
        headers.set('host', `127.0.0.1:${app.port}`);
        const method = req.method || 'GET';
        const body = method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks);
        const response = await mf.dispatchFetch(url.toString(), {
          method,
          headers,
          body,
          redirect: 'manual',
        });
        res.statusCode = response.status;
        for (const [k, v] of response.headers.entries()) {
          if (k.toLowerCase() === 'set-cookie') continue;
          res.setHeader(k, v);
        }
        const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
        if (cookies.length) res.setHeader('set-cookie', cookies);
        const respBuf = Buffer.from(await response.arrayBuffer());
        res.end(respBuf);
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
    await new Promise((resolveListen) => server.listen(app.port, '127.0.0.1', resolveListen));
    servers.push(server);
    urls[app.name] = `http://127.0.0.1:${app.port}`;
  }

  const APP_PROGRAMS = {
    web: 'Gamo Studios',
    worship: 'Gamo Worship',
    academy: 'Gamo Academy',
    live: 'Gamo Live',
    production: 'Gamo Production',
  };

  const getScreensForProgram = (program) => [
    {
      slug: 'signin',
      path: '/account/signin',
      heading: 'Welcome back',
      subtext: `Sign in to your ${program} account.`,
    },
    { slug: 'signup', path: '/account/signup', heading: `Create your ${program} account` },
    { slug: 'verify', path: '/account/verify?email=you%40example.com', heading: 'Check your email' },
    {
      slug: 'recover',
      path: '/account/recover',
      heading: 'Recover your account',
      subtext: `Enter your email and we'll send you a verification code to restore access to your ${program} account.`,
    },
  ];

  const VIEWPORTS = [
    { width: 1920, height: 1080, label: '1920' },
    { width: 1440, height: 900, label: '1440' },
    { width: 768, height: 1024, label: '768' },
    { width: 430, height: 932, label: '430' },
    { width: 390, height: 844, label: '390' },
    { width: 375, height: 812, label: '375' },
    { width: 320, height: 690, label: '320' },
  ];

  // 1. Test all 4 screens across 1920px, 1440px, 768px, and 390px and capture screenshots at 1440px & 390px
  const webScreens = getScreensForProgram('Gamo Studios');
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    for (const screen of webScreens) {
      const res = await page.goto(`${urls.web}${screen.path}`, { waitUntil: 'networkidle' });
      assert.equal(res.status(), 200, `${screen.path} HTTP 200 at ${vp.label}px`);

      const h1Text = (await page.textContent('h1'))?.trim();
      assert.equal(h1Text, screen.heading, `Heading on ${screen.path} at ${vp.label}px`);

      const bodyText = (await page.textContent('body')) || '';
      assert.ok(
        !bodyText.includes('One account for Gamo Worship, Gamo Academy, Gamo Live, and Gamo Production.'),
        `Must not claim one shared cross-product account on ${screen.path}`,
      );

      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - window.innerWidth;
      });
      assert.ok(overflow <= 0, `Horizontal overflow (${overflow}px) on ${screen.path} at ${vp.label}px`);

      const bounds = await page.evaluate(() => {
        const shell = document.querySelector('[data-verified-auth]');
        if (!shell) return null;
        const rect = shell.getBoundingClientRect();
        return {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
      });
      assert.ok(bounds, `Missing [data-verified-auth] shell on ${screen.path}`);
      assert.equal(bounds.left, 0, `Expected 0px left margin on ${screen.path} at ${vp.label}px`);
      assert.equal(bounds.top, 0, `Expected 0px top margin on ${screen.path} at ${vp.label}px`);
      assert.equal(
        bounds.width,
        bounds.innerWidth,
        `Expected full viewport width on ${screen.path} at ${vp.label}px`,
      );
      assert.ok(
        bounds.height >= bounds.innerHeight,
        `Expected full viewport height on ${screen.path} at ${vp.label}px`,
      );

      const imgLoaded = await page.evaluate((slug) => {
        const img = document.querySelector(`[data-auth-photo="${slug}"] img`);
        return Boolean(img && img.complete && img.naturalWidth > 0);
      }, screen.slug);
      assert.ok(imgLoaded, `Expected active photograph to load on ${screen.path} at ${vp.label}px`);

      if (vp.width === 1440 || vp.width === 390) {
        await page.screenshot({
          path: join(screenshotDir, `auth-${screen.slug}-${vp.label}.png`),
          fullPage: false,
        });
      }
    }

    await context.close();
  }

  // 2. Verify all 5 applications (web, worship, academy, live, production) serve all 4 unified auth screens
  // with full-viewport bounds, zero public header/footer chrome, product-specific copy, and loaded photography
  const appCheckCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const appCheckPage = await appCheckCtx.newPage();
  for (const appName of ['web', 'worship', 'academy', 'live', 'production']) {
    const program = APP_PROGRAMS[appName];
    const appScreens = getScreensForProgram(program);
    for (const screen of appScreens) {
      const res = await appCheckPage.goto(`${urls[appName]}${screen.path}`, { waitUntil: 'networkidle' });
      assert.equal(res.status(), 200, `${appName} ${screen.path}`);
      assert.equal(
        (await appCheckPage.textContent('h1'))?.trim(),
        screen.heading,
        `${appName} ${screen.path} heading`,
      );
      const subtext =
        (await appCheckPage.textContent('[data-auth-subtext]'))?.replace(/\s+/g, ' ').trim() || '';
      if (screen.subtext) {
        assert.equal(subtext, screen.subtext, `${appName} ${screen.path} subtext`);
      }
      assert.ok(
        !subtext.includes('One account for Gamo Worship'),
        `${appName} ${screen.path} must not claim cross-product account`,
      );
      if (screen.slug === 'signup') {
        assert.ok(
          subtext.includes(program),
          `Expected ${appName} signup subtext to reference ${program}, got "${subtext}"`,
        );
      }
      const hasLegacyChrome = await appCheckPage.evaluate(() => {
        return Boolean(
          document.querySelector(
            'body > header, body > footer, header:not([data-verified-auth] header), footer:not([data-verified-auth] footer), [data-header-metro-select]',
          ),
        );
      });
      assert.equal(
        hasLegacyChrome,
        false,
        `Expected zero public header/footer chrome on ${appName} ${screen.path}`,
      );
      const bounds = await appCheckPage.evaluate(() => {
        const shell = document.querySelector('[data-verified-auth]');
        if (!shell) return null;
        const rect = shell.getBoundingClientRect();
        return {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        };
      });
      assert.ok(bounds, `Missing [data-verified-auth] shell on ${appName} ${screen.path}`);
      assert.equal(bounds.left, 0, `Expected 0px left margin on ${appName} ${screen.path}`);
      assert.equal(bounds.top, 0, `Expected 0px top margin on ${appName} ${screen.path}`);
      assert.equal(
        bounds.width,
        bounds.innerWidth,
        `Expected full viewport width on ${appName} ${screen.path}`,
      );
      assert.ok(
        bounds.height >= bounds.innerHeight,
        `Expected full viewport height on ${appName} ${screen.path}`,
      );
      const imgLoaded = await appCheckPage.evaluate((slug) => {
        const img = document.querySelector(`[data-auth-photo="${slug}"] img`);
        return Boolean(img && img.complete && img.naturalWidth > 0);
      }, screen.slug);
      assert.ok(imgLoaded, `Expected active photograph to load on ${appName} ${screen.path}`);

      if (appName === 'live') {
        const brandLinkInfo = await appCheckPage.evaluate(() => {
          const link = document.querySelector('[data-auth-brand-link]');
          const logo = link?.querySelector('[data-brand-logo]');
          return {
            href: link?.getAttribute('href'),
            ariaLabel: link?.getAttribute('aria-label'),
            brandLogo: logo?.getAttribute('data-brand-logo'),
            text: link?.textContent?.replace(/\s+/g, ' ').trim(),
          };
        });
        assert.equal(brandLinkInfo.href, '/', `Expected Gamo Live auth logo link href="/" on ${screen.path}`);
        assert.equal(brandLinkInfo.brandLogo, 'Gamo Live', `Expected Gamo Live logo on ${screen.path}`);
        assert.match(
          brandLinkInfo.text || '',
          /^GAMO\s*LIVE$/,
          `Expected GAMO LIVE wordmark on ${screen.path}`,
        );

        await appCheckPage.screenshot({
          path: join(screenshotDir, `live-auth-${screen.slug}-1440.png`),
          fullPage: false,
        });
      }
    }
  }

  // Verify clicking the Gamo Live logo on /account/signin navigates to the Gamo Live homepage ("/")
  await appCheckPage.goto(`${urls.live}/account/signin`, { waitUntil: 'networkidle' });
  await Promise.all([appCheckPage.waitForURL(`${urls.live}/`), appCheckPage.click('[data-auth-brand-link]')]);

  // Also capture Gamo Live mobile (390x844) screenshots for all 4 auth screens
  const liveMobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const liveMobilePage = await liveMobileCtx.newPage();
  for (const screen of getScreensForProgram('Gamo Live')) {
    const res = await liveMobilePage.goto(`${urls.live}${screen.path}`, { waitUntil: 'networkidle' });
    assert.equal(res.status(), 200, `live mobile ${screen.path}`);
    await liveMobilePage.screenshot({
      path: join(screenshotDir, `live-auth-${screen.slug}-390.png`),
      fullPage: false,
    });
  }
  await liveMobileCtx.close();

  // 3. Verify keyboard navigation, clipboard paste of 6-digit code, Resend code, and Account Recovery flow
  await appCheckPage.goto(`${urls.web}/account/recover`, { waitUntil: 'networkidle' });
  assert.equal((await appCheckPage.textContent('h1'))?.trim(), 'Recover your account');
  await appCheckPage.fill('[data-step-challenge] input[name="email"]', 'recover.member@example.org');
  await appCheckPage.click('[data-step-challenge] button[type="submit"]');

  await appCheckPage.waitForSelector('[data-step-verify]:not([hidden])');
  assert.equal((await appCheckPage.textContent('h1'))?.trim(), 'Check your email');
  const maskedLabel = (await appCheckPage.textContent('[data-verify-email-label]'))?.trim();
  assert.equal(maskedLabel, 're•••r@example.org');

  // Test Resend code action
  await appCheckPage.click('[data-btn-resend]');
  await appCheckPage.waitForFunction(() => {
    const el = document.querySelector('[data-auth-status]');
    return el && /Local test code: \d{6}/.test(el.textContent || '');
  });
  const resentStatus = await appCheckPage.textContent('[data-auth-status]');
  const recoveryCode = resentStatus.match(/Local test code: (\d{6})/)[1];

  // Test pasting the complete 6-digit code and checking the 6 visual OTP slots
  await appCheckPage.focus('[data-step-verify] input[name="code"]');
  await appCheckPage.evaluate((code) => {
    const input = document.querySelector('[data-step-verify] input[name="code"]');
    const dt = new DataTransfer();
    dt.setData('text/plain', code);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, recoveryCode);

  const slotDigits = await appCheckPage.evaluate(() => {
    return Array.from(document.querySelectorAll('[data-otp-slot]')).map((el) => el.textContent);
  });
  assert.equal(slotDigits.join(''), recoveryCode, 'Visual 6-slot OTP grid reflects pasted 6-digit code');

  await Promise.all([
    appCheckPage.waitForURL(`${urls.web}/account`),
    appCheckPage.click('[data-btn-verify]'),
  ]);
  assert.match((await appCheckPage.textContent('#account-title')) || '', /Welcome,/);

  await appCheckCtx.close();
  console.log('APPROVED_AUTH_UI_E2E_AND_SCREENSHOTS_OK');
} finally {
  await browser.close();
  for (const s of servers) await new Promise((resolveClose) => s.close(resolveClose));
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

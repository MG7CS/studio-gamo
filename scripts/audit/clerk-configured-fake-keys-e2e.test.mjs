/**
 * Clerk CONFIGURED, with FAKE keys: the built live and worship workers under Miniflare with Clerk bindings
 * that point at a host that cannot exist (`clerk.fake-keys.invalid`). Every other e2e server runs with Clerk
 * off (playwright.config.ts blanks it); this is the one place Clerk is switched on, and it can never reach a
 * real Clerk instance: the workers' outbound network is replaced by a stub that records and refuses calls.
 *
 * Checks, against the real built pages and middleware:
 * - sign-in and SSO-callback pages wire Clerk in (publishable key on the page, Frontend API in the CSP);
 * - an anonymous visitor on a private page is still sent to sign-in (303), not told the service is down;
 * - rendering those pages calls nothing outside the worker;
 * - Gamo Live's Clerk application id on another product is refused (private pages answer 503).
 *
 * Needs `pnpm build` first (pnpm check runs it before the journeys).
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../../apps/live/package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const FAKE_HOST = 'clerk.fake-keys.invalid';
const FAKE_PK = `pk_test_${Buffer.from(`${FAKE_HOST}$`).toString('base64').replace(/=+$/, '')}`;
const FAKE_JWT_KEY = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
}).publicKey;
const LIVE_CLERK_APP_ID = /GAMO_LIVE_CLERK_APP_ID = '([^']+)'/.exec(
  readFileSync('packages/config/clerk-env.ts', 'utf8'),
)[1];

const dir = mkdtempSync(join(tmpdir(), 'gamo-clerk-fake-keys-'));
const outbound = [];

async function bundle(app) {
  const outfile = join(dir, `${app}.mjs`);
  await build({
    entryPoints: [`apps/${app}/dist/server/entry.mjs`],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['cloudflare:workers', 'node:*'],
    logLevel: 'error',
  });
  return readFileSync(outfile, 'utf8');
}

const worker = async (app, bindings) => ({
  name: app,
  modules: true,
  script: await bundle(app),
  compatibilityDate: '2024-09-23',
  compatibilityFlags: ['nodejs_compat'],
  d1Databases: { DB: 'clerk-fake-keys-db' },
  kvNamespaces: { SESSION: 'clerk-fake-keys-kv', SESSION_KV: 'clerk-fake-keys-kv' },
  serviceBindings: { ASSETS: async () => new Response('Not found', { status: 404 }) },
  outboundService: async (request) => {
    outbound.push(new URL(request.url).origin);
    return new Response('outbound network is disabled in this test', { status: 599 });
  },
  bindings: {
    ENVIRONMENT: 'local',
    SESSION_SECRET: 'clerk-fake-keys-session-secret-0123456789abcdef',
    STRIPE_SANDBOX_ENABLED: 'false',
    ...bindings,
  },
});

const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      await worker('live', {
        PUBLIC_CLERK_PUBLISHABLE_KEY_LIVE: FAKE_PK,
        CLERK_SECRET_KEY_LIVE: 'sk_test_fake_keys_never_sent_anywhere',
        CLERK_JWT_KEY_LIVE: FAKE_JWT_KEY,
        CLERK_ISSUER_LIVE: `https://${FAKE_HOST}`,
      }),
      // Another product configured with Gamo Live's Clerk application id (the local mistake this guards).
      await worker('worship', { CLERK_APP_ID: LIVE_CLERK_APP_ID }),
    ],
  }),
  resourcePersistencePath: join(dir, 'state'),
});

const get = async (app, path) => {
  const w = await mf.getWorker(app);
  return w.fetch(`http://127.0.0.1${path}`, { redirect: 'manual' });
};

try {
  await mf.ready;
  const db = await mf.getD1Database('DB', 'live');
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

  for (const path of ['/account/signin', '/account/sso-callback']) {
    const res = await get('live', path);
    assert.equal(res.status, 200, `live ${path}`);
    const html = await res.text();
    assert.ok(html.includes(`data-clerk-publishable-key="${FAKE_PK}"`), `live ${path}: Clerk wired in`);
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, new RegExp(`connect-src [^;]*https://${FAKE_HOST.replace(/\./g, '\\.')}`), path);
    assert.match(csp, new RegExp(`script-src [^;]*https://${FAKE_HOST.replace(/\./g, '\\.')}`), path);
  }

  const anonymous = await get('live', '/account/profile');
  assert.equal(anonymous.status, 303, 'anonymous visitor on a private page goes to sign-in');
  assert.match(anonymous.headers.get('location') ?? '', /^\/account\/signin\?next=/);

  const isolated = await get('worship', '/account/onboarding?role=musician');
  assert.equal(isolated.status, 503, "Gamo Live's Clerk app id on worship is refused");
  const publicPage = await get('worship', '/account/signin');
  assert.equal(publicPage.status, 200, 'public pages still render');
  assert.ok(!(await publicPage.text()).includes('data-clerk-publishable-key'));

  assert.deepEqual(outbound, [], 'rendering never called outside the worker');
  console.log('clerk-configured-fake-keys: all checks passed');
} finally {
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

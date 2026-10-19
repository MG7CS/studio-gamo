#!/usr/bin/env tsx
/**
 * Gamo Live end-to-end servers for tests/e2e/live-flow.spec.ts: the BUILT Live worker (port 4328) and the BUILT
 * admin worker (port 4329) under Miniflare, sharing one Live database exactly as they share it on Cloudflare.
 * Run `pnpm --filter apps-live build` and `pnpm --filter apps-admin build` first.
 *
 * - Live runs with ENVIRONMENT=local on 127.0.0.1 (so the local sign-in stand-in exists) but the BUILT code, so the
 *   enforced Content-Security-Policy is what is tested. The admin runs as in production (Access verified locally).
 * - Every outbound request is refused except the Resend API and Access's key set, both answered here; emails are
 *   captured and listed at http://127.0.0.1:4330/__emails.
 */
import { createRequire } from 'node:module';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importCatalog } from '../../packages/domain/src/live/catalog-import.ts';
import type { SeedCatalogDocument } from '../../packages/domain/src/services/live-external-discovery.ts';
import { ACCESS_AUD, ACCESS_KID, ACCESS_TEAM, ADMIN_EMAIL } from './admin-fixture.ts';
import {
  FLOW_ACCESS_KEY_FILE,
  FLOW_ADMIN_PORT,
  FLOW_LIVE_PORT,
  FLOW_MAIL_PORT,
  type CapturedEmail,
} from './live-flow-fixture.ts';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
const require = createRequire(join(repoRoot, 'apps/live/package.json'));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const dir = mkdtempSync(join(tmpdir(), 'gamo-live-flow-'));
const bundle = async (app: string) => {
  const outfile = join(dir, `${app}.mjs`);
  await build({
    entryPoints: [join(repoRoot, `apps/${app}/dist/server/entry.mjs`)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['cloudflare:workers', 'node:*'],
    logLevel: 'error',
  });
  return readFileSync(outfile, 'utf8');
};
const [liveScript, adminScript] = [await bundle('live'), await bundle('admin')];

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
mkdirSync(join(tmpdir(), 'gamo-live-flow-e2e'), { recursive: true, mode: 0o700 });
writeFileSync(FLOW_ACCESS_KEY_FILE, privateKey, { mode: 0o600 });
const jwks = {
  keys: [
    { ...createPublicKey(publicKey).export({ format: 'jwk' }), kid: ACCESS_KID, alg: 'RS256', use: 'sig' },
  ],
};

const emails: CapturedEmail[] = [];
const types: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
  '.json': 'application/json',
};
const assets = (clientDir: string) => async (request: Request) => {
  try {
    const file = resolve(clientDir, `.${decodeURIComponent(new URL(request.url).pathname)}`);
    if (!file.startsWith(clientDir)) throw new Error('outside');
    return new Response(readFileSync(file), {
      headers: { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
const outbound = async (request: Request) => {
  const url = new URL(request.url);
  if (
    url.origin === `https://${ACCESS_TEAM}.cloudflareaccess.com` &&
    url.pathname === '/cdn-cgi/access/certs'
  )
    return Response.json(jwks);
  if (url.origin === 'https://api.resend.com' && url.pathname === '/emails' && request.method === 'POST') {
    emails.push((await request.json()) as CapturedEmail);
    return Response.json({ id: `e2e_msg_${emails.length}` });
  }
  return new Response('outbound network is disabled in this test', { status: 599 });
};
const common = {
  modules: true,
  compatibilityDate: '2024-09-23',
  compatibilityFlags: ['nodejs_compat'],
  outboundService: outbound,
};
const mail = {
  RESEND_API_KEY: 're_e2e_capture_key_0000000000',
  EMAIL_FROM: 'Gamo Live <hello@gamostudio.org>',
};

const persist = join(dir, 'state');
const start = async (options: Record<string, unknown>, port: number) =>
  new Miniflare({
    ...convertV4MiniflareOptions({ workers: [options] }),
    host: '127.0.0.1',
    port,
    resourcePersistencePath: persist,
  });

const live = await start(
  {
    ...common,
    name: 'live',
    script: liveScript,
    d1Databases: { LIVE_DB: 'live-flow-live-db' },
    serviceBindings: { ASSETS: assets(join(repoRoot, 'apps/live/dist/client')) },
    bindings: {
      ENVIRONMENT: 'local',
      ALLOW_AUTH_SIMULATION: 'true',
      PII_HASH_SECRET: 'e2e-pii-hash-secret-0123456789-abcdef',
      ...mail,
    },
  },
  FLOW_LIVE_PORT,
);
const mailServer = createServer((req, res) => {
  if (req.url === '/__reset') emails.length = 0;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(emails));
}).listen(FLOW_MAIL_PORT, '127.0.0.1');

const running: { admin?: { dispose(): Promise<void> } } = {};
const shutdown = async () => {
  mailServer.close();
  await Promise.all([live.dispose().catch(() => {}), running.admin?.dispose().catch(() => {})]);
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(tmpdir(), 'gamo-live-flow-e2e'), { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await live.ready;

// Gamo Live's database: its migrations (one statement per call, comments stripped), then the verified catalog.
const liveDb = await live.getD1Database('LIVE_DB', 'live');
for (const file of readdirSync(join(repoRoot, 'packages/db/live/migrations'))
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  const text = readFileSync(join(repoRoot, 'packages/db/live/migrations', file), 'utf8').replace(
    /^\s*--.*$/gm,
    '',
  );
  for (const raw of text.split(';')) {
    const sql = raw.trim().replace(/\s+/g, ' ');
    if (sql) await liveDb.exec(sql);
  }
}
const catalog = JSON.parse(
  readFileSync(join(repoRoot, 'data/gamo_live_verified_events_2026-10-15.json'), 'utf8'),
) as SeedCatalogDocument;
await importCatalog(liveDb as never, catalog, { now: Math.floor(Date.now() / 1000), publishApproved: true });

// The admin starts only after Live's database exists: two workerd processes initializing one new database file at the
// same moment can fail (SQLITE_BUSY), which is also why `make live-db` runs before the dev servers start.
const adminInstance = await start(
  {
    ...common,
    name: 'admin',
    script: adminScript,
    d1Databases: { DB: 'live-flow-admin-db', LIVE_DB: 'live-flow-live-db' },
    kvNamespaces: { SESSION: 'live-flow-kv', SESSION_KV: 'live-flow-kv' },
    serviceBindings: { ASSETS: assets(join(repoRoot, 'apps/admin/dist/client')) },
    bindings: {
      ENVIRONMENT: 'production',
      ADMIN_EMAIL,
      CF_ACCESS_TEAM_NAME: ACCESS_TEAM,
      CF_ACCESS_AUD: ACCESS_AUD,
      ...mail,
    },
  },
  FLOW_ADMIN_PORT,
);

running.admin = adminInstance;
await adminInstance.ready;
// The admin's shared database (its queues) needs its tables too.
const adminDb = await adminInstance.getD1Database('DB', 'admin');
for (const file of readdirSync(join(repoRoot, 'packages/db/migrations'))
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  for (const raw of readFileSync(join(repoRoot, 'packages/db/migrations', file), 'utf8').split(
    '--> statement-breakpoint',
  )) {
    const sql = raw.replace(/^\s*--.*$/gm, '').trim();
    if (sql) await adminDb.exec(sql.replace(/\n/g, ' '));
  }
}
console.log(`[live-flow] ready: live :${FLOW_LIVE_PORT}, admin :${FLOW_ADMIN_PORT}, mail :${FLOW_MAIL_PORT}`);

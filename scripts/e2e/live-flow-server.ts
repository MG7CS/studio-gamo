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
 * - Payments: without Stripe keys both workers use the local Stripe stand-in (ALLOW_STRIPE_STANDIN, which needs
 *   ENVIRONMENT=local, so the admin runs as `local` here too, still verifying the Access assertion on every request).
 *   Its "hosted" Checkout and onboarding pages are Live's own `/dev/stripe/*` pages and its signed webhooks go through
 *   the real webhook code. http://127.0.0.1:4330/__stripe/dispute?payment_intent=pi_… and
 *   /__stripe/dispute/close?id=du_…&outcome=won|lost open and close a dispute (signed events POSTed to Live).
 *   With STRIPE_SECRET_KEY=sk_test_… (and STRIPE_WEBHOOK_SECRET / STRIPE_CONNECT_WEBHOOK_SECRET from `stripe listen`)
 *   in the environment, the workers use Stripe's test mode instead: api.stripe.com is let through and nothing else
 *   changes. Live keys are refused.
 */
import { createRequire } from 'node:module';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importCatalog } from '../../packages/domain/src/live/catalog-import.ts';
import {
  standinCloseDispute,
  standinOpenDispute,
  type StandinDelivery,
} from '../../packages/domain/src/live/payments/standin.ts';
import type { SeedCatalogDocument } from '../../packages/domain/src/services/live-external-discovery.ts';
import { ACCESS_AUD, ACCESS_KID, ACCESS_TEAM, ADMIN_EMAIL } from './admin-fixture.ts';
import {
  FLOW_ACCESS_KEY_FILE,
  FLOW_KEY_DIR,
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
mkdirSync(FLOW_KEY_DIR, { recursive: true, mode: 0o700 });
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
  // Stripe's test mode, only when a test key was given to this harness.
  if (stripe.STRIPE_SECRET_KEY && url.origin === 'https://api.stripe.com') return fetch(request);
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
// Payments: Stripe's test mode when a test key is in the environment, otherwise the local stand-in.
const testKey = String(process.env.STRIPE_SECRET_KEY ?? '').trim();
if (testKey && !/^(sk|rk)_test_/.test(testKey))
  throw new Error('live-flow: only Stripe test keys are allowed');
const stripe: Record<string, string> = testKey
  ? {
      STRIPE_SECRET_KEY: testKey,
      STRIPE_WEBHOOK_SECRET: String(process.env.STRIPE_WEBHOOK_SECRET ?? ''),
      STRIPE_CONNECT_WEBHOOK_SECRET: String(process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? ''),
    }
  : { ALLOW_STRIPE_STANDIN: 'true' };
const paid = {
  ...stripe,
  LIVE_TICKET_SECRET: 'e2e-live-ticket-secret-0123456789-abcdef',
  PUBLIC_SITE_URL_LIVE: `http://127.0.0.1:${FLOW_LIVE_PORT}`,
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
      ...paid,
    },
  },
  FLOW_LIVE_PORT,
);
// Stand-in events started from this harness (disputes) are POSTed to Live's real webhook endpoints.
const deliverOverHttp: StandinDelivery = async (rawBody, signatureHeader, endpoint) => {
  const path = endpoint === 'connect' ? '/api/stripe/connect-webhook' : '/api/stripe/webhook';
  const res = await fetch(`http://127.0.0.1:${FLOW_LIVE_PORT}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': signatureHeader },
    body: rawBody,
  });
  return { status: res.status };
};
const harnessEnv = { ENVIRONMENT: 'local', ...paid };
const mailServer = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${FLOW_MAIL_PORT}`);
  try {
    if (url.pathname === '/__stripe/dispute') {
      const out = await standinOpenDispute(
        liveDb as never,
        harnessEnv,
        url.searchParams.get('payment_intent') ?? '',
        Math.floor(Date.now() / 1000),
        { deliver: deliverOverHttp },
      );
      res.end(JSON.stringify(out));
      return;
    }
    if (url.pathname === '/__stripe/dispute/close') {
      await standinCloseDispute(
        liveDb as never,
        harnessEnv,
        url.searchParams.get('id') ?? '',
        url.searchParams.get('outcome') === 'lost' ? 'lost' : 'won',
        Math.floor(Date.now() / 1000),
        { deliver: deliverOverHttp },
      );
      res.end('{"ok":true}');
      return;
    }
  } catch (error) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'failed' }));
    return;
  }
  if (url.pathname === '/__reset') emails.length = 0;
  res.end(JSON.stringify(emails));
}).listen(FLOW_MAIL_PORT, '127.0.0.1');

const running: { admin?: { dispose(): Promise<void> } } = {};
const shutdown = async () => {
  mailServer.close();
  await Promise.all([live.dispose().catch(() => {}), running.admin?.dispose().catch(() => {})]);
  rmSync(dir, { recursive: true, force: true });
  rmSync(FLOW_KEY_DIR, { recursive: true, force: true });
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
      // `local` so the Stripe stand-in may run; the Access assertion is still required and verified on every request.
      ENVIRONMENT: 'local',
      ADMIN_EMAIL,
      CF_ACCESS_TEAM_NAME: ACCESS_TEAM,
      CF_ACCESS_AUD: ACCESS_AUD,
      ...mail,
      ...paid,
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

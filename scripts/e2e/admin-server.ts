#!/usr/bin/env tsx
/**
 * Production-like admin server for the browser tests (Playwright `E2E_APPS=admin`, port 4327).
 *
 * Runs the BUILT admin worker (apps/admin/dist/server/entry.mjs; run `pnpm --filter apps-admin build` first)
 * under Miniflare with ENVIRONMENT=production, so the app sees what it sees on Cloudflare: the enforced
 * Content-Security-Policy, Cloudflare Access verification (CF_ACCESS_*; the team's key set is answered
 * locally, every other outbound request is refused), no local identity. The D1 gets the migrations and a few
 * labeled sample work items. The Access signing key is written to ACCESS_KEY_FILE so a spec can mint the
 * header Access would add. It never touches port 4326, which is `make dev-admin`.
 */
import { createRequire } from 'node:module';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLiveFixtureStatements, buildReviewFixtureStatements } from './admin-review-fixtures.ts';
import {
  ACCESS_AUD,
  ACCESS_KEY_FILE,
  ACCESS_KID,
  ACCESS_TEAM,
  ADMIN_E2E_PORT,
  ADMIN_EMAIL,
} from './admin-fixture.ts';

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../..');
const clientDir = join(repoRoot, 'apps/admin/dist/client');

const require = createRequire(join(repoRoot, 'apps/admin/package.json'));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const dir = mkdtempSync(join(tmpdir(), 'gamo-admin-e2e-server-'));
const outfile = join(dir, 'admin.mjs');
await build({
  entryPoints: [join(repoRoot, 'apps/admin/dist/server/entry.mjs')],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
  logLevel: 'error',
});

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
mkdirSync(join(tmpdir(), 'gamo-admin-e2e'), { recursive: true, mode: 0o700 });
writeFileSync(ACCESS_KEY_FILE, privateKey, { mode: 0o600 });
const jwks = {
  keys: [
    { ...createPublicKey(publicKey).export({ format: 'jwk' }), kid: ACCESS_KID, alg: 'RS256', use: 'sig' },
  ],
};

const types: Record<string, string> = {
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
};

const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: 'admin',
        modules: true,
        script: readFileSync(outfile, 'utf8'),
        compatibilityDate: '2024-09-23',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: 'admin-e2e-db', LIVE_DB: 'admin-e2e-live-db' },
        kvNamespaces: { SESSION: 'admin-e2e-kv', SESSION_KV: 'admin-e2e-kv' },
        // Workers Static Assets in production: the built files under dist/client.
        serviceBindings: {
          ASSETS: async (request: Request) => {
            const { pathname } = new URL(request.url);
            try {
              const file = resolve(clientDir, `.${decodeURIComponent(pathname)}`);
              if (!file.startsWith(clientDir)) throw new Error('outside');
              return new Response(readFileSync(file), {
                headers: { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' },
              });
            } catch {
              return new Response('Not found', { status: 404 });
            }
          },
        },
        outboundService: async (request: Request) => {
          const url = new URL(request.url);
          if (
            url.origin === `https://${ACCESS_TEAM}.cloudflareaccess.com` &&
            url.pathname === '/cdn-cgi/access/certs'
          )
            return Response.json(jwks);
          return new Response('outbound network is disabled in this test', { status: 599 });
        },
        bindings: {
          ENVIRONMENT: 'production',
          ADMIN_EMAIL,
          CF_ACCESS_TEAM_NAME: ACCESS_TEAM,
          CF_ACCESS_AUD: ACCESS_AUD,
        },
      },
    ],
  }),
  host: '127.0.0.1',
  port: ADMIN_E2E_PORT,
  resourcePersistencePath: join(dir, 'state'),
});

const shutdown = async () => {
  await mf.dispose().catch(() => {});
  rmSync(dir, { recursive: true, force: true });
  rmSync(join(tmpdir(), 'gamo-admin-e2e'), { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await mf.ready;
const db = await mf.getD1Database('DB', 'admin');
// Migrations the way the journey tests apply them: one chunk per `--> statement-breakpoint`.
for (const file of readdirSync(join(repoRoot, 'packages/db/migrations'))
  .filter((x) => x.endsWith('.sql'))
  .sort()) {
  for (const raw of readFileSync(join(repoRoot, 'packages/db/migrations', file), 'utf8').split(
    '--> statement-breakpoint',
  )) {
    const sql = raw.replace(/^\s*--.*$/gm, '').trim();
    if (sql) await db.exec(sql.replace(/\n/g, ' '));
  }
}
for (const statement of buildReviewFixtureStatements()) await db.exec(statement);
// Gamo Live's own database: its migrations (one statement per call, comments stripped), then the Live fixtures.
const liveDb = await mf.getD1Database('LIVE_DB', 'admin');
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
for (const statement of buildLiveFixtureStatements()) await liveDb.exec(statement);
console.log(
  `[admin-e2e] ready on http://127.0.0.1:${ADMIN_E2E_PORT} (ENVIRONMENT=production, Access mocked)`,
);

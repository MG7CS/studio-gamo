/**
 * Admin pages and the Content-Security-Policy: the built admin worker under Miniflare, every page of the
 * workspace (and the gateway sign-in and error pages the middleware renders itself).
 *
 * Fails when an admin response ships:
 * - an inline <script> that the response's own CSP would block (no matching nonce or hash in script-src);
 * - an on*= event-handler attribute or a javascript: URL (script-src has no 'unsafe-inline' or 'unsafe-hashes');
 * - a script-src that allows 'unsafe-inline', or no per-request nonce (Cloudflare's injected inline script
 *   changes on every load and takes the nonce from this header; a hash cannot allow it).
 * JSON data blocks (type="application/ld+json" or "application/json") are not scripts and are ignored.
 *
 * Needs `pnpm build` first (pnpm check runs it before the journeys).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(new URL('../../apps/admin/package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');

const TOKEN = 'admin-csp-e2e-token-0123456789';
const dir = mkdtempSync(join(tmpdir(), 'gamo-admin-csp-'));
const outfile = join(dir, 'admin.mjs');

await build({
  entryPoints: ['apps/admin/dist/server/entry.mjs'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['cloudflare:workers', 'node:*'],
  logLevel: 'error',
});

const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: 'admin',
        modules: true,
        script: readFileSync(outfile, 'utf8'),
        compatibilityDate: '2024-09-23',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: 'admin-csp-db' },
        kvNamespaces: { SESSION: 'admin-csp-kv', SESSION_KV: 'admin-csp-kv' },
        serviceBindings: { ASSETS: async () => new Response('Not found', { status: 404 }) },
        bindings: {
          ENVIRONMENT: 'local',
          SESSION_SECRET: 'admin-csp-e2e-session-secret-0123456789abcdef',
          ENABLE_BREAK_GLASS_AUTH: 'true',
          ADMIN_ACCESS_TOKEN: TOKEN,
        },
      },
    ],
  }),
  resourcePersistencePath: join(dir, 'state'),
});

const sha256 = (text) => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
const directive = (csp, name) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `)) ?? '';

/** Everything in `html` that script-src would block, as readable strings. */
export function cspViolations(html, csp) {
  const scriptSrc = directive(csp, 'script-src');
  const found = [];
  const withoutScripts = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_all, attrs, body) => {
    if (/\bsrc\s*=/.test(attrs)) return ''; // same-origin file: allowed by 'self'
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1].toLowerCase();
    if (type && !/^(module|text\/javascript|application\/javascript)$/.test(type)) return ''; // data block
    const nonce = /\bnonce\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const allowed = (nonce && scriptSrc.includes(`'nonce-${nonce}'`)) || scriptSrc.includes(sha256(body));
    if (!allowed) found.push(`inline <script> not covered by the CSP: ${body.trim().slice(0, 80)}`);
    return '';
  });
  for (const m of withoutScripts.matchAll(/<[a-z][^>]*\s(on[a-z]+)\s*=/gi)) found.push(`${m[1]}= handler`);
  for (const m of withoutScripts.matchAll(/\s(?:href|src|action|formaction)\s*=\s*["']\s*javascript:/gi))
    found.push(`javascript: URL (${m[0].trim()})`);
  return found;
}

const get = async (path, authed = true) => {
  const w = await mf.getWorker('admin');
  return w.fetch(`http://127.0.0.1${path}`, {
    redirect: 'manual',
    headers: authed ? { 'x-admin-key': TOKEN } : {},
  });
};

try {
  await mf.ready;
  const db = await mf.getD1Database('DB', 'admin');
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

  // The checker itself: it must reject what the CSP would block and accept what it allows.
  const nonceCsp = "script-src 'self' 'nonce-abc123abc123abc123'";
  assert.equal(cspViolations('<script>alert(1)</script>', nonceCsp).length, 1);
  assert.equal(cspViolations('<script nonce="other">1</script>', nonceCsp).length, 1);
  assert.equal(cspViolations('<script nonce="abc123abc123abc123">1</script>', nonceCsp).length, 0);
  assert.equal(cspViolations(`<script>1</script>`, `script-src 'self' ${sha256('1')}`).length, 0);
  assert.equal(cspViolations('<script src="/a.js"></script>', "script-src 'self'").length, 0);
  assert.equal(
    cspViolations('<script type="application/ld+json">{}</script>', "script-src 'self'").length,
    0,
  );
  assert.equal(cspViolations('<button onclick="go()">x</button>', "script-src 'self'").length, 1);
  assert.equal(cspViolations('<a href="javascript:void(0)">x</a>', "script-src 'self'").length, 1);

  // Every page the workspace links to, found by following its own navigation, plus the fixed routes.
  const queue = ['/', '/security', '/security?welcome=1', '/legal', '/participation', '/no-such-page'];
  const pages = new Map();
  const nonces = [];
  while (queue.length) {
    const path = queue.shift();
    if (pages.has(path)) continue;
    const res = await get(path);
    const html = await res.text();
    pages.set(path, res.status);
    if (res.status === 200) {
      for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const next = m[1];
        if (next.startsWith('/_') || next.startsWith('/api/') || /\.[a-z0-9]+$/i.test(next)) continue;
        if (!pages.has(next) && !queue.includes(next)) queue.push(next);
      }
    }
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.ok(csp, `${path} (${res.status}): has a Content-Security-Policy`);
    const scriptSrc = directive(csp, 'script-src');
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), `${path}: script-src must not allow 'unsafe-inline'`);
    const nonce = /'nonce-([^']+)'/.exec(scriptSrc)?.[1];
    assert.ok(nonce, `${path}: script-src carries a per-request nonce`);
    nonces.push(nonce);
    assert.deepEqual(cspViolations(html, csp), [], `${path} (${res.status})`);
  }
  assert.ok([...pages.values()].filter((s) => s === 200).length >= 20, 'crawled the admin workspace');

  // The gateway sign-in and error responses the middleware renders itself.
  for (const [label, res] of [
    ['gateway sign-in', await get('/security?welcome=1', false)],
    [
      'gateway sign-in (login failure)',
      await (
        await mf.getWorker('admin')
      ).fetch('http://127.0.0.1/__admin_auth/login', {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1', 'content-type': 'application/x-www-form-urlencoded' },
        body: 'email=nobody%40example.invalid&password=wrong-password',
      }),
    ],
  ]) {
    assert.ok([401, 503].includes(res.status), `${label}: ${res.status}`);
    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(await res.clone().text(), /Operations Gateway/, label);
    assert.deepEqual(cspViolations(await res.text(), csp), [], label);
    nonces.push(/'nonce-([^']+)'/.exec(directive(csp, 'script-src'))?.[1]);
  }

  assert.equal(new Set(nonces).size, nonces.length, 'the nonce is different on every response');
  console.log(`admin-csp: ${pages.size} pages and 2 gateway responses are covered by the CSP`);
} finally {
  await mf.dispose();
  rmSync(dir, { recursive: true, force: true });
}

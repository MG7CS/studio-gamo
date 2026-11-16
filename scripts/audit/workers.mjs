import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../../apps/academy/package.json', import.meta.url));
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const dir = mkdtempSync(join(tmpdir(), 'gamo-audit-'));
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
  banner: {
    js: 'globalThis.fetch = async () => { throw new Error("External network disabled in audit"); };',
  },
  logLevel: 'warning',
});
const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: 'audit',
        modules: true,
        script: readFileSync(output, 'utf8'),
        compatibilityDate: '2024-09-23',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: { DB: 'audit-only' },
        r2Buckets: ['ASSETS'],
        bindings: {
          ENVIRONMENT: 'local',
          SESSION_SECRET: 'workerd-audit-only-session-secret-32-characters',
        },
      },
    ],
  }),
  resourcePersistencePath: d1Dir,
});
try {
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
  const call = async (path, status, body, headers = {}) => {
    const response = await mf.dispatchFetch('http://localhost' + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json();
    assert.equal(response.status, status, JSON.stringify(json));
    return { json, response };
  };
  const cookieOf = (res) => res.response.headers.get('set-cookie').split(';')[0];
  // 1. A superadmin (test fixture session) provisions a staff reviewer bound to a Cloudflare Access sub.
  const superSession = await call('/test/staff-session', 200, {
    email: 'superadmin@example.invalid',
    role: 'superadmin',
  });
  const superCookie = cookieOf(superSession);
  const provision = {
    email: 'reviewer@example.invalid',
    role: 'staff_reviewer',
    accessSubject: 'cf-access-sub-workerd-1',
    displayName: 'Workerd Reviewer',
  };
  // Without a session, and as a non-superadmin, provisioning is refused.
  await call('/api/staff/provision', 401, provision);
  const plain = await call('/test/staff-session', 200, {
    email: 'staff@example.invalid',
    role: 'staff_reviewer',
  });
  await call('/api/staff/provision', 403, provision, { cookie: cookieOf(plain) });
  const provisioned = await call('/api/staff/provision', 200, provision, { cookie: superCookie });
  assert.equal(provisioned.json.data.accessSubject, 'cf-access-sub-workerd-1');
  // 2. Re-binding the same Access subject to another user is a conflict.
  await call(
    '/api/staff/provision',
    409,
    { ...provision, email: 'other@example.invalid' },
    { cookie: superCookie },
  );
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  // 3. R2 restricted objects are denied to staff and readable by their owner.
  const r2 = await call('/test/r2', 200);
  assert.deepEqual(r2.json, { denied: true, owner: true });
} finally {
  await mf.dispose();
}
const sqliteFiles = readdirSync(d1Dir, { recursive: true })
  .map(String)
  .filter((x) => x.endsWith('.sqlite'));
assert.ok(sqliteFiles.length > 0, 'Expected persisted workerd D1 SQLite database file');
for (const rel of sqliteFiles) {
  const diskDb = new DatabaseSync(join(d1Dir, rel));
  try {
    assert.equal(diskDb.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(diskDb.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    diskDb.close();
  }
}
rmSync(dir, { recursive: true, force: true });
console.log(
  'PASS workerd: actual routes, D1 migrations, persisted D1 SQLite PRAGMA integrity_check + foreign_key_check, staff provisioning (anonymous, non-superadmin, conflict), R2 binding.',
);
